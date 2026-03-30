# 人工智能软硬件验证平台 - 第一期技术方案（CPU 系统）

## 文档信息

- **版本**: V1.0
- **创建时间**: 2026-03-30
- **作者**: 码农小陈
- **状态**: 初稿
- **关联 Issues**: 待创建

---

## 1. 概述

### 1.1 项目背景

人工智能软硬件验证平台是一个中立权威的评测平台，用于对 AI 芯片、框架、模型等进行性能和精度评测。

### 1.2 第一期目标

**核心目标**: 在 CPU 系统上实现平台核心功能，支持基础评测任务执行。

**范围**:
- ✅ 评测任务管理（创建、调度、监控）
- ✅ 基础评测执行引擎（CPU 版本）
- ✅ 评测报告生成（基础版）
- ✅ 用户认证与权限管理
- ✅ 资源管理（CPU 资源池）

**不在范围** (第二期 L40S GPU 支持):
- ❌ GPU 资源调度
- ❌ 大规模并发评测
- ❌ 高级可视化分析

### 1.3 技术原则

- **轻量级**: 第一期以快速验证为核心，避免过度设计
- **模块化**: 为后续 GPU 扩展预留接口
- **可测试**: 每个模块都有单元测试和集成测试

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      用户接入层                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Web 控制台  │  │  REST API   │  │  CLI 工具    │         │
│  │  (React)    │  │  (Spring)   │  │  (Python)   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      应用服务层                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  任务服务    │  │  报告服务    │  │  用户服务    │         │
│  │  TaskSvc    │  │  ReportSvc  │  │  UserSvc    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  资源服务    │  │  资产服务    │  │  认证服务    │         │
│  │  ResourceSvc│  │  AssetSvc   │  │  AuthService│         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      核心引擎层                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              评测执行引擎 (CPU)                       │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │   │
│  │  │ 模型评测  │ │ 芯片评测  │ │ 框架评测  │            │   │
│  │  └──────────┘ └──────────┘ └──────────┘            │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              任务调度引擎                            │   │
│  │         (优先级队列 + 资源匹配)                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      数据持久层                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ PostgreSQL  │  │   MinIO     │  │   Redis     │         │
│  │  (元数据)    │  │  (文件存储)  │  │   (缓存)    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 技术栈选型

| 组件 | 技术选型 | 版本 | 说明 |
|------|---------|------|------|
| **前端** | React + TypeScript | 18.x | Web 控制台 |
| **UI 框架** | Ant Design | 5.x | 企业级 UI 组件 |
| **后端框架** | Spring Boot | 3.2.x | 主要业务服务 |
| **Python 服务** | FastAPI | 0.109.x | 评测引擎、数据处理 |
| **数据库** | PostgreSQL | 15.x | 关系型数据存储 |
| **缓存** | Redis | 7.x | 会话、热点数据 |
| **文件存储** | MinIO | 2024.x | 对象存储（兼容 S3） |
| **消息队列** | Redis Streams | 7.x | 轻量级任务队列 |
| **容器化** | Docker | 24.x | 容器封装 |
| **编排** | Docker Compose | 2.x | 本地开发/测试 |

### 2.3 模块划分

```
ai-hardware-verification-platform/
├── frontend/                    # React 前端
│   ├── src/
│   │   ├── pages/              # 页面组件
│   │   ├── components/         # 通用组件
│   │   ├── services/           # API 调用
│   │   └── types/              # TypeScript 类型
│   └── package.json
│
├── backend/                     # Spring Boot 后端
│   ├── src/main/java/
│   │   └── com/lab/
│   │       ├── task/           # 任务服务
│   │       ├── report/         # 报告服务
│   │       ├── user/           # 用户服务
│   │       ├── resource/       # 资源服务
│   │       └── common/         # 公共模块
│   └── pom.xml
│
├── engine/                      # Python 评测引擎
│   ├── evaluator/
│   │   ├── model_eval.py       # 模型评测
│   │   ├── chip_eval.py        # 芯片评测
│   │   ├── framework_eval.py   # 框架评测
│   │   └── operator_eval.py    # 算子评测
│   ├── scheduler/
│   │   └── task_scheduler.py   # 任务调度
│   └── requirements.txt
│
├── cli/                         # Python CLI 工具
│   └── ahvp/
│       └── main.py
│
├── docs/                        # 文档
│   ├── requirements/           # 需求卡片
│   ├── tech-design/            # 技术方案
│   └── api/                    # API 文档
│
└── deploy/                      # 部署配置
    ├── docker/
    └── docker-compose.yml
```

