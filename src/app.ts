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
// GIS client가 버튼을 그리기 전 임시 버튼에 주입하는 <style>의 해시.
// 막히면 임시 G 로고가 화면 전체 크기로 잠깐 보인다. Google이 스타일을 바꾸면 콘솔에 새 해시가 표시된다.
const GSI_INLINE_STYLE_HASH = "'sha256-RU4sU0AaS8IBGZx8XrGt/pa9A5SLA3dQszGeqT5L3Kw='";

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
          styleSrc: ["'self'", `${GSI}style`, GSI_INLINE_STYLE_HASH],
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

  app.get('/healthz', (_req, res) => {
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
