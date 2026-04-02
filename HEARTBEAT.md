# HEARTBEAT.md

## 定期检查

### GitHub Issue 监控（每次心跳必查）
- 用 GitHub API 检查 chenxibj/ai-hardware-verification-platform 的 open issue
- **新 issue 出现时**：第一时间在飞书群通知 chenxi，确认是否需要修复
- **关注新关闭的 issue**：如有关闭需去开发环境（http://39.97.251.94/）验收
- 验收方式：SSH 到开发机测试功能，或通过浏览器访问系统验证
- 验收结果记录到对应 issue 的 comment 中
- **目标：close 所有 issue**
- 记录变化到 memory/YYYY-MM-DD.md
- 上次已知最大 issue 编号记录在 memory/heartbeat-state.json 的 lastKnownIssue 字段

### 三期开发进展巡检（每20分钟，必须执行）
每隔20分钟执行一次巡检，步骤：
1. **检查 sub-agent 状态** — `subagents list`，确认是否还在运行
2. **如果挂了/超时** — 查日志定位原因，立即重启新的 sub-agent 接手
3. **如果卡住** — 查最近的操作日志，用 `steer` 介入或手动接管
4. **检查开发机** — SSH 查看代码变更、容器状态、Agent 运行状态
5. **向群里汇报** — 已完成/进行中/遇到的问题/下一步计划
6. **如果没问题** — 确认进度正常，预估下次汇报时的预期进展

核心原则：汇报不只是汇报，是 **检查 + 诊断 + 修复 + 汇报**。
直到所有三期 issue（#75-#82）全部完成为止。
