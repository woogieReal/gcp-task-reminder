import { describe, expect, it } from 'vitest';
import {
  defaultScheduleTime,
  formatRemaining,
  formatScheduleTime,
  fromLocalInputValue,
  MAX_SCHEDULE_MS,
  MAX_TEXT_LENGTH,
  quickPickTime,
  toLocalInputValue,
  validateReminder,
} from '../../public/time.js';

// vitest.config.ts에서 TZ=Asia/Seoul로 고정한다.
const local = (y, mo, d, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s);

describe('시간대 고정', () => {
  it('테스트는 Asia/Seoul(UTC+9)에서 실행된다', () => {
    expect(local(2026, 11, 1, 9).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
});

describe('quickPickTime', () => {
  const now = local(2026, 11, 1, 14, 7, 42);

  it.each([
    ['10m', local(2026, 11, 1, 14, 17)],
    ['30m', local(2026, 11, 1, 14, 37)],
    ['1h', local(2026, 11, 1, 15, 7)],
    ['3h', local(2026, 11, 1, 17, 7)],
    ['tomorrow9', local(2026, 11, 2, 9, 0)],
  ])('%s', (id, expected) => {
    expect(quickPickTime(id, now)).toEqual(expected);
  });

  it('자정을 넘기는 상대 시간', () => {
    expect(quickPickTime('3h', local(2026, 11, 1, 23, 30))).toEqual(local(2026, 11, 2, 2, 30));
  });

  it('월말·연말의 내일 오전 9시', () => {
    expect(quickPickTime('tomorrow9', local(2026, 11, 30, 22))).toEqual(local(2026, 12, 1, 9));
    expect(quickPickTime('tomorrow9', local(2026, 12, 31, 1))).toEqual(local(2027, 1, 1, 9));
  });

  it('알 수 없는 id는 예외', () => {
    expect(() => quickPickTime('nope', now)).toThrow();
  });
});

describe('defaultScheduleTime', () => {
  it('지금부터 5분 뒤, 분 단위 내림', () => {
    expect(defaultScheduleTime(local(2026, 11, 1, 14, 7, 42))).toEqual(local(2026, 11, 1, 14, 12));
  });

  it('자정을 넘기는 경우', () => {
    expect(defaultScheduleTime(local(2026, 12, 31, 23, 58))).toEqual(local(2027, 1, 1, 0, 3));
  });

  it('기본값은 항상 등록 가능한 시각이다 (현재 이후)', () => {
    const now = local(2026, 11, 1, 14, 7, 59, 999);
    expect(defaultScheduleTime(now).getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('datetime-local 변환', () => {
  it('Date ↔ 입력 값이 왕복된다', () => {
    const date = local(2026, 1, 5, 7, 3);
    expect(toLocalInputValue(date)).toBe('2026-01-05T07:03');
    expect(fromLocalInputValue('2026-01-05T07:03')).toEqual(date);
  });

  it('비어 있거나 잘못된 값은 null', () => {
    expect(fromLocalInputValue('')).toBeNull();
    expect(fromLocalInputValue(undefined)).toBeNull();
    expect(fromLocalInputValue('2026-01-05')).toBeNull();
    expect(fromLocalInputValue('2026-02-30T10:00')).toBeNull();
  });
});

describe('validateReminder', () => {
  const now = local(2026, 11, 1, 12);
  const later = local(2026, 11, 1, 12, 10);

  it('정상이면 null', () => {
    expect(validateReminder('영양제', later, now)).toBeNull();
    expect(validateReminder('a'.repeat(MAX_TEXT_LENGTH), new Date(now.getTime() + MAX_SCHEDULE_MS), now)).toBeNull();
  });

  it.each([
    ['메시지 공백', '   ', later, '메시지를 입력하세요'],
    ['메시지 4000자 초과', 'a'.repeat(MAX_TEXT_LENGTH + 1), later, '메시지는 최대 4000자입니다'],
    ['시각 없음', '영양제', null, '알림 시각을 선택하세요'],
    ['지난 시각', '영양제', local(2026, 11, 1, 11, 59), '지난 시각은 예약할 수 없습니다'],
    ['현재 시각', '영양제', now, '지난 시각은 예약할 수 없습니다'],
    ['30일 초과', '영양제', new Date(now.getTime() + MAX_SCHEDULE_MS + 60_000), '30일 이내로만 예약할 수 있습니다'],
  ])('%s → 사유 문구', (_name, text, scheduleAt, reason) => {
    expect(validateReminder(text, scheduleAt, now)).toBe(reason);
  });
});

describe('formatScheduleTime', () => {
  it('M/D (요일) HH:mm', () => {
    expect(formatScheduleTime(local(2026, 10, 11, 14, 30))).toBe('10/11 (일) 14:30');
    expect(formatScheduleTime(local(2026, 1, 3, 9, 5))).toBe('1/3 (토) 09:05');
  });
});

describe('formatRemaining', () => {
  const now = local(2026, 11, 1, 12);
  const after = (minutes, seconds = 0) => new Date(now.getTime() + minutes * 60_000 + seconds * 1000);

  it.each([
    [after(-1), '곧 발송'],
    [after(0, 30), '1분 이내'],
    [after(25), '25분 후'],
    [after(60), '1시간 후'],
    [after(135), '2시간 15분 후'],
    [after(24 * 60), '1일 후'],
    [after(3 * 24 * 60 + 4 * 60 + 59), '3일 4시간 후'],
  ])('%s → %s', (target, expected) => {
    expect(formatRemaining(target, now)).toBe(expected);
  });
});
