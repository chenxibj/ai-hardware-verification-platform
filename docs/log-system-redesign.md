# 日志系统重构方案 v2

> Issue: 日志滚屏展示内容过少 + 缺乏持久化存储模块
> Author: 菜菜子（产品经理）
> Date: 2026-04-08
> v2: 纳入麦克雷评审反馈（8项）

---

## 一、现状分析

### 当前架构问题

| 问题 | 现状 | 影响 |
|------|------|------|
| **监控页日志是模拟数据** | `PlanMonitor.js` 用 `LOG_TEMPLATES` + `setInterval(3s)` 生成随机假日志 | 用户看到的全是假数据，无法排障 |
| **日志面板高度固定** | `maxHeight: 320px`，约 12-15 行可视 | 内容过少，看不到完整上下文 |
| **两套日志表并存** | `eval_logs`（0条）+ `task_logs`（94条），字段不统一 | 数据分散，前端不知该读哪个 |
| **无 WebSocket 实际对接** | 后端有 WebSocket handler，但前端监控页没对接，仍用 polling + 模拟 | 实时性差 |
| **日志无分卷/归档** | 全部存 PostgreSQL，无 TTL/分区/压缩 | 数据量大时查询变慢（当前量级无压力） |
| **Agent 上报粒度粗** | 每个任务只有 3 条日志（start / metric / complete） | 过程信息缺失，无法追踪执行细节 |

### 数据流现状

```
Agent 执行评测
  └─→ POST /tasks/{id}/logs/append  (每10s一次，实际只发3条)
       └─→ task_logs 表

前端 PlanMonitor
  └─→ GET /plans/{id}/tasks (10s 轮询)
       └─→ 状态变更日志（真实）
  └─→ setInterval 3s 生成模拟日志（假的!）
       └─→ 内存 logs state（最多200条，显示区域320px）

前端 Logs 页面
  └─→ GET /eval-logs（读 eval_logs 表 → 0条）
```

---

## 二、重构目标

1. **日志内容真实且丰富** — 消除所有模拟数据，Agent 上报详细执行过程
2. **展示空间充足** — 日志面板可调节高度，支持全屏查看
3. **持久化可靠** — 统一存储，支持大量日志（归档暂不实现，预留设计）
4. **实时推送** — WebSocket 实时日志流，含断连重连策略

---

## 三、重构方案

### 3.1 统一日志模型

**合并 `eval_logs` + `task_logs` 为统一的 `task_logs` 表**（保留 task_logs，废弃 eval_logs）

```sql
-- task_logs 表补充字段
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS plan_id BIGINT;
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS node_id VARCHAR(100);

-- ✅ 修复评审反馈 #4：sequence 必须自增，不能 DEFAULT 0
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS sequence BIGINT GENERATED ALWAYS AS IDENTITY;

-- 添加索引优化查询
CREATE INDEX IF NOT EXISTS idx_task_logs_plan_id ON task_logs(plan_id);
CREATE INDEX IF NOT EXISTS idx_task_logs_task_id_seq ON task_logs(task_id, sequence);
CREATE INDEX IF NOT EXISTS idx_task_logs_created_at ON task_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_task_logs_level ON task_logs(level);
```

**日志类型规范：**

| log_type | 说明 | 示例 |
|----------|------|------|
| `SYSTEM` | 平台生成的状态日志 | 任务分发、状态变更、超时 |
| `AGENT` | Agent 框架日志 | 环境初始化、依赖加载、脚本启动 |
| `EVAL` | 评测执行过程日志 | 前向传播 iteration、batch 进度、checkpoint |
| `METRIC` | 性能指标数据 | latency/throughput/memory 原始数据点 |
| `ERROR` | 错误和异常 | 脚本异常、OOM、超时 |

### 3.2 Agent 日志上报增强（⚠️ Phase 1，优先实施）

> **评审反馈 #1 采纳：** Agent 上报增强必须先于前端改造，否则删掉模拟数据后面板只有 3 行真实日志，体验更差。

**改进方案：**

