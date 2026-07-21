import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import CouponsManager from '@/components/common/CouponsManager';
import { API_BASE } from '@/lib/api';

/**
 * Instructor's coupons management page. Fetches the instructor's own courses
 * so they can pick one when creating a course-specific coupon.
 */
export default function InstructorCouponsPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = sessionStorage.getItem('auth_token');
    fetch(`${API_BASE}/api/instructor/courses`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { courses: [] })
      .then(d => setCourses((d.courses || []).map(c => ({ id: c.id, title: c.title }))))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary/50" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <CouponsManager role="instructor" myCourses={courses} />
    </div>
  );
}
