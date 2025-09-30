const state = {
  requestToken: null,
};

const encoder = new TextEncoder();

const getCookie = (name) => {
  const value = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.split('=')[1]) : '';
};

/**
 * 使用浏览器原生API计算HMAC签名
 * @param {string} secret 密钥
 * @param {string} message 签名内容
 * @returns {Promise<string>} 十六进制签名
 */
const hmacHex = async (secret, message) => {
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * 构建包含签名的安全请求头
 * @param {string} method 请求方法
 * @param {string} url 请求地址
 * @param {any} body 请求体
 * @returns {Promise<Record<string, string>>}
 */
const buildSecureHeaders = async (method, url, body) => {
  const timestamp = Date.now().toString();
  const payload = `${method.toUpperCase()}\n${url}\n${timestamp}\n${JSON.stringify(body || {})}`;
  const token = state.requestToken || 'public-demo';
  const signature = await hmacHex(token, payload);
  return {
    'Content-Type': 'application/json',
    'x-request-token': token,
    'x-request-timestamp': timestamp,
    'x-request-sign': signature,
    'x-csrf-token': getCookie('secure_csrf'),
  };
};

const healthButton = document.querySelector('#health-btn');
const healthOutput = document.querySelector('#health-output');
const loginButton = document.querySelector('#login-btn');
const loginOutput = document.querySelector('#login-output');
const screenshotButton = document.querySelector('#screenshot-btn');
const screenshotOutput = document.querySelector('#screenshot-output');

healthButton.addEventListener('click', async () => {
  const response = await fetch('/health');
  const data = await response.json();
  healthOutput.textContent = JSON.stringify(data, null, 2);
});

loginButton.addEventListener('click', async () => {
  const username = document.querySelector('#login-username').value;
  const password = document.querySelector('#login-password').value;
  const response = await fetch('/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-request-timestamp': Date.now().toString(),
      'x-request-sign': 'login-bypass',
      'x-csrf-token': getCookie('secure_csrf'),
    },
    body: JSON.stringify({ username, password }),
    credentials: 'include',
  });
  if (!response.ok) {
    loginOutput.textContent = '登录失败';
    return;
  }
  const result = await response.json();
  state.requestToken = result.data.requestToken;
  loginOutput.textContent = `登录成功，请求令牌：${state.requestToken}`;
});

screenshotButton.addEventListener('click', async () => {
  if (!state.requestToken) {
    screenshotOutput.value = '请先登录获取请求令牌';
    return;
  }
  const body = {
    url: document.querySelector('#screenshot-url').value,
    fullPage: true,
    responseType: 'base64',
  };
  const headers = await buildSecureHeaders('POST', '/screenshot', body);
  const response = await fetch('/screenshot', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    credentials: 'include',
  });
  const result = await response.json();
  screenshotOutput.value = result.success
    ? result.data.image
    : `失败：${result.message}`;
});
