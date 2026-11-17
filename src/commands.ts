import type { Context, Logger, Session } from "koishi";
import {
  computeCreditScores,
  getChannelConfig,
  isSameLocalDate,
  isMoreThanOneDayAgo,
  toLocalDateKey,
  type ConfigInput,
  type ParticipationCounts,
  type ResolvedConfig,
} from "./core";
import { costWithBank, hasTable, hasTables, type MonetaryLikeContext } from "./services";
import { renderCreditImage } from "./render";

interface CommandDeps {
  ctx: Context;
  config: ConfigInput;
  logger: Logger;
}

interface JrysRecord {
  id: number;
  name: string;
  time: Date;
  exp: number;
  signCount: number;
}

interface CreditData {
  candidates: string[];
  signData: Map<string, { signCount: number; lastSignAt: Date | null }>;
  assetTotals: Map<string, number>;
  participationCounts: Map<string, ParticipationCounts>;
  interactionDailyAvg: Map<string, number>;
  interactionSource: 'msgcount' | 'snapshot' | 'none';
  biases: Map<string, number>;
  names: Map<string, string>;
}

function getSessionUid(session: Session<"id">): number | null {
  const uid = Number(session.user?.id);
  return Number.isFinite(uid) ? uid : null;
}

function getSessionConfig(
  session: Session,
  config: ConfigInput,
): ResolvedConfig {
  return getChannelConfig(config, session.channelId);
}

function missingJrysMessage() {
  return "缺少 jrys 数据表，请确认 koishi-plugin-jrys-fix 已启用并完成过签到。";
}

/**
 * jrys-fix 的 name 字段兼容两种格式：平台 userId（'Alice'）或 '@昵称'（'@Bob'）。
 * 归一化去掉前导 @，保证信用分/补签与 session.userId 匹配。
 */
function normalizeJrysName(name: string): string {
  return name.startsWith("@") ? name.slice(1) : name;
}

function getBiasChannelId(session: Session): string {
  return session.channelId || "global";
}

async function getJrysRecord(
  ctx: Context,
  userId: string,
  uid?: number | null,
): Promise<JrysRecord | undefined> {
  // 1. 优先通过 jrys 表的主键 id（即 Koishi 内部 uid / aid）查询
  if (uid != null) {
    const byId = await ctx.database.get("jrys" as any, { id: uid } as any);
    if (byId[0]) return byId[0] as JrysRecord | undefined;
  }
  // 2. 尝试从 binding 表反查 uid 并匹配 jrys.id
  if (hasTable(ctx, "binding")) {
    const bindings = await (ctx as any).database.get("binding", { pid: userId });
    for (const b of bindings as any[]) {
      const aid = Number(b.aid);
      if (Number.isFinite(aid)) {
        const byAid = await ctx.database.get("jrys" as any, { id: aid } as any);
        if (byAid[0]) return byAid[0] as JrysRecord | undefined;
      }
    }
  }
  // 3. 兼容历史以平台 userId 或 '@userId' 存入 name 的情况
  const records = await ctx.database.get(
    "jrys" as any,
    { name: userId } as any,
  );
  if (records[0]) return records[0] as JrysRecord | undefined;
  // 兼容 jrys-fix 以 '@昵称' 存储的情况
  const fallback = await ctx.database.get(
    "jrys" as any,
    { name: `@${userId}` } as any,
  );
  return fallback[0] as JrysRecord | undefined;
}

async function setJrysTime(ctx: Context, idOrUserId: number | string, time: Date) {
  if (typeof idOrUserId === "number") {
    await ctx.database.set(
      "jrys" as any,
      { id: idOrUserId } as any,
      { time } as any,
    );
  } else {
    await ctx.database.set(
      "jrys" as any,
      { name: idOrUserId } as any,
      { time } as any,
    );
    await ctx.database.set(
      "jrys" as any,
      { name: `@${idOrUserId}` } as any,
      { time } as any,
    );
  }
}

function formatUser(userId: string, names: Map<string, string>) {
  const name = names.get(userId);
  return name ? `${name}(${userId})` : userId;
}

