import { Crown, Star } from 'lucide-react'
import type { RankedEmployee } from '../types'
import { avatarUrl } from '../lib/avatarUrl'

function ScoreBadge({ score }: { score: number }) {
  return (
    <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-semibold text-accent-deep">
      <Star className="size-4 fill-accent text-accent" aria-hidden />
      {score}
    </div>
  )
}

function PodiumColumn({
  place,
  person,
  pillarClass,
  heightClass,
  avatarRingClass,
}: {
  place: 1 | 2 | 3
  person?: RankedEmployee
  pillarClass: string
  heightClass: string
  avatarRingClass: string
}) {
  const digit = String(place)
  if (!person) {
    return (
      <div className="flex w-full max-w-[220px] flex-1 flex-col items-center">
        <div className="mb-3 h-28 w-full rounded-lg border border-dashed border-gray-200 bg-white/60" />
        <div
          className={`relative mt-auto flex w-full ${heightClass} flex-col items-center justify-end overflow-hidden rounded-t-xl border border-gray-100 bg-gray-100/80`}
        >
          <span className="mb-4 text-7xl font-bold text-gray-300/50">
            {digit}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-[220px] flex-1 flex-col items-center text-center">
      <div className="flex min-h-[120px] flex-col items-center px-1">
        <ScoreBadge score={person.totalScore} />
        <p className="max-w-full truncate text-base font-bold text-heading">
          {person.name}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-subtitle">
          {person.roleTitle}
        </p>
        <img
          src={avatarUrl(person.avatarSeed)}
          alt=""
          width={72}
          height={72}
          className={`mt-3 size-[72px] rounded-full border-4 bg-white object-cover ${avatarRingClass}`}
        />
      </div>
      <div
        className={`relative mt-3 flex w-full ${heightClass} flex-col items-center justify-end overflow-hidden rounded-t-xl border border-black/5 shadow-[inset_0_2px_6px_rgba(255,255,255,0.65)] ${pillarClass}`}
      >
        <span className="pointer-events-none mb-2 select-none text-8xl font-bold leading-none text-black/10">
          {digit}
        </span>
      </div>
    </div>
  )
}

export function PodiumTop3({ topThree }: { topThree: RankedEmployee[] }) {
  const second = topThree[1]
  const first = topThree[0]
  const third = topThree[2]

  return (
    <section className="mb-10 mt-8" aria-label="Top three">
      <div className="mx-auto flex max-w-3xl items-end justify-center gap-3 sm:gap-6 md:gap-10">
        <PodiumColumn
          place={2}
          person={second}
          pillarClass="bg-gradient-to-b from-podium-silver-from to-podium-silver-to"
          heightClass="h-[200px] sm:h-[220px]"
          avatarRingClass="border-gray-200"
        />
        <div className="relative flex w-full max-w-[240px] flex-1 flex-col items-center">
          {first ? (
            <div className="absolute -top-8 left-1/2 z-20 -translate-x-1/2 text-amber-500 drop-shadow-sm">
              <Crown className="size-9 fill-amber-400 text-amber-600" aria-hidden />
            </div>
          ) : null}
          <PodiumColumn
            place={1}
            person={first}
            pillarClass="bg-gradient-to-b from-podium-gold-from to-podium-gold-to"
            heightClass="h-[260px] sm:h-[280px]"
            avatarRingClass="border-amber-400 ring-2 ring-amber-300/80"
          />
        </div>
        <PodiumColumn
          place={3}
          person={third}
          pillarClass="bg-gradient-to-b from-podium-silver-from to-podium-silver-to"
          heightClass="h-[168px] sm:h-[180px]"
          avatarRingClass="border-gray-200"
        />
      </div>
    </section>
  )
}
