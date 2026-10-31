import express, { type ErrorRequestHandler } from 'express';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // 내부 에러 메시지나 스택은 응답에 노출하지 않는다.
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error('Unhandled error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal Server Error' });
  };
  app.use(errorHandler);

  return app;
}
