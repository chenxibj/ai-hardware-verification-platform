# 评测自主编排系统设计文档（US-1.5/US-1.9）

> **版本**: v1.0  
> **日期**: 2026-05-13  
> **作者**: 菜菜子 (AI PM)  
> **状态**: Draft — 待 chenxi review  
> **关联**: PRD §1.2（自主编排系统）、Gap Analysis 2026-05-08、US-1.5、US-1.9

---

## 1. 目标与范围

### 1.1 要解决什么问题

PRD §1.2 定义了「自主编排系统」能力：用户通过**拖拽式可视化设计器**编排评测流程，将多个评测步骤串联为 DAG（有向无环图），支持条件分支、并行执行等控制流。

当前系统只能创建「单个评测任务」或「评测计划（Plan = 同类任务批量拆分）」，无法表达**多步骤、有依赖关系的评测流水线**。典型痛点：

1. **芯片全栈评测需人工串接** — 需手动依次创建 6 层评测任务，无法自动衔接
2. **多芯片横向对比需反复操作** — 对 N 块芯片执行同测试套件需创建 N 份任务并手动汇总
3. **缺少异常自愈** — 某步失败需人工干预，无法自动重试或降级
4. **无法复用成熟流程** — 同类评测流程无法保存为模板共享

### 1.2 目标

- **P0**: 基于 react-flow 的拖拽式 DAG 编辑器，支持 5 类节点（评测、脚本、条件、并行、聚合）
- **P0**: 后端 DAG 执行引擎，复用已有 TaskDispatcher + TaskLifecycleService
- **P0**: 流程定义 CRUD + JSON 导入/导出
- **P1**: 3 个预置模板（芯片全栈、横向对比、多框架适配）+ 状态监控
- **P2**: Python 脚本节点在线编辑与执行

### 1.3 不包含

- 评测参数配置改造（US-1.4 / design-eval-params.md 已覆盖）
- Agent 端执行引擎改造
- 评测报告自动生成逻辑

---

## 2. 现状分析

### 2.1 已有什么

| 组件 | 路径 | 成熟度 |
|------|------|--------|
| `WorkflowController.java` | `backend/.../workflow/` — REST 骨架，返回硬编码空数据 | 🔴 骨架 |
| `workflows` 表 | DB — `id, workflow_no, name, status, steps(jsonb), trigger_config(jsonb)` | 🟡 可复用 |
| `Workflows.js` | `frontend/src/pages/` — react-flow 画布 + **5大类 18 种节点** + 参数配置 + 5 模板 + 导出 | 🟢 丰富 |
| `TaskDispatcher` | 成熟的任务分发（PENDING→QUEUED→DISPATCHED→RUNNING） | 🟢 成熟 |
| `TaskLifecycleService` | 任务终态善后（GPU/节点释放→Plan进度→触发调度） | 🟢 成熟 |
| `GpuSlotService` | GPU 资源池管理 | 🟢 成熟 |
| `TaskRecoveryScheduler` | 超时/离线节点任务恢复 | 🟢 成熟 |
| `PlanTaskSplitter` | Plan→Task 拆分 | 🟢 成熟 |

### 2.2 缺什么

| 缺失项 | 优先级 | 说明 |
|--------|--------|------|
| Workflow Service/Repository/Entity | P0 | Controller 仅有骨架 |
| DAG 执行引擎 (WorkflowEngine) | P0 | 拓扑排序、节点调度、状态机、失败处理 |
| `workflow_instances` 表 | P0 | 流程运行实例记录 |
| `workflow_node_instances` 表 | P0 | 节点运行状态、输入/输出 |
| 前端 → 后端数据打通 | P0 | 当前 save 无持久化 |
| 流程校验 + 监控面板 | P1 | DAG 合法性检查 + 实时状态 |

### 2.3 关键发现

前端 `Workflows.js` **远超预期**（~220行），已实现完整画布、18 种节点、参数 Drawer、模板加载、JSON 导出。核心差距在后端 DAG 执行引擎。

---

## 3. 数据模型

### 3.1 `workflows` 表重构

复用已有表，ALTER 新增字段：

