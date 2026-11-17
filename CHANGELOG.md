# Changelog

本项目的所有关键更改都将记录在此文件中。

### [Alpha.4]

#### 🐛 Bug Fixes (漏洞修复)

- **credit/interaction**: 修复 `message-counter`（聊天统计）多频道记录覆盖缺陷。`message_counter_records` 表以 `(channelId, userId)` 为复合主键，原逻辑在多频道/私聊循环中直接覆盖赋值，导致活跃群发言被未发言的群或私聊记录覆盖为 0；现修复为按用户全频道累加当月发言总数，正确计算日均发言量与社交活跃分。
- **credit/interaction**: 针对每月首日发言统计做鲁棒处理，当月首日且当月计数为 0 时平滑回退至昨日统计，避免月初重置瞬间活跃度归零。
- **credit/binding**: 统一社交活跃、快照统计与频道偏置的 ID 兼容匹配逻辑，支持平台数字 ID 与内部 aid/uid 的双向对齐，并在 `credit.diagnose` 中补充数字 ID 反查。
- **services/hasTable**: 增强数据表探测韧性（增加 `ctx.model?.tables` 回退），防止上下文作用域差异导致的误判。
- **render**: 优化信用分仪表盘与各维度分数的显示舍入，使用 `Math.round` 避免微小分值直接显示为 0。

### [Alpha.3]

#### 🐛 Bug Fixes (漏洞修复)

- **jrys/binding**: 修复在真实聊天平台（如 OneBot）中，因用户昵称写入 `jrys.name`（形如 `@昵称`）导致 `credit` 与 `resign` 获取不到签到记录的缺陷。通过 Koishi 内部 `uid`/`aid` 与 `binding` 表精准对齐平台 `userId` 与签到数据。
- **credit**: 修复由于候选人名单与资产/参与度/社交活跃度字典键名不一致（昵称 vs 平台 userId），导致其余四维度行为分归零的问题。
- **resign**: 补签数据写回统一按主键 `id` 更新，彻底防止按非唯一昵称写回落空。
- **credit.diagnose**: 诊断指令支持同时通过平台数字 ID、`<at>` 艾特以及用户群昵称反查用户明细。

### [Alpha.2]

#### 💥 Breaking Changes (破坏性变更)

- **credit**: 默认信用分公式由双排名百分位改为五维滚动窗口行为分加权（旧自定义公式可通过 `bankScore`/`signScore` 兼容映射继续使用）。

#### ✨ Features (新特性)

- **credit**: 信用分 v2——签到活性（保鲜衰减×累签对数）、资产稳健（对数分）、经济参与（多业务审计表统计）、社交活跃（msgcount 主源）、频道偏置（限幅 ±10）五个维度。
- **credit**: 图片卡片升级为四维进度条展示，文本降级同步五维明细。
- **help**: 新增 `credit.help` 与 `credit.diagnose <@用户>`（管理员防刷排查）。

#### 🐛 Bug Fixes (漏洞修复)

- **resign**: 修复 jrys 表 name 为 `@昵称` 格式时补签写回落空（扣款不回填）的问题。
- **credit**: 修复候选名单未归一化 `@` 前缀导致全维度零分的问题。
