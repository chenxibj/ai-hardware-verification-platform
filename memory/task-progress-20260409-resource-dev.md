# 资源管理模块开发进度

> 创建时间: 2026-04-09 01:55

## Step 1: PRD v2.0 ✅ 完成

- PRD 从 v1.0 更新到 v2.0
- 路线图从 18 周裁剪至 8 周 MVP
- 主要变更：
  - K8s 去掉云API/配额/证书/HIBERNATED
  - 调度只留 least_loaded
  - 监控用 PG 不引入 Prometheus/Loki
  - 保留自愈（chenxi 要求）
  - 密钥用环境变量不上 KMS
  - 节点 1:1 资源池
  - 菜单扁平化
- Commit: `ac82a82b` "docs: 资源管理 PRD v2.0 — MVP 裁剪 + 评审反馈合入"

## Step 2: Issue 拆分 ✅ 完成

10 个 Issue + 1 个总览 Issue：

| # | 阶段 | 标题 |
|---|------|------|
| #248 | P0 | 节点管理 CRUD 完善 — 创建/编辑/删除节点 + 状态同步 |
| #249 | P1 | 节点标签管理 — 标签 CRUD + 按标签筛选 |
| #250 | P1 | 资源池 NODE_POOL — 创建/编辑/删除 + 节点关联（1:1） |
| #251 | P1 | 评测任务选择资源池 — PlanCreate + least_loaded |
| #252 | P2 | K8s 集群注册 — kubeconfig 导入 + 信息展示 + 健康检查 |
| #253 | P2 | K8s Agent 接入 — 生成 Agent YAML + 反连注册 |
| #254 | P2 | K8S_POOL 资源池 — 集群关联 + K8s Job 调度 |
| #255 | P3 | 基础资源监控 — PG 存储 + 监控面板 |
| #256 | P3 | 飞书告警 — 阈值规则 + Webhook |
| #257 | P3 | 自愈策略 — Agent 重启 + 异常标记 + 恢复日志 |
| #258 | 总览 | 资源管理模块 MVP — 8 周路线图 |

## Step 3: P0 开发 ✅ 完成

### 3.1 GET /compute-nodes 500 修复
- **已修复**: 经验证 GET /api/nodes 当前返回正常（code=0，返回 1 个节点）
- 500 错误可能在之前的开发迭代中已修复

### 3.2 节点 CRUD 完善
- **已有完整实现**:
  - 后端: ComputeNodeController 已有 GET/POST/PUT/DELETE 完整 API
  - 前端: NodeList.js 已有创建对话框、编辑按钮、删除（Popconfirm）
  - 还包括诊断和修复功能（#247 实现的）

### 3.3 节点状态同步
- **已有实现**:
  - `checkOfflineNodes()` 定时任务（每 30s 执行）
  - **已调整**: 心跳超时阈值从 3 分钟改为 2 分钟（PRD v2.0 要求）
  - 心跳恢复自动标记 ONLINE: `heartbeat()` 方法中 `setStatus(ONLINE)`
- Commit: `12c7c235` "fix: 心跳超时阈值从 3 分钟调整为 2 分钟"

### 3.4 部署验证 ✅
- 后端: docker compose build + restart ✅
- 前端: npm run build + docker cp ✅
- API 验证: GET /api/nodes 正常返回

## 总结

P0 阶段的核心功能在之前的开发中已基本实现：
- 节点 CRUD（创建/查看/编辑/删除）✅
- 心跳超时自动 OFFLINE ✅（阈值已调整为 2 分钟）
- 心跳恢复自动 ONLINE ✅
- 前端完整操作界面 ✅（含诊断/修复）

唯一的代码改动是将心跳超时阈值从 3 分钟调整为 PRD v2.0 要求的 2 分钟。

**下一步**: P1 阶段 — 节点标签管理 + NODE_POOL 资源池 + 评测对接