/** 构建 Koishi 内部 uid（aid）→ 平台 userId 的映射 */
async function buildUidToUserIdMap(ctx: Context): Promise<Map<number, string>> {
  const uidToUserId = new Map<number, string>();
  if (!(ctx as any).database.tables?.binding) return uidToUserId;
  const bindings = await (ctx as any).database.get("binding", {});
  for (const b of bindings as any[]) {
    // binding 以 platform / pid 两列分别存储平台与平台用户 ID，pid 即平台 userId
    const aid = Number(b.aid);
    const platformUserId = String(b.pid);
    if (!uidToUserId.has(aid)) uidToUserId.set(aid, platformUserId);
  }
  return uidToUserId;
}

function emptyCounts(): ParticipationCounts {
  return { lottery: 0, cdk: 0, bourse: 0, mission: 0, chatRandom: 0 };
}

/** 统计某表中 uid 字段在窗口内的行为次数，并入 counts 映射 */
async function countByUid(
  ctx: Context,
  tableName: string,
  timeField: string,
  windowStart: Date,
  extraQuery: Record<string, any> | null,
  counts: Map<string, ParticipationCounts>,
  uidToUserId: Map<number, string>,
  key: keyof ParticipationCounts,
): Promise<void> {
  if (!hasTable(ctx, tableName)) return;
  const query: Record<string, any> = { [timeField]: { $gte: windowStart } };
  if (extraQuery) Object.assign(query, extraQuery);
  const rows = await (ctx as any).database.get(tableName, query);
  for (const row of rows as any[]) {
    const uid = Number(row.uid);
    if (!Number.isFinite(uid)) continue;
    const userId = uidToUserId.get(uid) ?? String(uid);
    const entry = counts.get(userId) ?? emptyCounts();
    entry[key] += 1;
    counts.set(userId, entry);
  }
}

async function collectCreditData(
  ctx: Context,
  config: ResolvedConfig,
  biasChannelId: string,
): Promise<CreditData> {
  const uidToUserId = await buildUidToUserIdMap(ctx);

  const jrysRows = (await ctx.database.get(
    "jrys" as any,
    {} as any,
  )) as JrysRecord[];

  const candidates: string[] = [];
  const signData = new Map<string, { signCount: number; lastSignAt: Date | null }>();
  const names = new Map<string, string>();
  for (const row of jrysRows) {
    const aid = Number(row.id);
    const rawName = String(row.name ?? "");
    const cleanName = normalizeJrysName(rawName);
    // 优先通过 binding 将 jrys.id（即 aid/uid）转换为平台 userId（如 QQ号）
    // 若 binding 中不存在，则退回使用 cleanName 或 aid 字符串（兼容沙盒测试或无 binding 环境）
    const userId = (Number.isFinite(aid) ? uidToUserId.get(aid) : null) || cleanName || String(row.id);
    if (!userId) continue;

    if (!candidates.includes(userId)) {
      candidates.push(userId);
    }
    if (!signData.has(userId)) {
      signData.set(userId, {
        signCount: Number(row.signCount ?? 0),
        lastSignAt: row.time ? new Date(row.time) : null,
      });
    }

    const displayName = cleanName || rawName;
    if (displayName && displayName !== userId) {
      names.set(userId, displayName);
    } else if (rawName) {
      names.set(userId, rawName);
    }
  }

  // 资产 = 现金 + 银行（活期 + 定期）
  const assetTotals = new Map<string, number>();
  const addAsset = (uid: number, amount: number) => {
    const userId = uidToUserId.get(uid) ?? String(uid);
    if (!candidates.includes(userId)) return;
    assetTotals.set(userId, (assetTotals.get(userId) ?? 0) + amount);
  };
  if (hasTable(ctx, "monetary")) {
    const cashRows = await ctx.database.get("monetary", {
      currency: config.currency,
    } as any);
    for (const row of cashRows as any[]) {
      addAsset(Number(row.uid), Number(row.value ?? 0));
    }
  }
  if (hasTable(ctx, "monetary_bank_int")) {
    const bankRows = await ctx.database.get("monetary_bank_int", {
      currency: config.currency,
    } as any);
    for (const row of bankRows as any[]) {
      addAsset(Number(row.uid), Number(row.amount ?? 0));
    }
  }

  // 参与度：滚动窗口内各类经济行为计数（表不存在则跳过该维度数据）
  const windowStart = new Date(Date.now() - config.windowDays * 86_400_000);
  const participationCounts = new Map<string, ParticipationCounts>();
  await countByUid(ctx, "lottery_record", "createdAt", windowStart, null,
    participationCounts, uidToUserId, "lottery");
  await countByUid(ctx, "cdk_redemption", "createdAt", windowStart, null,
    participationCounts, uidToUserId, "cdk");
  await countByUid(ctx, "bourse_pending", "startTime", windowStart, null,
    participationCounts, uidToUserId, "bourse");
  await countByUid(ctx, "mission_progress", "acceptTime", windowStart, null,
    participationCounts, uidToUserId, "mission");
  await countByUid(ctx, "chat_reward_log", "createdAt", windowStart,
    { type: "random" }, participationCounts, uidToUserId, "chatRandom");

  // 社交活跃：主源为聊天统计插件（message-counter）本月计数；无统计插件时回退旧快照表（遗留数据）
  const interactionDailyAvg = new Map<string, number>();
  let interactionSource: 'msgcount' | 'snapshot' | 'none' = 'none';
  if (hasTable(ctx, "message_counter_records")) {
    const now = new Date();
    const daysIntoMonth = now.getDate();
    const counterRows = await ctx.database.get("message_counter_records", {} as any);
    for (const row of counterRows as any[]) {
      const userId = String(row.userId);
      if (!candidates.includes(userId)) continue;
      interactionDailyAvg.set(
        userId,
        Number(row.thisMonthPostCount ?? 0) / Math.max(1, daysIntoMonth),
      );
    }
    interactionSource = interactionDailyAvg.size > 0 ? 'msgcount' : 'none';
  } else if (hasTable(ctx, "chat_reward_snapshot")) {
    const startKey = toLocalDateKey(windowStart);
    const snapshotRows = await (ctx as any).database.get("chat_reward_snapshot", {
      day: { $gte: startKey },
    });
    if (snapshotRows.length > 0) {
      for (const row of snapshotRows as any[]) {
        const userId = String(row.userId);
        if (!candidates.includes(userId)) continue;
        interactionDailyAvg.set(
          userId,
          (interactionDailyAvg.get(userId) ?? 0) + Number(row.count ?? 0),
        );
      }
      for (const [userId, total] of interactionDailyAvg) {
        interactionDailyAvg.set(userId, total / config.windowDays);
      }
      interactionSource = 'snapshot';
    }
  }

  const biases = new Map<string, number>();
  if (hasTable(ctx, "monetary_credit_bias")) {
    const biasRows = await ctx.database.get("monetary_credit_bias" as any, {
      channelId: biasChannelId,
    } as any);
    for (const row of biasRows as any[]) {
      biases.set(String(row.userId), Number(row.bias ?? 0));
    }
  }

  return {
    candidates,
    signData,
    assetTotals,
    participationCounts,
    interactionDailyAvg,
    interactionSource,
    biases,
    names,
  };
}

