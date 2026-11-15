import type { Context } from 'koishi';
export type MonetaryLikeContext = Context & {
    monetaryBank?: {
        withdraw(uid: number, currency: string, amount: number): Promise<{
            success: boolean;
            error?: string;
        }>;
    };
};
export interface CostResult {
    success: boolean;
    error?: string;
}
export declare function hasTable(ctx: {
    database: any;
}, tableName: string): boolean;
export declare function hasTables(ctx: {
    database: any;
}, tableNames: string[]): boolean;
export declare function getCashBalance(ctx: MonetaryLikeContext, uid: number, currency: string): Promise<number>;
export declare function getBankBalance(ctx: MonetaryLikeContext, uid: number, currency: string): Promise<number>;
export declare function getBankDemandBalance(ctx: MonetaryLikeContext, uid: number, currency: string): Promise<number>;
export declare function getTotalBalance(ctx: MonetaryLikeContext, uid: number, currency: string, enableBankSync: boolean): Promise<number>;
export declare function costWithBank(ctx: MonetaryLikeContext, uid: number, currency: string, amount: number, enableBankSync: boolean): Promise<CostResult>;
export declare function gainCash(ctx: MonetaryLikeContext, uid: number, currency: string, amount: number): Promise<void>;
