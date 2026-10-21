import type { IncomingMessage, ServerResponse } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { createApp } from './app';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let ready: Promise<Handler> | undefined;

/** Boots Nest once per serverless instance and reuses the Express handler across invocations. */
export function getHandler(): Promise<Handler> {
  if (!ready) {
    ready = createApp()
      .then((app: INestApplication) => app.getHttpAdapter().getInstance() as Handler)
      .catch((e) => {
        ready = undefined;
        throw e;
      });
  }
  return ready;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const h = await getHandler();
  h(req, res);
}