```python
# agent/log_reporter.py

class LogReporter:
    """评测执行过程中的实时日志上报器"""
    
    def __init__(self, task_id, platform_url, token):
        self.task_id = task_id
        self.platform_url = platform_url
        self.token = token
        self.buffer = []
        self.flush_interval = 2  # 每2秒刷一次
        self.batch_id_counter = 0
        
    def __enter__(self):
        """✅ 评审反馈 #5：支持 with 语句确保退出时 flush"""
        return self
    
    def __exit__(self, *args):
        self.flush()
        
    def log(self, level, message, log_type="EVAL", metrics=None):
        entry = {
            "level": level,
            "message": message,
            "logType": log_type,
            "timestamp": datetime.now().isoformat(),
            "metrics": metrics
        }
        self.buffer.append(entry)
        if len(self.buffer) >= 10:
            self.flush()
    
    def flush(self):
        """✅ 评审反馈 #2：批量上报带 batchId 实现幂等"""
        if not self.buffer:
            return
        self.batch_id_counter += 1
        batch_id = f"{self.task_id}-{self.batch_id_counter}-{uuid4().hex[:8]}"
        try:
            requests.post(
                f"{self.platform_url}/tasks/{self.task_id}/logs/batch",
                json={"batchId": batch_id, "logs": self.buffer},
                headers={"Authorization": f"Bearer {self.token}"},
                timeout=5
            )
        except Exception:
            pass  # 下次重试会带新 batchId
        self.buffer.clear()
```

**评测脚本中增加的日志点（每个任务 20-50 条）：**

```python
with LogReporter(task_id, platform_url, token) as logger:
    logger.log("INFO", f"开始评测: {operator_name}, batch_size={batch_size}", "EVAL")
    logger.log("INFO", f"加载测试数据: shape={input_shape}", "EVAL")
    logger.log("INFO", f"Warmup: {warmup_iters} iterations 完成, 耗时 {warmup_time:.2f}s", "EVAL")
    for i in range(iterations):
        # ... 评测逻辑 ...
        if i % 10 == 0:  # 每10轮报一次
            logger.log("INFO", f"评测进度: {i}/{iterations}, 当前延迟={lat:.3f}ms", "EVAL")
    logger.log("INFO", f"单项完成: latency_mean={mean:.3f}ms, throughput={qps:.1f} QPS", "METRIC")
    logger.log("INFO", f"内存占用: {mem_mb:.1f}MB, CPU: {cpu_pct:.1f}%", "METRIC")
    logger.log("INFO", f"精度验证: MSE={mse:.6f}, cosine_sim={cosine:.6f}, 判定={verdict}", "EVAL")
    # with 退出时自动 flush 剩余日志
```

### 3.3 后端日志 API 重构

#### 3.3.1 批量日志写入接口（含幂等）

```java
// POST /tasks/{taskId}/logs/batch
@PostMapping("/{taskId}/logs/batch")
public ResponseEntity<?> batchAppendLogs(
    @PathVariable Long taskId,
    @RequestBody BatchLogRequest request) {
    
    // ✅ 评审反馈 #2：batchId 幂等检查
    if (request.getBatchId() != null && batchIdCache.contains(request.getBatchId())) {
        return ResponseEntity.ok(Map.of("code", 0, "message", "duplicate batch, skipped"));
    }
    
    List<TaskLog> entities = request.getLogs().stream()
        .map(entry -> {
            TaskLog log = new TaskLog();
            log.setTaskId(taskId);
            log.setPlanId(getPlanIdByTaskId(taskId));
            log.setLevel(entry.getLevel());
            log.setMessage(entry.getMessage());
            log.setLogType(entry.getLogType());
            log.setMetrics(entry.getMetrics());
            log.setSource("agent");
            return log;
        })
        .toList();
    
    taskLogRepository.saveAll(entities);
    
    if (request.getBatchId() != null) {
        batchIdCache.add(request.getBatchId());  // Caffeine cache, TTL=10min
    }
    
    // 推送到 WebSocket
    webSocketHandler.broadcast(taskId, entities);
    
    return ResponseEntity.ok(Map.of("code", 0, "saved", entities.size()));
}
```

#### 3.3.2 日志查询接口（支持 sinceSequence 断点续传）

