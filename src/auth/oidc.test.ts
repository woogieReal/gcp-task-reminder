import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeVerifier, INVOKER_EMAIL, makeTestApp, SERVICE_URL } from '../test/helpers.js';

const verifier = fakeVerifier({
  'good': { audience: SERVICE_URL, payload: { email: INVOKER_EMAIL, email_verified: true } },
  'other-sa': { audience: SERVICE_URL, payload: { email: 'attacker@p.iam.gserviceaccount.com', email_verified: true } },
  'unverified': { audience: SERVICE_URL, payload: { email: INVOKER_EMAIL, email_verified: false } },
  'wrong-audience': { audience: 'https://other.run.app', payload: { email: INVOKER_EMAIL, email_verified: true } },
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('/trigger OIDC 검증', () => {
  it('invoker SA의 유효한 토큰이면 발송한다', async () => {
    const { app, telegram } = makeTestApp({ verifier });
    const res = await request(app).post('/trigger').set('Authorization', 'Bearer good').send({ text: '영양제' });
    expect(res.status).toBe(200);
    expect(telegram.sendMessage).toHaveBeenCalledWith('영양제');
    expect(verifier.verify).toHaveBeenCalledWith('good', SERVICE_URL);
  });

  it.each([
    ['토큰 없음', undefined],
    ['Bearer 형식 아님', 'good'],
    ['검증 실패', 'Bearer forged'],
    ['audience 불일치', 'Bearer wrong-audience'],
    ['다른 SA', 'Bearer other-sa'],
    ['email_verified=false', 'Bearer unverified'],
  ])('%s → 401, 발송하지 않음', async (_name, authorization) => {
    const { app, telegram } = makeTestApp({ verifier });
    const req = request(app).post('/trigger');
    const res = await (authorization ? req.set('Authorization', authorization) : req).send({ text: '영양제' });
    expect(res.status).toBe(401);
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('skipTriggerAuth가 켜져 있으면(development 전용) 토큰 없이 통과한다', async () => {
    const { app, telegram } = makeTestApp({ verifier, config: { nodeEnv: 'development', skipTriggerAuth: true } });
    const res = await request(app).post('/trigger').send({ text: '영양제' });
    expect(res.status).toBe(200);
    expect(telegram.sendMessage).toHaveBeenCalled();
  });
});
