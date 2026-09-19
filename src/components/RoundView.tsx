import type { Match, MatchResult, Round } from '../types'

interface Props {
  round: Round
  roundIndex: number
  nameOf: (id: string | null) => string
  onSetResult: (roundIndex: number, matchId: string, result: MatchResult) => void
  onToggleLock: (roundIndex: number, matchId: string) => void
  onRecompute: (roundIndex: number) => void
  onDelete: (roundIndex: number) => void
}

export function RoundView({
  round,
  roundIndex,
  nameOf,
  onSetResult,
  onToggleLock,
  onRecompute,
  onDelete,
}: Props) {
  const remaining = round.matches.filter((m) => m.result === '').length
  const lockCount = round.matches.filter((m) => m.locked).length

  return (
    <div className="card">
      <div className="card-title">
        <h2>第 {roundIndex + 1} 轮</h2>
        <div className="title-actions">
          <span className="badge">{round.crossCount} 场跨积分组</span>
          <span className="badge">总积分差 {round.scoreDiffSum}</span>
          {remaining === 0 ? (
            <span className="badge badge-ok">已完成</span>
          ) : (
            <span className="badge badge-warn">待录入 {remaining} 场</span>
          )}
        </div>
      </div>

      {round.byeId && (
        <div className="bye-row">
          🛋️ 轮空：<strong>{nameOf(round.byeId)}</strong>
          <span className="hint">（按胜计 1 分，自动入账）</span>
        </div>
      )}

      <div className="match-list">
        {round.matches.map((m, idx) => (
          <MatchRow
            key={m.id}
            match={m}
            boardNo={idx + 1}
            nameOf={nameOf}
            onResult={(r) => onSetResult(roundIndex, m.id, r)}
            onToggleLock={() => onToggleLock(roundIndex, m.id)}
          />
        ))}
      </div>

      <div className="row-actions">
        <button
          className="btn"
          onClick={() => onRecompute(roundIndex)}
          title="保留锁定对局，其余选手重新配对（未锁定对局的赛果会被清空）"
        >
          🔒 按锁定重算本轮
        </button>
        {lockCount > 0 && <span className="hint">已锁定 {lockCount} 场</span>}
        <button className="btn danger ghost" onClick={() => onDelete(roundIndex)}>
          删除本轮
        </button>
      </div>
    </div>
  )
}

function MatchRow({
  match,
  boardNo,
  nameOf,
  onResult,
  onToggleLock,
}: {
  match: Match
  boardNo: number
  nameOf: (id: string | null) => string
  onResult: (r: MatchResult) => void
  onToggleLock: () => void
}) {
  const aWin = match.result === 'A'
  const bWin = match.result === 'B'
  const draw = match.result === 'D'

  return (
    <div className={`match-row ${match.locked ? 'locked' : ''}`}>
      <span className="board-no">{boardNo}</span>
      <button
        className={`player side-a ${aWin ? 'win' : ''} ${match.result && !aWin ? 'lose' : ''}`}
        onClick={() => onResult(aWin ? '' : 'A')}
        title="点击：左侧选手获胜（再点取消）"
      >
        {nameOf(match.aId)}
      </button>
      <span className={`vs-score ${aWin ? 'show' : ''}`}>1</span>
      <button
        className={`result-pill ${draw ? 'on' : ''}`}
        onClick={() => onResult(draw ? '' : 'D')}
        title="平局（再点取消）"
      >
        平
      </button>
      <span className={`vs-score ${bWin ? 'show' : ''}`}>1</span>
      <button
        className={`player side-b ${bWin ? 'win' : ''} ${match.result && !bWin ? 'lose' : ''}`}
        onClick={() => onResult(bWin ? '' : 'B')}
        title="点击：右侧选手获胜（再点取消）"
      >
        {nameOf(match.bId)}
      </button>
      {match.crossGroup && (
        <span className="tag cross-tag" title="双方当前积分不同">
          跨组
        </span>
      )}
      <button
        className={`lock-btn ${match.locked ? 'on' : ''}`}
        onClick={onToggleLock}
        title={match.locked ? '取消人工锁定' : '人工锁定这场对局（重算时保留）'}
      >
        {match.locked ? '🔒' : '🔓'}
      </button>
    </div>
  )
}
