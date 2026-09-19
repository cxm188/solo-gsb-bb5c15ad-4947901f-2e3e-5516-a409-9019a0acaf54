import type {
  LockedPair,
  PairCandidate,
  PairingPlayer,
  PairingSolution,
  Round,
} from '../types'

/**
 * 瑞士制配对求解器
 *
 * 约束与目标（按优先级）：
 *  0. 硬约束：每人至多参赛一场；轮空者不参赛；禁止重复交手；人工锁定对局必须保留
 *  1. 最小化跨积分组对局数（积分组 = 当前积分相同的选手集合）
 *  2. 在跨组数最少的前提下，最小化所有对局的双方总积分差
 *
 * 人数为奇数时，先从“从未轮空”的选手中挑积分最低者（并列取录入最早）；
 * 若全员都轮空过，则从全体选手中挑积分最低者。
 *
 * 搜索：带下界剪枝的回溯（DFS + MRV 选点 + 记忆化），
 * 合并目标代价 cost = CROSS_WEIGHT * 跨组数 + 双倍积分差，
 * 因 diff 最大约 64 而 CROSS_WEIGHT 远大于 diff 总和，加权与字典序等价。
 */

const CROSS_WEIGHT = 1_000_000
const NODE_BUDGET = 3_000_000

/** 选手 id -> 已交手对手 id 集合 */
export type OpponentMap = Map<string, Set<string>>

/** 从已完成/进行中的各轮记录构建交手关系（不含轮空） */
export function buildOpponentMap(rounds: Round[]): OpponentMap {
  const map: OpponentMap = new Map()
  const ensure = (id: string) => {
    let s = map.get(id)
    if (!s) {
      s = new Set<string>()
      map.set(id, s)
    }
    return s
  }
  for (const round of rounds) {
    for (const m of round.matches) {
      ensure(m.aId).add(m.bId)
      ensure(m.bId).add(m.aId)
    }
  }
  return map
}

/**
 * 选择轮空选手。
 * 优先：未轮空过 -> 积分最低 -> 录入最早；全员轮空过时退化为积分最低 -> 录入最早。
 */
export function chooseBye(players: PairingPlayer[]): PairingPlayer | null {
  if (players.length % 2 === 0) return null
  const neverBye = players.filter((p) => p.byes === 0)
  const pool = neverBye.length > 0 ? neverBye : players
  return [...pool].sort((a, b) => a.score2 - b.score2 || a.seq - b.seq)[0]
}

interface PairEdge {
  j: number
  cross: 0 | 1
  diff2: number
}

function fmtName(p: PairingPlayer | undefined): string {
  return p ? p.name : '?'
}

/** 校验人工锁定对局本身是否合法（不判断是否能与自动配对比配拼成完美匹配） */
function validateLocks(
  players: PairingPlayer[],
  byeId: string | null,
  locked: LockedPair[],
  forbidden: OpponentMap,
): string[] {
  const conflicts: string[] = []
  const byId = new Map(players.map((p) => [p.id, p]))
  const used = new Map<string, number>() // playerId -> 出现在第几个锁

  locked.forEach((lock, idx) => {
    const tag = `锁定对局 ${idx + 1}（${lock.aId} vs ${lock.bId}）`
    const a = byId.get(lock.aId)
    const b = byId.get(lock.bId)

    if (!a) conflicts.push(`${tag}：选手 ${lock.aId} 不存在`)
    if (!b) conflicts.push(`${tag}：选手 ${lock.bId} 不存在`)
    if (lock.aId === lock.bId) conflicts.push(`${tag}：不能与自己配对`)

    if (a && byeId === a.id)
      conflicts.push(`锁定对局 ${idx + 1}：${fmtName(a)} 已被安排轮空，不能同时参赛`)
    if (b && byeId === b.id)
      conflicts.push(`锁定对局 ${idx + 1}：${fmtName(b)} 已被安排轮空，不能同时参赛`)

    if (a) {
      const prev = used.get(a.id)
      if (prev !== undefined)
        conflicts.push(`${fmtName(a)} 同时出现在锁定对局 ${prev + 1} 与 ${idx + 1} 中，一人只能参加一场`)
      else used.set(a.id, idx)
    }
    if (b) {
      const prev = used.get(b.id)
      if (prev !== undefined)
        conflicts.push(`${fmtName(b)} 同时出现在锁定对局 ${prev + 1} 与 ${idx + 1} 中，一人只能参加一场`)
      else used.set(b.id, idx)
    }

    if (a && b && forbidden.get(a.id)?.has(b.id))
      conflicts.push(
        `锁定对局 ${idx + 1}：${fmtName(a)} 与 ${fmtName(b)} 历史上已经交手，规则禁止重复交手`,
      )
  })

  return conflicts
}

