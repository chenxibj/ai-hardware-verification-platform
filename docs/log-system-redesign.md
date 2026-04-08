# 日志系统重构方案

> Issue: 日志滚屏展示内容过少 + 缺乏持久化存储模块
> Author: 菜菜子（产品经理）
> Date: 2026-04-08

---

## 一、现状分析

### 当前架构问题

| 问题 | 现状 | 影响 |
|------|------|------|
| **监控页日志是模拟数据** | `PlanMonitor.js` 用 `LOG_TEMPLATES` + `setInterval(3s)` 生成随机假日志 | 用户看到的全是假数据，无法排障 |
| **日志面板高度固定** | `maxHeight: 320px`，约 12-15 行可视 | 内容过少，看不到完整上下文 |
| **两套日志表并存** | `eval_logs`（0条）+ `task_logs`（94条），字段不统一 | 数据分散，前端不知该读哪个 |
| **无 WebSocket 实际对接** | 后端有 WebSocket handler，但前端监控页没对接，仍用 polling + 模拟 | 实时性差 |
| **日志无分卷/归档** | 全部存 PostgreSQL，无 TTL/分区/压缩 | 数据量大时查询变慢 |
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
3. **持久化可靠** — 统一存储、自动归档、支持大量日志
4. **实时推送** — WebSocket 实时日志流，取代轮询 + 模拟

---

## 三、重构方案

### 3.1 统一日志模型

**合并 `eval_logs` + `task_logs` 为统一的 `task_logs` 表**（保留 task_logs，废弃 eval_logs）

```sql
-- task_logs 表（已有，补充字段）
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS plan_id BIGINT;
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS node_id VARCHAR(100);
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS sequence BIGINT DEFAULT 0;  -- 全局递增序号，用于排序和断点续传

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

### 3.2 Agent 日志上报增强

**现状问题：** Agent 每个任务只上报 3 条日志（start/metric/complete），过程信息为零。

**改进方案：**

```python
# agent/eval_runner.py — 增加过程日志上报

class LogReporter:
    """评测执行过程中的实时日志上报器"""
    
    def __init__(self, task_id, platform_url, token):
        self.task_id = task_id
        self.buffer = []
        self.flush_interval = 2  # 每2秒刷一次
        
    def log(self, level, message, log_type="EVAL", metrics=None):
        """记录一条日志"""
        entry = {
            "level": level,
            "message": message,
            "logType": log_type,
            "timestamp": datetime.now().isoformat(),
            "metrics": metrics
        }
        self.buffer.append(entry)
        if len(self.buffer) >= 10:  # 攒够10条批量发送
            self.flush()
    
    def flush(self):
        """批量上报日志"""
        if not self.buffer:
            return
        requests.post(
            f"{self.platform_url}/tasks/{self.task_id}/logs/batch",
            json={"logs": self.buffer},
            headers={"Authorization": f"Bearer {self.token}"}
        )
        self.buffer.clear()
