<h1 align="center">koishi-plugin-monetary-extra</h1>

<p align="center">
	为 Koishi 提供基于 <code>monetary</code> 通用货币系统的诸多插件的扩展功能。
</p>

<p align="center">
	<a href="https://www.npmjs.com/package/koishi-plugin-monetary-extra"><img src="https://img.shields.io/npm/v/koishi-plugin-monetary-extra?style=for-the-badge&logo=npm" alt="npm" /></a>
	<a href="https://github.com/BYWled/koishi-plugin-monetary-extra"><img src="https://img.shields.io/github/stars/BYWled/koishi-plugin-monetary-extra?style=for-the-badge&logo=github" alt="GitHub Stars" /></a>
</p>

<p align="center">
	<a href="https://gitee.com/BYWled/koishi-plugin-monetary-extra"><img src="https://img.shields.io/badge/Gitee-代码镜像-C71D23?style=for-the-badge&logo=gitee&logoColor=white" alt="Gitee Mirror" /></a>
	<a href="https://gitcode.com/BYWled/koishi-plugin-monetary-extra"><img src="https://img.shields.io/badge/GitCode-代码镜像-2962FF?style=for-the-badge" alt="GitCode Mirror" /></a>
</p>

<p align="center">
	<a href="https://github.com/BYWled/koishi-plugin-monetary-extra">GitHub</a> ·
	<a href="https://gitee.com/BYWled/koishi-plugin-monetary-extra">Gitee</a> ·
	<a href="https://gitcode.com/BYWled/koishi-plugin-monetary-extra">GitCode</a>
</p>

本插件将松散的各路货币、签到、银行插件通过“信用分”体系结合在一起。通过对用户的存款、签到活跃度进行综合打分，展示视觉展示卡片，让机器人的货币系统更加生动有趣。

> 版本：**Alpha.2**（信用分 v2：五维滚动窗口行为分）

## ✨ 特性

- **💳 信用分评估系统（v2 · 五维滚动窗口行为分）**：
  - **签到活性**（默认 25%）：保鲜度衰减 × 累签天数对数积累，断签即降、无法囤积。
  - **资产稳健**（默认 20%）：总资产（现金+银行）对数分，刷钱边际收益递减。
  - **经济参与**（默认 30%）：统计近窗口期抽奖/兑换/股票/任务/随机奖励等真实业务行为（依赖对应业务插件，缺表自动跳过）。
  - **社交活跃**（默认 25%）：主源为聊天统计插件（message-counter）本月日均发言，封顶防刷屏。
  - **频道偏置 bias**：限幅 ±10，防人为操纵。
  - 全维度基于滚动窗口统计，停止参与分数自然滑落；公式仍支持自定义（保留旧变量兼容映射）。
- **🩺 防刷排查**：`credit.diagnose` 管理指令输出各维度原始值。
  - 提取用户的**签到经验（或累签天数）**与**银行活期存款**，按自定义权重进行综合排名评估。
  - 支持频道偏置权重配置，让信用分算法更加灵活多变。

- **🖼️ 可视化展示**：
  - 内置极具科技感的**半圆环仪表盘**展示信用评分卡片（依赖 `puppeteer`）。
  - 精准展示用户头像、UID、评分等级、以及实时的各项数据排名。

- **🏦 智能银行联动**：
  - 补签或消费现金不足时，自动无缝联动 `koishi-plugin-monetary-bank` 扣除活期存款，告别频繁“取款”的烦恼。

- **📅 签到数据修复与补签**：
  - 完美兼容 `koishi-plugin-jrys-fix` 的数据表，支持用户花费信用点进行**漏签补签**。

## 📦 依赖

本插件需要以下服务支持：

- `database`: 用于跨表提取签到记录、银行记录以及储存本插件的频道偏置数据。
- `monetary`: 基础通用货币服务。
- `puppeteer`: **(可选但强烈推荐)** 用于渲染炫酷的半圆环信用分卡片，如果不安装将自动降级为纯文本回复。
- `monetaryBank`: (可选) 银行联动服务，如果希望使用余额不足自动扣活期功能需安装。

## 🎮 指令说明

- **`resign`**
  - **描述**：付费补签。
  - **说明**：距离上次签到超过一天时，可通过消耗指定数量的货币进行补签，恢复累签天数并正常获得经验。如果现金不足将尝试自动扣除银行活期。

- **`credit`**
  - **描述**：查看个人信用分。
  - **说明**：综合你的存款与签到数据计算出个人信用分，并以图片形式展现出当前的信用等级与相关排名。

- **`credit.rank`**
  - **描述**：查看信用分排行榜。
- **`credit.help`**
  - **描述**：查看信用分插件帮助。
- **`credit.diagnose <@用户>`**（authority ≥ 3）
  - **描述**：查看指定用户各维度原始值，便于防刷排查。
  - **说明**：输出当前排名前列用户的信用分总榜，让你随时了解自己的“财富与信誉”地位。

## 🔧 配置项

可以在 Koishi 控制台的插件配置页进行全局及按频道定制的设置：

### 基础设置

- **currency**: 默认货币单位名称（默认：`信用点`）。
- **enableResign**: 是否启用补签指令（默认：`true`）。
- **enableCredit**: 是否启用信用分指令（默认：`true`）。
- **enableBankSync**: 现金不足时是否联动银行活期余额（默认：`true`）。

### 功能设置

- **resignCost**: 补签费用，设为 `0` 则表示免费补签（默认：`100`）。
- **rankLimit**: 信用分排行榜显示的最大人数（默认：`10`）。
- **signRankMode**: 签到排名所依据的维度，可选 `exp`（按经验值）或 `signCount`（按累签次数）。

### 信用分计算设置

- **bankWeight**: 银行排名分所占的权重，默认为 `0.5`。
- **signWeight**: 签到排名分所占的权重，默认为 `0.5`。
- **creditFormula**: 信用分核心公式（支持自定义解析）。
  默认公式为：`bankScore * bankWeight + signScore * signWeight + bias`
  _说明：算法内部将每个人的数据映射为 0-100 分，然后再套用此公式，以确保结果始终保持在合理区间内。_

### 频道覆盖

- **channelConfigs**: 针对特定频道（群聊）覆盖上述的任何默认配置，支持精细化运营不同频道的信用点经济环境。

---

**开发者**: BYWled
**仓库**: `koishi-plugin-monetary-extra`
