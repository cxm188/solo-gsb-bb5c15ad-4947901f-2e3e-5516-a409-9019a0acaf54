// 全局数据模型
// 积分统一使用“双倍积分”整数存储，避免 0.5 分带来的浮点误差：
// 胜 = 2，平 = 1，负 = 0，轮空（按胜计算）= 2。

/** 一场对局的结果：A 胜 / B 胜 / 平局 / 未录入 */
export type MatchResult = 'A' | 'B' | 'D' | ''

export interface Player {
  id: string
  name: string
  /** 录入顺序，作为所有并列情况下的确定性先后依据 */
  seq: number
}

export interface Match {
  id: string
  aId: string
  bId: string
  result: MatchResult
  /** 由人工锁定（不计入自动配对） */
  locked: boolean
  /** 生成该场对局时，双方是否属于不同积分组（用于展示与核对） */
  crossGroup: boolean
}

export interface Round {
  /** 轮空选手 id；人数为偶数时为 null */
  byeId: string | null
  matches: Match[]
  /** 本轮跨积分组对局数（快照） */
  crossCount: number
  /** 本轮双方总积分差之和（真实积分单位，快照） */
  scoreDiffSum: number
  /** 是否所有对局均已录入结果（轮空自动按胜处理） */
  complete: boolean
}

export interface TournamentState {
  players: Player[]
  rounds: Round[]
}

/** 求解器使用的选手视图 */
export interface PairingPlayer {
  id: string
  name: string
  seq: number
  /** 当前双倍积分 */
  score2: number
  /** 历史轮空次数 */
  byes: number
}

/** 人工指定的对局 */
export interface LockedPair {
  aId: string
  bId: string
}

export interface PairCandidate {
  aId: string
  bId: string
  crossGroup: boolean
  /** 双方双倍积分差 */
  diff2: number
}

export interface PairingSolution {
  ok: boolean
  pairs: PairCandidate[]
  byeId: string | null
  /** 跨积分组对局数 */
  crossCount: number
  /** 总双倍积分差 */
  diff2Sum: number
  /** 求到的是否为已证明最优解（未被搜索上限截断） */
  optimal: boolean
  /** 无解时的冲突原因 */
  conflicts: string[]
}
