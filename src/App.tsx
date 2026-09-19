import { useEffect, useMemo, useState } from 'react'
import type { LockedPair, Match, MatchResult, Round, TournamentState } from './types'
import { solveSwiss } from './solver/solver'
import {
  computeStandings,
  isRoundComplete,
  loadState,
  roundStats,
  saveState,
  toPairingPlayers,
} from './lib/tournament'
import { PlayerManager } from './components/PlayerManager'
import { Standings } from './components/Standings'
import { RoundView } from './components/RoundView'
import { DraftRound } from './components/DraftRound'
import { LockPanel } from './components/LockPanel'

let idCounter = 0
const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}`

export function App() {
  const [state, setState] = useState<TournamentState>(() =>
    loadState() ?? { players: [], rounds: [] },
  )
  // 下一轮（尚未提交）的人工锁定对局
  const [draftLocks, setDraftLocks] = useState<LockedPair[]>([])

  useEffect(() => {
    saveState(state)
  }, [state])

  const { players, rounds } = state
  const started = rounds.length > 0
  const lastRound = rounds[rounds.length - 1]
  const playerCountOk = players.length > 0 && players.length <= 32
  const lastComplete = !started || (!!lastRound && isRoundComplete(lastRound))
  const canGenerate = playerCountOk && lastComplete

  const pairingPlayers = useMemo(
    () => toPairingPlayers(players, rounds),
    [players, rounds],
  )
  const standings = useMemo(
    () => computeStandings(players, rounds),
    [players, rounds],
  )
  const nameOf = useMemo(() => {
    const m = new Map(players.map((p) => [p.id, p.name]))
    return (id: string | null) => (id === null ? '' : (m.get(id) ?? id))
  }, [players])

  // ---- 选手管理（开赛后名单锁定） ----
  function addPlayers(names: string[]) {
    setState((s) => {
      const baseSeq = s.players.length
      const fresh = names.map((name, i) => ({
        id: uid('p'),
        name: name.trim(),
        seq: baseSeq + i,
      }))
      return { ...s, players: [...s.players, ...fresh] }
    })
  }

  function removePlayer(id: string) {
    setState((s) => ({ ...s, players: s.players.filter((p) => p.id !== id) }))
  }

  function clearAll() {
    if (!window.confirm('确定清空全部选手与赛程记录？此操作不可恢复。')) return
    setState({ players: [], rounds: [] })
    setDraftLocks([])
  }

  // ---- 下一轮草稿：锁定变化即自动重算其余配对 ----
  const draftSolution = useMemo(() => {
    if (!canGenerate) return null
    return solveSwiss(pairingPlayers, rounds, draftLocks)
  }, [canGenerate, pairingPlayers, rounds, draftLocks])

  function addLock(pair: LockedPair) {
    setDraftLocks((ls) => [...ls, pair])
  }

  function removeLock(index: number) {
    setDraftLocks((ls) => ls.filter((_, i) => i !== index))
  }

  function unlockPair(aId: string, bId: string) {
    setDraftLocks((ls) =>
      ls.filter(
        (l) =>
          !(
            (l.aId === aId && l.bId === bId) ||
            (l.aId === bId && l.bId === aId)
          ),
      ),
    )
  }

  function commitDraft() {
    if (!draftSolution?.ok) return
    const lockedKey = (aId: string, bId: string) =>
      draftLocks.some(
        (l) =>
          (l.aId === aId && l.bId === bId) ||
          (l.aId === bId && l.bId === aId),
      )
    const matches: Match[] = draftSolution.pairs.map((p) => ({
      id: uid('m'),
      aId: p.aId,
      bId: p.bId,
      result: '',
      locked: lockedKey(p.aId, p.bId),
      crossGroup: p.crossGroup,
    }))
    const provisional: Round = {
      byeId: draftSolution.byeId,
      matches,
      crossCount: draftSolution.crossCount,
      scoreDiffSum: draftSolution.diff2Sum / 2,
      complete: false,
    }
    const stats = roundStats(provisional, pairingPlayers)
    setState((s) => ({
      ...s,
      rounds: [
        ...s.rounds,
        { ...provisional, crossCount: stats.crossCount, scoreDiffSum: stats.scoreDiffSum },
      ],
    }))
    setDraftLocks([])
  }

  // ---- 历史轮操作 ----
  function setResult(roundIndex: number, matchId: string, result: MatchResult) {
    setState((s) => ({
      ...s,
      rounds: s.rounds.map((r, i) => {
        if (i !== roundIndex) return r
        const matches = r.matches.map((m) =>
          m.id === matchId ? { ...m, result } : m,
        )
        return { ...r, matches, complete: matches.every((m) => m.result !== '') }
      }),
    }))
  }

  function toggleMatchLock(roundIndex: number, matchId: string) {
    setState((s) => ({
      ...s,
      rounds: s.rounds.map((r, i) =>
        i !== roundIndex
          ? r
          : {
              ...r,
              matches: r.matches.map((m) =>
                m.id === matchId ? { ...m, locked: !m.locked } : m,
              ),
            },
      ),
    }))
  }

  /** 重算某轮未锁定对局；未锁定对局上已录入的赛果随之清空 */
  function recomputeRound(roundIndex: number) {
    setState((s) => {
      const round = s.rounds[roundIndex]
      const priorRounds = s.rounds.slice(0, roundIndex)
      const lockedPairs: LockedPair[] = round.matches
        .filter((m) => m.locked)
        .map((m) => ({ aId: m.aId, bId: m.bId }))

      const pp = toPairingPlayers(s.players, priorRounds)
      const sol = solveSwiss(pp, priorRounds, lockedPairs)
      if (!sol.ok) {
        window.alert(
          '约束无解，冲突原因：\n\n' +
            sol.conflicts.map((c, i) => `${i + 1}. ${c}`).join('\n'),
        )
        return s
      }

      const lockedIds = new Set(lockedPairs.flatMap((l) => [l.aId, l.bId]))
      const kept = round.matches.filter((m) => m.locked)
      const regenerated: Match[] = sol.pairs
        .filter((p) => !lockedIds.has(p.aId) && !lockedIds.has(p.bId))
        .map((p) => ({
          id: uid('m'),
          aId: p.aId,
          bId: p.bId,
          result: '',
          locked: false,
          crossGroup: p.crossGroup,
        }))
      const provisional: Round = {
        byeId: sol.byeId,
        matches: [...kept, ...regenerated],
        crossCount: sol.crossCount,
        scoreDiffSum: sol.diff2Sum / 2,
        complete: false,
      }
      const stats = roundStats(provisional, pp)
      const rounds2 = [...s.rounds]
      rounds2[roundIndex] = {
        ...provisional,
        crossCount: stats.crossCount,
        scoreDiffSum: stats.scoreDiffSum,
      }
      return { ...s, rounds: rounds2 }
    })
  }

  function deleteRound(index: number) {
    if (!window.confirm(`确定删除第 ${index + 1} 轮？该轮及其后所有轮次都会被删除。`))
      return
    setState((s) => ({ ...s, rounds: s.rounds.slice(0, index) }))
    setDraftLocks([])
  }

  const busy = started && !!lastRound && !isRoundComplete(lastRound)

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎲 瑞士制配对 · 桌游联赛</h1>
        <p className="subtitle">
          胜 1 分 / 平 0.5 分 / 负 0 分 · 轮空按胜计 1 分 · 最多 32 名选手
        </p>
      </header>

      <main className="layout">
        <section className="col-main">
          <PlayerManager
            players={players}
            rosterLocked={started}
            onAdd={addPlayers}
            onRemove={removePlayer}
            onClearAll={clearAll}
          />

          {players.length > 0 && (
            <Standings rows={standings} roundCount={rounds.length} />
          )}

          {rounds.map((round, i) => (
            <RoundView
              key={i}
              round={round}
              roundIndex={i}
              nameOf={nameOf}
              onSetResult={setResult}
              onToggleLock={toggleMatchLock}
              onRecompute={recomputeRound}
              onDelete={deleteRound}
            />
          ))}

          {(!busy || !started) && playerCountOk && draftSolution && (
            <DraftRound
              roundNo={rounds.length + 1}
              solution={draftSolution}
              locks={draftLocks}
              nameOf={nameOf}
              onAddLock={addLock}
              onRemoveLock={removeLock}
              onUnlockPair={unlockPair}
              onCommit={commitDraft}
            />
          )}

          {busy && lastRound && (
            <div className="card notice">
              <strong>第 {rounds.length} 轮尚未完成：</strong>
              还剩 {lastRound.matches.filter((m) => m.result === '').length} 场赛果待录入，
              完成后即可生成下一轮。
            </div>
          )}
        </section>

        <aside className="col-side">
          <LockPanel
            locks={draftLocks}
            players={pairingPlayers}
            byeId={draftSolution?.byeId ?? null}
            disabled={busy}
            onAddLock={addLock}
            onRemoveLock={removeLock}
            nameOf={nameOf}
          />
          <div className="card rules">
            <h3>配对规则</h3>
            <ol>
              <li>禁止与任何历史对手重复交手。</li>
              <li>优先最小化<strong>跨积分组对局数</strong>。</li>
              <li>跨组数相同时，最小化所有对局的<strong>双方总积分差</strong>。</li>
              <li>奇数人数时，未轮空过的最低分选手轮空（并列取最早录入者）。</li>
              <li>人工锁定对局必须保留，其余自动重算；无解时列出冲突原因。</li>
            </ol>
          </div>
        </aside>
      </main>

      <footer className="app-footer">
        数据保存在浏览器本地（localStorage），刷新不丢失 · 对阵确定依据为录入顺序，无随机抽签
      </footer>
    </div>
  )
}