function computeScores(ctx: Context, resolved: ResolvedConfig, data: CreditData) {
  return computeCreditScores({
    candidates: data.candidates,
    signData: data.signData,
    assetTotals: data.assetTotals,
    participationCounts: data.participationCounts,
    interactionDailyAvg: data.interactionDailyAvg,
    interactionSource: data.interactionSource,
    biases: data.biases,
    config: resolved,
  });
}

async function getSignExpReward(ctx: Context): Promise<number> {
  try {
    const jrysFix = (ctx as any).registry?.get?.("jrys-fix");
    if (jrysFix?.config?.signExp != null)
      return Number(jrysFix.config.signExp) || 0;
  } catch {}
  return 0;
}

export function registerCommands({ ctx, config, logger }: CommandDeps) {
  ctx
    .command("credit.help", "查看信用分插件帮助")
    .action(() => [
      "💳 信用分插件（monetary-extra）",
      "",
      "【用户】",
      "credit — 查看个人信用分（五维展示）",
      "credit.rank — 查看信用分排行榜",
      "resign — 付费补签（现金不足自动联动银行活期）",
      "",
      "【管理员（authority 3）】",
      "credit.diagnose <@用户> — 查看指定用户各维度原始值，便于防刷排查",
      "",
      "【五维构成（默认权重）】",
      "· 签到活性 25%：断签保鲜衰减 × 累签天数对数积累",
      "· 资产稳健 20%：总资产（现金+银行）对数分",
      "· 经济参与 30%：近窗口期抽奖/兑换/股票/任务/随机奖励行为达标均值",
      "· 社交活跃 25%：日均发言（主源聊天统计插件，封顶防刷屏）",
      "· 频道偏置 bias：管理员设置的附加值，限幅 ±10",
      "",
      "【提示】权重与封顶均可在插件配置中调整，公式支持自定义。",
    ].join("\n"));

  ctx
    .command("resign", "付费补签")
    .userFields(["id"])
    .action(async ({ session }) => {
      if (!session) return "无法获取会话信息。";
      const resolved = getSessionConfig(session, config);
      if (!resolved.enableResign) return "补签功能未启用。";
      if (!hasTables(ctx, ["jrys"])) return missingJrysMessage();

      const userId = session.userId;
      if (!userId) return "无法获取用户 ID。";

      const uid = getSessionUid(session as Session<"id">);
      if (uid == null) return "无法获取用户数字 ID。";

      const record = await getJrysRecord(ctx, userId, uid);
      if (!record) return "没有找到你的签到记录，无法补签。";
      if (isSameLocalDate(record.time)) return "今天已经签到，不能补签。";
      if (!isMoreThanOneDayAgo(record.time))
        return "上次签到距今不足一天，无法补签。";

      const cost = await costWithBank(
        ctx as MonetaryLikeContext,
        uid,
        resolved.currency,
        resolved.resignCost,
        resolved.enableBankSync,
      );
      if (!cost.success) return cost.error || "补签扣款失败。";

      // 触发签到逻辑：增加经验值、累签天数 +1
      // 必须按主键 id 写回数据库，防止 name 为昵称时更新落空
      const signExpReward = await getSignExpReward(ctx);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(12, 0, 0, 0);

      await ctx.database.set(
        "jrys" as any,
        { id: record.id } as any,
        {
          exp: (record.exp || 0) + signExpReward,
          signCount: (record.signCount || 0) + 1,
          time: yesterday,
        } as any,
      );

      return resolved.resignCost > 0
        ? `补签成功，已扣除 ${resolved.resignCost} ${resolved.currency}。`
        : "补签成功。";
    });

  ctx
    .command("credit", "查看信用分")
    .userFields(["id", "name"])
    .action(async ({ session }) => {
      if (!session) return "无法获取会话信息。";
      const resolved = getSessionConfig(session, config);
      if (!resolved.enableCredit) return "信用分功能未启用。";
      if (!hasTables(ctx, ["jrys"])) return missingJrysMessage();

      const userId = session.userId;
      if (!userId) return "无法获取用户 ID。";

      const data = await collectCreditData(ctx, resolved, getBiasChannelId(session));
      if (!data.candidates.includes(userId))
        return "没有找到你的签到记录，暂无信用分。";

      const scoreData = computeScores(ctx, resolved, data).find(
        (item) => item.userId === userId,
      );
      if (!scoreData) return "暂无信用分数据。";

      // 如果环境中存在 puppeteer，返回可视化图片
      if (ctx.puppeteer) {
        const username =
          session.author?.nickname ||
          session.author?.username ||
          session.username ||
          userId;
        return await renderCreditImage(ctx, logger, {
          username,
          userId,
          score: scoreData.score,
          activityScore: scoreData.activityScore,
          assetScore: scoreData.assetScore,
          participationScore: scoreData.participationScore,
          interactionScore: scoreData.interactionScore,
          bias: scoreData.bias,
          updateTime: new Date().toLocaleString("zh-CN"),
        });
      }

      // 未安装 puppeteer 时降级为文字
      return [
        `信用分：${scoreData.score.toFixed(2)}`,
        `- 签到活性：${scoreData.activityScore.toFixed(1)}（累签 ${scoreData.raw.signCount} 天${scoreData.raw.lastSignDays != null ? `，距今 ${scoreData.raw.lastSignDays} 天` : ""}）`,
        `- 资产稳健：${scoreData.assetScore.toFixed(1)}（总资产 ${scoreData.raw.assetTotal} ${resolved.currency}）`,
        `- 经济参与：${scoreData.participationScore.toFixed(1)}（抽奖 ${scoreData.raw.participationCounts.lottery} / 兑换 ${scoreData.raw.participationCounts.cdk} / 股票 ${scoreData.raw.participationCounts.bourse} / 任务 ${scoreData.raw.participationCounts.mission} / 随机奖励 ${scoreData.raw.participationCounts.chatRandom}）`,
        `- 社交活跃：${scoreData.interactionScore.toFixed(1)}（日均 ${scoreData.raw.interactionDailyAvg.toFixed(1)} 条${scoreData.raw.interactionSource === "msgcount" ? "，msgcount 数据" : scoreData.raw.interactionSource === "snapshot" ? "，快照数据" : ""}）`,
      ].join("\n");
    });

  ctx.command("credit.rank", "查看信用分排行").action(async ({ session }) => {
    if (!session) return "无法获取会话信息。";
    const resolved = getSessionConfig(session, config);
    if (!resolved.enableCredit) return "信用分功能未启用。";
    if (!hasTables(ctx, ["jrys"])) return missingJrysMessage();

    const data = await collectCreditData(ctx, resolved, getBiasChannelId(session));
    if (data.candidates.length === 0) return "暂无信用分数据。";

    const scores = computeScores(ctx, resolved, data).slice(0, resolved.rankLimit);
    return [
      "信用分排行：",
      ...scores.map(
        (item, index) =>
          `${index + 1}. ${formatUser(item.userId, data.names)} - ${item.score.toFixed(2)}（签到 ${item.activityScore.toFixed(0)} / 资产 ${item.assetScore.toFixed(0)} / 参与 ${item.participationScore.toFixed(0)} / 社交 ${item.interactionScore.toFixed(0)}）`,
      ),
    ].join("\n");
  });

  ctx
    .command("credit.diagnose <user:text>", "查看指定用户信用分明细（管理员）", {
      authority: 3,
    })
    .action(async ({ session }, user) => {
      if (!session) return "无法获取会话信息。";
      const resolved = getSessionConfig(session, config);
      if (!resolved.enableCredit) return "信用分功能未启用。";
      if (!hasTables(ctx, ["jrys"])) return missingJrysMessage();
      if (!user) return "请 @目标用户或提供其平台 ID。";

      const atMatch = [...user.matchAll(/<at[^>]*\bid=["']?([^"'\s/>]+)["']?[^>]*\/?>/g)];
      const rawTarget = atMatch[0]?.[1] ?? user.replace(/<[^>]+>/g, "").trim();
      let targetId = normalizeJrysName(rawTarget);
      if (!targetId) return "无法解析目标用户。";

      const data = await collectCreditData(ctx, resolved, getBiasChannelId(session));
      if (!data.candidates.includes(targetId)) {
        // 如果输入的是昵称，尝试通过 names 反查平台 userId
        for (const [candUserId, candName] of data.names) {
          if (candName === targetId || normalizeJrysName(candName) === targetId) {
            targetId = candUserId;
            break;
          }
        }
      }
      if (!data.candidates.includes(targetId))
        return "该用户没有签到记录，暂无信用分。";

      const scoreData = computeScores(ctx, resolved, data).find(
        (item) => item.userId === targetId,
      );
      if (!scoreData) return "暂无信用分数据。";

      const counts = scoreData.raw.participationCounts;
      return [
        `信用分诊断：${formatUser(targetId, data.names)}`,
        `总分：${scoreData.score.toFixed(2)}（偏置 ${scoreData.bias}，限幅 ±${resolved.biasLimit}）`,
        `- 签到活性 ${scoreData.activityScore.toFixed(1)}/100：累签 ${scoreData.raw.signCount} 天，最近签到距今 ${scoreData.raw.lastSignDays ?? "∞"} 天（保鲜期 ${resolved.signFreshDays} 天）`,
        `- 资产稳健 ${scoreData.assetScore.toFixed(1)}/100：总资产 ${scoreData.raw.assetTotal} ${resolved.currency}（封顶 ${resolved.assetCap}）`,
        `- 经济参与 ${scoreData.participationScore.toFixed(1)}/100：抽奖 ${counts.lottery}/${resolved.participationTargets.lottery}，兑换 ${counts.cdk}/${resolved.participationTargets.cdk}，股票 ${counts.bourse}/${resolved.participationTargets.bourse}，任务 ${counts.mission}/${resolved.participationTargets.mission}，随机奖励 ${counts.chatRandom}/${resolved.participationTargets.chatRandom}（近 ${resolved.windowDays} 天）`,
        `- 社交活跃 ${scoreData.interactionScore.toFixed(1)}/100：日均 ${scoreData.raw.interactionDailyAvg.toFixed(1)} 条（封顶 ${resolved.interactionDailyCap} 条${scoreData.raw.interactionSource === "msgcount" ? "，msgcount 数据" : scoreData.raw.interactionSource === "snapshot" ? "，快照数据(遗留)" : ""}）`,
      ].join("\n");
    });
}
