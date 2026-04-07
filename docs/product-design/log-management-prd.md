# 评测任务日志管理 PRD v1.1

> **文档编号:** AHVP-PRD-LOG-001  
> **版本:** 1.1  
> **作者:** AI 产品经理（菜菜子）  
> **创建日期:** 2026-04-07  
> **更新日期:** 2026-04-07  
> **状态:** 评审通过  
> **关联 Issue:** #225（日志基础设施）、#134（执行监控）、#229-#234（v1.1 拆分 Issue）

---

## 一、概述

### 1.1 功能定位

评测任务日志管理是「人工智能软硬件验证平台」的核心可观测性功能，为评测任务的执行过程提供**完整的、结构化的、可追溯的日志记录**。它是连接"任务执行"与"结果分析"的桥梁——用户不仅要看到任务跑完了，还要知道**怎么跑的、每一步发生了什么、性能指标如何变化**。

### 1.2 目标用户

| 角色 | 核心诉求 |
|------|----------|
| **评测工程师** | 实时观测任务执行进度，快速定位失败原因，对比不同批次的性能数据 |
| **算法研究员** | 通过日志中的性能指标（latency/throughput/CPU利用率）分析算子和模型的行为特征 |
| **项目管理者** | 了解评测批次的整体执行状态，导出日志用于审计和报告 |
| **平台运维** | 排查 Agent 节点故障，监控日志系统本身的健康状况 |

### 1.3 核心价值

1. **可追溯** — 每条评测任务的完整执行过程永久可查，不再"看完就没了"
2. **可分析** — 日志中嵌入结构化性能数据，用户可以直接在日志流中看到指标图表
3. **实时性** — 任务运行时就能看到实时日志流，而不是等任务跑完才能查看
4. **可关联** — 日志 ↔ 评测报告 ↔ 性能指标三者互通，一键跳转

### 1.4 当前问题（用户反馈驱动）

| # | 问题 | 影响 |
|---|------|------|
| 1 | 日志没有持久化——只能看到某个时间段的日志然后就全部清空 | 无法追溯历史任务执行情况 |
| 2 | 日志内容过于简单——缺少性能数据，无法对比报告进行分析 | 报告和过程脱节，排查困难 |
| 3 | 前端日志面板是模拟数据（PlanMonitor.js `/* 模拟日志 */`），未对接后端 | 用户看到的是假数据 |

### 1.5 现状盘点

**已有基础设施（#225 实现）：**

| 组件 | 状态 | 说明 |
|------|------|------|
| `task_logs` 表 | ✅ 已有 | 字段：id, task_id, level, message, details(JSONB), created_at, content |
| Agent `executor.py` | ✅ 已有流式上报 | 每 5 秒 / 50 行 flush 一次，POST `/api/tasks/{taskId}/logs` |
| `TaskLogController.java` | ✅ 已有 | GET `/tasks/{taskId}/logs` + `/logs/download` |
| 前端 `PlanMonitor.js` | ❌ 模拟数据 | `LOG_TEMPLATES` 生成假日志，`setInterval` 每 3 秒插入 |
| 数据库日志记录 | ⚠️ 26 条 | 全部 level=INFO，message 为空，content 是原始 JSON |

**核心差距：**

1. Agent 已实现流式上报（每 5s flush），但前端没对接——用户看不到
2. 日志 `content` 是评测脚本的原始 JSON 输出（如 benchmark 结果），未结构化
3. 所有日志 level 都是 INFO（默认值），没有真正的级别区分
4. 没有日志保留策略、搜索过滤、性能数据关联
5. 下载功能虽有接口但前端未对接

---

## 二、用户场景

### US-1：实时观测正在执行的评测任务

> **作为**评测工程师，**我希望**在任务执行时能实时看到日志输出，**以便**第一时间发现异常，不用等到任务结束。

**验收标准：**
- 日志面板每秒更新，延迟 < 3 秒
- 新日志自动滚动到底部（可手动暂停滚动）
- 不同级别（INFO/WARN/ERROR）有颜色区分
- 可按任务筛选日志流

### US-2：查看历史任务的完整日志

> **作为**评测工程师，**我希望**随时查看过去任何一次评测任务的完整日志，**以便**排查之前出现的问题。

**验收标准：**
- 日志保留 90 天（可配置），超期自动清理
- 支持按时间范围筛选
- 支持按日志级别过滤
- 支持全文搜索（关键字高亮）

### US-3：在日志中查看性能指标变化

> **作为**算法研究员，**我希望**在日志流中直接看到 latency、throughput、CPU 利用率等性能快照，**以便**不用切换到报告页面就能分析性能趋势。

**验收标准：**
- 性能指标日志以内嵌迷你图表展示（sparkline）
- 点击性能日志可展开详细数据表格
- 支持跳转到对应评测报告的详细图表

### US-4：导出日志用于外部分析

