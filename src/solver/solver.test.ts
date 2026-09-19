/**
 * 求解器冒烟测试（非框架）：
 *   npm run test:solver
 * （通过 esbuild 即时转译为 ESM 后由 Node 执行）
 */
// @ts-nocheck
import assert from 'node:assert'
import { chooseBye, solveSwiss } from './solver'
import type { LockedPair, Match, PairingPlayer, Round } from '../types'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

function player(id: string, score2 = 0, byes = 0, seq = Number(id.slice(1))): PairingPlayer {
  return { id, name: `P${id.slice(1)}`, seq, score2, byes }
}

function round(matches: Array<[string, string, Match['result']]>, byeId: string | null = null): Round {
  return {
    byeId,
    matches: matches.map(([aId, bId, result], i) => ({
      id: `m${i}`,
      aId,
      bId,
      result,
      locked: false,
      crossGroup: false,
    })),
    crossCount: 0,
    scoreDiffSum: 0,
    complete: true,
  }
}

function pairSet(sol: ReturnType<typeof solveSwiss>): Set<string> {
  return new Set(
    sol.pairs
      .map((p) => [p.aId, p.bId].sort().join('-'))
      .sort(),
  )
}

// 1) 偶数人首轮：全部同组，任意相邻式配对即可；0 跨组、0 分差
check('首轮 8 人：0 跨组、0 总积分差', () => {
  const ps = Array.from({ length: 8 }, (_, i) => player(`p${i + 1}`))
  const sol = solveSwiss(ps, [])
  assert.ok(sol.ok, sol.conflicts.join(';'))
  assert.strictEqual(sol.crossCount, 0)
  assert.strictEqual(sol.diff2Sum, 0)
  assert.strictEqual(sol.pairs.length, 4)
  assert.strictEqual(sol.byeId, null)
})

// 2) 奇数人：最低分且未轮空者轮空
check('7 人奇数：从未轮空的最低分选手轮空', () => {
  const ps = [
    player('p1', 4),
    player('p2', 2),
    player('p3', 2, 1), // 已轮空过，即使同分也不优先
    player('p4', 0),
    player('p5', 0),
    player('p6', 0),
    player('p7', 0),
  ]
  const sol = solveSwiss(ps, [])
  assert.ok(sol.ok)
  assert.strictEqual(sol.byeId, 'p4') // 最低分 + seq 最小
})

// 3) 全员都轮空过时，退化为全局最低分者轮空
check('全员已轮空过：全局最低分者轮空', () => {
  const ps = [
    player('p1', 6, 1),
    player('p2', 2, 2),
    player('p3', 0, 1),
    player('p4', 0, 1),
    player('p5', 4, 1),
  ]
  const sol = solveSwiss(ps, [])
  assert.ok(sol.ok)
  assert.strictEqual(sol.byeId, 'p3')
})

// 4) 积分分组：6 人（4 个 2 分 + 2 个 0 分）。4 人组内可成 2 对，0 分 2 人成 1 对 => 0 跨组
check('积分组偶数可内部消化：0 跨组', () => {
  const ps = [
    player('p1', 2), player('p2', 2), player('p3', 2), player('p4', 2),
    player('p5', 0), player('p6', 0),
  ]
  const sol = solveSwiss(ps, [])
  assert.ok(sol.ok)
  assert.strictEqual(sol.crossCount, 0)
})

// 5) 奇数组别（3 个 2 分、3 个 0 分）：1 场跨组即可（抽走双方各 1 人，余 2+2 组内配对）
check('奇数组别：最小化到 1 场跨组，并最小化分差', () => {
  const ps = [
    player('p1', 2), player('p2', 2), player('p3', 2),
    player('p4', 0), player('p5', 0), player('p6', 0),
  ]
  const sol = solveSwiss(ps, [])
  assert.ok(sol.ok)
  assert.strictEqual(sol.crossCount, 1)
  // 跨组配对只能是 2-vs-0，双倍差 = 2（真实积分差 1）
  assert.strictEqual(sol.diff2Sum, 2)
})

