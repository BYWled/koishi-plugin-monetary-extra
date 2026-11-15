export type SignRankMode = 'exp' | 'signCount'

export interface ChannelOverride extends Partial<ResolvedConfig> {
  channelId: string
}

export interface ConfigInput extends Partial<ResolvedConfig> {
  channelConfigs?: ChannelOverride[]
}

/** 各类经济行为的满分参与次数（近 windowDays 天内达到即拿满该维度） */
export interface ParticipationTargets {
  lottery: number
  cdk: number
  bourse: number
  mission: number
  chatRandom: number
}

export interface ParticipationCounts {
  lottery: number
  cdk: number
  bourse: number
  mission: number
  chatRandom: number
}

export interface ResolvedConfig {
  currency: string
  enableResign: boolean
  enableCredit: boolean
  enableBankSync: boolean
  resignCost: number
  rankLimit: number
  /** （已废弃，仅为兼容保留）旧版签到排名指标 */
  signRankMode: SignRankMode
  /** （旧版公式兼容变量）银行分权重 */
  bankWeight: number
  /** （旧版公式兼容变量）签到分权重 */
  signWeight: number
  creditFormula: string
  // ===== 信用分 v2：滚动窗口行为分 =====
  /** 滚动统计窗口（天） */
  windowDays: number
  activityWeight: number
  assetWeight: number
  participationWeight: number
  interactionWeight: number
  /** 资产分封顶：log10(1+cap) 对应满分 */
  assetCap: number
  /** 签到保鲜期（天）：距上次签到超过该天数则签到活性归零 */
  signFreshDays: number
  /** 累签天数对数封顶：达到该天数即拿满签到积累分 */
  signCountCap: number
  /** 社交活跃封顶：日均发言达到该值即拿满 */
  interactionDailyCap: number
  /** 各类经济行为的满分参与次数 */
  participationTargets: ParticipationTargets
  /** 频道偏置限幅（绝对值） */
  biasLimit: number
}

export const DEFAULT_CREDIT_FORMULA =
  'activityScore * activityWeight + assetScore * assetWeight + participationScore * participationWeight + interactionScore * interactionWeight + bias'

/** 兼容旧版默认公式的等价形式（bankScore/signScore 已映射到新维度） */
export const LEGACY_CREDIT_FORMULA = 'bankScore * bankWeight + signScore * signWeight + bias'

export const defaultParticipationTargets: ParticipationTargets = {
  lottery: 10,
  cdk: 3,
  bourse: 5,
  mission: 3,
  chatRandom: 5,
}

export const defaultConfig: ResolvedConfig = {
  currency: '信用点',
  enableResign: true,
  enableCredit: true,
  enableBankSync: true,
  resignCost: 100,
  rankLimit: 10,
  signRankMode: 'exp',
  bankWeight: 0.5,
  signWeight: 0.5,
  creditFormula: DEFAULT_CREDIT_FORMULA,
  windowDays: 30,
  activityWeight: 0.25,
  assetWeight: 0.2,
  participationWeight: 0.3,
  interactionWeight: 0.25,
  assetCap: 1_000_000,
  signFreshDays: 7,
  signCountCap: 200,
  interactionDailyCap: 20,
  participationTargets: defaultParticipationTargets,
  biasLimit: 10,
}

export function getChannelConfig(config: ConfigInput, channelId?: string): ResolvedConfig {
  const { channelConfigs, ...rest } = config
  const base = rest as Partial<ResolvedConfig>
  const override = channelId ? channelConfigs?.find(item => item.channelId === channelId) : undefined
  const { channelId: _ignored, ...overrideValues } = override ?? {} as object as Partial<ResolvedConfig> & { channelId?: string }
  return {
    ...defaultConfig,
    ...base,
    ...overrideValues,
    participationTargets: {
      ...defaultParticipationTargets,
      ...base.participationTargets,
      ...overrideValues.participationTargets,
    },
  }
}

