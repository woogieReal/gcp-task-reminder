// 최소 로그인 화면. task 5에서 예약 화면으로 확장한다.
const $ = (id) => document.getElementById(id);

async function postJson(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

function waitForGoogle() {
  return new Promise((resolve) => {
    const check = () => (window.google?.accounts?.id ? resolve(window.google) : setTimeout(check, 50));
    check();
  });
}

let gsiReady;

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
  const res = await postJson('/auth/google', { credential });
  if (res.status === 204) {
    await render();
    return;
  }
  $('login-error').textContent = res.status === 403 ? '이 계정은 사용할 수 없습니다.' : '로그인에 실패했습니다.';
  $('login-error').hidden = false;
}

async function showLogin() {
  $('session').hidden = true;
  $('login').hidden = false;
  const google = await initGoogle();
  google.accounts.id.renderButton($('gsi-button'), { theme: 'outline', size: 'large', text: 'signin_with' });
}

function showSession(email) {
  $('login').hidden = true;
  $('login-error').hidden = true;
  $('email').textContent = email;
  $('session').hidden = false;
}

async function render() {
  const res = await fetch('/api/me');
  if (res.ok) {
    showSession((await res.json()).email);
  } else {
    await showLogin();
  }
}

$('logout').addEventListener('click', async () => {
  await postJson('/auth/logout');
  window.google?.accounts?.id?.disableAutoSelect();
  await render();
});

render();
