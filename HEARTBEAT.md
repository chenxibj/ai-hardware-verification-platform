# HEARTBEAT.md

## 定期检查

### 🔴 Sub-Agent 健康监控（最高优先级）
- `subagents list` 检查所有 sub-agent 状态
- 发现 **失败(failed)** 的 sub-agent → 分析失败原因，重新 spawn 修复
- 发现 **超时/卡死** 的 sub-agent（运行时间异常长、无进展）→ kill 后重新 spawn
- 发现已完成的 sub-agent → 检查完成结果是否符合预期，有问题则补救
- 向飞书群汇报 sub-agent 工作进展（完成了什么、正在做什么、异常情况）

### 🟡 MVP-0 开发进展汇报（每20分钟）
- SSH 到开发机检查代码变更和构建状态
- 检查 docker 容器运行状态
- 向飞书群汇报进展概要

### GitHub Issue 监控
- 检查 chenxibj/ai-hardware-verification-platform 的 issue 变化
- 关注新关闭的 issue，如有关闭需去开发环境验收
