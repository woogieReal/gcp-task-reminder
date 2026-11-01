import axios, { type AxiosInstance } from 'axios';

export const MESSAGE_PREFIX = '[리마인더] ';

export interface TelegramService {
  sendMessage(text: string): Promise<void>;
}

export class TelegramError extends Error {
  override name = 'TelegramError';
}

export interface TelegramServiceOptions {
  botToken: string;
  chatId: string;
  http?: Pick<AxiosInstance, 'post'>;
}

export function createTelegramService({
  botToken,
  chatId,
  http = axios.create({ timeout: 10_000 }),
}: TelegramServiceOptions): TelegramService {
  return {
    async sendMessage(text) {
      try {
        // parse_mode를 지정하지 않아 사용자 입력이 서식으로 해석되지 않는다.
        await http.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          chat_id: chatId,
          text: `${MESSAGE_PREFIX}${text}`,
        });
      } catch (err) {
        // axios 에러 객체에는 토큰이 포함된 URL이 들어 있으므로 상태와 설명만 옮긴다.
        if (axios.isAxiosError(err)) {
          const status = err.response?.status ?? 'none';
          const description = (err.response?.data as { description?: string } | undefined)?.description ?? err.code;
          throw new TelegramError(`sendMessage 실패 (status ${status}): ${description ?? 'unknown'}`);
        }
        throw new TelegramError('sendMessage 실패');
      }
    },
  };
}
