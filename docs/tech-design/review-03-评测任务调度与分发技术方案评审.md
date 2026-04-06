# 技术方案评审：评测任务调度与分发

> 评审人：麦克雷 | 日期：2026-04-06 | 评审对象：`03-评测任务调度与分发技术方案.md` v1.0

## 评审结论

| 类别 | 数量 | 处理建议 |
|------|------|----------|
| 🔴 必须修改 | 3 | 断链修复、任务超时、并发安全 — 不解决会导致任务卡死 |
| 🟡 建议优化 | 4 | 日志实时性是明确要求，优先级最高 |
| 💡 小建议 | 3 | 可以迭代 |

**核心风险：可靠性。** 链式分发模型优雅但脆弱，任何一环断了整条链就死了。加上断链修复器 + 任务超时两个兜底机制，就能从"晴天能跑"变成"下雨也能跑"。

---

## ✅ 做得好的部分

1. **链式分发选型正确** — Agent 单任务串行，用链式而非并行，逻辑自洽
2. **时序图画得很清楚** — 从用户点击到报告生成，完整链路一目了然
3. **错误处理有分类** — 不同失败场景有不同处理策略，不是一刀切
4. **暂停/取消语义合理** — 暂停不杀执行中任务，取消不清理 PENDING，行为明确

---

## 🔴 必须修改（3 项）

### 1. 链式分发的单点故障：回调丢失 = 整条链断裂

**问题：** 链式模型依赖 Agent 回调来触发下一个任务。如果回调丢失（Agent 崩溃、网络闪断、后端重启），整条链永远卡住，所有后续 PENDING 任务都不会被分发。

**必须加兜底机制：**
- 后端定时扫描（每 60 秒）：如果 Plan 是 RUNNING 状态，但没有任何 task 是 RUNNING 状态，且还有 PENDING 任务 → 自动触发 `dispatchNextTask`
- 这就是一个"断链修复器"，成本很低但能救命
- 建议作为 `@Scheduled` 实现，和心跳离线检测放一起

**伪代码：**
```java
@Scheduled(fixedRate = 60000) // 每 60 秒
public void repairBrokenChains() {
    List<Plan> runningPlans = planRepo.findByStatus(RUNNING);
    for (Plan plan : runningPlans) {
        long runningTasks = taskRepo.countByPlanIdAndStatus(plan.getId(), RUNNING);
        long pendingTasks = taskRepo.countByPlanIdAndStatus(plan.getId(), PENDING);
        if (runningTasks == 0 && pendingTasks > 0) {
            log.warn("断链检测：Plan {} 无 RUNNING 任务但有 {} 个 PENDING，触发修复", plan.getId(), pendingTasks);
            taskDispatcher.dispatchNextTask(plan.getId());
        }
    }
}
```

### 2. 缺少任务级超时

**问题：** Agent 侧有 600s 超时，但后端侧没有超时机制。如果 Agent 接受了任务但既不回调成功也不回调失败（比如进程被 OOM kill），后端认为任务一直在 RUNNING，链永远不往下走。

**必须加：**
- 后端对每个 RUNNING 任务记录 `dispatchedAt` 时间戳
- 定时扫描：RUNNING 超过 N 分钟（建议 15 分钟）未收到回调 → 标记 FAILED + 触发下一个分发
- 可以和上面的"断链修复器"合并成一个 `@Scheduled` 任务

**补充伪代码（合并到 repairBrokenChains）：**
```java
// 在同一个 @Scheduled 中
List<Task> stuckTasks = taskRepo.findByStatusAndDispatchedBefore(
    RUNNING, Instant.now().minus(15, ChronoUnit.MINUTES));
for (Task task : stuckTasks) {
    log.error("任务超时：Task {} 已 RUNNING 超过 15 分钟，标记 FAILED", task.getId());
    task.setStatus(FAILED);
    task.setErrorMessage("执行超时：Agent 未在 15 分钟内回报结果");
    taskRepo.save(task);
    taskDispatcher.dispatchNextTask(task.getPlanId());
}
```

### 3. 并发安全问题

**问题：** `completeTask()` 里做了三件事：更新 task 状态 → 更新 plan 进度 → 分发下一个任务。如果两个回调几乎同时到达（网络重试、Agent bug 都可能触发），可能出现：
- 重复分发同一个 PENDING 任务
- Plan 进度计算错误

**解决方案（二选一）：**

**方案 A：乐观锁**
```java
// Task 实体加 @Version
@Version
private Long version;

// dispatchNextTask 中：
Task nextTask = taskRepo.findFirstByPlanIdAndStatusOrderByIdAsc(planId, PENDING);
if (nextTask != null) {
    nextTask.setStatus(RUNNING);
    try {
        taskRepo.save(nextTask); // 乐观锁冲突会抛异常
    } catch (OptimisticLockException e) {
        log.info("并发分发冲突，已有其他线程处理");
        return;
    }
}
```