/**
 * 无解诊断：在允许边图上求最大匹配。
 * 最大匹配未覆盖的选手在任何配对方案中都必然落单；
 * 若最大匹配恰好为完美匹配（理论上不会走到这里），返回兜底说明。
 */
function diagnoseInfeasible(
  pool: PairingPlayer[],
  adj: PairEdge[][],
  lockedEdges: Array<[number, number]>,
): string[] {
  const conflicts: string[] = []
  const n = pool.length
  const { partner, size } = maximumMatching(n, adj)

  const unmatched: number[] = []
  for (let i = 0; i < n; i++) if (partner[i] === -1) unmatched.push(i)

  if (unmatched.length > 0) {
    // 统计每个落单选手“看似可选但其实也被占光”的对手数，帮助解释
    for (const i of unmatched) {
      const nbrs = adj[i].map((e) => e.j)
      if (nbrs.length === 0) {
        conflicts.push(
          `${fmtName(pool[i])}（${pool[i].score2 / 2} 分）没有任何可配对选手：` +
            '其他人都与其历史交手过、被锁定对局占用，或本人已被安排轮空',
        )
      } else {
        const nbrNames = nbrs
          .slice(0, 6)
          .map((j) => `${fmtName(pool[j])}（${pool[j].score2 / 2} 分）`)
          .join('、')
        const more = nbrs.length > 6 ? ` 等 ${nbrs.length} 人` : ''
        conflicts.push(
          `${fmtName(pool[i])}（${pool[i].score2 / 2} 分）在任何合法方案中都会落单：` +
            `其可选对手仅有 ${nbrNames}${more}，而这些对手已被交手禁忌与锁定对局占满，无法腾出一人与之配对`,
        )
      }
    }
  }

  if (conflicts.length === 0) {
    conflicts.push('当前约束下不存在合法完美配对：禁止重复交手与人工锁定对局相互冲突')
  }
  if (lockedEdges.length > 0) {
    conflicts.push('建议：取消或调整至少一场人工锁定对局后重新生成')
  } else {
    conflicts.push('建议：检查历史交手记录（正常瑞士制赛程中不应出现此情况）')
  }
  void size
  return conflicts
}

/** 一般图最大匹配（带花树 Blossom 算法的增广路实现，n ≤ 32 足够快） */
function maximumMatching(
  n: number,
  adj: PairEdge[][],
): { partner: Int16Array; size: number } {
  const match = new Int16Array(n).fill(-1)
  const p = new Int16Array(n)
  const base = new Int16Array(n)
  const used = new Uint8Array(n)
  const blossom = new Uint8Array(n)

  const lca = (a: number, b: number): number => {
    const usedLca = new Uint8Array(n)
    for (;;) {
      a = base[a]
      usedLca[a] = 1
      if (match[a] === -1) break
      a = p[match[a]]
    }
    for (;;) {
      b = base[b]
      if (usedLca[b]) return b
      b = p[match[b]]
    }
  }

  const markPath = (v: number, b: number, children: number): void => {
    while (base[v] !== b) {
      blossom[base[v]] = 1
      blossom[base[match[v]]] = 1
      p[v] = children
      children = match[v]
      v = p[match[v]]
    }
  }

  const findPath = (start: number): number => {
    used.fill(0)
    p.fill(-1)
    for (let i = 0; i < n; i++) base[i] = i
    used[start] = 1
    const queue: number[] = [start]
    let qh = 0

    while (qh < queue.length) {
      const v = queue[qh++]
      for (const e of adj[v]) {
        const to = e.j
        if (base[v] === base[to] || match[v] === to) continue
        if (to === start || (match[to] !== -1 && p[match[to]] !== -1)) {
          const curBase = lca(v, to)
          blossom.fill(0)
          markPath(v, curBase, to)
          markPath(to, curBase, v)
          for (let i = 0; i < n; i++) {
            if (blossom[base[i]] && !used[i]) {
              used[i] = 1
              queue.push(i)
            }
          }
        } else if (p[to] === -1) {
          p[to] = v
          if (match[to] === -1) return to
          const nxt = match[to]
          used[nxt] = 1
          queue.push(nxt)
        }
      }
    }
    return -1
  }

  let size = 0
  for (let s = 0; s < n; s++) {
    if (match[s] !== -1) continue
    const end = findPath(s)
    if (end === -1) continue
    size++
    let v = end
    while (v !== -1) {
      const pv = p[v]
      const ppv = pv === -1 ? -1 : match[pv]
      match[v] = pv
      if (pv !== -1) match[pv] = v
      v = ppv
    }
  }
  return { partner: match, size }
}

