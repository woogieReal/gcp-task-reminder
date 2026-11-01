import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createApp } from '../app.js';
import type { TelegramService } from '../services/telegram.service.js';

let sendMessage: Mock<TelegramService['sendMessage']>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sendMessage = vi.fn<TelegramService['sendMessage']>();
  app = createApp({ tasks: { create: vi.fn(), list: vi.fn(), delete: vi.fn() }, telegram: { sendMessage } });
});

describe('POST /trigger', () => {
  it('텔레그램 발송 성공 시 200', async () => {
    sendMessage.mockResolvedValue(undefined);
    const res = await request(app)
      .post('/trigger')
      .set('X-CloudTasks-TaskName', 'abc')
      .set('X-CloudTasks-TaskRetryCount', '0')
      .send({ text: '영양제' });
    expect(res.status).toBe(200);
    expect(sendMessage).toHaveBeenCalledWith('영양제');
  });

  it('텔레그램 실패 시 500 (Cloud Tasks 재시도 유도)', async () => {
    sendMessage.mockRejectedValue(new Error('sendMessage 실패 (status 502)'));
    const res = await request(app).post('/trigger').send({ text: '영양제' });
    expect(res.status).toBe(500);
  });

  it.each([[{}], [{ text: '' }], [{ text: 123 }]])('본문 오류 %j → 200, 발송하지 않음', async (body) => {
    const res = await request(app).post('/trigger').send(body);
    expect(res.status).toBe(200);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