> **作为**项目管理者，**我希望**下载指定任务或时间范围的日志文件，**以便**归档审计或发送给合作伙伴。

**验收标准：**
- 支持 TXT / JSON / CSV 格式下载
- 支持按筛选条件导出（不只是全量）
- 大文件异步生成，完成后通知下载

### US-5：Agent 节点故障时快速定位

> **作为**平台运维人员，**我希望**通过日志中的错误信息和系统指标快速定位 Agent 节点故障原因，**以便**尽快恢复服务。

**验收标准：**
- ERROR 级别日志醒目标识，支持只看错误
- 日志中包含节点 ID、系统信息（CPU/内存/OS）
- 超时、进程崩溃等异常有明确的错误日志

### US-6：评测任务失败后查看最后的日志

> **作为**评测工程师，**我希望**在任务失败后能看到最后的日志输出和错误堆栈，**以便**确定失败原因并决定是否重试。

**验收标准：**
- 任务失败时最后的 stderr 输出完整保留
- 错误日志自动标记为 ERROR 级别
- 从任务列表可一键跳转到失败任务的日志（FAILED 行点击直达）

---

## 三、功能设计

### 3.1 日志采集

#### 3.1.1 结构化日志格式规范

当前问题：Agent 上报的是评测脚本的原始输出文本，缺乏结构。需要定义统一的日志格式规范。

**日志类型分类：**

| 类型 | type 字段 | 说明 | 示例 |
|------|-----------|------|------|
| **进度日志** | `PROGRESS` | 任务执行进度更新 | "正在执行第 3/10 个 batch size 测试..." |
| **性能指标日志** | `METRIC` | 嵌入结构化性能数据 | latency_p95=0.67ms, throughput=4370 QPS |
| **系统日志** | `SYSTEM` | 环境信息、资源占用 | CPU 使用率 98.9%, 内存 +0.0MB |
| **错误日志** | `ERROR` | 异常、失败、超时 | "脚本执行失败 (code=1): ..." |
| **通用日志** | `TEXT` | 脚本标准输出文本 | 脚本的 print 输出 |

**单条日志上报格式（JSON）：**

```json
{
  "type": "METRIC",
  "level": "INFO",
  "timestamp": "2026-04-07T16:44:42.712Z",
  "message": "MLP-Medium batch_size=4 评测完成",
  "metrics": {
    "model": "MLP-Medium",
    "batch_size": 4,
    "latency_ms_mean": 0.39,
    "latency_ms_p50": 0.332,
    "latency_ms_p95": 0.681,
    "latency_ms_p99": 1.0,
    "throughput_qps": 2557.4,
    "cpu_util_percent": 391.5,
    "memory_delta_mb": 0.0,
    "status": "PASS"
  },
  "context": {
    "node_id": "node-001",
    "step": "3/4",
    "elapsed_sec": 12.5
  }
}
```

#### 3.1.2 Agent 端采集策略

**现有机制（保留并增强）：**
- Agent executor.py 已实现 `LOG_FLUSH_INTERVAL=5s` / `LOG_FLUSH_LINES=50` 的批量上报
- 使用 `subprocess.Popen` + 线程读取 stdout/stderr

**增强方案：**

| 阶段 | 触发 | 上报内容 |
|------|------|----------|
| **任务开始** | `_run_task()` 入口 | `type=SYSTEM`, 包含 system_info（CPU/内存/OS/Python版本） |
| **脚本输出** | stdout 逐行读取 | `type=TEXT`, 原始文本；若检测到 JSON 则解析为 `type=METRIC` |
| **进度更新** | 解析脚本输出中的进度信息 | `type=PROGRESS`, 包含 step/total/percent |
| **性能快照** | 每完成一个子测试 | `type=METRIC`, 结构化性能数据 |
| **错误输出** | stderr 或 returncode≠0 | `type=ERROR`, 包含 stderr 和 exit code |
| **任务完成** | 正常退出 | `type=SYSTEM`, 包含 summary（总测试数/通过数/耗时） |

**智能 JSON 检测：**

```python
def _classify_log_line(self, line: str) -> dict:
    """将一行日志输出分类为结构化日志"""
    stripped = line.strip()
    # 尝试解析为 JSON（评测脚本的结果输出）
    if stripped.startswith('{'):
        try:
            data = json.loads(stripped)
            if 'latency_ms_mean' in data or 'throughput' in data:
                return {"type": "METRIC", "level": "INFO", "metrics": data}
            if 'error' in data or 'traceback' in data:
                return {"type": "ERROR", "level": "ERROR", "message": data.get('error', stripped)}
        except json.JSONDecodeError:
            pass
    # 检测进度模式
    if re.match(r'.*\d+/\d+.*', stripped) or 'progress' in stripped.lower():
        return {"type": "PROGRESS", "level": "INFO", "message": stripped}
    # 默认文本日志
    return {"type": "TEXT", "level": "INFO", "message": stripped}
```

#### 3.1.3 上报接口增强

