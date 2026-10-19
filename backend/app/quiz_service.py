"""
quiz_service.py — anti-cheat helpers for quiz serving and grading.

A quiz can optionally draw a random subset of questions from a pool, shuffle
the order, and shuffle each question's options. When that happens, grading
cannot use the quiz's ordered question table — "question 3" is not the same
question for every student. Instead, the exact served set (and option order)
is recorded per attempt in `quiz_attempt_sessions`, and grading reads back
from that record.

All functions are pure/DB-driven so they work on both SQLite and Postgres.
"""
import json
import random
import uuid
from datetime import datetime, timedelta

# A short grace window so a student on a slow connection who submits just as
# the clock runs out is not punished. The server clock is still authoritative.
EXPIRY_GRACE_SECONDS = 30


def _parse_options(raw):
    try:
        return json.loads(raw) if isinstance(raw, str) else (raw or [])
    except Exception:
        return []


def build_served_questions(quiz, question_rows):
    """Return the list of questions served for one attempt, without answers.

    Each served entry carries its own option order and the index of the correct
    option within that order (or the correct text for fill_blank). This is
    stored server-side; the client copy has the answer stripped.
    """
    qtype_of = lambda r: (r['question_type'] or 'mcq')
    shuffle_q = bool(quiz.get('shuffle_questions'))
    shuffle_o = bool(quiz.get('shuffle_options'))
    per_attempt = int(quiz.get('questions_per_attempt') or 0)

    pool = [dict(r) for r in question_rows]
    if shuffle_q:
        random.shuffle(pool)
    if per_attempt > 0:
        pool = pool[:per_attempt]

    served = []
    for r in pool:
        qtype = qtype_of(r)
        opts = _parse_options(r['options'])
        correct = int(r['correct_answer'] or 0)
        if qtype == 'fill_blank':
            # options holds the correct answer itself. Keep the correct text
            # server-side; send nothing to the client.
            correct_text = str(opts[correct]) if opts and 0 <= correct < len(opts) else ''
            served.append({
                'id': r['id'], 'question': r['question_text'], 'question_type': qtype,
                'options': [], 'correct_answer': correct_text,
            })
            continue
        idx = list(range(len(opts)))
        if shuffle_o:
            random.shuffle(idx)
        ordered = [opts[i] for i in idx]
        # Where did the correct option land in the new order?
        new_correct = idx.index(correct) if correct in idx else 0
        served.append({
            'id': r['id'], 'question': r['question_text'], 'question_type': qtype,
            'options': ordered, 'correct_answer': new_correct,
        })
    return served


def public_questions(served):
    """Client-safe copy: same order/options, correct answers stripped."""
    out = []
    for s in served:
        safe = {k: v for k, v in s.items() if k != 'correct_answer'}
        out.append(safe)
    return out


def grade_served(served, answers, pass_score):
    """Grade a student's answers against the served set.

    `answers` is keyed by the question's position in the served list, as a
    string (matches how the frontend submits).
    Returns (score, correct_count, correct_map, passed).
    """
    correct_map = {}
    correct_count = 0
    for i, s in enumerate(served):
        user_ans = answers.get(str(i))
        if s['question_type'] == 'fill_blank':
            correct_map[i] = s['correct_answer']
            if user_ans is not None and str(user_ans).strip().lower() == str(s['correct_answer']).strip().lower():
                correct_count += 1
        else:
            correct_map[i] = s['correct_answer']
            if user_ans is not None:
                try:
                    if int(user_ans) == int(s['correct_answer']):
                        correct_count += 1
                except (ValueError, TypeError):
                    pass
    total = len(served)
    score = int((correct_count / total) * 100) if total else 0
    return score, correct_count, correct_map, (score >= pass_score)


def session_expiry(duration_seconds, now=None):
    """Compute the authoritative deadline, or None when the quiz has no limit."""
    secs = int(duration_seconds or 0)
    if secs <= 0:
        return None
    now = now or datetime.now()
    return now + timedelta(seconds=secs)


def is_expired(expires_at, now=None):
    """True when the deadline (plus grace) has passed. Handles str/datetime."""
    if not expires_at:
        return False
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at.replace('Z', ''))
        except ValueError:
            return False
    now = now or datetime.now()
    return now > (expires_at + timedelta(seconds=EXPIRY_GRACE_SECONDS))


def new_session_id():
    return str(uuid.uuid4())
