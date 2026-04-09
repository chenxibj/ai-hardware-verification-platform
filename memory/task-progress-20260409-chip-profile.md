# Task Progress: 芯片能力画像 + 报告横向对比

## 状态: 🚧 开发中

## 需求概要
1. **芯片能力画像基于可采信报告刷新** — baseline 机制
2. **同芯片报告横向对比** — compare API + 前端对比面板

## 进度
- [x] 代码分析，理解现有结构
- [ ] 后端：chip_reports 增加 is_baseline 字段 (DB migration)
- [ ] 后端：set-baseline API + 芯片画像刷新
- [ ] 后端：compare API
- [ ] 后端：ReportGeneratorService 自动 baseline
- [ ] 前端：ChipReport.js 增加"标记为可采信基线"按钮
- [ ] 前端：ChipProfile.js 能力画像优先用 baseline
- [ ] 前端：ChipProfile.js 报告对比功能
- [ ] 构建部署
- [ ] 验证测试

## 时间线
- 01:18 开始分析代码
