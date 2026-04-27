import { useMemo } from 'react'
import type { Employee, LeaderCategory, RankedEmployee } from '../types'

export type YearFilter = 'all' | string
export type QuarterFilter = 'all' | string
export type CategoryFilter = 'all' | LeaderCategory

export function useFilteredLeaderboard(
  source: Employee[],
  year: YearFilter,
  quarter: QuarterFilter,
  category: CategoryFilter,
  search: string,
): RankedEmployee[] {
  return useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = source.filter((e) => {
      if (year !== 'all' && String(e.year) !== year) return false
      if (quarter !== 'all' && String(e.quarter) !== quarter) return false
      if (category !== 'all' && e.category !== category) return false
      if (q && !e.name.toLowerCase().includes(q)) return false
      return true
    })
    const sorted = [...filtered].sort((a, b) => b.totalScore - a.totalScore)
    return sorted.map((e, i) => ({ ...e, rank: i + 1 }))
  }, [source, year, quarter, category, search])
}

export const YEAR_OPTIONS: { value: YearFilter; label: string }[] = [
  { value: 'all', label: 'All Years' },
  { value: '2024', label: '2024' },
  { value: '2025', label: '2025' },
]

export const QUARTER_OPTIONS: { value: QuarterFilter; label: string }[] = [
  { value: 'all', label: 'All Quarters' },
  { value: '1', label: 'Q1' },
  { value: '2', label: 'Q2' },
  { value: '3', label: 'Q3' },
  { value: '4', label: 'Q4' },
]

export const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'Engineering', label: 'Engineering' },
  { value: 'Design', label: 'Design' },
  { value: 'Product', label: 'Product' },
  { value: 'QA', label: 'QA' },
  { value: 'Operations', label: 'Operations' },
]
