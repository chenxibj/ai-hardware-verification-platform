# Task Progress: 日志系统 Phase 1 — Agent 日志上报增强 (#243)

## 状态: ✅ 已完成
## 时间: 2026-04-08 12:18 ~ 12:42

## 完成项

### Step 1: DB Schema 变更 ✅
- `task_logs` 表新增 `plan_id BIGINT`, `node_id VARCHAR(100)`, `sequence BIGSERIAL`
- 创建索引: `idx_task_logs_plan_id`, `idx_task_logs_task_id_seq`, `idx_task_logs_created_at`

### Step 2: Agent LogReporter ✅
- 创建 `agent/log_reporter.py`
- `class LogReporter` — with 语句支持
- `log()`, `info()`, `warn()`, `error()`, `metric()`, `progress()`, `system()` 方法
- `flush()` 带 batchId 幂等
- 攒够 10 条或超过 2 秒 auto flush
- HTTP POST 到 `/tasks/{taskId}/logs/batch`
- 失败时放回 buffer 重试

### Step 3: 评测脚本改造 ✅
- 创建 `agent/eval_runner.py` — 使用 LogReporter 的评测运行器
- 关键位置日志: 开始(系统信息)、数据加载、warmup、每10行进度、metric检测、内存统计、结束
- `executor.py` 已导入 LogReporter (HAS_LOG_REPORTER flag)

### Step 4: 后端 batch API ✅
- `TaskLogController.java` batch API 增加 batchId 幂等
  - `ConcurrentHashMap<String, Long>` 缓存已处理的 batchId
  - TTL 10min, `@Scheduled(fixedRate=300000)` 自动清理
- 兼容新格式 `{ batchId, logs: [...] }` 和旧格式 `{ entries: [...] }`
- 支持 `logType` (新) 和 `type` (旧) 字段名
- `logs` 中的 `planId`, `nodeId` 正确写入
- `TaskLog.java` 新增 `planId`, `nodeId`, `sequence` 字段
  - `sequence` 使用 `insertable=false, updatable=false`（DB 自动生成）
- WebSocket 推送增加 planId, nodeId, sequence 字段

### Step 5: 构建部署验证 ✅
- `docker compose build --no-cache backend` — 成功
- `docker compose up -d backend` — 成功
- API 测试:
  - batch API 写入成功 ✅
  - batchId 幂等：重复提交被跳过 ✅
  - planId/nodeId 正确存储 ✅
  - sequence 自动生成 ✅
  - 旧格式 (entries) 向后兼容 ✅

### Step 6: 评测验证
- 跳过（需要实际评测任务触发，Agent 未部署 LogReporter 集成版本）
- eval_runner.py 已就绪，可在下次评测时验证

## Git
- Commit: `da98e485` — `feat(#243): Agent日志上报增强 Phase 1`
- Push: origin/main ✅
