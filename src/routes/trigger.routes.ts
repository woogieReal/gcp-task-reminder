import { Router } from 'express';
import type { TelegramService } from '../services/telegram.service.js';
import { parseText } from '../validation.js';

export function triggerRouter(telegram: TelegramService): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const taskName = req.get('X-CloudTasks-TaskName') ?? '-';
    const retryCount = req.get('X-CloudTasks-TaskRetryCount') ?? '-';

    const result = parseText((req.body as { text?: unknown } | undefined)?.text);
    if (!result.ok) {
      // 재시도해도 결과가 같으므로 200으로 응답해 Cloud Tasks 재시도를 막는다.
      console.error(`trigger: 잘못된 본문 (task=${taskName}, retry=${retryCount}): ${result.error}`);
      res.status(200).json({ status: 'ignored' });
      return;
    }

    try {
      await telegram.sendMessage(result.value);
    } catch (err) {
      // 500을 반환하면 Cloud Tasks가 retry_config에 따라 재시도한다.
      console.error(`trigger: 발송 실패 (task=${taskName}, retry=${retryCount}): ${(err as Error).message}`);
      res.status(500).json({ error: '알림 발송에 실패했습니다' });
      return;
    }

    console.log(`trigger: 발송 완료 (task=${taskName}, retry=${retryCount})`);
    res.status(200).json({ status: 'sent' });
  });

  return router;
}
