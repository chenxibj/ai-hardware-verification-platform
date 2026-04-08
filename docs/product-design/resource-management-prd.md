# 资源管理模块 PRD v2.0

> **文档版本:** v2.0  
> **创建日期:** 2026-04-09  
> **更新日期:** 2026-04-09  
> **作者:** 菜菜子（产品经理）  
> **状态:** 评审反馈合入，MVP 裁剪完成  
> **目标读者:** 前后端开发、架构师、测试团队、运维  
> **关联文档:** product-design-v3.2.md 第六部分（Module 5: 异构资源纳管）  
> **变更说明:** 基于麦克雷评审反馈 + chenxi 最终决策，路线图从 18 周裁剪至 8 周 MVP

---

## 变更记录

| 版本 | 日期 | 变更内容 | 决策来源 |
|------|------|---------|---------|
| v1.0 | 2026-04-09 | 初版 | 菜菜子 |
| v2.0 | 2026-04-09 | MVP 裁剪：路线图 18→8 周；K8s 去掉云API/配额/证书/HIBERNATED；调度只留 least_loaded；监控用 PG 不引入 Prometheus/Loki；保留自愈（chenxi 要求）；密钥用环境变量不上 KMS；节点 1:1 资源池；菜单扁平化 | 麦克雷评审 + chenxi 决策 |

---

## 1. 概述

### 1.1 背景

AHVP 当前的资源管理（Module 5）仅支持独立计算节点的接入和基础监控。随着业务发展，客户的计算资源形态日趋多样——既有裸金属/虚拟机形式的独立节点，也有已建成的 Kubernetes 集群。现有设计无法纳管 K8s 集群，资源池也缺少类型区分，导致调度策略设计复杂且扩展困难。

**当前紧迫问题：** 已有节点管理功能不完善——基础 CRUD 不全、GET /compute-nodes 返回 500、节点离线无法自动识别。需先修复基础再加新功能。

### 1.2 目标

1. **修复节点基础功能** — 完善节点 CRUD、心跳状态同步、离线自动识别（P0，最高优先级）
2. **引入资源池** — NODE_POOL 类型化管理，评测任务通过资源池选择执行环境
3. **引入集群管理** — 支持 kubeconfig + Agent 两种方式注册 K8s 集群
4. **基础运维** — PostgreSQL 存储监控数据，飞书 Webhook 告警，自愈策略减少人工介入

### 1.3 范围（MVP 裁剪后）

| 在 MVP 范围内 | 推迟到 Future |
|--------------|--------------|
| 节点管理 CRUD 完善 + 状态同步 | 云厂商 API 直接接入集群 |
| 节点标签管理（key:value） | 资源配额管理（K8s ResourceQuota） |
| NODE_POOL 资源池 CRUD | 证书管理 |
| K8s 集群注册（kubeconfig + Agent） | 集群状态 HIBERNATED |
| K8S_POOL 资源池 | 高级调度策略（亲和性/优先级/抢占） |
| least_loaded 调度策略 | 自动扩缩容（HPA） |
| 基础监控（PG 存储） | Prometheus / Loki 时序监控 |
| 飞书 Webhook 告警 | 多渠道告警（钉钉/邮件） |
| 自愈策略（Agent 重启/异常标记） | KMS 密钥管理 |

### 1.4 设计参考

| 产品 | 提炼的最佳实践 | 在本 PRD 中的应用 |
|------|--------------|-----------------|
| **阿里云 ACK** | 注册集群通过 Agent 接入 | 集群 Agent 接入模式 |
| **Rancher** | kubectl apply Agent manifest 注册集群 | 注册流程（生成命令→执行→等待→Active） |
| **AWS EKS** | EKS Connector 接入外部集群 | kubeconfig / Agent 双模式接入 |

---

## 2. 术语定义

| 术语 | 英文 | 定义 |
|------|------|------|
| 计算节点 | Compute Node | 已注册到平台的独立服务器（物理机或虚拟机），通过 Agent 上报心跳和指标 |
| K8s 集群 | Kubernetes Cluster | 已部署的 Kubernetes 集群，通过 kubeconfig 或 Agent 接入平台 |
| 资源池 | Resource Pool | 资源的逻辑分组，类型为 NODE_POOL（只含节点）或 K8S_POOL（只含集群） |
| Agent | Agent | 部署在节点或集群中的轻量守护进程，负责心跳、指标采集、任务执行 |
| 调度策略 | Scheduling Policy | 决定评测任务分配到哪个资源上执行的规则。**MVP 阶段仅实现 least_loaded** |

---

## 3. 系统架构

### 3.1 资源管理整体架构（MVP 版）

