// Run against local demo servers only. CLASSFLOW_PLAYWRIGHT can point to an installed package.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.CLASSFLOW_PLAYWRIGHT || 'playwright');
const selfHost = Boolean(process.env.CLASSFLOW_SELF_HOST);
const apiPort = selfHost ? 8031 : 8010, webPort = selfHost ? 5191 : 5180;
const api = `http://127.0.0.1:${apiPort}/rpc`, site = `http://127.0.0.1:${webPort}`;
async function rpc(token, action, data = {}) {
  const response = await fetch(api, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer dev:' + token}, body: JSON.stringify({action, data})});
  const body = await response.json();
  assert.equal(response.ok, true, body.error);
  return body.data;
}
let browser, apiProcess, webProcess;
try {
  if (selfHost) {
    apiProcess = spawn('python', ['-X', 'utf8', 'backend/local.py'], {env: {...process.env, CLASSFLOW_LOCAL_PORT: String(apiPort)}, stdio: 'inherit'});
    webProcess = spawn(process.execPath, ['frontend/node_modules/vite/bin/vite.js', 'frontend', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {env: {...process.env, VITE_LOCAL_API_URL: `http://127.0.0.1:${apiPort}`}, stdio: 'inherit'});
    let ready = false;
    for (let i = 0; i < 40; i++) {try {await Promise.all([fetch(site), fetch(`http://127.0.0.1:${apiPort}/health`)]); ready = true; break;} catch {await new Promise(resolve => setTimeout(resolve, 250));}}
    assert.equal(ready, true, 'Local demo servers did not start');
  }
  const teacher = (await rpc('teacher-demo', 'bootstrap')).profile;
  const student = (await rpc('student-001', 'bootstrap')).profile;
  const stamp = Date.now();
  browser = await chromium.launch({channel: 'msedge', headless: true});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  const errors = [];
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => sessionStorage.setItem('classflow-session', JSON.stringify({token: 'dev:teacher-demo'})));
  await page.goto(site);
  await page.getByRole('heading', {name: /ยินดีต้อนรับ/}).waitFor();
  const before = (await rpc('teacher-demo', 'listConversations')).find(c => c.peerId === student.id).unreadCount;
  await rpc('student-001', 'sendMessage', {peerId: teacher.id, text: 'Chat QA one ' + stamp});
  await rpc('student-001', 'sendMessage', {peerId: teacher.id, text: 'Chat QA two ' + stamp});
  const event = page.waitForResponse(r => r.url() === api && r.request().postDataJSON()?.action === 'listConversations');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await event;
  await page.getByRole('button', {name: 'การแจ้งเตือน', exact: true}).click();
  const title = `${student.name} ส่งมา ${before + 2} ข้อความ`;
  await page.getByText(title, {exact: true}).waitFor();
  assert.match(await page.locator('.notif-card').first().innerText(), new RegExp(student.name));
  await page.getByText(title, {exact: true}).click();
  await page.bringToFront();
  await page.getByRole('heading', {name: 'ข้อความส่วนตัว', exact: true}).waitFor();
  await page.getByText('Chat QA two ' + stamp, {exact: true}).last().waitFor();
  assert.equal(await page.locator('.course-hero').count(), 0);
  assert.match(await page.locator('.chat-list > button').first().innerText(), new RegExp(student.name));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  for (let i = 0; i < 100; i++) {
    if ((await rpc('teacher-demo', 'listConversations')).find(c => c.peerId === student.id).unreadCount === 0) break;
    if (i === 99) throw new Error('Opening chat did not clear unread count');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await page.getByLabel('ข้อความส่วนตัว', {exact: true}).fill('Teacher reply ' + stamp);
  await page.getByRole('button', {name: 'ส่ง', exact: true}).click();
  await page.getByText('Teacher reply ' + stamp, {exact: true}).last().waitFor();
  assert.equal((await rpc('student-001', 'getMessages', {peerId: teacher.id})).at(-1).text, 'Teacher reply ' + stamp);
  await fs.mkdir('build/qa', {recursive: true});
  await page.screenshot({path: 'build/qa/unified-chat-desktop.png', fullPage: true});
  await page.setViewportSize({width: 390, height: 844});
  await page.screenshot({path: 'build/qa/unified-chat-mobile.png', fullPage: true});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  const studentContext = await browser.newContext({viewport: {width: 390, height: 844}});
  const studentPage = await studentContext.newPage(); studentPage.on('pageerror', e => errors.push(e.message));
  await studentPage.addInitScript(() => sessionStorage.setItem('classflow-session', JSON.stringify({token: 'dev:student-001'})));
  await studentPage.goto(site);
  await studentPage.getByRole('heading', {name: /ยินดีต้อนรับ/}).waitFor();
  await studentPage.getByRole('button', {name: /^ข้อความ/}).first().click();
  await studentPage.getByRole('heading', {name: 'ข้อความส่วนตัว', exact: true}).waitFor();
  await studentPage.locator('.chat-list > button').filter({hasText: teacher.name}).click();
  await studentPage.getByText('Teacher reply ' + stamp, {exact: true}).last().waitFor();
  await studentPage.getByLabel('ข้อความส่วนตัว', {exact: true}).fill('Student reply ' + stamp);
  await studentPage.getByRole('button', {name: 'ส่ง', exact: true}).click();
  await studentPage.getByText('Student reply ' + stamp, {exact: true}).last().waitFor();
  assert.equal((await rpc('teacher-demo', 'getMessages', {peerId: student.id})).at(-1).text, 'Student reply ' + stamp);
  await studentPage.screenshot({path: 'build/qa/unified-chat-student-mobile.png', fullPage: true});
  assert.deepEqual(errors, []);
  console.log('PASS: global chat, unread notification, latest-first ordering, read acknowledgement, reply, mobile layout');
} finally {await browser?.close(); apiProcess?.kill(); webProcess?.kill();}
