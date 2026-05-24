import { useTheme } from '@/context/ThemeContext'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div
      onClick={toggleTheme}
      className="group flex md:h-9 h-14 cursor-pointer items-center md:justify-center rounded-lg bg-card border border-input px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hover:bg-accent"
    >
      <div className="ml-4 md:ml-0 flex md:w-full shrink-0 justify-start scale-110">
        {theme === 'light' ? (
          <Sun className="h-[18px] w-[18px] rotate-0 scale-100 dark:-rotate-90 dark:scale-0" />
        ) : (
          <Moon className="h-[18px] w-[18px] rotate-90 scale-0 dark:rotate-0 dark:scale-100" />
        )}
      </div>

      <span className=" ml-4 md:hidden sm:block  text-sm font-semibold text-foreground/80 transition-colors group-hover:text-primary">
        Toggle Theme
      </span>
    </div>
  )
}
