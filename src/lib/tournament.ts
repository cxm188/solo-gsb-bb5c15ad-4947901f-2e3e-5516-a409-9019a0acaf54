import type { Match, Player, Round, TournamentState } from '../types'
import type { PairingPlayer } from '../types'

/** 一场比赛给选手带来的双倍积分 */
export function pointsFor(playerId: string, match: Match): number {
  if (!match.result) return 0
  if (match.result === 'D') return 1
  if (match.result === 'A' && match.aId === playerId) return 2
  if (match.result === 'B' && match.bId === playerId) return 2
  return 0
}

export interface Standing {
  id: string
  name: string
  seq: number
  score2: number
  score: number
  wins: number
  draws: number
  losses: number
  byes: number
  played: number
  /** 对手名称列表（用于展示） */
  opponents: string[]
}

/** 根据已提交的各轮计算积分榜 */
export function computeStandings(
  players: Player[],
  rounds: Round[],
): Standing[] {
  const map = new Map<string, Standing>()
  for (const p of players) {
    map.set(p.id, {
      id: p.id,
      name: p.name,
      seq: p.seq,
      score2: 0,
      score: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      byes: 0,
      played: 0,
      opponents: [],
    })
  }

  for (const round of rounds) {
    if (round.byeId) {
      const s = map.get(round.byeId)
      if (s) {
        s.byes += 1
        s.score2 += 2 // 轮空按胜计分
      }
    }
    for (const m of round.matches) {
      const a = map.get(m.aId)
      const b = map.get(m.bId)
      if (!a || !b) continue
      a.opponents.push(b.name)
      b.opponents.push(a.name)
      if (!m.result) continue
      a.played += 1
      b.played += 1
      if (m.result === 'D') {
        a.draws += 1
        b.draws += 1
        a.score2 += 1
        b.score2 += 1
      } else {
        const winner = m.result === 'A' ? a : b
        const loser = m.result === 'A' ? b : a
        winner.wins += 1
        loser.losses += 1
        winner.score2 += 2
      }
    }
  }

  const rows = [...map.values()]
  for (const s of rows) s.score = s.score2 / 2
  // 排名：积分降序，并列时按录入顺序（确定性）
  rows.sort((a, b) => b.score2 - a.score2 || a.seq - b.seq)
  return rows
}

/** 求解器所需的选手视图 */
export function toPairingPlayers(
  players: Player[],
  rounds: Round[],
): PairingPlayer[] {
  const standings = computeStandings(players, rounds)
  return standings.map((s) => ({
    id: s.id,
    name: s.name,
    seq: s.seq,
    score2: s.score2,
    byes: s.byes,
  }))
}

/** 某一轮是否所有对局结果都已录入（轮空不阻塞） */
export function isRoundComplete(round: Round): boolean {
  return round.matches.every((m) => m.result !== '')
}

/** 重算一轮的跨组数与积分差快照 */
export function roundStats(
  round: Round,
  players: PairingPlayer[],
): { crossCount: number; scoreDiffSum: number } {
  const byId = new Map(players.map((p) => [p.id, p]))
  let crossCount = 0
  let diff2Sum = 0
  for (const m of round.matches) {
    const a = byId.get(m.aId)
    const b = byId.get(m.bId)
    if (a && b) {
      if (a.score2 !== b.score2) crossCount++
      diff2Sum += Math.abs(a.score2 - b.score2)
    }
  }
  return { crossCount, scoreDiffSum: diff2Sum / 2 }
}

export function loadState(): TournamentState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TournamentState
    if (!Array.isArray(parsed.players) || !Array.isArray(parsed.rounds)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveState(state: TournamentState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const STORAGE_KEY = 'swiss-pairing-v1'
