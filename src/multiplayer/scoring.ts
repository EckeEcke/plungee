import type { MatchRound, MatchTotals } from './connection'

/** Placement points for up to eight racers; unfinished runs receive zero. */
const PLACE_POINTS = [8, 7, 6, 5, 4, 3, 2, 1] as const

/** Competition ranking: exact ties (ticks AND deaths) share the same place. */
export function roundPlacements(round: MatchRound): Record<string, number> {
  const finished = round.playerIds
    .filter(id => round.results[id]?.finished)
    .sort((a, b) => {
      const left = round.results[a]!
      const right = round.results[b]!
      return left.ticks - right.ticks || left.deaths - right.deaths
    })
  const places: Record<string, number> = {}
  finished.forEach((id, index) => {
    const result = round.results[id]!
    const previousId = finished[index - 1]
    const previous = previousId === undefined ? undefined : round.results[previousId]
    places[id] = previous && result.ticks === previous.ticks && result.deaths === previous.deaths
      ? places[previousId]!
      : index + 1
  })
  return places
}

export function roundPoints(round: MatchRound): Record<string, number> {
  const points: Record<string, number> = Object.fromEntries(round.playerIds.map(id => [id, 0]))
  for (const [id, place] of Object.entries(roundPlacements(round))) {
    points[id] = PLACE_POINTS[place - 1] ?? 0
  }
  return points
}

export function addRoundTotals(totals: Record<string, MatchTotals>, round: MatchRound): Record<string, MatchTotals> {
  const points = roundPoints(round)
  const next: Record<string, MatchTotals> = Object.fromEntries(
    Object.entries(totals).map(([id, total]) => [id, { ...total }]),
  )
  for (const id of round.playerIds) {
    const result = round.results[id]
    const previous = next[id] ?? { points: 0, ticks: 0, deaths: 0, dnfs: 0 }
    next[id] = {
      points: previous.points + (points[id] ?? 0),
      ticks: previous.ticks + (result?.finished ? result.ticks : 0),
      deaths: previous.deaths + (result?.deaths ?? 0),
      dnfs: previous.dnfs + (result?.finished ? 0 : 1),
    }
  }
  return next
}

export function compareTotals(a: MatchTotals, b: MatchTotals): number {
  // An incomplete race must not win the time tiebreak by contributing zero ticks.
  return b.points - a.points || a.dnfs - b.dnfs || a.ticks - b.ticks || a.deaths - b.deaths
}
