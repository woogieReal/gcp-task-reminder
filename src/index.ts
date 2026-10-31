import { createApp } from './app.js';
import { ConfigError, loadConfig, type Config } from './config.js';

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

const server = createApp().listen(config.port, () => {
  console.log(`reminder-api listening on port ${config.port} (${config.nodeEnv})`);
});

// Cloud Run은 인스턴스를 내릴 때 SIGTERM을 보낸다.
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
