import { ChevronDown, Search } from 'lucide-react'
import type { CategoryFilter, QuarterFilter, YearFilter } from '../hooks/useFilteredLeaderboard'
import {
  CATEGORY_OPTIONS,
  QUARTER_OPTIONS,
  YEAR_OPTIONS,
} from '../hooks/useFilteredLeaderboard'

interface FilterBarProps {
  year: YearFilter
  quarter: QuarterFilter
  category: CategoryFilter
  search: string
  onYear: (v: YearFilter) => void
  onQuarter: (v: QuarterFilter) => void
  onCategory: (v: CategoryFilter) => void
  onSearch: (v: string) => void
}

function SelectShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-w-0 shrink-0">
      <div className="pointer-events-none absolute right-2.5 top-1/2 z-10 -translate-y-1/2 text-gray-500">
        <ChevronDown className="size-4" aria-hidden />
      </div>
      {children}
    </div>
  )
}

export function FilterBar({
  year,
  quarter,
  category,
  search,
  onYear,
  onQuarter,
  onCategory,
  onSearch,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <SelectShell>
        <select
          aria-label="Year"
          value={year}
          onChange={(e) => onYear(e.target.value as YearFilter)}
          className="h-10 w-[140px] cursor-pointer appearance-none rounded-lg border border-gray-300 bg-gray-100 py-2 pl-3 pr-9 text-sm text-heading outline-none ring-accent focus:ring-2"
        >
          {YEAR_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </SelectShell>
      <SelectShell>
        <select
          aria-label="Quarter"
          value={quarter}
          onChange={(e) => onQuarter(e.target.value as QuarterFilter)}
          className="h-10 w-[150px] cursor-pointer appearance-none rounded-lg border border-gray-300 bg-gray-100 py-2 pl-3 pr-9 text-sm text-heading outline-none ring-accent focus:ring-2"
        >
          {QUARTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </SelectShell>
      <SelectShell>
        <select
          aria-label="Category"
          value={category}
          onChange={(e) => onCategory(e.target.value as CategoryFilter)}
          className="h-10 min-w-[160px] cursor-pointer appearance-none rounded-lg border border-gray-300 bg-gray-100 py-2 pl-3 pr-9 text-sm text-heading outline-none ring-accent focus:ring-2"
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </SelectShell>
      <div className="relative min-w-[200px] flex-1 basis-[220px]">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400"
          aria-hidden
        />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search employee..."
          className="h-10 w-full rounded-lg border border-gray-300 bg-gray-100 py-2 pl-10 pr-3 text-sm text-heading placeholder:text-gray-400 outline-none ring-accent focus:ring-2"
        />
      </div>
    </div>
  )
}