**现有接口**（保留兼容）：

```
POST /api/tasks/{taskId}/logs
Content-Type: application/json
Body: { "content": "原始文本..." }
```

**新增批量结构化上报接口：**

```
POST /api/tasks/{taskId}/logs/batch
Content-Type: application/json
Body: {
  "entries": [
    {
      "type": "METRIC",
      "level": "INFO",
      "timestamp": "2026-04-07T16:44:42.712Z",
      "message": "MLP-Medium batch_size=4 评测完成",
      "metrics": { ... },
      "context": { "node_id": "...", "step": "3/4" }
    },
    ...
  ]
}
```

### 3.2 日志存储

#### 3.2.1 数据模型增强

**现有 `task_logs` 表改造：**

```sql
-- 增强后的 task_logs 表
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS log_type VARCHAR(16) DEFAULT 'TEXT';
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS metrics JSONB;
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS context JSONB;
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'AGENT';

-- 新增索引（支持按类型和级别查询）
CREATE INDEX idx_logs_type ON task_logs(log_type);
CREATE INDEX idx_logs_level ON task_logs(level);
CREATE INDEX idx_logs_task_type ON task_logs(task_id, log_type);
CREATE INDEX idx_logs_task_level ON task_logs(task_id, level);

-- 用于游标分页的索引（基于自增 id）
CREATE INDEX idx_logs_task_id_order ON task_logs(task_id, id);
```

**完整表结构（目标状态）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | BIGSERIAL PK | 自增主键（同时用于游标分页，task_id + id 天然有序） |
| `task_id` | BIGINT NOT NULL | 关联评测任务 |
| `log_type` | VARCHAR(16) | 日志类型：TEXT / METRIC / PROGRESS / ERROR / SYSTEM |
| `level` | VARCHAR(16) | 日志级别：DEBUG / INFO / WARN / ERROR |
| `message` | TEXT | 人类可读的日志消息 |
| `content` | TEXT | 原始内容（兼容旧数据） |
| `metrics` | JSONB | 性能指标数据（仅 METRIC 类型） |
| `details` | JSONB | 扩展详情（兼容旧数据） |
| `context` | JSONB | 执行上下文：node_id, step, elapsed_sec |
| `source` | VARCHAR(32) | 日志来源：AGENT / SYSTEM / USER |
| `created_at` | TIMESTAMP | 日志入库时间 |

> **v1.1 变更说明：** 删除 `sequence_no` 字段。`id` 为 BIGSERIAL 自增，同一 task_id 下 id 天然递增，游标分页直接用 `WHERE id > ? ORDER BY id ASC LIMIT 100` 即可，无需额外序列号。

#### 3.2.2 日志保留策略

**单表存储 + 定时清理：**

> **v1.1 变更说明：** 简化为单表存储方案。PostgreSQL 单表足以承载当前日志量（月 ~45 万条 / ~450MB），无需三级存储（热/温/冷）和按月分区。当日志量增长到需要分区时再升级方案。

| 策略 | 说明 |
|------|------|
| **存储方式** | `task_logs` 单表，PostgreSQL |
| **保留时长** | 可配置 `max-retention-days`（默认 90 天） |
| **清理方式** | 定时任务（每天凌晨 2 点），删除超过保留期的日志 |
| **METRIC 保留** | METRIC 类型日志额外保留（保留性能数据可追溯性），可单独配置 |

**配置项（application.yml）：**

```yaml
ahvp:
  log:
    max-retention-days: 90          # 日志保留天数
    metric-retention-days: 180      # METRIC 日志额外保留天数（可选）
    max-entries-per-task: 10000     # 单任务最大日志条数
    cleanup-cron: "0 0 2 * * ?"    # 清理定时任务 CRON
```

### 3.3 日志展示

#### 3.3.1 实时日志流

**技术方案：WebSocket + HTTP 轮询降级**

```
主方案：WebSocket（P0 第一期实现）
  ws://host/ws/tasks/{taskId}/logs
  - 认证: query 参数 ?token=xxx
  - Agent POST 日志后，后端推送给所有订阅该 taskId 的 WebSocket 客户端
  - 支持心跳保活（30s ping/pong）
  - 断线自动重连（指数退避: 1s→2s→4s→8s→max 30s）
  - 任务状态变更通知 (RUNNING→COMPLETED/FAILED)

降级方案：HTTP 短轮询
  GET /api/tasks/{taskId}/logs?afterId={lastId}
  - 轮询间隔 2 秒
  - 使用 afterId（最后一条日志的 id）作为游标避免重复
  - 当 WebSocket 连不上时自动切换
```

**前端实时日志面板行为：**

| 状态 | 行为 |
|------|------|
| 任务 RUNNING | 建立 WebSocket 连接，实时推送 |
| 任务 COMPLETED/FAILED | 加载全量日志，关闭 WebSocket |
| 用户滚动到顶部 | 暂停自动滚动，显示"有新日志"提示 |
| 用户点击"回到最新" | 恢复自动滚动 |

