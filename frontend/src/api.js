export const config = window.__CLASSROOM_CONFIG__ || {};
export const isLocal = import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(location.hostname);
const key = 'classflow-session';
export const getSession = () => { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } };
export const saveSession = value => value ? sessionStorage.setItem(key, JSON.stringify(value)) : sessionStorage.removeItem(key);
export async function cognito(action, body) {
  if (!config.clientId || !config.region) throw new Error('ยังไม่ได้ตั้งค่า AWS ของ Classroom กรุณา deploy สแตกใหม่ก่อน');
  const response = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {method: 'POST', headers: {
    'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}`
  }, body: JSON.stringify({ClientId: config.clientId, ...body})});
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'ไม่สามารถยืนยันตัวตนได้');
  return result;
}
export async function rpc(action, data = {}) {
  let session = getSession();
  if (!session) throw new Error('กรุณาเข้าสู่ระบบ');
  if (!isLocal && session.expiresAt < Date.now() + 30000) {
    try {
      const result = await cognito('InitiateAuth', {AuthFlow: 'REFRESH_TOKEN_AUTH', AuthParameters: {REFRESH_TOKEN: session.refreshToken}});
      session = {...session, token: result.AuthenticationResult.IdToken, expiresAt: Date.now() + result.AuthenticationResult.ExpiresIn * 1000}; saveSession(session);
    } catch {saveSession(null); window.dispatchEvent(new Event('classflow-signed-out')); throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');}
  }
  const base = isLocal ? (import.meta.env.VITE_LOCAL_API_URL || 'http://127.0.0.1:8000') : config.apiUrl;
  if (!base) throw new Error('ยังไม่ได้ตั้งค่า API ของ Classroom');
  const response = await fetch(base.replace(/\/$/, '') + '/rpc', {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + session.token}, body: JSON.stringify({action, data})});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `เกิดข้อผิดพลาด (${response.status})`);
  return result.data;
}
export const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.csv,.txt';
export async function uploadFile(classId, entityId, context, file) {
  if (file.size > 25 * 1024 * 1024) throw new Error('ไฟล์ต้องไม่เกิน 25 MB');
  const result = await rpc('initUpload', {classId, entityId, context, filename: file.name, size: file.size});
  let request;
  if (result.upload.local) request = await fetch(result.upload.url, {method: 'PUT', body: file});
  else {const form = new FormData(); Object.entries(result.upload.fields).forEach(([k, v]) => form.append(k, v)); form.append('file', file); request = await fetch(result.upload.url, {method: 'POST', body: form});}
  if (!request.ok) throw new Error(`อัปโหลด ${file.name} ไม่สำเร็จ`);
  return rpc('completeUpload', {classId, fileId: result.file.id});
}
export async function openFile(classId, fileId) {
  const {url} = await rpc('downloadFile', {classId, fileId});
  const link = document.createElement('a'); link.href = url; link.rel = 'noopener noreferrer'; link.target = '_blank'; link.click();
}

export function getGoogleAuthUrl() {
  const domain = config.cognitoDomain || import.meta.env.VITE_COGNITO_DOMAIN;
  if (!domain || !config.clientId || config.googleEnabled === false || config.googleEnabled === 'false')
    return null;
  const state = crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem('classflow-google-state', state);
  const redirectUri = window.location.origin + '/';
  const query = new URLSearchParams({identity_provider: 'Google', client_id: config.clientId, response_type: 'code', scope: 'email openid profile', redirect_uri: redirectUri, state});
  return `${domain.replace(/\/$/, '')}/oauth2/authorize?${query.toString()}`;
}

export async function exchangeGoogleCode() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return null;
  const expectedState = sessionStorage.getItem('classflow-google-state');
  if (!expectedState || params.get('state') !== expectedState) {
    sessionStorage.removeItem('classflow-google-state');
    throw new Error('การยืนยัน Google Login ไม่ถูกต้อง กรุณาลองใหม่');
  }
  sessionStorage.removeItem('classflow-google-state');
  const domain = config.cognitoDomain || import.meta.env.VITE_COGNITO_DOMAIN;
  if (!domain || !config.clientId) throw new Error('ยังไม่ได้ตั้งค่า Google Login บน AWS');
  const response = await fetch(`${domain.replace(/\/$/, '')}/oauth2/token`, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type: 'authorization_code', client_id: config.clientId, code, redirect_uri: window.location.origin + '/'})});
  const result = await response.json();
  if (!response.ok || !result.id_token) throw new Error(result.error_description || result.error || 'Google Login ไม่สำเร็จ');
  return {token: result.id_token, refreshToken: result.refresh_token, expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000};
}