**方案 B：SELECT FOR UPDATE**
```java
@Transactional
public void dispatchNextTask(Long planId) {
    Task nextTask = taskRepo.findFirstPendingForUpdate(planId); // SQL: SELECT ... FOR UPDATE
    if (nextTask == null) return;
    nextTask.setStatus(RUNNING);
    // ... 发送到 Agent
}
```

推荐方案 A（乐观锁），更轻量，不会造成死锁。

---

## 🟡 建议优化（4 项）

### 4. Agent 返回 409 时"等 5 秒重试一次"太简陋

409 说明 Agent 正忙，5 秒后大概率还在忙。更好的做法：
- 409 时不重试，直接不分发，等当前执行中的任务回调时再自然触发下一轮
- 因为链式模型本身就保证了"上一个完成才分发下一个"，409 理论上不应该出现
- 如果真出现了，说明有 bug（比如重复分发），应该**告警**而不是重试

### 5. 日志"完成后一次性上报"体验差（⚠️ 明确需求）

明确要求：**正在运行的任务可以随时看到日志刷新**。当前方案的"后续规划 WebSocket/SSE"不能拖。

**建议折中方案（HTTP 轮询，不需要 WebSocket）：**

Agent 侧：
```python
# 执行期间每 10 秒把 stdout 增量 POST 到平台
def stream_logs(task_id, process):
    while process.poll() is None:
        new_output = process.stdout.read()
        if new_output:
            requests.post(f"{PLATFORM_URL}/api/tasks/{task_id}/logs/append",
                         json={"content": new_output})
        time.sleep(10)
```

平台侧：
- 新增 `POST /api/tasks/{id}/logs/append` — 追加日志
- 已有 `GET /api/tasks/{id}/logs` — 前端轮询（和进度轮询复用同一个定时器）

### 6. 取消操作不够彻底

> 取消 (cancel)：正在执行的任务继续完成

从用户视角，取消了但任务还在跑，而且结果还会回调更新进度，容易困惑。

**建议：**
- 取消时向 Agent 发一个 `POST /cancel` 请求（Agent 侧 kill subprocess）
- 如果 Agent 暂不支持取消，至少后端收到回调时检查 Plan 状态，如果已 CANCELLED 则**丢弃结果不更新进度**

### 7. Docker 内网 IP 替换逻辑是坑

> 如果是 Docker 内网 IP (172.x / 10.x) → 替换为 localhost

这个硬编码会在非 Docker 环境或多节点环境下出问题。10.x 可能就是真实的内网 IP（比如公司内网）。

**建议：**
- 去掉这个 magic 替换逻辑
- Agent 注册时直接上报**可达的 IP**（或在 config.yaml 里指定外部可达地址 `advertise_address`）
- 让部署配置决定 Agent 的可达地址，而不是代码猜

---

## 💡 小建议（3 项）

8. **分发请求里 `params` 和 `config` 字段内容重复** — 文档里的例子两者一模一样，应该说明区别或合并成一个字段
9. **实施步骤缺少测试用例** — 建议加上验证 checklist：
   - [ ] 正常链式分发（3+ 任务自动串行完成）
   - [ ] 断链恢复（手动 kill Agent 进程，60 秒后自动恢复分发）
   - [ ] 任务超时（Agent 接受任务但不回调，15 分钟后自动标记失败并继续）
   - [ ] 暂停/恢复（暂停后无新分发，恢复后继续）
   - [ ] 取消（取消后不再分发，进度冻结）
   - [ ] 全部失败（所有任务都失败，Plan 正确标记完成）
10. **与 Agent 技术方案的接口对齐** — Agent 方案里 `/execute` 返回 200，本方案写的是 202 Accepted，需要统一（建议用 202，语义更准确：已接受异步处理）

---

## 修改优先级建议

| 优先级 | 项目 | 预估工作量 |
|--------|------|-----------|
| P0 | 断链修复器（@Scheduled） | 0.5 天 |
| P0 | 任务级超时（合并到同一个 Scheduled） | 含在上面 |
| P0 | 并发安全（乐观锁） | 0.5 天 |
| P1 | 日志实时推送（HTTP 轮询方案） | 1 天 |
| P1 | 取消操作完善 | 0.5 天 |
| P2 | 409 处理优化 | 0.5 天 |
| P2 | Docker IP 逻辑修复 | 0.5 天 |
| P2 | 接口对齐 + 字段去重 | 0.5 天 |

**建议先改 P0（1 天），再改 P1（1.5 天），P2 可以迭代。**
