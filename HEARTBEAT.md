# HEARTBEAT.md

## ⛔ 必须执行（每次心跳，无例外，不可跳过）

**以下步骤按顺序执行，每步都要实际调用工具，不是"看看就好"：**

### Step 1: 检查活跃任务 + Sub-Agent 状态（精细化追踪）
```
read memory/active-tasks.json
subagents list
```

**逐条核对 active-tasks.json 中每个 status=running 的任务：**

1. 用 `subAgentLabel` 在 `subagents list` 结果中匹配
2. **agent 还在跑** → 更新 `lastChecked`，尝试获取进展更新 `lastProgress`
3. **agent 已停止** →
   a. **先验证产出**：`git log --oneline -5`、检查部署状态、检查关联 issue 是否已关闭
   b. 任务实际完成 → 更新 status="done"，填 completedAt + result
   c. 任务未完成 → retryCount++，读 progressFile 获取断点，spawn 新 agent 继续
   d. retryCount >= 3 → status="failed"，记录原因，飞书汇报
4. **active-tasks 有记录但 subagents list 找不到对应 label** → 同上第 3 步处理

### Step 2: 检查 Open Issue + 自主恢复（最关键！）
```
gh issue list --repo chenxibj/ai-hardware-verification-platform --state open --json number,title,labels --limit 20
```

- 有 open issue 且无活跃 sub-agent → **必须立即 spawn sub-agent 开始干活**
- 把 issue 按优先级排序（P0 先做），打包 2-3 个相关 issue 给一个 agent
- **🔴 spawn 前必须：**
  1. 确定 scope 和预期修改的 files
  2. 检查与已有 running 任务的 files 是否冲突（冲突则等待或串行）
  3. **先写入 active-tasks.json**（status=pending）
  4. spawn agent
  5. 拿到 sessionKey 后更新记录（status=running，填 sessionKey + spawnedAt）
- **绝不能出现"有活等着干但没人在做"的情况超过一个心跳周期**
- **不需要人工确认，自主决策自主恢复**

### Step 3: GitHub 变化检测
- 对比上次检查，有新关闭的 issue → 需要验收
- 有新创建的 issue → 记录

### Step 4: 系统健康检查
- 已由 `ahvp-health-check` cron 单独处理（每 15 分钟），此处跳过
- 除非 health-check 连续报错，才在此步介入

### Step 5: 清理 + 汇报
- **清理 done 状态超过 7 天的任务记录**（归档到当天 memory 日志）
- 有实际工作成果（issue 关闭、功能完成）→ 飞书群汇报成果
- 一切正常且有 agent 在跑 → HEARTBEAT_OK
- **🔴 不发系统状态/恢复通知** — 开发机恢复、容器重启等运维消息不发群里
- **🔴 不发故障通知** — 发现问题自己修，修完不用说，只报工作成果
- **🔴 禁止"需要关注""建议""需主 session 检查"等甩锅措辞**

---

## 关键原则

1. **Open issue + 无 agent = 立即拉 agent** — 这是最高优先级规则
2. **Sub-agent 停止 ≠ 任务完成** — 必须实际验证产出
3. **超时是常态** — agent 容易 timeout，发现中断立刻恢复
4. **主动闭环** — 任务全程自驱，不等主人追问
5. **每次心跳都要读 active-tasks.json + subagents list + gh issue list**
6. **🔴 Take Action, Not Report** — 发现问题直接修，修完汇报结果
7. **agent 完成或停止 + 还有 open issue → 自动拉新 agent 继续，7×24 生效**
8. **🔴 Spawn 前必须写 active-tasks.json** — 无记录的 agent 是幽灵，巡检无法追踪

## active-tasks.json 格式（完整版）

详见 `docs/task-tracking.md`。核心字段：

```json
[
  {
    "id": "task-YYYYMMDD-NNN",
    "createdAt": "ISO时间",
    "description": "一句话说清楚在做什么",
    "issues": ["#474", "#475"],
    "scope": "frontend|backend|e2e-test|infra|full-stack",
    "files": ["src/pages/xxx.jsx"],
    "status": "pending|running|done|failed|timeout",
    "subAgentLabel": "label（用于 subagents list 匹配）",
    "sessionKey": "spawn 返回的 sessionKey",
    "spawnedAt": "ISO时间",
    "lastChecked": "ISO时间",
    "lastProgress": "进展摘要",
    "completedAt": null,
    "result": null,
    "retryCount": 0,
    "progressFile": "memory/task-progress-xxx.md"
  }
]
```

## 并行冲突检测

spawn 前检查：**新任务 files ∩ 已有 running 任务 files ≠ ∅ → 禁止并行**

允许并行的情况：
- 不同 scope 且 files 不重叠（如 frontend + e2e-test）
- infra 类任务（改 CI/部署文件）通常可与开发类并行