```

**评测脚本中增加的日志点：**

```python
# 每个评测脚本需要输出的关键日志
logger.log("INFO", f"开始评测: {operator_name}, batch_size={batch_size}", "EVAL")
logger.log("INFO", f"加载测试数据: shape={input_shape}", "EVAL")
logger.log("INFO", f"Warmup: {warmup_iters} iterations 完成, 耗时 {warmup_time:.2f}s", "EVAL")
logger.log("INFO", f"正式评测: iteration {i}/{total}, latency={lat:.3f}ms", "EVAL")
logger.log("INFO", f"单项完成: latency_mean={mean:.3f}ms, throughput={qps:.1f} QPS", "METRIC")
logger.log("INFO", f"内存占用: {mem_mb:.1f}MB, CPU: {cpu_pct:.1f}%", "METRIC")
logger.log("INFO", f"精度验证: MSE={mse:.6f}, cosine_sim={cosine:.6f}, 判定={verdict}", "EVAL")
```

### 3.3 后端日志 API 重构

#### 3.3.1 批量日志写入接口

```java
// POST /tasks/{taskId}/logs/batch
@PostMapping("/{taskId}/logs/batch")
public ResponseEntity<?> batchAppendLogs(
    @PathVariable Long taskId,
    @RequestBody BatchLogRequest request) {
    
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
    
    // 推送到 WebSocket
    webSocketHandler.broadcast(taskId, entities);
    
    return ResponseEntity.ok(Map.of("code", 0, "saved", entities.size()));
}
```

#### 3.3.2 日志分页查询接口

```java
// GET /tasks/{taskId}/logs?page=0&size=100&level=ERROR&logType=EVAL&since=sequence
@GetMapping("/{taskId}/logs")
public ResponseEntity<?> getTaskLogs(
    @PathVariable Long taskId,
    @RequestParam(defaultValue = "0") int page,
    @RequestParam(defaultValue = "100") int size,
    @RequestParam(required = false) String level,
    @RequestParam(required = false) String logType,
    @RequestParam(required = false) Long sinceSequence) {
    
    // 支持断点续传：客户端传上次最后的 sequence，只返回新日志
    Page<TaskLog> logs = taskLogRepository.findFiltered(
        taskId, level, logType, sinceSequence, PageRequest.of(page, size));
    
    return ResponseEntity.ok(Map.of(
        "code", 0,
        "data", logs.getContent(),
        "total", logs.getTotalElements(),
        "hasMore", logs.hasNext()
    ));
}

// GET /plans/{planId}/logs — 查看整个 Plan 下所有任务的日志
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

#### 3.3.3 WebSocket 实时推送

```java
// 复用现有 WebSocket handler，增加日志推送能力
@Component
public class TaskLogWebSocketHandler extends TextWebSocketHandler {
    
    // 客户端连接时指定监听的 planId 或 taskId
    // ws://host/api/ws/logs?planId=123 或 ws://host/api/ws/logs?taskId=456
    
    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        // 处理客户端订阅请求
        JsonNode node = objectMapper.readTree(message.getPayload());
        String action = node.get("action").asText();
        if ("subscribe".equals(action)) {
            Long planId = node.has("planId") ? node.get("planId").asLong() : null;
            Long taskId = node.has("taskId") ? node.get("taskId").asLong() : null;
            subscriptions.put(session.getId(), new Subscription(planId, taskId));
        }
    }
    
    // 当有新日志写入时，推送给订阅了该 task/plan 的客户端
    public void broadcast(Long taskId, List<TaskLog> logs) {
        subscriptions.forEach((sessionId, sub) -> {
            if (sub.matches(taskId)) {
                sendToSession(sessionId, logs);
            }
        });
    }
}
```

### 3.4 前端日志面板重构

#### 3.4.1 删除模拟日志，对接真实数据

