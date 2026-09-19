import { useEffect, useState } from 'react'
import type { LockedPair, PairingPlayer } from '../types'

interface Props {
  locks: LockedPair[]
  players: PairingPlayer[]
  byeId: string | null
  disabled: boolean
  onAddLock: (pair: LockedPair) => void
  onRemoveLock: (index: number) => void
  nameOf: (id: string | null) => string
}

export function LockPanel({
  locks,
  players,
  byeId,
  disabled,
  onAddLock,
  onRemoveLock,
  nameOf,
}: Props) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')

  // 名单或轮空变化时纠正无效选择
  useEffect(() => {
    if (a === byeId) setA('')
  }, [a, byeId])
  useEffect(() => {
    if (b === byeId) setB('')
  }, [b, byeId])

  const selectable = [...players]
    .filter((p) => p.id !== byeId)
    .sort((x, y) => x.seq - y.seq)

  function add() {
    if (!a || !b) return
    if (a === b) {
      window.alert('不能让同一名选手与自己对局。')
      return
    }
    onAddLock({ aId: a, bId: b })
    setA('')
    setB('')
  }

  return (
    <div className="card">
      <div className="card-title">
        <h2>人工锁定对局</h2>
      </div>
      <p className="hint">
        指定必须对阵的两名选手，其余配对会即时按规则重算。
        {byeId && <>当前轮空者（{nameOf(byeId)}）不可选。</>}
      </p>

      <div className="lock-form">
        <select value={a} onChange={(e) => setA(e.target.value)} disabled={disabled}>
          <option value="">选择选手 A…</option>
          {selectable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（{p.score2 / 2} 分）
            </option>
          ))}
        </select>
        <span className="vs">vs</span>
        <select value={b} onChange={(e) => setB(e.target.value)} disabled={disabled}>
          <option value="">选择选手 B…</option>
          {selectable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}（{p.score2 / 2} 分）
            </option>
          ))}
        </select>
        <button className="btn primary" onClick={add} disabled={disabled || !a || !b}>
          锁定
        </button>
      </div>

      {locks.length > 0 && (
        <ul className="lock-list">
          {locks.map((l, i) => (
            <li key={i}>
              🔒 {nameOf(l.aId)} <span className="vs">vs</span> {nameOf(l.bId)}
              <button
                className="link-btn"
                onClick={() => onRemoveLock(i)}
                disabled={disabled}
              >
                移除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
