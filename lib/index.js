var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  Config: () => Config,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(src_exports);
var import_koishi2 = require("koishi");

// src/core.ts
var DEFAULT_CREDIT_FORMULA = "activityScore * activityWeight + assetScore * assetWeight + participationScore * participationWeight + interactionScore * interactionWeight + bias";
var defaultParticipationTargets = {
  lottery: 10,
  cdk: 3,
  bourse: 5,
  mission: 3,
  chatRandom: 5
};
var defaultConfig = {
  currency: "信用点",
  enableResign: true,
  enableCredit: true,
  enableBankSync: true,
  resignCost: 100,
  rankLimit: 10,
  signRankMode: "exp",
  bankWeight: 0.5,
  signWeight: 0.5,
  creditFormula: DEFAULT_CREDIT_FORMULA,
  windowDays: 30,
  activityWeight: 0.25,
  assetWeight: 0.2,
  participationWeight: 0.3,
  interactionWeight: 0.25,
  assetCap: 1e6,
  signFreshDays: 7,
  signCountCap: 200,
  interactionDailyCap: 20,
  participationTargets: defaultParticipationTargets,
  biasLimit: 10
};
function getChannelConfig(config, channelId) {
  const { channelConfigs, ...rest } = config;
  const base = rest;
  const override = channelId ? channelConfigs?.find((item) => item.channelId === channelId) : void 0;
  const { channelId: _ignored, ...overrideValues } = override ?? {};
  return {
    ...defaultConfig,
    ...base,
    ...overrideValues,
    participationTargets: {
      ...defaultParticipationTargets,
      ...base.participationTargets,
      ...overrideValues.participationTargets
    }
  };
}
__name(getChannelConfig, "getChannelConfig");
function toLocalDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
__name(toLocalDateKey, "toLocalDateKey");
function isSameLocalDate(value, now = /* @__PURE__ */ new Date()) {
  if (!value) return false;
  return toLocalDateKey(value) === toLocalDateKey(now);
}
__name(isSameLocalDate, "isSameLocalDate");
function isMoreThanOneDayAgo(value, now = /* @__PURE__ */ new Date()) {
  if (!value) return true;
  const dateKey = toLocalDateKey(value);
  if (!dateKey) return true;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return dateKey < toLocalDateKey(yesterday);
}
__name(isMoreThanOneDayAgo, "isMoreThanOneDayAgo");
function computeActivityScore(signCount, lastSignAt, freshDays, signCountCap) {
  if (!lastSignAt) return 0;
  const daysSince = Math.max(0, (Date.now() - lastSignAt.getTime()) / 864e5);
  const freshness = Math.max(0, 1 - daysSince / Math.max(1, freshDays));
  const accumulation = Math.min(1, Math.log10(1 + Math.max(0, signCount)) / Math.log10(1 + Math.max(1, signCountCap)));
  return freshness * accumulation * 100;
}
__name(computeActivityScore, "computeActivityScore");
function computeAssetScore(assetTotal, assetCap) {
  if (assetTotal <= 0) return 0;
  const cap = Math.max(1, assetCap);
  return Math.min(1, Math.log10(1 + assetTotal) / Math.log10(1 + cap)) * 100;
}
__name(computeAssetScore, "computeAssetScore");
function computeParticipationScore(counts, targets) {
  const entries = [
    [counts.lottery, targets.lottery],
    [counts.cdk, targets.cdk],
    [counts.bourse, targets.bourse],
    [counts.mission, targets.mission],
    [counts.chatRandom, targets.chatRandom]
  ];
  let sum = 0;
  for (const [count, target] of entries) {
    sum += target > 0 ? Math.min(1, Math.max(0, count) / target) : 0;
  }
  return sum / entries.length * 100;
}
__name(computeParticipationScore, "computeParticipationScore");
function computeInteractionScore(dailyAvg, dailyCap) {
  if (dailyAvg <= 0) return 0;
  return Math.min(1, dailyAvg / Math.max(1, dailyCap)) * 100;
}
__name(computeInteractionScore, "computeInteractionScore");
function evaluateCreditFormula(formula, variables) {
  const evaluate = /* @__PURE__ */ __name((source) => {
    const names = Object.keys(variables);
    const values = names.map((name2) => variables[name2]);
    const fn = new Function(...names, `"use strict"; return (${source})`);
    const result = Number(fn(...values));
    if (!Number.isFinite(result)) throw new Error("non-finite credit formula result");
    return result;
  }, "evaluate");
  try {
    return evaluate(formula);
  } catch {
    return evaluate(DEFAULT_CREDIT_FORMULA);
  }
}
__name(evaluateCreditFormula, "evaluateCreditFormula");
function computeCreditScores(input) {
  const { config } = input;
  const candidates = [...new Set(input.candidates)];
  return candidates.map((userId) => {
    const sign = input.signData.get(userId);
    const assetTotal = input.assetTotals.get(userId) ?? 0;
    const counts = input.participationCounts.get(userId) ?? {
      lottery: 0,
      cdk: 0,
      bourse: 0,
      mission: 0,
      chatRandom: 0
    };
    const dailyAvg = input.interactionDailyAvg.get(userId) ?? 0;
    const rawBias = input.biases.get(userId) ?? 0;
    const bias = Math.max(-config.biasLimit, Math.min(config.biasLimit, rawBias));
    const activityScore = computeActivityScore(
      sign?.signCount ?? 0,
      sign?.lastSignAt ?? null,
      config.signFreshDays,
      config.signCountCap
    );
    const assetScore = computeAssetScore(assetTotal, config.assetCap);
    const participationScore = computeParticipationScore(counts, config.participationTargets);
    const interactionScore = computeInteractionScore(dailyAvg, config.interactionDailyCap);
    const variables = {
      activityScore,
      assetScore,
      participationScore,
      interactionScore,
      activityWeight: config.activityWeight,
      assetWeight: config.assetWeight,
      participationWeight: config.participationWeight,
      interactionWeight: config.interactionWeight,
      bias,
      bankScore: assetScore,
      signScore: activityScore,
      bankWeight: config.bankWeight,
      signWeight: config.signWeight
    };
    return {
      userId,
      score: evaluateCreditFormula(config.creditFormula, variables),
      activityScore,
      assetScore,
      participationScore,
      interactionScore,
      bias,
      raw: {
        signCount: sign?.signCount ?? 0,
        lastSignDays: sign?.lastSignAt == null ? null : Math.floor((Date.now() - sign.lastSignAt.getTime()) / 864e5),
        assetTotal,
        participationCounts: counts,
        interactionDailyAvg: dailyAvg,
        interactionSource: input.interactionSource
      }
    };
  }).sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId));
}
__name(computeCreditScores, "computeCreditScores");