#### 3.3.2 历史日志查询

**查询维度：**

| 维度 | 控件 | 说明 |
|------|------|------|
| 任务 ID | 自动关联 | 从任务详情页进入时自动填充 |
| 时间范围 | DateRangePicker | 支持快捷选项：最近1小时/今天/昨天/最近7天 |
| 日志级别 | 多选 Tag | DEBUG / INFO / WARN / ERROR |
| 日志类型 | 多选 Tag | TEXT / METRIC / PROGRESS / ERROR / SYSTEM |
| 关键字 | 搜索框 | 全文搜索，支持高亮匹配 |

**分页策略：**

- 使用游标分页（基于 `id`：`WHERE id > ? ORDER BY id ASC LIMIT 100`），不使用 OFFSET
- 每页 100 条，支持向上/向下翻页
- 初始加载最新 100 条（倒序），用户可向上加载更多

#### 3.3.3 日志渲染增强

**按日志类型差异化渲染：**

| 类型 | 渲染方式 |
|------|----------|
| `TEXT` | 等宽字体，纯文本展示，保留换行 |
| `METRIC` | 关键指标 Tag 展示 + 可展开详情表格 + 迷你 sparkline |
| `PROGRESS` | 进度条 + 百分比 + 步骤信息 |
| `ERROR` | **红色背景高亮** + 可展开完整错误堆栈 |
| `SYSTEM` | 灰色文字 + 系统信息折叠 |

**METRIC 类型日志展示示例：**

```
16:44:42 [INFO] [METRIC] MLP-Medium batch_size=4 评测完成
  ┌─────────────────────────────────────────────────┐
  │ latency_p50: 0.33ms  │ throughput: 2557 QPS     │
  │ latency_p95: 0.68ms  │ CPU 利用率: 391.5%       │
  │ latency_p99: 1.00ms  │ 内存变化: +0.0MB         │
  │ 状态: ✅ PASS                                    │
  └─────────────────────────────────────────────────┘
  [📊 查看详细] [📈 跳转报告]
```

### 3.4 日志分析

#### 3.4.1 性能数据关联报告

当评测脚本输出的 JSON 包含完整的性能数据（如 `latency_ms_mean/p50/p95/p99, throughput_ops, cpu_util_percent`），日志系统需要：

1. **自动提取**：解析 METRIC 类型日志中的 `metrics` 字段
2. **时序聚合**：同一任务的多个 METRIC 日志，按 batch_size 或 step 聚合为趋势线
3. **关联报告**：通过 `task_id` 关联 `evaluation_reports` 表，实现日志 ↔ 报告双向跳转

**日志内嵌性能图表：**

在任务日志页面的顶部区域展示"性能概览"卡片，从 METRIC 日志中自动提取数据：

| 图表 | 数据源 | 展示方式 |
|------|--------|----------|
| Latency 趋势 | `metrics.latency_ms_p50/p95/p99` | 折线图，横轴为 batch_size 或 step |
| Throughput 对比 | `metrics.throughput_qps` | 柱状图 |
| CPU 利用率 | `metrics.cpu_util_percent` | 面积图 |

### 3.5 日志导出

| 格式 | 内容 | 适用场景 |
|------|------|----------|
| **TXT** | 纯文本日志流 | 快速查看、存档 |
| **JSON** | 结构化日志数组 | 程序化分析 |
| **CSV** | 仅 METRIC 类型，平铺字段 | Excel 分析 |

**导出流程：**

1. 用户在日志页面设置筛选条件
2. 点击导出 → 选择格式
3. 日志量 < 1MB：直接下载
4. 日志量 ≥ 1MB：异步生成 → 完成后页面提示下载

---

## 四、交互设计

### 4.1 页面布局

**入口：** 执行监控页面（PlanMonitor）→ 日志面板