```java
// GET /tasks/{taskId}/logs?page=0&size=100&level=ERROR&sinceSequence=xxx
@GetMapping("/{taskId}/logs")
public ResponseEntity<?> getTaskLogs(
    @PathVariable Long taskId,
    @RequestParam(defaultValue = "0") int page,
    @RequestParam(defaultValue = "100") int size,
    @RequestParam(required = false) String level,
    @RequestParam(required = false) String logType,
    @RequestParam(required = false) Long sinceSequence) {
    
    // sinceSequence: 断连重连后只拉新日志
    Page<TaskLog> logs = taskLogRepository.findFiltered(
        taskId, level, logType, sinceSequence, PageRequest.of(page, size));
    
    return ResponseEntity.ok(Map.of(
        "code", 0,
        "data", logs.getContent(),
        "total", logs.getTotalElements(),
        "hasMore", logs.hasNext()
    ));
}

// GET /plans/{planId}/logs — 整个 Plan 下所有任务的日志
@GetMapping("/plans/{planId}/logs")
public ResponseEntity<?> getPlanLogs(
    @PathVariable Long planId,
    @RequestParam(defaultValue = "0") int page,
    @RequestParam(defaultValue = "200") int size,
    @RequestParam(required = false) String level) {
    
    Page<TaskLog> logs = taskLogRepository.findByPlanId(planId, level, PageRequest.of(page, size));
    return ResponseEntity.ok(Map.of("code", 0, "data", logs.getContent(), "total", logs.getTotalElements()));
}
```

### 3.4 WebSocket 实时推送（含断连重连）

#### 3.4.1 后端 WebSocket Handler

```java
@Component
public class TaskLogWebSocketHandler extends TextWebSocketHandler {
    
    // ws://host/api/ws/logs?planId=123 或 ws://host/api/ws/logs?taskId=456
    
    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        JsonNode node = objectMapper.readTree(message.getPayload());
        String action = node.get("action").asText();
        if ("subscribe".equals(action)) {
            Long planId = node.has("planId") ? node.get("planId").asLong() : null;
            Long taskId = node.has("taskId") ? node.get("taskId").asLong() : null;
            subscriptions.put(session.getId(), new Subscription(planId, taskId));
        }
    }
    
    public void broadcast(Long taskId, List<TaskLog> logs) {
        subscriptions.forEach((sessionId, sub) -> {
            if (sub.matches(taskId)) {
                sendToSession(sessionId, logs);
            }
        });
    }
}
```

#### 3.4.2 前端 WebSocket 连接（含重连策略）

