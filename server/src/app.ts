import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './lib/errors';
import { requireAuth } from './middleware/auth';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { domainRouter } from './routes/domain';
import { entitiesRouter } from './routes/entities';
import { meRouter } from './routes/me';

export function createApp(options: { clientDist?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    (req as any).requestId = randomUUID();
    res.setHeader('X-Request-Id', (req as any).requestId);
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/me', requireAuth(), meRouter);
  app.use('/api/admin', requireAuth(), adminRouter);
  app.use('/api', requireAuth(), domainRouter);
  app.use('/api', requireAuth(), entitiesRouter);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.', 'NOT_FOUND')));

  if (options.clientDist && fs.existsSync(options.clientDist)) {
    app.use(express.static(options.clientDist, { index: false }));
    app.get('*', (_req, res) => res.sendFile(path.join(options.clientDist!, 'index.html')));
  }

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const requestId = (req as any).requestId;
    if (err instanceof HttpError) {
      res.status(err.status).json({ message: err.message, code: err.code, details: err.details, requestId });
      return;
    }
    if (err?.code === 11000) {
      res.status(422).json({ message: 'Another record already has this value.', code: 'VALIDATION', details: [], requestId });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ message: 'The request body is not valid JSON.', code: 'BAD_REQUEST', requestId });
      return;
    }
    console.error(`[${requestId}]`, err);
    res.status(500).json({ message: 'Something went wrong on the server. Please try again.', code: 'SERVER_ERROR', requestId });
  });
  return app;
}
