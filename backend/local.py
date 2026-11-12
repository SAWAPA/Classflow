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
STUDENTS_20 = [
    ('67050001', 'กานต์ธีรา แสงจันทร์', 'student-001', 'student1@example.test'),
    ('67050002', 'ธนกร ใจดี', 'student-002', 'student2@example.test'),
    ('67050003', 'ปวีณา พรหมมา', 'student-003', 'student3@example.test'),
    ('67050004', 'ภูริณัฐ วงศ์ทอง', 'student-004', 'student4@example.test'),
    ('67050005', 'ศศิธร เมฆขาว', 'student-005', 'student5@example.test'),
    ('67050006', 'ณัฐดนัย เกียรติสุข', 'student-006', 'student6@example.test'),
    ('67050007', 'อริสรา มั่นคง', 'student-007', 'student7@example.test'),
    ('67050008', 'กิตติพงศ์ อินทร์แก้ว', 'student-008', 'student8@example.test'),
    ('67050009', 'ชนิกานต์ สุวรรณรัตน์', 'student-009', 'student9@example.test'),
    ('67050010', 'ธนภัทร รัตนวิชัย', 'student-010', 'student10@example.test'),
    ('67050011', 'เบญญาภา รุ่งเรือง', 'student-011', 'student11@example.test'),
    ('67050012', 'ภัทรพล เจริญกุล', 'student-012', 'student12@example.test'),
    ('67050013', 'วริศรา ศรีสุวรรณ', 'student-013', 'student13@example.test'),
    ('67050014', 'สหรัฐ โชคชัย', 'student-014', 'student14@example.test'),
    ('67050015', 'อธิปัตย์ พงษ์สวัสดิ์', 'student-015', 'student15@example.test'),
    ('67050016', 'จิรภัทร ชัยวัฒนา', 'student-016', 'student16@example.test'),
    ('67050017', 'ธนัชชา วงศ์สวัสดิ์', 'student-017', 'student17@example.test'),
    ('67050018', 'พิมพ์พิชชา สุทธิกุล', 'student-018', 'student18@example.test'),
    ('67050019', 'รัชพล ทวีทรัพย์', 'student-019', 'student19@example.test'),
    ('67050020', 'วรเมธ วิริยพาณิชย์', 'student-020', 'student20@example.test'),
]

USERS = [
    {'id': 'teacher-demo', 'name': 'อ.ณัฐวดี ศรีวิชา', 'email': 'teacher@example.test', 'role': 'teacher'},
    {'id': 'newbie-demo', 'name': 'ผู้ใช้ใหม่ (เพิ่งลงทะเบียน)', 'email': 'newbie@example.test', 'role': 'student'},
    {'id': 'admin-demo', 'name': 'ผู้ดูแลระบบ', 'email': 'admin@example.test', 'role': 'admin'},
] + [
    {'id': uid, 'name': name, 'email': email, 'role': 'student'}
    for _, name, uid, email in STUDENTS_20
]


class LocalDirectory:
    def __init__(self, store=None):
        self.db = store

    def get_all_users(self):
        persisted = []
        if self.db:
            persisted = self.db.list('LOCAL_USER#', '')
        all_users = list(USERS)
        for p in persisted:
            if not any(u['id'] == p['id'] or u['email'].lower() == p['email'].lower() for u in all_users):
                all_users.append(p)
        return all_users

    def list_users(self):
        return [{'id': u['id'], 'name': u['name'], 'email': u['email'], 'role': u['role'], 'status': 'CONFIRMED', 'enabled': True} for u in self.get_all_users()]

    def create_user(self, email, name, password, role):
        all_users = self.get_all_users()
        existing = next((u for u in all_users if u['email'].lower() == email.lower()), None)
        if existing:
            return {**existing, 'status': 'CONFIRMED', 'enabled': True}
        user = {'id': 'local-' + secrets.token_hex(6), 'name': name, 'email': email, 'password': password, 'role': role}
        USERS.append(user)
        if self.db:
            self.db.put('LOCAL_USER#' + user['id'], 'META', user)
        return {**user, 'status': 'CONFIRMED', 'enabled': True}

    def set_role(self, user_id, role):
        user = next((u for u in self.get_all_users() if u['id'] == user_id or u['email'] == user_id), None)
        if not user or user['role'] == 'admin':
            raise ValueError('ไม่พบผู้ใช้หรือไม่อนุญาตให้เปลี่ยนยศผู้ดูแล')
        user['role'] = role
        if self.db:
            self.db.put('LOCAL_USER#' + user['id'], 'META', user)
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
app = Classroom(db, files, LocalDirectory(db))