```
┌─────────────────────────────────────────────────────────────┐
│ ◀ 返回  │  方案名称  │  运行状态 Badge  │  操作按钮        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 资源仪表盘（CPU / 内存 / 进度条）                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 任务列表（按 testSubject 分组折叠）                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 📋 执行日志                    [筛选] [搜索] [导出]   │  │
│  │──────────────────────────────────────────────────────│  │
│  │ 工具栏：                                              │  │
│  │ [任务:全部 ▾] [级别:全部 ▾] [类型:全部 ▾] [🔍 搜索..] │  │
│  │──────────────────────────────────────────────────────│  │
│  │ 16:44:37 [INFO] [SYSTEM] 任务初始化, 节点: node-001   │  │
│  │ 16:44:38 [INFO] [PROGRESS] 开始测试 1/4: batch=1     │  │
│  │ 16:44:39 [INFO] [METRIC] MLP-Medium bs=1             │  │
│  │          ┌ p50:0.12ms │ p95:0.67ms │ QPS:4370 ┐      │  │
│  │          └ CPU:98.9% │ 内存:+0MB │ ✅ PASS ──┘      │  │
│  │ 16:44:40 [INFO] [PROGRESS] 开始测试 2/4: batch=4     │  │
│  │ 16:44:41 [WARN] [TEXT] high latency detected          │  │
│  │ 16:44:42 [INFO] [METRIC] MLP-Medium bs=4             │  │
│  │          ┌ p50:0.33ms │ p95:0.68ms │ QPS:2557 ┐      │  │
│  │          └ CPU:391% │ 内存:+0MB │ ✅ PASS ───┘      │  │
│  │ ...                                                    │  │
│  │──────────────────────────────────────────────────────│  │
│  │ [⬇ 自动滚动中]  共 126 条日志  │  [📥 导出]          │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 关键交互流程

#### 流程 1：实时查看任务日志

```
用户打开执行监控页面
  → 前端建立 WebSocket 连接（或降级为轮询）
  → 新日志实时追加到面板底部
  → 用户可随时暂停/恢复自动滚动
  → 任务完成后 WebSocket 断开，显示"任务已完成"标记
```

#### 流程 2：搜索历史日志

```
用户选择时间范围 / 输入关键字
  → 前端调用 GET /api/tasks/{taskId}/logs?keyword=xxx&level=ERROR
  → 匹配结果高亮显示
  → 支持上下翻页（游标分页）
```

#### 流程 3：查看性能指标详情

```
用户看到 METRIC 类型日志
  → 点击 [📊 查看详细]
  → 展开为完整性能数据表格 + 迷你图表
  → 点击 [📈 跳转报告]
  → 新 Tab 打开对应评测报告详情页
```

#### 流程 4：导出日志

```
用户设置筛选条件
  → 点击 [📥 导出] → 选择格式（TXT/JSON/CSV）
  → 小文件直接下载 / 大文件异步生成后通知
```

---

## 五、数据模型

### 5.1 `task_logs` 表（增强后）

```sql
CREATE TABLE task_logs (
    id              BIGSERIAL PRIMARY KEY,
    task_id         BIGINT NOT NULL REFERENCES evaluation_tasks(id) ON DELETE CASCADE,
    log_type        VARCHAR(16) NOT NULL DEFAULT 'TEXT',    -- TEXT/METRIC/PROGRESS/ERROR/SYSTEM
    level           VARCHAR(16) NOT NULL DEFAULT 'INFO',    -- DEBUG/INFO/WARN/ERROR
    message         TEXT NOT NULL DEFAULT '',                -- 人类可读消息
    content         TEXT,                                   -- 原始内容（兼容）
    metrics         JSONB,                                  -- 性能指标（METRIC 类型）
    details         JSONB,                                  -- 扩展详情（兼容）
    context         JSONB,                                  -- 执行上下文
    source          VARCHAR(32) DEFAULT 'AGENT',            -- AGENT/SYSTEM/USER
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_logs_task_id ON task_logs(task_id);
CREATE INDEX idx_logs_created_at ON task_logs(created_at);
CREATE INDEX idx_logs_task_type ON task_logs(task_id, log_type);
CREATE INDEX idx_logs_task_level ON task_logs(task_id, level);
CREATE INDEX idx_logs_task_id_order ON task_logs(task_id, id);  -- 游标分页
```

> **v1.1 变更说明：** 删除 `sequence_no` 字段及其索引 `idx_logs_task_seq`。`id` 自增即有序，游标分页用 `WHERE id > ? ORDER BY id ASC LIMIT 100`。删除 `log_archives` 表（不再需要三级存储）。

### 5.2 `log_export_jobs` 表（异步导出任务，P2）

```sql
CREATE TABLE log_export_jobs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    task_id         BIGINT,                    -- 可为空（全局导出）
    format          VARCHAR(16) NOT NULL,      -- TXT/JSON/CSV
    filters         JSONB,                     -- 导出筛选条件
    status          VARCHAR(16) DEFAULT 'PENDING', -- PENDING/PROCESSING/COMPLETED/FAILED
    file_path       VARCHAR(512),              -- 生成的文件路径
    file_size_bytes BIGINT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at    TIMESTAMP
);
```

> **注意：** `log_export_jobs` 表为 P2 功能，第一期不需要建表。

### 5.3 ER 关系

```
evaluation_tasks 1 ──── N task_logs            (通过 task_id)
evaluation_tasks 1 ──── N evaluation_reports   (通过 task_id)  
task_logs        N ────── evaluation_reports   (通过 task_id 间接关联)
users            1 ──── N log_export_jobs      (导出任务, P2)
```

---

## 六、API 设计

### 6.1 RESTful API

#### 6.1.1 上报日志（Agent → 后端）

**POST /api/tasks/{taskId}/logs**（保持兼容）

```
Request:
  { "content": "原始文本日志..." }

Response:
  { "code": 0, "message": "ok" }
