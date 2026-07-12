import { Link } from 'react-router-dom';
import { Button } from '../../components/common/Button';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <div className="relative">
          <h1 className="text-[150px] md:text-[200px] font-black text-muted/30 leading-none select-none">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-6xl animate-bounce">
              <svg className="w-24 h-24 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
        
        <h2 className="text-2xl md:text-3xl font-bold text-foreground mt-4">
          Page Not Found
        </h2>
        <p className="text-muted-foreground mt-2 max-w-md mx-auto">
          {"Oops! The page you're looking for seems to have wandered off. Let's get you back on track."}
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
          <Link to="/">
            <Button size="lg">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Go Home
            </Button>
          </Link>
          <Link to="/courses">
            <Button variant="outline" size="lg">
              Browse Courses
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