// 6) 三档分数（4,2,0 各两人）：组内配对 => 0 跨组
check('三档分数各自成对：0 跨组', () => {
  const ps = [
    player('p1', 4), player('p2', 4),
    player('p3', 2), player('p4', 2),
    player('p5', 0), player('p6', 0),
  ]
  const sol = solveSwiss(ps, [])
  assert.ok(sol.ok)
  assert.strictEqual(sol.crossCount, 0)
})

// 7) 禁止重复交手：首轮后第二轮必须换对
check('禁止重复交手：第二轮不会出现首轮对阵', () => {
  const ps = Array.from({ length: 6 }, (_, i) => player(`p${i + 1}`, i < 3 ? 2 : 0))
  const r1 = round([
    ['p1', 'p2', 'A'],
    ['p3', 'p4', 'A'],
    ['p5', 'p6', 'D'],
  ])
  const sol = solveSwiss(ps, [r1])
  assert.ok(sol.ok, sol.conflicts.join(';'))
  for (const p of sol.pairs) {
    const key = [p.aId, p.bId].sort().join('-')
    assert.ok(!['p1-p2', 'p3-p4', 'p5-p6'].includes(key), `重复交手: ${key}`)
  }
})

// 8) 目标优先级：4 胜组 + 4 负组，首轮为跨组配对；
//    第二轮两组组内均有合法配对 => 0 跨组可行
check('组内换边可达成 0 跨组（8 人）', () => {
  const ps = [
    player('p1', 2), player('p2', 2), player('p3', 2), player('p4', 2),
    player('p5', 0), player('p6', 0), player('p7', 0), player('p8', 0),
  ]
  const r1 = round([
    ['p1', 'p5', 'A'],
    ['p2', 'p6', 'A'],
    ['p3', 'p7', 'A'],
    ['p4', 'p8', 'A'],
  ])
  const sol = solveSwiss(ps, [r1])
  assert.ok(sol.ok)
  assert.strictEqual(sol.crossCount, 0)
  for (const p of sol.pairs) assert.strictEqual(p.diff2, 0)
})

// 9) 人工锁定：锁一场后其余配对重算，锁定对局保留
check('锁定对局被保留，其余自动配对', () => {
  const ps = Array.from({ length: 8 }, (_, i) => player(`p${i + 1}`))
  const locks: LockedPair[] = [{ aId: 'p1', bId: 'p8' }]
  const sol = solveSwiss(ps, [], locks)
  assert.ok(sol.ok, sol.conflicts.join(';'))
  assert.ok(pairSet(sol).has('p1-p8'))
  assert.strictEqual(sol.pairs.length, 4)
})

// 10) 锁定重复交手 => 冲突
check('锁定了已交手对局：列出冲突原因', () => {
  const ps = Array.from({ length: 6 }, (_, i) => player(`p${i + 1}`))
  const r1 = round([
    ['p1', 'p2', 'A'],
    ['p3', 'p4', 'A'],
    ['p5', 'p6', 'D'],
  ])
  const sol = solveSwiss(ps, [r1], [{ aId: 'p1', bId: 'p2' }])
  assert.strictEqual(sol.ok, false)
  assert.ok(sol.conflicts.some((c) => c.includes('已经交手')))
})

// 11) 同一选手出现在两场锁定 => 冲突
check('同一选手被两场锁定占用：列出冲突', () => {
  const ps = Array.from({ length: 6 }, (_, i) => player(`p${i + 1}`))
  const sol = solveSwiss(ps, [], [
    { aId: 'p1', bId: 'p2' },
    { aId: 'p1', bId: 'p3' },
  ])
  assert.strictEqual(sol.ok, false)
  assert.ok(sol.conflicts.some((c) => c.includes('只能参加一场')))
})

// 12) 锁与轮空冲突
check('锁定者同时被安排轮空：列出冲突', () => {
  const ps = Array.from({ length: 5 }, (_, i) => player(`p${i + 1}`))
  const sol = solveSwiss(ps, [], [{ aId: 'p1', bId: 'p2' }])
  // p1/p2 都是 0 分，轮空应是 p1（seq 最小）——锁了 p1，必然冲突
  assert.strictEqual(sol.ok, false)
  assert.ok(sol.conflicts.some((c) => c.includes('轮空')))
})

