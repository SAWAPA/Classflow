import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

function auth() {
  const storage = new Map(), navigation = [], calls = [];
  const context = vm.createContext({
    window: {__CLASSROOM_CONFIG__: {region: 'ap-southeast-2', clientId: 'client', cognitoDomain: 'https://example.auth.ap-southeast-2.amazoncognito.com', googleEnabled: true}, location: {origin: 'https://classflow.example', search: '', assign: url => navigation.push(url)}},
    location: {hostname: 'classflow.example'}, crypto: webcrypto, URLSearchParams, Uint8Array, Date,
    sessionStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)},
    fetch: async (url, options) => {calls.push({url, options}); return {ok: true, json: async () => ({})};},
  });
  const source = readFileSync(new URL('../frontend/src/api.js', import.meta.url), 'utf8').replaceAll('import.meta.env', '({DEV:false})').replaceAll('export ', '');
  vm.runInContext(source + '\nthis.auth = {getGoogleAuthUrl, saveSession, getSession, signOut};', context);
  return {api: context.auth, storage, navigation, calls};
}

test('each Google attempt requests a chooser and a new state even with an old session', () => {
  const {api} = auth();
  api.saveSession({token: 'old'});
  const first = new URL(api.getGoogleAuthUrl()), second = new URL(api.getGoogleAuthUrl());
  assert.equal(first.searchParams.get('prompt'), 'select_account');
  assert.equal(first.searchParams.get('identity_provider'), 'Google');
  assert.notEqual(first.searchParams.get('state'), second.searchParams.get('state'));
  assert.equal(api.getSession(), null);
});

test('logout clears app state, revokes the refresh token and clears the hosted cookie', async () => {
  const {api, storage, navigation, calls} = auth();
  api.saveSession({refreshToken: 'test-refresh'});
  storage.set('classflow-google-state', 'old-state');
  await api.signOut();
  assert.equal(api.getSession(), null);
  assert.equal(storage.has('classflow-google-state'), false);
  assert.equal(JSON.parse(calls[0].options.body).Token, 'test-refresh');
  const logout = new URL(navigation[0]);
  assert.equal(logout.pathname, '/logout');
  assert.equal(logout.searchParams.get('logout_uri'), 'https://classflow.example/');
});