```sql
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS dag_json jsonb;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS is_template boolean DEFAULT false;
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS template_category varchar(32);
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS tags varchar(200);
COMMENT ON COLUMN workflows.steps IS 'DEPRECATED: 使用 dag_json 替代';
```

### 3.2 `workflow_instances` 表

```sql
CREATE TABLE workflow_instances (
    id              bigserial PRIMARY KEY,
    instance_no     varchar(64) NOT NULL UNIQUE,
    workflow_id     bigint NOT NULL REFERENCES workflows(id),
    workflow_version integer NOT NULL,
    dag_snapshot    jsonb NOT NULL,         -- 运行时快照（不受定义修改影响）
    status          varchar(32) NOT NULL DEFAULT 'PENDING',
    input_params    jsonb,
    output_data     jsonb,
    started_at      timestamp,
    completed_at    timestamp,
    created_by      bigint NOT NULL,
    created_at      timestamp DEFAULT CURRENT_TIMESTAMP,
    updated_at      timestamp DEFAULT CURRENT_TIMESTAMP,
    error_message   text
);
CREATE INDEX idx_wf_instances_status ON workflow_instances(status);
ALTER TABLE workflow_instances ADD CONSTRAINT wf_inst_status_check
    CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED','CANCELLED','PAUSED'));
```

### 3.3 `workflow_node_instances` 表

```sql
CREATE TABLE workflow_node_instances (
    id              bigserial PRIMARY KEY,
    instance_id     bigint NOT NULL REFERENCES workflow_instances(id),
    node_id         varchar(64) NOT NULL,
    node_type       varchar(32) NOT NULL,
    node_label      varchar(200),
    status          varchar(32) NOT NULL DEFAULT 'PENDING',
    input_data      jsonb,
    output_data     jsonb,
    eval_task_id    bigint,                -- 关联 EvaluationTask（评测节点）
    retry_count     integer DEFAULT 0,
    max_retries     integer DEFAULT 3,
    started_at      timestamp,
    completed_at    timestamp,
    error_message   text,
    created_at      timestamp DEFAULT CURRENT_TIMESTAMP,
    updated_at      timestamp DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(instance_id, node_id)
);
CREATE INDEX idx_wf_node_inst_task ON workflow_node_instances(eval_task_id);
```

### 3.4 ER 关系

```
workflows (1) ──< workflow_instances (N) ──< workflow_node_instances (N)
workflow_node_instances (N) >── evaluation_tasks (0..1)
```

---

## 4. DAG JSON Schema

### 4.1 总体结构

```json
{
  "version": "1.0",
  "nodes": [
    {
      "id": "node_1",
      "type": "eval_task",
      "label": "推理测试",
      "position": { "x": 250, "y": 180 },
      "config": { "templateId": 3, "evalType": "MODEL", "params": { "iterations": 100 } },
      "retry": { "maxRetries": 3, "retryDelay": 60 },
      "timeout": 3600
    }
  ],
  "edges": [
    { "id": "e1", "source": "node_1", "target": "node_2", "condition": null }
  ],
  "globalParams": { "chipId": null, "nodeId": null, "priority": "MEDIUM" }
}
```

### 4.2 节点类型

| type | 说明 | config 核心字段 |
|------|------|----------------|
| `eval_task` | 评测节点 | `templateId`, `evalType`, `params` — 创建 EvaluationTask |
| `script` | 脚本节点 | `language`, `code`, `timeout` — Agent 执行脚本 |
| `condition` | 条件分支 | `expression`, `trueTarget`, `falseTarget` |
| `parallel` | 并行网关 | `maxParallel` — 并行启动多分支 |
| `aggregate` | 聚合节点 | `strategy`(all/any) — 等待分支汇聚 |

前端 18 种节点（data_load, model_load, inference_test 等）在后端统一映射为 `eval_task`，通过 `nodeType` 区分由 Agent 端解释执行。

### 4.3 条件表达式

MVP 简单模式：`{ "field": "accuracy", "operator": ">=", "value": 0.95 }`  
V2 高级模式：JEXL 表达式

### 4.4 DAG 校验规则

无环检测 | 连通性 | 入口唯一 | 出口存在 | condition 必须有 true/false 出边 | eval_task 必须关联 templateId

---

## 5. 后端架构

