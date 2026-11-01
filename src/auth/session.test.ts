import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp, SESSION_SECRET, sessionCookie } from '../test/helpers.js';
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_MS, verifySessionToken } from './session.js';

const now = new Date('2026-11-01T00:00:00Z');

describe('세션 토큰', () => {
  it('서명한 토큰은 만료 전까지 검증된다', () => {
    const token = createSessionToken('me@example.com', SESSION_SECRET, now);
    expect(verifySessionToken(token, SESSION_SECRET, now)).toEqual({ email: 'me@example.com' });
    expect(verifySessionToken(token, SESSION_SECRET, new Date(now.getTime() + SESSION_TTL_MS - 1))).not.toBeNull();
  });

  it('만료·다른 키·payload 변조·형식 오류는 거부한다', () => {
    const token = createSessionToken('me@example.com', SESSION_SECRET, now);
    expect(verifySessionToken(token, SESSION_SECRET, new Date(now.getTime() + SESSION_TTL_MS))).toBeNull();
    expect(verifySessionToken(token, 'other-secret', now)).toBeNull();

    const [, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ email: 'attacker@example.com', exp: now.getTime() + 1e9 })).toString(
      'base64url',
    );
    expect(verifySessionToken(`${forged}.${signature}`, SESSION_SECRET, now)).toBeNull();
    expect(verifySessionToken('garbage', SESSION_SECRET, now)).toBeNull();
    expect(verifySessionToken(`${token}.extra`, SESSION_SECRET, now)).toBeNull();
  });
});

describe('세션 미들웨어 (/api/*)', () => {
  it('유효한 세션이면 /api/me가 이메일을 반환한다', async () => {
    const res = await request(makeTestApp({ now: () => now }).app).get('/api/me').set('Cookie', sessionCookie(undefined, now));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: 'me@example.com' });
  });

  it.each([
    ['세션 없음', undefined],
    ['위조된 서명', `${SESSION_COOKIE}=abc.def`],
    ['다른 키로 서명', sessionCookie(undefined, now, 'other-secret')],
    ['만료', sessionCookie(undefined, new Date(now.getTime() - SESSION_TTL_MS))],
  ])('%s → 401', async (_name, cookie) => {
    const { app, tasks } = makeTestApp({ now: () => now });
    const req = request(app).get('/api/reminders');
    const res = cookie ? await req.set('Cookie', cookie) : await req;
    expect(res.status).toBe(401);
    expect(tasks.list).not.toHaveBeenCalled();
  });
});
