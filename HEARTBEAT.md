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

### Step 2.5: 🔴 空闲日主动工作触发（不可跳过）

**条件判断：** 如果 Step 1 + Step 2 结果为"0 open issue + 无活跃 agent + active-tasks 为空"：

1. 检查最近 commit 日期，计算距今天数
2. **如果距今 ≥ 2 天（连续空闲）→ 必须从以下清单中选择至少 1 项执行：**
   - 🧪 全量 E2E 回归测试（每周至少跑 1 次）
   - 📝 Code review 最近 5 个 commit
   - 📊 测试覆盖率分析（识别未覆盖的模块）
   - 📄 设计文档 review / 补写
   - 🔍 PRD 对照检查（功能实现 vs PRD 描述差距）
   - 🧹 代码质量扫描（ESLint、死代码、TODO 清理）
3. **选择优先级：** E2E 回归 > Code review > 覆盖率分析 > 其余
4. 执行时 spawn sub-agent，按正常流程写 active-tasks.json

**🔴 这是为了解决"连续多天空闲但不主动找活"的问题（4/19-4/22 教训）。不是可选项。**

### Step 3: GitHub 变化检测
- 对比上次检查，有新关闭的 issue → 需要验收
- 有新创建的 issue → 记录

### Step 4: 系统健康检查
- 已由 `ahvp-health-check` cron 单独处理（每 15 分钟），此处跳过
- 除非 health-check 连续报错，才在此步介入

### Step 5: 飞书通知（有动作必须通知，无动作才静默）

**🔴 核心规则：巡检触发了任何动作或发现关键状态变化 → 必须通过飞书 DM 通知 chenxi**

使用 `message` tool 发送到飞书（当前 session 即飞书 DM，直接回复即可）。

**必须通知的情况（直接回复当前 session）：**
- ✅ spawn 了新 agent → "🚀 启动 fix-497-499 处理 #497 #499（节点离线回收 + GPU Slot 泄漏）"
- ✅ agent 超时/停止，已恢复 → "🔄 fix-496-497-499 超时，#496 已完成，重启 agent 继续 #497 #499"
- ✅ 任务完成 → "✅ #497 #499 修复完成并部署，开始处理 #500 #501"
- ✅ 发现新 issue → "📋 发现 3 个新 issue: #502 #503 #504，已排入队列"
- ✅ agent 连续失败 (retryCount >= 3) → "❌ fix-xxx 连续 3 次失败，需要人工介入：[原因]"
- ✅ 所有 issue 清零 → "🎉 所有 open issue 已处理完毕"

**静默（HEARTBEAT_OK）的情况：**
- agent 正常运行中，无状态变化
- 无新 issue，无任务完成
- 系统健康检查正常

**通知格式要求：**
- 简洁一行，带 emoji 前缀标识类型
- 包含 issue 编号 + 简要描述
- 不发系统运维消息（容器重启、SSH 恢复等）
- 不发过程细节，只发结论性动作

### Step 6: 清理
- **清理 done 状态超过 7 天的任务记录**（归档到当天 memory 日志）

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
9. **🔴 有动作必须通知** — spawn agent、agent 完成/失败/恢复、发现新 issue 等状态变化，必须在当前 session 发飞书通知 chenxi。只有完全无变化才 HEARTBEAT_OK

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
