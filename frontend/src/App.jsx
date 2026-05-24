import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
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
import InstructorOnboarding     from './pages/Auth/InstructorOnboarding';
import { CoursesPage }          from './pages/Courses/CoursesPage';
import { CourseDetailPage }     from './pages/Courses/CourseDetailPage';
import PaymentPage              from './pages/Payment/PaymentPage';
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
import ProfilePage              from './pages/Profile/ProfilePage';
import SettingsPage             from './pages/Settings/SettingsPage';
import CertificatePage          from './pages/Certificate/CertificatePage';
import LeaderboardPage          from './pages/Leaderboard/LeaderboardPage';
import NotFoundPage             from './pages/NotFound/NotFoundPage';
import AdminPage                from './pages/Admin/AdminPage';

// ── Route Guards ──────────────────────────────────────────────────────────────
function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return (
    <div className="h-screen w-full flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    // Instructors go to instructor dashboard, not student dashboard
    if (user?.role === 'instructor') return <Navigate to="/instructor" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function PublicOnlyRoute({ children }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  if (isLoading) return null;
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
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (['instructor','admin','superadmin'].includes(user?.role)) return <Navigate to="/instructor" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* ── Public ── */}
      <Route path="/" element={<MainLayout />}>
        <Route index element={<LandingPage />} />
        <Route path="courses" element={<CoursesPage />} />
        <Route path="courses/:courseId" element={<CourseDetailPage />} />
      </Route>

      {/* ── Auth ── */}
      <Route element={<AuthLayout />}>
        <Route path="login"           element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
        <Route path="signup"          element={<PublicOnlyRoute><SignupPage /></PublicOnlyRoute>} />
        <Route path="forgot-password" element={<PublicOnlyRoute><ForgotPasswordPage /></PublicOnlyRoute>} />
        <Route path="signup/instructor-onboarding"
          element={<PublicOnlyRoute><InstructorOnboarding /></PublicOnlyRoute>} />
      </Route>

      {/* ── Payment (authenticated, any role) ── */}
      <Route path="payment/:courseId"
        element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />

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
        <Route path="analytics"      element={<AnalyticsPage />} />
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
        <AuthProvider>
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