def seed():
    if db.get('SEED', 'VERSION3_STUDENTS20'):
        return
    teacher = USERS[0]
    db.put('U#' + teacher['id'], 'PROFILE', {'role': 'teacher', 'name': teacher['name'], 'roleSelected': True})

    # ค้นหาห้องเรียนทั้งหมดที่มีอยู่ในฐานข้อมูล
    with db.connect() as conn:
        rows = conn.execute("SELECT pk, data FROM records WHERE sk = 'META' AND pk LIKE 'C#%'").fetchall()

    classrooms = []
    for pk, raw in rows:
        cid = pk.removeprefix('C#')
        classrooms.append({'id': cid, **json.loads(raw)})

    # ถ้ายังไม่มีห้องเรียน ให้สร้างห้องเรียนตัวอย่าง
    if not classrooms:
        course = app.run(teacher, 'createClass', {'name': 'Cloud Computing & Virtualization', 'subject': '05506258 · ภาคเรียน 2/2569', 'description': 'สร้างสิ่งที่เป็นไปได้ ด้วยพลังของคลาวด์'})
        classrooms = [course]
        day = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=3)
        app.run(teacher, 'createPost', {'classId': course['id'], 'kind': 'assignment', 'title': 'ออกแบบ Cloud Architecture',
               'description': 'ออกแบบสถาปัตยกรรมสำหรับแอปพลิเคชันของคุณ อธิบาย Data Flow, Security และแผนควบคุมค่าใช้จ่าย ส่งเป็น PDF',
               'dueAt': day.isoformat(), 'maxScore': 100, 'rubric': [{'title': 'ความถูกต้องของสถาปัตยกรรม', 'max': 40}, {'title': 'การออกแบบความปลอดภัย', 'max': 35}, {'title': 'เหตุผลและการนำเสนอ', 'max': 25}]})
        app.run(teacher, 'createPost', {'classId': course['id'], 'kind': 'material', 'title': 'ยินดีต้อนรับสู่ห้องเรียนคลาวด์ ☁',
                'description': 'พื้นที่เรียนรู้ แบ่งปัน และเติบโตไปด้วยกัน อ่านเนื้อหา ติดตามงาน และพูดคุยกับอาจารย์ได้ในที่เดียว'})
        app.run(teacher, 'createExam', {'classId': course['id'], 'title': 'สอบกลางภาค', 'maxScore': 100})

    # บรรจุ Student 20 คนในแต่ละห้องเรียน
    scores_curve = [95, 92, 88, 85, 83, 80, 78, 77, 74, 71, 68, 65, 64, 61, 58, 57, 54, 49, 45, 42]
    for c in classrooms:
        cid = c['id']
        code = c.get('joinCode')
        if not code:
            code = secrets.token_hex(4).upper()
            c['joinCode'] = code
            db.put('C#' + cid, 'META', c)
        db.put('JOIN', code, {'classId': cid})

        existing_members = db.list('C#' + cid, 'MEMBER#')
        existing_uids = {m['userId'] for m in existing_members if m.get('role') == 'student'}
        existing_sids = {m.get('studentId') for m in existing_members if m.get('studentId')}

        for std_id, name, uid, email in STUDENTS_20:
            profile = {
                'id': uid,
                'name': name,
                'email': email,
                'role': 'student',
                'roleSelected': True,
                'studentId': std_id,
            }
            db.put('U#' + uid, 'PROFILE', profile)
            if uid not in existing_uids or std_id not in existing_sids:
                db.put('C#' + cid, 'STUDENT#' + std_id, {'userId': uid})
                db.put('C#' + cid, 'MEMBER#' + uid, {**profile, 'entity': 'member', 'userId': uid})
                db.put('U#' + uid, 'CLASS#' + cid, {'classId': cid})

        posts = db.list('C#' + cid, 'POST#')
        assignments = [p for p in posts if p.get('kind') == 'assignment']
        exams = db.list('C#' + cid, 'EXAM#')

        for a in assignments:
            prior_gb = db.get('C#' + cid, 'GRADE#' + a['id'])
            scores_dict = (prior_gb or {}).get('scores', {})
            for i, (std_id, name, uid, email) in enumerate(STUDENTS_20):
                score = scores_curve[i % len(scores_curve)]
                sub_key = f"SUB#{a['id']}#{uid}"
                if not db.get('C#' + cid, sub_key):
                    db.put('C#' + cid, sub_key, {
                        'entity': 'submission',
                        'postId': a['id'],
                        'userId': uid,
                        'files': [],
                        'comment': f'งานมอบหมายส่งโดย {name}',
                        'submittedAt': now(),
                        'late': i >= 17,
                        'revision': 1
                    })
                scores_dict[uid] = {
                    'score': score,
                    'rubricScores': {},
                    'feedback': 'ตรวจแล้วเรียบร้อย ผลงานยอดเยี่ยม' if score >= 80 else 'ตรวจแล้ว ตั้งใจพัฒนาต่อไป',
                    'gradedAt': now()
                }
            db.put('C#' + cid, 'GRADE#' + a['id'], {
                'entity': 'gradebook',
                'assessmentId': a['id'],
                'scores': scores_dict,
                'updatedAt': now()
            })

        for ex in exams:
            prior_gb = db.get('C#' + cid, 'GRADE#' + ex['id'])
            scores_dict = (prior_gb or {}).get('scores', {})
            for i, (std_id, name, uid, email) in enumerate(STUDENTS_20):
                score = scores_curve[i % len(scores_curve)]
                scores_dict[uid] = {
                    'score': score,
                    'feedback': 'คะแนนสอบกลางภาค',
                    'gradedAt': now()
                }
            db.put('C#' + cid, 'GRADE#' + ex['id'], {
                'entity': 'gradebook',
                'assessmentId': ex['id'],
                'scores': scores_dict,
                'updatedAt': now()
            })

        if assignments or exams:
            try:
                app.run(teacher, 'publishGrades', {'classId': cid})
            except Exception:
                pass

    db.put('SEED', 'VERSION3_STUDENTS20', {'done': True})


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        origin = self.headers.get('Origin', '')
        if origin and (origin in ORIGINS or origin.startswith(('http://localhost:', 'http://127.0.0.1:'))):
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
            if self.path in ('/auth/login', '/login'):
                length = int(self.headers.get('Content-Length', 0))
                body = json.loads(self.rfile.read(length)) if length > 0 else {}
                login_id = (body.get('email') or body.get('username') or '').strip().lower()
                pwd = str(body.get('password') or '').strip()
                users = app.directory.get_all_users() if hasattr(app.directory, 'get_all_users') else USERS
                user = None
                for u in users:
                    if (u.get('email', '').strip().lower() == login_id or
                        u.get('id', '').strip().lower() == login_id or
                        u.get('studentId', '').strip().lower() == login_id):
                        user = u
                        break
                if not user or user.get('password') != pwd:
                    return self.respond(400, {'error': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง (ตัวอย่างรหัสผ่าน: student1234 หรือ teacher1234)'})
                return self.respond(200, {
                    'token': 'dev:' + user['id'],
                    'user': {'id': user['id'], 'name': user['name'], 'email': user['email'], 'role': user['role']}
                })

            if self.path in ('/auth/signup', '/signup'):
                length = int(self.headers.get('Content-Length', 0))
                body = json.loads(self.rfile.read(length)) if length > 0 else {}
                email = body.get('email', '').strip().lower()
                name = body.get('name', '').strip()
                pwd = str(body.get('password') or '').strip()
                if not email or not pwd:
                    return self.respond(400, {'error': 'กรุณากรอกอีเมลและรหัสผ่าน'})
                try:
                    user = app.directory.create_user(email, name or email.split('@')[0], pwd, 'student')
                    db.put('U#' + user['id'], 'PROFILE', {'role': 'student', 'name': user['name'], 'roleSelected': False})
                    return self.respond(200, {
                        'token': 'dev:' + user['id'],
                        'user': {'id': user['id'], 'name': user['name'], 'email': user['email'], 'role': user['role']}
                    })
                except Exception as e:
                    return self.respond(400, {'error': str(e)})

            if self.path != '/rpc':
                return self.respond(404, {'error': 'Not found'})
            token = self.headers.get('Authorization', '').replace('Bearer dev:', '')
            users = app.directory.get_all_users() if hasattr(app.directory, 'get_all_users') else USERS
            user = next((u for u in users if u['id'] == token), None)
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
