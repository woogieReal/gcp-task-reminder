import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp, SERVICE_URL, sessionCookie } from '../test/helpers.js';

const body = { text: '영양제', scheduleAt: '2099-01-01T00:00:00Z' };

describe('CSRF 방어', () => {
  it('Origin이 없으면 403', async () => {
    const { app, tasks } = makeTestApp();
    const res = await request(app).post('/api/reminders').set('Cookie', sessionCookie()).send(body);
    expect(res.status).toBe(403);
    expect(tasks.create).not.toHaveBeenCalled();
  });

  it('Origin이 다르면 403', async () => {
    const res = await request(makeTestApp().app)
      .post('/api/reminders')
      .set('Cookie', sessionCookie())
      .set('Origin', 'https://evil.example.com')
      .send(body);
    expect(res.status).toBe(403);
  });

  it('Content-Type이 JSON이 아니면 403 (form 전송 차단)', async () => {
    const res = await request(makeTestApp().app)
      .post('/auth/logout')
      .set('Origin', SERVICE_URL)
      .type('form')
      .send('a=1');
    expect(res.status).toBe(403);
  });

  it('DELETE도 검사한다', async () => {
    const res = await request(makeTestApp().app).delete('/api/reminders/abc').set('Cookie', sessionCookie());
    expect(res.status).toBe(403);
  });

  it('GET은 검사하지 않는다', async () => {
    const { app, tasks } = makeTestApp();
    tasks.list.mockResolvedValue([]);
    const res = await request(app).get('/api/reminders').set('Cookie', sessionCookie());
    expect(res.status).toBe(200);
  });

  it('localhost Origin은 development에서만 허용한다', async () => {
    const send = (nodeEnv: string) =>
      request(makeTestApp({ config: { nodeEnv } }).app)
        .post('/auth/logout')
        .set('Origin', 'http://localhost:8080')
        .send({});
    expect((await send('development')).status).toBe(204);
    expect((await send('production')).status).toBe(403);
  });
});