---

## 3. 核心模块设计

### 3.1 评测任务管理模块

#### 3.1.1 数据模型

```sql
-- 评测任务表
CREATE TABLE evaluation_tasks (
    id              BIGSERIAL PRIMARY KEY,
    task_no         VARCHAR(64) UNIQUE NOT NULL,      -- 任务编号
    task_type       VARCHAR(32) NOT NULL,              -- 任务类型 (TEMPLATE/CUSTOM)
    eval_type       VARCHAR(32) NOT NULL,              -- 评测类型 (MODEL/CHIP/FRAMEWORK/OPERATOR)
    status          VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    priority        VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',  -- HIGH/MEDIUM/LOW
    
    -- 评测配置
    eval_config     JSONB NOT NULL,                    -- 评测配置参数
    dataset_ids     BIGINT[],                          -- 数据集 ID 列表
    resource_spec   JSONB,                             -- 资源规格要求
    
    -- 资源分配
    allocated_resources JSONB,                         -- 实际分配的资源
    resource_pool_id    BIGINT,                        -- 资源池 ID
    
    -- 进度信息
    progress        INTEGER DEFAULT 0,                 -- 进度百分比 (0-100)
    started_at      TIMESTAMP,                         -- 开始时间
    completed_at    TIMESTAMP,                         -- 完成时间
    
    -- 审计字段
    created_by      BIGINT NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 任务状态枚举
-- PENDING: 待调度
-- QUEUED: 排队中
-- RUNNING: 运行中
-- COMPLETED: 已完成
-- FAILED: 失败
-- CANCELLED: 已取消
```

#### 3.1.2 核心接口

```java
// 任务服务接口
public interface TaskService {
    
    // 创建任务
    TaskDTO createTask(CreateTaskRequest request, Long userId);
    
    // 查询任务列表
    Page<TaskDTO> listTasks(TaskQuery query, Pageable pageable);
    
    // 查询任务详情
    TaskDTO getTaskDetail(Long taskId, Long userId);
    
    // 取消任务
    void cancelTask(Long taskId, Long userId);
    
    // 重试任务
    void retryTask(Long taskId, Long userId);
    
    // 获取任务日志
    List<LogEntry> getTaskLogs(Long taskId, LogQuery query);
}

// 任务调度接口
public interface TaskScheduler {
    
    // 提交任务到调度队列
    void submitTask(Long taskId);
    
    // 从队列获取下一个可执行任务
    Optional<Long> pollNextTask();
    
    // 更新任务状态
    void updateTaskStatus(Long taskId, TaskStatus status, String message);
}
```

#### 3.1.3 任务状态机

```
                    ┌─────────────┐
                    │   PENDING   │
                    │   (待调度)   │
                    └──────┬──────┘
                           │ 提交调度
                           ▼
                    ┌─────────────┐
          ┌────────│   QUEUED    │────────┐
          │        │   (排队中)   │        │
          │        └──────┬──────┘        │
          │               │ 资源分配       │
          │               ▼               │
          │        ┌─────────────┐        │
          │        │   RUNNING   │        │
          │        │   (运行中)   │        │
          │        └──────┬──────┘        │
          │               │               │
     失败/超时       完成/成功        用户取消
          │               │               │
          ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │  FAILED  │   │COMPLETED │   │CANCELLED │
    │  (失败)   │   │ (已完成)  │   │ (已取消)  │
    └──────────┘   └──────────┘   └──────────┘
          │
          │ 重试
          └───────────────┘
```

### 3.2 评测执行引擎

#### 3.2.1 引擎架构

```python
# 评测引擎基类
class EvaluationEngine(ABC):
    
    @abstractmethod
    def validate_config(self, config: Dict) -> ValidationResult:
        """验证评测配置"""
        pass
    
    @abstractmethod
    def execute(self, task_id: str, config: Dict) -> EvaluationResult:
        """执行评测"""
        pass
    
    @abstractmethod
    def cancel(self, task_id: str) -> bool:
        """取消评测"""
        pass

# 模型评测引擎
class ModelEvaluationEngine(EvaluationEngine):
    
    def __init__(self, resource_manager: ResourceManager):
        self.resource_manager = resource_manager
        self.metrics_collector = MetricsCollector()
    
    def execute(self, task_id: str, config: Dict) -> EvaluationResult:
        # 1. 准备环境
        env = self.prepare_environment(config)
        
        # 2. 加载模型
        model = self.load_model(config['model_path'])
        
        # 3. 加载数据集
        dataset = self.load_dataset(config['dataset_id'])
        
        # 4. 执行评测
        metrics = self.run_evaluation(model, dataset, config)
        
        # 5. 收集结果
        result = self.collect_metrics(metrics)
        
        # 6. 清理环境
        self.cleanup(env)
        
        return result
```

