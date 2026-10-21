import { Injectable } from '@nestjs/common';
import { priceDesign } from '@jewelroute/shared';
import type { Purity } from '../../generated/prisma';
import { PrismaService, Tx } from '../prisma.service';
import { conflict } from '../common/errors';

export interface CurrentRate {
  purity: Purity;
  goldRateId: string;
  ratePaisePerGram: number;
  effectiveFrom: string;
  createdBy?: { id: string; name: string } | null;
}
export type RateMap = Partial<Record<Purity, CurrentRate>>;

export interface PricedDesignInput {
  purity: Purity;
  netWeightMg: number;
  makingChargeType: 'PER_GRAM' | 'PERCENT';
  makingChargeValue: bigint | number;
  stoneValuePaise: bigint | number;
  otherComponents: unknown;
}

export function otherComponentsOf(v: unknown): { label: string; valuePaise: number }[] {
  return Array.isArray(v) ? v.map((c: { label?: string; valuePaise?: number }) => ({ label: String(c?.label ?? ''), valuePaise: Number(c?.valuePaise ?? 0) })) : [];
}

/** Authoritative pricing — the same `priceDesign` the web uses for display. */
export function price(d: PricedDesignInput, rates: RateMap, netWeightMg = d.netWeightMg) {
  const r = rates[d.purity];
  if (!r) throw conflict('GOLD_RATE_MISSING', `No gold rate set for ${d.purity}`);
  const p = priceDesign({
    netWeightMg,
    ratePaisePerGram: r.ratePaisePerGram,
    makingChargeType: d.makingChargeType,
    makingChargeValue: Number(d.makingChargeValue),
    stoneValuePaise: Number(d.stoneValuePaise),
    otherComponents: otherComponentsOf(d.otherComponents),
  });
  return { purity: d.purity, netWeightMg, ratePaisePerGram: r.ratePaisePerGram, goldRateId: r.goldRateId, rateEffectiveFrom: r.effectiveFrom, ...p };
}

/** Value at today's rate, or 0 if a purity has no rate yet (valuation must not crash dashboards). */
export function valueOrZero(d: PricedDesignInput, rates: RateMap, netWeightMg?: number) {
  return rates[d.purity] ? price(d, rates, netWeightMg).unitPricePaise : 0;
}

@Injectable()
export class RatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Current rate per purity = the latest row with effectiveFrom <= now (append-only table). */
  async current(tenantId: string, tx?: Tx): Promise<RateMap> {
    const db = tx ?? this.prisma.db;
    const rows = await db.$queryRaw<{ id: string; purity: Purity; ratePaisePerGram: bigint; effectiveFrom: Date; createdById: string | null }[]>`
      SELECT DISTINCT ON (purity) id, purity, "ratePaisePerGram", "effectiveFrom", "createdById"
      FROM "GoldRate" WHERE "tenantId" = ${tenantId} AND "effectiveFrom" <= now()
      ORDER BY purity, "effectiveFrom" DESC, "createdAt" DESC`;
    const map: RateMap = {};
    for (const r of rows) {
      map[r.purity] = { purity: r.purity, goldRateId: r.id, ratePaisePerGram: Number(r.ratePaisePerGram), effectiveFrom: r.effectiveFrom.toISOString() };
    }
    return map;
  }
}
