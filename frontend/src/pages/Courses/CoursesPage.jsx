// src/pages/Courses/CoursesPage.jsx
import { useState, useMemo, useEffect, Suspense, lazy } from 'react';
import { Grid3X3, List, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import CourseCard from '@/components/course/CourseCard';
import { Button } from '@/components/common/Button';
import { SearchBar } from '@/components/course/SearchBar';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { CourseCardSkeleton } from '@/components/common/LoadingSkeleton';

const FilterPanel = lazy(() => import('@/components/course/FilterPanel'));

const CATEGORIES   = ['All Categories','Web Development','Data Science','Mobile Development','Marketing','Design','Cybersecurity','Business','Finance','Other'];
const DIFFICULTIES = ['All Levels','Beginner','Intermediate','Advanced'];

// Responsive items per page
function useItemsPerPage() {
  const [n, setN] = useState(12);
  useEffect(() => {
    const update = () => setN(window.innerWidth < 768 ? 6 : window.innerWidth < 1024 ? 8 : 12);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return n;
}

export function CoursesPage() {
  const { courses, isLoading } = useAuth();
  const itemsPerPage = useItemsPerPage();

  const [searchQuery,        setSearchQuery]        = useState('');
  const [selectedCategory,   setSelectedCategory]   = useState('All Categories');
  const [selectedDifficulty, setSelectedDifficulty] = useState('All Levels');
  const [sortBy,             setSortBy]             = useState('popular');
  const [viewMode,           setViewMode]           = useState('grid');
  const [showFilters,        setShowFilters]        = useState(false);
  const [currentPage,        setCurrentPage]        = useState(1);

  // Reset page on filter/search change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedCategory, selectedDifficulty, sortBy]);

  const filteredCourses = useMemo(() => {
    let result = [...courses];

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(c =>
        c.title?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.instructor_name?.toLowerCase().includes(q) ||
        c.category?.toLowerCase().includes(q) ||
        (Array.isArray(c.tags) && c.tags.some(t => t?.toLowerCase().includes(q)))
      );
    }

    if (selectedCategory !== 'All Categories') {
      result = result.filter(c => c.category === selectedCategory);
    }

    if (selectedDifficulty !== 'All Levels') {
      result = result.filter(c => c.difficulty === selectedDifficulty);
    }

    switch (sortBy) {
      case 'popular':  result.sort((a, b) => (b.enrollments||0) - (a.enrollments||0)); break;
      case 'newest':   result.sort((a, b) => new Date(b.created_at||0) - new Date(a.created_at||0)); break;
      case 'rating':   result.sort((a, b) => (b.rating||0) - (a.rating||0)); break;
      case 'price-low':  result.sort((a, b) => (a.price||0) - (b.price||0)); break;
      case 'price-high': result.sort((a, b) => (b.price||0) - (a.price||0)); break;
    }
    return result;
  }, [courses, searchQuery, selectedCategory, selectedDifficulty, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / itemsPerPage));

  const paginatedCourses = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    return filteredCourses.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);
  }, [filteredCourses, currentPage, itemsPerPage, totalPages]);

  // Clamp page if filters reduce totalPages
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(Math.max(1, totalPages));
  }, [currentPage, totalPages]);

  // Suggested tags when no results
  const suggestedTags = useMemo(() => {
    if (!searchQuery) return [];
    const allTags = courses.flatMap(c => c.tags || []);
    const counts  = allTags.reduce((acc, t) => { acc[t] = (acc[t]||0)+1; return acc; }, {});
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([t])=>t);
  }, [courses, searchQuery]);

  const clearFilters = () => { setSelectedCategory('All Categories'); setSelectedDifficulty('All Levels'); setSearchQuery(''); };

  const renderSkeletons = () => (
    <div className={cn('gap-6', viewMode === 'grid' ? 'grid md:grid-cols-2 xl:grid-cols-3' : 'flex flex-col')}>
      {[...Array(6)].map((_,i) => <CourseCardSkeleton key={i} />)}
    </div>
  );

  const renderPageNumbers = () => {
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage-1 && i <= currentPage+1)) {
        pages.push(
          <button key={i} onClick={() => setCurrentPage(i)}
            className={cn('h-10 min-w-[40px] rounded-lg text-sm font-medium transition-all',
              currentPage === i ? 'bg-primary text-primary-foreground shadow-md' : 'border border-input hover:bg-accent')}>
            {i}
          </button>
        );
      } else if (i === currentPage-2 || i === currentPage+2) {
        pages.push(<span key={`e${i}`} className="text-muted-foreground px-1">…</span>);
      }
    }
    return pages;
  };

  const startItem = filteredCourses.length === 0 ? 0 : (currentPage-1)*itemsPerPage+1;
  const endItem   = Math.min(currentPage*itemsPerPage, filteredCourses.length);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Explore Courses</h1>
        <p className="text-muted-foreground">Discover {courses.length}+ courses to boost your skills</p>
      </div>

      {/* Search + Controls */}
      <div className="flex flex-col lg:flex-row gap-4 mb-6">
        <div className="flex-1">
          <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search courses, topics, or instructors…" />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="popular">Most Popular</option>
            <option value="newest">Newest</option>
            <option value="rating">Highest Rated</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
          </select>
          <div className="hidden sm:flex items-center rounded-lg border border-input p-1">
            <button onClick={() => setViewMode('grid')}
              className={cn('flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}>
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button onClick={() => setViewMode('list')}
              className={cn('flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}>
              <List className="h-4 w-4" />
            </button>
          </div>
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="lg:hidden gap-2">
            <SlidersHorizontal className="h-4 w-4" /> Filters
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <aside className={cn('lg:w-64 shrink-0', showFilters ? 'block' : 'hidden lg:block')}>
          <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-xl" />}>
            <FilterPanel
              categories={CATEGORIES}
              difficulties={DIFFICULTIES}
              selectedCategory={selectedCategory}
              selectedDifficulty={selectedDifficulty}
              onCategoryChange={setSelectedCategory}
              onDifficultyChange={setSelectedDifficulty}
              onClear={clearFilters}
            />
          </Suspense>
        </aside>

        {/* Course grid */}
        <div className="flex-1">
          {/* Count row */}
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {filteredCourses.length === 0
                ? 'No courses found'
                : `Showing ${startItem}–${endItem} of ${filteredCourses.length} courses`}
            </p>
          </div>

          <Suspense fallback={renderSkeletons()}>
            {isLoading ? renderSkeletons()
            : filteredCourses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <SlidersHorizontal className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-bold mb-2">No courses found</h3>
                <p className="text-muted-foreground mb-6 max-w-xs">
                  {searchQuery ? `Nothing matched "${searchQuery}". Try one of these:` : 'Try adjusting your filters.'}
                </p>
                {suggestedTags.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2 mb-6">
                    {suggestedTags.map(tag => (
                      <button key={tag} onClick={() => setSearchQuery(tag)}
                        className="px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium hover:bg-primary hover:text-white transition-all">
                        #{tag}
                      </button>
                    ))}
                  </div>
                )}
                <Button variant="outline" onClick={clearFilters}>Clear All Filters</Button>
              </div>
            ) : (
              <>
                <div className={cn('gap-6', viewMode === 'grid' ? 'grid md:grid-cols-2 xl:grid-cols-3' : 'flex flex-col')}>
                  {paginatedCourses.map(course => (
                    <CourseCard key={course.id} course={course}
                      enrolled={course.isEnrolled || course.progress > 0}
                      searchQuery={searchQuery} />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="mt-12 flex items-center justify-center gap-2 sm:gap-4">
                    <Button variant="outline" onClick={() => setCurrentPage(p => Math.max(1, p-1))}
                      disabled={currentPage === 1} className="h-10 px-2 sm:px-4 rounded-xl gap-2">
                      <ChevronLeft className="h-4 w-4" />
                      <span className="hidden sm:inline">Previous</span>
                    </Button>
                    <div className="flex items-center gap-1 sm:gap-2">
                      {renderPageNumbers()}
                    </div>
                    <Button variant="outline" onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))}
                      disabled={currentPage === totalPages} className="h-10 px-2 sm:px-4 rounded-xl gap-2">
                      <span className="hidden sm:inline">Next</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
