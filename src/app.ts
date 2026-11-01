import express, { type ErrorRequestHandler } from 'express';
import { reminderRouter } from './routes/reminder.routes.js';
import { triggerRouter } from './routes/trigger.routes.js';
import type { TaskService } from './services/task.service.js';
import type { TelegramService } from './services/telegram.service.js';

export interface AppDeps {
  tasks: TaskService;
  telegram: TelegramService;
  now?: () => Date;
}

export function createApp({ tasks, telegram, now = () => new Date() }: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/reminders', reminderRouter(tasks, now));
  app.use('/trigger', triggerRouter(telegram));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // 내부 에러 메시지나 스택은 응답에 노출하지 않는다.
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const type = (err as { type?: unknown }).type;
    if (type === 'entity.parse.failed') {
      res.status(400).json({ error: '요청 본문이 올바른 JSON이 아닙니다' });
      return;
    }
    if (type === 'entity.too.large') {
      res.status(413).json({ error: '요청 본문이 너무 큽니다' });
      return;
    }
    console.error('Unhandled error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal Server Error' });
  };
  app.use(errorHandler);

  return app;
}
