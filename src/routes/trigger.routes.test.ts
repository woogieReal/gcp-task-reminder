import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTestApp } from '../test/helpers.js';

// 라우트 동작만 검증하므로 OIDC 검증은 생략한다 (OIDC는 auth/oidc.test.ts).
function setup() {
  return makeTestApp({ config: { nodeEnv: 'development', skipTriggerAuth: true } });
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /trigger', () => {
  it('텔레그램 발송 성공 시 200', async () => {
    const { app, telegram } = setup();
    telegram.sendMessage.mockResolvedValue(undefined);
    const res = await request(app)
      .post('/trigger')
      .set('X-CloudTasks-TaskName', 'abc')
      .set('X-CloudTasks-TaskRetryCount', '0')
      .send({ text: '영양제' });
    expect(res.status).toBe(200);
    expect(telegram.sendMessage).toHaveBeenCalledWith('영양제');
  });

  it('텔레그램 실패 시 500 (Cloud Tasks 재시도 유도)', async () => {
    const { app, telegram } = setup();
    telegram.sendMessage.mockRejectedValue(new Error('sendMessage 실패 (status 502)'));
    const res = await request(app).post('/trigger').send({ text: '영양제' });
    expect(res.status).toBe(500);
  });

  it.each([[{}], [{ text: '' }], [{ text: 123 }]])('본문 오류 %j → 200, 발송하지 않음', async (body) => {
    const { app, telegram } = setup();
    const res = await request(app).post('/trigger').send(body);
    expect(res.status).toBe(200);
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });
});