```

**POST /api/tasks/{taskId}/logs/batch**（新增结构化批量上报）

```
Request:
{
  "entries": [
    {
      "type": "METRIC",
      "level": "INFO", 
      "timestamp": "2026-04-07T16:44:42.712Z",
      "message": "MLP-Medium batch_size=4 评测完成",
      "metrics": {
        "latency_ms_mean": 0.39,
        "latency_ms_p50": 0.332,
        "latency_ms_p95": 0.681,
        "throughput_qps": 2557.4,
        "cpu_util_percent": 391.5
      },
      "context": { "node_id": "node-001", "step": "3/4" }
    }
  ]
}

Response:
  { "code": 0, "message": "ok", "data": { "accepted": 5 } }
```

#### 6.1.2 查询日志（前端 → 后端）

**GET /api/tasks/{taskId}/logs**（增强参数）

```
Query Parameters:
  afterId    - 游标（上次返回的最后一条日志的 id）
  beforeId   - 反向游标
  level      - 日志级别过滤（逗号分隔：INFO,WARN,ERROR）
  type       - 日志类型过滤（逗号分隔：TEXT,METRIC）
  keyword    - 全文搜索关键字
  from       - 起始时间（ISO 8601）
  to         - 结束时间（ISO 8601）
  limit      - 每页条数（默认 100，最大 500）
  order      - 排序方向（asc/desc，默认 desc）

Response:
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": 26,
        "taskId": 2557,
        "logType": "METRIC",
        "level": "INFO",
        "message": "MLP-Medium batch_size=4 评测完成",
        "metrics": { ... },
        "context": { "nodeId": "node-001", "step": "3/4" },
        "createdAt": "2026-04-07T16:44:42.809Z"
      }
    ],
    "hasMore": true,
    "nextCursor": "26"
  },
  "total": 126
}
```

> **v1.1 变更说明：** 游标参数从 `after`/`before`（基于 sequence_no）改为 `afterId`/`beforeId`（基于 id）。响应中删除 `sequenceNo` 字段，`nextCursor` 值为最后一条的 `id`。

#### 6.1.3 日志统计（用于仪表盘，P1）

**GET /api/tasks/{taskId}/logs/stats**

```
Response:
{
  "code": 0,
  "data": {
    "total": 126,
    "byLevel": { "INFO": 98, "WARN": 15, "ERROR": 8, "DEBUG": 5 },
    "byType": { "TEXT": 60, "METRIC": 40, "PROGRESS": 16, "SYSTEM": 6, "ERROR": 4 },
    "metricsCount": 40,
    "timeRange": {
      "first": "2026-04-07T16:44:37.000Z",
      "last": "2026-04-07T16:44:52.000Z"
    }
  }
}
```

#### 6.1.4 日志性能数据提取（P2）

**GET /api/tasks/{taskId}/logs/metrics**

```
Query Parameters:
  group_by   - 聚合维度：batch_size / model / operator

Response:
{
  "code": 0,
  "data": [
    {
      "group": "batch_size=1",
      "latency_ms_p50": 0.123,
      "latency_ms_p95": 0.671,
      "latency_ms_p99": 0.789,
      "throughput_qps": 4370.6,
      "cpu_util_percent": 98.9
    },
    {
      "group": "batch_size=4",
      "latency_ms_p50": 0.332,
      "latency_ms_p95": 0.681,
      "latency_ms_p99": 1.0,
      "throughput_qps": 2557.4,
      "cpu_util_percent": 391.5
    }
  ]
}
```

#### 6.1.5 日志导出

**GET /api/tasks/{taskId}/logs/download**（已有，增强格式支持）

```
Query Parameters:
  format     - 导出格式：txt(默认) / json / csv
  level      - 级别过滤
  type       - 类型过滤
  from       - 起始时间
  to         - 结束时间

Response: 
  Content-Disposition: attachment; filename=task-{taskId}-logs.{format}
```

**POST /api/logs/export**（异步导出，大文件，P2）

```
Request:
{
  "taskIds": [2557, 2556],
  "format": "json",
  "filters": { "level": ["ERROR", "WARN"], "from": "2026-04-01" }
}

Response:
{ "code": 0, "data": { "jobId": "export-001" } }
```

**GET /api/logs/export/{jobId}**（查询导出状态，P2）

```
Response:
{
  "code": 0,
  "data": {
    "status": "COMPLETED",
    "downloadUrl": "/api/logs/export/export-001/download",
    "fileSize": 1048576
  }
}
```

### 6.2 WebSocket API

#### 6.2.1 实时日志推送

**连接地址：** `ws://host/ws/tasks/{taskId}/logs`

**认证：** 通过 query 参数 `?token=xxx`

**服务端 → 客户端消息：**

