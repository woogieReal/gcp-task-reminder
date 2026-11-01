/** 텔레그램 한도(4096자)에서 "[리마인더] " 접두어 여유분을 뺀 값 */
export const MAX_TEXT_LENGTH = 4000;
/** Cloud Tasks가 허용하는 최대 예약 기간 */
export const MAX_SCHEDULE_MS = 30 * 24 * 60 * 60 * 1000;

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const TASK_ID = /^[A-Za-z0-9_-]{1,500}$/;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface CreateReminderInput {
  text: string;
  scheduleAt: Date;
}

export function parseCreateReminder(body: unknown, now: Date): ValidationResult<CreateReminderInput> {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: '요청 본문은 JSON 객체여야 합니다' };
  }
  const { text, scheduleAt } = body as Record<string, unknown>;

  const textResult = parseText(text);
  if (!textResult.ok) return textResult;

  if (typeof scheduleAt !== 'string' || !ISO_WITH_OFFSET.test(scheduleAt)) {
    return { ok: false, error: 'scheduleAt은 UTC 오프셋을 포함한 ISO 8601 시각이어야 합니다' };
  }
  const date = new Date(scheduleAt);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: 'scheduleAt이 올바른 시각이 아닙니다' };
  }
  if (date.getTime() <= now.getTime()) {
    return { ok: false, error: 'scheduleAt은 현재 시각 이후여야 합니다' };
  }
  if (date.getTime() - now.getTime() > MAX_SCHEDULE_MS) {
    return { ok: false, error: 'scheduleAt은 현재로부터 30일 이내여야 합니다' };
  }

  return { ok: true, value: { text: textResult.value, scheduleAt: date } };
}

export function parseText(text: unknown): ValidationResult<string> {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: 'text는 비어 있지 않은 문자열이어야 합니다' };
  }
  const trimmed = text.trim();
  if (trimmed.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: `text는 최대 ${MAX_TEXT_LENGTH}자입니다` };
  }
  return { ok: true, value: trimmed };
}

export function isValidTaskId(id: string): boolean {
  return TASK_ID.test(id);
}
