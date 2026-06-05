import { Context, Logger, Schema } from "koishi";
import {} from "koishi-plugin-monetary";
import {
  defaultConfig,
  type ChannelOverride,
  type ConfigInput,
  type SignRankMode,
} from "./core";
import { registerCommands } from "./commands";

export const name = "monetary-extra";

export const inject = {
  required: ["database", "monetary"],
  optional: ["monetaryBank"],
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

declare module "koishi" {
  interface Tables {
    monetary_credit_bias: MonetaryCreditBias;
    jrys: JrysRecord;
    monetary_bank_int: MonetaryBankInterest;
  }

  interface Context {
    monetaryBank?: {
      withdraw(
        uid: number,
        currency: string,
        amount: number,
      ): Promise<{ success: boolean; error?: string }>;
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
  <p>默认公式：<code>bankScore * bankWeight + signScore * signWeight + bias</code>。</p>
<h3>变量含义：</h3>
  <ul>
    <li><b>bankScore</b>：银行排名分，按频道内候选人的银行余额排名换算为 0-100。</li>
    <li><b>signScore</b>：签到排名分，按频道内候选人的 <code>exp</code> 或 <code>signCount</code> 排名换算为 0-100。</li>
    <li><b>bankWeight</b> / <b>signWeight</b>：两部分分数的权重。</li>
    <li><b>bias</b>：频道偏置表 <code>monetary_credit_bias</code> 中的附加值。</li>
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
    signRankMode: Schema.union(["exp", "signCount"] as const).description(
      "覆盖签到排名指标",
    ),
  }).description("功能覆盖"),
  Schema.object({
    bankWeight: Schema.number().min(0).description("覆盖银行分权重"),
    signWeight: Schema.number().min(0).description("覆盖签到分权重"),
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
    signRankMode: Schema.union(["exp", "signCount"] as const)
      .default(defaultConfig.signRankMode)
      .description(
        "信用分里的签到排名依据：exp 表示按经验值，signCount 表示按累签次数",
      ),
  }).description("功能设置"),
  Schema.object({
    bankWeight: Schema.number()
      .min(0)
      .default(defaultConfig.bankWeight)
      .description("信用分中银行分的权重"),
    signWeight: Schema.number()
      .min(0)
      .default(defaultConfig.signWeight)
      .description("信用分中签到分的权重"),
    creditFormula: Schema.string()
      .default(defaultConfig.creditFormula)
      .role("textarea")
      .description(creditFormulaDescription),
  }).description("信用分设置"),
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
