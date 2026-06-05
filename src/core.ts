export type SignRankMode = 'exp' | 'signCount'

export interface ChannelOverride extends Partial<ResolvedConfig> {
  channelId: string
}

export interface ConfigInput extends Partial<ResolvedConfig> {
  channelConfigs?: ChannelOverride[]
}

export interface ResolvedConfig {
  currency: string
  enableResign: boolean
  enableCredit: boolean
  enableBankSync: boolean
  resignCost: number
  rankLimit: number
  signRankMode: SignRankMode
  bankWeight: number
  signWeight: number
  creditFormula: string
}

export interface RankedMetric {
  rank: number
  score: number
  value: number
  hasData: boolean
}

export interface CreditFormulaVariables {
  bankScore: number
  signScore: number
  bankWeight: number
  signWeight: number
  bias: number
  bankRank: number
  signRank: number
  maxRank: number
}

export interface ComputeCreditScoresInput {
  candidates: string[]
  bankMetrics: Map<string, number>
  signMetrics: Map<string, number>
  biases: Map<string, number>
  bankWeight: number
  signWeight: number
  creditFormula: string
}

export interface CreditScore {
  userId: string
  score: number
  bankRank: number
  signRank: number
  bankScore: number
  signScore: number
  bias: number
}

export const DEFAULT_CREDIT_FORMULA = 'bankScore * bankWeight + signScore * signWeight + bias'

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
}

export function getChannelConfig(config: ConfigInput, channelId?: string): ResolvedConfig {
  const { channelConfigs, ...base } = config
  const override = channelId ? channelConfigs?.find(item => item.channelId === channelId) : undefined
  const { channelId: _ignored, ...overrideValues } = override ?? {}
  return {
    ...defaultConfig,
    ...base,
    ...overrideValues,
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

export function rankMetric(items: Array<{ userId: string; value: number }>): Map<string, RankedMetric> {
  const maxRank = Math.max(items.length, 1)
  const sorted = [...items].sort((a, b) => b.value - a.value || a.userId.localeCompare(b.userId))
  const result = new Map<string, RankedMetric>()

  sorted.forEach((item, index) => {
    const rank = item.value > 0 ? index + 1 : maxRank
    result.set(item.userId, {
      rank,
      score: item.value > 0 ? ((maxRank - rank + 1) / maxRank) * 100 : 0,
      value: item.value,
      hasData: item.value > 0,
    })
  })

  return result
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

export function computeCreditScores(input: ComputeCreditScoresInput): CreditScore[] {
  const candidates = [...new Set(input.candidates)]
  const maxRank = Math.max(candidates.length, 1)
  const bankRanks = rankMetric(candidates.map(userId => ({
    userId,
    value: input.bankMetrics.get(userId) ?? 0,
  })))
  const signRanks = rankMetric(candidates.map(userId => ({
    userId,
    value: input.signMetrics.get(userId) ?? 0,
  })))

  return candidates.map(userId => {
    const bank = bankRanks.get(userId)!
    const sign = signRanks.get(userId)!
    const bias = input.biases.get(userId) ?? 0
    const variables = {
      bankScore: bank.score,
      signScore: sign.score,
      bankWeight: input.bankWeight,
      signWeight: input.signWeight,
      bias,
      bankRank: bank.rank,
      signRank: sign.rank,
      maxRank,
    }

    return {
      userId,
      score: evaluateCreditFormula(input.creditFormula, variables),
      bankRank: bank.rank,
      signRank: sign.rank,
      bankScore: bank.score,
      signScore: sign.score,
      bias,
    }
  }).sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId))
}
