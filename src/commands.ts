import type { Context, Logger, Session } from 'koishi'
import {
  computeCreditScores,
  getChannelConfig,
  isSameLocalDate,
  isMoreThanOneDayAgo,
  type ConfigInput,
  type ResolvedConfig,
} from './core'
import { costWithBank, hasTables, type MonetaryLikeContext } from './services'

interface CommandDeps {
  ctx: Context
  config: ConfigInput
  logger: Logger
}

interface JrysRecord {
  id: number
  name: string
  time: Date
  exp: number
  signCount: number
}

interface CreditData {
  candidates: string[]
  bankMetrics: Map<string, number>
  signMetrics: Map<string, number>
  biases: Map<string, number>
  names: Map<string, string>
}

function getSessionUid(session: Session<'id'>): number | null {
  const uid = Number(session.user?.id)
  return Number.isFinite(uid) ? uid : null
}

function getSessionConfig(session: Session, config: ConfigInput): ResolvedConfig {
  return getChannelConfig(config, session.channelId)
}

function missingJrysMessage() {
  return '缺少 jrys 数据表，请确认 koishi-plugin-jrys-fix 已启用并完成过签到。'
}

function getBiasChannelId(session: Session): string {
  return session.channelId || 'global'
}

async function getJrysRecord(ctx: Context, userId: string): Promise<JrysRecord | undefined> {
  const records = await ctx.database.get('jrys' as any, { name: userId } as any)
  return records[0] as JrysRecord | undefined
}

async function setJrysTime(ctx: Context, userId: string, time: Date) {
  await ctx.database.set('jrys' as any, { name: userId } as any, { time } as any)
}

function formatRank(rank: number) {
  return rank > 0 ? `#${rank}` : '无'
}

function formatUser(userId: string, names: Map<string, string>) {
  const name = names.get(userId)
  return name ? `${name}(${userId})` : userId
}

async function collectCreditData(ctx: Context, config: ResolvedConfig, biasChannelId: string): Promise<CreditData> {
  const jrysRows = await ctx.database.get('jrys' as any, {} as any) as JrysRecord[]
  const candidates = [...new Set(jrysRows.map(row => String(row.name)).filter(Boolean))]
  const bankMetrics = new Map<string, number>()
  const signMetrics = new Map<string, number>()
  const biases = new Map<string, number>()
  const names = new Map<string, string>()

  for (const row of jrysRows) {
    const userId = String(row.name)
    const metric = Number(config.signRankMode === 'signCount' ? row.signCount : row.exp) || 0
    signMetrics.set(userId, metric)
    if (row.name) names.set(userId, row.name)
  }

  if (config.enableBankSync && (ctx as any).database.tables?.monetary_bank_int) {
    const bankRows = await ctx.database.get('monetary_bank_int' as any, { currency: config.currency } as any)
    for (const row of bankRows as any[]) {
      const userId = String(row.uid)
      if (!candidates.includes(userId)) continue
      bankMetrics.set(userId, (bankMetrics.get(userId) ?? 0) + Number(row.amount ?? 0))
    }
  }

  if ((ctx as any).database.tables?.monetary_credit_bias) {
    const biasRows = await ctx.database.get('monetary_credit_bias' as any, { channelId: biasChannelId } as any)
    for (const row of biasRows as any[]) {
      biases.set(String(row.userId), Number(row.bias ?? 0))
    }
  }

  return { candidates, bankMetrics, signMetrics, biases, names }
}

async function getSignExpReward(ctx: Context): Promise<number> {
  try {
    const jrysFix = (ctx as any).registry?.get?.('jrys-fix')
    if (jrysFix?.config?.signExp != null) return Number(jrysFix.config.signExp) || 0
  } catch {}
  return 0
}

