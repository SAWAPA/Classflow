"""Classroom grading rules. No cloud dependencies; shared by local and Lambda runs."""
import math
import statistics
import datetime as dt

DEFAULT_GRADING = {
    'mode': 'criterion', 'assignmentWeight': 40, 'examWeight': 60,
    'missingAsZero': False,
    'thresholds': [['A', 80], ['B+', 75], ['B', 70], ['C+', 65], ['C', 60], ['D+', 55], ['D', 50], ['F', 0]],
    'zThresholds': [['A', 1.5], ['B+', 1], ['B', .5], ['C+', 0], ['C', -.5], ['D+', -1], ['D', -1.5], ['F', -100]],
}


def numeric(value, low=0, high=100):
    if isinstance(value, bool):
        raise ValueError('คะแนนต้องเป็นตัวเลข')
    result = float(value)
    if not math.isfinite(result) or not low <= result <= high:
        raise ValueError(f'ค่าต้องอยู่ระหว่าง {low:g} ถึง {high:g}')
    return result


def validate_grading(config):
    result = {**DEFAULT_GRADING, **config}
    if result['mode'] not in ('criterion', 'group'):
        raise ValueError('รูปแบบตัดเกรดไม่ถูกต้อง')
    a = numeric(result['assignmentWeight'])
    e = numeric(result['examWeight'])
    if abs(a + e - 100) > .00001:
        raise ValueError('น้ำหนักการบ้านและการสอบรวมกันต้องเท่ากับ 100%')
    result['assignmentWeight'], result['examWeight'] = a, e
    for key in ('thresholds', 'zThresholds'):
        rows = result[key]
        if len(rows) != 8 or [r[0] for r in rows] != [r[0] for r in DEFAULT_GRADING[key]]:
            raise ValueError('กรุณากำหนดเกณฑ์ A, B+, B, C+, C, D+, D, F ให้ครบ')
        values = [numeric(r[1], -100 if key == 'zThresholds' else 0) for r in rows]
        if any(x <= y for x, y in zip(values, values[1:])):
            raise ValueError('เส้นตัดเกรดต้องเรียงจากมากไปน้อยและไม่ซ้ำกัน')
        if values[-1] != (-100 if key == 'zThresholds' else 0):
            raise ValueError('เส้นตัด F ต้องคงค่าเริ่มต้นไว้')
        result[key] = [[r[0], n] for r, n in zip(rows, values)]
    result['missingAsZero'] = bool(result['missingAsZero'])
    return result


def build_report(members, posts, exams, gradebooks, submissions, config):
    config = validate_grading(config)
    assignments = [p for p in posts if p['kind'] == 'assignment']
    groups = [(assignments, config['assignmentWeight']), (exams, config['examWeight'])]
    rows = []
    for member in members:
        if member['role'] != 'student':
            continue
        uid = member['userId']
        row = {**member, 'total': None, 'grade': None, 'missing': 0, 'late': 0, 'scores': {}}
        total, pending = 0.0, False
        for assessments, weight in groups:
            if not weight:
                continue
            if not assessments:
                pending = True
                continue
            percentage = 0
            for assessment in assessments:
                aid = assessment['id']
                entry = gradebooks.get(aid, {}).get(uid)
                score = entry.get('score') if entry else None
                row['scores'][aid] = score
                if score is None:
                    pending = pending or not config['missingAsZero']
                percentage += (score or 0) / assessment['maxScore']
            total += percentage / len(assessments) * weight
        for post in assignments:
            submission = submissions.get(f"{post['id']}#{uid}")
            due = dt.datetime.fromisoformat(post['dueAt'].replace('Z', '+00:00'))
            if not submission and due < dt.datetime.now(dt.timezone.utc):
                row['missing'] += 1
            elif submission and submission['late']:
                row['late'] += 1
        if not pending:
            row['total'] = round(total, 6)
        rows.append(row)
    values = [r['total'] for r in rows if r['total'] is not None]
    mean = statistics.mean(values) if values else None
    sd = statistics.pstdev(values) if values else None
    for row in rows:
        if row['total'] is None:
            continue
        value = row['total'] if config['mode'] == 'criterion' else ((row['total'] - mean) / sd if sd else 0)
        thresholds = config['thresholds'] if config['mode'] == 'criterion' else config['zThresholds']
        row['grade'] = next((g for g, threshold in thresholds if value >= threshold), 'F')
    rows.sort(key=lambda r: (r['total'] is None, -(r['total'] or 0), r.get('studentId', ''), r['name']))
    last_score, rank = None, 0
    for i, row in enumerate(rows, 1):
        if row['total'] is None:
            row['rank'] = None
        else:
            if row['total'] != last_score:
                rank = i
            row['rank'], last_score = rank, row['total']
    return {'rows': rows, 'stats': {'highest': max(values) if values else None, 'lowest': min(values) if values else None,
            'mean': mean, 'sd': sd, 'graded': len(values), 'pending': len(rows) - len(values), 'count': len(rows)},
            'distribution': {grade: sum(r['grade'] == grade for r in rows) for grade, _ in DEFAULT_GRADING['thresholds']},
            'config': config, 'sdDefinition': 'population'}