```jsx
// PlanMonitor.js — 核心改动

// ❌ 删除: LOG_TEMPLATES, 模拟日志 useEffect
// ✅ 新增: WebSocket 连接 + REST 历史加载

const LogPanel = ({ planId, tasks }) => {
  const [logs, setLogs] = useState([]);
  const [expanded, setExpanded] = useState(false);  // 是否展开全屏
  const [autoScroll, setAutoScroll] = useState(true);
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const wsRef = useRef(null);
  const logEndRef = useRef(null);
  const containerRef = useRef(null);

  // 1. 加载历史日志
  useEffect(() => {
    api.get(`/plans/${planId}/logs`, { params: { size: 500 } })
      .then(resp => {
        if (resp.data.code === 0) setLogs(resp.data.data);
      });
  }, [planId]);

  // 2. WebSocket 实时日志
  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}/api/ws/logs?planId=${planId}`);
    ws.onmessage = (event) => {
      const newLogs = JSON.parse(event.data);
      setLogs(prev => [...prev, ...newLogs]);  // 不截断，保留所有日志
    };
    wsRef.current = ws;
    return () => ws.close();
  }, [planId]);

  // 3. 自动滚动到底部
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  // 4. 检测用户是否手动滚动（暂停自动滚动）
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(atBottom);
  };

  const filteredLogs = logs.filter(log => {
    if (levelFilter !== "ALL" && log.level !== levelFilter) return false;
    if (typeFilter !== "ALL" && log.logType !== typeFilter) return false;
    return true;
  });

  const panelHeight = expanded ? "calc(100vh - 120px)" : "600px";  // 默认600px，展开后全屏

  return (
    <Card 
      title={<><CodeOutlined /> 执行日志 <Tag>{logs.length} 条</Tag></>}
      extra={
        <Space>
          <Select value={levelFilter} onChange={setLevelFilter} style={{ width: 100 }}
            options={[
              { value: "ALL", label: "全部级别" },
              { value: "INFO", label: "INFO" },
              { value: "WARN", label: "WARN" },
              { value: "ERROR", label: "ERROR" },
            ]} />
          <Select value={typeFilter} onChange={setTypeFilter} style={{ width: 120 }}
            options={[
              { value: "ALL", label: "全部类型" },
              { value: "SYSTEM", label: "系统日志" },
              { value: "EVAL", label: "评测过程" },
              { value: "METRIC", label: "性能指标" },
              { value: "ERROR", label: "错误" },
            ]} />
          <Button onClick={() => setExpanded(!expanded)}>
            {expanded ? "收起" : "全屏"}
          </Button>
          <Button onClick={() => setAutoScroll(true)}>滚动到底</Button>
          <Button onClick={() => downloadLogs(planId)}>导出</Button>
        </Space>
      }>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          height: panelHeight,
          overflowY: "auto",
          background: "#1a1a2e",
          padding: "12px 16px",
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 13,
          lineHeight: 1.6,
          borderRadius: 8,
        }}>
        {filteredLogs.map((log, i) => (
          <LogLine key={log.id || i} log={log} />
        ))}
        <div ref={logEndRef} />
      </div>
    </Card>
  );
};

