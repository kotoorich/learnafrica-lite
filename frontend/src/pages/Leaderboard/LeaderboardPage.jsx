import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Star, Award, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/common/Card';
import { cn } from '../../lib/utils';
import { API_BASE } from '@/lib/api';

const timeframes = ['This Week', 'This Month', 'All Time'];
const categories = ['Overall', 'Courses', 'Badges', 'Streak'];

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [data, setData]           = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('All Time');
  const [category, setCategory]   = useState('Overall');

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const token = sessionStorage.getItem('auth_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${API_BASE}/api/leaderboard?timeframe=${encodeURIComponent(timeframe)}&category=${encodeURIComponent(category)}`,
          { headers }
        );
        if (res.ok) setData((await res.json()).leaderboard || []);
        else setData([]);
      } catch { setData([]); }
      setIsLoading(false);
    };
    load();
  }, [timeframe, category]);

  const getMedalColor = (rank) => {
    if (rank === 1) return 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white';
    if (rank === 2) return 'bg-gradient-to-r from-slate-300 to-slate-400 text-slate-800';
    if (rank === 3) return 'bg-gradient-to-r from-amber-600 to-amber-700 text-white';
    return 'bg-muted text-muted-foreground';
  };

  const getMedalIcon = (rank) => {
    const cls = { 1:'text-yellow-500', 2:'text-slate-400', 3:'text-amber-600' };
    if (rank <= 3) return <Award className={cn('w-6 h-6', cls[rank])} fill="currentColor" strokeWidth={0} />;
    return <span className="text-muted-foreground font-bold text-sm">#{rank}</span>;
  };

  // Find logged-in user's rank in the leaderboard data
  const myEntry = data.find(e => e.id === user?.id || e.name === user?.name);

  if (isLoading) return (
    <div className="flex justify-center items-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  const top3 = data.slice(0, 3);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Leaderboard</h1>
        <p className="text-muted-foreground mt-2">See how you rank among other learners</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8 flex-wrap">
        <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
          {timeframes.map(tf => (
            <button key={tf} onClick={() => setTimeframe(tf)}
              className={cn('px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all',
                timeframe === tf ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground')}>
              {tf}
            </button>
          ))}
        </div>
        <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
          {categories.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)}
              className={cn('px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all',
                category === cat ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground')}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Podium — top 3 */}
      {top3.length >= 3 && (
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-8">
          {/* 2nd place */}
          <div className="flex flex-col items-center">
            <Card className="w-full text-center pt-6 sm:pt-8 pb-4 sm:pb-6 bg-gradient-to-b from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 border-slate-300 dark:border-slate-700">
              <div className="relative inline-block mx-auto">
                <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-lg sm:text-2xl font-bold text-slate-800 mx-auto">
                  {top3[1]?.initial}
                </div>
                <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 sm:w-8 sm:h-8 bg-slate-400 rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm shadow-lg">2</div>
              </div>
              <h3 className="mt-3 font-bold text-xs sm:text-base text-foreground truncate px-2">{top3[1]?.name}</h3>
              <p className="text-lg sm:text-2xl font-bold text-slate-500 mt-1">{(top3[1]?.points||0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">pts</p>
            </Card>
          </div>

          {/* 1st place */}
          <div className="-mt-4 flex flex-col items-center relative">
            <Card className="w-full text-center pt-8 sm:pt-10 pb-6 sm:pb-8 bg-gradient-to-b from-yellow-100 to-amber-50 dark:from-yellow-900/30 dark:to-amber-900/20 border-yellow-300 dark:border-yellow-700 shadow-xl">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Star className="w-8 h-8 sm:w-12 sm:h-12 text-yellow-500" fill="currentColor" strokeWidth={0} />
              </div>
              <div className="relative inline-block mx-auto">
                <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center text-xl sm:text-3xl font-bold text-white mx-auto ring-2 sm:ring-4 ring-yellow-300 dark:ring-yellow-600">
                  {top3[0]?.initial}
                </div>
                <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 sm:w-10 sm:h-10 bg-yellow-500 rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm shadow-lg">1</div>
              </div>
              <h3 className="mt-3 font-bold text-sm sm:text-lg text-foreground truncate px-2">{top3[0]?.name}</h3>
              <p className="text-xl sm:text-3xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">{(top3[0]?.points||0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">pts</p>
              <div className="hidden sm:flex justify-center gap-3 mt-3 text-xs text-muted-foreground">
                <span>{top3[0]?.courses} courses</span>
                <span>{top3[0]?.streak}d streak</span>
              </div>
            </Card>
          </div>

          {/* 3rd place */}
          <div className="flex flex-col items-center">
            <Card className="w-full text-center pt-6 sm:pt-8 pb-4 sm:pb-6 bg-gradient-to-b from-amber-100 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/20 border-amber-300 dark:border-amber-700">
              <div className="relative inline-block mx-auto">
                <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-lg sm:text-2xl font-bold text-white mx-auto">
                  {top3[2]?.initial}
                </div>
                <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 sm:w-8 sm:h-8 bg-amber-600 rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm shadow-lg">3</div>
              </div>
              <h3 className="mt-3 font-bold text-xs sm:text-base text-foreground truncate px-2">{top3[2]?.name}</h3>
              <p className="text-lg sm:text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{(top3[2]?.points||0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">pts</p>
            </Card>
          </div>
        </div>
      )}

      {/* Full table */}
      <Card>
        <CardHeader><CardTitle>Full Rankings</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 sm:p-4 text-sm font-medium text-muted-foreground">Rank</th>
                  <th className="text-left p-3 sm:p-4 text-sm font-medium text-muted-foreground">Learner</th>
                  <th className="text-right p-3 sm:p-4 text-sm font-medium text-muted-foreground">Points</th>
                  <th className="text-right p-3 sm:p-4 text-sm font-medium text-muted-foreground hidden sm:table-cell">Courses</th>
                  <th className="text-right p-3 sm:p-4 text-sm font-medium text-muted-foreground hidden md:table-cell">Badges</th>
                  <th className="text-right p-3 sm:p-4 text-sm font-medium text-muted-foreground hidden lg:table-cell">Streak</th>
                </tr>
              </thead>
              <tbody>
                {data.map((entry, idx) => {
                  const isMe = entry.id === user?.id || entry.name === user?.name;
                  return (
                    <tr key={idx} className={cn('border-b border-border transition-colors',
                      isMe ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-muted/50',
                      idx < 3 ? 'bg-primary/5' : '')}>
                      <td className="p-3 sm:p-4">
                        <div className="flex items-center justify-center w-8">
                          {getMedalIcon(entry.rank)}
                        </div>
                      </td>
                      <td className="p-3 sm:p-4">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className={cn('w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold shrink-0',
                            isMe ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' : getMedalColor(entry.rank))}>
                            {entry.initial}
                          </div>
                          <span className="font-medium text-foreground text-sm truncate max-w-[100px] sm:max-w-none">
                            {entry.name}{isMe ? ' (You)' : ''}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 sm:p-4 text-right font-semibold text-foreground text-sm">
                        {(entry.points||0).toLocaleString()}
                      </td>
                      <td className="p-3 sm:p-4 text-right text-muted-foreground text-sm hidden sm:table-cell">
                        {entry.courses}
                      </td>
                      <td className="p-3 sm:p-4 text-right text-muted-foreground text-sm hidden md:table-cell">
                        {entry.badges}
                      </td>
                      <td className="p-3 sm:p-4 text-right hidden lg:table-cell">
                        <span className="inline-flex items-center gap-1 text-accent text-sm">
                          🔥 {entry.streak}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data.length === 0 && (
              <div className="py-12 text-center text-muted-foreground text-sm">
                No leaderboard data yet. Start learning to earn points!
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