```jsx
// ✅ 评审反馈 #3：指数退避重连 + sinceSequence 补日志 + 状态指示器

function useLogWebSocket(planId, onLogs) {
  const [wsStatus, setWsStatus] = useState("connecting"); // connected | reconnecting | disconnected
  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const lastSequenceRef = useRef(0);

  const connect = useCallback(() => {
    const ws = new WebSocket(`ws://${window.location.host}/api/ws/logs?planId=${planId}`);
    
    ws.onopen = () => {
      setWsStatus("connected");
      retryRef.current = 0;
      // 订阅 + 补日志
      ws.send(JSON.stringify({ 
        action: "subscribe", 
        planId,
        sinceSequence: lastSequenceRef.current 
      }));
    };
    
    ws.onmessage = (event) => {
      const logs = JSON.parse(event.data);
      if (logs.length > 0) {
        lastSequenceRef.current = Math.max(...logs.map(l => l.sequence));
      }
      onLogs(logs);
    };
    
    ws.onclose = () => {
      setWsStatus("reconnecting");
      // 指数退避: 1s → 2s → 4s → ... → max 30s
      const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30000);
      retryRef.current++;
      setTimeout(connect, delay);
      
      // 超过 30s 降级到 HTTP 轮询
      if (delay >= 30000) {
        setWsStatus("disconnected");
        startHttpPolling();
      }
    };
    
    wsRef.current = ws;
  }, [planId]);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);

  return wsStatus;
}
```

### 3.5 前端日志面板重构（Phase 2）

```jsx
const LogPanel = ({ planId, tasks }) => {
  const [logs, setLogs] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef(null);
  const logEndRef = useRef(null);
  
  // ✅ 评审反馈 #7：内存上限 2000 条
  const MAX_LOGS_IN_MEMORY = 2000;
  const [hasOlderLogs, setHasOlderLogs] = useState(false);

  // 加载历史日志
  useEffect(() => {
    api.get(`/plans/${planId}/logs`, { params: { size: 500 } })
      .then(resp => {
        if (resp.data.code === 0) {
          setLogs(resp.data.data);
          setHasOlderLogs(resp.data.total > 500);
        }
      });
  }, [planId]);

  // WebSocket 实时日志（含状态指示器）
  const wsStatus = useLogWebSocket(planId, (newLogs) => {
    setLogs(prev => {
      const combined = [...prev, ...newLogs];
      // 超过上限时移除最旧的
      if (combined.length > MAX_LOGS_IN_MEMORY) {
        setHasOlderLogs(true);
        return combined.slice(-MAX_LOGS_IN_MEMORY);
      }
      return combined;
    });
  });

  // 面板高度：默认 600px，全屏时占满
  const panelHeight = expanded ? "calc(100vh - 120px)" : "600px";

  return (
    <Card 
      title={<><CodeOutlined /> 执行日志 <Tag>{logs.length} 条</Tag>
        {/* 连接状态指示器 */}
        <Badge status={wsStatus === "connected" ? "success" : wsStatus === "reconnecting" ? "warning" : "error"} 
               text={wsStatus === "connected" ? "实时" : wsStatus === "reconnecting" ? "重连中" : "离线"} />
      </>}
      extra={<Space>
        <Select defaultValue="ALL" style={{ width: 100 }} options={[
          { value: "ALL", label: "全部级别" }, { value: "ERROR", label: "ERROR" },
          { value: "WARN", label: "WARN" }, { value: "INFO", label: "INFO" },
        ]} />
        <Select defaultValue="ALL" style={{ width: 120 }} options={[
          { value: "ALL", label: "全部类型" }, { value: "SYSTEM", label: "系统" },
          { value: "EVAL", label: "评测" }, { value: "METRIC", label: "指标" },
        ]} />
        <Button onClick={() => setExpanded(!expanded)}>{expanded ? "收起" : "全屏"}</Button>
        <Button onClick={() => setAutoScroll(true)}>滚动到底</Button>
        <Button>导出</Button>
      </Space>}>
      
      {hasOlderLogs && <Button type="link" onClick={loadOlderLogs}>加载更早日志</Button>}
      
      <div ref={containerRef} style={{
        height: panelHeight, overflowY: "auto",
        background: "#1a1a2e", padding: "12px 16px",
        fontFamily: "'JetBrains Mono', monospace", fontSize: 13, lineHeight: 1.6,
      }}>
        {/* TODO: 集成 react-window 虚拟滚动 */}
        {logs.map((log, i) => <LogLine key={log.sequence || i} log={log} />)}
        <div ref={logEndRef} />
      </div>
    </Card>
  );
};
```

### 3.6 全局日志中心（Logs 页面）

> **评审反馈 #8 采纳：** 补充具体设计，不再只是占位符。

**API 设计：**

```
GET /logs/global?page=0&size=100&planId=&taskId=&level=&logType=&search=&startTime=&endTime=
```

从 `task_logs` 表查询（废弃 eval_logs），支持全字段过滤。

**页面布局：**

```
┌──────────────────────────────────────────────────┐
│ 📊 日志总览                                       │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │
│ │ 总日志  │ │ ERROR  │ │ WARN   │ │ 今日新增 │     │
│ │  1,234  │ │   23   │ │   56   │ │   89   │     │
│ └────────┘ └────────┘ └────────┘ └────────┘     │
├──────────────────────────────────────────────────┤
│ 🔍 过滤器                                        │
│ [评测任务▼] [日志级别▼] [日志类型▼] [时间范围▼] [搜索...]  │
├──────────────────────────────────────────────────┤
│ 📋 日志列表（Table，无限滚动分页）                    │
│ 时间 | 级别 | 类型 | 任务 | 消息                    │
│ ─────────────────────────────────────            │
│ 09:15:23 | INFO  | EVAL   | T-5654 | 开始评测...  │
│ 09:15:24 | INFO  | EVAL   | T-5654 | Warmup...   │
│ 09:15:25 | INFO  | METRIC | T-5654 | latency=... │
│ ...                                              │
│ [加载更多]                                        │
└──────────────────────────────────────────────────┘
```

**交互流程：**
1. 进入页面 → 加载最近 100 条日志 + 统计数据
2. 选择过滤条件 → 重新查询
3. 滚动到底部 → 自动加载下一页（无限滚动）
4. 点击日志行 → 展开详情（details JSON、关联任务链接）
5. 搜索 → PostgreSQL `ILIKE` 全文匹配

---

## 四、实施计划（已按评审反馈调整顺序）

### Phase 1：Agent 日志上报增强（1-2天）
> 原 Phase 2，按评审反馈 #1 提前

- [ ] 实现 `LogReporter` 类（with 语句 + batchId 幂等 + flush 边界处理）
- [ ] 评测脚本增加过程日志点（warmup/iteration/checkpoint/metric/完成）
- [ ] 后端 `/tasks/{id}/logs/batch` 批量写入接口（含 batchId 幂等检查）
- [ ] DB: task_logs 加 `sequence GENERATED ALWAYS AS IDENTITY` + 索引
- [ ] 预计每个任务从 3 条日志增加到 20-50 条

### Phase 2：前端展示改造（1-2天）
> 原 Phase 1，Agent 上报就绪后再改

- [ ] PlanMonitor 删除 LOG_TEMPLATES 和模拟日志
- [ ] 日志面板高度 320px → 600px + 全屏切换
- [ ] 对接 `GET /plans/{planId}/logs` 真实 API
- [ ] 内存上限 2000 条 + "加载更早日志"按钮
- [ ] WebSocket 就绪前先用 10s HTTP 轮询过渡

### Phase 3：WebSocket 实时推送（1天）
- [ ] 后端日志 WebSocket handler（订阅 planId/taskId）
- [ ] 前端 WebSocket 连接 + 指数退避重连（1s→2s→4s→...→30s）
- [ ] 重连后 sinceSequence 补拉遗漏日志
- [ ] UI 连接状态指示器（绿=已连接/黄=重连中/红=离线）
- [ ] 断连超 30s 自动 fallback 到 HTTP 轮询

### Phase 4：全局日志中心（1天）
- [ ] 废弃 eval_logs 表，Logs 页面切换到 task_logs
- [ ] 实现 `/logs/global` 全局查询 API
- [ ] 页面重构：统计卡片 + 多维过滤 + 无限滚动 + 行展开详情

### 归档（暂不实施，预留设计）
> 评审反馈 #6 采纳：当前数据量（日 300 条）不需要归档，100 万条时再启用

---

## 五、数据量评估

| 场景 | 日志量/天 | 30天存储 |
|------|-----------|----------|
| 当前（3条/任务，10任务/天） | ~30 条 | < 1MB |
| 改进后（30条/任务，10任务/天） | ~300 条 | ~5MB |
| 满负载（50条/任务，100任务/天） | ~5000 条 | ~100MB |

PostgreSQL 单表百万级无压力。分区和归档预留设计，数据量达 100万+ 时启用。

---

## 六、评审反馈处理记录

| # | 反馈 | 处理 | 落实位置 |
|---|------|------|----------|
| 🔴1 | Phase 顺序互换 | ✅ 采纳 | Phase 1↔Phase 2 已互换 |
| 🔴2 | 批量上报幂等 | ✅ 采纳 | 3.2 LogReporter + 3.3.1 batch API |
| 🔴3 | WS 断连重连 | ✅ 采纳 | 3.4.2 useLogWebSocket |
| 🔴4 | sequence 自增 | ✅ 采纳 | 3.1 DDL 改为 GENERATED ALWAYS AS IDENTITY |
| 🟡5 | flush 边界 | ✅ 采纳 | 3.2 LogReporter __enter__/__exit__ |
| 🟡6 | 归档暂缓 | ✅ 采纳 | Phase 4 改为"暂不实施" |
| 🟡7 | 前端内存上限 | ✅ 采纳 | 3.5 MAX_LOGS_IN_MEMORY = 2000 |
| 🟡8 | 全局日志中心 | ✅ 采纳 | 3.6 补充完整设计 |
