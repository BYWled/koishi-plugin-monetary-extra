import { Context, Logger, Schema } from "koishi";
import {} from "koishi-plugin-monetary";
import {
  defaultConfig,
  DEFAULT_CREDIT_FORMULA,
  type ChannelOverride,
  type ConfigInput,
  type SignRankMode,
} from "./core";
import { registerCommands } from "./commands";

export const name = "monetary-extra";

export const inject = {
  required: ["database", "monetary"],
  optional: ["monetaryBank", "puppeteer"],
};

const logger = new Logger("monetary-extra");

export interface MonetaryCreditBias {
  userId: string;
  channelId: string;
  bias: number;
}

export interface JrysRecord {
  id: number;
  name: string;
  time: Date;
  exp: number;
  signCount: number;
}

export interface MonetaryBankInterest {
  id: number;
  uid: number;
  currency: string;
  amount: number;
  type: "demand" | "fixed";
  rate: number;
  cycle: "day" | "week" | "month";
  settlementDate: Date;
  extendRequested: boolean;
  nextRate?: number;
  nextCycle?: "day" | "week" | "month";
}

/** message-counter 的记录表（只读联动，用于社交活跃分兜底） */
export interface MessageCounterRecords {
  channelId: string;
  channelName: string;
  userId: string;
  username: string;
  userAvatar: string;
  todayPostCount: number;
  thisWeekPostCount: number;
  thisMonthPostCount: number;
  thisYearPostCount: number;
  totalPostCount: number;
  yesterdayPostCount: number;
}

declare module "koishi" {
  interface Tables {
    monetary_credit_bias: MonetaryCreditBias;
    jrys: JrysRecord;
    monetary_bank_int: MonetaryBankInterest;
    message_counter_records: MessageCounterRecords;
  }

  interface Context {
    monetaryBank?: {
      withdraw(
        uid: number,
        currency: string,
        amount: number,
      ): Promise<{ success: boolean; error?: string }>;
    };
    puppeteer?: {
      page(): Promise<any>;
    };
  }
}

export interface Config extends ConfigInput {
  currency: string;
  enableResign: boolean;
  enableCredit: boolean;
  enableBankSync: boolean;
  resignCost: number;
  rankLimit: number;
  signRankMode: SignRankMode;
  bankWeight: number;
  signWeight: number;
  creditFormula: string;
  channelConfigs: ChannelOverride[];
}

const creditFormulaDescription = `<div>
  <p>默认公式：<code>activityScore * activityWeight + assetScore * assetWeight + participationScore * participationWeight + interactionScore * interactionWeight + bias</code>。</p>
<h3>变量含义（各维度分均为 0-100）：</h3>
  <ul>
    <li><b>activityScore</b>：签到活性 = 保鲜度（${defaultConfig.signFreshDays} 天内断签线性衰减）× 累签天数对数积累（封顶 ${defaultConfig.signCountCap} 天）。</li>
    <li><b>assetScore</b>：资产稳健 = 总资产（现金+银行）对数分，封顶 ${defaultConfig.assetCap}，刷钱边际收益递减。</li>
    <li><b>participationScore</b>：经济参与 = 近 ${defaultConfig.windowDays} 天抽奖/兑换/股票/任务/随机奖励行为的达标均值（每类达到目标次数即满分，超出不加分）。</li>
    <li><b>interactionScore</b>：社交活跃 = 近 ${defaultConfig.windowDays} 天日均发言（数据源 chat_reward_snapshot，不足时用 msgcount 本月数据兜底），日均 ${defaultConfig.interactionDailyCap} 条封顶。</li>
    <li><b>activityWeight / assetWeight / participationWeight / interactionWeight</b>：各维度权重。</li>
    <li><b>bias</b>：频道偏置表 <code>monetary_credit_bias</code> 中的附加值，限幅 ±${defaultConfig.biasLimit}。</li>
    <li>兼容旧公式变量：<code>bankScore</code>=资产稳健分，<code>signScore</code>=签到活性分。</li>
  </ul>
</div>
`;