// 单行日志组件 — 根据类型差异化渲染
const LogLine = ({ log }) => {
  const levelColors = {
    INFO: "#61dafb", WARN: "#faad14", ERROR: "#ff4d4f", DEBUG: "#888",
  };
  const typeIcons = {
    SYSTEM: "⚙️", EVAL: "🔬", METRIC: "📊", ERROR: "❌", AGENT: "🤖",
  };
  
  return (
    <div style={{ color: levelColors[log.level] || "#d4d4d4", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
      <span style={{ color: "#666" }}>
        {dayjs(log.createdAt).format("HH:mm:ss.SSS")}
      </span>{" "}
      <span>{typeIcons[log.logType] || "📝"}</span>{" "}
      <span style={{ fontWeight: log.level === "ERROR" ? "bold" : "normal" }}>
        [{log.level}]
      </span>{" "}
      {log.taskId && <span style={{ color: "#888" }}>[T{log.taskId}]</span>}{" "}
      {log.message}
    </div>
  );
};
```

#### 3.4.2 关键 UI 改进

| 改进项 | 现状 | 方案 |
|--------|------|------|
| **可视高度** | 320px 固定 | 默认 600px + 全屏切换按钮 |
| **日志来源** | 模拟数据 | WebSocket 实时 + REST 历史 |
| **日志条数** | 最多 200 条内存 | 无限制，虚拟滚动（react-window） |
| **过滤能力** | 仅按任务/搜索 | 按级别 + 日志类型 + 任务 + 关键字 |
| **自动滚动** | 无 | 新日志自动滚底，手动滚停则暂停 |
| **字体** | 默认字体 | 等宽字体，仿终端风格 |
| **导出** | 仅 JSON | 支持 JSON + TXT + CSV |
| **日志类型标识** | 无 | emoji 图标区分 SYSTEM/EVAL/METRIC/ERROR |

### 3.5 日志持久化与归档

#### 3.5.1 分区策略

```sql
-- 按月分区（适合中等数据量，PostgreSQL 原生支持）
-- 当前阶段暂不需要，预留设计
CREATE TABLE task_logs_partitioned (
    LIKE task_logs INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- 每月自动创建分区（通过定时任务或 pg_partman 扩展）
CREATE TABLE task_logs_y2026m04 PARTITION OF task_logs_partitioned
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
```

#### 3.5.2 日志生命周期

| 阶段 | 时间范围 | 存储位置 | 说明 |
|------|----------|----------|------|
| **热数据** | 最近 30 天 | PostgreSQL task_logs | 随时查询，全功能 |
| **温数据** | 30-90 天 | PostgreSQL + 压缩 | 可查询，按需加载 |
| **冷数据** | 90 天+ | MinIO 对象存储 | 归档为 gzip JSON 文件，按需下载 |

#### 3.5.3 归档任务

```java
// @Scheduled 定时归档服务
@Scheduled(cron = "0 0 3 * * ?")  // 每天凌晨3点
public void archiveOldLogs() {
    Instant cutoff = Instant.now().minus(90, ChronoUnit.DAYS);
    
    // 1. 导出到 MinIO
    List<TaskLog> oldLogs = taskLogRepository.findByCreatedAtBefore(cutoff);
    String filename = "logs/archive-" + LocalDate.now() + ".json.gz";
    minioClient.putObject(PutObjectArgs.builder()
        .bucket("ahvp-logs")
        .object(filename)
        .stream(compressToGzip(oldLogs))
        .build());
    
    // 2. 删除已归档记录
    taskLogRepository.deleteByCreatedAtBefore(cutoff);
    
    log.info("归档 {} 条日志到 {}", oldLogs.size(), filename);
}
```

### 3.6 Logs 页面（全局日志中心）重构

```jsx
// Logs.js — 从 eval_logs 切换到 task_logs，增强功能

export default function Logs() {
  // 数据源改为 /tasks/logs/global（新接口，读 task_logs 表）
  // 新增功能：
  // 1. 按 Plan 分组查看
  // 2. 按时间范围筛选（今天/最近7天/自定义）
  // 3. 按日志类型筛选（SYSTEM/EVAL/METRIC/ERROR）
  // 4. 全文搜索（PostgreSQL full-text search）
  // 5. 日志趋势图（按小时统计各级别数量）
  // 6. 分页改为无限滚动
}
```

---

## 四、实施计划

### Phase 1：消除模拟数据 + 扩大显示区域（1-2天）
- [ ] PlanMonitor.js 删除 LOG_TEMPLATES 和模拟日志 useEffect
- [ ] 日志面板高度从 320px → 600px，增加全屏切换
- [ ] 前端对接 `GET /plans/{planId}/logs` + `GET /tasks/{taskId}/logs` 真实 API
- [ ] 加入 10s 自动刷新（在 WebSocket 就绪前的过渡方案）

### Phase 2：Agent 日志上报增强（1-2天）
- [ ] Agent LogReporter 类实现，批量上报
- [ ] 评测脚本增加过程日志点（warmup/iteration/checkpoint/metric/完成）
- [ ] 后端 `/tasks/{id}/logs/batch` 批量写入接口
- [ ] 预计每个任务从 3 条日志增加到 20-50 条

### Phase 3：WebSocket 实时推送（1天）
- [ ] 后端日志 WebSocket handler
- [ ] 前端 WebSocket 连接，替代 polling
- [ ] 自动滚动 + 手动暂停逻辑

### Phase 4：持久化与归档（1天）
- [ ] task_logs 表加索引优化
- [ ] 废弃 eval_logs 表，Logs 页面切换数据源
- [ ] 定时归档任务（90天以上→MinIO）
- [ ] 全局日志中心重构

---

## 五、数据量评估

| 场景 | 日志量/天 | 30天存储 |
|------|-----------|----------|
| 当前（3条/任务，10任务/天） | ~30 条 | < 1MB |
| 改进后（30条/任务，10任务/天） | ~300 条 | ~5MB |
| 满负载（50条/任务，100任务/天） | ~5000 条 | ~100MB |

PostgreSQL 单表百万级日志无压力，无需过早优化。分区和归档作为预留设计，数据量达到 10万+ 时启用。
