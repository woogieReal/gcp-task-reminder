import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mocked } from 'vitest';
import { createApp } from '../app.js';
import type { Reminder, TaskService } from '../services/task.service.js';

const now = new Date('2026-11-01T00:00:00.000Z');
const reminder: Reminder = { id: 'abc', text: '영양제', scheduleAt: '2026-11-01T00:30:00.000Z', attempts: 0 };

let tasks: Mocked<TaskService>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  tasks = { create: vi.fn<TaskService['create']>(), list: vi.fn<TaskService['list']>(), delete: vi.fn<TaskService['delete']>() };
  app = createApp({ tasks, telegram: { sendMessage: vi.fn() }, now: () => now });
});

describe('POST /api/reminders', () => {
  it('정상 요청은 201과 예약 정보를 반환한다', async () => {
    tasks.create.mockResolvedValue(reminder);
    const res = await request(app).post('/api/reminders').send({ text: '영양제', scheduleAt: '2026-11-01T09:30:00+09:00' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'abc', text: '영양제', scheduleAt: '2026-11-01T00:30:00.000Z' });
    expect(tasks.create).toHaveBeenCalledWith({ text: '영양제', scheduleAt: new Date('2026-11-01T00:30:00.000Z') });
  });

  it.each([
    [{ scheduleAt: '2026-11-01T09:30:00+09:00' }],
    [{ text: '   ', scheduleAt: '2026-11-01T09:30:00+09:00' }],
    [{ text: 'a'.repeat(4001), scheduleAt: '2026-11-01T09:30:00+09:00' }],
    [{ text: 'a', scheduleAt: '2026-11-01T09:30:00' }],
    [{ text: 'a', scheduleAt: '2026-10-31T00:00:00Z' }],
    [{ text: 'a', scheduleAt: '2026-12-31T00:00:00Z' }],
  ])('검증 실패 %j → 400, 태스크를 만들지 않는다', async (body) => {
    const res = await request(app).post('/api/reminders').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTypeOf('string');
    expect(tasks.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/reminders', () => {
  it('예약 목록을 반환한다', async () => {
    tasks.list.mockResolvedValue([reminder, { ...reminder, id: 'def', attempts: 2, lastError: 'HTTP status code 500' }]);
    const res = await request(app).get('/api/reminders');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[1]).toMatchObject({ id: 'def', attempts: 2, lastError: 'HTTP status code 500' });
  });
});

describe('DELETE /api/reminders/:id', () => {
  it('삭제 성공 시 204', async () => {
    tasks.delete.mockResolvedValue(true);
    const res = await request(app).delete('/api/reminders/abc_123-X');
    expect(res.status).toBe(204);
    expect(tasks.delete).toHaveBeenCalledWith('abc_123-X');
  });

  it('없는 태스크는 404', async () => {
    tasks.delete.mockResolvedValue(false);
    const res = await request(app).delete('/api/reminders/gone');
    expect(res.status).toBe(404);
  });

  it('ID 형식 위반은 400, 삭제를 시도하지 않는다', async () => {
    const res = await request(app).delete('/api/reminders/a.b');
    expect(res.status).toBe(400);
    expect(tasks.delete).not.toHaveBeenCalled();
  });
});
