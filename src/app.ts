import { fileURLToPath } from 'node:url';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { csrfProtection } from './auth/csrf.js';
import type { IdTokenVerifier } from './auth/google.js';
import { requireTriggerAuth } from './auth/oidc.js';
import { requireSession } from './auth/session.js';
import type { Config } from './config.js';
import { authRouter } from './routes/auth.routes.js';
import { reminderRouter } from './routes/reminder.routes.js';
import { triggerRouter } from './routes/trigger.routes.js';
import type { TaskService } from './services/task.service.js';
import type { TelegramService } from './services/telegram.service.js';

export interface AppDeps {
  config: Config;
  tasks: TaskService;
  telegram: TelegramService;
  verifier: IdTokenVerifier;
  now?: () => Date;
}

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
const GSI = 'https://accounts.google.com/gsi/';

export function createApp({ config, tasks, telegram, verifier, now = () => new Date() }: AppDeps) {
  const isDevelopment = config.nodeEnv === 'development';
  const app = express();
  app.disable('x-powered-by');

  // Google Identity Services 공식 가이드의 CSP·COOP·Referrer-Policy 요구사항을 반영한다.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          scriptSrc: ["'self'", `${GSI}client`],
          // GIS는 버튼 폭 등에 따라 내용이 달라지는 인라인 <style>·style 속성을 주입하므로 해시로 고정할 수 없다.
          // 사용자 입력은 모두 textContent로 렌더링해 마크업 주입이 불가능하고, 스크립트는 'unsafe-inline' 없이 막는다.
          styleSrc: ["'self'", "'unsafe-inline'", `${GSI}style`],
          frameSrc: [GSI],
          connectSrc: ["'self'", GSI],
          // http://localhost에서는 https 업그레이드가 정적 파일 로딩을 깨뜨린다.
          upgradeInsecureRequests: isDevelopment ? null : [],
        },
      },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(express.json({ limit: '16kb' }));
  app.use(express.static(PUBLIC_DIR));

  // Cloud Run은 'z'로 끝나는 일부 경로(/healthz 등)를 예약해 앱까지 전달하지 않으므로 /health를 쓴다.
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/api/config', (_req, res) => {
    res.status(200).json({ googleClientId: config.googleOauthClientId });
  });

  const allowedOrigins = [config.serviceUrl, ...(isDevelopment ? [`http://localhost:${config.port}`] : [])];
  app.use(['/auth', '/api'], csrfProtection(allowedOrigins));

  app.use(
    '/auth',
    authRouter({
      verifier,
      clientId: config.googleOauthClientId,
      allowedEmail: config.allowedEmail,
      sessionSecret: config.sessionSecret,
      now,
    }),
  );

  const session = requireSession(config.sessionSecret, now);
  app.get('/api/me', session, (_req, res) => {
    res.status(200).json({ email: res.locals.email as string });
  });
  app.use('/api/reminders', session, reminderRouter(tasks, now));

  app.use(
    '/trigger',
    requireTriggerAuth({
      verifier,
      audience: config.serviceUrl,
      invokerEmail: config.tasksInvokerSaEmail,
      skip: config.skipTriggerAuth,
    }),
    triggerRouter(telegram),
  );

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
