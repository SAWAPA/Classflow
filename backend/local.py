"""Local development ONLY. Demo identities are never enabled in AWS Lambda."""
import datetime as dt
import json
import os
from pathlib import Path
import secrets
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from service import Classroom, clean, now
from store import LocalStore

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / '.local'
DATA.mkdir(exist_ok=True)
ORIGINS = {'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5180', 'http://127.0.0.1:5180'}
USERS = [
    {'id': 'teacher-demo', 'name': 'อ.ณัฐวดี ศรีวิชา', 'email': 'teacher@example.test', 'role': 'teacher'},
    {'id': 'student-001', 'name': 'กานต์ธีรา แสงจันทร์', 'email': 'student@example.test', 'role': 'student'},
    {'id': 'student-002', 'name': 'ธนกร ใจดี', 'email': 'student2@example.test', 'role': 'student'},
    {'id': 'admin-demo', 'name': 'ผู้ดูแลระบบ', 'email': 'admin@example.test', 'role': 'admin'},
]


class LocalDirectory:
    def list_users(self):
        return [{'id': u['id'], 'name': u['name'], 'email': u['email'], 'role': u['role'], 'status': 'CONFIRMED', 'enabled': True} for u in USERS]

    def create_user(self, email, name, password, role):
        if any(u['email'].lower() == email.lower() for u in USERS):
            raise ValueError('อีเมลนี้มีบัญชีอยู่แล้ว')
        user = {'id': 'local-' + secrets.token_hex(6), 'name': name, 'email': email, 'role': role}
        USERS.append(user)
        return {**user, 'status': 'CONFIRMED', 'enabled': True}

    def set_role(self, user_id, role):
        user = next((u for u in USERS if u['id'] == user_id), None)
        if not user or user['role'] == 'admin':
            raise ValueError('ไม่พบผู้ใช้หรือไม่อนุญาตให้เปลี่ยนยศผู้ดูแล')
        user['role'] = role
        return {**user, 'status': 'CONFIRMED', 'enabled': True}


class LocalFiles:
    def __init__(self):
        self.tickets = {}

    def prepare(self, file):
        token = secrets.token_urlsafe(32)
        self.tickets[token] = {'file': file, 'expires': time.time() + 300, 'mode': 'upload'}
        return {'url': 'http://127.0.0.1:' + os.environ.get('CLASSFLOW_LOCAL_PORT', '8000') + '/files/' + token, 'local': True}

    def verify(self, file):
        path = DATA / 'files' / file['id']
        if not path.exists() or path.stat().st_size != file['size']:
            raise ValueError('ไฟล์ยังอัปโหลดไม่ครบ')

    def download(self, file):
        token = secrets.token_urlsafe(32)
        self.tickets[token] = {'file': file, 'expires': time.time() + 60, 'mode': 'download'}
        return 'http://127.0.0.1:' + os.environ.get('CLASSFLOW_LOCAL_PORT', '8000') + '/files/' + token


files = LocalFiles()
db = LocalStore(DATA / 'classroom.sqlite3')
app = Classroom(db, files, LocalDirectory())


