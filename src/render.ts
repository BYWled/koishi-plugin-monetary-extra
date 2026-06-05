import { Context, h, Logger } from "koishi";

export type CreditDataRenderInput = {
  username: string;
  userId: string;
  score: number;
  bankRank: number;
  signRank: number;
  bankScore: number;
  signScore: number;
  bias: number;
  updateTime: string;
};

// 内联无外部依赖的极简风 UI 模板 (避免文件读取与部署时的寻址问题)
const creditTemplateHtml = `
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

    .stats { 
      display: flex; 
      width: 100%; 
      gap: 16px; 
      margin-top: 24px; 
    }
    
    .stat-box { 
      flex: 1; 
      background: rgba(255, 255, 255, 0.03); 
      border: 1px solid var(--border); 
      border-radius: 12px; 
      padding: 16px; 
      text-align: center; 
    }
    
    .stat-value { 
      font-size: 24px; 
      font-weight: bold; 
      margin-bottom: 4px; 
      font-family: 'Roboto Mono', sans-serif;
    }
    
    .stat-label { 
      font-size: 12px; 
      color: var(--text-sub); 
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

    <div class="stats">
      <div class="stat-box">
        <div class="stat-value" id="bank-rank">-</div>
        <div class="stat-label">银行排名</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" id="sign-rank">-</div>
        <div class="stat-label">签到排名</div>
      </div>
    </div>

    <div class="footer" id="footer"></div>
  </div>
  
  <script>
    const DATA = {{DATA}};
    
    document.getElementById('username').textContent = DATA.username;
    document.getElementById('avatar-text').textContent = DATA.username.substring(0, 1).toUpperCase();
    document.getElementById('userid').textContent = 'ID: ' + DATA.userId;
    document.getElementById('bank-rank').textContent = DATA.bankRank > 0 ? '#' + DATA.bankRank : '暂无';
    document.getElementById('sign-rank').textContent = DATA.signRank > 0 ? '#' + DATA.signRank : '暂无';
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
  </script>
</body>
</html>
`;

export async function renderCreditImage(
  ctx: Context,
  logger: Logger,
  data: CreditDataRenderInput,
) {
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
      return h.image(imgBuf, "image/png");
    } finally {
      await page.close();
    }
  } catch (err) {
    logger.error("renderCreditImage 生成图表失败:", err);
    return `[错误] 生成信用分图片失败: ${err instanceof Error ? err.message : String(err)}`;
  }
}
