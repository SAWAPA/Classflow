async function excel() {return (await import('exceljs')).default;}
export async function readScores(file, members, maximum) {
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('นำเข้าคะแนนด้วยไฟล์ .xlsx กรุณาบันทึกไฟล์ .xls เป็น .xlsx ก่อน');
  if (file.size > 5 * 1024 * 1024) throw new Error('ไฟล์คะแนนต้องไม่เกิน 5 MB');
  const Excel = await excel(), book = new Excel.Workbook(); await book.xlsx.load(await file.arrayBuffer());
  const sheet = book.worksheets[0];
  if (!sheet || sheet.rowCount < 2 || sheet.rowCount > 501) throw new Error('ไฟล์ต้องมีหัวตารางและข้อมูล 1–500 แถว');
  const headers = sheet.getRow(1).values.map(v => String(v || '').trim().toLowerCase());
  const idCol = headers.findIndex(v => ['studentid', 'รหัสนักเรียน', 'รหัสนักศึกษา'].includes(v));
  const scoreCol = headers.findIndex(v => ['score', 'คะแนน'].includes(v));
  if (idCol < 1 || scoreCol < 1) throw new Error('ต้องมีหัวคอลัมน์ studentId และ score (ดาวน์โหลดแม่แบบได้)');
  const rows = [], seen = new Set();
  for (let i = 2; i <= sheet.rowCount; i++) {
    const id = sheet.getRow(i).getCell(idCol).value, score = sheet.getRow(i).getCell(scoreCol).value;
    if (id == null && score == null) continue;
    const studentId = typeof id === 'string' || typeof id === 'number' ? String(id).trim() : '';
    const member = members.find(m => m.studentId === studentId); let error = '';
    if (!studentId || !member) error = 'รหัสนักเรียนไม่อยู่ในห้อง';
    else if (seen.has(studentId)) error = 'รหัสซ้ำ';
    else if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > maximum) error = `คะแนนต้องเป็นตัวเลข 0–${maximum} (ไม่รับสูตร)`;
    seen.add(studentId); rows.push({studentId, score, name: member?.name || 'ไม่พบชื่อ', error, row: i});
  }
  if (!rows.length) throw new Error('ไม่มีข้อมูลคะแนนในไฟล์'); return rows;
}
export async function downloadWorkbook(name, sheets) {
  const Excel = await excel(), book = new Excel.Workbook(); book.creator = 'Classflow';
  for (const {title, columns, rows} of sheets) {
    const sheet = book.addWorksheet(title); sheet.columns = columns.map(([header, key, width = 20]) => ({header, key, width}));
    rows.forEach(row => sheet.addRow(row));
    sheet.getRow(1).font = {bold: true, color: {argb: 'FFFFFFFF'}};
    sheet.getRow(1).fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FF123F47'}}; sheet.getRow(1).height = 30;
    sheet.views = [{state: 'frozen', ySplit: 1}]; sheet.autoFilter = {from: 'A1', to: {row: sheet.rowCount, column: columns.length}};
    sheet.eachRow((row, n) => {if (n > 1 && n % 2 === 0) row.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FFF0F7F7'}};});
  }
  const blob = new Blob([await book.xlsx.writeBuffer()], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function templateWorkbook(members) {
  return downloadWorkbook('classflow-score-template.xlsx', [{title: 'Scores', columns: [['studentId', 'studentId'], ['name', 'name', 35], ['score', 'score']], rows: members.filter(m => m.role === 'student').map(m => ({studentId: m.studentId, name: m.name, score: null}))}]);
}
