import {
  defaultScheduleTime,
  formatRemaining,
  formatScheduleTime,
  fromLocalInputValue,
  MAX_SCHEDULE_MS,
  MAX_TEXT_LENGTH,
  QUICK_PICKS,
  quickPickTime,
  toLocalInputValue,
  validateReminder,
} from './time.js';

const $ = (id) => document.getElementById(id);
const els = {
  loginView: $('login-view'),
  appView: $('app-view'),
  gsiButton: $('gsi-button'),
  loginError: $('login-error'),
  email: $('email'),
  logout: $('logout'),
  form: $('reminder-form'),
  text: $('text'),
  textCount: $('text-count'),
  quickPicks: $('quick-picks'),
  scheduleAt: $('schedule-at'),
  reason: $('form-reason'),
  submit: $('submit'),
  refresh: $('refresh'),
  list: $('reminder-list'),
  empty: $('empty'),
  toast: $('toast'),
};

let reminders = [];
let submitting = false;
// 사용자가 알림 시각을 직접 고르거나 빠른 선택을 누르기 전까지는 기본값(지금 + 5분)을 계속 갱신한다.
let scheduleIsDefault = true;

// ---------- API ----------

class AuthError extends Error {}

/** 401이면 로그인 화면으로 전환한다 (세션 만료 대응). */
async function api(method, url, body) {
  const init = { method, headers: {} };
  if (method !== 'GET') {
    // CSRF 방어: 상태를 바꾸는 요청은 JSON이어야 한다.
    init.headers['Content-Type'] = 'application/json';
    if (body !== undefined) init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  if (res.status === 401) {
    showLogin();
    throw new AuthError();
  }
  return res;
}

async function errorMessage(res, fallback) {
  try {
    return (await res.json()).error ?? fallback;
  } catch {
    return fallback;
  }
}

// ---------- 로그인 ----------

let gsiReady;

function waitForGoogle() {
  return new Promise((resolve) => {
    const check = () => (window.google?.accounts?.id ? resolve(window.google) : setTimeout(check, 50));
    check();
  });
}

// GIS는 페이지당 한 번만 초기화한다. 로그아웃 후에는 버튼만 다시 그린다.
function initGoogle() {
  gsiReady ??= (async () => {
    const { googleClientId } = await (await fetch('/api/config')).json();
    const google = await waitForGoogle();
    google.accounts.id.initialize({ client_id: googleClientId, callback: onCredential });
    return google;
  })();
  return gsiReady;
}

async function onCredential({ credential }) {
  const res = await fetch('/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  if (res.status === 204) {
    await start();
    return;
  }
  els.loginError.textContent = res.status === 403 ? '이 계정은 사용할 수 없습니다.' : '로그인에 실패했습니다.';
  els.loginError.hidden = false;
}

async function showLogin() {
  els.appView.hidden = true;
  els.loginView.hidden = false;
  const google = await initGoogle();
  // 표준 버튼과 개인화 버튼이 같은 폭으로 그려지도록 고정한다 (GIS 허용 범위 200~400px).
  const width = Math.max(200, Math.min(400, els.gsiButton.clientWidth || 320));
  google.accounts.id.renderButton(els.gsiButton, {
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    text: 'signin_with',
    width,
  });
}

els.logout.addEventListener('click', async () => {
  await api('POST', '/auth/logout').catch(() => {});
  window.google?.accounts?.id?.disableAutoSelect();
  await showLogin();
});

// ---------- 등록 폼 ----------

function renderQuickPicks() {
  for (const pick of QUICK_PICKS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--chip';
    button.textContent = pick.label;
    button.dataset.pick = pick.id;
    button.addEventListener('click', () => {
      els.scheduleAt.value = toLocalInputValue(quickPickTime(pick.id, new Date()));
      scheduleIsDefault = false;
      updateForm();
    });
    els.quickPicks.append(button);
  }
}

function applyDefaultSchedule() {
  els.scheduleAt.value = toLocalInputValue(defaultScheduleTime(new Date()));
  scheduleIsDefault = true;
}

/** 기본값 상태이고 입력칸을 편집 중이 아닐 때만 기본값을 현재 기준으로 다시 맞춘다. */
function refreshDefaultSchedule() {
  if (scheduleIsDefault && document.activeElement !== els.scheduleAt) applyDefaultSchedule();
}

// 날짜 선택기에서 고를 수 있는 범위를 안내한다 (최종 검증은 validateReminder).
// 입력 중에 min/max를 바꾸면 Chrome이 편집 중인 칸(분 등)을 확정해 버려 두 자리 입력이 끊기므로,
// 포커스가 들어올 때만 갱신한다.
function updateScheduleRange() {
  const now = new Date();
  els.scheduleAt.min = toLocalInputValue(now);
  els.scheduleAt.max = toLocalInputValue(new Date(now.getTime() + MAX_SCHEDULE_MS));
}

function updateForm() {
  const now = new Date();
  els.textCount.textContent = `${els.text.value.trim().length} / ${MAX_TEXT_LENGTH}`;

  const reason = validateReminder(els.text.value, fromLocalInputValue(els.scheduleAt.value), now);
  els.reason.textContent = reason ?? '';
  els.submit.disabled = submitting || reason !== null;
}

els.text.addEventListener('input', updateForm);
els.scheduleAt.addEventListener('input', () => {
  scheduleIsDefault = false;
  updateForm();
});
els.scheduleAt.addEventListener('change', updateForm);
els.scheduleAt.addEventListener('focus', updateScheduleRange);

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const scheduleAt = fromLocalInputValue(els.scheduleAt.value);
  if (submitting || validateReminder(els.text.value, scheduleAt, new Date()) !== null) return;

  submitting = true;
  updateForm();
  try {
    const res = await api('POST', '/api/reminders', {
      text: els.text.value.trim(),
      scheduleAt: scheduleAt.toISOString(),
    });
    if (res.status !== 201) {
      showToast(await errorMessage(res, '예약에 실패했습니다.'), true);
      return;
    }
    const created = await res.json();
    els.form.reset();
    applyDefaultSchedule();
    showToast(`${formatScheduleTime(new Date(created.scheduleAt))}에 알려드릴게요.`);
    await loadReminders();
  } catch (err) {
    if (!(err instanceof AuthError)) showToast('네트워크 오류로 예약하지 못했습니다.', true);
  } finally {
    submitting = false;
    updateForm();
  }
});

