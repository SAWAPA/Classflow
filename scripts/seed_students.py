"""Seed 20 students into each classroom in Classflow.
Can be executed anytime to ensure every existing (and new) classroom has 20 enrolled students.
"""
import datetime as dt
import json
from pathlib import Path
import secrets
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'backend'))

from service import Classroom, now
from store import LocalStore
from local import LocalFiles, LocalDirectory

DATA = ROOT / '.local'
DATA.mkdir(exist_ok=True)

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

SCORES_CURVE = [95, 92, 88, 85, 83, 80, 78, 77, 74, 71, 68, 65, 64, 61, 58, 57, 54, 49, 45, 42]


def seed_all_classrooms(db_path=None):
    db_file = Path(db_path) if db_path else DATA / 'classroom.sqlite3'
    print(f"เชื่อมต่อฐานข้อมูล: {db_file}")
    db = LocalStore(db_file)
    files = LocalFiles()
    app = Classroom(db, files, LocalDirectory())

    teacher = {'id': 'teacher-demo', 'name': 'อ.ณัฐวดี ศรีวิชา', 'email': 'teacher@example.test', 'role': 'teacher'}
    # Ensure teacher profile
    db.put('U#' + teacher['id'], 'PROFILE', {'role': 'teacher', 'name': teacher['name'], 'roleSelected': True})

    # 1. ค้นหาห้องเรียนทั้งหมดที่มีอยู่ในระบบ
    with db.connect() as conn:
        rows = conn.execute("SELECT pk, data FROM records WHERE sk = 'META' AND pk LIKE 'C#%'").fetchall()

    classrooms = []
    for pk, raw in rows:
        cid = pk.removeprefix('C#')
        data = json.loads(raw)
        classrooms.append({'id': cid, **data})

    # ถ้ายังไม่มีห้องเรียน ให้สร้างห้องเรียนตัวอย่างเริ่มต้น 2 ห้อง
    if not classrooms:
        print("ยังไม่มีห้องเรียนในระบบ กำลังสร้างห้องเรียนตัวอย่าง 2 ห้อง...")
        course1 = app.run(teacher, 'createClass', {
            'name': 'Cloud Computing & Virtualization',
            'subject': '05506258 · ภาคเรียน 2/2569',
            'description': 'สร้างสิ่งที่เป็นไปได้ ด้วยพลังของคลาวด์'
        })
        course2 = app.run(teacher, 'createClass', {
            'name': 'Web Application Development',
            'subject': '05506259 · ภาคเรียน 2/2569',
            'description': 'พัฒนาเว็บแอปพลิเคชันยุคใหม่ด้วย React, Node.js และ Cloud'
        })
        classrooms = [course1, course2]

        # สร้างตัวอย่างงานและประกาศในห้องเรียนแรก
        day = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=7)
        post1 = app.run(teacher, 'createPost', {
            'classId': course1['id'],
            'kind': 'assignment',
            'title': 'ออกแบบ Cloud Architecture',
            'description': 'ออกแบบสถาปัตยกรรมสำหรับแอปพลิเคชันของคุณ อธิบาย Data Flow, Security และแผนควบคุมค่าใช้จ่าย ส่งเป็น PDF',
            'dueAt': day.isoformat(),
            'maxScore': 100,
            'rubric': [
                {'title': 'ความถูกต้องของสถาปัตยกรรม', 'max': 40},
                {'title': 'การออกแบบความปลอดภัย', 'max': 35},
                {'title': 'เหตุผลและการนำเสนอ', 'max': 25}
            ]
        })
        app.run(teacher, 'createPost', {
            'classId': course1['id'],
            'kind': 'material',
            'title': 'ยินดีต้อนรับสู่ห้องเรียนคลาวด์ ☁',
            'description': 'พื้นที่เรียนรู้ แบ่งปัน และเติบโตไปด้วยกัน อ่านเนื้อหา ติดตามงาน และพูดคุยกับอาจารย์ได้ในที่เดียว'
        })
        app.run(teacher, 'createExam', {
            'classId': course1['id'],
            'title': 'สอบกลางภาค Cloud Computing',
            'maxScore': 100
        })

        # สร้างตัวอย่างงานและประกาศในห้องเรียนที่สอง
        day2 = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=5)
        app.run(teacher, 'createPost', {
            'classId': course2['id'],
            'kind': 'assignment',
            'title': 'สร้าง RESTful API ด้วย Express & TypeScript',
            'description': 'เขียน API จัดการข้อมูลนักเรียนและวิชาเรียน พร้อม Validation และ Swagger Docs',
            'dueAt': day2.isoformat(),
            'maxScore': 100,
            'rubric': [
                {'title': 'โครงสร้างและคุณภาพโค้ด', 'max': 50},
                {'title': 'API Endpoints ครบถ้วน', 'max': 30},
                {'title': 'Unit Tests', 'max': 20}
            ]
        })
        app.run(teacher, 'createPost', {
            'classId': course2['id'],
            'kind': 'material',
            'title': 'สไลด์ประกอบการสอน บทที่ 1-3 🚀',
            'description': 'ดาวน์โหลดเอกสารประกอบการเรียน Frontend และ Backend Architecture'
        })
        app.run(teacher, 'createExam', {
            'classId': course2['id'],
            'title': 'สอบเก็บคะแนนปฏิบัติการ Web Dev',
            'maxScore': 100
        })

    print(f"\nพบห้องเรียนทั้งหมด {len(classrooms)} ห้อง:")
    for idx, c in enumerate(classrooms, 1):
        print(f"  {idx}. {c.get('name')} (รหัสวิชา: {c.get('subject')}) [ID: {c.get('id')}]")

    print("\nกำลังดำเนินการเพิ่มนักเรียน 20 คนในแต่ละห้องเรียน...")

    # 2. เพิ่มนักเรียน 20 คนเข้าไปในแต่ละห้องเรียน
    total_enrolled = 0
    for c in classrooms:
        cid = c['id']
        cname = c.get('name', cid)
        code = c.get('joinCode')
        if not code:
            code = secrets.token_hex(4).upper()
            c['joinCode'] = code
            db.put('C#' + cid, 'META', c)
            db.put('JOIN', code, {'classId': cid})

        # ตรวจสอบว่า joinCode อยู่ใน JOIN table หรือไม่
        if not db.get('JOIN', code):
            db.put('JOIN', code, {'classId': cid})

        print(f"\n>>> ดำเนินการห้องเรียน: {cname} (รหัสเข้าห้อง: {code})")

        # ดึงสมาชิกเดิม
        existing_members = db.list('C#' + cid, 'MEMBER#')
        existing_uids = {m['userId'] for m in existing_members if m.get('role') == 'student'}
        existing_sids = {m.get('studentId') for m in existing_members if m.get('studentId')}

        enrolled_count = 0
        for std_id, name, uid, email in STUDENTS_20:
            user = {'id': uid, 'name': name, 'email': email, 'role': 'student'}

            # อัปเดต/สร้างโปรไฟล์นักเรียน
            profile = {
                'id': uid,
                'name': name,
                'email': email,
                'role': 'student',
                'roleSelected': True,
                'studentId': std_id,
            }
            db.put('U#' + uid, 'PROFILE', profile)

            # ตรวจสอบการเข้าร่วมห้องเรียน
            if uid not in existing_uids or std_id not in existing_sids:
                # สำรองรหัสนักเรียนและบันทึกการเป็นสมาชิกในห้องเรียน
                db.put('C#' + cid, 'STUDENT#' + std_id, {'userId': uid})
                db.put('C#' + cid, 'MEMBER#' + uid, {**profile, 'entity': 'member', 'userId': uid})
                db.put('U#' + uid, 'CLASS#' + cid, {'classId': cid})
                enrolled_count += 1
            else:
                enrolled_count += 1

        print(f"    ✓ มีนักเรียนในห้องนี้ครบ 20 คนเรียบร้อยแล้ว")
        total_enrolled += enrolled_count

        # 3. สร้างข้อมูลงานส่ง (Submissions) และคะแนน (Grades) ให้สมจริง
        posts = db.list('C#' + cid, 'POST#')
        assignments = [p for p in posts if p.get('kind') == 'assignment']
        exams = db.list('C#' + cid, 'EXAM#')

        for a in assignments:
            prior_gb = db.get('C#' + cid, 'GRADE#' + a['id'])
            scores_dict = (prior_gb or {}).get('scores', {})

            for i, (std_id, name, uid, email) in enumerate(STUDENTS_20):
                score = SCORES_CURVE[i % len(SCORES_CURVE)]
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

                # ให้คะแนนนักเรียน
                scores_dict[uid] = {
                    'score': score,
                    'rubricScores': {},
                    'feedback': 'ตรวจแล้วเรียบร้อย ผลงานยอดเยี่ยม' if score >= 80 else 'ตรวจแล้ว ตั้งใจพัฒนาต่อไป',
                    'gradedAt': now()
                }

            # บันทึก gradebook สำหรับงานนี้
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
                score = SCORES_CURVE[i % len(SCORES_CURVE)]
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
            # Publish grades เพื่อให้นักเรียนเห็นผลและระบบคำนวณเกรด
            try:
                app.run(teacher, 'publishGrades', {'classId': cid})
            except Exception:
                pass

    # บันทึกสถานะ SEED_VERSION3
    db.put('SEED', 'VERSION3_STUDENTS20', {'done': True, 'timestamp': now(), 'studentCount': 20})

    print(f"\n=======================================================")
    print(f"🎉 สำเร็จ! สร้างและบรรจุ Student ครบ classroom ละ 20 คนเรียบร้อย")
    print(f"รวมทั้งสิ้น: {len(classrooms)} ห้องเรียน × 20 คน = {len(classrooms) * 20} การลงทะเบียน")
    print(f"=======================================================\n")

    print("รายชื่อนักเรียน 20 คน:")
    for std_id, name, uid, email in STUDENTS_20:
        print(f"  - [{std_id}] {name} (User: {uid})")

    return classrooms


if __name__ == '__main__':
    seed_all_classrooms()