### 5.1 包结构

```
com.lab.workflow/
├── WorkflowController.java         # REST API（重构已有骨架）
├── WorkflowService.java            # 流程定义 CRUD + 校验
├── WorkflowInstanceService.java    # 实例管理
├── WorkflowEngine.java             # ★ DAG 执行引擎核心
├── WorkflowValidator.java          # DAG 校验
├── executor/
│   ├── NodeExecutor.java           # 接口
│   ├── EvalTaskNodeExecutor.java   # 评测节点 → 创建 EvaluationTask
│   ├── ScriptNodeExecutor.java     # 脚本节点
│   ├── ConditionNodeExecutor.java  # 条件分支
│   ├── ParallelNodeExecutor.java   # 并行网关
│   └── AggregateNodeExecutor.java  # 聚合节点
├── model/                           # Workflow, WorkflowInstance, WorkflowNodeInstance
├── repository/                      # 3 个 JPA Repository
├── dto/                             # Request/Response DTO
└── event/
    └── WorkflowNodeCompletedEvent.java
```

### 5.2 WorkflowEngine 核心逻辑

**事件驱动推进模式**（非预计算全层级）：

1. `start()`: 创建 instance + node_instances → 入口节点标记 READY → `advanceEngine()`
2. `advanceEngine()`: 找所有 READY 节点 → 调 NodeExecutor.execute() → 同步节点直接完成，异步节点等回调
3. `onNodeCompleted()`: 节点完成 → 检查下游所有入边源节点是否完成 → 标记下游 READY → `advanceEngine()`
4. 所有节点终态 → instance 标 COMPLETED/FAILED

### 5.3 EvalTaskNodeExecutor — 复用已有调度（关键集成点）

```java
@Component
public class EvalTaskNodeExecutor implements NodeExecutor {
    // 不直接调 TaskDispatcher，创建 PENDING 任务后已有调度循环自动拾取
    public NodeExecutionResult execute(WorkflowNodeInstance nodeInst, Map<String, Object> input) {
        // 1. 从 nodeInst.config 读取 templateId + params
        // 2. 合并全局参数（chipId, nodeId）
        // 3. 创建 EvaluationTask(status=PENDING)
        // 4. nodeInst.evalTaskId = task.id
        // 5. 返回 ASYNC_WAITING
    }
}
```

### 5.4 TaskLifecycleService 集成

在 `onTaskTerminated()` 尾部新增 ~10 行：

```java
// 5. workflow 节点回调
try {
    WorkflowNodeInstance wfNode = nodeInstanceRepo.findByEvalTaskId(taskId);
    if (wfNode != null) {
        wfNode.setStatus(task.isCompleted() ? "COMPLETED" : "FAILED");
        wfNode.setOutputData(task.getResult());
        nodeInstanceRepo.save(wfNode);
        eventPublisher.publishEvent(new WorkflowNodeCompletedEvent(wfNode));
    }
} catch (Exception e) {
    log.warn("Workflow callback failed for task {}: {}", taskId, e.getMessage());
}
```

---

## 6. 前端架构

### 6.1 改造策略

拆分 `Workflows.js`（单文件 ~220 行）为模块化结构，补全后端交互和运行态监控。

### 6.2 组件结构

```
frontend/src/pages/workflows/
├── WorkflowList.js          # 流程列表页（新增）
├── WorkflowEditor.js        # 画布编辑器（从 Workflows.js 重构）
├── WorkflowMonitor.js       # 实例监控页（新增）
├── components/
│   ├── CustomNode.js         # 节点渲染（提取）
│   ├── NodePalette.js        # 节点面板（提取）
│   ├── NodeConfigDrawer.js   # 参数配置（提取）
│   ├── TemplatePicker.js     # 模板选择（提取）
│   └── RunStatusOverlay.js   # 运行态状态叠加（新增）
├── constants/                 # nodeCategories.js + workflowTemplates.js
└── hooks/
    ├── useWorkflowApi.js     # API 调用
    └── useWorkflowRun.js     # 运行态轮询
```

### 6.3 节点状态视觉映射