// src/services.ts
function hasTable(ctx, tableName) {
  return Boolean(ctx.database.tables?.[tableName]);
}
__name(hasTable, "hasTable");
function hasTables(ctx, tableNames) {
  return tableNames.every((tableName) => hasTable(ctx, tableName));
}
__name(hasTables, "hasTables");
async function getCashBalance(ctx, uid, currency) {
  const [record] = await ctx.database.get("monetary", { uid, currency }, ["value"]);
  return Number(record?.value ?? 0);
}
__name(getCashBalance, "getCashBalance");
async function getBankDemandBalance(ctx, uid, currency) {
  if (!hasTable(ctx, "monetary_bank_int")) return 0;
  const records = await ctx.database.get("monetary_bank_int", { uid, currency, type: "demand" });
  return records.reduce((sum, record) => sum + Number(record.amount ?? 0), 0);
}
__name(getBankDemandBalance, "getBankDemandBalance");
async function costWithBank(ctx, uid, currency, amount, enableBankSync) {
  if (amount <= 0) return { success: true };
  const cash = await getCashBalance(ctx, uid, currency);
  if (cash >= amount) {
    await ctx.monetary.cost(uid, amount, currency);
    return { success: true };
  }
  if (!enableBankSync || !ctx.monetaryBank || !hasTable(ctx, "monetary_bank_int")) {
    return { success: false, error: `余额不足，需要 ${amount} ${currency}，当前现金 ${cash} ${currency}` };
  }
  const shortage = amount - cash;
  const demand = await getBankDemandBalance(ctx, uid, currency);
  if (demand < shortage) {
    return {
      success: false,
      error: `余额不足，需要 ${amount} ${currency}，当前现金 ${cash} ${currency}，银行活期 ${demand} ${currency}`
    };
  }
  const withdraw = await ctx.monetaryBank.withdraw(uid, currency, shortage);
  if (!withdraw.success) {
    return { success: false, error: withdraw.error || "银行取款失败" };
  }
  try {
    await ctx.monetary.cost(uid, amount, currency);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "扣款失败" };
  }
}
__name(costWithBank, "costWithBank");

