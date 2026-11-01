import { createApp } from './app.js';
import { createGoogleIdTokenVerifier } from './auth/google.js';
import { ConfigError, loadConfig, type Config } from './config.js';
import { createCloudTaskService } from './services/task.service.js';
import { createTelegramService } from './services/telegram.service.js';

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const app = createApp({
  config,
  tasks: createCloudTaskService({
    projectId: config.gcpProjectId,
    location: config.gcpLocation,
    queueName: config.gcpQueueName,
    serviceUrl: config.serviceUrl,
    invokerSaEmail: config.tasksInvokerSaEmail,
  }),
  telegram: createTelegramService({ botToken: config.telegramBotToken, chatId: config.telegramChatId }),
  verifier: createGoogleIdTokenVerifier(),
});

const server = app.listen(config.port, () => {
  console.log(`reminder-api listening on port ${config.port} (${config.nodeEnv})`);
});

// Cloud Run은 인스턴스를 내릴 때 SIGTERM을 보낸다.
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