```
┌─────────────────────────────────────────────────────────────────┐
│                        AHVP 前端 (React)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ 节点管理  │  │ 集群管理  │  │ 资源池    │  │ 运维监控      │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬────────┘   │
└───────┼──────────────┼────────────┼───────────────┼─────────────┘
        │              │            │               │
        ▼              ▼            ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Gateway (REST)                           │
└───────┬──────────────┬────────────┬───────────────┬─────────────┘
        │              │            │               │
        ▼              ▼            ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌────────────┐ ┌──────────────┐
│ Node Service │ │Cluster Svc   │ │ Pool Svc   │ │ Monitor Svc  │
│              │ │              │ │            │ │              │
│ - CRUD       │ │ - 注册/注销  │ │ - CRUD     │ │ - 指标采集   │
│ - 状态同步   │ │ - 信息同步   │ │ - 资源绑定  │ │ - 飞书告警   │
│ - 标签管理   │ │ - 健康检查   │ │ - least_   │ │ - 健康检查   │
│ - 心跳管理   │ │              │ │   loaded   │ │ - 自愈策略   │
└──────┬───────┘ └──────┬───────┘ └─────┬──────┘ └──────┬───────┘
       │                │               │               │
       ▼                ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        数据层                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            PostgreSQL（元数据 + 监控数据 + 日志）           │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
       ▲                ▲
       │                │
┌──────┴───────┐ ┌──────┴───────┐
│  Node Agent  │ │ Cluster Agent│
│  (每个节点)   │ │ (每个集群)   │
│  - 心跳上报   │ │ - K8s API    │
│  - 指标采集   │ │ - 指标转发   │
│  - 任务执行   │ │              │
└──────────────┘ └──────────────┘
```

> **v2.0 变更：** 数据层简化为纯 PostgreSQL，去掉 Redis / Prometheus / Loki / ES。监控数据和日志统一存 PG，在节点数 <10 的阶段完全够用。

### 3.2 资源管理三层模型

```
                    ┌─────────────────────┐
                    │     资源池 (Pool)     │
                    │  type: NODE_POOL     │──── 只能添加 Compute Node（1:1）
                    │  type: K8S_POOL      │──── 只能添加 K8s Cluster（1:1）
                    └──────────┬──────────┘
                               │ 1:N
               ┌───────────────┼───────────────┐
               ▼                               ▼
    ┌─────────────────┐             ┌─────────────────┐
    │  Compute Node   │             │  K8s Cluster    │
    │  (独立计算节点)  │             │  (K8s 集群)     │
    │                 │             │                 │
    │  Agent 心跳     │             │  kubeconfig     │
    │  直连调度       │             │  或 Agent 接入  │
    └─────────────────┘             └─────────────────┘
```

> **v2.0 变更：** 节点/集群与资源池为 **1:1** 关系——一个节点只能属于一个 NODE_POOL，一个集群只能属于一个 K8S_POOL。避免多池调度冲突导致资源超分。

---

## 4. 功能模块详细设计

### 4.1 节点管理

#### 4.1.1 节点 CRUD（P0 — 第一优先级修复）

**User Story:** 作为平台管理员，我需要创建、查看、编辑、删除计算节点，这是资源管理的最基本能力。

**当前问题：** GET /compute-nodes 返回 500，CRUD 不完整。**P0 阶段首先修复这些基础问题。**

**创建节点表单：**

| 字段 | 标识 | 类型 | 必填 | 控件 | 校验规则 |
|------|------|------|------|------|---------|
| 节点名称 | name | string | ✅ | 文本输入 | 1-100字符，唯一 |
| IP 地址 | ipAddress | string | ✅ | 文本输入 | 合法 IP 地址 |
| Agent 端口 | agentPort | number | ✅ | 数字输入 | 1-65535，默认 8089 |
| 节点类型 | nodeType | enum | ✅ | 单选下拉 | CPU / GPU / NPU / MIXED |
| 描述 | description | string | ❌ | 多行文本 | ≤500字符 |

**交互描述:**
- 节点列表页顶部 [+ 创建节点] 按钮 → 弹出创建对话框
- 节点行内 [编辑] → 弹出编辑对话框（可修改：名称、描述）
- 节点行内 [删除] → Popconfirm "确定删除该节点？" → 确认后删除
- 删除有运行中任务的节点需二次确认

**验收标准:**
- AC-1: GET /compute-nodes 正常返回节点列表（修复当前 500 错误）
- AC-2: POST /compute-nodes 创建节点成功
- AC-3: PUT /compute-nodes/{id} 编辑节点成功
- AC-4: DELETE /compute-nodes/{id} 删除节点成功
- AC-5: 节点名称重复时返回 409 错误

#### 4.1.2 节点状态管理（P0）

**User Story:** 作为运维工程师，我需要实时了解节点的在线/离线状态，离线节点不应被调度。

**状态机（MVP 简化版）:**

```
                  ┌──────────┐
     创建节点 ───▶│  ONLINE  │
                  └────┬─────┘
                       │ 心跳超时（>2分钟）
                       ▼
                  ┌──────────┐
                  │ OFFLINE  │
                  └────┬─────┘
                       │ 心跳恢复
                       ▼
                  恢复为 ONLINE
                  
   手动操作:
   ONLINE ──▶ MAINTENANCE（维护模式，不接受新任务）
   MAINTENANCE ──▶ ONLINE
```

