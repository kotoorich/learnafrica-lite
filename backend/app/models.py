"""
models.py - Data model helpers and business logic.

Contains functions that work with specific data models:
  - User model helpers
  - Course model helpers  
  - Certificate helpers
  - Quiz scoring logic

These are called by routes in main.py.
"""
import uuid, json
from datetime import datetime


def get_user_enrolled_courses(db, user_id, use_postgres):
    ph = '%s' if use_postgres else '?'
    sql = ('SELECT c.*, e.progress, e.enrolled_at, e.expires_at'
           ' FROM courses c'
           ' JOIN user_enrollments e ON e.course_id = c.id'
           ' WHERE e.user_id = ' + ph +
           ' ORDER BY e.enrolled_at DESC')
    rows = db.execute(sql, (user_id,)).fetchall()
    return [dict(r) for r in rows]


def get_course_sections(db, course_id, use_postgres, user_id=None):
    ph = '%s' if use_postgres else '?'

    completed_ids = set()
    quiz_scores   = {}
    if user_id:
        sql = ('SELECT lesson_id, quiz_score FROM user_progress'
               ' WHERE user_id=' + ph + ' AND course_id=' + ph + ' AND is_completed=1')
        for p in db.execute(sql, (user_id, course_id)).fetchall():
            completed_ids.add(p['lesson_id'])
            if p.get('quiz_score') is not None:
                quiz_scores[p['lesson_id']] = p['quiz_score']

    sections    = []
    all_lessons = []

    sql_secs = ('SELECT * FROM curriculum_sections'
                ' WHERE course_id=' + ph + ' ORDER BY "order"')
    for sec in db.execute(sql_secs, (course_id,)).fetchall():
        sd = dict(sec)
        sec_lessons = []

        sql_les = ('SELECT l.* FROM lessons l'
                   ' JOIN section_lessons sl ON sl.lesson_id = l.id'
                   ' WHERE sl.section_id = ' + ph + ' ORDER BY sl."order"')
        for l in db.execute(sql_les, (sec['id'],)).fetchall():
            ld = dict(l)
            ld['isCompleted']  = ld['id'] in completed_ids
            ld['is_completed'] = ld['isCompleted']
            ld['videoUrl']     = ld.get('video_url') or ''
            ld['is_final']     = bool(ld.get('is_final', 0))
            if ld['id'] in quiz_scores:
                ld['quiz_score'] = quiz_scores[ld['id']]
            sql_res = 'SELECT * FROM lesson_resources WHERE lesson_id=' + ph
            ld['resources'] = [dict(r) for r in db.execute(sql_res, (ld['id'],)).fetchall()]
            sec_lessons.append(ld)
            all_lessons.append(ld)

        sd['lessons'] = sec_lessons
        sections.append(sd)

    return sections, all_lessons


def score_quiz(questions, answers, pass_score=70):
    correct_count   = 0
    correct_answers = {}

    for i, q in enumerate(questions):
        qtype    = q.get('question_type', 'mcq')
        user_ans = answers.get(str(i))
        correct  = q.get('correct_answer', 0)
        options  = q.get('options', [])

        if isinstance(options, str):
            try:
                options = json.loads(options)
            except Exception:
                options = []

        correct_answers[i] = correct

        if qtype == 'fill_blank':
            correct_text = str(options[int(correct)] if options else '').strip().lower()
            user_text    = str(user_ans or '').strip().lower()
            if user_text == correct_text:
                correct_count += 1
        else:
            if str(user_ans) == str(correct):
                correct_count += 1

    total = len(questions)
    score = round((correct_count / total) * 100) if total > 0 else 0
    return {
        'score':           score,
        'correct_count':   correct_count,
        'total_questions': total,
        'passed':          score >= pass_score,
        'correct_answers': correct_answers,
    }


