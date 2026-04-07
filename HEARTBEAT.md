# HEARTBEAT.md

## 巡检流程（每次心跳严格按顺序执行）

### Step 1: 读取任务清单
- 读取 `memory/active-tasks.json`，获取所有活跃任务
- 如果文件不存在或为空 → 跳到 Step 4

### Step 2: Sub-Agent 状态检查
- `subagents list` 获取所有 sub-agent 状态
- 逐个对照 active-tasks.json 中记录的 sub-agent：
  - **running** → 正常，记录运行时长，超过 30 分钟的标记为疑似卡死
  - **completed/exited** → **不代表任务完成！** 必须验证任务实际完成状态（Step 3）
  - **failed/timeout** → 分析原因，重新 spawn 继续未完成的工作
  - **找不到对应 agent** → 可能已被回收，视为中断，需要恢复

### Step 3: 任务完成状态验证（核心！）
- 对每个标记为 "sub-agent 已停止" 的任务：
  - 查看 sub-agent 的 history/输出，确认做到了哪一步
  - 实际验证产出物（SSH 检查文件/服务/构建结果等）
  - 如果任务确实完成 → 更新 active-tasks.json 状态为 done，通知主人
  - 如果任务未完成 → spawn 新 sub-agent 继续，从断点恢复
  - 如果任务出错 → 修复问题后重试

### Step 4: 其他定期检查
- GitHub Issue 监控（chenxibj/ai-hardware-verification-platform）
- 关注新关闭的 issue，有关闭的去开发环境验收

### Step 5: 汇报（仅在有值得汇报的内容时）
- 有任务进展/完成/异常 → 飞书通知主人
- 一切正常无变化 → HEARTBEAT_OK，不打扰

---

## active-tasks.json 格式

```json
[
  {
    "id": "task-20260407-001",
    "description": "任务简述",
    "created": "2026-04-07T22:00:00+08:00",
    "status": "running|blocked|done|failed",
    "subAgentLabel": "对应的 sub-agent label",
    "subAgentSessionKey": "session key",
    "lastChecked": "上次巡检时间",
    "lastProgress": "上次检查时的进展描述",
    "retryCount": 0,
    "notes": "备注"
  }
]
```

## 关键原则

1. **Sub-agent 停止 ≠ 任务完成** — 必须实际验证产出物
2. **超时是常态** — agent 容易 timeout，发现中断就恢复，不要等主人来问
3. **主动闭环** — 任务从接收→执行→验证→完成，全程自驱动
4. **别让主人追进度** — 自己追踪自己，有结果主动汇报
