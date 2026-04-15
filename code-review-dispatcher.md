# TaskDispatcher + TaskRecoveryScheduler 乐观锁 & 调度机制 Code Review

## 🔴 P0 问题

### 1. 乐观锁冲突根因：多线程并发写同一实体 + 无重试

**位置：** `TaskDispatcher.dispatchSingleTask()` 第 3 步

```java
// Step 2: "CAS 检查"— 但这不是真正的 CAS
taskRepository.save(task);  // ← 写一次
// Step 3: 再次 save 改 DISPATCHED
task.setStatus(DISPATCHED);
taskRepository.save(task);  // ← 版本已变，第二次写可能冲突
```

**问题：** 同一个 task 在一次 dispatch 流程中被 save 了 **两次**（step 2 的 "CAS 检查" + step 3 的状态更新）。两次 save 之间没有事务保护，如果调度器同时跑（60s 兜底 + 事件驱动），两个线程可能同时拿到同一个 QUEUED task。

**修复：** 
- 去掉 step 2 的冗余 save（它保存了一个没改状态的 task，白消耗一个 version）
- 整个 `dispatchSingleTask` 用 `@Transactional` 包裹
- 加 `@Lock(PESSIMISTIC_WRITE)` 在查询 QUEUED tasks 时

### 2. `pollTasks()` 中 `findAll().stream()` 全表扫描

**位置：** `ComputeNodeController.pollTasks()`

```java
List<EvaluationTask> dispatched = taskRepository.findAll().stream()  // 全表扫描！
        .filter(t -> t.getStatus() == DISPATCHED)
        .filter(t -> id.equals(t.getAssignedNodeId()))
        .limit(maxTasks)
        .collect(Collectors.toList());
```

**问题：** Agent 每次心跳（10s 一次）都触发一次 **全表扫描**。三个节点 = 每分钟 18 次全表查询。任务表增长后性能急剧下降。

**修复：** 加 Repository 方法 `findByStatusAndAssignedNodeId(DISPATCHED, nodeId)`

### 3. `tryDispatchNext()` 不加锁，兜底调度 + 事件驱动并发冲突

**位置：** `TaskRecoveryScheduler.retryQueuedIfPossible()` + 事件触发

每 60 秒兜底调度调用 `tryDispatchNext()`，而 task 完成/节点恢复等事件也会调用。两者并发时：
- 同一 QUEUED task 被两个线程同时看到
- 都尝试 save → 乐观锁冲突

**修复：**
- `tryDispatchNext()` 加 `synchronized` 或用 `ReentrantLock`
- 或者在 SQL 层面用 `SELECT ... FOR UPDATE SKIP LOCKED` 实现无冲突抢占

### 4. 芯片匹配用精确型号名 → 改为按 chipType (x86/GPU) 大类匹配

**位置：** `TaskDispatcher.chipModelMatches()` + `findAvailableNode()` 优先级 2

当前用 `contains` 做芯片名字符串匹配，`Intel Xeon 8269CY` vs `Intel Xeon Platinum 8269CY` 刚好能匹配，但不稳定。

chenxi 要求：**CPU 芯片不要按具体型号匹配，用 x86 大类**。

**修复：** 
- 芯片匹配逻辑改为：如果 chip.chipType == CPU，匹配任何 chipType == CPU 的节点
- 只有 GPU 才按具体型号匹配（因为 L40S 和 A100 性能差异大）
- 新增字段 `chip.architecture` (x86, ARM, GPU-NVIDIA, GPU-AMD) 备用

## 🟡 P1 问题

### 5. `recoverStaleRunningTasks()` 用 `updatedAt` 判断超时不准确

`updatedAt` 在任何字段更新时都会变（包括 progress 更新），但 Agent 报告 progress 时更新的是 `progress` 和 `lastHeartbeatAt`，不一定触发 `updatedAt`。应该用 `lastHeartbeatAt` 判断。

### 6. `cancelledTasks` 查询在 pollTasks 中也是全表扫描

```java
List<EvaluationTask> cancelledTasks = taskRepository.findByAssignedNodeId(id).stream()
        .filter(t -> t.getStatus() == CANCELLED)
```

应该改为 `findByAssignedNodeIdAndStatus(id, CANCELLED)`

### 7. `dispatchPlanTasks()` 标注 `@Async` 但没有 `@Transactional`

异步方法中逐个 save，如果中途失败会导致部分 dispatch。

### 8. GPU Slot 分配和 Task 状态更新不在同一个事务中

在 step 3 中，task 已经 save 为 DISPATCHED，然后才分配 GPU Slot。如果 Slot 分配失败（异常被 catch 了），task 状态是 DISPATCHED 但没有 GPU，Agent 拉到后会用错 GPU。

## 🔵 P2 优化建议

### 9. 定时器应该使用 `fixedDelay` 而非 `fixedRate`

`fixedRate=60000` 如果上一轮执行超过 60 秒，会立刻触发下一轮，加剧并发。用 `fixedDelay` 更安全。

### 10. 压测方案

```bash
# 1. 并发创建 50 个评测计划，每个 17 个任务 (850 任务)
# 2. 模拟 3 个节点同时 poll-tasks
# 3. 观察乐观锁冲突率 + 任务丢失/重复分发
# 4. 测量 poll-tasks 响应时间（目标 <100ms）
```

---

## 优化代码方案

### Phase 1: 核心修复（解决乐观锁 + 芯片匹配）

1. **芯片匹配改为 chipType 大类**
2. **`dispatchSingleTask()` 改为 `@Transactional` + 去掉冗余 save**
3. **`tryDispatchNext()` 加分布式/本地锁**
4. **`pollTasks()` 加索引查询替代 findAll**

### Phase 2: 性能优化

5. **全表扫描改为索引查询**
6. **fixedRate → fixedDelay**
7. **GPU Slot 与 Task 事务一致性**

### Phase 3: 压测验证

8. **写压测脚本，50 plan × 17 tasks = 850 并发**
9. **验证冲突率 < 1%，无任务丢失/重复**
