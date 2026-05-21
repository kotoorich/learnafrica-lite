import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import io from 'socket.io-client';

const AuthContext = createContext();
// In production: VITE_API_URL = 'https://your-backend.up.railway.app'
// In development: empty string (Vite proxy forwards /api → localhost:5000)
const API_BASE = import.meta.env.VITE_API_URL || '';

async function api(endpoint, options = {}) {
  const token = sessionStorage.getItem('auth_token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  // Parse response safely - handle HTML error pages
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // Response was not JSON (likely an HTML error page)
    if (!res.ok) {
      throw new Error(`Server error (HTTP ${res.status}). Please try again.`);
    }
    throw new Error('Invalid response from server');
  }
  if (!res.ok) throw new Error(data.error || data.detail || `HTTP ${res.status}`);
  return data;
}

function parseUser(raw) {
  if (!raw) return null;
  const u = raw.id ? raw : (raw.user?.id ? raw.user : null);
  if (!u?.id) return null;
  return {
    id: u.id, name: u.name || '', email: u.email || '',
    role: u.role || 'student', avatar: u.avatar || null,
    bio: u.bio || '', location: u.location || '', website: u.website || '',
    instructor_status: u.instructor_status || 'none',
    stats: u.stats || {}, badges: Array.isArray(u.badges) ? u.badges : [],
    settings: u.settings || {}, created_at: u.created_at || null,
    enrollments: Array.isArray(u.enrollments) ? u.enrollments : [],
  };
}

function buildEnrollmentMap(enrollments) {
  const map = {};
  if (!Array.isArray(enrollments)) return map;
  enrollments.forEach(e => { if (e?.course_id) map[e.course_id] = e.progress ?? 0; });
  return map;
}

