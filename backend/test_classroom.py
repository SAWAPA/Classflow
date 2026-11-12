import copy
import datetime as dt
import tempfile
import unittest
from pathlib import Path
from domain import DEFAULT_GRADING, build_report, validate_grading
from service import Classroom
from store import LocalStore, Conflict


class FakeFiles:
    def prepare(self, file): return {'url': 'https://test.invalid/upload'}
    def verify(self, file): pass
    def download(self, file): return 'https://test.invalid/private/' + file['id']


class FakeDirectory:
    def __init__(self):
        self.users = [{'id': 't', 'name': 'Teacher', 'email': 't@example.test', 'role': 'teacher'}]

    def list_users(self): return self.users

    def create_user(self, email, name, password, role):
        if any(user['email'] == email for user in self.users): raise ValueError('duplicate')
        user = {'id': email, 'name': name, 'email': email, 'role': role}
        self.users.append(user)
        return user

    def set_role(self, user_id, role):
        user = next(user for user in self.users if user['id'] == user_id)
        user['role'] = role
        return user


class ClassroomTests(unittest.TestCase):
    def setUp(self):
        test_root = Path(__file__).resolve().parent.parent / '.local' / 'tests'
        test_root.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=test_root)
        self.db = LocalStore(Path(self.temp.name) / 'db.sqlite3')
        self.directory = FakeDirectory()
        self.app = Classroom(self.db, FakeFiles(), self.directory)
        self.teacher = {'id': 't', 'name': 'Teacher', 'email': 't@example.test', 'role': 'teacher'}
        self.students = [{'id': 's1', 'name': 'Student One', 'email': 's1@example.test', 'role': 'student'}, {'id': 's2', 'name': 'Student Two', 'email': 's2@example.test', 'role': 'student'}]
        self.course = self.app.run(self.teacher, 'createClass', {'name': 'Cloud', 'subject': 'CLOUD101'})
        self.cid = self.course['id']
        for i, student in enumerate(self.students, 1):
            self.app.run(student, 'updateProfile', {'name': student['name'], 'studentId': f'00{i}'})
            self.app.run(student, 'joinClass', {'code': self.course['joinCode']})
        self.post = self.app.run(self.teacher, 'createPost', {'classId': self.cid, 'kind': 'assignment', 'title': 'Homework', 'description': 'Details', 'maxScore': 100, 'dueAt': (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)).isoformat()})
        self.exam = self.app.run(self.teacher, 'createExam', {'classId': self.cid, 'title': 'Exam', 'maxScore': 100})

    def tearDown(self): self.temp.cleanup()

    def run_action(self, user, action, **data): return self.app.run(user, action, {'classId': self.cid, **data})

    def grade(self, aid, uid, score):
        prior = self.db.get('C#' + self.cid, 'GRADE#' + aid)
        return self.run_action(self.teacher, 'grade', assessmentId=aid, userId=uid, score=score, expectedVersion=(prior or {}).get('_version', 0))

    def test_teacher_only_actions(self):
        for action, data in [('createExam', {'title': 'Fake', 'maxScore': 100}), ('grade', {}), ('previewGrades', {}), ('saveGrading', {}), ('publishGrades', {})]:
            with self.subTest(action=action), self.assertRaises(PermissionError): self.run_action(self.students[0], action, **data)
        with self.assertRaises(PermissionError): self.app.run(self.students[0], 'createClass', {'name': 'Fake', 'subject': 'F'})

    def test_admin_directory_and_role_management(self):
        admin = {'id': 'a', 'name': 'Admin', 'email': 'a@example.test', 'role': 'admin'}
        with self.assertRaises(PermissionError): self.app.run(self.teacher, 'adminListUsers', {})
        created = self.app.run(admin, 'adminCreateUser', {'email': 'new@example.test', 'name': 'New Teacher', 'password': 'safePass1', 'role': 'teacher'})
        self.assertEqual(created['role'], 'teacher')
        self.assertEqual(self.app.run(admin, 'adminListUsers', {})[-1]['email'], 'new@example.test')
        changed = self.app.run(admin, 'adminSetUserRole', {'userId': 'new@example.test', 'role': 'student'})
        self.assertEqual(changed['role'], 'student')
        promoted = self.app.run(admin, 'adminSetUserRole', {'userId': 'new@example.test', 'role': 'admin'})
        self.assertEqual(promoted['role'], 'admin')
        created_admin = self.app.run(admin, 'adminCreateUser', {'email': 'new-admin@example.test', 'name': 'New Admin', 'password': 'safePass1', 'role': 'admin'})
        self.assertEqual(created_admin['role'], 'admin')
        with self.assertRaises(ValueError): self.app.run(admin, 'adminCreateUser', {'email': 'weak@example.test', 'name': 'Weak', 'password': 'admin', 'role': 'student'})

    def test_cross_class_access_denied(self):
        outsider = {**self.teacher, 'id': 'outsider'}
        with self.assertRaises(PermissionError): self.run_action(outsider, 'getClass')

    def test_scores_and_publication_are_private(self):
        for aid in (self.post['id'], self.exam['id']):
            self.grade(aid, 's1', 80); self.grade(aid, 's2', 40)
        self.run_action(self.teacher, 'publishGrades')
        snapshot = self.run_action(self.students[0], 'getClass')
        self.assertNotIn('s2', snapshot['gradebooks'][self.post['id']])
        self.assertEqual(len(snapshot['publication']['rows']), 1)
        self.assertEqual(snapshot['publication']['rows'][0]['userId'], 's1')
        self.assertIn('s2', [m['userId'] for m in snapshot['members']])

    def test_score_boundaries_and_nan(self):
        for score in (-1, 101, float('nan'), float('inf'), True):
            with self.subTest(score=score), self.assertRaises(ValueError): self.grade(self.exam['id'], 's1', score)
        self.grade(self.exam['id'], 's1', 0)

    def test_invalid_import_is_atomic(self):
        self.grade(self.exam['id'], 's1', 20)
        before = self.db.get('C#' + self.cid, 'GRADE#' + self.exam['id'])
        with self.assertRaises(ValueError): self.run_action(self.teacher, 'importScores', assessmentId=self.exam['id'], expectedVersion=before['_version'], rows=[{'studentId': '001', 'score': 90}, {'studentId': '002', 'score': 101}])
        after = self.db.get('C#' + self.cid, 'GRADE#' + self.exam['id'])
        self.assertEqual(before, after)

    def test_random_scores_update_every_student(self):
        result = self.run_action(self.teacher, 'randomScores', assessmentId=self.exam['id'], expectedVersion=0)
        self.assertEqual(result['updated'], len(self.students))
        snapshot = self.run_action(self.teacher, 'getClass')
        scores = snapshot['gradebooks'][self.exam['id']]
        self.assertEqual(set(scores), {'s1', 's2'})
        self.assertTrue(all(50 <= entry['score'] <= 100 for entry in scores.values()))

    def test_import_rejects_duplicates_and_unknowns(self):
        for rows in [[{'studentId': '001', 'score': 90}, {'studentId': '001', 'score': 80}], [{'studentId': '999', 'score': 70}]]:
            with self.assertRaises(ValueError): self.run_action(self.teacher, 'importScores', assessmentId=self.exam['id'], expectedVersion=0, rows=rows)

    def test_concurrent_grade_does_not_overwrite(self):
        self.grade(self.exam['id'], 's1', 80)
        with self.assertRaises(ValueError): self.run_action(self.teacher, 'grade', assessmentId=self.exam['id'], userId='s1', score=0, expectedVersion=0)
        with self.assertRaises(Conflict): self.db.put('C#' + self.cid, 'META', self.course, expected=0)

    def test_private_chat(self):
        self.run_action(self.students[0], 'sendMessage', text='private to teacher', studentUserId='s2')
        self.assertEqual(self.run_action(self.students[1], 'getMessages', studentUserId='s1'), [])
        self.assertEqual(len(self.run_action(self.teacher, 'getMessages', studentUserId='s1')), 1)

    def test_private_upload(self):
        prepared = self.run_action(self.students[0], 'initUpload', entityId=self.post['id'], context='submission', filename='work.pdf', size=12)
        fid = prepared['file']['id']
        self.run_action(self.students[0], 'completeUpload', fileId=fid)
        with self.assertRaises(PermissionError): self.run_action(self.students[1], 'downloadFile', fileId=fid)
        with self.assertRaises(PermissionError): self.run_action(self.students[1], 'submit', postId=self.post['id'], fileIds=[fid])
        self.assertTrue(self.run_action(self.teacher, 'downloadFile', fileId=fid)['url'])
        self.run_action(self.students[0], 'submit', postId=self.post['id'], fileIds=[fid])
        self.assertEqual(len(self.run_action(self.students[0], 'getClass')['submissions']), 1)

    def test_file_type_and_size_validation(self):
        for filename, size in [('payload.exe', 10), ('bad.svg', 10), ('large.pdf', 26 * 1024 * 1024), ('empty.docx', 0)]:
            with self.assertRaises(ValueError): self.run_action(self.students[0], 'initUpload', entityId=self.post['id'], context='submission', filename=filename, size=size)

    def test_criterion_math_and_population_sd(self):
        for aid in (self.post['id'], self.exam['id']):
            self.grade(aid, 's1', 80); self.grade(aid, 's2', 40)
        report = self.run_action(self.teacher, 'previewGrades')
        self.assertEqual(report['stats']['mean'], 60)
        self.assertEqual(report['stats']['sd'], 20)
        self.assertEqual(report['rows'][0]['grade'], 'A')
        self.assertEqual(report['rows'][1]['grade'], 'F')
        self.assertEqual(report['rows'][0]['missing'], 0) # future homework is not overdue

    def test_missing_scores_pending_and_zero_policy(self):
        self.grade(self.post['id'], 's1', 100)
        pending = self.run_action(self.teacher, 'previewGrades')
        self.assertEqual(pending['stats']['graded'], 0)
        zero = self.run_action(self.teacher, 'previewGrades', config={**DEFAULT_GRADING, 'missingAsZero': True})
        self.assertEqual(zero['rows'][0]['total'], 40)

    def test_group_zero_variance_and_ties(self):
        for aid in (self.post['id'], self.exam['id']):
            self.grade(aid, 's1', 70); self.grade(aid, 's2', 70)
        report = self.run_action(self.teacher, 'previewGrades', config={**DEFAULT_GRADING, 'mode': 'group'})
        self.assertEqual(report['stats']['sd'], 0)
        self.assertEqual([r['grade'] for r in report['rows']], ['C+', 'C+'])
        self.assertEqual([r['rank'] for r in report['rows']], [1, 1])

    def test_invalid_thresholds(self):
        config = copy.deepcopy(DEFAULT_GRADING)
        config['thresholds'][0][1] = 70
        with self.assertRaises(ValueError): validate_grading(config)
        with self.assertRaises(ValueError): validate_grading({**DEFAULT_GRADING, 'examWeight': 80})

    def test_rubric_total_enforced(self):
        with self.assertRaises(ValueError): self.run_action(self.teacher, 'createPost', kind='assignment', title='Rubric', dueAt=(dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)).isoformat(), maxScore=100, rubric=[{'title': 'Quality', 'max': 50}])
        post = self.run_action(self.teacher, 'createPost', kind='assignment', title='Rubric', dueAt=(dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)).isoformat(), maxScore=100, rubric=[{'title': 'Quality', 'max': 100}])
        with self.assertRaises(ValueError): self.run_action(self.teacher, 'grade', assessmentId=post['id'], userId='s1', score=80, rubricScores={'0': 70}, expectedVersion=0)

    def test_user_select_role(self):
        newbie = {'id': 'newbie', 'name': 'Newbie User', 'email': 'newbie@example.test', 'role': 'student'}
        res = self.app.run(newbie, 'selectRole', {'role': 'teacher', 'name': 'Dr. Newbie'})
        self.assertEqual(res['role'], 'teacher')
        self.assertTrue(res['roleSelected'])
        # Newbie can now create class as teacher
        c = self.app.run(newbie, 'createClass', {'name': 'New Class', 'subject': 'NEW101'})
        self.assertEqual(c['teacherName'], 'Dr. Newbie')
        # Cannot switch role after having classes
        with self.assertRaises(ValueError):
            self.app.run(newbie, 'selectRole', {'role': 'student'})
        # Admin cannot change role
        admin = {'id': 'adm', 'name': 'Admin User', 'email': 'adm@example.test', 'role': 'admin'}
        with self.assertRaises(PermissionError):
            self.app.run(admin, 'selectRole', {'role': 'teacher'})


if __name__ == '__main__': unittest.main()
