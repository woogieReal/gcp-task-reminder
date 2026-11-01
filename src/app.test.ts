import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

function makeApp() {
  return createApp({
    tasks: { create: vi.fn(), list: vi.fn().mockRejectedValue(new Error('db password=hunter2')), delete: vi.fn() },
    telegram: { sendMessage: vi.fn() },
  });
}

describe('createApp', () => {
  it('GET /healthz는 200을 반환한다', async () => {
    const res = await request(makeApp()).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('없는 경로는 404 JSON을 반환한다', async () => {
    const res = await request(makeApp()).get('/no-such-path');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found' });
  });

  it('X-Powered-By 헤더를 노출하지 않는다', async () => {
    const res = await request(makeApp()).get('/healthz');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('잘못된 JSON 본문은 400을 반환한다', async () => {
    const res = await request(makeApp()).post('/api/reminders').set('Content-Type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTypeOf('string');
  });

  it('처리되지 않은 에러는 내부 메시지 없이 500을 반환한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(makeApp()).get('/api/reminders');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal Server Error' });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });
});
