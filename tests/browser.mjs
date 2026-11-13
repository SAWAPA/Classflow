// Local-only integration test. Use a Playwright package path when it is supplied by a bundled runtime.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.CLASSFLOW_PLAYWRIGHT || 'playwright');
const Excel = createRequire(path.resolve('frontend/package.json'))('exceljs');
const testPort = process.env.CLASSFLOW_SELF_HOST ? 5180 : 5173;
const apiPort = process.env.CLASSFLOW_SELF_HOST ? 8010 : 8000;
let apiProcess, webProcess;
if (process.env.CLASSFLOW_SELF_HOST) {
  apiProcess = spawn('python', ['-X','utf8','backend/local.py'], {env:{...process.env,CLASSFLOW_LOCAL_PORT:String(apiPort)}, stdio:'inherit'});
  webProcess = spawn(process.execPath, ['frontend/node_modules/vite/bin/vite.js','frontend','--host','127.0.0.1','--port',String(testPort),'--strictPort'], {env:{...process.env,VITE_LOCAL_API_URL:`http://127.0.0.1:${apiPort}`}, stdio:'inherit'});
  process.on('exit',()=>{apiProcess.kill();webProcess.kill();});
  let ready=false;
  for(let i=0;i<60;i++) {try {await Promise.all([fetch(`http://127.0.0.1:${testPort}`),fetch(`http://127.0.0.1:${apiPort}/health`)]);ready=true;break;} catch {await new Promise(r=>setTimeout(r,500));}}
  if(!ready) throw new Error('Local test servers failed to start');
}
const out = path.resolve('build/qa'); await fs.mkdir(out, {recursive: true});
const browser = await chromium.launch({headless: true, ...(process.env.CLASSFLOW_BROWSER ? {executablePath: process.env.CLASSFLOW_BROWSER} : {channel: 'msedge'})});
const context = await browser.newContext({viewport: {width: 1440, height: 1050}, acceptDownloads: true});
const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`http://127.0.0.1:${testPort}/`);
await page.getByRole('button', {name: 'อาจารย์ ดูชั้นเรียน'}).click();
if (await page.getByRole('dialog').count()) {
  await page.getByRole('button', {name: /อาจารย์ \/ ผู้สอน/}).click();
  await page.getByRole('button', {name: 'ยืนยันและเริ่มต้นใช้งาน'}).click();
}
await page.getByRole('heading', {name: /ยินดีต้อนรับ/}).waitFor();
await page.getByRole('heading', {name: 'ห้องเรียนของฉัน'}).waitFor();
await page.getByRole('heading', {name: 'ประกาศล่าสุด'}).waitFor();
await page.getByRole('button', {name: /เปิดห้องเรียน Cloud Computing & Virtualization/}).click();
await page.getByRole('heading', {name: 'Cloud Computing & Virtualization'}).waitFor();
await page.screenshot({path: path.join(out, 'teacher-stream.png'), fullPage: true, animations:'disabled'});
await page.getByRole('button', {name: 'คะแนนและเกรด', exact: true}).last().click();
await page.getByText('92', {exact: true}).first().waitFor();
await page.screenshot({path: path.join(out, 'teacher-dashboard.png'), fullPage: true, animations:'disabled'});
await page.getByRole('button', {name: 'ทดลองตัดเกรด', exact: true}).click();
await page.getByLabel('วิธีตัดเกรด').selectOption('group');
await page.getByText('อิงกลุ่ม · Z-score', {exact: true}).waitFor();
await page.screenshot({path: path.join(out, 'grade-simulation.png'), fullPage: true, animations:'disabled'});
const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', {name: 'Export Excel', exact: true}).click();
const download = await downloadEvent; const reportPath = path.join(out, 'export-report.xlsx'); await download.saveAs(reportPath);
const report = new Excel.Workbook(); await report.xlsx.readFile(reportPath);
assert.equal(report.getWorksheet('Statistics').getCell('B5').value > 0, true);
const response = await fetch(`http://127.0.0.1:${apiPort}/rpc`, {method: 'POST', headers: {'Content-Type':'application/json', Authorization:'Bearer dev:teacher-demo'}, body:JSON.stringify({action:'bootstrap'})});
const {data:boot} = await response.json();
const stateResponse = await fetch(`http://127.0.0.1:${apiPort}/rpc`, {method:'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer dev:teacher-demo'},body:JSON.stringify({action:'getClass',data:{classId:boot.courses[0].id}})});
const {data:state} = await stateResponse.json();
const studentCount = state.members.filter(member => member.role === 'student').length;
assert.equal(report.getWorksheet('Grades').rowCount, studentCount + 1);
const workbook = new Excel.Workbook(), sheet=workbook.addWorksheet('Scores'); sheet.addRow(['studentId','name','score']); state.members.filter(m=>m.role==='student').forEach(m=>sheet.addRow([m.studentId,m.name,82]));
const importPath = path.join(out,'import-fixture.xlsx'); await workbook.xlsx.writeFile(importPath);
await page.getByLabel('นำเข้าคะแนน', {exact:true}).setInputFiles(importPath);
await page.getByRole('heading', {name:/ตรวจสอบก่อนนำเข้า/}).waitFor();
assert.equal(await page.getByText('พร้อมนำเข้า',{exact:true}).count(),studentCount);
await page.getByRole('button',{name:'ปิดตัวอย่างนำเข้า'}).click();
// Separate tab identity, genuine backend isolation: students get only their own grades.
const studentContext=await browser.newContext({viewport:{width:390,height:844}}); const student=await studentContext.newPage(); student.on('pageerror',e=>errors.push(e.message));
await student.goto(`http://127.0.0.1:${testPort}/`); await student.getByRole('button',{name:/นักเรียน · กานต์ธีรา/}).click();
if (await student.getByRole('dialog').count()) {
  await student.getByRole('button', {name: /นักเรียน \/ ผู้เรียน/}).click();
  await student.getByRole('button', {name: 'ยืนยันและเริ่มต้นใช้งาน'}).click();
}
await student.getByRole('heading', {name: /ยินดีต้อนรับ/}).waitFor();
await student.getByRole('heading', {name: 'การบ้านที่ยังไม่ส่ง'}).waitFor();
await student.getByRole('heading', {name: 'ประกาศล่าสุด'}).waitFor();
await student.getByRole('button', {name: /เปิดห้องเรียน Cloud Computing & Virtualization/}).click();
await student.getByRole('heading',{name:'Cloud Computing & Virtualization'}).waitFor();
await student.screenshot({path:path.join(out,'student-mobile.png'),fullPage:true});
await student.getByRole('button',{name:'คะแนนและเกรด',exact:true}).last().click();
await student.getByRole('heading',{name:'คะแนนของคุณ'}).waitFor();
assert.equal(await student.getByText('ธนกร ใจดี',{exact:true}).count(),0);
assert.equal(await student.getByRole('button',{name:'Export Excel',exact:true}).count(),0);
assert.deepEqual(errors,[]);
console.log('PASS: teacher stream/dashboard, live grade simulation, Excel export/reopen, import preview, student mobile and grade privacy.');
await browser.close();
apiProcess?.kill(); webProcess?.kill();