export function AuthProvider({ children }) {
  const [user, setUser]                         = useState(null);
  const [isLoading, setIsLoading]               = useState(true);
  const [notifications, setNotifications]       = useState([]);
  const [rawCourses, setRawCourses]             = useState([]);
  const [enrollmentMap, setEnrollmentMap]       = useState({});
  // Use a ref for socket so we never get stale closures in logout
  const socketRef = useRef(null);

  const courses = useMemo(() => rawCourses.map(c => ({
    ...c, progress: enrollmentMap[c.id] ?? 0, isEnrolled: c.id in enrollmentMap,
  })), [rawCourses, enrollmentMap]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      try { socketRef.current.disconnect(); } catch {}
      socketRef.current = null;
    }
  }, []);

  const initSocket = useCallback((token) => {
    if (!token) return;
    // Always disconnect any existing socket first
    disconnectSocket();
    try {
      const socketUrl = API_BASE || (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin);
    const s = io(socketUrl, {
        query: { token },
        transports: ['polling', 'websocket'], // polling first avoids invalid frame header
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        timeout: 10000,
      });
      s.on('connect', () => { console.log('✅ WebSocket connected'); window.__learnafricaSocket = s; });
      s.on('connect_error', (e) => console.warn('WS connect error:', e.message));
      s.on('disconnect', (reason) => {
        console.log('🔌 WS disconnected:', reason);
        if (reason === 'io client disconnect') { window.__learnafricaSocket = null; return; }
      });
      s.on('new_notification', (n) =>
        setNotifications(prev => [{ ...n, read: false }, ...prev])
      );
      socketRef.current = s;
    } catch (e) {
      console.warn('Socket init error:', e.message);
    }
  }, [disconnectSocket]);

  // ── Loaders ───────────────────────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    const raw = await api('/api/users/profile');
    const parsed = parseUser(raw);
    if (!parsed) throw new Error('Profile missing id');
    setEnrollmentMap(buildEnrollmentMap(raw.enrollments));
    setUser(parsed);
    return parsed;
  }, []);

  const loadCourses = useCallback(async () => {
    try {
      const { courses: data } = await api('/api/courses');
      setRawCourses(Array.isArray(data) ? data : []);
    } catch (e) { console.error('loadCourses:', e.message); }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const { notifications: data } = await api('/api/notifications');
      setNotifications(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      const token = sessionStorage.getItem('auth_token');
      if (token) {
        try {
          await api('/api/auth/verify');
          await loadProfile();
          await loadNotifications();
          initSocket(token);
        } catch (e) {
          console.warn('Session invalid:', e.message);
          sessionStorage.removeItem('auth_token');
          disconnectSocket();
        }
      }
      await loadCourses();
      setIsLoading(false);
    };
    init();
    // Cleanup on unmount
    return () => disconnectSocket();
  }, []); // eslint-disable-line

  // ── Auth Actions ──────────────────────────────────────────────────────────
  const login = useCallback(async ({ email, password }) => {
    const data = await api('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    });
    if (!data.token) throw new Error('No token in login response');
    sessionStorage.setItem('auth_token', data.token);
    const parsed = parseUser(data.user);
    if (!parsed) throw new Error('Login response missing user');
    setUser(parsed);
    setEnrollmentMap(buildEnrollmentMap(data.user?.enrollments));
    await loadCourses();
    await loadNotifications();
    initSocket(data.token);
    return parsed;
  }, [loadCourses, loadNotifications, initSocket]);

  const signup = useCallback(async (userData) => {
    const data = await api('/api/auth/signup', {
      method: 'POST', body: JSON.stringify(userData),
    });
    if (!data.token) throw new Error('No token in signup response');
    sessionStorage.setItem('auth_token', data.token);
    const parsed = parseUser(data.user);
    if (!parsed) throw new Error('Signup response missing user');
    setUser(parsed);
    setEnrollmentMap(buildEnrollmentMap(data.user?.enrollments));
    await loadCourses();
    initSocket(data.token);
    return parsed;
  }, [loadCourses, initSocket]);

  const logout = useCallback(async () => {
    // 1. Disconnect socket FIRST before clearing token
    disconnectSocket();
    // 2. Call API (best-effort)
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    // 3. Clear all state
    sessionStorage.removeItem('auth_token');
    setUser(null);
    setEnrollmentMap({});
    setNotifications([]);
    // 4. Reload public courses
    await loadCourses();
  }, [disconnectSocket, loadCourses]);

  // ── Profile / Settings ────────────────────────────────────────────────────
  const updateUser = useCallback(async (updates) => {
    const data = await api('/api/users/profile', {
      method: 'PUT', body: JSON.stringify(updates),
    });
    const fresh = parseUser(data.user || data);
    if (fresh) { setUser(fresh); setEnrollmentMap(buildEnrollmentMap(fresh.enrollments)); }
    else setUser(prev => prev ? { ...prev, ...updates } : prev);
    if (updates.settings) {
      try { await api('/api/users/settings', { method: 'PUT', body: JSON.stringify(updates.settings) }); } catch {}
    }
  }, []);

  // ── Progress ──────────────────────────────────────────────────────────────
  const updateProgress = useCallback(async (courseId, lessonId, score = null) => {
    const data = await api('/api/progress/update', {
      method: 'POST',
      body: JSON.stringify({ course_id: courseId, lesson_id: lessonId, quiz_score: score }),
    });
    setEnrollmentMap(prev => ({ ...prev, [courseId]: data.progress }));
    return data;
  }, []);

  const enrollInCourse = useCallback(async (courseId) => {
    await api(`/api/courses/${courseId}/enroll`, { method: 'POST' });
    await loadProfile();
    await loadCourses();
  }, [loadProfile, loadCourses]);

  // ── Notifications ─────────────────────────────────────────────────────────
  const markAsRead = useCallback(async (nid) => {
    try {
      await api(`/api/notifications/${nid}/read`, { method: 'PUT' });
      setNotifications(prev => prev.map(n => n.id === nid ? { ...n, read: true } : n));
    } catch {}
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await api('/api/notifications/read-all', { method: 'PUT' });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {}
  }, []);

  const deleteNotification = useCallback(async (nid) => {
    try {
      await api(`/api/notifications/${nid}`, { method: 'DELETE' });
      setNotifications(prev => prev.filter(n => n.id !== nid));
    } catch {}
  }, []);

  const value = useMemo(() => ({
    user, courses, isAuthenticated: !!user, isLoading,
    role: user?.role, notifications, unreadCount,
    login, signup, logout, updateUser, updateProgress,
    enrollInCourse, markAsRead, markAllAsRead, deleteNotification,
    refreshCourses: loadCourses,
    refreshProfile: loadProfile,
  }), [user, courses, isLoading, notifications, unreadCount,
      login, signup, logout, updateUser, updateProgress,
      enrollInCourse, markAsRead, markAllAsRead, deleteNotification, loadCourses, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