const ChannelConfigSchema = Schema.intersect([
  Schema.object({
    channelId: Schema.string().required().description("频道 ID"),
  }).description("频道标识"),
  Schema.object({
    currency: Schema.string().description("覆盖默认货币单位"),
    enableBankSync: Schema.boolean().description(
      "覆盖是否允许现金不足时联动银行活期余额",
    ),
  }).description("基础覆盖"),
  Schema.object({
    enableResign: Schema.boolean().description("覆盖是否启用补签"),
    enableCredit: Schema.boolean().description("覆盖是否启用信用分"),
    resignCost: Schema.number().min(0).description("覆盖补签费用，0 表示免费"),
    rankLimit: Schema.number()
      .min(1)
      .step(1)
      .description("覆盖信用分排行榜数量"),
  }).description("功能覆盖"),
  Schema.object({
    activityWeight: Schema.number().min(0).max(1).description("覆盖签到活性权重"),
    assetWeight: Schema.number().min(0).max(1).description("覆盖资产稳健权重"),
    participationWeight: Schema.number().min(0).max(1).description("覆盖经济参与权重"),
    interactionWeight: Schema.number().min(0).max(1).description("覆盖社交活跃权重"),
    creditFormula: Schema.string()
      .role("textarea")
      .description(creditFormulaDescription),
  }).description("信用分覆盖"),
]);

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    currency: Schema.string()
      .default(defaultConfig.currency)
      .description("默认货币单位"),
    enableResign: Schema.boolean()
      .default(defaultConfig.enableResign)
      .description("是否启用补签指令"),
    enableCredit: Schema.boolean()
      .default(defaultConfig.enableCredit)
      .description("是否启用信用分指令"),
    enableBankSync: Schema.boolean()
      .default(defaultConfig.enableBankSync)
      .description("现金不足时是否联动银行活期余额"),
  }).description("基础设置"),
  Schema.object({
    resignCost: Schema.number()
      .min(0)
      .default(defaultConfig.resignCost)
      .description("补签费用，0 表示免费"),
    rankLimit: Schema.number()
      .min(1)
      .step(1)
      .default(defaultConfig.rankLimit)
      .description("信用分排行榜数量"),
  }).description("功能设置"),
  Schema.object({
    windowDays: Schema.number().min(7).step(1).default(defaultConfig.windowDays)
      .description("信用分滚动统计窗口（天）"),
    activityWeight: Schema.number().min(0).max(1).default(defaultConfig.activityWeight)
      .description("信用分中签到活性的权重"),
    assetWeight: Schema.number().min(0).max(1).default(defaultConfig.assetWeight)
      .description("信用分中资产稳健的权重"),
    participationWeight: Schema.number().min(0).max(1).default(defaultConfig.participationWeight)
      .description("信用分中经济参与的权重"),
    interactionWeight: Schema.number().min(0).max(1).default(defaultConfig.interactionWeight)
      .description("信用分中社交活跃的权重"),
  }).description("信用分维度权重"),
  Schema.object({
    assetCap: Schema.number().min(1000).default(defaultConfig.assetCap)
      .description("资产分封顶值：总资产达到该值即拿满分（对数压缩）"),
    signFreshDays: Schema.number().min(1).step(1).default(defaultConfig.signFreshDays)
      .description("签到保鲜期（天）：断签超过该天数签到活性归零"),
    signCountCap: Schema.number().min(10).step(1).default(defaultConfig.signCountCap)
      .description("累签天数封顶：达到该天数即拿满签到积累分（对数压缩）"),
    interactionDailyCap: Schema.number().min(1).default(defaultConfig.interactionDailyCap)
      .description("社交活跃封顶：日均发言达到该值即拿满分"),
    biasLimit: Schema.number().min(0).default(defaultConfig.biasLimit)
      .description("频道偏置限幅（绝对值）"),
  }).description("信用分封顶与限幅"),
  Schema.object({
    creditFormula: Schema.string()
      .default(DEFAULT_CREDIT_FORMULA)
      .role("textarea")
      .description(creditFormulaDescription),
  }).description("自定义公式（留空保持默认）"),
  Schema.object({
    channelConfigs: Schema.array(ChannelConfigSchema)
      .role("table")
      .default([])
      .description(
        "按频道覆盖默认配置；只填写需要特殊调整的字段，未填写项会继承上方默认值。",
      ),
  }).description("频道覆盖"),
]) as Schema<Config>;

export function apply(ctx: Context, config: Config) {
  ctx.model.extend(
    "monetary_credit_bias",
    {
      userId: "string",
      channelId: "string",
      bias: "double",
    },
    {
      primary: ["userId", "channelId"],
    },
  );

  registerCommands({ ctx, config, logger });
}