// src/render.ts
var import_koishi = require("koishi");
var creditTemplateHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;700&display=swap');

    :root {
      --bg: #0c0f15;
      --card: #161b22;
      --text-main: #f0f3f5;
      --text-sub: #8b949e;
      --border: #30363d;
    }

    body {
      margin: 0;
      padding: 32px;
      font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
      background: var(--bg);
      width: 420px;
      box-sizing: border-box;
      color: var(--text-main);
    }

    .card {
      background: var(--card);
      padding: 32px;
      border-radius: 16px;
      border: 1px solid var(--border);
      box-shadow: 0 16px 32px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
    }

    .header {
      align-self: flex-start;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
    }

    .avatar {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 20px;
    }

    .user-info { flex: 1; }

    .username {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 4px;
    }

    .uid {
      font-size: 12px;
      color: var(--text-sub);
    }

    .gauge-container {
      position: relative;
      width: 280px;
      height: 154px;
      margin: 10px 0;
      display: flex;
      justify-content: center;
      overflow: hidden;
    }

    .gauge-svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }

    .score-display {
      position: absolute;
      bottom: 22px;
      text-align: center;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .score-value {
      font-size: 48px;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 4px;
      font-family: 'Roboto Mono', sans-serif;
    }

    .score-label {
      font-size: 14px;
      color: var(--text-sub);
      font-weight: 500;
    }

    .dimensions {
      width: 100%;
      margin-top: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .dim-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .dim-label {
      width: 72px;
      font-size: 12px;
      color: var(--text-sub);
      flex-shrink: 0;
    }

    .dim-bar {
      flex: 1;
      height: 8px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 4px;
      overflow: hidden;
    }

    .dim-fill {
      height: 100%;
      border-radius: 4px;
      background: #3b82f6;
      width: 0%;
    }

    .dim-value {
      width: 42px;
      text-align: right;
      font-size: 12px;
      font-family: 'Roboto Mono', sans-serif;
      flex-shrink: 0;
    }

    .footer {
      margin-top: 24px;
      font-size: 11px;
      color: var(--text-sub);
      opacity: 0.6;
      text-align: center;
      width: 100%;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="avatar" id="avatar-text">U</div>
      <div class="user-info">
        <div class="username" id="username">User</div>
        <div class="uid" id="userid">UID: </div>
      </div>
    </div>

    <div class="gauge-container">
      <svg viewBox="0 0 200 110" class="gauge-svg">
        <path d="M 20 95 A 70 70 0 0 1 180 95" fill="none" stroke="#2a2e35" stroke-width="14" stroke-linecap="round"/>
        <path id="progress" d="M 20 95 A 70 70 0 0 1 180 95" fill="none" stroke="#10b981" stroke-width="14" stroke-linecap="round" stroke-dasharray="219.91" stroke-dashoffset="219.91" />
      </svg>
      <div class="score-display">
        <div class="score-value" id="score">0</div>
        <div class="score-label" id="evaluation">评估中...</div>
      </div>
    </div>

    <div class="dimensions">
      <div class="dim-row">
        <div class="dim-label">签到活性</div>
        <div class="dim-bar"><div class="dim-fill" id="bar-activity"></div></div>
        <div class="dim-value" id="val-activity">-</div>
      </div>
      <div class="dim-row">
        <div class="dim-label">资产稳健</div>
        <div class="dim-bar"><div class="dim-fill" id="bar-asset"></div></div>
        <div class="dim-value" id="val-asset">-</div>
      </div>
      <div class="dim-row">
        <div class="dim-label">经济参与</div>
        <div class="dim-bar"><div class="dim-fill" id="bar-participation"></div></div>
        <div class="dim-value" id="val-participation">-</div>
      </div>
      <div class="dim-row">
        <div class="dim-label">社交活跃</div>
        <div class="dim-bar"><div class="dim-fill" id="bar-interaction"></div></div>
        <div class="dim-value" id="val-interaction">-</div>
      </div>
    </div>

    <div class="footer" id="footer"></div>
  </div>

  <script>
    const DATA = {{DATA}};

    document.getElementById('username').textContent = DATA.username;
    document.getElementById('avatar-text').textContent = DATA.username.substring(0, 1).toUpperCase();
    document.getElementById('userid').textContent = 'ID: ' + DATA.userId;
    document.getElementById('footer').textContent = '数据评估时间 ' + DATA.updateTime;

    // 信用等级评价与动态颜色逻辑
    let evalText = '信用极好';
    let color = '#10b981'; // 绿色

    if (DATA.score < 20) {
      evalText = '信用较差';
      color = '#ef4444'; // 红色
    } else if (DATA.score < 50) {
      evalText = '信用一般';
      color = '#f59e0b'; // 橙色
    } else if (DATA.score < 80) {
      evalText = '信用良好';
      color = '#3b82f6'; // 蓝色
    }

    document.getElementById('evaluation').textContent = evalText;

    const scoreEl = document.getElementById('score');
    scoreEl.textContent = Math.floor(DATA.score);
    scoreEl.style.color = color;

    const progressEl = document.getElementById('progress');
    progressEl.style.stroke = color;

    // 动态调整仪表盘半圆环的填充率 (满分为 100 理论值，超出会被 limit 到 1)
    const maxExpectedScore = 100;
    const percentage = Math.min(Math.max(DATA.score / maxExpectedScore, 0), 1);

    // 弧长 = PI * r = 3.14159 * 70 = 219.91
    const dashoffset = 219.91 * (1 - percentage);
    progressEl.style.strokeDashoffset = dashoffset;

    // 四维分进度条
    const dims = [
      { bar: 'bar-activity', val: 'val-activity', score: DATA.activityScore },
      { bar: 'bar-asset', val: 'val-asset', score: DATA.assetScore },
      { bar: 'bar-participation', val: 'val-participation', score: DATA.participationScore },
      { bar: 'bar-interaction', val: 'val-interaction', score: DATA.interactionScore },
    ];
    for (const dim of dims) {
      const pct = Math.min(Math.max(dim.score / 100, 0), 1) * 100;
      document.getElementById(dim.bar).style.width = pct + '%';
      document.getElementById(dim.val).textContent = Math.floor(dim.score);
    }
  </script>
</body>
</html>
`;
async function renderCreditImage(ctx, logger2, data) {
  try {
    const html = creditTemplateHtml.replace("{{DATA}}", JSON.stringify(data));
    if (!ctx.puppeteer) {
      throw new Error("Puppeteer 服务未启用");
    }
    const page = await ctx.puppeteer.page();
    try {
      await page.setContent(html);
      const element = await page.$(".card");
      if (!element) throw new Error("找不到 .card 元素，模板加载失败");
      const imgBuf = await element.screenshot({ encoding: "binary" });
      return import_koishi.h.image(imgBuf, "image/png");
    } finally {
      await page.close();
    }
  } catch (err) {
    logger2.error("renderCreditImage 生成图表失败:", err);
    return `[错误] 生成信用分图片失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}
__name(renderCreditImage, "renderCreditImage");

// src/commands.ts
function getSessionUid(session) {
  const uid = Number(session.user?.id);
  return Number.isFinite(uid) ? uid : null;
}
__name(getSessionUid, "getSessionUid");
function getSessionConfig(session, config) {
  return getChannelConfig(config, session.channelId);
}
__name(getSessionConfig, "getSessionConfig");
function missingJrysMessage() {
  return "缺少 jrys 数据表，请确认 koishi-plugin-jrys-fix 已启用并完成过签到。";
}
__name(missingJrysMessage, "missingJrysMessage");
function normalizeJrysName(name2) {
  return name2.startsWith("@") ? name2.slice(1) : name2;
}
__name(normalizeJrysName, "normalizeJrysName");
function getBiasChannelId(session) {
  return session.channelId || "global";
}
__name(getBiasChannelId, "getBiasChannelId");
async function getJrysRecord(ctx, userId, uid) {
  if (uid != null) {
    const byId = await ctx.database.get("jrys", { id: uid });
    if (byId[0]) return byId[0];
  }
  if (hasTable(ctx, "binding")) {
    const bindings = await ctx.database.get("binding", { pid: userId });
    for (const b of bindings) {
      const aid = Number(b.aid);
      if (Number.isFinite(aid)) {
        const byAid = await ctx.database.get("jrys", { id: aid });
        if (byAid[0]) return byAid[0];
      }
    }
  }
  const records = await ctx.database.get(
    "jrys",
    { name: userId }
  );
  if (records[0]) return records[0];
  const fallback = await ctx.database.get(
    "jrys",
    { name: `@${userId}` }
  );
  return fallback[0];
}
__name(getJrysRecord, "getJrysRecord");
function formatUser(userId, names) {
  const name2 = names.get(userId);
  return name2 ? `${name2}(${userId})` : userId;
}
__name(formatUser, "formatUser");
async function buildUidToUserIdMap(ctx) {
  const uidToUserId = /* @__PURE__ */ new Map();
  if (!ctx.database.tables?.binding) return uidToUserId;
  const bindings = await ctx.database.get("binding", {});
  for (const b of bindings) {
    const aid = Number(b.aid);
    const platformUserId = String(b.pid);
    if (!uidToUserId.has(aid)) uidToUserId.set(aid, platformUserId);
  }
  return uidToUserId;
}
__name(buildUidToUserIdMap, "buildUidToUserIdMap");
function emptyCounts() {
  return { lottery: 0, cdk: 0, bourse: 0, mission: 0, chatRandom: 0 };
}
__name(emptyCounts, "emptyCounts");
async function countByUid(ctx, tableName, timeField, windowStart, extraQuery, counts, uidToUserId, key) {
  if (!hasTable(ctx, tableName)) return;
  const query = { [timeField]: { $gte: windowStart } };
  if (extraQuery) Object.assign(query, extraQuery);
  const rows = await ctx.database.get(tableName, query);
  for (const row of rows) {
    const uid = Number(row.uid);
    if (!Number.isFinite(uid)) continue;
    const userId = uidToUserId.get(uid) ?? String(uid);
    const entry = counts.get(userId) ?? emptyCounts();
    entry[key] += 1;
    counts.set(userId, entry);
  }
}
__name(countByUid, "countByUid");
async function collectCreditData(ctx, config, biasChannelId) {
  const uidToUserId = await buildUidToUserIdMap(ctx);
  const jrysRows = await ctx.database.get(
    "jrys",
    {}
  );
  const candidates = [];
  const signData = /* @__PURE__ */ new Map();
  const names = /* @__PURE__ */ new Map();
  for (const row of jrysRows) {
    const aid = Number(row.id);
    const rawName = String(row.name ?? "");
    const cleanName = normalizeJrysName(rawName);
    const userId = (Number.isFinite(aid) ? uidToUserId.get(aid) : null) || cleanName || String(row.id);
    if (!userId) continue;
    if (!candidates.includes(userId)) {
      candidates.push(userId);
    }
    if (!signData.has(userId)) {
      signData.set(userId, {
        signCount: Number(row.signCount ?? 0),
        lastSignAt: row.time ? new Date(row.time) : null
      });
    }
    const displayName = cleanName || rawName;
    if (displayName && displayName !== userId) {
      names.set(userId, displayName);
    } else if (rawName) {
      names.set(userId, rawName);
    }
  }
  const assetTotals = /* @__PURE__ */ new Map();
  const addAsset = /* @__PURE__ */ __name((uid, amount) => {
    const userId = uidToUserId.get(uid) ?? String(uid);
    if (!candidates.includes(userId)) return;
    assetTotals.set(userId, (assetTotals.get(userId) ?? 0) + amount);
  }, "addAsset");
  if (hasTable(ctx, "monetary")) {
    const cashRows = await ctx.database.get("monetary", {
      currency: config.currency
    });
    for (const row of cashRows) {
      addAsset(Number(row.uid), Number(row.value ?? 0));
    }
  }
  if (hasTable(ctx, "monetary_bank_int")) {
    const bankRows = await ctx.database.get("monetary_bank_int", {
      currency: config.currency
    });
    for (const row of bankRows) {
      addAsset(Number(row.uid), Number(row.amount ?? 0));
    }
  }
  const windowStart = new Date(Date.now() - config.windowDays * 864e5);
  const participationCounts = /* @__PURE__ */ new Map();
  await countByUid(
    ctx,
    "lottery_record",
    "createdAt",
    windowStart,
    null,
    participationCounts,
    uidToUserId,
    "lottery"
  );
  await countByUid(
    ctx,
    "cdk_redemption",
    "createdAt",
    windowStart,
    null,
    participationCounts,
    uidToUserId,
    "cdk"
  );
  await countByUid(
    ctx,
    "bourse_pending",
    "startTime",
    windowStart,
    null,
    participationCounts,
    uidToUserId,
    "bourse"
  );
  await countByUid(
    ctx,
    "mission_progress",
    "acceptTime",
    windowStart,
    null,
    participationCounts,
    uidToUserId,
    "mission"
  );
  await countByUid(
    ctx,
    "chat_reward_log",
    "createdAt",
    windowStart,
    { type: "random" },
    participationCounts,
    uidToUserId,
    "chatRandom"
  );
  const interactionDailyAvg = /* @__PURE__ */ new Map();
  let interactionSource = "none";
  if (hasTable(ctx, "message_counter_records")) {
    const now = /* @__PURE__ */ new Date();
    const daysIntoMonth = now.getDate();
    const counterRows = await ctx.database.get("message_counter_records", {});
    for (const row of counterRows) {
      const userId = String(row.userId);
      if (!candidates.includes(userId)) continue;
      interactionDailyAvg.set(
        userId,
        Number(row.thisMonthPostCount ?? 0) / Math.max(1, daysIntoMonth)
      );
    }
    interactionSource = interactionDailyAvg.size > 0 ? "msgcount" : "none";
  } else if (hasTable(ctx, "chat_reward_snapshot")) {
    const startKey = toLocalDateKey(windowStart);
    const snapshotRows = await ctx.database.get("chat_reward_snapshot", {
      day: { $gte: startKey }
    });
    if (snapshotRows.length > 0) {
      for (const row of snapshotRows) {
        const userId = String(row.userId);
        if (!candidates.includes(userId)) continue;
        interactionDailyAvg.set(
          userId,
          (interactionDailyAvg.get(userId) ?? 0) + Number(row.count ?? 0)
        );
      }
      for (const [userId, total] of interactionDailyAvg) {
        interactionDailyAvg.set(userId, total / config.windowDays);
      }
      interactionSource = "snapshot";
    }
  }
  const biases = /* @__PURE__ */ new Map();
  if (hasTable(ctx, "monetary_credit_bias")) {
    const biasRows = await ctx.database.get("monetary_credit_bias", {
      channelId: biasChannelId
    });
    for (const row of biasRows) {
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
    names
  };
}
__name(collectCreditData, "collectCreditData");
function computeScores(ctx, resolved, data) {
  return computeCreditScores({
    candidates: data.candidates,
    signData: data.signData,
    assetTotals: data.assetTotals,
    participationCounts: data.participationCounts,
    interactionDailyAvg: data.interactionDailyAvg,
    interactionSource: data.interactionSource,
    biases: data.biases,
    config: resolved
  });
}
__name(computeScores, "computeScores");
async function getSignExpReward(ctx) {
  try {
    const jrysFix = ctx.registry?.get?.("jrys-fix");
    if (jrysFix?.config?.signExp != null)
      return Number(jrysFix.config.signExp) || 0;
  } catch {
  }
  return 0;
}
__name(getSignExpReward, "getSignExpReward");
function registerCommands({ ctx, config, logger: logger2 }) {
  ctx.command("credit.help", "查看信用分插件帮助").action(() => [
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
    "【提示】权重与封顶均可在插件配置中调整，公式支持自定义。"
  ].join("\n"));
  ctx.command("resign", "付费补签").userFields(["id"]).action(async ({ session }) => {
    if (!session) return "无法获取会话信息。";
    const resolved = getSessionConfig(session, config);
    if (!resolved.enableResign) return "补签功能未启用。";
    if (!hasTables(ctx, ["jrys"])) return missingJrysMessage();
    const userId = session.userId;
    if (!userId) return "无法获取用户 ID。";
    const uid = getSessionUid(session);
    if (uid == null) return "无法获取用户数字 ID。";
    const record = await getJrysRecord(ctx, userId, uid);
    if (!record) return "没有找到你的签到记录，无法补签。";
    if (isSameLocalDate(record.time)) return "今天已经签到，不能补签。";
    if (!isMoreThanOneDayAgo(record.time))
      return "上次签到距今不足一天，无法补签。";
    const cost = await costWithBank(
      ctx,
      uid,
      resolved.currency,
      resolved.resignCost,
      resolved.enableBankSync
    );
    if (!cost.success) return cost.error || "补签扣款失败。";
    const signExpReward = await getSignExpReward(ctx);
    const yesterday = /* @__PURE__ */ new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(12, 0, 0, 0);
    await ctx.database.set(
      "jrys",
      { id: record.id },
      {
        exp: (record.exp || 0) + signExpReward,
        signCount: (record.signCount || 0) + 1,
        time: yesterday
      }
    );
    return resolved.resignCost > 0 ? `补签成功，已扣除 ${resolved.resignCost} ${resolved.currency}。` : "补签成功。";
  });
  ctx.command("credit", "查看信用分").userFields(["id", "name"]).action(async ({ session }) => {
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
      (item) => item.userId === userId
    );
    if (!scoreData) return "暂无信用分数据。";
    if (ctx.puppeteer) {
      const username = session.author?.nickname || session.author?.username || session.username || userId;
      return await renderCreditImage(ctx, logger2, {
        username,
        userId,
        score: scoreData.score,
        activityScore: scoreData.activityScore,
        assetScore: scoreData.assetScore,
        participationScore: scoreData.participationScore,
        interactionScore: scoreData.interactionScore,
        bias: scoreData.bias,
        updateTime: (/* @__PURE__ */ new Date()).toLocaleString("zh-CN")
      });
    }
    return [
      `信用分：${scoreData.score.toFixed(2)}`,
      `- 签到活性：${scoreData.activityScore.toFixed(1)}（累签 ${scoreData.raw.signCount} 天${scoreData.raw.lastSignDays != null ? `，距今 ${scoreData.raw.lastSignDays} 天` : ""}）`,
      `- 资产稳健：${scoreData.assetScore.toFixed(1)}（总资产 ${scoreData.raw.assetTotal} ${resolved.currency}）`,
      `- 经济参与：${scoreData.participationScore.toFixed(1)}（抽奖 ${scoreData.raw.participationCounts.lottery} / 兑换 ${scoreData.raw.participationCounts.cdk} / 股票 ${scoreData.raw.participationCounts.bourse} / 任务 ${scoreData.raw.participationCounts.mission} / 随机奖励 ${scoreData.raw.participationCounts.chatRandom}）`,
      `- 社交活跃：${scoreData.interactionScore.toFixed(1)}（日均 ${scoreData.raw.interactionDailyAvg.toFixed(1)} 条${scoreData.raw.interactionSource === "msgcount" ? "，msgcount 数据" : scoreData.raw.interactionSource === "snapshot" ? "，快照数据" : ""}）`
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
        (item, index) => `${index + 1}. ${formatUser(item.userId, data.names)} - ${item.score.toFixed(2)}（签到 ${item.activityScore.toFixed(0)} / 资产 ${item.assetScore.toFixed(0)} / 参与 ${item.participationScore.toFixed(0)} / 社交 ${item.interactionScore.toFixed(0)}）`
      )
    ].join("\n");
  });
  ctx.command("credit.diagnose <user:text>", "查看指定用户信用分明细（管理员）", {
    authority: 3
  }).action(async ({ session }, user) => {
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
      (item) => item.userId === targetId
    );
    if (!scoreData) return "暂无信用分数据。";
    const counts = scoreData.raw.participationCounts;
    return [
      `信用分诊断：${formatUser(targetId, data.names)}`,
      `总分：${scoreData.score.toFixed(2)}（偏置 ${scoreData.bias}，限幅 ±${resolved.biasLimit}）`,
      `- 签到活性 ${scoreData.activityScore.toFixed(1)}/100：累签 ${scoreData.raw.signCount} 天，最近签到距今 ${scoreData.raw.lastSignDays ?? "∞"} 天（保鲜期 ${resolved.signFreshDays} 天）`,
      `- 资产稳健 ${scoreData.assetScore.toFixed(1)}/100：总资产 ${scoreData.raw.assetTotal} ${resolved.currency}（封顶 ${resolved.assetCap}）`,
      `- 经济参与 ${scoreData.participationScore.toFixed(1)}/100：抽奖 ${counts.lottery}/${resolved.participationTargets.lottery}，兑换 ${counts.cdk}/${resolved.participationTargets.cdk}，股票 ${counts.bourse}/${resolved.participationTargets.bourse}，任务 ${counts.mission}/${resolved.participationTargets.mission}，随机奖励 ${counts.chatRandom}/${resolved.participationTargets.chatRandom}（近 ${resolved.windowDays} 天）`,
      `- 社交活跃 ${scoreData.interactionScore.toFixed(1)}/100：日均 ${scoreData.raw.interactionDailyAvg.toFixed(1)} 条（封顶 ${resolved.interactionDailyCap} 条${scoreData.raw.interactionSource === "msgcount" ? "，msgcount 数据" : scoreData.raw.interactionSource === "snapshot" ? "，快照数据(遗留)" : ""}）`
    ].join("\n");
  });
}
__name(registerCommands, "registerCommands");