#### 3.2.2 评测指标体系

```python
# 模型评测指标
@dataclass
class ModelMetrics:
    # 精度指标
    accuracy: float           # 准确率
    precision: float          # 精确率
    recall: float             # 召回率
    f1_score: float           # F1 分数
    
    # 性能指标
    inference_latency_ms: float    # 推理延迟 (ms)
    throughput_qps: float          # 吞吐量 (queries/sec)
    cpu_utilization: float         # CPU 利用率 (%)
    memory_usage_mb: float         # 内存占用 (MB)
    
    # 资源指标
    execution_time_s: float        # 执行时间 (s)
    peak_memory_mb: float          # 峰值内存 (MB)
```

### 3.3 资源管理模块

#### 3.3.1 CPU 资源池设计

```python
@dataclass
class CPUResource:
    resource_id: str
    node_name: str
    cpu_cores: int
    memory_gb: int
    status: str  # IDLE, BUSY, OFFLINE
    current_tasks: List[str]
    
class CPUResourceManager:
    
    def __init__(self):
        self.resources: Dict[str, CPUResource] = {}
        self.lock = threading.Lock()
    
    def allocate(self, requirement: ResourceRequirement) -> Optional[str]:
        """分配资源"""
        with self.lock:
            for rid, resource in self.resources.items():
                if resource.status == 'IDLE':
                    if (resource.cpu_cores >= requirement.cpu_cores and
                        resource.memory_gb >= requirement.memory_gb):
                        resource.status = 'BUSY'
                        return rid
            return None
    
    def release(self, resource_id: str):
        """释放资源"""
        with self.lock:
            if resource_id in self.resources:
                self.resources[resource_id].status = 'IDLE'
                self.resources[resource_id].current_tasks = []
```

### 3.4 评测报告模块

#### 3.4.1 报告数据结构

```sql
-- 评测报告表
CREATE TABLE evaluation_reports (
    id              BIGSERIAL PRIMARY KEY,
    report_no       VARCHAR(64) UNIQUE NOT NULL,
    task_id         BIGINT NOT NULL,
    
    -- 报告内容
    report_type     VARCHAR(32) NOT NULL,              -- BASIC/ADVANCED
    summary         JSONB NOT NULL,                    -- 报告摘要
    metrics         JSONB NOT NULL,                    -- 详细指标
    charts          JSONB,                             -- 图表数据
    
    -- 文件存储
    pdf_path        VARCHAR(512),                      -- PDF 报告路径
    html_path       VARCHAR(512),                      -- HTML 报告路径
    
    -- 分享信息
    is_public       BOOLEAN DEFAULT FALSE,
    share_token     VARCHAR(64),
    
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 3.4.2 报告生成流程

```python
class ReportGenerator:
    
    def generate(self, task_id: int, metrics: Dict) -> Report:
        # 1. 收集评测数据
        data = self.collect_task_data(task_id)
        
        # 2. 计算统计指标
        stats = self.calculate_statistics(metrics)
        
        # 3. 生成图表
        charts = self.generate_charts(stats)
        
        # 4. 生成 HTML 报告
        html = self.render_html(stats, charts)
        
        # 5. 生成 PDF 报告
        pdf = self.render_pdf(html)
        
        # 6. 存储报告
        report = self.save_report(task_id, html, pdf)
        
        return report
```

---

## 4. API 设计

### 4.1 核心 API 列表

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | /api/v1/tasks | 创建评测任务 | ✅ |
| GET | /api/v1/tasks | 查询任务列表 | ✅ |
| GET | /api/v1/tasks/{id} | 查询任务详情 | ✅ |
| PUT | /api/v1/tasks/{id} | 更新任务 | ✅ |
| DELETE | /api/v1/tasks/{id} | 删除任务 | ✅ |
| POST | /api/v1/tasks/{id}/cancel | 取消任务 | ✅ |
| POST | /api/v1/tasks/{id}/retry | 重试任务 | ✅ |
| GET | /api/v1/tasks/{id}/logs | 获取任务日志 | ✅ |
| GET | /api/v1/reports | 查询报告列表 | ✅ |
| GET | /api/v1/reports/{id} | 查询报告详情 | ✅ |
| POST | /api/v1/reports/{id}/share | 分享报告 | ✅ |
| GET | /api/v1/reports/{id}/download | 下载报告 | ✅ |
| POST | /api/v1/users/register | 用户注册 | ❌ |
| POST | /api/v1/users/login | 用户登录 | ❌ |
| GET | /api/v1/users/profile | 查询用户信息 | ✅ |
| GET | /api/v1/resources | 查询资源列表 | ✅ |

### 4.2 API 响应格式

```json
// 成功响应
{
  "code": 0,
  "message": "success",
  "data": {
    "id": 123,
    "taskNo": "TASK-20260330-001",
    "status": "RUNNING",
    "progress": 45
  },
  "timestamp": 1774850000000
}