| 状态 | 边框色 | Badge |
|------|--------|-------|
| PENDING | 灰 #d9d9d9 | — |
| READY | 蓝 #1890ff | 待执行 |
| RUNNING | 蓝 #1890ff | 执行中（脉冲动画） |
| COMPLETED | 绿 #52c41a | ✓ |
| FAILED | 红 #f5222d | ✗ |
| SKIPPED | 黄 #faad14 | — |

---

## 7. 流程执行引擎设计

### 7.1 执行状态机

```
流程: PENDING → RUNNING → COMPLETED / FAILED / CANCELLED / PAUSED
节点: PENDING → READY → RUNNING → COMPLETED / FAILED / SKIPPED
```

### 7.2 并行执行

`parallel` 节点同时标记所有下游为 READY，`aggregate` 等待所有上游完成。`maxParallel` 通过信号量限流。

### 7.3 条件分支

`condition` 节点读取上游 `output_data` → 求值 → 选择分支 → 未选中分支递归标记 SKIPPED。

### 7.4 失败处理

| 场景 | 策略 |
|------|------|
| 节点失败 | 按 `maxRetries` 自动重试（指数退避） |
| 重试耗尽 | 节点 FAILED → 流程 FAILED（可配 `failurePolicy: "skip"` 跳过） |
| 人工重试 | 重置节点为 READY → 继续推进 |
| eval_task 超时 | 复用 TaskRecoveryScheduler |

### 7.5 数据传递

上游 `output_data` 自动合并到下游 `input_data`。多上游按拓扑序合并（后覆盖前）。

### 7.6 集成流程

```
用户点击执行 → WorkflowEngine.start()
  → 创建 instance + node_instances
  → 入口 READY → advanceEngine()
    → [eval_task] 创建 EvaluationTask(PENDING) → TaskDispatcher 自动拾取
      → Agent 执行 → TaskLifecycleService.onTaskTerminated()
        → 发布 WorkflowNodeCompletedEvent → 推进下游
    → [condition] 同步求值 → 选择分支
    → [parallel/aggregate] 控制流，直接完成
  → 所有终态 → instance COMPLETED/FAILED
```

---

## 8. 预置模板设计

### 8.1 芯片全栈评测流水线

数据加载 → 模型加载 → 模型转换 → **并行**[推理测试 | 精度评估 | 性能剖析] → **聚合** → 条件(精度≥95%?) → 报告生成

### 8.2 多芯片横向对比

数据加载 → 模型加载 → **并行**[推理测试-芯片A | 推理测试-芯片B | 推理测试-芯片C] → **聚合** → 指标计算(对比) → 报告生成(对比版)

运行时根据 `globalParams.chipIds[]` 动态复制分支。

### 8.3 模型多框架适配

模型加载 → **并行**[转换→PyTorch→推理 | 转换→TF→推理 | 转换→MindSpore→推理 | 转换→Paddle→推理] → **聚合** → 指标计算 → 报告生成

### 8.4 存储方式

Flyway 迁移脚本以 `is_template=true` 插入 `workflows` 表。

---

## 9. API 设计

### 9.1 流程定义

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/workflows` | 列表（分页+筛选） |
| POST | `/api/workflows` | 创建 |
| GET | `/api/workflows/{id}` | 详情（含 dag_json） |
| PUT | `/api/workflows/{id}` | 更新 |
| DELETE | `/api/workflows/{id}` | 删除（ARCHIVED） |
| POST | `/api/workflows/{id}/publish` | 发布 |
| POST | `/api/workflows/{id}/clone` | 克隆 |
| POST | `/api/workflows/validate` | 校验 DAG |
| GET | `/api/workflows/templates` | 模板列表 |
| POST | `/api/workflows/{id}/save-as-template` | 存为模板 |

### 9.2 流程实例

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/workflows/{id}/run` | 启动实例 |
| GET | `/api/workflow-instances` | 实例列表 |
| GET | `/api/workflow-instances/{id}` | 实例详情（含节点状态） |
| POST | `/api/workflow-instances/{id}/pause` | 暂停 |
| POST | `/api/workflow-instances/{id}/resume` | 恢复 |
| POST | `/api/workflow-instances/{id}/cancel` | 取消 |
| POST | `/api/workflow-instances/{id}/nodes/{nodeId}/retry` | 重试节点 |

