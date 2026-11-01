// 화면 로직 순수 함수. 브라우저와 테스트(vitest) 양쪽에서 쓴다.
// 서버 검증 규칙(src/validation.ts)과 같은 기준을 사용한다.

export const MAX_TEXT_LENGTH = 4000;
export const MAX_SCHEDULE_MS = 30 * 24 * 60 * 60 * 1000;

const MINUTE = 60 * 1000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const QUICK_PICKS = [
  { id: '10m', label: '10분 후' },
  { id: '30m', label: '30분 후' },
  { id: '1h', label: '1시간 후' },
  { id: '3h', label: '3시간 후' },
  { id: 'tomorrow9', label: '내일 오전 9시' },
];

/** 빠른 선택 시각. 상대 시간은 분 단위로 내림하고, '내일 오전 9시'는 로컬 시간대 기준이다. */
export function quickPickTime(id, now) {
  const offsets = { '10m': 10, '30m': 30, '1h': 60, '3h': 180 };
  if (id in offsets) {
    const date = new Date(now.getTime() + offsets[id] * MINUTE);
    date.setSeconds(0, 0);
    return date;
  }
  if (id === 'tomorrow9') {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0);
    return date;
  }
  throw new Error(`알 수 없는 빠른 선택: ${id}`);
}

/** 알림 시각 기본값: 지금부터 5분 뒤 (분 단위로 내림) */
export const DEFAULT_OFFSET_MINUTES = 5;

export function defaultScheduleTime(now) {
  const date = new Date(now.getTime() + DEFAULT_OFFSET_MINUTES * MINUTE);
  date.setSeconds(0, 0);
  return date;
}

const pad = (n) => String(n).padStart(2, '0');

/** Date → `datetime-local` 입력 값 (로컬 시간, 분 단위) */
export function toLocalInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `datetime-local` 입력 값 → Date (로컬 시간으로 해석). 비어 있거나 잘못되면 null */
export function fromLocalInputValue(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  // 2월 30일처럼 존재하지 않는 날짜는 다른 날로 넘어가므로 거부한다.
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** 등록할 수 없으면 사유 문구, 가능하면 null */
export function validateReminder(text, scheduleAt, now) {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') return '메시지를 입력하세요';
  if (trimmed.length > MAX_TEXT_LENGTH) return `메시지는 최대 ${MAX_TEXT_LENGTH}자입니다`;
  if (!scheduleAt) return '알림 시각을 선택하세요';
  if (scheduleAt.getTime() <= now.getTime()) return '지난 시각은 예약할 수 없습니다';
  if (scheduleAt.getTime() - now.getTime() > MAX_SCHEDULE_MS) return '30일 이내로만 예약할 수 있습니다';
  return null;
}

/** 예약 시각 표시: `10/12 (일) 14:30` */
export function formatScheduleTime(date) {
  return `${date.getMonth() + 1}/${date.getDate()} (${WEEKDAYS[date.getDay()]}) ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 남은 시간 표시: `1분 이내`, `25분 후`, `2시간 15분 후`, `3일 4시간 후`, 지났으면 `곧 발송` */
export function formatRemaining(target, now) {
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return '곧 발송';
  const minutes = Math.floor(diff / MINUTE);
  if (minutes < 1) return '1분 이내';
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}일 ${hours}시간 후` : `${days}일 후`;
  if (hours > 0) return mins > 0 ? `${hours}시간 ${mins}분 후` : `${hours}시간 후`;
  return `${mins}분 후`;
}
