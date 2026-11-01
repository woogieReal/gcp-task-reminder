import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { createTelegramService, TelegramError } from './telegram.service.js';

const botToken = '123456:SECRET-TOKEN';

describe('createTelegramService', () => {
  it('chat_id와 접두어가 붙은 text로 sendMessage를 호출한다', async () => {
    const http = { post: vi.fn().mockResolvedValue({ data: { ok: true } }) };
    await createTelegramService({ botToken, chatId: '42', http }).sendMessage('영양제');
    expect(http.post).toHaveBeenCalledWith(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: '42',
      text: '[리마인더] 영양제',
    });
  });

  it('실패 시 상태와 설명만 담은 TelegramError를 던지고 토큰은 포함하지 않는다', async () => {
    const config = { url: `https://api.telegram.org/bot${botToken}/sendMessage`, headers: new AxiosHeaders() };
    const axiosError = new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', config, null, {
      status: 401,
      statusText: 'Unauthorized',
      data: { ok: false, description: 'Unauthorized' },
      headers: {},
      config,
    });
    const http = { post: vi.fn().mockRejectedValue(axiosError) };
    const promise = createTelegramService({ botToken, chatId: '42', http }).sendMessage('x');

    await expect(promise).rejects.toBeInstanceOf(TelegramError);
    await expect(promise).rejects.toThrow('status 401');
    await promise.catch((err: Error) => {
      expect(err.message).not.toContain('SECRET-TOKEN');
      expect(err.message).not.toContain(botToken);
    });
  });

  it('네트워크 오류(응답 없음)도 TelegramError로 감싼다', async () => {
    const http = { post: vi.fn().mockRejectedValue(new AxiosError('timeout', 'ECONNABORTED')) };
    await expect(createTelegramService({ botToken, chatId: '42', http }).sendMessage('x')).rejects.toThrow(
      'status none',
    );
  });
});
