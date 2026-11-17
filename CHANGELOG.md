# Changelog

本项目的所有关键更改都将记录在此文件中。

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
