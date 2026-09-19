// @ts-nocheck
/**
 * 端到端集成测试：模拟 UI 的完整使用路径
 *   录入选手 -> 生成轮次 -> 录入赛果 -> 积分榜 -> 下一轮 -> 轮空 -> 锁定重算
 * 运行：npm run test:e2e
 */
import assert from 'node:assert'
import { solveSwiss } from '../solver/solver'
import { computeStandings, toPairingPlayers } from './tournament'

let passed = 0
const check = (name, fn) => {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

let seq = 0
const makePlayers = (names) =>
  names.map((name) => ({ id: `id_${name}`, name, seq: seq++ }))

const commit = (sol, locks = []) => {
  const locked = new Set(locks.flatMap((l) => [l.aId, l.bId]))
  return {
    byeId: sol.byeId,
    matches: sol.pairs.map((p) => ({
      id: `m_${p.aId}_${p.bId}`,
      aId: p.aId,
      bId: p.bId,
      result: '',
      locked: locked.has(p.aId),
      crossGroup: p.crossGroup,
    })),
    crossCount: sol.crossCount,
    scoreDiffSum: sol.diff2Sum / 2,
    complete: false,
  }
}

// --- 场景：7 名选手，模拟 3 轮赛程 ---
check('7 人 3 轮完整赛程：轮空唯一、积分正确、无重复交手', () => {
  seq = 0
  const players = makePlayers(['甲', '乙', '丙', '丁', '戊', '己', '庚'])
  const rounds = []
  const everPlayed = new Map(players.map((p) => [p.id, new Set()]))
  const byeCount = new Map(players.map((p) => [p.id, 0]))

  for (let r = 0; r < 3; r++) {
    const pp = toPairingPlayers(players, rounds)
    const sol = solveSwiss(pp, rounds)
    assert.ok(sol.ok, `第${r + 1}轮无解: ${sol.conflicts.join(';')}`)
    // 奇数人必有轮空，且每轮只有一人轮空
    assert.ok(sol.byeId, `第${r + 1}轮应有轮空`)
    assert.strictEqual(sol.pairs.length, 3)

    const round = commit(sol)
    rounds.push(round)
    byeCount.set(sol.byeId, byeCount.get(sol.byeId) + 1)

    const inRound = new Set()
    for (const m of round.matches) {
      assert.ok(!everPlayed.get(m.aId).has(m.bId), `重复交手 ${m.aId}-${m.bId}`)
      everPlayed.get(m.aId).add(m.bId)
      everPlayed.get(m.bId).add(m.aId)
      assert.ok(!inRound.has(m.aId) && !inRound.has(m.bId), '一人多场')
      inRound.add(m.aId)
      inRound.add(m.bId)
      // 赛果：a 胜
      m.result = 'A'
    }
    assert.ok(!inRound.has(sol.byeId), '轮空者又参赛了')
    round.complete = true
  }

  // 3 轮中轮空分布：每人至多 1 次（共 3 个轮空名额，7 人）
  for (const [, c] of byeCount) assert.ok(c <= 1)
  const totalByes = [...byeCount.values()].reduce((a, b) => a + b, 0)
  assert.strictEqual(totalByes, 3)

  // 积分榜：每轮 3 个胜者 + 1 个轮空者各得 1 分
  const standings = computeStandings(players, rounds)
  const totalScore = standings.reduce((a, s) => a + s.score, 0)
  assert.strictEqual(totalScore, 3 * 4) // 每场/每轮空产出 1 个胜分 × 4 × 3 轮
  assert.strictEqual(standings.length, 7)
})

check('平局计 0.5 分，积分榜正确', () => {
  seq = 100
  const players = makePlayers(['A', 'B', 'C', 'D'])
  const rounds = []
  let sol = solveSwiss(toPairingPlayers(players, rounds), rounds)
  const r1 = commit(sol)
  rounds.push(r1)
  r1.matches[0].result = 'D'
  r1.matches[1].result = 'A'
  const standings = computeStandings(players, rounds)
  const drawn = standings.filter((s) => s.score === 0.5)
  assert.strictEqual(drawn.length, 2)
  const winner = standings.find((s) => s.id === r1.matches[1].aId)
  assert.strictEqual(winner.score, 1)
})

check('锁定一场后重算，锁定场保留且其他选手重排', () => {
  seq = 200
  const players = makePlayers(['W', 'X', 'Y', 'Z', 'U', 'V'])
  const rounds = []
  // 第 1 轮：让 W,X,Y,Z 各胜，U,V 落败
  let sol = solveSwiss(toPairingPlayers(players, rounds), rounds)
  const r1 = commit(sol)
  rounds.push(r1)
  // 找出含 W 和 U 的两场分别置胜负，构造 2 个 1 分、4 个……直接全部 A 胜
  for (const m of r1.matches) m.result = 'A'

  // 第 2 轮锁定一场：W vs U
  const locks = [{ aId: 'id_W', bId: 'id_U' }]
  sol = solveSwiss(toPairingPlayers(players, rounds), rounds, locks)
  assert.ok(sol.ok, sol.conflicts.join(';'))
  const hasLock = sol.pairs.some(
    (p) =>
      (p.aId === 'id_W' && p.bId === 'id_U') ||
      (p.aId === 'id_U' && p.bId === 'id_W'),
  )
  assert.ok(hasLock, '锁定对局必须出现')
  // 无重复
  const r1pairs = new Set(
    r1.matches.map((m) => [m.aId, m.bId].sort().join('-')),
  )
  for (const p of sol.pairs) {
    assert.ok(!r1pairs.has([p.aId, p.bId].sort().join('-')), '与首轮重复')
  }
})

console.log(`\n全部 ${passed} 项集成测试通过 ✅`)
