# Sub-Agent 任务追踪规范

## 核心原则

**每个 sub-agent 都必须在 active-tasks.json 中有对应记录，无例外。**

spawn 前写记录 → spawn 后补充 sessionKey → 巡检时逐条核对 → 完成/失败时更新状态。

## active-tasks.json 格式

```json
[
  {
    "id": "task-20260418-001",
    "createdAt": "2026-04-18T20:30:00+08:00",
    "description": "修复报告对比页面数据兼容性问题",
    "issues": ["#474", "#475"],
    "scope": "frontend",
    "files": ["src/pages/report/ComparisonView.jsx", "src/utils/comparison.js"],
    "status": "running",
    "subAgentLabel": "fix-comparison-compat",
    "sessionKey": "agent:main:subagent:abc123",
    "spawnedAt": "2026-04-18T20:30:05+08:00",
    "lastChecked": "2026-04-18T20:50:00+08:00",
    "lastProgress": "已修复 #474，正在处理 #475",
    "completedAt": null,
    "result": null,
    "retryCount": 0,
    "progressFile": "memory/task-progress-comparison-compat.md"
  }
]
```

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| id | ✅ | 格式 `task-YYYYMMDD-NNN`，当天递增 |
| createdAt | ✅ | ISO 时间戳 |
| description | ✅ | 一句话说清楚在做什么 |
| issues | ✅ | 关联的 GitHub issue 编号列表，无关联则 `[]` |
| scope | ✅ | 影响范围：`frontend` / `backend` / `e2e-test` / `infra` / `full-stack` |
| files | 推荐 | 预期修改的主要文件，帮助判断并行冲突 |
| status | ✅ | `pending` → `running` → `done` / `failed` / `timeout` |
| subAgentLabel | ✅ | spawn 时的 label，用于 `subagents list` 匹配 |
| sessionKey | ✅ | spawn 返回的 sessionKey，用于 `sessions_history` |
| spawnedAt | ✅ | agent 实际启动时间 |
| lastChecked | ✅ | 上次巡检核对时间 |
| lastProgress | ✅ | 上次检查到的进展摘要 |
| completedAt | - | 完成时间（done/failed 时填写） |
| result | - | 最终结果摘要（做了什么、改了哪些文件、是否部署） |
| retryCount | ✅ | 重试次数（timeout 后重启 +1） |
| progressFile | 推荐 | 详细进展文件路径（复杂任务用） |

## 生命周期

### 1. Spawn 前（必须先写记录）

```
1. 确定任务内容、关联 issue、影响范围
2. 检查 files 字段有无冲突（与其他 running 任务的 files 重叠 = 禁止并行）
3. 写入 active-tasks.json，status = "pending"
4. spawn sub-agent
5. 拿到 sessionKey 后更新记录，status = "running"
```

### 2. 巡检时（每个 running 任务逐条检查）

```
1. subagents list → 找对应 label
2. 如果 agent 还在跑 → 更新 lastChecked
3. 如果 agent 已停止：
   a. 检查 git log / 部署状态 → 判断任务是否实际完成
   b. 完成 → status = "done"，填 completedAt + result
   c. 未完成 → retryCount++，spawn 新 agent 继续，更新 sessionKey
   d. 多次失败（retryCount >= 3）→ status = "failed"，记录原因
```

### 3. 完成后

```
1. status 改为 "done"
2. 填写 completedAt 和 result
3. 保留记录 7 天后可归档删除
4. 汇报成果（飞书群）
```

## 并行冲突检测

spawn 前必须检查：

```
新任务 files ∩ 已有 running 任务 files ≠ ∅ → 禁止并行
```

**scope 冲突矩阵：**
- `frontend` + `frontend` → 检查 files 是否重叠
- `backend` + `backend` → 检查 files 是否重叠
- `full-stack` + 任何 → 禁止并行
- `e2e-test` + 开发类 → 允许（测试不改业务代码）
- `infra` + 任何 → 通常允许（改的是部署/CI 文件）

## Spawn Task Prompt 模板

每个 sub-agent 的 task prompt 最后必须包含：

```
## 完成标准
- [ ] 代码修改已 commit 并 push
- [ ] 构建通过（npm run build / mvn package）
- [ ] 部署到开发机并验证
- [ ] 相关 E2E 测试通过

## 进展记录
工作过程中，将关键进展写入 memory/task-progress-{label}.md
```
