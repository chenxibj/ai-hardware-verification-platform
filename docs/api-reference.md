# API Reference — AI Hardware Verification Platform

> Auto-generated from backend Controller annotations + frontend API calls.
> Base URL: `/api` (frontend axios baseURL). Backend context-path: `/api`.
> Issue: #294

---

## 目录

1. [认证 Auth](#1-认证-auth)
2. [芯片管理 Chips](#2-芯片管理-chips)
3. [评测计划 Plans](#3-评测计划-plans)
4. [评测任务 Tasks](#4-评测任务-tasks)
5. [评测模板 Templates](#5-评测模板-templates)
6. [评测结果 Results](#6-评测结果-results)
7. [芯片报告 Chip Reports](#7-芯片报告-chip-reports)
8. [计算节点 Nodes](#8-计算节点-nodes)
9. [资源池 Resource Pools](#9-资源池-resource-pools)
10. [数字资产 Assets](#10-数字资产-assets)
11. [仪表盘 Dashboard](#11-仪表盘-dashboard)
12. [社区 Community](#12-社区-community)
13. [用户管理 Users](#13-用户管理-users)
14. [租户 Tenants](#14-租户-tenants)
15. [告警 Alerts](#15-告警-alerts)
16. [日志 Logs](#16-日志-logs)
17. [工作流 Workflows](#17-工作流-workflows)
18. [计费 Billing](#18-计费-billing)
19. [调度配置 Scheduler](#19-调度配置-scheduler)
20. [反馈 Feedback](#20-反馈-feedback)
21. [健康检查 Health](#21-健康检查-health)

---

## 1. 认证 Auth

**Controller:** `com.lab.auth.AuthController` → `/auth`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| POST | `/auth/register` | 用户注册 | `Register.js` |
| POST | `/auth/login` | 用户登录 | `useAuthStore.js` |
| POST | `/auth/refresh` | 刷新 Token | `useAuthStore.js` |
| GET | `/auth/me` | 获取当前用户信息 | `useAuthStore.js` |
| POST | `/auth/logout` | 登出 | `useAuthStore.js` |

---

## 2. 芯片管理 Chips

**Controller:** `com.lab.chip.ChipController` → `/chips`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/chips` | 芯片列表（分页） | `ChipList.js`, `PlanList.js` |
| GET | `/chips/{id}` | 芯片详情 | `ChipProfile.js` |
| POST | `/chips` | 创建芯片 | `ChipList.js` |
| PUT | `/chips/{id}` | 更新芯片 | `ChipProfile.js` |
| DELETE | `/chips/{id}` | 删除芯片 | `ChipList.js` |
| GET | `/chips/vendors` | 厂商列表 | `ChipList.js` |
| GET | `/chips/{id}/reports` | 芯片关联报告 | `ChipProfile.js` |

**查询参数 (GET /chips):** `page`, `size`, `chipType`, `vendor`, `keyword`

---

## 3. 评测计划 Plans

**Controller:** `com.lab.plan.EvaluationPlanController` → (root-level)

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/plans` | 计划列表（分页） | `PlanList.js` |
| POST | `/plans` | 创建计划 | `PlanCreate.js` |
| GET | `/plans/{id}` | 计划详情 | `PlanMonitor.js` |
| PUT | `/plans/{id}` | 更新计划 | — |
| PUT | `/plans/{id}/start` | 启动计划 | `PlanList.js` |
| PUT | `/plans/{id}/pause` | 暂停计划 | `PlanList.js` |
| PUT | `/plans/{id}/resume` | 恢复计划 | `PlanList.js` |
| PUT | `/plans/{id}/cancel` | 取消计划 | `PlanList.js` |
| POST | `/plans/{id}/copy` | 克隆计划 | `PlanList.js` |
| DELETE | `/plans/{id}` | 删除计划 | `PlanList.js` |
| GET | `/plans/stats` | 计划统计 | `PlanList.js` |
| GET | `/plans/{planId}/tasks` | 计划下的任务列表 | `PlanMonitor.js` |
| GET | `/chips/{chipId}/plans` | 芯片关联计划 | `ChipProfile.js` |

**查询参数 (GET /plans):** `page`, `size`, `status`, `chipId`, `sort`

---

## 4. 评测任务 Tasks

**Controller:** `com.lab.task.EvaluationTaskController` → `/tasks`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/tasks` | 任务列表 | `Tasks.js` |
| POST | `/tasks` | 创建任务 | `TaskCreateModal.js` |
| GET | `/tasks/{taskId}` | 任务详情 | `TaskDetailDrawer.js` |
| POST | `/tasks/{taskId}/cancel` | 取消任务 | `Tasks.js` |
| POST | `/tasks/{taskId}/retry` | 重试任务 | `Tasks.js` |
| POST | `/tasks/{taskId}/progress` | 上报进度 | — (Agent端) |
| POST | `/tasks/{taskId}/pause` | 暂停任务 | `Tasks.js` |
| POST | `/tasks/{taskId}/resume` | 恢复任务 | `Tasks.js` |
| POST | `/tasks/{taskId}/skip` | 跳过任务 | `Tasks.js` |
| POST | `/tasks/{taskId}/clone` | 克隆任务 | `Tasks.js` |
| GET | `/tasks/stats` | 任务统计 | `Tasks.js` |
| GET | `/tasks/{taskId}/debug-info` | 调试信息 | `DebugPanel.js` |
| GET | `/tasks/{taskId}/debug-log` | 调试日志 | `DebugPanel.js` |

### 任务日志

**Controller:** `com.lab.task.TaskLogController` → `/tasks`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| POST | `/tasks/{taskId}/logs` | 上报日志 | — (Agent端) |
| POST | `/tasks/{taskId}/logs/batch` | 批量上报日志 | — (Agent端) |
| GET | `/tasks/{taskId}/logs` | 查询日志 | `TaskExecutionLogs.js` |
| GET | `/tasks/{taskId}/logs/stats` | 日志统计 | `TaskExecutionLogs.js` |
| GET | `/tasks/{taskId}/logs/metrics` | 日志指标 | `TaskExecutionLogs.js` |
| GET | `/tasks/{taskId}/logs/page` | 日志分页 | `TaskExecutionLogs.js` |
| GET | `/tasks/{taskId}/logs/download` | 下载日志 | `TaskExecutionLogs.js` |

### 任务完成

**Controller:** `com.lab.scoring.TaskCompleteController` → `/tasks`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| POST | `/tasks/{taskId}/complete` | 任务完成回调 | — (Agent端) |

---

## 5. 评测模板 Templates

**Controller:** `com.lab.template.TemplateController` → `/templates`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/templates` | 模板列表 | `TemplateList.js` |
| GET | `/templates/{id}` | 模板详情 | `TemplateList.js` |
| POST | `/templates` | 创建模板 | `TemplateList.js` |
| PUT | `/templates/{id}` | 更新模板 | `TemplateList.js` |
| DELETE | `/templates/{id}` | 删除模板 | `TemplateList.js` |
| POST | `/templates/{id}/clone` | 克隆模板 | `TemplateList.js` |

**查询参数 (GET /templates):** `level` (评测层级: CHIP/OPERATOR/MODEL/COMPARISON)

---

## 6. 评测结果 Results

**Controller:** `com.lab.result.EvaluationResultController` → (root-level)

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/results` | 结果列表 | — |
| GET | `/results/{id}` | 结果详情 | — |
| POST | `/results` | 创建结果 | — (Agent端) |
| GET | `/plans/{planId}/results` | 计划关联结果 | `PlanMonitor.js` |
| GET | `/chips/{chipId}/results` | 芯片关联结果 | `ChipProfile.js` |
| POST | `/tasks/{taskId}/result` | 上报任务结果 | — (Agent端) |
| POST | `/tasks/{taskId}/failure` | 上报任务失败 | — (Agent端) |
| GET | `/plans/{planId}/scores` | 计划评分 | `PlanMonitor.js` |
| GET | `/tasks/{taskId}/report` | 任务报告 | `TaskResult.js` |
| GET | `/results/by-task` | 按任务查结果 | `TaskDetailDrawer.js` |

---

## 7. 芯片报告 Chip Reports

**Controller:** `com.lab.chipreport.ChipReportController` → `/chip-reports`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/chip-reports` | 报告列表 | `ReportList.js` |
| POST | `/chip-reports` | 创建报告 | — |
| GET | `/chip-reports/{id}` | 报告详情 | `ChipReport.js` |
| PUT | `/chip-reports/{id}` | 更新报告 | `ChipReport.js` |
| POST | `/chip-reports/{id}/archive` | 归档报告 | `ReportList.js` |
| DELETE | `/chip-reports/{id}` | 删除报告 | `ReportList.js` |
| GET | `/chip-reports/stats` | 报告统计 | `ReportList.js` |
| GET | `/chip-reports/trend/{chipId}` | 趋势数据 | `ChipProfile.js` |
| GET | `/chip-reports/chip/{chipId}` | 芯片报告列表 | `ChipProfile.js` |
| GET | `/chip-reports/plan/{planId}` | 计划报告 | `PlanList.js` |
| GET | `/chip-reports/compare` | 报告对比 | `ReportCompare.js` |

### 报告分析

**Controller:** `com.lab.chipreport.ReportAnalysisController` → `/reports`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/reports/{id}/analysis` | 报告分析 | — |

---

## 8. 计算节点 Nodes

**Controller:** `com.lab.node.ComputeNodeController` → `/nodes`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/nodes` | 节点列表 | `NodeList.js` |
| GET | `/nodes/stats` | 节点统计 | `NodeList.js` |
| GET | `/nodes/{id}` | 节点详情 | `NodeDetail.js` |
| POST | `/nodes` | 创建节点 | `NodeList.js` |
| POST | `/nodes/register` | 节点注册 | `ResourceOnboard.js` |
| PUT | `/nodes/{id}` | 更新节点 | `NodeList.js`, `NodeDetail.js` |
| DELETE | `/nodes/{id}` | 删除节点 | `NodeList.js` |
| POST | `/nodes/{id}/heartbeat` | 心跳上报 | — (Agent端) |
| POST | `/nodes/{id}/diagnose` | 诊断节点 | `NodeDetail.js` |
| POST | `/nodes/{id}/repair` | 修复节点 | `NodeDetail.js` |

### 环境信息

**Controller:** `com.lab.node.EnvInfoController` → `/nodes`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/nodes/{id}/env-info` | 环境信息 | `NodeDetail.js` |
| POST | `/nodes/{id}/env-info/collect` | 采集环境信息 | `NodeDetail.js` |
| POST | `/nodes/{id}/env-info/local-collect` | 本地采集 | — |
| GET | `/nodes/env-info/batch` | 批量环境信息 | — |

### 节点指标

**Controller:** `com.lab.node.NodeMetricsController` → `/nodes`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/nodes/{id}/metrics` | 节点监控指标 | `NodeDetail.js` |

---

## 9. 资源池 Resource Pools

**Controller:** `com.lab.resource.ResourcePoolController` → `/resource-pools`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/resource-pools` | 资源池列表 | `ResourcePoolList.js` |
| GET | `/resource-pools/{id}` | 资源池详情 | `ResourcePoolList.js` |
| POST | `/resource-pools` | 创建资源池 | `ResourcePoolList.js` |
| PUT | `/resource-pools/{id}` | 更新资源池 | `ResourcePoolList.js` |
| DELETE | `/resource-pools/{id}` | 删除资源池 | `ResourcePoolList.js` |
| POST | `/resource-pools/{id}/nodes` | 添加节点到资源池 | `ResourcePoolList.js` |
| DELETE | `/resource-pools/{id}/nodes/{nodeId}` | 从资源池移除节点 | `ResourcePoolList.js` |
| GET | `/resource-pools/{id}/stats` | 资源池统计 | `ResourcePoolList.js` |

---

## 10. 数字资产 Assets

**Controller:** `com.lab.asset.DigitalAssetController` → `/assets`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/assets` | 资产列表 | `AssetTable.js` |
| GET | `/assets/stats` | 资产统计 | `AssetStatsBar.js` |
| GET | `/assets/{id}` | 资产详情 | `AssetDetail.js` |
| POST | `/assets/upload` | 上传资产文件 | `QuickUploadModal.js` |
| POST | `/assets` | 创建资产 | `Assets.js` |
| GET | `/assets/{id}/download` | 下载资产 | `AssetTable.js` |
| DELETE | `/assets/{id}` | 删除资产 | `AssetTable.js` |

---

## 11. 仪表盘 Dashboard

**Controller:** `com.lab.dashboard.DashboardController` → `/dashboard`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/dashboard/stats` | 总览统计 | `Dashboard.js` |
| GET | `/dashboard/recent-activities` | 最近活动 | `Dashboard.js` |
| GET | `/dashboard/recent-plans` | 最近计划 | `Dashboard.js` |

---

## 12. 社区 Community

### 社区资源

**Controller:** `com.lab.community.CommunityResourceController` → `/community/resources`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/community/resources` | 资源列表 | `CommunityResources.js` |
| GET | `/community/resources/{id}/download` | 下载资源 | `CommunityResources.js` |

### 评测榜单

**Controller:** `com.lab.community.LeaderboardController` → `/community`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/community/leaderboard` | 排行榜 | `Leaderboard.js` |

### 需求看板

**Controller:** `com.lab.community.DemandController` → `/community/demands`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/community/demands` | 需求列表 | `DemandBoard.js` |
| POST | `/community/demands` | 提交需求 | `DemandBoard.js` |

### 论坛帖子

**Controller:** `com.lab.community.PostController` → `/community/posts`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/community/posts` | 帖子列表 | `Forum.js` |
| POST | `/community/posts` | 发表帖子 | `Forum.js` |
| GET | `/community/posts/{id}` | 帖子详情 | `Forum.js` |

---

## 13. 用户管理 Users

**Controller:** `com.lab.user.UserController` → `/users`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/users` | 用户列表 | `Users.js` |
| POST | `/users` | 创建用户 | `Users.js` |
| GET | `/users/{id}` | 用户详情 | `Users.js` |
| PUT | `/users/{id}/role` | 修改角色 | `Users.js` |
| PUT | `/users/{id}/status` | 修改状态 | `Users.js` |
| GET | `/users/stats` | 用户统计 | `Users.js` |

### 用户积分

**Controller:** `com.lab.user.UserPointsController` → `/users/me/points`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/users/me/points` | 我的积分 | `UserPoints.js` |

### 用户偏好

**Controller:** `com.lab.user.UserPreferenceController` → `/users/me/preferences`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/users/me/preferences` | 获取偏好 | `UserPreferences.js` |
| PUT | `/users/me/preferences` | 更新偏好 | `UserPreferences.js` |

---

## 14. 租户 Tenants

**Controller:** `com.lab.tenant.TenantController` → `/tenants`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/tenants` | 租户列表 | `TenantList.js` |
| POST | `/tenants` | 创建租户 | `TenantList.js` |
| GET | `/tenants/{id}` | 租户详情 | `TenantList.js` |
| PUT | `/tenants/{id}` | 更新租户 | `TenantList.js` |

---

## 15. 告警 Alerts

**Controller:** `com.lab.alert.AlertController` → `/alerts`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/alerts` | 告警列表 | `AlertPanel.js` |
| POST | `/alerts/{id}/acknowledge` | 确认告警 | `AlertPanel.js` |

---

## 16. 日志 Logs

### 全局日志

**Controller:** `com.lab.task.GlobalLogController` → (root-level)

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/plans/{planId}/logs` | 计划日志 | `PlanMonitor.js` |
| GET | `/plans/{planId}/logs/stats` | 计划日志统计 | `PlanMonitor.js` |
| GET | `/logs/global` | 全局日志 | `Logs.js` |
| GET | `/logs/global/stats` | 全局日志统计 | `Logs.js` |

### 审计日志

**Controller:** `com.lab.evallog.EvalLogController` → `/eval-logs`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/eval-logs` | 评测日志 | `AuditLogs.js` |
| GET | `/eval-logs/stats` | 评测日志统计 | `AuditLogs.js` |

---

## 17. 工作流 Workflows

**Controller:** `com.lab.workflow.WorkflowController` → `/workflows`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/workflows` | 工作流列表 | `Workflows.js` |
| POST | `/workflows` | 创建工作流 | `Workflows.js` |
| GET | `/workflows/{id}` | 工作流详情 | `Workflows.js` |
| PUT | `/workflows/{id}` | 更新工作流 | `Workflows.js` |
| DELETE | `/workflows/{id}` | 删除工作流 | `Workflows.js` |

---

## 18. 计费 Billing

**Controller:** `com.lab.billing.BillingController` → `/billing`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/billing/plans` | 计费套餐 | `Billing.js` |
| GET | `/billing/usage` | 使用量 | `Billing.js` |

---

## 19. 调度配置 Scheduler

**Controller:** `com.lab.scheduler.SchedulerConfigController` → `/admin/scheduler-config`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/admin/scheduler-config` | 获取调度配置 | `SchedulerConfig.js` |
| PUT | `/admin/scheduler-config` | 更新调度配置 | `SchedulerConfig.js` |

---

## 20. 反馈 Feedback

**Controller:** `com.lab.feedback.FeedbackController` → `/feedback`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| POST | `/feedback` | 提交反馈 | `HelpPanel.js` |

---

## 21. 健康检查 Health

**Controller:** `com.lab.health.HealthController` → `/health`

| 方法 | 路径 | 说明 | 前端调用位置 |
|------|------|------|-------------|
| GET | `/health` | 健康检查 | `Dashboard.js` |

---

## 通用说明

### 响应格式
```json
{
  "code": 0,
  "message": "success",
  "data": { ... },
  "total": 100
}
```
- `code: 0` 表示成功，非 0 表示错误
- 分页接口返回 `total` 字段

### 认证方式
- Bearer Token: `Authorization: Bearer <jwt-token>`
- Token 通过 `/auth/login` 获取，通过 `/auth/refresh` 刷新
- 前端 axios interceptor 自动附加 token，401 时自动登出

### 分页参数
| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | int | 页码（从 0 开始） |
| `size` | int | 每页条数 |
| `sort` | string | 排序字段+方向，如 `createdAt,desc` |

---

*Last updated: 2026-04-09*