> **v2.0 变更：** 去掉 PENDING（暂不做 Agent 自动注册审批流）和 ABNORMAL（合并到 OFFLINE + 告警）。状态简化为 ONLINE / OFFLINE / MAINTENANCE。

**心跳机制:**
- Agent 每 30s 发送心跳到平台
- 平台后台定时任务（每 60s）检查所有节点心跳
- 超过 2 分钟无心跳 → 自动标记 OFFLINE
- 心跳恢复 → 自动标记 ONLINE（自愈策略的一部分）

**验收标准:**
- AC-1: 心跳超时阈值 2 分钟，节点自动标为 OFFLINE
- AC-2: 心跳恢复后节点自动恢复 ONLINE
- AC-3: OFFLINE 节点不参与任务调度
- AC-4: MAINTENANCE 节点不接受新任务但不中断已有任务
- AC-5: 状态变更记录到事件日志

#### 4.1.3 节点信息展示

**节点列表页列定义:**

| 列 | 说明 |
|----|------|
| 状态 | 🟢 ONLINE / 🔴 OFFLINE / 🔵 MAINTENANCE |
| 节点名称 | 点击进入详情 |
| 类型 | CPU/GPU/NPU 标签 |
| IP 地址 | |
| CPU 使用率 | 进度条（来自监控数据） |
| 内存使用率 | 进度条 |
| GPU | X/Y 卡（P3 阶段才有数据） |
| 标签 | 标签气泡 |
| 资源池 | 所在资源池名 |
| 最后心跳 | 时间戳 |
| 操作 | [编辑] [删除] |

#### 4.1.4 节点标签管理（P1）

**User Story:** 作为管理员，我需要为节点打标签（如 `gpu:a100`, `env:prod`），以便资源池按标签筛选和后续调度匹配。

**标签格式:** `key:value`，key 和 value 均为字母数字下划线，key ≤ 64 字符，value ≤ 128 字符。

**操作:**
- 节点编辑对话框中增加标签输入区域
- 输入 key:value → 回车确认
- 每个节点最多 20 个标签

**验收标准:**
- AC-1: 标签修改即时生效
- AC-2: 标签格式校验（key:value）
- AC-3: 节点列表支持按标签筛选

---

### 4.2 K8s 集群管理（P2 — 新功能）

#### 4.2.1 集群注册

**User Story:** 作为平台管理员，我需要将已有的 K8s 集群接入平台，以便在集群上运行容器化的评测任务。

**MVP 只支持两种接入方式:**

| 方式 | 适用场景 | 网络要求 |
|------|---------|---------|
| **Kubeconfig 导入** | 集群可被平台直连 | 平台→集群 API Server 可达 |
| **Agent 接入** | 集群在内网/防火墙后 | 集群→平台可达即可 |

> **v2.0 变更：** 去掉"云 API 对接"方式（复杂度高，每个云厂商不一样，ROI 低）。推迟到 Future。

**方式一：Kubeconfig 导入**

| 字段 | 标识 | 类型 | 必填 | 校验 |
|------|------|------|------|------|
| 集群名称 | name | string | ✅ | 1-100字符，唯一 |
| Kubeconfig | kubeconfig | text | ✅ | 有效 YAML + 包含 server/cert |
| 描述 | description | string | ❌ | ≤500字符 |

流程: 上传 kubeconfig → [测试连接] → 成功后显示集群版本/节点数/资源概览 → [确认注册]

**方式二：Agent 接入**

流程:
1. 管理员填写集群名称 → 点击 [生成接入命令]
2. 平台生成 kubectl apply 命令
3. 运维在目标集群执行命令，部署 AHVP Cluster Agent
4. Agent 主动连接平台，上报集群信息
5. 集群状态从 REGISTERING → ACTIVE

**验收标准:**
- AC-1: Kubeconfig 上传后 10s 内完成连接测试
- AC-2: Agent 方式支持 K8s 1.22+
- AC-3: 注册令牌有效期 24 小时
- AC-4: 注册成功后自动同步集群节点列表和资源总量
- AC-5: kubeconfig 文件经 AES-256 加密存储，密钥通过环境变量管理

#### 4.2.2 集群信息展示

**集群列表页列定义:**

| 列 | 说明 |
|----|------|
| 状态 | 🟢 ACTIVE / 🔴 UNREACHABLE / 🟡 REGISTERING |
| 集群名称 | 点击进入详情 |
| K8s 版本 | |
| 节点数 | Master + Worker |
| 接入方式 | Kubeconfig / Agent 标签 |
| CPU | 已用/总量 |
| 内存 | 已用/总量 |
| GPU | 已用/总量 |
| 操作 | [详情] [编辑] [注销] |

**集群详情页（简化版）:**

| Tab | 内容 |
|-----|------|
| 概览 | 资源总量/已用/可用 + 节点列表 + 最近事件 |
| 命名空间 | namespace 列表（**只读查看**，不在平台创建） |
| 工作负载 | 平台创建的 Job/Pod 列表 |
| 日志 | Agent 日志 + K8s 事件日志 |

