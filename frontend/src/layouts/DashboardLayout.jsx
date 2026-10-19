import { Outlet } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';

export default function DashboardLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 w-full max-w-full overflow-x-hidden">
        <div className="container mx-auto px-3 sm:px-4 py-5 sm:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