// 13) 历史导致某人无合法对手 => 无解并给出人名
check('选手无合法对手：无解并指明选手', () => {
  // 4 人，p1 与其余三人都已交手过（用三轮历史构造）
  const ps = Array.from({ length: 4 }, (_, i) => player(`p${i + 1}`, 2))
  const history = [
    round([['p1', 'p2', 'A']]),
    round([['p1', 'p3', 'A']]),
    round([['p1', 'p4', 'A']]),
  ]
  const sol = solveSwiss(ps, history)
  assert.strictEqual(sol.ok, false)
  assert.ok(sol.conflicts.some((c) => c.includes('P1')))
})

// 14) 全员首轮 32 人性能
check('32 人首轮在预算内完成且最优', () => {
  const ps = Array.from({ length: 32 }, (_, i) => player(`p${i + 1}`))
  const t0 = Date.now()
  const sol = solveSwiss(ps, [])
  assert.ok(sol.ok)
  assert.strictEqual(sol.crossCount, 0)
  assert.ok(sol.optimal, '应证明最优')
  assert.ok(Date.now() - t0 < 5000, `耗时过长: ${Date.now() - t0}ms`)
})

// 15) 32 人全部同分且首轮已相邻配对：第二轮（K32 的 16-正则补图）性能
check('32 人第二轮重配对在预算内完成', () => {
  const ps = Array.from({ length: 32 }, (_, i) => player(`p${i + 1}`, 2))
  const m: Array<[string, string, Match['result']]> = []
  for (let i = 0; i < 32; i += 2) m.push([`p${i + 1}`, `p${i + 2}`, 'A'])
  const r1 = round(m)
  const t0 = Date.now()
  const sol = solveSwiss(ps, [r1])
  assert.ok(sol.ok, sol.conflicts.join(';'))
  assert.strictEqual(sol.pairs.length, 16)
  assert.ok(Date.now() - t0 < 5000, `耗时过长: ${Date.now() - t0}ms`)
})

// 16) chooseBye 单元
check('chooseBye：偶数返回 null', () => {
  const ps = [player('p1'), player('p2')]
  assert.strictEqual(chooseBye(ps), null)
})

// 17) 锁定本身合法，但与历史禁忌叠加导致无法完成完美匹配
//     4 人：锁 (p1,p3)，历史 p2-p4 已交手 => p2、p4 只能配彼此，无解
check('锁定与历史叠加导致无解：诊断信息包含落单选手', () => {
  const ps = Array.from({ length: 4 }, (_, i) => player(`p${i + 1}`, 0))
  const history = [round([['p2', 'p4', 'A']])]
  const sol = solveSwiss(ps, history, [{ aId: 'p1', bId: 'p3' }])
  assert.strictEqual(sol.ok, false)
  assert.ok(sol.conflicts.length >= 1)
  assert.ok(sol.conflicts.some((c) => c.includes('P2') || c.includes('P4')))
})

// 18) 跨组数并列时最小化积分差：
//     2 分组 {p1,p2}、1 分组 {p3,p4}、0 分组 {p5,p6}，且 p3-p4 已交手。
//     最少 2 场跨组；最优结构 (高,高)+(高,中)+(中,低)，
//     双倍差 0+2+2 = 4（真实积分差合计 2）。
check('跨组数相同时最小化总积分差', () => {
  const ps = [
    player('p1', 4), player('p2', 4),
    player('p3', 2), player('p4', 2),
    player('p5', 0), player('p6', 0),
  ]
  const history = [round([['p3', 'p4', 'A']])]
  const sol = solveSwiss(ps, history)
  assert.ok(sol.ok)
  assert.strictEqual(sol.crossCount, 2)
  assert.strictEqual(sol.diff2Sum, 4)
})