export function registerCommands({ ctx, config, logger }: CommandDeps) {
  ctx.command('resign', '付费补签')
    .userFields(['id'])
    .action(async ({ session }) => {
      if (!session) return '无法获取会话信息。'
      const resolved = getSessionConfig(session, config)
      if (!resolved.enableResign) return '补签功能未启用。'
      if (!hasTables(ctx, ['jrys'])) return missingJrysMessage()

      const userId = session.userId
      if (!userId) return '无法获取用户 ID。'

      const uid = getSessionUid(session as Session<'id'>)
      if (uid == null) return '无法获取用户数字 ID。'

      const record = await getJrysRecord(ctx, userId)
      if (!record) return '没有找到你的签到记录，无法补签。'
      if (isSameLocalDate(record.time)) return '今天已经签到，不能补签。'
      if (!isMoreThanOneDayAgo(record.time)) return '上次签到距今不足一天，无法补签。'

      const cost = await costWithBank(ctx as MonetaryLikeContext, uid, resolved.currency, resolved.resignCost, resolved.enableBankSync)
      if (!cost.success) return cost.error || '补签扣款失败。'

      // 触发签到逻辑：增加经验值、累签天数 +1
      const signExpReward = await getSignExpReward(ctx)
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      yesterday.setHours(12, 0, 0, 0)

      await ctx.database.set('jrys' as any, { name: userId } as any, {
        exp: (record.exp || 0) + signExpReward,
        signCount: (record.signCount || 0) + 1,
        time: yesterday,
      } as any)

      return resolved.resignCost > 0
        ? `补签成功，已扣除 ${resolved.resignCost} ${resolved.currency}。`
        : '补签成功。'
    })

  ctx.command('credit', '查看信用分')
    .userFields(['id'])
    .action(async ({ session }) => {
      if (!session) return '无法获取会话信息。'
      const resolved = getSessionConfig(session, config)
      if (!resolved.enableCredit) return '信用分功能未启用。'
      if (!hasTables(ctx, ['jrys'])) return missingJrysMessage()

      const userId = session.userId
      if (!userId) return '无法获取用户 ID。'

      const { candidates, bankMetrics, signMetrics, biases } = await collectCreditData(ctx, resolved, getBiasChannelId(session))
      if (!candidates.includes(userId)) return '没有找到你的签到记录，暂无信用分。'

      const score = computeCreditScores({
        candidates,
        bankMetrics,
        signMetrics,
        biases,
        bankWeight: resolved.bankWeight,
        signWeight: resolved.signWeight,
        creditFormula: resolved.creditFormula,
      }).find(item => item.userId === userId)

      if (!score) return '暂无信用分数据。'
      return [
        `信用分：${score.score.toFixed(2)}`,
        `银行排名：${formatRank(score.bankRank)}`,
        `签到排名：${formatRank(score.signRank)}`,
      ].join('\n')
    })

  ctx.command('credit.rank', '查看信用分排行')
    .action(async ({ session }) => {
      if (!session) return '无法获取会话信息。'
      const resolved = getSessionConfig(session, config)
      if (!resolved.enableCredit) return '信用分功能未启用。'
      if (!hasTables(ctx, ['jrys'])) return missingJrysMessage()

      const { candidates, bankMetrics, signMetrics, biases, names } = await collectCreditData(ctx, resolved, getBiasChannelId(session))
      if (candidates.length === 0) return '暂无信用分数据。'

      const scores = computeCreditScores({
        candidates,
        bankMetrics,
        signMetrics,
        biases,
        bankWeight: resolved.bankWeight,
        signWeight: resolved.signWeight,
        creditFormula: resolved.creditFormula,
      }).slice(0, resolved.rankLimit)

      logger.debug(`credit.rank candidates=${candidates.length}`)
      return [
        '信用分排行：',
        ...scores.map((item, index) => `${index + 1}. ${formatUser(item.userId, names)} - ${item.score.toFixed(2)}（银行${formatRank(item.bankRank)} / 签到${formatRank(item.signRank)}）`),
      ].join('\n')
    })
}
