import {
  ChevronDown,
  GraduationCap,
  Presentation,
  Star,
} from 'lucide-react'
import type { RankedEmployee } from '../types'
import { avatarUrl } from '../lib/avatarUrl'

function PodiumIcon() {
  return <Presentation className="size-5 text-sky-400" aria-hidden />
}

function TrainingIcon() {
  return <GraduationCap className="size-5 text-sky-400" aria-hidden />
}

export function LeaderboardRow({
  person,
  expanded,
  onToggle,
}: {
  person: RankedEmployee
  expanded: boolean
  onToggle: () => void
}) {
  const showTraining = person.trainingCount > 0

  return (
    <article className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-100">
      <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <span
            className="w-8 shrink-0 text-center text-lg font-bold tabular-nums text-heading"
            aria-label={`Rank ${person.rank}`}
          >
            {person.rank}
          </span>
          <img
            src={avatarUrl(person.avatarSeed)}
            alt=""
            width={48}
            height={48}
            className="size-12 shrink-0 rounded-full border border-gray-200 bg-gray-50 object-cover"
          />
          <div className="min-w-0 text-left">
            <p className="truncate font-semibold text-heading">{person.name}</p>
            <p className="truncate text-sm text-subtitle">{person.roleTitle}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4 sm:gap-5">
          <div className="flex items-end gap-5 pr-1">
            {showTraining ? (
              <div className="flex flex-col items-center gap-1">
                <TrainingIcon />
                <span className="text-xs font-medium text-gray-600">
                  {person.trainingCount}
                </span>
              </div>
            ) : null}
            <div className="flex flex-col items-center gap-1">
              <PodiumIcon />
              <span className="text-xs font-medium text-gray-600">
                {person.podiumCount}
              </span>
            </div>
          </div>

          <div className="hidden h-12 w-px bg-gray-200 sm:block" aria-hidden />

          <div className="flex flex-col items-start gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
              Total
            </span>
            <div className="flex items-center gap-1.5">
              <Star
                className="size-5 shrink-0 fill-accent text-accent"
                aria-hidden
              />
              <span className="text-2xl font-bold tabular-nums text-accent">
                {person.totalScore}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-accent-deep transition hover:bg-sky-100"
          >
            <ChevronDown
              className={`size-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
          <p className="mb-2 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
            Points breakdown
          </p>
          <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 bg-white text-left text-sm">
            {person.breakdown.map((line) => (
              <li
                key={line.label}
                className="flex items-center justify-between gap-4 px-3 py-2.5"
              >
                <span className="text-heading">{line.label}</span>
                <span className="font-semibold tabular-nums text-accent-deep">
                  +{line.points}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  )
}
