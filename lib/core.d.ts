export type SignRankMode = 'exp' | 'signCount';
export interface ChannelOverride extends Partial<ResolvedConfig> {
    channelId: string;
}
export interface ConfigInput extends Partial<ResolvedConfig> {
    channelConfigs?: ChannelOverride[];
}
/** 各类经济行为的满分参与次数（近 windowDays 天内达到即拿满该维度） */
export interface ParticipationTargets {
    lottery: number;
    cdk: number;
    bourse: number;
    mission: number;
    chatRandom: number;
}
export interface ParticipationCounts {
    lottery: number;
    cdk: number;
    bourse: number;
    mission: number;
    chatRandom: number;
}
export interface ResolvedConfig {
    currency: string;
    enableResign: boolean;
    enableCredit: boolean;
    enableBankSync: boolean;
    resignCost: number;
    rankLimit: number;
    /** （已废弃，仅为兼容保留）旧版签到排名指标 */
    signRankMode: SignRankMode;
    /** （旧版公式兼容变量）银行分权重 */
    bankWeight: number;
    /** （旧版公式兼容变量）签到分权重 */
    signWeight: number;
    creditFormula: string;
    /** 滚动统计窗口（天） */
    windowDays: number;
    activityWeight: number;
    assetWeight: number;
    participationWeight: number;
    interactionWeight: number;
    /** 资产分封顶：log10(1+cap) 对应满分 */
    assetCap: number;
    /** 签到保鲜期（天）：距上次签到超过该天数则签到活性归零 */
    signFreshDays: number;
    /** 累签天数对数封顶：达到该天数即拿满签到积累分 */
    signCountCap: number;
    /** 社交活跃封顶：日均发言达到该值即拿满 */
    interactionDailyCap: number;
    /** 各类经济行为的满分参与次数 */
    participationTargets: ParticipationTargets;
    /** 频道偏置限幅（绝对值） */
    biasLimit: number;
}
export declare const DEFAULT_CREDIT_FORMULA = "activityScore * activityWeight + assetScore * assetWeight + participationScore * participationWeight + interactionScore * interactionWeight + bias";
/** 兼容旧版默认公式的等价形式（bankScore/signScore 已映射到新维度） */
export declare const LEGACY_CREDIT_FORMULA = "bankScore * bankWeight + signScore * signWeight + bias";
export declare const defaultParticipationTargets: ParticipationTargets;
export declare const defaultConfig: ResolvedConfig;
export declare function getChannelConfig(config: ConfigInput, channelId?: string): ResolvedConfig;
export declare function toLocalDateKey(value: Date | string | number): string;
export declare function isSameLocalDate(value: Date | string | number | null | undefined, now?: Date): boolean;
export declare function isMoreThanOneDayAgo(value: Date | string | number | null | undefined, now?: Date): boolean;
export interface CreditDimensions {
    activityScore: number;
    assetScore: number;
    participationScore: number;
    interactionScore: number;
}
export interface CreditFormulaVariables extends CreditDimensions {
    activityWeight: number;
    assetWeight: number;
    participationWeight: number;
    interactionWeight: number;
    bias: number;
    bankScore: number;
    signScore: number;
    bankWeight: number;
    signWeight: number;
}
export interface CreditRawData {
    signCount: number;
    /** 距最近一次签到的天数（无记录为 null） */
    lastSignDays: number | null;
    assetTotal: number;
    participationCounts: ParticipationCounts;
    interactionDailyAvg: number;
    /** 社交活跃数据来源：msgcount 主源 / snapshot 旧快照 / none 无数据 */
    interactionSource: 'msgcount' | 'snapshot' | 'none';
}
export interface CreditScore extends CreditDimensions {
    userId: string;
    score: number;
    bias: number;
    raw: CreditRawData;
}
export declare function computeActivityScore(signCount: number, lastSignAt: Date | null, freshDays: number, signCountCap: number): number;
export declare function computeAssetScore(assetTotal: number, assetCap: number): number;
/** 每类行为达到目标次数即拿满（min(1, count/target)），防小量高频刷分 */
export declare function computeParticipationScore(counts: ParticipationCounts, targets: ParticipationTargets): number;
export declare function computeInteractionScore(dailyAvg: number, dailyCap: number): number;
export declare function evaluateCreditFormula(formula: string, variables: CreditFormulaVariables): number;
export interface ComputeCreditScoresInput {
    candidates: string[];
    /** 签到数据：userId -> [累签天数, 最近签到时间] */
    signData: Map<string, {
        signCount: number;
        lastSignAt: Date | null;
    }>;
    /** 总资产（现金 + 银行）：userId -> 数额 */
    assetTotals: Map<string, number>;
    /** 参与度计数：userId -> 各类行为次数 */
    participationCounts: Map<string, ParticipationCounts>;
    /** 日均发言：userId -> 数值 */
    interactionDailyAvg: Map<string, number>;
    /** 社交活跃数据来源 */
    interactionSource: 'msgcount' | 'snapshot' | 'none';
    biases: Map<string, number>;
    config: ResolvedConfig;
}
export declare function computeCreditScores(input: ComputeCreditScoresInput): CreditScore[];
