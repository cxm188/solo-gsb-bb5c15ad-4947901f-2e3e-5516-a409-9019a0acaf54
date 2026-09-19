import type { LockedPair, PairingSolution } from '../types'

interface Props {
  roundNo: number
  solution: PairingSolution
  locks: LockedPair[]
  nameOf: (id: string | null) => string
  onAddLock: (pair: LockedPair) => void
  onRemoveLock: (index: number) => void
  onUnlockPair: (aId: string, bId: string) => void
  onCommit: () => void
}

export function DraftRound({
  roundNo,
  solution,
  locks,
  nameOf,
  onAddLock,
  onRemoveLock,
  onUnlockPair,
  onCommit,
}: Props) {
  const isLocked = (aId: string, bId: string) =>
    locks.some(
      (l) =>
        (l.aId === aId && l.bId === bId) || (l.aId === bId && l.bId === aId),
    )

  return (
    <div className={`card draft ${solution.ok ? '' : 'has-conflict'}`}>
      <div className="card-title">
        <h2>第 {roundNo} 轮对阵（预览）</h2>
        <div className="title-actions">
          {solution.ok && (
            <>
              <span className="badge">{solution.crossCount} 场跨积分组</span>
              <span className="badge">总积分差 {solution.diff2Sum / 2}</span>
              {!solution.optimal && (
                <span className="badge badge-warn" title="搜索规模过大，返回的是当前找到的最佳可行方案">
                  近似最优
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {solution.ok ? (
        <>
          {solution.byeId && (
            <div className="bye-row">
              🛋️ 轮空：<strong>{nameOf(solution.byeId)}</strong>
              <span className="hint">（未轮空过的最低分选手）</span>
            </div>
          )}
          <div className="match-list">
            {solution.pairs.map((p, i) => {
              const locked = isLocked(p.aId, p.bId)
              return (
                <div key={`${p.aId}-${p.bId}`} className={`match-row ${locked ? 'locked' : ''}`}>
                  <span className="board-no">{i + 1}</span>
                  <span className="player static side-a">{nameOf(p.aId)}</span>
                  <span className="vs">vs</span>
                  <span className="player static side-b">{nameOf(p.bId)}</span>
                  {p.crossGroup && (
                    <span className="tag cross-tag" title="双方当前积分不同">
                      跨组 · 差 {p.diff2 / 2}
                    </span>
                  )}
                  {locked ? (
                    <button
                      className="lock-btn on"
                      onClick={() => onUnlockPair(p.aId, p.bId)}
                      title="取消锁定并自动重算"
                    >
                      🔒
                    </button>
                  ) : (
                    <button
                      className="lock-btn"
                      onClick={() => onAddLock({ aId: p.aId, bId: p.bId })}
                      title="锁定这场对局，其余自动重算"
                    >
                      🔓
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {locks.length > 0 && (
            <div className="lock-summary">
              <span className="hint">人工锁定 {locks.length} 场，其余对阵已按规则重算：</span>
              <ul>
                {locks.map((l, i) => (
                  <li key={i}>
                    🔒 {nameOf(l.aId)} vs {nameOf(l.bId)}
                    <button className="link-btn" onClick={() => onRemoveLock(i)}>
                      移除
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="row-actions">
            <button className="btn primary big" onClick={onCommit}>
              ✅ 确认生成第 {roundNo} 轮
            </button>
          </div>
        </>
      ) : (
        <div className="conflict-box">
          <h3>⚠️ 当前约束下无法完成配对</h3>
          <ul>
            {solution.conflicts.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          {locks.length > 0 && (
            <p className="hint">
              可在右侧“人工锁定”面板移除部分锁定对局，配对会即时重新计算。
            </p>
          )}
        </div>
      )}
    </div>
  )
}
