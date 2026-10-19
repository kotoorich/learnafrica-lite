import { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Sidebar from '../components/layout/Sidebar';
import { Menu, Clock, XCircle, RefreshCw, CreditCard } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

/**
 * Instructor layout — wraps every /instructor/* route.
 * - Approved instructors and admins (admin / superadmin) get the full layout with Outlet.
 * - Pending instructors see "Application Pending" screen instead of any instructor work.
 * - Rejected instructors see "Application Rejected" screen.
 * - Approved instructors with no payout method see a "Set up payouts" gate.
 * - This guards ALL instructor pages at the layout level — Dashboard, Create, Edit, Manage,
 *   Analytics, Preview — without each page needing its own check.
 */
export default function InstructorLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user } = useAuth();

  // Admin and superadmin always bypass the pending/rejected gate (they manage instructors)
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const status = user?.instructor_status;

  // Pending — block all instructor work, show friendly message
  if (!isAdmin && status === 'pending') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center text-center space-y-5 px-4 py-12">
          <div className="h-24 w-24 rounded-full bg-warning/10 flex items-center justify-center">
            <Clock className="h-12 w-12 text-warning" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold">Application Pending</h2>
          <p className="text-muted-foreground max-w-md text-sm md:text-base">
            Your instructor application is being reviewed. You will be notified once approved.
            Refresh the page to check if approved.
          </p>
          <div className="w-full max-w-md p-4 rounded-xl border border-primary/30 bg-primary/[0.04] text-left">
            <p className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" /> Set up your payout method now
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Add the number or bank account where you want your earnings sent. You can do this
              while you wait — it means you are ready to publish the moment you are approved.
            </p>
            <Link to="/profile"
              className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
              <CreditCard className="h-4 w-4" /> Go to my Profile
            </Link>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-input bg-background font-semibold hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </main>
      </div>
    );
  }

  // Rejected — show rejection screen
  if (!isAdmin && status === 'rejected') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center text-center space-y-5 px-4 py-12">
          <div className="h-24 w-24 rounded-full bg-destructive/10 flex items-center justify-center">
            <XCircle className="h-12 w-12 text-destructive" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold">Application Rejected</h2>
          <p className="text-muted-foreground max-w-md text-sm md:text-base">
            Your instructor application was not approved. Please contact support for more information.
          </p>
        </main>
      </div>
    );
  }

  // Approved instructor but no payout method — block until they add one.
  if (!isAdmin && status === 'approved' && user?.payment_method_configured === false) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center text-center space-y-5 px-4 py-12">
          <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
            <CreditCard className="h-12 w-12 text-primary" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold">Set up your payout method</h2>
          <p className="text-muted-foreground max-w-md text-sm md:text-base">
            You are approved. Before you can create courses and earn, add the mobile money number
            or bank account where we should send your earnings.
          </p>
          <Link to="/profile"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
            <CreditCard className="h-4 w-4" /> Add payout method on my Profile
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-input bg-background font-semibold hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            I have added it — refresh
          </button>
        </main>
      </div>
    );
  }

  // Default — approved instructor or admin sees the full layout
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="flex">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <main className="flex-1 min-w-0 lg:ml-64">
          {/* Mobile sidebar toggle */}
          <div className="sticky top-16 z-30 flex items-center gap-4 border-b border-border bg-background px-4 py-3 lg:hidden">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-background shrink-0"
              aria-label="Open sidebar">
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-semibold text-sm text-foreground truncate">Instructor Dashboard</span>
          </div>
          <div className="p-4 sm:p-6 lg:p-8 max-w-full overflow-x-hidden">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