/** 贪心构造一个可行解作为初始上界（优先同组、积分差最小） */
function greedyUpperBound(
  n: number,
  adj: PairEdge[][],
  forced: Int8Array,
): { edges: Array<[number, number]>; cost: number } | null {
  const matched = new Uint8Array(n)
  const edges: Array<[number, number]> = []
  let cost = 0

  // 先落入锁定对局并计入其代价
  for (let i = 0; i < n; i++) {
    const j = forced[i]
    if (j !== -1 && i < j) {
      matched[i] = 1
      matched[j] = 1
      edges.push([i, j])
      const edge = adj[i].find((e) => e.j === j)
      if (!edge) return null
      cost += edge.cross * CROSS_WEIGHT + edge.diff2
    }
  }

  for (;;) {
    // MRV：候选数最少的未配对选手
    let pick = -1
    let pickCount = Infinity
    for (let i = 0; i < n; i++) {
      if (matched[i]) continue
      let c = 0
      for (const e of adj[i]) if (!matched[e.j]) c++
      if (c < pickCount) {
        pickCount = c
        pick = i
      }
    }
    if (pick === -1) break // 全部配对完成
    if (pickCount === 0) return null
    let best: PairEdge | null = null
    let bestCost = Infinity
    for (const e of adj[pick]) {
      if (matched[e.j]) continue
      const c = e.cross * CROSS_WEIGHT + e.diff2
      if (c < bestCost) {
        bestCost = c
        best = e
      }
    }
    if (!best) return null
    matched[pick] = 1
    matched[best.j] = 1
    edges.push([pick, best.j])
    cost += bestCost
  }
  return { edges, cost }
}

/**
 * 主求解入口。
 *
 * @param players 全部选手（含当前积分与轮空次数）
 * @param rounds  已生成的各轮（用于推导交手禁忌；未提交的草稿轮不要传入）
 * @param locked  人工指定的对局
 */
