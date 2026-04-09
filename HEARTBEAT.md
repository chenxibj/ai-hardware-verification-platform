# HEARTBEAT.md

## ⛔ 必须执行（每次心跳，无例外，不可跳过）

**以下步骤按顺序执行，每步都要实际调用工具，不是"看看就好"：**

### Step 1: 检查活跃任务 + Sub-Agent 状态
```
read memory/active-tasks.json
subagents list
```
对照 active-tasks.json：
- 有未完成任务 + agent 还在跑 → OK
- 有未完成任务 + agent 已停止 → **立即 spawn 新 agent 继续**（读 task-progress 获取断点）
- 无未完成任务 → 进入 Step 2

### Step 2: 检查 Open Issue + 自主恢复（最关键！）
```
gh issue list --repo chenxibj/ai-hardware-verification-platform --state open --json number,title,labels --limit 20
```
- 有 open issue 且无活跃 sub-agent → **必须立即 spawn sub-agent 开始干活**
- 有未完成任务 + agent 已停止 → **直接 spawn 新 agent 继续，不问 chenxi**
- 把 issue 按优先级排序（P0 先做），打包 2-3 个相关 issue 给一个 agent
- 更新 active-tasks.json
- **绝不能出现"有活等着干但没人在做"的情况超过一个心跳周期**
- **不需要人工确认，自主决策自主恢复**

### Step 3: GitHub 变化检测
- 对比上次检查，有新关闭的 issue → 需要验收
- 有新创建的 issue → 记录

### Step 4: 系统健康检查
- SSH 到开发机检查容器状态（每 3 次心跳做一次，不是每次都做）

### Step 5: 汇报
- 有实际工作成果（issue 关闭、功能完成）→ 飞书群汇报成果
- 一切正常且有 agent 在跑 → HEARTBEAT_OK
- **🔴 不发系统状态/恢复通知** — 开发机恢复、容器重启、SSH 恢复等运维消息不发群里
- **🔴 不发故障通知** — 发现问题自己修，修完不用说，只报工作成果
- **🔴 禁止"需要关注""建议""需主 session 检查"等甩锅措辞**

---

## 关键原则

1. **Open issue + 无 agent = 立即拉 agent** — 这是最高优先级规则
2. **Sub-agent 停止 ≠ 任务完成** — 必须实际验证
3. **超时是常态** — agent 容易 timeout，发现中断立刻恢复
4. **主动闭环** — 任务全程自驱，不等主人追问
5. **每次心跳都要读 active-tasks.json + subagents list + gh issue list**
6. **🔴 Take Action, Not Report** — 发现问题直接修，修完汇报结果。禁止"需要关注""建议主 session 检查"等措辞，那是把问题甩给 chenxi
7. **agent 完成或停止 + 还有 open issue → 自动拉新 agent 继续，7×24 生效，不分早晚**

## active-tasks.json 格式

```json
[
  {
    "id": "task-YYYYMMDD-NNN",
    "description": "任务描述",
    "status": "running|pending|done|failed",
    "subAgentLabel": "label",
    "lastChecked": "ISO时间",
    "lastProgress": "进展描述",
    "retryCount": 0
  }
]
```