export function toLocalDateKey(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isSameLocalDate(value: Date | string | number | null | undefined, now = new Date()): boolean {
  if (!value) return false
  return toLocalDateKey(value) === toLocalDateKey(now)
}

export function isMoreThanOneDayAgo(value: Date | string | number | null | undefined, now = new Date()): boolean {
  if (!value) return true
  const dateKey = toLocalDateKey(value)
  if (!dateKey) return true
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  return dateKey < toLocalDateKey(yesterday)
}

// ==================== 信用分 v2 ====================

export interface CreditDimensions {
  activityScore: number
  assetScore: number
  participationScore: number
  interactionScore: number
}

export interface CreditFormulaVariables extends CreditDimensions {
  activityWeight: number
  assetWeight: number
  participationWeight: number
  interactionWeight: number
  bias: number
  // 兼容旧自定义公式的映射变量
  bankScore: number
  signScore: number
  bankWeight: number
  signWeight: number
}

export interface CreditRawData {
  signCount: number
  /** 距最近一次签到的天数（无记录为 null） */
  lastSignDays: number | null
  assetTotal: number
  participationCounts: ParticipationCounts
  interactionDailyAvg: number
  /** 社交活跃数据来源：msgcount 主源 / snapshot 旧快照 / none 无数据 */
  interactionSource: 'msgcount' | 'snapshot' | 'none'
}

export interface CreditScore extends CreditDimensions {
  userId: string
  score: number
  bias: number
  raw: CreditRawData
}

export function computeActivityScore(
  signCount: number,
  lastSignAt: Date | null,
  freshDays: number,
  signCountCap: number,
): number {
  if (!lastSignAt) return 0
  const daysSince = Math.max(0, (Date.now() - lastSignAt.getTime()) / 86_400_000)
  // 保鲜度：断签超过 freshDays 天则归零，线性衰减
  const freshness = Math.max(0, 1 - daysSince / Math.max(1, freshDays))
  // 累签积累：对数封顶，边际收益递减
  const accumulation = Math.min(1, Math.log10(1 + Math.max(0, signCount)) / Math.log10(1 + Math.max(1, signCountCap)))
  return freshness * accumulation * 100
}

export function computeAssetScore(assetTotal: number, assetCap: number): number {
  if (assetTotal <= 0) return 0
  const cap = Math.max(1, assetCap)
  return Math.min(1, Math.log10(1 + assetTotal) / Math.log10(1 + cap)) * 100
}

/** 每类行为达到目标次数即拿满（min(1, count/target)），防小量高频刷分 */
export function computeParticipationScore(
  counts: ParticipationCounts,
  targets: ParticipationTargets,
): number {
  const entries: Array<[number, number]> = [
    [counts.lottery, targets.lottery],
    [counts.cdk, targets.cdk],
    [counts.bourse, targets.bourse],
    [counts.mission, targets.mission],
    [counts.chatRandom, targets.chatRandom],
  ]
  let sum = 0
  for (const [count, target] of entries) {
    sum += target > 0 ? Math.min(1, Math.max(0, count) / target) : 0
  }
  return (sum / entries.length) * 100
}

export function computeInteractionScore(dailyAvg: number, dailyCap: number): number {
  if (dailyAvg <= 0) return 0
  return Math.min(1, dailyAvg / Math.max(1, dailyCap)) * 100
}

export function evaluateCreditFormula(formula: string, variables: CreditFormulaVariables): number {
  const evaluate = (source: string) => {
    const names = Object.keys(variables) as Array<keyof CreditFormulaVariables>
    const values = names.map(name => variables[name])
    const fn = new Function(...names, `"use strict"; return (${source})`)
    const result = Number(fn(...values))
    if (!Number.isFinite(result)) throw new Error('non-finite credit formula result')
    return result
  }

  try {
    return evaluate(formula)
  } catch {
    return evaluate(DEFAULT_CREDIT_FORMULA)
  }
}

export interface ComputeCreditScoresInput {
  candidates: string[]
  /** 签到数据：userId -> [累签天数, 最近签到时间] */
  signData: Map<string, { signCount: number; lastSignAt: Date | null }>
  /** 总资产（现金 + 银行）：userId -> 数额 */
  assetTotals: Map<string, number>
  /** 参与度计数：userId -> 各类行为次数 */
  participationCounts: Map<string, ParticipationCounts>
  /** 日均发言：userId -> 数值 */
  interactionDailyAvg: Map<string, number>
  /** 社交活跃数据来源 */
  interactionSource: 'msgcount' | 'snapshot' | 'none'
  biases: Map<string, number>
  config: ResolvedConfig
}

export function computeCreditScores(input: ComputeCreditScoresInput): CreditScore[] {
  const { config } = input
  const candidates = [...new Set(input.candidates)]

  return candidates.map(userId => {
    const sign = input.signData.get(userId)
    const assetTotal = input.assetTotals.get(userId) ?? 0
    const counts = input.participationCounts.get(userId) ?? {
      lottery: 0, cdk: 0, bourse: 0, mission: 0, chatRandom: 0,
    }
    const dailyAvg = input.interactionDailyAvg.get(userId) ?? 0
    const rawBias = input.biases.get(userId) ?? 0
    const bias = Math.max(-config.biasLimit, Math.min(config.biasLimit, rawBias))

    const activityScore = computeActivityScore(
      sign?.signCount ?? 0,
      sign?.lastSignAt ?? null,
      config.signFreshDays,
      config.signCountCap,
    )
    const assetScore = computeAssetScore(assetTotal, config.assetCap)
    const participationScore = computeParticipationScore(counts, config.participationTargets)
    const interactionScore = computeInteractionScore(dailyAvg, config.interactionDailyCap)

    const variables: CreditFormulaVariables = {
      activityScore,
      assetScore,
      participationScore,
      interactionScore,
      activityWeight: config.activityWeight,
      assetWeight: config.assetWeight,
      participationWeight: config.participationWeight,
      interactionWeight: config.interactionWeight,
      bias,
      bankScore: assetScore,
      signScore: activityScore,
      bankWeight: config.bankWeight,
      signWeight: config.signWeight,
    }

    return {
      userId,
      score: evaluateCreditFormula(config.creditFormula, variables),
      activityScore,
      assetScore,
      participationScore,
      interactionScore,
      bias,
      raw: {
        signCount: sign?.signCount ?? 0,
        lastSignDays: sign?.lastSignAt == null ? null
          : Math.floor((Date.now() - sign.lastSignAt.getTime()) / 86_400_000),
        assetTotal,
        participationCounts: counts,
        interactionDailyAvg: dailyAvg,
        interactionSource: input.interactionSource,
      },
    }
  }).sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId))
}