```json
{
  "type": "LOG_ENTRY",
  "data": {
    "id": 127,
    "taskId": 2557,
    "logType": "METRIC",
    "level": "INFO",
    "message": "MLP-Medium batch_size=16 评测完成",
    "metrics": { ... },
    "createdAt": "2026-04-07T16:44:45.000Z"
  }
}
```

**心跳消息（30s 间隔）：**

```json
{ "type": "PING" }
// 客户端回复:
{ "type": "PONG" }
```

**任务状态变更通知：**

```json
{
  "type": "TASK_STATUS",
  "data": {
    "taskId": 2557,
    "status": "COMPLETED",
    "message": "任务执行完成"
  }
}
```

---

## 七、性能指标

### 7.1 日志量估算

| 场景 | 单任务日志量 | 日并发任务 | 日志总量/天 |
|------|-------------|-----------|------------|
| 算子评测（4 batch sizes） | ~50-100 条 | 50 | 2,500 - 5,000 条 |
| 模型推理（多模型） | ~100-200 条 | 20 | 2,000 - 4,000 条 |
| 混合场景（峰值） | ~150 条均值 | 100 | ~15,000 条 |

**月日志量估算：** ~450,000 条（约 450MB 含 JSONB 字段）

### 7.2 存储方案

| 项目 | 说明 |
|------|------|
| **存储方式** | PostgreSQL `task_logs` 单表 |
| **90 天数据量** | ~1.35GB |
| **磁盘容量** | 当前服务器 40GB，日志占用 < 2GB，充足 |
| **未来扩展** | 若日志量增长 10 倍以上，再考虑按月分区 |

### 7.3 性能目标

| 指标 | 目标 |
|------|------|
| 日志写入延迟 | < 50ms（单条插入） |
| 日志查询延迟（by task_id） | < 100ms（热数据） |
| 全文搜索延迟 | < 500ms（单任务范围内） |
| WebSocket 推送延迟 | < 1s（从 Agent 上报到前端展示） |
| 日志导出（1000 条） | < 3s |
| 并发 WebSocket 连接 | ≥ 50 |

---

## 八、实现优先级

### P0 — 核心功能（第一期，预计 5 天）

> 一步到位：真实数据 + WebSocket 实时推送 + ERROR 高亮 + 失败日志 + 结构化上报

| # | 功能点 | 工作量 | 说明 |
|---|--------|--------|------|
| 1 | **前端日志面板对接真实 API** | 0.5 天 | 移除 PlanMonitor.js 模拟日志，调用 `GET /tasks/{taskId}/logs`；日志级别颜色渲染（ERROR 红色背景、WARN 橙色、INFO 默认） |
| 2 | **失败任务日志完整保留 + 一键跳转** | 0.5 天 | 任务列表 FAILED 行点击直接查看对应日志 |
| 3 | **日志导出对接** | 0.5 天 | 前端导出按钮对接已有的 `/logs/download` 接口 |
| 4 | **后端 WebSocket 实时日志推送** | 1 天 | Spring WebSocket 端点 `ws://host/ws/tasks/{taskId}/logs`；30s 心跳；任务状态变更通知 |
| 5 | **前端 WebSocket 实时日志连接** | 1 天 | RUNNING 时 WebSocket 实时追加；断线指数退避重连；降级到 HTTP 2s 轮询；自动滚动 + "有新日志"提示 |
| 6 | **Agent 结构化日志上报增强** | 1.5 天 | `subprocess.Popen` 实时读取 stdout/stderr；`_classify_log_line()` 自动识别 TEXT/METRIC/PROGRESS/ERROR/SYSTEM；stderr 标记 ERROR；任务开始/完成上报 SYSTEM 日志；batch 上报接口；DB schema 增加 log_type/metrics/context/source 字段 |

### P1 — 增强功能（第二期，预计 4 天）

> 性能指标渲染、搜索过滤、统计、保留策略

| # | 功能点 | 工作量 | 说明 |
|---|--------|--------|------|
| 7 | **METRIC 日志性能指标渲染** | 1.5 天 | 性能指标卡片（latency/throughput/CPU等）+ 迷你 sparkline 图表 + 可展开详细数据 |
| 8 | **日志搜索过滤** | 1 天 | 前端工具栏（任务/级别/类型/关键字）；后端增加 level/type/keyword/from/to 参数；关键字高亮；游标分页 (WHERE id > ? LIMIT 100) |
| 9 | **日志统计接口** | 0.5 天 | `/logs/stats` 接口，byLevel/byType/时间范围 |
| 10 | **日志保留策略** | 1 天 | 定时清理任务（每天凌晨 2 点删除超过 max-retention-days 的日志） |

### P2 — 高级功能（第三期，预计 3 天）

> 性能数据提取、报告关联、多格式导出、异步导出

