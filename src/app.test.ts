import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { CLIENT_ID, makeTestApp, sessionCookie } from './test/helpers.js';

describe('createApp', () => {
  it('GET /healthz는 200을 반환한다', async () => {
    const res = await request(makeTestApp().app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /는 로그인 페이지를 반환한다', async () => {
    const res = await request(makeTestApp().app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('https://accounts.google.com/gsi/client');
  });

  it('GET /api/config는 인증 없이 Client ID를 반환한다', async () => {
    const res = await request(makeTestApp().app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ googleClientId: CLIENT_ID });
  });

  it('없는 경로는 404 JSON을 반환한다', async () => {
    const res = await request(makeTestApp().app).get('/no-such-path');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found' });
  });

  it('잘못된 JSON 본문은 400을 반환한다', async () => {
    const res = await request(makeTestApp().app)
      .post('/auth/google')
      .set('Origin', 'https://reminder-api.example.run.app')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
  });

  it('처리되지 않은 에러는 내부 메시지 없이 500을 반환한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app, tasks } = makeTestApp();
    tasks.list.mockRejectedValue(new Error('db password=hunter2'));
    const res = await request(app).get('/api/reminders').set('Cookie', sessionCookie());
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal Server Error' });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });
});

describe('보안 헤더', () => {
  it('GIS를 허용하는 CSP와 COOP·Referrer-Policy를 설정하고 X-Powered-By는 숨긴다', async () => {
    const res = await request(makeTestApp().app).get('/');
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toContain("script-src 'self' https://accounts.google.com/gsi/client");
    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style");
    // 인라인 허용은 스타일에만 적용하고 스크립트는 막는다.
    const scriptSrc = csp.split(';').find((d) => d.startsWith('script-src '));
    expect(scriptSrc).toBe("script-src 'self' https://accounts.google.com/gsi/client");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).toContain('frame-src https://accounts.google.com/gsi/');
    expect(csp).toContain("connect-src 'self' https://accounts.google.com/gsi/");
    expect(csp).toContain('upgrade-insecure-requests');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('development에서는 upgrade-insecure-requests를 빼서 http://localhost가 동작한다', async () => {
    const res = await request(makeTestApp({ config: { nodeEnv: 'development' } }).app).get('/');
    expect(res.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
  });
});
