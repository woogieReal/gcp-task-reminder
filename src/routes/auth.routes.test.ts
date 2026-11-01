import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE, verifySessionToken } from '../auth/session.js';
import { ALLOWED_EMAIL, CLIENT_ID, fakeVerifier, makeTestApp, SERVICE_URL, SESSION_SECRET } from '../test/helpers.js';

const now = new Date('2026-11-01T00:00:00Z');
const verifier = fakeVerifier({
  'good-token': { audience: CLIENT_ID, payload: { email: 'Me@Example.com', email_verified: true } },
  'other-email': { audience: CLIENT_ID, payload: { email: 'someone@example.com', email_verified: true } },
  'unverified': { audience: CLIENT_ID, payload: { email: ALLOWED_EMAIL, email_verified: false } },
  'wrong-audience': { audience: 'another-client', payload: { email: ALLOWED_EMAIL, email_verified: true } },
});

function login(credential?: unknown) {
  const { app } = makeTestApp({ verifier, now: () => now });
  return request(app)
    .post('/auth/google')
    .set('Origin', SERVICE_URL)
    .send(credential === undefined ? {} : { credential });
}

describe('POST /auth/google', () => {
  it('허용 계정이면 204와 세션 쿠키(HttpOnly, Secure, SameSite=Lax, 7일)를 발급한다', async () => {
    const res = await login('good-token');
    expect(res.status).toBe(204);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=604800');
    const token = decodeURIComponent(cookie.split(';')[0]!.split('=')[1]!);
    expect(verifySessionToken(token, SESSION_SECRET, now)).toEqual({ email: ALLOWED_EMAIL });
  });

  it.each([['other-email'], ['unverified']])('%s → 403, 쿠키 없음', async (credential) => {
    const res = await login(credential);
    expect(res.status).toBe(403);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it.each([['invalid-token'], ['wrong-audience']])('검증 실패 토큰 %s → 401', async (credential) => {
    const res = await login(credential);
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('credential 누락 → 400', async () => {
    expect((await login()).status).toBe(400);
    expect((await login(123)).status).toBe(400);
  });
});

describe('POST /auth/logout', () => {
  it('세션 쿠키를 삭제한다', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/auth/logout').set('Origin', SERVICE_URL).send({});
    expect(res.status).toBe(204);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
  });
});
