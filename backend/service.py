import copy
import json
import datetime as dt
import secrets
import uuid
from pathlib import Path

from domain import DEFAULT_GRADING, build_report, numeric, validate_grading

MIME = {'.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.txt': 'text/plain', '.csv': 'text/csv'}


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def ident():
    return uuid.uuid4().hex


def text(value, maximum=2000, required=True):
    value = str(value or '').strip()
    if len(value) > maximum or (required and not value):
        raise ValueError(f'ข้อความต้องมีความยาว 1–{maximum} ตัวอักษร')
    return value


def clean(value):
    if isinstance(value, list):
        return [clean(v) for v in value]
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items() if not k.startswith('_')}
    return value


class Classroom:
    def __init__(self, store, files, directory=None):
        self.db, self.files, self.directory = store, files, directory

    def admin_only(self, user):
        if user.get('role') != 'admin' or self.directory is None:
            raise PermissionError('เฉพาะผู้ดูแลระบบเท่านั้น')

    def admin_create_user(self, user, data):
        self.admin_only(user)
        email = text(data.get('email'), 254)
        if '@' not in email or email.startswith('@') or email.endswith('@'):
            raise ValueError('อีเมลไม่ถูกต้อง')
        name = text(data.get('name'), 120)
        password = str(data.get('password') or '')
        if len(password) < 8 or len(password) > 128 or not any(c.islower() for c in password) or not any(c.isdigit() for c in password):
            raise ValueError('รหัสผ่านต้องยาวอย่างน้อย 8 ตัว มีตัวพิมพ์เล็กและตัวเลข ตามกติกา Cognito')
        role = data.get('role', 'student')
        if role not in ('admin', 'teacher', 'student'):
            raise ValueError('กำหนดยศได้เฉพาะผู้ดูแลระบบ ครู หรือนักเรียน')
        return self.directory.create_user(email, name, password, role)

    def profile(self, user):
        prior = self.db.get('U#' + user['id'], 'PROFILE') or {}
        role = user.get('role') if user.get('role') == 'admin' else (prior.get('role') or user.get('role', 'student'))
        role_selected = bool(prior.get('roleSelected'))
        return {**prior, **user, 'role': role, 'roleSelected': role_selected,
                'name': prior.get('name') or user.get('name', 'สมาชิก'),
                'studentId': prior.get('studentId', '')}

    def access(self, user, cid, teacher=False):
        course = self.db.get('C#' + cid, 'META')
        membership = self.db.get('C#' + cid, 'MEMBER#' + user['id'])
        if not course or not membership or (teacher and course['ownerId'] != user['id']):
            raise PermissionError('คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้')
        return course, membership

    def snapshot(self, user, cid):
        course, member = self.access(user, cid)
        # Never load private chat history or abandoned file tickets into class snapshots.
        rows = []
        for prefix in ('POST#', 'MEMBER#', 'SUB#', 'GRADE#', 'EXAM#', 'COMMENT#'):
            rows.extend(self.db.list('C#' + cid, prefix))
        published = self.db.get('C#' + cid, 'PUBLISHED')
        if published:
            rows.append(published)
        teacher = course['ownerId'] == user['id']
        posts = sorted([r for r in rows if r.get('entity') == 'post'], key=lambda r: r['createdAt'], reverse=True)
        students = [r for r in rows if r.get('entity') == 'member']
        submissions = [r for r in rows if r.get('entity') == 'submission' and (teacher or r['userId'] == user['id'])]
        gradebooks = {r['assessmentId']: r['scores'] if teacher else {user['id']: r['scores'][user['id']]} if user['id'] in r['scores'] else {} for r in rows if r.get('entity') == 'gradebook'}
        publication = next((r for r in rows if r.get('entity') == 'publication'), None)
        if publication and not teacher:
            publication = {'publishedAt': publication['publishedAt'], 'rows': [r for r in publication['rows'] if r['userId'] == user['id']]}
        if not teacher:
            students = [r for r in students if r['userId'] in (user['id'], course['ownerId'])]
            course = {k: v for k, v in course.items() if k not in ('joinCode', 'grading')}
        course['version'] = course.get('_version', 0)
        return {'course': course, 'membership': member, 'posts': posts, 'members': students, 'submissions': submissions,
                'exams': [r for r in rows if r.get('entity') == 'exam'], 'gradebooks': gradebooks,
                'comments': sorted([r for r in rows if r.get('entity') == 'comment'], key=lambda r: r['createdAt']),
                'publication': publication, 'gradebookVersions': {r['assessmentId']: r['_version'] for r in rows if r.get('entity') == 'gradebook'}}

    def report(self, user, cid, config=None):
        state = self.snapshot(user, cid)
        self.access(user, cid, True)
        return build_report(state['members'], state['posts'], state['exams'], state['gradebooks'],
                            {f"{s['postId']}#{s['userId']}": s for s in state['submissions']}, config or state['course']['grading'])

    def run(self, user, action, data):
        profile = self.profile(user)
        uid = user['id']
        if user.get('role') != 'admin' and profile.get('role'):
            user = {**user, 'role': profile['role']}
        if action == 'bootstrap':
            links = self.db.list('U#' + uid, 'CLASS#')
            courses = [self.db.get('C#' + l['classId'], 'META') for l in links]
            return {'profile': profile, 'courses': [{k: v for k, v in c.items() if k != 'grading'} for c in courses if c]}
        if action == 'selectRole':
            if user.get('role') == 'admin':
                raise PermissionError('ผู้ดูแลระบบไม่สามารถเปลี่ยนบทบาทได้')
            role = data.get('role')
            if role not in ('teacher', 'student'):
                raise ValueError('กรุณาเลือกระหว่างอาจารย์หรือนักเรียน')
            if self.db.list('U#' + uid, 'CLASS#'):
                raise ValueError('ไม่สามารถเปลี่ยนบทบาทได้หลังจากมีห้องเรียนแล้ว')
            student_id = text(data.get('studentId'), 32, False) if role == 'student' else ''
            name = text(data.get('name'), 120, False) or profile.get('name') or user.get('name')
            new_profile = {**profile, 'role': role, 'roleSelected': True, 'name': name, 'studentId': student_id}
            self.db.put('U#' + uid, 'PROFILE', new_profile)
            if self.directory:
                try:
                    target_id = user.get('email') or user.get('username') or uid
                    self.directory.set_role(target_id, role)
                except Exception:
                    pass
            return new_profile
        if action == 'updateProfile':
            student_id = text(data.get('studentId'), 32, False)
            if student_id != profile['studentId'] and self.db.list('U#' + uid, 'CLASS#'):
                raise ValueError('แก้รหัสนักเรียนหลังเข้าห้องเรียนไม่ได้ กรุณาติดต่อครู')
            return self.db.put('U#' + uid, 'PROFILE', {**profile, 'name': text(data.get('name'), 120), 'studentId': student_id})
        if action == 'adminListUsers':
            self.admin_only(user)
            return self.directory.list_users()
        if action == 'adminCreateUser':
            return self.admin_create_user(user, data)
        if action == 'adminSetUserRole':
            self.admin_only(user)
            target = text(data.get('userId'), 254)
            role = data.get('role')
            if role not in ('admin', 'teacher', 'student'):
                raise ValueError('กำหนดยศได้เฉพาะผู้ดูแลระบบ ครู หรือนักเรียน')
            return self.directory.set_role(target, role)
        if action == 'createClass':
            if user['role'] != 'teacher':
                raise PermissionError('เฉพาะครูเท่านั้นที่สร้างห้องเรียนได้')
            cid, code = ident(), secrets.token_hex(4).upper()
            course = {'id': cid, 'entity': 'class', 'name': text(data.get('name'), 100), 'subject': text(data.get('subject'), 100),
                      'description': text(data.get('description'), 500, False), 'ownerId': uid, 'teacherName': profile['name'],
                      'joinCode': code, 'createdAt': now(), 'grading': copy.deepcopy(DEFAULT_GRADING)}
            self.db.put('JOIN', code, {'classId': cid}, expected=0)
            self.db.put('C#' + cid, 'META', course, expected=0)
            self.db.put('C#' + cid, 'MEMBER#' + uid, {**profile, 'entity': 'member', 'userId': uid}, expected=0)
            self.db.put('U#' + uid, 'CLASS#' + cid, {'classId': cid}, expected=0)
            return course
        if action == 'joinClass':
            if user['role'] != 'student' or not profile['studentId']:
                raise ValueError('กรุณากำหนดชื่อและรหัสนักเรียนในโปรไฟล์ก่อนเข้าห้องเรียน')
            link = self.db.get('JOIN', text(data.get('code'), 20).upper())
            if not link:
                raise ValueError('ไม่พบรหัสเข้าห้องเรียนนี้')
            cid = link['classId']
            existing = self.db.list('C#' + cid, 'MEMBER#')
            if any(m.get('studentId') == profile['studentId'] and m['userId'] != uid for m in existing):
                raise ValueError('รหัสนักเรียนนี้มีอยู่แล้วในห้องเรียน กรุณาติดต่อครู')
            # Reserve the student identifier atomically before creating membership.
            reservation = self.db.get('C#' + cid, 'STUDENT#' + profile['studentId'])
            if reservation and reservation['userId'] != uid:
                raise ValueError('รหัสนักเรียนนี้ถูกใช้งานแล้ว')
            if not reservation:
                self.db.put('C#' + cid, 'STUDENT#' + profile['studentId'], {'userId': uid}, expected=0)
            self.db.put('C#' + cid, 'MEMBER#' + uid, {**profile, 'entity': 'member', 'userId': uid})
            self.db.put('U#' + uid, 'CLASS#' + cid, {'classId': cid})
            return {'classId': cid}
        cid = text(data.get('classId'), 64)
        course, membership = self.access(user, cid)
        pk = 'C#' + cid
        teacher = course['ownerId'] == uid
        if action == 'getClass':
            return self.snapshot(user, cid)
        if action == 'createPost':
            self.access(user, cid, True)
            kind = data.get('kind')
            if kind not in ('assignment', 'material'):
                raise ValueError('ประเภทโพสต์ไม่ถูกต้อง')
            pid = data.get('id') or ident()
            post = {'entity': 'post', 'id': text(pid, 64), 'kind': kind, 'title': text(data.get('title'), 150),
                    'description': text(data.get('description'), 8000, False), 'createdAt': now(), 'authorName': profile['name'], 'files': []}
            if kind == 'assignment':
                due = dt.datetime.fromisoformat(str(data.get('dueAt', '')).replace('Z', '+00:00'))
                if due.tzinfo is None or due <= dt.datetime.now(dt.timezone.utc):
                    raise ValueError('กำหนดส่งต้องเป็นเวลาในอนาคตและมี timezone')
                rubric = data.get('rubric') or []
                if len(rubric) > 12:
                    raise ValueError('Rubric สูงสุด 12 หัวข้อ')
                rubric = [{'id': str(i), 'title': text(r.get('title'), 100), 'max': numeric(r.get('max'), 1, 1000)} for i, r in enumerate(rubric)]
                maximum = numeric(data.get('maxScore'), 1, 1000)
                if rubric and abs(sum(r['max'] for r in rubric) - maximum) > .0001:
                    raise ValueError('คะแนน Rubric รวมต้องเท่ากับคะแนนเต็ม')
                post.update(dueAt=due.astimezone(dt.timezone.utc).isoformat().replace('+00:00', 'Z'), maxScore=maximum, rubric=rubric)
            return self.db.put(pk, 'POST#' + pid, post, expected=0)
        if action == 'comment':
            post = self.db.get(pk, 'POST#' + text(data.get('postId'), 64))
            if not post:
                raise ValueError('ไม่พบโพสต์')
            comment = {'entity': 'comment', 'id': ident(), 'postId': post['id'], 'text': text(data.get('text')), 'authorId': uid, 'authorName': profile['name'], 'createdAt': now()}
            return self.db.put(pk, 'COMMENT#' + comment['id'], comment, expected=0)
        if action == 'submit':
            post = self.db.get(pk, 'POST#' + text(data.get('postId'), 64))
            if teacher or not post or post['kind'] != 'assignment':
                raise PermissionError('ส่งงานได้เฉพาะนักเรียนในงานที่กำหนด')
            file_ids = data.get('fileIds') or []
            if not file_ids or len(file_ids) > 5:
                raise ValueError('แนบงาน 1–5 ไฟล์ก่อนส่ง')
            files = [self.db.get(pk, 'FILE#' + text(fid, 64)) for fid in file_ids]
            if any(not f or f['ownerId'] != uid or f['entityId'] != post['id'] or f['status'] != 'ready' or f['context'] != 'submission' for f in files):
                raise PermissionError('ไฟล์แนบไม่ถูกต้อง')
            when = now()
            previous = self.db.get(pk, f"SUB#{post['id']}#{uid}")
            submission = {'entity': 'submission', 'postId': post['id'], 'userId': uid, 'files': files,
                          'comment': text(data.get('comment'), 2000, False), 'submittedAt': when,
                          'late': dt.datetime.fromisoformat(when.replace('Z', '+00:00')) > dt.datetime.fromisoformat(post['dueAt'].replace('Z', '+00:00')), 'revision': (previous or {}).get('revision', 0) + 1}
            return self.db.put(pk, f"SUB#{post['id']}#{uid}", submission, expected=(previous or {}).get('_version', 0))
        if action == 'createExam':
            self.access(user, cid, True)
            exam = {'entity': 'exam', 'id': ident(), 'title': text(data.get('title'), 120), 'maxScore': numeric(data.get('maxScore'), 1, 1000), 'createdAt': now()}
            return self.db.put(pk, 'EXAM#' + exam['id'], exam, expected=0)
        if action in ('grade', 'importScores'):
            self.access(user, cid, True)
            aid = text(data.get('assessmentId'), 64)
            assessment = self.db.get(pk, 'POST#' + aid) or self.db.get(pk, 'EXAM#' + aid)
            if not assessment or (assessment.get('entity') == 'post' and assessment['kind'] != 'assignment'):
                raise ValueError('ไม่พบงานหรือการสอบ')
            gradebook = self.db.get(pk, 'GRADE#' + aid) or {'entity': 'gradebook', 'assessmentId': aid, 'scores': {}, '_version': 0}
            if data.get('expectedVersion') != gradebook['_version']:
                raise ValueError('สมุดคะแนนเปลี่ยนแล้ว กรุณารีเฟรชก่อนบันทึก')
            roster = {m['userId']: m for m in self.db.list(pk, 'MEMBER#') if m['role'] == 'student'}
            updates = data.get('rows') if action == 'importScores' else [data]
            if not isinstance(updates, list) or not 1 <= len(updates) <= 500:
                raise ValueError('นำเข้าได้ 1–500 แถวต่อครั้ง')
            seen = set()
            for row in updates:
                target = row.get('userId')
                if action == 'importScores':
                    target = next((u for u, m in roster.items() if m['studentId'] == str(row.get('studentId', '')).strip()), None)
                if target not in roster or target in seen:
                    raise ValueError('พบรหัสนักเรียนที่ไม่มีในห้องหรือซ้ำในไฟล์')
                seen.add(target)
                score = numeric(row.get('score'), 0, assessment['maxScore'])
                rubric_scores = row.get('rubricScores') or {}
                rubric = assessment.get('rubric') or []
                if rubric:
                    if action == 'importScores':
                        raise ValueError('งานที่มี Rubric ต้องให้คะแนนแยกหัวข้อ')
                    parts = [numeric(rubric_scores.get(r['id']), 0, r['max']) for r in rubric]
                    if abs(sum(parts) - score) > .0001:
                        raise ValueError('คะแนน Rubric ไม่ตรงกับคะแนนรวม')
                gradebook['scores'][target] = {'score': score, 'feedback': text(row.get('feedback'), 2000, False), 'rubricScores': rubric_scores, 'gradedAt': now()}
            if len(json.dumps(gradebook, ensure_ascii=False).encode()) > 350000:
                raise ValueError('สมุดคะแนนมีข้อมูลมากเกินไป กรุณาลดความยาวข้อเสนอแนะ')
            result = self.db.put(pk, 'GRADE#' + aid, gradebook, expected=gradebook['_version'])
            return {'updated': len(updates), 'version': result['_version']}
        if action == 'previewGrades':
            return self.report(user, cid, data.get('config'))
        if action == 'saveGrading':
            self.access(user, cid, True)
            config = validate_grading(data.get('config') or {})
            course['grading'] = config
            self.db.put(pk, 'META', course, expected=data.get('expectedVersion', course['_version']))
            return config
        if action == 'publishGrades':
            report = self.report(user, cid)
            publication = {'entity': 'publication', 'rows': report['rows'], 'config': report['config'], 'publishedAt': now()}
            self.db.put(pk, 'PUBLISHED', publication)
            return publication
        if action in ('getMessages', 'sendMessage'):
            target = text(data.get('studentUserId') if teacher else uid, 100)
            student = self.db.get(pk, 'MEMBER#' + target)
            if not student or student['role'] != 'student':
                raise PermissionError('ไม่พบคู่สนทนาในห้องเรียน')
            if action == 'sendMessage':
                message = {'entity': 'message', 'id': ident(), 'senderId': uid, 'senderName': profile['name'], 'text': text(data.get('text')), 'createdAt': now()}
                self.db.put(pk, f"DM#{target}#{message['createdAt']}#{message['id']}", message, expected=0)
            return self.db.list(pk, f'DM#{target}#')[-100:]
        if action == 'initUpload':
            entity_id, context = text(data.get('entityId'), 64), data.get('context')
            post = self.db.get(pk, 'POST#' + entity_id)
            if not post or (context == 'post' and not teacher) or (context == 'submission' and (teacher or post['kind'] != 'assignment')) or context not in ('post', 'submission'):
                raise PermissionError('ไม่มีสิทธิ์แนบไฟล์ที่นี่')
            filename = text(Path(str(data.get('filename', '')).replace('\\', '/')).name, 180)
            suffix = Path(filename).suffix.lower()
            if suffix not in MIME:
                raise ValueError('รองรับ PDF, Word, Excel, PowerPoint, รูปภาพ, TXT และ CSV')
            size = int(numeric(data.get('size'), 1, 25 * 1024 * 1024))
            fid = ident()
            file = {'entity': 'file', 'id': fid, 'entityId': entity_id, 'context': context, 'ownerId': uid, 'filename': filename,
                    'size': size, 'mime': MIME[suffix], 'key': f'{cid}/{uid}/{fid}{suffix}', 'status': 'pending', 'createdAt': now()}
            self.db.put(pk, 'FILE#' + fid, file, expected=0)
            return {'file': file, 'upload': self.files.prepare(file)}
        if action in ('completeUpload', 'downloadFile'):
            file = self.db.get(pk, 'FILE#' + text(data.get('fileId'), 64))
            if not file or (file['context'] == 'submission' and not teacher and file['ownerId'] != uid):
                raise PermissionError('ไม่มีสิทธิ์เข้าถึงไฟล์นี้')
            if action == 'downloadFile':
                if file['status'] != 'ready':
                    raise ValueError('ไฟล์ยังไม่พร้อม')
                return {'url': self.files.download(file)}
            if file['ownerId'] != uid:
                raise PermissionError('ยืนยันได้เฉพาะไฟล์ของตนเอง')
            self.files.verify(file)
            file['status'] = 'ready'
            result = self.db.put(pk, 'FILE#' + file['id'], file, expected=file['_version'])
            if file['context'] == 'post':
                post = self.db.get(pk, 'POST#' + file['entityId'])
                if len(post['files']) >= 5 and all(f['id'] != file['id'] for f in post['files']):
                    raise ValueError('แนบได้สูงสุด 5 ไฟล์ต่อโพสต์')
                post['files'] = [f for f in post['files'] if f['id'] != file['id']] + [result]
                self.db.put(pk, 'POST#' + post['id'], post, expected=post['_version'])
            return result
        raise ValueError('ไม่รู้จักคำสั่งนี้')
