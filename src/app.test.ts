import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('createApp', () => {
  it('GET /healthz는 200을 반환한다', async () => {
    const res = await request(createApp()).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('없는 경로는 404 JSON을 반환한다', async () => {
    const res = await request(createApp()).get('/no-such-path');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found' });
  });

  it('X-Powered-By 헤더를 노출하지 않는다', async () => {
    const res = await request(createApp()).get('/healthz');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