// 19) 32 人完整模拟 6 轮瑞士赛程，每轮结果取左胜，均应成功配对且无重复
check('32 人 6 轮完整赛程：无重复交手、全部可配', () => {
  const ps = Array.from({ length: 32 }, (_, i) => player(`p${i + 1}`))
  const history: Round[] = []
  const seen = new Set<string>()
  for (let r = 0; r < 6; r++) {
    // 按当前积分视图（简化：用历史轮计算）
    const sol = solveSwiss(ps, history)
    assert.ok(sol.ok, `第 ${r + 1} 轮无解: ${sol.conflicts.join(';')}`)
    assert.strictEqual(sol.pairs.length, 16)
    const m: Array<[string, string, Match['result']]> = []
    for (const p of sol.pairs) {
      const key = [p.aId, p.bId].sort().join('-')
      assert.ok(!seen.has(key), `重复交手 ${key}`)
      seen.add(key)
      m.push([p.aId, p.bId, 'A'])
    }
    history.push(round(m))
  }
})

// 20) 确定性：相同输入两次求解，对阵完全一致
check('相同输入确定性输出', () => {
  const ps = Array.from({ length: 10 }, (_, i) =>
    player(`p${i + 1}`, (i % 3) * 2),
  )
  const a = solveSwiss(ps, [])
  const b = solveSwiss(ps, [])
  assert.deepStrictEqual(
    a.pairs.map((p) => [p.aId, p.bId]).sort(),
    b.pairs.map((p) => [p.aId, p.bId]).sort(),
  )
})

// 21) 32 人且首轮全部平局：第二轮仍是 32 个 1 分组，0 跨组
//     （回归：n=32 时 1<<32 位掩码溢出会使搜索提前终止）
check('32 人第二轮（首轮全平）：0 跨组且无重复', () => {
  const ps = Array.from({ length: 32 }, (_, i) => player(`p${i + 1}`))
  const m: Array<[string, string, Match['result']]> = []
  for (let i = 0; i < 32; i += 2) m.push([`p${i + 1}`, `p${i + 2}`, 'D'])
  const r1 = round(m)
  const sol = solveSwiss(ps, [r1])
  assert.ok(sol.ok, sol.conflicts.join(';'))
  assert.strictEqual(sol.pairs.length, 16)
  assert.strictEqual(sol.crossCount, 0)
  const used = new Set<string>()
  for (const p of sol.pairs) {
    used.add(p.aId)
    used.add(p.bId)
  }
  assert.strictEqual(used.size, 32)
})

// 22) 31 人奇数：恰好 15 场比赛 + 1 轮空，人人出场或轮空
check('31 人：15 场配对 + 1 轮空', () => {
  const ps = Array.from({ length: 31 }, (_, i) =>
    player(`p${i + 1}`, (i % 4) * 2, i,
  ))
  const sol = solveSwiss(ps, [])
  assert.ok(sol.ok, sol.conflicts.join(';'))
  assert.strictEqual(sol.pairs.length, 15)
  assert.ok(sol.byeId)
  const ids = new Set(sol.pairs.flatMap((p) => [p.aId, p.bId]))
  assert.strictEqual(ids.size, 30)
  assert.ok(!ids.has(sol.byeId!))
})

// 23) 32 人强制跨组（15 胜 / 2 平 / 15 负，平局两人首轮已交手）：
//     必须返回 16 场配对且至少 2 场跨组。
//     回归：n=32 时 1<<32 溢出曾使搜索立刻终止、返回 0 场配对。
check('32 人强制跨组赛程：16 场配对、2 场跨组、已证明最优', () => {
  const ps = Array.from({ length: 32 }, (_, i) => {
    let s2 = 0
    if (i < 15) s2 = 2
    else if (i < 17) s2 = 1
    return player(`p${i + 1}`, s2)
  })
  const m: Array<[string, string, Match['result']]> = [['p16', 'p17', 'D']]
  for (let i = 0; i < 15; i++) m.push([`p${i + 1}`, `p${i + 18}`, 'A'])
  const r1 = round(m)
  const sol = solveSwiss(ps, [r1])
  assert.ok(sol.ok, sol.conflicts.join(';'))
  assert.strictEqual(sol.pairs.length, 16)
  assert.strictEqual(sol.crossCount, 2)
  assert.ok(sol.optimal)
})

console.log(`\n全部 ${passed} 项求解器测试通过 ✅`)