### 9.3 关键响应示例

```
GET /api/workflow-instances/1
→ {
  "instanceNo": "WFI-20260513-0001",
  "status": "RUNNING",
  "nodes": [
    { "nodeId": "n1", "label": "数据加载", "status": "COMPLETED" },
    { "nodeId": "n2", "label": "推理测试", "status": "RUNNING", "evalTaskId": 42 },
    { "nodeId": "n3", "label": "报告生成", "status": "PENDING" }
  ],
  "progress": { "total": 3, "completed": 1, "running": 1, "failed": 0 }
}
```

---

## 10. 实现计划

### 10.1 Issue 拆分

| Issue | 优先级 | 工时 | Scope | 验收标准 |
|-------|--------|------|-------|----------|
| #1 数据模型 + Entity + Repository | P0 | 2d | ALTER workflows + 建 2 新表 + 3 Entity/Repo + 测试 | `./gradlew test --tests *Workflow*` 全绿 |
| #2 WorkflowService + Controller CRUD | P0 | 2d | Service/Controller/Validator/DTO + 集成测试 | CRUD 接口通过；含环 DAG 返回 400 |
| #3 WorkflowEngine + NodeExecutors | P0 | 3d | Engine 核心 + 5 个 Executor + TaskLifecycleService 集成 | 3 节点线性流程端到端 |
| #4 前端重构 + 后端对接 | P0 | 3d | 拆分 Workflows.js + WorkflowList + CRUD API 对接 | 创建→编辑→保存→重新打开 |
| #5 监控页 | P1 | 3d | WorkflowMonitor + 节点状态着色 + 操作按钮 | 实时看到 3 节点流程状态变化 |
| #6 预置模板 | P1 | 2d | Flyway 插 3 模板 + 模板 API + 前端加载 | 从模板创建→执行全通 |
| #7 脚本节点 (P2) | P2 | 3d | ScriptNodeExecutor + 前端代码编辑器 | Python 脚本节点端到端 |
| **合计** | | **18d** | | |

### 10.2 依赖与排期

```
#1 → #2 → #3 → #5
      ↓         ↗
      #4 ──────┘
      #2 → #6
      #3 → #7

Week 1 (5/19-5/23): #1 (2d) → #2 (2d) → #4 start
Week 2 (5/26-5/30): #4 complete (2d) + #3 (3d)
Week 3 (6/02-6/06): #5 (3d) + #6 (2d)
Week 4 (6/09-6/13): #7 (3d) + 集成测试
```

### 10.3 里程碑

| 日期 | 内容 | 标准 |
|------|------|------|
| 5/23 | M1: CRUD 打通 | 创建→保存→加载可用 |
| 5/30 | M2: 引擎可跑 | 3 节点线性流程端到端 |
| 6/06 | M3: 完整体验 | 模板可执行+监控 |
| 6/13 | M4: 高级功能 | 全 Issue 完成 |

---

## 附录 A: 与已有系统集成矩阵

| 组件 | 集成方式 | 修改量 |
|------|----------|--------|
| TaskDispatcher | 零修改 — EvalTaskNodeExecutor 创建 PENDING 任务，自动拾取 | 0 行 |
| TaskLifecycleService | 尾部追加回调 | ~10 行 |
| GpuSlotService | 零修改 — 通过 EvaluationTask 间接复用 | 0 行 |
| PlanTaskSplitter | 不涉及 | 0 行 |
| TaskRecoveryScheduler | 零修改 — eval_task 创建的任务自动受保护 | 0 行 |

## 附录 B: 风险与决策点

| # | 风险 | 建议 | 待确认 |
|---|------|------|--------|
| 1 | 前端 18 种节点后端如何映射 | eval_task 统一承载，nodeType 传 Agent 区分 | ✅ |
| 2 | 并行分支 GPU 资源竞争 | 复用 GpuSlotService 排队 + maxParallel 限流 | — |
| 3 | 条件表达式引擎 | MVP 简单比较，V2 引入 JEXL | — |
| 4 | 状态推送方式 | MVP 5s 轮询，V2 WebSocket | ✅ |
| 5 | loop 节点 | P2 排期，MVP 手动展开 | — |