def get_or_issue_certificate(db, user_id, course_id, use_postgres):
    ph = '%s' if use_postgres else '?'

    course = db.execute('SELECT * FROM courses WHERE id=' + ph, (course_id,)).fetchone()
    if not course:
        return None, 'Course not found'

    perks = db.execute('SELECT has_certificate FROM course_perks WHERE course_id=' + ph, (course_id,)).fetchone()
    cert_enabled = bool(perks['has_certificate']) if perks else bool(course.get('has_certificate', 0))
    if not cert_enabled:
        return None, 'This course does not offer a certificate'

    enr = db.execute(
        'SELECT progress FROM user_enrollments WHERE user_id=' + ph + ' AND course_id=' + ph,
        (user_id, course_id)
    ).fetchone()
    if not enr:
        return None, 'You are not enrolled in this course'

    sql_final = ("SELECT id FROM lessons WHERE course_id=" + ph +
                 " AND is_final=1 AND type='quiz'")
    final_lesson = db.execute(sql_final, (course_id,)).fetchone()
    if final_lesson:
        sql_prog = ('SELECT quiz_score FROM user_progress'
                    ' WHERE user_id=' + ph + ' AND course_id=' + ph +
                    ' AND lesson_id=' + ph + ' AND is_completed=1')
        prog = db.execute(sql_prog, (user_id, course_id, final_lesson['id'])).fetchone()
        if not prog:
            return None, 'You must complete the final exam to earn this certificate'
        if (prog['quiz_score'] or 0) < 70:
            return None, f'You scored {prog["quiz_score"]}% on the final exam. You need 70% to earn the certificate.'

    existing = db.execute(
        'SELECT * FROM issued_certificates WHERE user_id=' + ph + ' AND course_id=' + ph,
        (user_id, course_id)
    ).fetchone()
    if existing:
        return dict(existing), None

    user     = db.execute('SELECT name FROM users WHERE id=' + ph, (user_id,)).fetchone()
    cert_id  = f'LA-CERT-{str(uuid.uuid4())[:8].upper()}'
    new_cert = {
        'id':              str(uuid.uuid4()),
        'cert_id':         cert_id,
        'user_id':         user_id,
        'course_id':       course_id,
        'user_name':       user['name'] if user else 'Learner',
        'course_name':     course['title'],
        'instructor_name': course['instructor_name'],
        'issued_at':       datetime.now().isoformat(),
    }
    sql_ins = ('INSERT INTO issued_certificates'
               ' (id, cert_id, user_id, course_id, user_name, course_name, instructor_name, issued_at)'
               ' VALUES (' + ','.join([ph]*8) + ')')
    db.execute(sql_ins, tuple(new_cert.values()))
    db.commit()
    return new_cert, None


def get_instructor_stats(db, instructor_id, use_postgres):
    ph = '%s' if use_postgres else '?'

    st = db.execute(
        'SELECT COUNT(DISTINCT e.user_id) as total'
        ' FROM user_enrollments e'
        ' JOIN courses c ON c.id = e.course_id'
        ' WHERE c.instructor_id = ' + ph,
        (instructor_id,)
    ).fetchone()

    courses = db.execute(
        'SELECT COUNT(*) as total FROM courses WHERE instructor_id=' + ph,
        (instructor_id,)
    ).fetchone()

    avg = db.execute(
        'SELECT AVG(rating) as avg FROM reviews r'
        ' JOIN courses c ON c.id=r.course_id'
        ' WHERE c.instructor_id=' + ph,
        (instructor_id,)
    ).fetchone()

    earnings = db.execute(
        'SELECT COALESCE(SUM(p.amount), 0) as total'
        ' FROM payments p'
        ' JOIN courses c ON c.id = p.course_id'
        ' WHERE c.instructor_id = ' + ph + " AND p.status = 'completed'",
        (instructor_id,)
    ).fetchone()

    return {
        'total_students': st['total'] if st else 0,
        'total_courses':  courses['total'] if courses else 0,
        'average_rating': round(float(avg['avg'] or 0), 1) if avg else 0,
        'total_earnings': float(earnings['total'] or 0) if earnings else 0,
    }
