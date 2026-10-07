import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/common/Toast';
import { Loader2 } from 'lucide-react';
import ErrorBoundary from './components/common/ErrorBoundary';

import MainLayout    from './layouts/MainLayout';
import DashboardLayout  from './layouts/DashboardLayout';
import InstructorLayout from './layouts/InstructorLayout';
import { AuthLayout }   from './layouts/AuthLayout';

import { LandingPage }          from './pages/Landing/LandingPage';
import { LoginPage }            from './pages/Auth/LoginPage';
import { SignupPage }           from './pages/Auth/SignupPage';
import { ForgotPasswordPage }   from './pages/Auth/ForgotPasswordPage';
import EmailVerificationPage    from './pages/Auth/EmailVerificationPage';
import InstructorOnboarding     from './pages/Auth/InstructorOnboarding';
import { CoursesPage }          from './pages/Courses/CoursesPage';
import { CourseDetailPage }     from './pages/Courses/CourseDetailPage';
import PaymentPage              from './pages/Payment/PaymentPage';
import PaymentReturnPage        from './pages/Payment/PaymentReturnPage';
import { LessonPage }           from './pages/Lessons/LessonPage';
import { PreviewCoursePage }    from './pages/Instructor/PreviewCoursePage';
import { QuizPage }             from './pages/Quiz/QuizPage';
import { QuizResultsPage }      from './pages/Quiz/QuizResultsPage';
import StudentDashboard         from './pages/Dashboard/StudentDashboard';
import { InstructorDashboard }  from './pages/Instructor/InstructorDashboard';
import { CreateCoursePage }     from './pages/Instructor/CreateCoursePage';
import { AnalyticsPage }        from './pages/Instructor/AnalyticsPage';
import ManageCoursesPage        from './pages/Instructor/ManageCoursesPage';
import { EditCoursePage }        from './pages/Instructor/EditCoursePage';
import InstructorCouponsPage    from './pages/Instructor/InstructorCouponsPage';
import ProfilePage              from './pages/Profile/ProfilePage';
import SettingsPage             from './pages/Settings/SettingsPage';
import CertificatePage          from './pages/Certificate/CertificatePage';
import LeaderboardPage          from './pages/Leaderboard/LeaderboardPage';
import NotFoundPage             from './pages/NotFound/NotFoundPage';
import AdminPage                from './pages/Admin/AdminPage';
import ReceiptsPage             from './pages/Receipts/ReceiptsPage';

// Shared full-screen loading state, used consistently by every route guard
// below instead of each one inventing its own behavior (previously
// ProtectedRoute showed a spinner while PublicOnlyRoute/StudentOnlyRoute
// silently rendered nothing, an inconsistent, confusing experience).
function RouteLoadingScreen() {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground animate-pulse">Please wait...</p>
      </div>
    </div>
  );
}

// ── Route Guards ──────────────────────────────────────────────────────────────
function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <RouteLoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    // Instructors go to instructor dashboard, not student dashboard
    if (user?.role === 'instructor') return <Navigate to="/instructor" replace />;
    if (['admin','superadmin'].includes(user?.role)) return <Navigate to="/admin" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

// The course catalogue is for visitors and students only.
function CatalogRoute({ children }) {
  const { isLoading, user } = useAuth();
  if (isLoading) return <RouteLoadingScreen />;
  if (['admin','superadmin'].includes(user?.role)) return <Navigate to="/admin" replace />;
  if (user?.role === 'instructor') return <Navigate to="/instructor" replace />;
  return children;
}

