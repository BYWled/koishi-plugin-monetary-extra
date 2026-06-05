import type { Context } from 'koishi'
import {} from 'koishi-plugin-monetary'

export type MonetaryLikeContext = Context & {
  monetaryBank?: {
    withdraw(uid: number, currency: string, amount: number): Promise<{ success: boolean; error?: string }>
  }
}

export interface CostResult {
  success: boolean
  error?: string
}

export function hasTable(ctx: { database: any }, tableName: string): boolean {
  return Boolean((ctx.database as any).tables?.[tableName])
}

export function hasTables(ctx: { database: any }, tableNames: string[]): boolean {
  return tableNames.every(tableName => hasTable(ctx, tableName))
}

export async function getCashBalance(ctx: MonetaryLikeContext, uid: number, currency: string): Promise<number> {
  const [record] = await ctx.database.get('monetary', { uid, currency }, ['value'] as any)
  return Number(record?.value ?? 0)
}

export async function getBankBalance(ctx: MonetaryLikeContext, uid: number, currency: string): Promise<number> {
  if (!hasTable(ctx, 'monetary_bank_int')) return 0
  const records = await ctx.database.get('monetary_bank_int', { uid, currency } as any)
  return records.reduce((sum: number, record: any) => sum + Number(record.amount ?? 0), 0)
}

export async function getBankDemandBalance(ctx: MonetaryLikeContext, uid: number, currency: string): Promise<number> {
  if (!hasTable(ctx, 'monetary_bank_int')) return 0
  const records = await ctx.database.get('monetary_bank_int', { uid, currency, type: 'demand' } as any)
  return records.reduce((sum: number, record: any) => sum + Number(record.amount ?? 0), 0)
}

export async function getTotalBalance(
  ctx: MonetaryLikeContext,
  uid: number,
  currency: string,
  enableBankSync: boolean,
): Promise<number> {
  const cash = await getCashBalance(ctx, uid, currency)
  if (!enableBankSync || !ctx.monetaryBank || !hasTable(ctx, 'monetary_bank_int')) return cash
  return cash + await getBankBalance(ctx, uid, currency)
}

export async function costWithBank(
  ctx: MonetaryLikeContext,
  uid: number,
  currency: string,
  amount: number,
  enableBankSync: boolean,
): Promise<CostResult> {
  if (amount <= 0) return { success: true }

  const cash = await getCashBalance(ctx, uid, currency)
  if (cash >= amount) {
    await ctx.monetary.cost(uid, amount, currency)
    return { success: true }
  }

  if (!enableBankSync || !ctx.monetaryBank || !hasTable(ctx, 'monetary_bank_int')) {
    return { success: false, error: `余额不足，需要 ${amount} ${currency}，当前现金 ${cash} ${currency}` }
  }

  const shortage = amount - cash
  const demand = await getBankDemandBalance(ctx, uid, currency)
  if (demand < shortage) {
    return {
      success: false,
      error: `余额不足，需要 ${amount} ${currency}，当前现金 ${cash} ${currency}，银行活期 ${demand} ${currency}`,
    }
  }

  const withdraw = await ctx.monetaryBank.withdraw(uid, currency, shortage)
  if (!withdraw.success) {
    return { success: false, error: withdraw.error || '银行取款失败' }
  }

  try {
    await ctx.monetary.cost(uid, amount, currency)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '扣款失败' }
  }
}

export async function gainCash(ctx: MonetaryLikeContext, uid: number, currency: string, amount: number): Promise<void> {
  if (amount <= 0) return
  await ctx.monetary.gain(uid, amount, currency)
}
