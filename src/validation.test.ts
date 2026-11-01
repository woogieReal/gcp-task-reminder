import { describe, expect, it } from 'vitest';
import { isValidTaskId, MAX_SCHEDULE_MS, MAX_TEXT_LENGTH, parseCreateReminder } from './validation.js';

const now = new Date('2026-11-01T00:00:00.000Z');
const later = '2026-11-01T09:30:00+09:00'; // now + 30분

describe('parseCreateReminder', () => {
  it('정상 입력을 파싱하고 text 앞뒤 공백을 제거한다', () => {
    const result = parseCreateReminder({ text: '  영양제  ', scheduleAt: later }, now);
    expect(result).toEqual({ ok: true, value: { text: '영양제', scheduleAt: new Date('2026-11-01T00:30:00.000Z') } });
  });

  it.each([
    ['본문이 객체가 아님', null],
    ['text 누락', { scheduleAt: later }],
    ['text 공백', { text: '   ', scheduleAt: later }],
    ['text 문자열 아님', { text: 1, scheduleAt: later }],
    ['text 4000자 초과', { text: 'a'.repeat(MAX_TEXT_LENGTH + 1), scheduleAt: later }],
    ['scheduleAt 누락', { text: 'a' }],
    ['scheduleAt 형식 오류', { text: 'a', scheduleAt: 'tomorrow' }],
    ['scheduleAt 오프셋 없음', { text: 'a', scheduleAt: '2026-11-01T09:30:00' }],
    ['scheduleAt 존재하지 않는 날짜', { text: 'a', scheduleAt: '2026-13-01T09:30:00Z' }],
    ['scheduleAt 과거', { text: 'a', scheduleAt: '2026-10-31T23:59:00Z' }],
    ['scheduleAt 현재와 같음', { text: 'a', scheduleAt: now.toISOString() }],
    ['scheduleAt 30일 초과', { text: 'a', scheduleAt: new Date(now.getTime() + MAX_SCHEDULE_MS + 1000).toISOString() }],
  ])('%s → 실패', (_name, body) => {
    expect(parseCreateReminder(body, now).ok).toBe(false);
  });

  it('text 4000자와 30일 정각은 허용한다', () => {
    const body = { text: 'a'.repeat(MAX_TEXT_LENGTH), scheduleAt: new Date(now.getTime() + MAX_SCHEDULE_MS).toISOString() };
    expect(parseCreateReminder(body, now).ok).toBe(true);
  });
});

describe('isValidTaskId', () => {
  it('영문·숫자·-·_만 허용한다', () => {
    expect(isValidTaskId('0123456789abcdef_AB-c')).toBe(true);
    expect(isValidTaskId('')).toBe(false);
    expect(isValidTaskId('../queues/other')).toBe(false);
    expect(isValidTaskId('projects/p/locations/l/queues/q/tasks/1')).toBe(false);
    expect(isValidTaskId('a b')).toBe(false);
  });
});