function PublicOnlyRoute({ children }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <RouteLoadingScreen />;
  if (isAuthenticated) {
    if (['admin','superadmin'].includes(user?.role)) return <Navigate to="/admin" replace />;
    if (user?.role === 'instructor') return <Navigate to="/instructor" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

// Students cannot access instructor routes and vice versa
function StudentOnlyRoute({ children }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return <RouteLoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (['instructor','admin','superadmin'].includes(user?.role)) return <Navigate to="/instructor" replace />;
  return children;
}

// ── App Gate ──────────────────────────────────────────────────────────────
// Shows a lightweight, animated spinner while the initial auth/session
// bootstrap runs (session verify + profile load). The bootstrap is deliberately
// short — it does NOT wait for notifications, the course catalogue or the
// WebSocket, which all load in the background — so the spinner appears briefly
// on a normal refresh and does not linger on a slow cold start.
function AppGate({ children }) {
  const { isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="relative mx-auto h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-primary/15" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
        </div>
      </div>
    );
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* ── Public ── */}
      <Route path="/" element={<MainLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="courses" element={<CatalogRoute><CoursesPage /></CatalogRoute>} />
        <Route path="courses/:courseId" element={<CourseDetailPage />} />
      </Route>

      {/* ── Auth ── */}
      <Route element={<AuthLayout />}>
        <Route path="login"           element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
        <Route path="signup"          element={<PublicOnlyRoute><SignupPage /></PublicOnlyRoute>} />
        <Route path="verify-email"    element={<PublicOnlyRoute><EmailVerificationPage /></PublicOnlyRoute>} />
        <Route path="forgot-password" element={<PublicOnlyRoute><ForgotPasswordPage /></PublicOnlyRoute>} />
        <Route path="signup/instructor-onboarding"
          element={<PublicOnlyRoute><InstructorOnboarding /></PublicOnlyRoute>} />
      </Route>

      {/* ── Payment (students only) ── */}
      <Route path="payment/return"
        element={<PaymentReturnPage />} />
      <Route path="payment/:courseId"
        element={<ProtectedRoute allowedRoles={['student']}><PaymentPage /></ProtectedRoute>} />

      {/* ── Student Dashboard ── */}
      <Route path="dashboard"
        element={<StudentOnlyRoute><DashboardLayout /></StudentOnlyRoute>}>
        <Route index element={<StudentDashboard />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
      </Route>

      {/* ── Shared profile / settings (all authenticated) ── */}
      <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route path="profile"  element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="receipts" element={<ReceiptsPage />} />
      </Route>

      {/* ── Certificate ── */}
      <Route path="/certificate/:courseId"
        element={<ProtectedRoute><CertificatePage /></ProtectedRoute>} />

      {/* ── Learning & Instructor Preview: use MainLayout (LearnAfrica nav on top) ── */}
      <Route path="/" element={<MainLayout />}>
        <Route path="instructor/preview/:courseId"
          element={<ProtectedRoute allowedRoles={['instructor','admin','superadmin']}><PreviewCoursePage /></ProtectedRoute>} />
        <Route path="learn/course/:courseId/lesson/:lessonId"
          element={<StudentOnlyRoute><LessonPage /></StudentOnlyRoute>} />
      </Route>

      {/* Quiz pages use DashboardLayout (navbar + container) ── */}
      <Route path="learn" element={<StudentOnlyRoute><DashboardLayout /></StudentOnlyRoute>}>
        <Route path="course/:courseId/quiz/:lessonId"         element={<QuizPage />} />
        <Route path="course/:courseId/quiz/:lessonId/results" element={<QuizResultsPage />} />
      </Route>

      {/* ── Instructor (instructor + admin only) ── */}
      <Route path="instructor"
        element={<ProtectedRoute allowedRoles={['instructor','admin','superadmin']}>
          <InstructorLayout />
        </ProtectedRoute>}>
        <Route index element={<InstructorDashboard />} />
        <Route path="courses"        element={<ManageCoursesPage />} />
        <Route path="courses/create"     element={<CreateCoursePage />} />
        <Route path="courses/edit/:courseId" element={<EditCoursePage />} />
        <Route path="coupons"        element={<InstructorCouponsPage />} />
        <Route path="analytics"      element={<AnalyticsPage />} />
        <Route path="receipts"       element={<ReceiptsPage />} />
        <Route path="settings"       element={<SettingsPage />} />
      </Route>

      {/* ── Admin ── */}
      <Route path="admin"
        element={<ProtectedRoute allowedRoles={['admin','superadmin']}>
          <DashboardLayout />
        </ProtectedRoute>}>
        <Route index element={<AdminPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <AppGate>
              <ErrorBoundary>
                <AppRoutes />
              </ErrorBoundary>
            </AppGate>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
