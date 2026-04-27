export type Quarter = 1 | 2 | 3 | 4

export type LeaderCategory =
  | 'Engineering'
  | 'Design'
  | 'Product'
  | 'QA'
  | 'Operations'

export interface ScoreBreakdownLine {
  label: string
  points: number
}

export interface Employee {
  id: string
  name: string
  roleTitle: string
  year: number
  quarter: Quarter
  category: LeaderCategory
  totalScore: number
  /** Podium-style talks / demos count */
  podiumCount: number
  /** Training sessions / workshops attended */
  trainingCount: number
  breakdown: ScoreBreakdownLine[]
  /** Seed for abstract avatar (DiceBear) */
  avatarSeed: string
}

export interface RankedEmployee extends Employee {
  rank: number
}