| # | 功能点 | 工作量 | 说明 |
|---|--------|--------|------|
| 11 | **性能数据提取接口** | 1 天 | `/logs/metrics` 聚合查询（按 batch_size/model 分组） |
| 12 | **日志 ↔ 报告关联跳转** | 0.5 天 | 通过 task_id 双向链接，日志页→报告页、报告页→日志页 |
| 13 | **多格式导出** | 0.5 天 | JSON / CSV 格式支持（已有 TXT） |
| 14 | **异步导出大文件** | 1 天 | `log_export_jobs` 表 + 导出任务队列 + 完成通知 |

> **v1.1 变更说明：** 砍掉"任务日志对比"功能（原 P2），当前阶段不需要。

### 里程碑时间线

```
P0（第一期）：真实数据 + WebSocket + ERROR高亮 + 结构化上报 → 5 天
P1（第二期）：METRIC渲染 + 搜索过滤 + 统计 + 保留策略      → 4 天
P2（第三期）：性能提取 + 报告关联 + 多格式/异步导出         → 3 天
                                                          总计 ~12 天
```

---

## 附录

### A. 前端改造清单

| 文件 | 改动项 |
|------|--------|
| `PlanMonitor.js` | 移除 `LOG_TEMPLATES` 和 `/* 模拟日志 */` 相关代码；新增 WebSocket 连接逻辑；日志渲染组件替换 |
| `api.js` | 新增 `/tasks/{taskId}/logs` 相关 API 封装 |
| 新增 `LogPanel.js` | 独立的日志面板组件（可复用） |
| 新增 `MetricCard.js` | METRIC 日志的性能卡片组件 |
| 新增 `useWebSocket.js` | WebSocket 连接 Hook（含重连、降级） |

### B. 后端改造清单

| 文件 | 改动项 |
|------|--------|
| `TaskLog.java` | 新增 logType, metrics, context, source 字段 |
| `TaskLogController.java` | 新增 batch 上报、参数化查询、stats 接口 |
| `TaskLogRepository.java` | 新增按级别/类型/关键字查询方法 |
| 新增 `TaskLogWebSocketHandler.java` | WebSocket 端点实现 |
| 新增 `LogCleanupScheduler.java` | 日志定时清理任务 |
| `application.yml` | 新增 log 相关配置项 |

### C. Agent 改造清单

| 文件 | 改动项 |
|------|--------|
| `executor.py` | `subprocess.run` → `subprocess.Popen`；`_classify_log_line()` 方法；结构化上报；batch 接口调用 |
| 新增 `log_formatter.py` | 日志格式化工具，解析脚本 JSON 输出为结构化日志 |

### D. 数据库迁移脚本

```sql
-- Migration: V2026_04_08__enhance_task_logs.sql

-- 1. 新增字段（不含 sequence_no，id 自增即有序）
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS log_type VARCHAR(16) DEFAULT 'TEXT';
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS metrics JSONB;
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS context JSONB;
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'AGENT';

-- 2. 更新现有数据的 log_type（根据 content 内容推断）
UPDATE task_logs SET log_type = 'TEXT' WHERE log_type IS NULL;
UPDATE task_logs SET level = 'INFO' WHERE level IS NULL OR level = '';

-- 3. 新增索引
CREATE INDEX IF NOT EXISTS idx_logs_type ON task_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_logs_level ON task_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_task_type ON task_logs(task_id, log_type);
CREATE INDEX IF NOT EXISTS idx_logs_task_level ON task_logs(task_id, level);
CREATE INDEX IF NOT EXISTS idx_logs_task_id_order ON task_logs(task_id, id);

-- 4. 导出任务表（P2，可以等第三期再建）
-- CREATE TABLE IF NOT EXISTS log_export_jobs ( ... );
```

### E. 兼容性说明

- 所有新增字段均有默认值，不影响现有 26 条日志数据
- 旧的 `POST /tasks/{taskId}/logs`（纯文本 content）接口保持不变
- Agent 端可渐进式迁移：先继续用旧接口，再逐步切换到 batch 接口
- 前端先对接现有 REST 接口，WebSocket 作为增强

### F. v1.0 → v1.1 变更摘要

| 变更项 | v1.0 | v1.1 | 原因 |
|--------|------|------|------|
| WebSocket 优先级 | P1 | **P0** | 一步到位，不分期 |
| 存储方案 | 三级（热/温/冷） | **单表 task_logs** | PostgreSQL 够用，简化架构 |
| `sequence_no` 字段 | 有 | **删除** | id 自增天然有序，游标分页用 `WHERE id > ?` |
| `log_archives` 表 | 有 | **删除** | 不需要冷归档表 |
| 保留策略 | 热30天+温90天+冷归档 | **max-retention-days=90 + 定时删除** | 简化 |
| 游标分页参数 | `after`（sequence_no） | **`afterId`**（id） | 配合删除 sequence_no |
| P0 范围 | 前端对接+级别区分+颜色+导出 | **+WebSocket+失败日志跳转+Agent结构化上报** | P0 范围扩大 |
| P2 日志对比 | 有 | **砍掉** | 先不做 |
| US-4 日志对比 | 有 | **砍掉** | 先不做 |
