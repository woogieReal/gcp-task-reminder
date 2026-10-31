import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const validEnv = {
  GCP_PROJECT_ID: 'test-project',
  GCP_LOCATION: 'asia-northeast3',
  GCP_QUEUE_NAME: 'reminder-queue',
  SERVICE_URL: 'https://example.run.app',
  TASKS_INVOKER_SA_EMAIL: 'invoker@test-project.iam.gserviceaccount.com',
  TELEGRAM_BOT_TOKEN: '123456:secret-token-value',
  TELEGRAM_CHAT_ID: '1234',
  GOOGLE_OAUTH_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  ALLOWED_EMAIL: 'me@example.com',
  SESSION_SECRET: 'session-secret-value',
};

describe('loadConfig', () => {
  it('필수 값이 모두 있으면 설정을 반환한다', () => {
    const config = loadConfig(validEnv);
    expect(config.gcpProjectId).toBe('test-project');
    expect(config.telegramBotToken).toBe('123456:secret-token-value');
    expect(config.port).toBe(8080);
    expect(config.nodeEnv).toBe('production');
    expect(config.skipTriggerAuth).toBe(false);
  });

  it('필수 값이 없거나 비어 있으면 누락된 이름을 모두 알려준다', () => {
    const env = { ...validEnv, TELEGRAM_BOT_TOKEN: undefined, SESSION_SECRET: '   ' };
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(/TELEGRAM_BOT_TOKEN, SESSION_SECRET/);
  });

  it('에러 메시지에 환경 변수 값을 담지 않는다', () => {
    const env = { ...validEnv, GCP_PROJECT_ID: undefined };
    try {
      loadConfig(env);
      expect.unreachable();
    } catch (err) {
      const message = (err as Error).message;
      for (const value of Object.values(validEnv)) {
        expect(message).not.toContain(value);
      }
    }
  });

  it('PORT가 정수가 아니거나 범위를 벗어나면 실패한다', () => {
    expect(() => loadConfig({ ...validEnv, PORT: 'abc' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...validEnv, PORT: '70000' })).toThrow(ConfigError);
    expect(loadConfig({ ...validEnv, PORT: '3000' }).port).toBe(3000);
  });

  it('SERVICE_URL 끝의 슬래시를 제거한다', () => {
    expect(loadConfig({ ...validEnv, SERVICE_URL: 'https://example.run.app/' }).serviceUrl).toBe(
      'https://example.run.app',
    );
  });

  it('SKIP_TRIGGER_AUTH는 development에서만 활성화된다', () => {
    expect(loadConfig({ ...validEnv, NODE_ENV: 'development', SKIP_TRIGGER_AUTH: 'true' }).skipTriggerAuth).toBe(true);
    expect(loadConfig({ ...validEnv, NODE_ENV: 'production', SKIP_TRIGGER_AUTH: 'true' }).skipTriggerAuth).toBe(false);
    expect(loadConfig({ ...validEnv, SKIP_TRIGGER_AUTH: 'true' }).skipTriggerAuth).toBe(false);
    expect(loadConfig({ ...validEnv, NODE_ENV: 'development', SKIP_TRIGGER_AUTH: 'false' }).skipTriggerAuth).toBe(false);
  });
});
