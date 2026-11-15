import { Context, h, Logger } from "koishi";
export type CreditDataRenderInput = {
    username: string;
    userId: string;
    score: number;
    activityScore: number;
    assetScore: number;
    participationScore: number;
    interactionScore: number;
    bias: number;
    updateTime: string;
};
export declare function renderCreditImage(ctx: Context, logger: Logger, data: CreditDataRenderInput): Promise<string | h>;