> **v2.0 变更：** 去掉"监控"和"证书"Tab。命名空间只读查看不做创建和配额管理。

#### 4.2.3 集群健康检查（基础版）

**自动检查项（每 5 分钟）:**

| 检查项 | 方法 | 健康标准 |
|--------|------|---------|
| API Server 可达 | GET /healthz | 返回 ok |
| 节点状态 | kubectl get nodes | 至少 1 个 Ready |
| AHVP Agent 状态 | Agent 心跳 | 心跳正常 |

> **v2.0 变更：** 只保留最基础的 3 项检查。去掉系统 Pod 状态、证书检测、资源压力检测。

**验收标准:**
- AC-1: API Server 不可达时 30s 内标记集群 UNREACHABLE
- AC-2: API Server 恢复后自动恢复 ACTIVE

#### 4.2.4 集群注销

**注销流程:**
1. 检查集群上是否有运行中的评测任务 → 有则提示先完成或终止
2. 二次确认（输入集群名称）
3. 清理 Agent 相关资源
4. 删除加密存储的 kubeconfig
5. 从关联的 K8S_POOL 中移除

**验收标准:**
- AC-1: 注销需输入集群名称确认
- AC-2: 注销后 kubeconfig 被删除

#### 4.2.5 集群状态机（简化版）

```
                    ┌──────────────┐
  注册发起 ────────▶│ REGISTERING  │
                    └──────┬───────┘
                           │ 连接成功 + 信息同步完成
                           ▼
                    ┌──────────────┐  API Server 不可达  ┌───────────────┐
                    │    ACTIVE    │ ──────────────────▶ │  UNREACHABLE  │
                    └──────────────┘ ◀────────────────── └───────────────┘
                                       恢复连接
```

> **v2.0 变更：** 去掉 CONNECTED（合并到注册流程内部）和 HIBERNATED（华为 CCE 特有概念，不需要）。

---

### 4.3 资源池管理（P1 NODE_POOL / P2 K8S_POOL）

#### 4.3.1 创建资源池

**User Story:** 作为管理员，我需要创建资源池将同类资源分组管理，评测任务通过资源池选择执行环境。

**创建表单:**

| 字段 | 标识 | 类型 | 必填 | 校验 |
|------|------|------|------|------|
| 池名称 | name | string | ✅ | 1-100字符，唯一 |
| 池类型 | poolType | enum | ✅ | NODE_POOL / K8S_POOL（创建后不可变） |
| 描述 | description | string | ❌ | ≤500字符 |

> **v2.0 变更：** 
> - 去掉调度策略字段（MVP 只实现 least_loaded，无需选择）
> - 去掉绑定租户字段（当前无多租户需求）
> - 去掉池标签字段（简化）

**交互:**
- 选择 NODE_POOL → 显示可用节点列表（未加入其他池的 ONLINE 节点）
- 选择 K8S_POOL → 显示可用集群列表（未加入其他池的 ACTIVE 集群）
- **一个节点只能属于一个 NODE_POOL，一个集群只能属于一个 K8S_POOL**

**验收标准:**
- AC-1: NODE_POOL 只能添加计算节点，K8S_POOL 只能添加集群
- AC-2: 一个节点只能属于一个 NODE_POOL（添加时已在其他池的节点不可选）
- AC-3: 池类型创建后不可修改

#### 4.3.2 添加/移除资源

**添加:**
- 资源池详情页 → [+ 添加资源] → 弹出可选资源列表
- 已加入其他池的资源灰色不可选（1:1 约束）
- 勾选 → [确认添加]

**移除:**
- 资源行 [移除] → 有运行中任务时需确认 → 移除

**验收标准:**
- AC-1: 添加/移除实时生效
- AC-2: 1:1 约束在应用层校验

#### 4.3.3 资源池状态

| 状态 | 说明 |
|------|------|
| ACTIVE | 正常运行，可被调度 |
| INACTIVE | 已停用，不参与调度 |

> **v2.0 变更：** 去掉 MAINTENANCE 状态（与 INACTIVE 功能重叠，简化）。

---

### 4.4 调度策略（MVP: least_loaded only）

#### 4.4.1 节点池调度 — least_loaded

**User Story:** 作为管理员，评测任务提交后系统自动将任务分配到负载最低的在线节点。

**调度流程:**
```
评测任务 → 选择 NODE_POOL → 调度引擎
   → 筛选: 池内 ONLINE 状态的节点
   → 排序: 按当前运行任务数升序（least_loaded）
   → 分配: 选择任务数最少的节点
   → 执行: 通过 Agent 在节点上执行评测
```

**验收标准:**
- AC-1: 任务分配到池内运行任务数最少的在线节点
- AC-2: 无可用节点时任务进入排队状态
- AC-3: 节点从 ONLINE 变为 OFFLINE 时，不影响已运行的任务

#### 4.4.2 集群池调度 — least_loaded

