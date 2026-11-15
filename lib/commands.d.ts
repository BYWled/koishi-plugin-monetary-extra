import type { Context, Logger } from "koishi";
import { type ConfigInput } from "./core";
interface CommandDeps {
    ctx: Context;
    config: ConfigInput;
    logger: Logger;
}
export declare function registerCommands({ ctx, config, logger }: CommandDeps): void;
export {};
