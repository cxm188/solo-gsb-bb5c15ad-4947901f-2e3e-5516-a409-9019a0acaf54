import { useState } from 'react'
import type { Player } from '../types'

interface Props {
  players: Player[]
  rosterLocked: boolean
  onAdd: (names: string[]) => void
  onRemove: (id: string) => void
  onClearAll: () => void
}

export function PlayerManager({
  players,
  rosterLocked,
  onAdd,
  onRemove,
  onClearAll,
}: Props) {
  const [text, setText] = useState('')

  const remaining = 32 - players.length

  function submit() {
    const names = text
      .split(/[\n,，、;；\t]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (names.length === 0) return
    if (names.length > remaining) {
      window.alert(`最多 32 名选手，当前还可添加 ${remaining} 名。`)
      return
    }
    const dedup = new Set(players.map((p) => p.name))
    const fresh = names.filter((n) => !dedup.has(n))
    if (fresh.length === 0) {
      window.alert('这些名字都已存在。')
      return
    }
    onAdd(fresh)
    setText('')
  }

  return (
    <div className="card">
      <div className="card-title">
        <h2>选手名单</h2>
        <span className={`badge ${players.length === 32 ? 'badge-warn' : ''}`}>
          {players.length} / 32
        </span>
      </div>

      {!rosterLocked ? (
        <>
          <textarea
            className="name-input"
            rows={3}
            placeholder={'每行一个名字，也可用逗号/顿号分隔，例如：\n张三\n李四\n王五'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={remaining <= 0}
          />
          <div className="row-actions">
            <button className="btn primary" onClick={submit} disabled={remaining <= 0}>
              添加选手
            </button>
            {players.length > 0 && (
              <button className="btn danger ghost" onClick={onClearAll}>
                清空全部
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="hint">联赛已开始，名单已锁定。如需调整请先清空赛程。</p>
      )}

      {players.length > 0 && (
        <ul className="player-chips">
          {players.map((p) => (
            <li key={p.id} className="chip">
              <span className="chip-seq">{p.seq + 1}</span>
              <span className="chip-name">{p.name}</span>
              {!rosterLocked && (
                <button
                  className="chip-x"
                  title="移除"
                  onClick={() => onRemove(p.id)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
