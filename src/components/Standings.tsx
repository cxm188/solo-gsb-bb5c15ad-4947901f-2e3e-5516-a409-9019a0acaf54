import type { Standing } from '../lib/tournament'

interface Props {
  rows: Standing[]
  roundCount: number
}

export function Standings({ rows, roundCount }: Props) {
  return (
    <div className="card">
      <div className="card-title">
        <h2>积分榜</h2>
        <span className="hint">已进行 {roundCount} 轮</span>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th>选手</th>
              <th className="num">积分</th>
              <th className="num">胜</th>
              <th className="num">平</th>
              <th className="num">负</th>
              <th className="num">轮空</th>
              <th>历史对手</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.id}>
                <td className="col-rank">{i + 1}</td>
                <td className="strong">{s.name}</td>
                <td className="num strong">{s.score}</td>
                <td className="num">{s.wins}</td>
                <td className="num">{s.draws}</td>
                <td className="num">{s.losses}</td>
                <td className="num">{s.byes > 0 ? s.byes : '—'}</td>
                <td className="opponents">
                  {s.opponents.length > 0 ? s.opponents.join('、') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
