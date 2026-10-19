import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';

export default function MainLayout() {
  const { pathname } = useLocation();
  // Lesson pages (student lessons and instructor preview) are a focused learning
  // environment — hide the marketing footer there so the page ends at the
  // bottom navigation bar.
  const hideFooter = /^\/learn\/course\/[^/]+\/lesson\//.test(pathname)
    || /^\/instructor\/preview\//.test(pathname);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      {!hideFooter && <Footer />}
    </div>
  );
}