def seed():
    if db.get('SEED', 'VERSION2'):
        return
    teacher = USERS[0]
    course = app.run(teacher, 'createClass', {'name': 'Cloud Computing & Virtualization', 'subject': '05506258 · ภาคเรียน 2/2569', 'description': 'สร้างสิ่งที่เป็นไปได้ ด้วยพลังของคลาวด์'})
    cid = course['id']
    names = ['กานต์ธีรา แสงจันทร์', 'ธนกร ใจดี', 'ปวีณา พรหมมา', 'ภูริณัฐ วงศ์ทอง', 'ศศิธร เมฆขาว', 'ณัฐดนัย เกียรติสุข', 'อริสรา มั่นคง', 'กิตติพงศ์ อินทร์แก้ว']
    for i, name in enumerate(names, 1):
        user = USERS[i] if i <= 2 else {'id': f'student-{i:03}', 'name': name, 'email': f'student{i}@example.test', 'role': 'student'}
        app.run(user, 'updateProfile', {'name': name, 'studentId': f'670500{i:02}'})
        app.run(user, 'joinClass', {'code': course['joinCode']})
    day = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=3)
    post = app.run(teacher, 'createPost', {'classId': cid, 'kind': 'assignment', 'title': 'ออกแบบ Cloud Architecture',
           'description': 'ออกแบบสถาปัตยกรรมสำหรับแอปพลิเคชันของคุณ อธิบาย Data Flow, Security และแผนควบคุมค่าใช้จ่าย ส่งเป็น PDF',
           'dueAt': day.isoformat(), 'maxScore': 100, 'rubric': [{'title': 'ความถูกต้องของสถาปัตยกรรม', 'max': 40}, {'title': 'การออกแบบความปลอดภัย', 'max': 35}, {'title': 'เหตุผลและการนำเสนอ', 'max': 25}]})
    app.run(teacher, 'createPost', {'classId': cid, 'kind': 'material', 'title': 'ยินดีต้อนรับสู่ห้องเรียนคลาวด์ ☁',
            'description': 'พื้นที่เรียนรู้ แบ่งปัน และเติบโตไปด้วยกัน อ่านเนื้อหา ติดตามงาน และพูดคุยกับอาจารย์ได้ในที่เดียว'})
    exam = app.run(teacher, 'createExam', {'classId': cid, 'title': 'สอบกลางภาค', 'maxScore': 100})
    for i, score in enumerate([92, 88, 83, 77, 71, 64, 57, 42], 1):
        uid = f'student-{i:03}'
        db.put('C#' + cid, f"SUB#{post['id']}#{uid}", {'entity': 'submission', 'postId': post['id'], 'userId': uid, 'files': [], 'comment': 'ข้อมูลตัวอย่างสำหรับสาธิต', 'submittedAt': now(), 'late': i == 8, 'revision': 1})
        for assessment in [post, exam]:
            prior = db.get('C#' + cid, 'GRADE#' + assessment['id'])
            app.run(teacher, 'grade', {'classId': cid, 'assessmentId': assessment['id'], 'userId': uid, 'score': score,
                    'rubricScores': {'0': score * .4, '1': score * .35, '2': score * .25} if assessment == post else {},
                    'feedback': 'ตรวจแล้ว ขอบคุณสำหรับความตั้งใจ', 'expectedVersion': prior['_version'] if prior else 0})
    app.run(teacher, 'publishGrades', {'classId': cid})
    db.put('SEED', 'VERSION2', {'done': True})


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        origin = self.headers.get('Origin', '')
        if origin in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Headers', 'Authorization,Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'POST,PUT,GET,OPTIONS')

    def respond(self, status, data):
        payload = json.dumps(data, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(status)
        self.cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.respond(200, {})

    def do_POST(self):
        try:
            if self.path != '/rpc':
                return self.respond(404, {'error': 'Not found'})
            token = self.headers.get('Authorization', '').replace('Bearer dev:', '')
            user = next((u for u in USERS if u['id'] == token), None)
            if not user:
                raise PermissionError('เลือกบัญชีสาธิตก่อนใช้งาน')
            length = int(self.headers.get('Content-Length', 0))
            if length > 250000:
                raise ValueError('คำขอใหญ่เกินไป')
            body = json.loads(self.rfile.read(length))
            self.respond(200, {'data': clean(app.run(user, body['action'], body.get('data') or {}))})
        except PermissionError as error:
            self.respond(403, {'error': str(error)})
        except (ValueError, KeyError, TypeError) as error:
            self.respond(400, {'error': str(error)})
        except Exception:
            import traceback
            traceback.print_exc()
            self.respond(500, {'error': 'Local server error'})

    def ticket(self, mode):
        token = urlparse(self.path).path.removeprefix('/files/')
        ticket = files.tickets.get(token)
        if not ticket or ticket['mode'] != mode or ticket['expires'] < time.time():
            raise PermissionError('ลิงก์ไฟล์หมดอายุ')
        return ticket

    def do_PUT(self):
        try:
            ticket = self.ticket('upload')
            size = int(self.headers.get('Content-Length', 0))
            if size != ticket['file']['size'] or size > 25 * 1024 * 1024:
                raise ValueError('ขนาดไฟล์ไม่ตรง')
            content = self.rfile.read(size)
            if len(content) != size:
                raise ValueError('ไฟล์ไม่ครบ')
            (DATA / 'files').mkdir(exist_ok=True)
            (DATA / 'files' / ticket['file']['id']).write_bytes(content)
            ticket['expires'] = 0
            self.respond(200, {'ok': True})
        except (ValueError, PermissionError) as error:
            self.respond(400, {'error': str(error)})

    def do_GET(self):
        try:
            if self.path == '/health':
                return self.respond(200, {'status': 'ok', 'mode': 'local-demo'})
            ticket = self.ticket('download')
            content = (DATA / 'files' / ticket['file']['id']).read_bytes()
            from urllib.parse import quote
            self.send_response(200)
            self.cors()
            self.send_header('Content-Type', ticket['file']['mime'])
            self.send_header('Content-Disposition', "attachment; filename*=UTF-8''" + quote(ticket['file']['filename']))
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except (PermissionError, OSError) as error:
            self.respond(403, {'error': str(error)})


if __name__ == '__main__':
    seed()
    port = int(os.environ.get('CLASSFLOW_LOCAL_PORT', '8000'))
    print(f'Classroom local API: http://127.0.0.1:{port} (demo identities only)', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()