// src/index.ts
var name = "monetary-extra";
var inject = {
  required: ["database", "monetary"],
  optional: ["monetaryBank", "puppeteer"]
};
var logger = new import_koishi2.Logger("monetary-extra");
var creditFormulaDescription = `<div>
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
var ChannelConfigSchema = import_koishi2.Schema.intersect([
  import_koishi2.Schema.object({
    channelId: import_koishi2.Schema.string().required().description("频道 ID")
  }).description("频道标识"),
  import_koishi2.Schema.object({
    currency: import_koishi2.Schema.string().description("覆盖默认货币单位"),
    enableBankSync: import_koishi2.Schema.boolean().description(
      "覆盖是否允许现金不足时联动银行活期余额"
    )
  }).description("基础覆盖"),
  import_koishi2.Schema.object({
    enableResign: import_koishi2.Schema.boolean().description("覆盖是否启用补签"),
    enableCredit: import_koishi2.Schema.boolean().description("覆盖是否启用信用分"),
    resignCost: import_koishi2.Schema.number().min(0).description("覆盖补签费用，0 表示免费"),
    rankLimit: import_koishi2.Schema.number().min(1).step(1).description("覆盖信用分排行榜数量")
  }).description("功能覆盖"),
  import_koishi2.Schema.object({
    activityWeight: import_koishi2.Schema.number().min(0).max(1).description("覆盖签到活性权重"),
    assetWeight: import_koishi2.Schema.number().min(0).max(1).description("覆盖资产稳健权重"),
    participationWeight: import_koishi2.Schema.number().min(0).max(1).description("覆盖经济参与权重"),
    interactionWeight: import_koishi2.Schema.number().min(0).max(1).description("覆盖社交活跃权重"),
    creditFormula: import_koishi2.Schema.string().role("textarea").description(creditFormulaDescription)
  }).description("信用分覆盖")
]);
var Config = import_koishi2.Schema.intersect([
  import_koishi2.Schema.object({
    currency: import_koishi2.Schema.string().default(defaultConfig.currency).description("默认货币单位"),
    enableResign: import_koishi2.Schema.boolean().default(defaultConfig.enableResign).description("是否启用补签指令"),
    enableCredit: import_koishi2.Schema.boolean().default(defaultConfig.enableCredit).description("是否启用信用分指令"),
    enableBankSync: import_koishi2.Schema.boolean().default(defaultConfig.enableBankSync).description("现金不足时是否联动银行活期余额")
  }).description("基础设置"),
  import_koishi2.Schema.object({
    resignCost: import_koishi2.Schema.number().min(0).default(defaultConfig.resignCost).description("补签费用，0 表示免费"),
    rankLimit: import_koishi2.Schema.number().min(1).step(1).default(defaultConfig.rankLimit).description("信用分排行榜数量")
  }).description("功能设置"),
  import_koishi2.Schema.object({
    windowDays: import_koishi2.Schema.number().min(7).step(1).default(defaultConfig.windowDays).description("信用分滚动统计窗口（天）"),
    activityWeight: import_koishi2.Schema.number().min(0).max(1).default(defaultConfig.activityWeight).description("信用分中签到活性的权重"),
    assetWeight: import_koishi2.Schema.number().min(0).max(1).default(defaultConfig.assetWeight).description("信用分中资产稳健的权重"),
    participationWeight: import_koishi2.Schema.number().min(0).max(1).default(defaultConfig.participationWeight).description("信用分中经济参与的权重"),
    interactionWeight: import_koishi2.Schema.number().min(0).max(1).default(defaultConfig.interactionWeight).description("信用分中社交活跃的权重")
  }).description("信用分维度权重"),
  import_koishi2.Schema.object({
    assetCap: import_koishi2.Schema.number().min(1e3).default(defaultConfig.assetCap).description("资产分封顶值：总资产达到该值即拿满分（对数压缩）"),
    signFreshDays: import_koishi2.Schema.number().min(1).step(1).default(defaultConfig.signFreshDays).description("签到保鲜期（天）：断签超过该天数签到活性归零"),
    signCountCap: import_koishi2.Schema.number().min(10).step(1).default(defaultConfig.signCountCap).description("累签天数封顶：达到该天数即拿满签到积累分（对数压缩）"),
    interactionDailyCap: import_koishi2.Schema.number().min(1).default(defaultConfig.interactionDailyCap).description("社交活跃封顶：日均发言达到该值即拿满分"),
    biasLimit: import_koishi2.Schema.number().min(0).default(defaultConfig.biasLimit).description("频道偏置限幅（绝对值）")
  }).description("信用分封顶与限幅"),
  import_koishi2.Schema.object({
    creditFormula: import_koishi2.Schema.string().default(DEFAULT_CREDIT_FORMULA).role("textarea").description(creditFormulaDescription)
  }).description("自定义公式（留空保持默认）"),
  import_koishi2.Schema.object({
    channelConfigs: import_koishi2.Schema.array(ChannelConfigSchema).role("table").default([]).description(
      "按频道覆盖默认配置；只填写需要特殊调整的字段，未填写项会继承上方默认值。"
    )
  }).description("频道覆盖")
]);
function apply(ctx, config) {
  ctx.model.extend(
    "monetary_credit_bias",
    {
      userId: "string",
      channelId: "string",
      bias: "double"
    },
    {
      primary: ["userId", "channelId"]
    }
  );
  registerCommands({ ctx, config, logger });
}
__name(apply, "apply");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  apply,
  inject,
  name
});