// 错误响应
{
  "code": 1001,
  "message": "资源不足，请稍后重试",
  "data": null,
  "timestamp": 1774850000000
}
```

---

## 5. 数据库设计

### 5.1 ER 图

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│    users     │       │    tenants   │       │ resource_pools│
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id           │       │ id           │       │ id           │
│ username     │◄──────┤ name         │       │ name         │
│ email        │       │ quota        │       │ type         │
│ password_hash│       └──────────────┘       │ capacity     │
│ tenant_id    │                              └──────────────┘
│ role         │                                     │
│ status       │                                     │
└──────────────┘                                     │
       │                                             │
       │                                             │
       ▼                                             ▼
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│ evaluation_  │       │   datasets   │       │   resources  │
│    tasks     │       ├──────────────┤       ├──────────────┤
├──────────────┤       │ id           │       │ id           │
│ id           │       │ name         │       │ pool_id      │
│ task_no      │       │ type         │       │ node_name    │
│ task_type    │       │ size         │       │ cpu_cores    │
│ eval_type    │       │ path         │       │ memory_gb    │
│ status       │       │ created_by   │       │ status       │
│ priority     │       └──────────────┘       └──────────────┘
│ eval_config  │
│ dataset_ids  │
│ resource_id  │
│ progress     │
│ created_by   │
└──────────────┘
       │
       │
       ▼
┌──────────────┐       ┌──────────────┐
│ evaluation_  │       │  task_logs   │
│   reports    │       ├──────────────┤
├──────────────┤       │ id           │
│ id           │       │ task_id      │
│ task_id      │       │ level        │
│ report_type  │       │ message      │
│ summary      │       │ timestamp    │
│ metrics      │       └──────────────┘
│ pdf_path     │
│ html_path    │
└──────────────┘
```

### 5.2 索引设计

```sql
-- 任务表索引
CREATE INDEX idx_tasks_status ON evaluation_tasks(status);
CREATE INDEX idx_tasks_created_by ON evaluation_tasks(created_by);
CREATE INDEX idx_tasks_created_at ON evaluation_tasks(created_at);
CREATE INDEX idx_tasks_status_priority ON evaluation_tasks(status, priority);

-- 报告表索引
CREATE INDEX idx_reports_task_id ON evaluation_reports(task_id);
CREATE INDEX idx_reports_share_token ON evaluation_reports(share_token);

-- 日志表索引
CREATE INDEX idx_logs_task_id ON task_logs(task_id);
CREATE INDEX idx_logs_timestamp ON task_logs(timestamp);
```

---

## 6. 部署方案

### 6.1 Docker Compose 配置

```yaml
version: '3.8'

services:
  # PostgreSQL 数据库
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: ahvp
      POSTGRES_USER: ahvp
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./deploy/init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ahvp"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis 缓存
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # MinIO 对象存储
  minio:
    image: minio/minio:RELEASE.2024-01-01T16-36-33Z
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3

  # 后端服务
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      SPRING_PROFILES_ACTIVE: dev
      DB_HOST: postgres
      REDIS_HOST: redis
      MINIO_ENDPOINT: minio:9000
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
    ports:
      - "8080:8080"

  # Python 评测引擎
  engine:
    build:
      context: ./engine
      dockerfile: Dockerfile
    environment:
      DB_HOST: postgres
      REDIS_HOST: redis
      MINIO_ENDPOINT: minio:9000
    depends_on:
      - backend
    volumes:
      - ./data:/data

  # 前端服务
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:80"
    depends_on:
      - backend

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

### 6.2 环境要求

| 环境 | CPU | 内存 | 存储 | 说明 |
|------|-----|------|------|------|
| 开发环境 | 4 核 | 8GB | 50GB | 本地开发 |
| 测试环境 | 8 核 | 16GB | 100GB | 集成测试 |
| 生产环境 | 16 核+ | 32GB+ | 500GB+ | 高可用部署 |

---

## 7. 测试策略

### 7.1 测试分层

```
┌─────────────────────────────────────┐
│         E2E 测试 (10%)               │
│      (完整业务流程验证)              │
└─────────────────────────────────────┘
              ▲