export function solveSwiss(
  players: PairingPlayer[],
  rounds: Round[],
  locked: LockedPair[] = [],
): PairingSolution {
  if (players.length === 0) {
    return emptyResult(false, ['尚未录入任何选手'])
  }

  const forbidden = buildOpponentMap(rounds)
  const bye = chooseBye(players)
  const byeId = bye ? bye.id : null

  const lockConflicts = validateLocks(players, byeId, locked, forbidden)
  if (lockConflicts.length > 0) {
    return emptyResult(false, lockConflicts, byeId)
  }

  // 轮空者移出配对池
  const pool = bye
    ? players.filter((p) => p.id !== bye.id)
    : [...players]
  pool.sort((a, b) => a.seq - b.seq)
  const n = pool.length
  const idToIndex = new Map(pool.map((p, i) => [p.id, i]))

  // 锁定边落到池内下标
  const forced = new Int8Array(n).fill(-1)
  const lockedEdges: Array<[number, number]> = []
  for (const lk of locked) {
    const i = idToIndex.get(lk.aId)
    const j = idToIndex.get(lk.bId)
    if (i === undefined || j === undefined) continue // 轮空者情况已在校验中拦截
    forced[i] = j
    forced[j] = i
    lockedEdges.push([i, j])
  }

  // 构建允许边（无向，双向存储）：未交手；锁定选手只保留与指定搭档的边
  const adj: PairEdge[][] = Array.from({ length: n }, () => [])
  const addEdge = (i: number, j: number) => {
    const pi = pool[i]
    const pj = pool[j]
    const edge: PairEdge = {
      j,
      cross: pi.score2 === pj.score2 ? 0 : 1,
      diff2: Math.abs(pi.score2 - pj.score2),
    }
    const rev: PairEdge = { j: i, cross: edge.cross, diff2: edge.diff2 }
    adj[i].push(edge)
    adj[j].push(rev)
  }
  for (let i = 0; i < n; i++) {
    if (forced[i] !== -1) {
      const j = forced[i]
      const pi = pool[i]
      const pj = pool[j]
      if (forbidden.get(pi.id)?.has(pj.id)) {
        // validateLocks 已覆盖，防御性处理
        return emptyResult(false, [`${pi.name} 与 ${pj.name} 已经交手`], byeId)
      }
      addEdge(i, j)
      continue
    }
    for (let j = i + 1; j < n; j++) {
      if (forced[j] !== -1) continue // 对方已被锁定占用
      if (forbidden.get(pool[i].id)?.has(pool[j].id)) continue
      addEdge(i, j)
    }
  }

  // 孤立点（无合法对手）直接无解
  for (let i = 0; i < n; i++) {
    if (adj[i].length === 0) {
      return {
        ok: false,
        pairs: [],
        byeId,
        crossCount: 0,
        diff2Sum: 0,
        optimal: false,
        conflicts: diagnoseInfeasible(pool, adj, lockedEdges),
      }
    }
  }

  // 初始可行上界
  const greedy = greedyUpperBound(n, adj, forced)

  // ---- 最优匹配搜索（位掩码 DFS） ----
  // 注意 JS 位运算为 32 位有符号整数：n=32 时 1<<32 会回绕为 1，
  // 因此满掩码必须特判为 0xFFFFFFFF。
  const fullMask = n >= 32 ? 0xffffffff : (1 << n) - 1
  let bestCost = greedy ? greedy.cost : Infinity
  const bestPartner = new Int16Array(n).fill(-1)
  if (greedy) {
    for (const [i, j] of greedy.edges) {
      bestPartner[i] = j
      bestPartner[j] = i
    }
  }

  let nodes = 0
  let truncated = false
  const infeasibleMasks = new Set<number>()

  /** 剩余选手的放松下界：跨组数 + 积分差（忽略禁手/锁定） */
  const lowerBound = (mask: number): number => {
    const scores: number[] = []
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) scores.push(pool[i].score2)
    }
    scores.sort((a, b) => a - b)
    let cross = 0
    let diff = 0
    for (let k = 0; k < scores.length; k += 2) {
      if (scores[k] !== scores[k + 1]) cross++
      diff += scores[k + 1] - scores[k]
    }
    return cross * CROSS_WEIGHT + diff
  }

  /** 取一个未配对选手：优先锁定者，其次候选数最少（MRV） */
  const pickVertex = (mask: number): number => {
    let forcedPick = -1
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i)) && forced[i] !== -1) {
        forcedPick = i
        break
      }
    }
    if (forcedPick !== -1) return forcedPick

    let pick = -1
    let pickCount = Infinity
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) continue
      let c = 0
      for (const e of adj[i]) if (!(mask & (1 << e.j))) c++
      if (c < pickCount) {
        pickCount = c
        pick = i
      }
    }
    return pick
  }

  // 当前搜索路径上的配对搭档，仅在找到更优解时拷贝
  const partner = new Int16Array(n).fill(-1)

  const dfs = (mask: number, curCost: number): void => {
    if (nodes >= NODE_BUDGET) {
      truncated = true
      return
    }
    nodes++

    if (mask === fullMask) {
      if (curCost < bestCost) {
        bestCost = curCost
        bestPartner.set(partner)
      }
      return
    }

    if (curCost + lowerBound(mask) >= bestCost) return
    if (infeasibleMasks.has(mask)) return

    const i = pickVertex(mask)
    if (i === -1) return

    const candidates = adj[i].filter((e) => !(mask & (1 << e.j)))
    if (candidates.length === 0) {
      infeasibleMasks.add(mask)
      return
    }
    // 同组、小分差优先，尽快压低上界
    candidates.sort(
      (a, b) =>
        a.cross - b.cross || a.diff2 - b.diff2 || pool[a.j].seq - pool[b.j].seq,
    )

    for (const e of candidates) {
      const j = e.j
      const edgeCost = e.cross * CROSS_WEIGHT + e.diff2
      const nextMask = mask | (1 << i) | (1 << j)
      partner[i] = j
      partner[j] = i
      dfs(nextMask, curCost + edgeCost)
      partner[i] = -1
      partner[j] = -1
      if (truncated) return
    }
  }

  dfs(0, 0)

  if (!Number.isFinite(bestCost)) {
    return {
      ok: false,
      pairs: [],
      byeId,
      crossCount: 0,
      diff2Sum: 0,
      optimal: false,
      conflicts: diagnoseInfeasible(pool, adj, lockedEdges),
    }
  }

  const pairs: PairCandidate[] = []
  let crossCount = 0
  let diff2Sum = 0
  for (let i = 0; i < n; i++) {
    const j = bestPartner[i]
    if (j === -1 || j <= i) continue
    const cross = pool[i].score2 !== pool[j].score2
    const diff2 = Math.abs(pool[i].score2 - pool[j].score2)
    if (cross) crossCount++
    diff2Sum += diff2
    pairs.push({
      aId: pool[i].id,
      bId: pool[j].id,
      crossGroup: cross,
      diff2,
    })
  }

  return {
    ok: true,
    pairs,
    byeId,
    crossCount,
    diff2Sum,
    optimal: !truncated,
    conflicts: [],
  }
}

function emptyResult(
  ok: false,
  conflicts: string[],
  byeId: string | null = null,
): PairingSolution {
  return {
    ok,
    pairs: [],
    byeId,
    crossCount: 0,
    diff2Sum: 0,
    optimal: false,
    conflicts,
  }
}