// ---------- 예약 목록 ----------

async function loadReminders() {
  els.refresh.disabled = true;
  try {
    const res = await api('GET', '/api/reminders');
    if (!res.ok) {
      showToast(await errorMessage(res, '목록을 불러오지 못했습니다.'), true);
      return;
    }
    reminders = await res.json();
    renderReminders();
  } catch (err) {
    if (!(err instanceof AuthError)) showToast('네트워크 오류로 목록을 불러오지 못했습니다.', true);
  } finally {
    els.refresh.disabled = false;
  }
}

function renderReminders() {
  const now = new Date();
  els.list.replaceChildren(...reminders.map((reminder) => renderItem(reminder, now)));
  els.empty.hidden = reminders.length > 0;
}

// 사용자 입력은 textContent로만 넣는다 (HTML로 해석되지 않게).
function renderItem(reminder, now) {
  const at = new Date(reminder.scheduleAt);
  const li = document.createElement('li');
  li.className = 'reminder';

  const body = document.createElement('div');
  body.className = 'reminder__body';

  const text = document.createElement('p');
  text.className = 'reminder__text';
  text.textContent = reminder.text;

  const meta = document.createElement('p');
  meta.className = 'reminder__meta';
  const time = document.createElement('time');
  time.dateTime = reminder.scheduleAt;
  time.textContent = formatScheduleTime(at);
  const remaining = document.createElement('span');
  remaining.className = 'reminder__remaining';
  remaining.dataset.at = reminder.scheduleAt;
  remaining.textContent = formatRemaining(at, now);
  meta.append(time, remaining);

  body.append(text, meta);

  if (reminder.attempts > 0) {
    const retry = document.createElement('p');
    retry.className = 'reminder__retry';
    retry.textContent = `재시도 중 · ${reminder.attempts}회 시도${reminder.lastError ? ` (${reminder.lastError})` : ''}`;
    body.append(retry);
  }

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn--danger btn--small';
  cancel.textContent = '취소';
  cancel.setAttribute('aria-label', `${formatScheduleTime(at)} 예약 취소`);
  cancel.addEventListener('click', () => cancelReminder(reminder, cancel));

  li.append(body, cancel);
  return li;
}

async function cancelReminder(reminder, button) {
  const preview = reminder.text.length > 30 ? `${reminder.text.slice(0, 30)}…` : reminder.text;
  if (!window.confirm(`"${preview}" 예약을 취소할까요?`)) return;

  button.disabled = true;
  try {
    const res = await api('DELETE', `/api/reminders/${encodeURIComponent(reminder.id)}`);
    if (res.status === 204) {
      showToast('예약을 취소했습니다.');
    } else if (res.status === 404) {
      showToast('이미 발송되었거나 없는 예약입니다.', true);
    } else {
      showToast(await errorMessage(res, '취소하지 못했습니다.'), true);
    }
    await loadReminders();
  } catch (err) {
    if (!(err instanceof AuthError)) showToast('네트워크 오류로 취소하지 못했습니다.', true);
    button.disabled = false;
  }
}

/** 남은 시간 표시와 폼 검증(현재 시각 기준)을 다시 계산한다. */
function tick() {
  const now = new Date();
  for (const span of els.list.querySelectorAll('.reminder__remaining')) {
    span.textContent = formatRemaining(new Date(span.dataset.at), now);
  }
  refreshDefaultSchedule();
  updateForm();
}

els.refresh.addEventListener('click', loadReminders);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !els.appView.hidden) {
    tick();
    loadReminders();
  }
});

// ---------- 공통 ----------

let toastTimer;
function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle('toast--error', isError);
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 3500);
}

async function start() {
  const res = await fetch('/api/me');
  if (!res.ok) {
    await showLogin();
    return;
  }
  els.email.textContent = (await res.json()).email;
  els.loginView.hidden = true;
  els.loginError.hidden = true;
  els.appView.hidden = false;
  applyDefaultSchedule();
  updateScheduleRange();
  updateForm();
  await loadReminders();
}

renderQuickPicks();
setInterval(tick, 30_000);
start();
