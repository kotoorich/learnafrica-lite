/**
 * useCourseTimeTracking — shared course minimum-time tracking logic.
 *
 * Previously this logic lived only, inline, inside LessonPage.jsx, so it
 * silently didn't apply during quizzes at all, and had no visible UI or
 * engagement check-in. This hook is now the single implementation, used by
 * both LessonPage and QuizPage, so the timer is genuinely present everywhere
 * a student can be "in" a course, matching how the platform's own minimum-
 * time rule is described.
 *
 * The server remains the authority on how much time actually gets credited
 * (see backend add_course_time); this hook's local counting is only for
 * showing the student a live, responsive number, it periodically re-syncs
 * to the server's own total after every heartbeat so it can't drift far.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from './api';

const HEARTBEAT_SECS = 30;
const CHECKIN_INTERVAL_SECS = 30 * 60; // every 30 real minutes of active time

export function useCourseTimeTracking(courseId, { ready = true } = {}) {
  const [timeSpent, setTimeSpent]       = useState(0);
  const [timeRequired, setTimeRequired] = useState(0);
  const [timeEnforce, setTimeEnforce]   = useState(false);
  const [showCheckin, setShowCheckin]   = useState(false);

  const timeTickRef      = useRef(0);
  const sinceCheckinRef  = useRef(0);
  const pageVisibleRef   = useRef(true);
  const showCheckinRef   = useRef(false);
  useEffect(() => { showCheckinRef.current = showCheckin; }, [showCheckin]);

  const authedFetch = useCallback((url, opts = {}) => {
    const token = sessionStorage.getItem('auth_token');
    return fetch(`${API_BASE}${url}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
    });
  }, []);

  // Fetch current totals once when the course changes
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    authedFetch(`/api/courses/${courseId}/time`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return;
        setTimeSpent(Number(d.spent_seconds || 0));
        setTimeRequired(Number(d.required_seconds || 0));
        setTimeEnforce(Boolean(d.enforce));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [courseId, authedFetch]);

  // Only count time while the tab is actually in the foreground
  useEffect(() => {
    const onVis = () => { pageVisibleRef.current = !document.hidden; };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const sendHeartbeat = useCallback((delta) => {
    if (delta <= 0 || !courseId) return;
    authedFetch(`/api/courses/${courseId}/time`, { method: 'POST', body: JSON.stringify({ seconds: delta }) })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        // Re-sync to the server's real authoritative total after every
        // heartbeat, so the displayed number can't drift far from the truth.
        if (d && typeof d.total_seconds === 'number') setTimeSpent(d.total_seconds);
      })
      .catch(() => { /* will retry on next heartbeat */ });
  }, [courseId, authedFetch]);

  // Local ticker: increments the displayed time every second while visible,
  // sends a heartbeat every 30s, and pauses for an engagement check-in every
  // 30 real minutes of continuously active time.
  useEffect(() => {
    if (!courseId || !ready) return;
    const id = setInterval(() => {
      if (!pageVisibleRef.current || showCheckinRef.current) return;
      timeTickRef.current += 1;
      sinceCheckinRef.current += 1;
      setTimeSpent(t => t + 1);

      if (sinceCheckinRef.current >= CHECKIN_INTERVAL_SECS) {
        const delta = timeTickRef.current;
        timeTickRef.current = 0;
        sinceCheckinRef.current = 0;
        sendHeartbeat(delta);
        setShowCheckin(true);
        return;
      }
      if (timeTickRef.current >= HEARTBEAT_SECS) {
        const delta = timeTickRef.current;
        timeTickRef.current = 0;
        sendHeartbeat(delta);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [courseId, ready, sendHeartbeat]);

  // Flush any accumulated time when leaving the page
  useEffect(() => {
    return () => {
      const delta = timeTickRef.current;
      if (!courseId || delta <= 0) return;
      try {
        const token = sessionStorage.getItem('auth_token');
        const url = `${API_BASE}/api/courses/${courseId}/time`;
        const body = JSON.stringify({ seconds: delta });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        } else {
          fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body, keepalive: true }).catch(() => {});
        }
      } catch (_) {}
    };
  }, [courseId]);

  const confirmContinue = useCallback(() => setShowCheckin(false), []);

  return { timeSpent, timeRequired, timeEnforce, showCheckin, confirmContinue };
}
