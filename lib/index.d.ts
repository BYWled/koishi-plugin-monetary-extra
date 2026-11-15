import { Context, Schema } from "koishi";
import { type ChannelOverride, type ConfigInput, type SignRankMode } from "./core";
export declare const name = "monetary-extra";
export declare const inject: {
    required: string[];
    optional: string[];
};
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
            withdraw(uid: number, currency: string, amount: number): Promise<{
                success: boolean;
                error?: string;
            }>;
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
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;