**调度流程:**
```
评测任务 → 选择 K8S_POOL → 调度引擎
   → 选择集群: 池内 ACTIVE 集群中运行任务最少的
   → 生成 Job: 将评测任务转为 K8s Job manifest
   → 提交 Job: 通过 K8s API 创建 Job
   → 监控: 监听 Pod 状态变化
   → 结果回收: Job 完成后收集日志和结果
```

#### 4.4.3 预留设计（暂不实现）

以下调度策略保留设计但 **MVP 阶段不实现**：

| 策略 | 说明 | 实现时机 |
|------|------|---------|
| round_robin | 轮询分配 | Future |
| priority | 按节点权重优先分配 | Future |
| label_affinity | 按标签亲和性匹配 | Future |
| 优先级抢占 | 高优先级任务抢占低优先级资源 | Future |
| 反亲和性 | 避免运行在某些资源上 | Future |
| HPA 自动扩缩容 | 根据负载自动扩缩 | Future |

---

### 4.5 运维监控（P3）

#### 4.5.1 监控数据采集

**存储方案：PostgreSQL**

> **v2.0 变更：** 不引入 Prometheus / Loki。监控数据统一存 PostgreSQL。当前节点数 <10，PG 完全够用。数据量上来了再迁移。

**监控指标（MVP）:**

| 指标 | 节点 | 集群 | 采集频率 | 保留时间 |
|------|------|------|---------|---------|
| CPU 使用率 | ✅ | ✅ | 60s | 30 天 |
| 内存使用率 | ✅ | ✅ | 60s | 30 天 |
| GPU 使用率 | ✅ | ✅ | 60s | 30 天 |
| 磁盘使用率 | ✅ | ❌ | 300s | 30 天 |

> **v2.0 变更：** 采集频率从 15s 放宽到 60s/300s（PG 存储，减少写入压力）。去掉网络流量、GPU 温度、GPU 显存等非核心指标。

**监控表设计:**
```sql
CREATE TABLE resource_metrics (
    id BIGSERIAL PRIMARY KEY,
    resource_type VARCHAR(20) NOT NULL,  -- 'NODE' or 'CLUSTER'
    resource_id UUID NOT NULL,
    metric_name VARCHAR(50) NOT NULL,    -- 'cpu_usage', 'memory_usage', etc.
    metric_value DECIMAL(10,2) NOT NULL,
    collected_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_metrics_resource ON resource_metrics(resource_type, resource_id, collected_at);
-- 30天自动清理（定时任务）
```

#### 4.5.2 监控面板

**全局 Dashboard 布局（简化版）:**
- **顶部:** 4 个统计卡片（节点数 / 集群数 / 资源池数 / 告警数）
- **中部:** 节点/集群 CPU/内存 使用率 Top 10 柱状图
- **底部:** 最近告警列表

**数据获取：** REST 轮询（30s 间隔）

> **v2.0 变更：** 去掉 SSE 实时推送。监控面板使用 REST + 前端定时轮询。

**验收标准:**
- AC-1: Dashboard 页面加载 ≤ 3s
- AC-2: 数据延迟 ≤ 60s（一个采集周期）

#### 4.5.3 飞书告警

**User Story:** 作为管理员，当资源异常时我需要在飞书收到通知。

**MVP 告警规则（硬编码，不做规则配置 UI）:**

| 规则 | 条件 | 级别 |
|------|------|------|
| 节点离线 | 心跳超时 > 2min | CRITICAL |
| 磁盘空间不足 | 磁盘使用率 > 90% | WARNING |
| 内存不足 | 内存使用率 > 95% | CRITICAL |
| 集群不可达 | API Server 不可达 | CRITICAL |

> **v2.0 变更：** MVP 阶段告警规则硬编码在后端代码中，不做规则配置 UI。通知渠道只做飞书 Webhook，不做钉钉/邮件。

**飞书告警消息格式:**
```
[AHVP 告警] [CRITICAL] 节点离线
资源: node-gpu-01
时间: 2026-04-09 10:30:15
详情: 节点心跳超时 > 2 分钟
链接: http://39.97.251.94/resource/nodes/xxx
```

**验收标准:**
- AC-1: 告警触发后 60s 内发送飞书通知
- AC-2: 告警消息包含资源名称、时间、详情、链接

#### 4.5.4 自愈策略

> **v2.0 变更：** chenxi 明确要求**保留自愈**（与麦克雷建议 #5 "去掉自愈" 相反）。系统尽量不要人工介入。

**MVP 自愈策略:**

| 触发条件 | 自愈动作 | 需人工确认 | 说明 |
|---------|---------|-----------|------|
| Agent 心跳超时 > 2min | 标记 OFFLINE + 尝试 SSH 重启 Agent | ❌ | 自动执行 |
| Agent 心跳恢复 | 自动恢复 ONLINE | ❌ | 自动执行 |
| K8s API Server 不可达 > 5min | 标记 UNREACHABLE + 飞书告警 | ❌ | 只告警不操作 |
| 磁盘 > 95% | 自动清理 /tmp 和评测临时文件 | ❌ | 自动执行 |

