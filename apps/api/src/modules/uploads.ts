import { Body, Controller, Get, Injectable, Module, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import type { Response } from 'express';
import { ulid } from 'ulid';
import { z } from 'zod';
import { PrismaService } from '../prisma.service';
import { Requires } from '../common/auth';
import { Ctx, ReqCtx } from '../common/context';
import { sha256 } from '../common/crypto';
import { badRequest, conflict, notFound, unprocessable } from '../common/errors';
import { parse } from '../common/http';
import { env } from '../env';
import { PROOF_TYPES } from './visits';

const BLOB_MAX = 8 * 1024 * 1024;
const DIRECT_MAX = 4 * 1024 * 1024;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

const TokenBody = z.object({
  visitId: z.string().min(1),
  contentType: z.string().refine((t) => PROOF_TYPES.includes(t), 'unsupported content type'),
  sizeBytes: z.number().int().positive().max(BLOB_MAX, 'max 8 MB'),
});

@Injectable()
export class UploadsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ownOpenVisit(ctx: ReqCtx, visitId: string) {
    const v = await this.prisma.db.visit.findFirst({ where: { id: visitId, tenantId: ctx.user.tid }, select: { id: true, agentId: true, status: true } });
    if (!v || v.agentId !== ctx.user.sub) throw notFound('Visit');
    if (!['CHECKED_IN', 'ACTIVE'].includes(v.status)) throw conflict('VISIT_NOT_OPEN', 'Check in before uploading proof');
    return v;
  }

  async token(ctx: ReqCtx, body: z.infer<typeof TokenBody>) {
    await this.ownOpenVisit(ctx, body.visitId);
    const pathname = `tenants/${ctx.user.tslug}/visits/${body.visitId}/${ulid()}.${EXT[body.contentType]}`;
    const rw = env().BLOB_READ_WRITE_TOKEN;
    if (rw) {
      const clientToken = await generateClientTokenFromReadWriteToken({
        token: rw,
        pathname,
        allowedContentTypes: PROOF_TYPES,
        maximumSizeInBytes: BLOB_MAX,
        addRandomSuffix: false,
        validUntil: Date.now() + 10 * 60 * 1000,
      });
      return { mode: 'blob' as const, clientToken, pathname };
    }
    return { mode: 'direct' as const, pathname, uploadUrl: '/api/v1/uploads/direct', maxBytes: DIRECT_MAX };
  }

  async direct(ctx: ReqCtx, file: Express.Multer.File | undefined, pathname: string | undefined) {
    if (!file) throw badRequest('FILE_REQUIRED', 'multipart field `file` is required');
    if (!PROOF_TYPES.includes(file.mimetype)) throw unprocessable('UNSUPPORTED_MEDIA_TYPE', `Unsupported type ${file.mimetype}`);
    const m = /^tenants\/([^/]+)\/visits\/([^/]+)\/[A-Za-z0-9]+\.(jpg|png|webp|heic)$/.exec(pathname ?? '');
    if (!m || m[1] !== ctx.user.tslug) throw unprocessable('INVALID_OBJECT_KEY', 'pathname from /v1/uploads/proof-token is required');
    await this.ownOpenVisit(ctx, m[2]);
    const digest = sha256(file.buffer);
    const row = await this.prisma.db.storedFile.upsert({
      where: { tenantId_objectKey: { tenantId: ctx.user.tid, objectKey: pathname! } },
      create: { tenantId: ctx.user.tid, objectKey: pathname!, contentType: file.mimetype, sizeBytes: file.size, sha256: digest, bytes: new Uint8Array(file.buffer), uploadedById: ctx.user.sub },
      update: {},
    });
    return { url: `/api/v1/files/${row.id}`, objectKey: row.objectKey, checksumSha256: row.sha256, sizeBytes: row.sizeBytes, contentType: row.contentType };
  }
}

@ApiTags('uploads')
@Controller('v1')
export class UploadsController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly prisma: PrismaService,
  ) {}

  @Requires('field')
  @Post('uploads/proof-token')
  @ApiOperation({ summary: 'Vercel Blob client token scoped to one pathname (mode=blob), or direct-upload instructions (mode=direct)' })
  token(@Ctx() ctx: ReqCtx, @Body() body: unknown) {
    return this.uploads.token(ctx, parse(TokenBody, body));
  }

  @Requires('field')
  @Post('uploads/direct')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: DIRECT_MAX, files: 1 } }))
  direct(@Ctx() ctx: ReqCtx, @UploadedFile() file: Express.Multer.File | undefined, @Body() body: { pathname?: string; objectKey?: string }) {
    return this.uploads.direct(ctx, file, body?.pathname ?? body?.objectKey);
  }

  /** Serves direct-mode files. Authenticated + tenant-scoped (the web proxies /api with cookies, so <img> works). */
  @Get('files/:id')
  async file(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Res() res: Response) {
    const f = await this.prisma.db.storedFile.findFirst({ where: { id, tenantId: ctx.user.tid } });
    if (!f) throw notFound('File');
    if (ctx.user.role !== 'ADMIN') {
      // Agents may only open proofs of their own visits (objectKey = tenants/<slug>/visits/<visitId>/…).
      const visitId = /^tenants\/[^/]+\/visits\/([^/]+)\//.exec(f.objectKey)?.[1];
      const own = visitId ? await this.prisma.db.visit.findFirst({ where: { id: visitId, tenantId: ctx.user.tid, agentId: ctx.user.sub }, select: { id: true } }) : null;
      if (!own) throw notFound('File');
    }
    res.setHeader('Content-Type', f.contentType);
    res.setHeader('Content-Length', String(f.sizeBytes));
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('ETag', `"${f.sha256}"`);
    res.end(Buffer.from(f.bytes));
  }
}

@Module({ controllers: [UploadsController], providers: [UploadsService] })
export class UploadsModule {}
