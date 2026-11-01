import { Router } from 'express';
import type { TaskService } from '../services/task.service.js';
import { isValidTaskId, parseCreateReminder } from '../validation.js';

export function reminderRouter(tasks: TaskService, now: () => Date): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const result = parseCreateReminder(req.body, now());
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const reminder = await tasks.create(result.value);
    res.status(201).json({ id: reminder.id, text: reminder.text, scheduleAt: reminder.scheduleAt });
  });

  router.get('/', async (_req, res) => {
    res.status(200).json(await tasks.list());
  });

  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    if (!isValidTaskId(id)) {
      res.status(400).json({ error: '올바르지 않은 예약 ID입니다' });
      return;
    }
    if (!(await tasks.delete(id))) {
      res.status(404).json({ error: '예약을 찾을 수 없습니다' });
      return;
    }
    res.status(204).end();
  });

  return router;
}
