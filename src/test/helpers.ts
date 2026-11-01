import { vi, type Mock, type Mocked } from 'vitest';
import { createApp } from '../app.js';
import type { IdTokenPayload, IdTokenVerifier } from '../auth/google.js';
import { createSessionToken, SESSION_COOKIE } from '../auth/session.js';
import type { Config } from '../config.js';
import type { TaskService } from '../services/task.service.js';
import type { TelegramService } from '../services/telegram.service.js';

export const ALLOWED_EMAIL = 'me@example.com';
export const SERVICE_URL = 'https://reminder-api.example.run.app';
export const INVOKER_EMAIL = 'invoker@p.iam.gserviceaccount.com';
export const CLIENT_ID = 'client-id.apps.googleusercontent.com';
export const SESSION_SECRET = 'test-session-secret';

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 8080,
    nodeEnv: 'production',
    gcpProjectId: 'p',
    gcpLocation: 'asia-northeast3',
    gcpQueueName: 'reminder-queue',
    serviceUrl: SERVICE_URL,
    tasksInvokerSaEmail: INVOKER_EMAIL,
    telegramBotToken: '123456:token',
    telegramChatId: '42',
    googleOauthClientId: CLIENT_ID,
    allowedEmail: ALLOWED_EMAIL,
    sessionSecret: SESSION_SECRET,
    skipTriggerAuth: false,
    ...overrides,
  };
}

/** 토큰 문자열을 payload로 매핑하는 가짜 검증기. 매핑에 없으면 검증 실패. audience도 확인한다. */
export function fakeVerifier(tokens: Record<string, { audience: string; payload: IdTokenPayload }> = {}) {
  const verify: Mock<IdTokenVerifier['verify']> = vi.fn(async (token, audience) => {
    const entry = tokens[token];
    if (!entry || entry.audience !== audience) throw new Error('invalid token');
    return entry.payload;
  });
  return { verify };
}

export function makeTestApp(options: { config?: Partial<Config>; verifier?: IdTokenVerifier; now?: () => Date } = {}) {
  const tasks: Mocked<TaskService> = {
    create: vi.fn<TaskService['create']>(),
    list: vi.fn<TaskService['list']>(),
    delete: vi.fn<TaskService['delete']>(),
  };
  const telegram: Mocked<TelegramService> = { sendMessage: vi.fn<TelegramService['sendMessage']>() };
  const app = createApp({
    config: testConfig(options.config),
    tasks,
    telegram,
    verifier: options.verifier ?? fakeVerifier(),
    now: options.now,
  });
  return { app, tasks, telegram };
}

export function sessionCookie(email = ALLOWED_EMAIL, now = new Date(), secret = SESSION_SECRET): string {
  return `${SESSION_COOKIE}=${createSessionToken(email, secret, now)}`;
}