**自愈日志表:**
```sql
CREATE TABLE self_healing_logs (
    id BIGSERIAL PRIMARY KEY,
    resource_type VARCHAR(20) NOT NULL,
    resource_id UUID NOT NULL,
    trigger_condition VARCHAR(200) NOT NULL,
    action_taken VARCHAR(200) NOT NULL,
    result VARCHAR(20) NOT NULL,      -- 'SUCCESS' / 'FAILED'
    detail TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**验收标准:**
- AC-1: Agent 离线后自动尝试重启，结果记录到 self_healing_logs
- AC-2: 自愈动作执行后发送飞书通知
- AC-3: 所有自愈动作有完整日志可查

---

## 5. 数据模型

### 5.1 核心表结构

**compute_nodes（计算节点表）— 在已有基础上增强**

| 字段 | 类型 | 必填 | 说明 | 变更 |
|------|------|------|------|------|
| id | BIGINT | PK | 主键 | 已有 |
| name | VARCHAR(100) | ✅ | 节点名称，唯一 | 已有 |
| ip_address | VARCHAR(45) | ✅ | IP 地址 | 已有 |
| agent_port | INT | ✅ | Agent 端口，默认 8089 | 已有 |
| node_type | VARCHAR(20) | ❌ | CPU/GPU/NPU/MIXED | 新增 |
| status | VARCHAR(20) | ✅ | ONLINE/OFFLINE/MAINTENANCE | 已有 |
| labels | JSONB | ❌ | 标签 {"gpu":"a100"} | 新增（nullable） |
| hardware_info | JSONB | ❌ | CPU/GPU/内存硬件信息 | 新增（nullable） |
| last_heartbeat | TIMESTAMP | ❌ | 最后心跳时间 | 已有 |
| description | TEXT | ❌ | 备注 | 已有 |
| pool_id | BIGINT | FK,nullable | 所属资源池（1:1） | 新增 |
| created_at | TIMESTAMP | ✅ | | 已有 |
| updated_at | TIMESTAMP | ✅ | | 已有 |

> **v2.0 变更：** 所有新增字段 nullable，向前兼容。增加 pool_id 直接关联资源池（1:1 关系不需要中间表）。去掉 token_hash、software_info、tenant_id（MVP 不需要）。

**k8s_clusters（K8s 集群表）— 新增**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | BIGSERIAL | PK | |
| name | VARCHAR(100) | ✅ | 集群名称，唯一 |
| status | VARCHAR(20) | ✅ | REGISTERING/ACTIVE/UNREACHABLE |
| access_type | VARCHAR(20) | ✅ | KUBECONFIG/AGENT |
| kubeconfig_encrypted | TEXT | ❌ | AES-256 加密的 kubeconfig |
| api_server_url | VARCHAR(512) | ❌ | API Server 地址 |
| k8s_version | VARCHAR(50) | ❌ | Kubernetes 版本 |
| node_count | INT | ❌ | 集群节点数 |
| total_cpu | DECIMAL | ❌ | 总 CPU 核数 |
| total_memory_gb | DECIMAL | ❌ | 总内存(GiB) |
| total_gpu | INT | ❌ | 总 GPU 数 |
| last_sync_at | TIMESTAMP | ❌ | 最后同步时间 |
| description | TEXT | ❌ | |
| pool_id | BIGINT | FK,nullable | 所属 K8S_POOL |
| created_at | TIMESTAMP | ✅ | |
| updated_at | TIMESTAMP | ✅ | |

> **v2.0 变更：** 去掉 cloud_provider、cloud_cluster_id、cloud_credentials_encrypted（无云 API 接入）、cert_expiry（无证书管理）、health_score（简化）、tenant_id。增加 pool_id。

**resource_pools（资源池表）— 新增**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | BIGSERIAL | PK | |
| name | VARCHAR(100) | ✅ | 池名称，唯一 |
| pool_type | VARCHAR(20) | ✅ | NODE_POOL / K8S_POOL（不可变） |
| status | VARCHAR(20) | ✅ | ACTIVE / INACTIVE |
| description | TEXT | ❌ | |
| created_at | TIMESTAMP | ✅ | |
| updated_at | TIMESTAMP | ✅ | |

> **v2.0 变更：** 去掉 scheduling_policy（固定 least_loaded）、labels、tenant_ids。1:1 关系通过 compute_nodes.pool_id / k8s_clusters.pool_id 实现，不需要 pool_resources 中间表。

**resource_metrics（监控数据表）— 新增**

见 4.5.1 节。

**self_healing_logs（自愈日志表）— 新增**

见 4.5.4 节。

---

## 6. API 设计

### 6.1 节点管理 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/compute-nodes | 节点列表（分页 + 筛选） | P0 |
| POST | /api/compute-nodes | 创建节点 | P0 |
| GET | /api/compute-nodes/{id} | 节点详情 | P0 |
| PUT | /api/compute-nodes/{id} | 编辑节点 | P0 |
| DELETE | /api/compute-nodes/{id} | 删除节点 | P0 |
| PUT | /api/compute-nodes/{id}/labels | 更新标签 | P1 |

> **v2.0 变更：** 保持已有 API 路径 `/api/compute-nodes`。去掉注册/审批/诊断/SSE metrics/批量标签等 API。

### 6.2 集群管理 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/k8s-clusters | 集群列表 | P2 |
| POST | /api/k8s-clusters | 注册集群(kubeconfig) | P2 |
| POST | /api/k8s-clusters/agent-token | 生成 Agent 接入令牌 | P2 |
| GET | /api/k8s-clusters/{id} | 集群详情 | P2 |
| PUT | /api/k8s-clusters/{id} | 编辑集群 | P2 |
| DELETE | /api/k8s-clusters/{id} | 注销集群 | P2 |
| POST | /api/k8s-clusters/{id}/sync | 手动同步集群信息 | P2 |

### 6.3 资源池 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/resource-pools | 资源池列表 | P1 |
| POST | /api/resource-pools | 创建资源池 | P1 |
| GET | /api/resource-pools/{id} | 资源池详情（含关联资源） | P1 |
| PUT | /api/resource-pools/{id} | 编辑资源池 | P1 |
| DELETE | /api/resource-pools/{id} | 删除资源池 | P1 |
| POST | /api/resource-pools/{id}/nodes | 添加节点到池 | P1 |
| DELETE | /api/resource-pools/{id}/nodes/{nodeId} | 从池移除节点 | P1 |
| POST | /api/resource-pools/{id}/clusters | 添加集群到池 | P2 |
| DELETE | /api/resource-pools/{id}/clusters/{clusterId} | 从池移除集群 | P2 |

### 6.4 监控 API

| Method | Path | 说明 | 阶段 |
|--------|------|------|------|
| GET | /api/monitoring/dashboard | 全局监控数据 | P3 |
| GET | /api/monitoring/metrics | 资源监控指标（按资源+时间范围查询） | P3 |
| GET | /api/monitoring/alerts | 告警列表 | P3 |
| GET | /api/monitoring/self-healing-logs | 自愈日志列表 | P3 |

---

## 7. 前端页面设计

### 7.1 导航菜单结构（扁平化）

```
📦 资源管理
├── 🖥️ 节点管理        ← P0
├── ☸️ 集群管理        ← P2
├── 🗂️ 资源池          ← P1
└── 📊 运维监控        ← P3（含告警、自愈日志）
```

> **v2.0 变更：** 扁平化为 4 个一级入口。去掉"资源概览 Dashboard"（合并到运维监控）、"待审批节点"（无审批流）、"调度策略"（固定 least_loaded 无需配置）、"运维中心"层级（直接叫"运维监控"）。

### 7.2 页面清单

| 页面 | 路由 | 阶段 | 说明 |
|------|------|------|------|
| 节点列表 | /resource/nodes | P0 | CRUD + 状态展示 |
| 集群列表 | /resource/clusters | P2 | 列表 + 注册入口 |
| 集群注册 | /resource/clusters/register | P2 | kubeconfig + Agent 两种方式 |
| 集群详情 | /resource/clusters/{id} | P2 | Tab: 概览/命名空间/工作负载/日志 |
| 资源池列表 | /resource/pools | P1 | 卡片视图 |
| 资源池详情 | /resource/pools/{id} | P1 | 资源列表 + 操作 |
| 运维监控 | /resource/monitoring | P3 | Dashboard + 告警 + 自愈日志 |

---

## 8. 与评测系统的集成

### 8.1 评测任务创建时选择资源池

**当前流程修改（P1 实现）:**

原: 直接选择计算节点（或无选择）
新: 选择资源池 → least_loaded 自动分配

**交互:**
- 评测任务创建页面增加"资源池选择"步骤
- 展示 ACTIVE 状态的资源池卡片
- 卡片显示: 池名 + 类型(NODE/K8S) + 在线资源数 + 资源使用情况
- 选择后系统自动调度，无需手动选择具体节点

### 8.2 调度引擎

```
评测任务提交
    │
    ▼
