import { Filter, X, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function FilterPanel({
  categories,
  difficulties,
  selectedCategory,
  selectedDifficulty,
  onCategoryChange,
  onDifficultyChange,
  onClear
}) {
  const hasFilters = selectedCategory !== 'All Categories' || selectedDifficulty !== 'All Levels'

  return (
    <div className="flex flex-col gap-8 py-2">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider">
          <Filter className="h-4 w-4" />
          Filters
        </div>
        {hasFilters && (
          <button
            onClick={onClear}
            className="flex items-center gap-1 text-xs font-medium text-destructive hover:underline transition-all"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        )}
      </div>

      {/* Category Filter - Vertical scrollable list */}
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase text-muted-foreground/70">
          Category
        </label>
        <div className="flex flex-col gap-1 max-h-[400px] overflow-y-auto pr-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => onCategoryChange(category)}
              className={cn(
                'group flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-all',
                selectedCategory === category
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <span className="truncate">{category}</span>
              {selectedCategory !== category && (
                <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Difficulty Filter - Pills */}
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase text-muted-foreground/70">
          Difficulty
        </label>
        <div className="flex flex-wrap gap-2">
          {difficulties.map((difficulty) => (
            <button
              key={difficulty}
              onClick={() => onDifficultyChange(difficulty)}
              className={cn(
                'rounded-full px-4 py-1.5 text-xs font-semibold border transition-all active:scale-95',
                selectedDifficulty === difficulty
                  ? 'bg-primary text-background border-primary'
                  : 'border-input hover:border-accent/50 hover:bg-accent'
              )}
            >
              {difficulty}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
