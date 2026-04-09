# 日志系统 Phase 2-4 进度报告

**日期:** 2026-04-08
**状态:** ✅ 已完成并部署

## Phase 2: 前端日志面板改造 (#244) ✅

### 完成内容
- [x] PlanMonitor.js 删除模拟日志相关代码（之前已无 LOG_TEMPLATES）
- [x] 改为从 `GET /plans/{planId}/logs` 获取日志（REST API）
- [x] 10 秒自动刷新轮询（通过 useLogWebSocket hook 实现）
- [x] maxHeight 从 400px → 600px（原来是400不是320）
- [x] 全屏切换按钮（expanded state → `calc(100vh - 120px)`）
- [x] 前端日志上限 2000 条，超限移除最旧
- [x] "加载更早日志"按钮
- [x] 按级别过滤: ALL/INFO/WARN/ERROR/DEBUG
- [x] 按类型过滤: ALL/SYSTEM/EVAL/METRIC/TEXT/PROGRESS
- [x] 搜索功能保留

### 新增后端
- `GET /api/plans/{planId}/logs` — Plan 级别日志聚合（GlobalLogController）
- `GET /api/plans/{planId}/logs/stats` — Plan 日志统计
- TaskLogRepository 新增 `findByPlanIdFiltered`, `findByPlanIdFilteredWithKeyword`, `countByPlanId` 等

## Phase 3: WebSocket 实时推送 (#245) ✅

### 完成内容
- [x] 复用已有 `TaskLogWebSocketHandler`（`/api/ws/tasks`）
- [x] 扩展支持 `planId` 参数订阅（`ws://host/ws/tasks?planId=456`）
- [x] `useLogWebSocket(planId)` 自定义 hook
- [x] 指数退避重连: 1s → 2s → 4s → max 30s
- [x] 重连后用 afterId 补拉遗漏日志
- [x] 连接状态指示器: 🟢连接 / 🟡重连 / 🔴离线
- [x] 断连超 30s fallback 到 HTTP 轮询（10s 间隔）
- [x] broadcastLog 方法同时推送到 task 和 plan 订阅者

### 架构
- WebSocket 端点: `/api/ws/tasks?planId={planId}`（通过 nginx `/ws/` 代理）
- 前端通过 `useLogWebSocket` hook 管理连接生命周期
- TaskLogController.broadcastLog → 同时广播到 taskSubscriptions 和 planSubscriptions

## Phase 4: 全局日志中心 (#246) ✅

### 完成内容
- [x] `GET /api/logs/global` — 从 task_logs 查询，支持多维过滤 + 分页
  - 参数: planId, taskId, level, logType, search, startTime, endTime, size, page
- [x] `GET /api/logs/global/stats` — 统计卡片数据
  - 总日志 / ERROR / WARN / 今日新增
- [x] Logs.js 完全重构
  - 数据源从 eval_logs 切换到 task_logs（`/logs/global`）
  - 统计卡片: 总日志/ERROR/WARN/今日新增
  - 多维过滤器: Plan ID / Task ID / 级别 / 类型 / 关键字 / 时间范围
  - 无限滚动分页

### 数据库优化
- 新增索引: `idx_task_logs_plan_id` (plan_id)
- 新增索引: `idx_task_logs_created_at` (created_at)

## 部署验证

| 检查项 | 状态 |
|--------|------|
| 后端编译 | ✅ |
| 后端启动 | ✅ (Tomcat on port 8080) |
| GET /plans/295/logs | ✅ 返回 197 条日志 |
| GET /plans/295/logs/stats | ✅ 统计正确 |
| GET /logs/global?size=3 | ✅ 分页正常 |
| GET /logs/global/stats | ✅ 返回统计 |
| GET /logs/global?level=ERROR | ✅ 过滤正常 |
| WebSocket /ws/tasks?planId= | ✅ 426 Upgrade Required (正常) |
| 前端构建 | ✅ |
| 前端部署 | ✅ |

## Git
- Commit: `fa58d7cb` — feat: #244 #245 #246 日志系统 Phase 2-4
- Push: ⚠️ GitHub push 超时，需要重试（网络问题）

## 文件变更
- `backend/src/main/java/com/lab/config/TaskLogWebSocketHandler.java` — 新增 planId 订阅
- `backend/src/main/java/com/lab/task/GlobalLogController.java` — 新建，Plan级+全局日志API
- `backend/src/main/java/com/lab/task/TaskLogController.java` — broadcastLog 改为同时广播 plan
- `backend/src/main/java/com/lab/task/TaskLogRepository.java` — 新增 plan 和 global 查询方法
- `backend/src/main/java/com/lab/task/EvaluationTaskService.java` — broadcastTaskStatus 传 planId
- `frontend/src/hooks/useLogWebSocket.js` — 新建 WebSocket hook
- `frontend/src/pages/PlanMonitor.js` — 重写，使用 useLogWebSocket
- `frontend/src/pages/Logs.js` — 重写，全局日志中心
