const REQUIRED_KEYS = [
  'GCP_PROJECT_ID',
  'GCP_LOCATION',
  'GCP_QUEUE_NAME',
  'SERVICE_URL',
  'TASKS_INVOKER_SA_EMAIL',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'GOOGLE_OAUTH_CLIENT_ID',
  'ALLOWED_EMAIL',
  'SESSION_SECRET',
] as const;

export interface Config {
  port: number;
  nodeEnv: string;
  gcpProjectId: string;
  gcpLocation: string;
  gcpQueueName: string;
  serviceUrl: string;
  tasksInvokerSaEmail: string;
  telegramBotToken: string;
  telegramChatId: string;
  googleOauthClientId: string;
  allowedEmail: string;
  sessionSecret: string;
  /** 로컬 개발에서 /trigger OIDC 검증 생략. NODE_ENV=development일 때만 true가 될 수 있다. */
  skipTriggerAuth: boolean;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/**
 * 환경 변수를 읽어 검증한다. 에러 메시지에는 변수 이름만 담고 값은 담지 않는다.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing = REQUIRED_KEYS.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new ConfigError(`필수 환경 변수가 없습니다: ${missing.join(', ')}`);
  }
  const required = (key: (typeof REQUIRED_KEYS)[number]): string => env[key]!.trim();

  const portRaw = env.PORT?.trim() || '8080';
  const port = Number(portRaw);
  if (!/^\d+$/.test(portRaw) || port < 1 || port > 65535) {
    throw new ConfigError('PORT는 1~65535 사이의 정수여야 합니다');
  }

  const nodeEnv = env.NODE_ENV?.trim() || 'production';

  return {
    port,
    nodeEnv,
    gcpProjectId: required('GCP_PROJECT_ID'),
    gcpLocation: required('GCP_LOCATION'),
    gcpQueueName: required('GCP_QUEUE_NAME'),
    serviceUrl: required('SERVICE_URL').replace(/\/+$/, ''),
    tasksInvokerSaEmail: required('TASKS_INVOKER_SA_EMAIL'),
    telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
    telegramChatId: required('TELEGRAM_CHAT_ID'),
    googleOauthClientId: required('GOOGLE_OAUTH_CLIENT_ID'),
    allowedEmail: required('ALLOWED_EMAIL'),
    sessionSecret: required('SESSION_SECRET'),
    skipTriggerAuth: nodeEnv === 'development' && env.SKIP_TRIGGER_AUTH?.trim() === 'true',
  };
}
