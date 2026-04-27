import { useCallback, useState } from 'react'
import { employees } from './data/employees'
import {
  useFilteredLeaderboard,
  type CategoryFilter,
  type QuarterFilter,
  type YearFilter,
} from './hooks/useFilteredLeaderboard'
import { FilterBar } from './components/FilterBar'
import { Header } from './components/Header'
import { LeaderboardRow } from './components/LeaderboardRow'
import { PodiumTop3 } from './components/PodiumTop3'

export default function App() {
  const [year, setYear] = useState<YearFilter>('all')
  const [quarter, setQuarter] = useState<QuarterFilter>('all')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  const ranked = useFilteredLeaderboard(
    employees,
    year,
    quarter,
    category,
    search,
  )
  const topThree = ranked.slice(0, 3)

  const toggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return (
    <div className="min-h-screen bg-page-bg px-4 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-4xl text-left">
        <Header />
        <FilterBar
          year={year}
          quarter={quarter}
          category={category}
          search={search}
          onYear={setYear}
          onQuarter={setQuarter}
          onCategory={setCategory}
          onSearch={setSearch}
        />

        {ranked.length === 0 ? (
          <p className="mt-12 text-center text-subtitle">
            No employees match the current filters.
          </p>
        ) : (
          <>
            <PodiumTop3 topThree={topThree} />
            <section aria-label="Full leaderboard" className="space-y-3">
              {ranked.map((person) => (
                <LeaderboardRow
                  key={person.id}
                  person={person}
                  expanded={expandedIds.has(person.id)}
                  onToggle={() => toggle(person.id)}
                />
              ))}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