┌─────────────────────────────────────┐
│       集成测试 (20%)                 │
│    (模块间交互验证)                  │
└─────────────────────────────────────┘
              ▲
┌─────────────────────────────────────┐
│       单元测试 (70%)                 │
│      (单模块功能验证)                │
└─────────────────────────────────────┘
```

### 7.2 测试覆盖率目标

| 模块 | 行覆盖率 | 分支覆盖率 |
|------|---------|-----------|
| 任务服务 | ≥80% | ≥70% |
| 评测引擎 | ≥85% | ≥75% |
| 报告服务 | ≥80% | ≥70% |
| 资源服务 | ≥80% | ≥70% |

### 7.3 测试用例示例

```python
# 任务创建测试
def test_create_template_task():
    """测试模板化创建任务"""
    request = CreateTaskRequest(
        task_type='TEMPLATE',
        eval_type='MODEL',
        template_id='template_001',
        priority='HIGH'
    )
    
    response = task_service.create_task(request, user_id=1)
    
    assert response.status == 'PENDING'
    assert response.task_no.startswith('TASK-')
    
# 评测引擎测试
def test_model_evaluation():
    """测试模型评测执行"""
    engine = ModelEvaluationEngine(resource_manager)
    
    config = {
        'model_path': '/models/resnet50.onnx',
        'dataset_id': 1,
        'batch_size': 32
    }
    
    result = engine.execute('task_001', config)
    
    assert result.accuracy > 0
    assert result.inference_latency_ms > 0
```

---

## 8. 里程碑计划

### 8.1 第一阶段：基础框架（2 周）

- [ ] 项目初始化
- [ ] 数据库设计实现
- [ ] 用户认证模块
- [ ] 基础 API 框架

### 8.2 第二阶段：任务管理（3 周）

- [ ] 任务 CRUD 接口
- [ ] 任务状态机实现
- [ ] 任务调度引擎
- [ ] 资源管理模块

### 8.3 第三阶段：评测引擎（4 周）

- [ ] 评测引擎框架
- [ ] 模型评测实现
- [ ] 芯片评测实现
- [ ] 日志采集系统

### 8.4 第四阶段：报告系统（2 周）

- [ ] 报告生成引擎
- [ ] HTML/PDF 导出
- [ ] 报告分享功能

### 8.5 第五阶段：前端开发（3 周）

- [ ] Web 控制台
- [ ] 任务管理页面
- [ ] 报告查看页面
- [ ] 用户管理页面

### 8.6 第六阶段：测试与优化（2 周）

- [ ] 集成测试
- [ ] 性能优化
- [ ] 文档完善
- [ ] 上线准备

**总工期**: 约 16 周（4 个月）

---

## 9. 风险与应对

| 风险 | 影响 | 概率 | 应对措施 |
|------|------|------|---------|
| GitHub 访问不稳定 | 高 | 中 | 本地开发 + 定期同步 |
| CPU 评测性能不足 | 中 | 中 | 优化算法 + 并行处理 |
| 需求变更 | 中 | 高 | 模块化设计 + 敏捷迭代 |
| 人员不足 | 高 | 中 | 优先级排序 + 分阶段交付 |

---

## 10. 附录

### 10.1 开发环境搭建

```bash
# 克隆代码
git clone https://github.com/chenxibj/ai-hardware-verification-platform.git
cd ai-hardware-verification-platform

# 启动依赖服务
cd deploy
docker-compose up -d postgres redis minio

# 初始化数据库
psql -h localhost -U ahvp -d ahvp -f ../deploy/init.sql

# 启动后端
cd ../backend
./mvnw spring-boot:run

# 启动前端
cd ../frontend
npm install
npm run dev

# 启动评测引擎
cd ../engine
pip install -r requirements.txt
python -m evaluator.main
```

### 10.2 相关文档

- [需求总览](../requirements/00-README-需求总览.md)
- [架构设计](../架构设计.md)
- [API 文档](./api.md) (待创建)

---

*文档版本：V1.0*  
*创建时间：2026-03-30*  
*最后更新：2026-03-30*