┌──────────────┐
│ 读取资源池类型 │
└──────┬───────┘
       │
       ├── NODE_POOL ──▶ least_loaded 选节点 → Agent 执行
       │
       └── K8S_POOL ──▶ least_loaded 选集群 → K8s Job 执行
```

---

## 9. 安全设计（简化版）

### 9.1 Kubeconfig 安全存储

- 存储: AES-256-GCM 加密后存入 PostgreSQL
- **密钥管理（MVP）: 加密密钥通过环境变量 `KUBECONFIG_ENCRYPT_KEY` 注入**
- 前端不回显 kubeconfig 内容

> **v2.0 变更：** chenxi 指示暂不考虑 KMS。MVP 用环境变量管理密钥，简单可靠。KMS 推迟到 Future。

### 9.2 密钥轮转方案

1. 设置新的环境变量 `KUBECONFIG_ENCRYPT_KEY_NEW`
2. 运行迁移脚本：用旧密钥解密所有 kubeconfig，用新密钥重新加密
3. 替换环境变量
4. 删除旧密钥

### 9.3 "忘记密钥" 恢复方案

**没有恢复方案。** 密钥丢失意味着所有加密的 kubeconfig 无法解密，需要管理员重新导入 kubeconfig 文件。因此密钥必须在可靠位置保存备份。

---

## 10. 实现路线图（8 周 MVP）

### P0 — 修复节点基础功能（1 周）

| 任务 | 交付物 |
|------|--------|
| 修复 GET /compute-nodes 500 错误 | API 正常返回 |
| 完善节点 CRUD（创建/编辑/删除） | 后端 API + 前端对话框 |
| 心跳超时自动标记 OFFLINE | 定时任务 |
| 心跳恢复自动标记 ONLINE | 状态同步逻辑 |
| 前端 NodeList 增加创建/编辑/删除操作 | 前端页面 |

**里程碑:** 节点管理 CRUD 完整可用，状态自动同步

### P1 — 节点标签 + 资源池 + 评测对接（2 周）

| 任务 | 交付物 |
|------|--------|
| 节点标签管理（CRUD + 按标签筛选） | 标签 API + 前端 |
| NODE_POOL 资源池 CRUD | 资源池 API + 前端 |
| 节点关联资源池（1:1） | pool_id 关联 |
| 评测任务创建页增加资源池选择 | 前端改造 |
| least_loaded 调度策略实现 | 调度引擎 |

**里程碑:** 评测任务可通过 NODE_POOL 资源池选择节点并执行

### P2 — K8s 集群注册 + K8S_POOL（3 周）

| 任务 | 交付物 |
|------|--------|
| K8s 集群注册 — kubeconfig 导入 | API + 前端 |
| K8s 集群注册 — Agent 接入 | Agent 镜像 + 注册流程 |
| 集群信息展示（概览/命名空间/工作负载） | 集群详情页 |
| 基础健康检查（API Server + 节点状态） | 定时检查 |
| K8S_POOL 资源池 | 池绑定集群 + K8s Job 调度 |

**里程碑:** K8s 集群可接入平台，评测任务可通过 K8S_POOL 在集群上运行

### P3 — 基础监控 + 告警 + 自愈（2 周）

| 任务 | 交付物 |
|------|--------|
| 监控数据采集（CPU/内存/GPU/磁盘）存 PG | Agent 上报 + 存储 |
| 监控面板 Dashboard | 前端页面 |
| 飞书告警（硬编码规则 + Webhook） | 告警服务 |
| 自愈策略（Agent 重启 + 磁盘清理） | 自愈引擎 + 日志 |

**里程碑:** 统一监控面板上线，飞书告警覆盖核心异常，自愈策略减少人工介入

### Future — 按需规划

| 功能 | 说明 |
|------|------|
| 高级调度策略 | round_robin / priority / label_affinity |
| 优先级抢占 | 高优先级任务抢占低优先级资源 |
| 云 API 集群接入 | 阿里云 ACK / AWS EKS 等 |
| 资源配额管理 | K8s namespace 级 ResourceQuota |
| 证书管理 | 集群证书到期提醒 |
| KMS 密钥管理 | 独立密钥管理服务 |
| HPA 自动扩缩容 | 根据负载自动扩缩 Pod |
| 多渠道告警 | 钉钉 / 邮件 / Webhook |
| 告警规则配置 UI | 自定义告警规则 |
| 日志聚合 | Loki/ES 集成 |
| 节点审批流 | Agent 自动注册 + 管理员审批 |
| 节点诊断控制台 | 一键诊断（已有基础实现） |

---

## 附录 A: 数据迁移方案

现有 compute_nodes 表需要新增字段：

```sql
-- P0 阶段无新增字段（修复已有功能）

-- P1 阶段
ALTER TABLE compute_nodes ADD COLUMN IF NOT EXISTS node_type VARCHAR(20);
ALTER TABLE compute_nodes ADD COLUMN IF NOT EXISTS labels JSONB;
ALTER TABLE compute_nodes ADD COLUMN IF NOT EXISTS pool_id BIGINT;

-- 给已有节点填充默认值
UPDATE compute_nodes SET node_type = 'CPU' WHERE node_type IS NULL;
```

> **v2.0 新增：** 所有新字段 nullable，不影响已有数据。通过迁移脚本填充默认值。

## 附录 B: 池资源关联校验（应用层）

`pool_type` 与关联资源类型的匹配校验在 Service 层实现：

```java
// ResourcePoolService.addNodeToPool()
if (!pool.getPoolType().equals("NODE_POOL")) {
    throw new BadRequestException("只能向 NODE_POOL 添加节点");
}
if (node.getPoolId() != null) {
    throw new ConflictException("该节点已属于其他资源池");
}
```

> **v2.0 新增：** 根据麦克雷反馈 #11，跨表约束无法用 PG CHECK 实现，改为应用层校验。
