# 资源管理模块 PRD v1.0

> **文档版本:** v1.0  
> **创建日期:** 2026-04-09  
> **作者:** 菜菜子（产品经理）  
> **状态:** 初版，待评审  
> **目标读者:** 前后端开发、架构师、测试团队、运维  
> **关联文档:** product-design-v3.2.md 第六部分（Module 5: 异构资源纳管）

---

## 1. 概述

### 1.1 背景

AHVP 当前的资源管理（Module 5）仅支持独立计算节点的接入和基础监控。随着业务发展，客户的计算资源形态日趋多样——既有裸金属/虚拟机形式的独立节点，也有已建成的 Kubernetes 集群。现有设计无法纳管 K8s 集群，资源池也缺少类型区分，导致调度策略设计复杂且扩展困难。

### 1.2 目标

1. **引入集群管理能力** — 支持注册和管理第三方 K8s 集群，与节点管理并行成为两大资源入口
2. **资源池类型化** — 资源池区分 NODE_POOL 和 K8S_POOL，每个池只容纳同类资源，简化调度逻辑
3. **完善运维体系** — 统一监控、告警、日志、健康检查和诊断能力，覆盖节点和集群双形态
4. **支撑评测系统** — 评测任务创建时通过资源池屏蔽底层差异，调度引擎根据池类型自动选择调度方式

### 1.3 范围

| 在范围内 | 不在范围内 |
|---------|-----------|
| 节点管理增强（标签、诊断、状态机） | 自建 K8s 集群（仅接入已有集群） |
| K8s 集群注册与管理（新功能） | 云厂商 API 直接创建集群 |
| 资源池 CRUD + 类型化 | 计费与成本核算 |
| 调度策略（节点池 + 集群池） | 跨云多集群联邦 |
| 运维监控 + 告警 + 日志 + 诊断 | 底层网络 SDN 管理 |

### 1.4 设计参考

| 产品 | 提炼的最佳实践 | 在本 PRD 中的应用 |
|------|--------------|-----------------|
| **阿里云 ACK** | 注册集群通过 Agent 接入，自动采集集群信息；节点池按实例规格分组管理 | 集群 Agent 接入模式 + 节点标签分组 |
| **AWS EKS** | 托管控制面 + Managed Node Groups；EKS Connector 接入外部集群 | kubeconfig / Agent 双模式接入；资源池概念对齐 Node Groups |
| **Rancher** | kubectl apply Agent manifest 注册集群；注册后状态从 Pending→Active；支持 RBAC 精细控权 | 注册流程设计（生成命令→执行→等待→Active）；权限模型 |
| **华为云 CCE** | 集群生命周期管理（休眠/唤醒）；命名空间级资源配额 | 集群状态机（含 HIBERNATED）；namespace 配额管理 |

---

## 2. 术语定义

| 术语 | 英文 | 定义 |
|------|------|------|
| 计算节点 | Compute Node | 一台已注册到平台的独立服务器（物理机或虚拟机），通过 Agent 上报心跳和指标 |
| K8s 集群 | Kubernetes Cluster | 一套已部署的 Kubernetes 集群，通过 kubeconfig 或 Agent 接入平台 |
| 资源池 | Resource Pool | 资源的逻辑分组，类型为 NODE_POOL（只含节点）或 K8S_POOL（只含集群） |
| Agent | Agent | 部署在节点或集群中的轻量守护进程，负责心跳、指标采集、任务执行 |
| 调度策略 | Scheduling Policy | 决定评测任务分配到哪个资源上执行的规则（负载均衡/亲和性/优先级等） |
| 命名空间 | Namespace | K8s 中用于隔离资源的逻辑分区 |
| 资源配额 | Resource Quota | 对 K8s namespace 的 CPU/内存/GPU 使用上限约束 |
| 健康检查 | Health Check | 对节点或集群的连通性、服务可用性进行周期性探测 |

---

## 3. 系统架构

### 3.1 资源管理整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        AHVP 前端 (React)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ 节点管理  │  │ 集群管理  │  │ 资源池    │  │ 运维监控中心   │   │
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
│ - 注册/编辑  │ │ - 注册/注销  │ │ - CRUD     │ │ - 指标采集   │
│ - 状态管理   │ │ - 信息同步   │ │ - 资源绑定  │ │ - 告警规则   │
│ - 标签管理   │ │ - Namespace  │ │ - 容量计算  │ │ - 日志聚合   │
│ - 诊断      │ │ - 配额管理   │ │ - 调度策略  │ │ - 健康检查   │
└──────┬───────┘ └──────┬───────┘ └─────┬──────┘ └──────┬───────┘
       │                │               │               │
       ▼                ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        数据层                                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────────┐  │
│  │PostgreSQL│  │  Redis    │  │Prometheus │  │ Loki/ES       │  │
│  │(元数据)  │  │(缓存/锁) │  │(时序指标) │  │(日志)         │  │
│  └──────────┘  └──────────┘  └───────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────────┘
       ▲                ▲
       │                │
┌──────┴───────┐ ┌──────┴───────┐
│  Node Agent  │ │ Cluster Agent│
│  (每个节点)   │ │ (每个集群)   │
│  - 心跳上报   │ │ - K8s API    │
│  - 指标采集   │ │ - 指标转发   │
│  - 任务执行   │ │ - 日志转发   │
└──────────────┘ └──────────────┘
```

### 3.2 资源管理三层模型

```
                    ┌─────────────────────┐
                    │     资源池 (Pool)     │
                    │  type: NODE_POOL     │──── 只能添加 Compute Node
                    │  type: K8S_POOL      │──── 只能添加 K8s Cluster
                    └──────────┬──────────┘
                               │ 1:N
               ┌───────────────┼───────────────┐
               ▼                               ▼
    ┌─────────────────┐             ┌─────────────────┐
    │  Compute Node   │             │  K8s Cluster    │
    │  (独立计算节点)  │             │  (K8s 集群)     │
    │                 │             │                 │
    │  Agent 心跳     │             │  ┌─ Namespace1  │
    │  直连调度       │             │  ├─ Namespace2  │
    │  SSH/RPC 执行   │             │  └─ NamespaceN  │
    └─────────────────┘             └─────────────────┘
```

---

## 4. 功能模块详细设计

### 4.1 节点管理

#### 4.1.1 节点注册

**User Story:** 作为平台管理员，我需要将新的计算节点注册到平台，以便将其纳入资源池供评测任务使用。

**注册方式:**

| 方式 | 适用场景 | 流程 |
|------|---------|------|
| **手动注册** | 少量节点、测试环境 | 填写表单 → 测试连接 → 安装 Agent → 上线 |
| **Agent 自动注册** | 批量部署、生产环境 | 在节点执行安装脚本 → Agent 自动向平台注册 → 管理员审批 |

**手动注册表单字段:**

| 字段 | 标识 | 类型 | 必填 | 控件 | 校验规则 |
|------|------|------|------|------|---------|
| 节点名称 | name | string | ✅ | 文本输入 | 1-100字符，集群内唯一 |
| 接入地址 | address | string | ✅ | 文本输入 | IP:Port 或域名:Port |
| 认证令牌 | token | string | ✅ | 密码输入 + 自动生成 | 32位随机字符串 |
| 节点类型 | node_type | enum | ✅ | 单选下拉 | CPU / GPU / NPU / 混合 |
| 标签 | labels | string[] | ❌ | 标签输入（key:value） | 每个标签 ≤128字符，≤20个 |
| 备注 | description | string | ❌ | 多行文本 | ≤500字符 |

**Agent 自动注册流程:**
1. 管理员在平台生成安装命令（含 API 地址 + 注册 Token）
2. 运维人员在目标节点执行: `curl -fsSL https://{platform}/install-agent.sh | bash -s -- --token {REG_TOKEN}`
3. Agent 启动后向平台发送注册请求，携带硬件信息（CPU/GPU/内存/磁盘/OS）
4. 平台收到注册请求，节点进入 PENDING 状态
5. 管理员在「待审批」列表中审批通过 → 节点变为 ONLINE

**交互描述:**
- 点击 [测试连接] → 按钮变 Loading → 成功: 绿色 ✅ + 展示自动采集到的硬件信息 / 失败: 红色 ❌ + 错误原因（连接超时/认证失败/端口不通）
- Agent 自动注册的节点在列表中以 🟡 PENDING 标识，管理员点击后可查看硬件信息并 [批准] 或 [拒绝]

**验收标准 (AC):**
- AC-1: 手动注册填写完整表单后，点击 [测试连接] 能在 10s 内返回结果
- AC-2: Agent 安装脚本执行后 30s 内节点出现在待审批列表
- AC-3: 节点名称重复时提交报错 "节点名称已存在"
- AC-4: 批准后节点状态变为 ONLINE 且开始上报心跳

#### 4.1.2 节点信息展示

**User Story:** 作为运维工程师，我需要查看节点的完整硬件和软件信息，以便评估其是否满足评测任务的要求。

**节点详情页结构（Tab 布局）:**

**顶部概要栏:** 节点名 + 状态灯(🟢/🔴/🟡/🔵) + 类型标签 + 在线时长 + [编辑] [删除] [维护模式]

| Tab | 内容 |
|-----|------|
| 基本信息 | 名称、地址、类型、注册时间、Agent 版本、标签列表 |
| 硬件规格 | CPU(型号/核数/频率)、内存(容量/类型)、GPU(型号/数量/显存)、磁盘(容量/类型/IOPS)、网卡(带宽) |
| 软件环境 | OS 版本、内核版本、Docker 版本、CUDA/驱动版本、Python 版本、已安装框架 |
| 实时监控 | CPU/内存/GPU/磁盘/网络 实时折线图（30s 刷新） |
| 任务历史 | 该节点执行过的评测任务列表（任务名/芯片/状态/时间） |
| 诊断日志 | 最近 100 条系统日志 + [一键诊断] |

**验收标准:**
- AC-1: 硬件信息由 Agent 自动采集，无需手动填写
- AC-2: 实时监控图表延迟 ≤ 30s
- AC-3: 软件环境信息在 Agent 连接后 1 分钟内完成首次采集

#### 4.1.3 节点编辑与删除

**User Story:** 作为管理员，我需要修改节点信息或删除不再使用的节点。

**可编辑字段:** 名称、标签、备注。地址和令牌变更需通过 [重新接入] 流程。

**删除规则:**
- 节点上无运行中任务时可直接删除
- 有运行中任务时弹出确认框："该节点有 N 个运行中的任务，删除将强制终止这些任务。确定删除？"
- 删除后节点从所有资源池中移除，Agent 自动断开

**验收标准:**
- AC-1: 编辑后 Toast "保存成功"，列表实时刷新
- AC-2: 删除有任务的节点必须二次确认
- AC-3: 删除操作记录到审计日志

#### 4.1.4 节点状态管理

**状态机:**

```
                  ┌──────────┐
     Agent注册 ──▶│ PENDING  │◀── 管理员拒绝后重新申请
                  └────┬─────┘
                       │ 管理员批准
                       ▼
                  ┌──────────┐  心跳超时   ┌──────────┐
                  │  ONLINE  │────────────▶│ OFFLINE  │
                  └────┬─────┘◀────────────└──────────┘
                       │        心跳恢复
                   手动设置维护
                       │
                       ▼
                  ┌──────────────┐
                  │ MAINTENANCE  │ ── 维护模式（不接受新任务，正在运行的任务继续）
                  └──────┬───────┘
                         │ 取消维护
                         ▼
                    恢复为 ONLINE
                  
   异常检测 ──▶  ┌──────────┐
                  │ ABNORMAL │ ── GPU故障/磁盘满/内存异常
                  └──────────┘ ── 触发告警 + 自动从调度池移除
```

**验收标准:**
- AC-1: 心跳超时阈值默认 2 分钟，可在系统设置中配置
- AC-2: 维护模式下节点不参与新任务调度，但不中断正在运行的任务
- AC-3: 状态变更记录到节点事件日志

#### 4.1.5 节点诊断控制台

**User Story:** 作为运维工程师，当节点状态异常时，我需要快速定位问题原因。

**一键诊断检查项:**

| 检查项 | 方法 | 正常标准 |
|--------|------|---------|
| 网络连通性 | Ping + TCP 端口检测 | RTT < 100ms |
| Agent 状态 | 进程存活 + 版本检测 | 进程运行 + 版本一致 |
| GPU 状态 | nvidia-smi / npu-smi | 无 ECC 错误、温度 < 90°C |
| 磁盘空间 | df -h | 使用率 < 90% |
| 内存状态 | free -h | 可用 > 10% |
| Docker/容器运行时 | docker info | 正常运行 |
| 时钟同步 | NTP 偏差检测 | 偏差 < 1s |

**交互:** 点击 [一键诊断] → 逐项执行（进度条）→ 结果以 ✅/⚠️/❌ 列表展示 → 异常项可展开查看详细信息和建议修复方案

**验收标准:**
- AC-1: 一键诊断在 30s 内完成全部检查项
- AC-2: 异常项提供至少一条修复建议
- AC-3: 诊断结果可导出为 JSON/PDF

#### 4.1.6 节点标签管理

**User Story:** 作为管理员，我需要为节点打标签（如 gpu:a100, env:prod, region:beijing），以便资源池按标签筛选和调度时按标签做亲和性匹配。

**标签格式:** `key:value`，key 和 value 均为字母数字下划线，key ≤ 64 字符，value ≤ 128 字符。

**操作:**
- 节点详情页 → 标签区域 → [+ 添加标签] → 输入 key:value → 回车确认
- 支持批量操作：节点列表勾选多个节点 → [批量打标签]
- 内置标签（只读，Agent 自动上报）: `os:centos`, `gpu:nvidia-a100`, `arch:x86_64`

**验收标准:**
- AC-1: 标签修改即时生效，无需重启 Agent
- AC-2: 批量打标签支持最多 50 个节点同时操作
- AC-3: 内置标签不可删除，以灰色标签展示

---

### 4.2 集群管理（新功能 — 重点设计）

#### 4.2.1 集群注册

**User Story:** 作为平台管理员，我需要将已有的 Kubernetes 集群接入平台，以便在集群上运行容器化的评测任务。

**注册方式对比:**

| 方式 | 适用场景 | 安全性 | 网络要求 | 操作复杂度 |
|------|---------|--------|---------|-----------|
| **Kubeconfig 导入** | 集群可被平台直连 | 中（需保管 kubeconfig） | 平台→集群 API Server 可达 | 低 |
| **Agent 接入** | 集群在内网/防火墙后 | 高（集群主动外连） | 集群→平台可达即可 | 中 |
| **API 对接** | 云厂商托管集群 | 高（使用云 API 凭证） | 按云厂商要求 | 中 |

**方式一：Kubeconfig 导入**

表单字段:

| 字段 | 标识 | 类型 | 必填 | 控件 | 校验 |
|------|------|------|------|------|------|
| 集群名称 | name | string | ✅ | 文本 | 1-100字符，唯一 |
| Kubeconfig | kubeconfig | text | ✅ | 文件上传(.yaml) 或文本粘贴 | 有效 YAML + 包含 server/cert |
| 默认命名空间 | default_namespace | string | ❌ | 文本 | 合法 K8s namespace 名 |
| 描述 | description | string | ❌ | 多行文本 | ≤500字符 |

流程: 上传 kubeconfig → [测试连接] → 成功后显示集群版本/节点数/资源概览 → [确认注册]

**方式二：Agent 接入（推荐，参考 Rancher 注册模式）**

流程:
1. 管理员填写集群名称 → 点击 [生成接入命令]
2. 平台生成一段 kubectl apply 命令:
   ```
   kubectl apply -f https://{platform}/api/v1/clusters/agent/{registration_token}.yaml
   ```
3. 管理员在目标集群执行该命令，部署 AHVP Cluster Agent（DaemonSet + ServiceAccount + RBAC）
4. Agent 部署后主动连接平台，上报集群信息
5. 集群状态从 REGISTERING → CONNECTED → ACTIVE

**方式三：API 对接（云厂商集群）**

支持厂商: 阿里云 ACK / AWS EKS / 华为云 CCE（后续扩展）

| 字段 | 说明 |
|------|------|
| 云厂商 | 下拉选择 |
| Access Key ID | 云厂商 API 凭证 |
| Access Key Secret | 云厂商 API 密钥 |
| Region | 地域 |
| 集群 ID | 云厂商集群 ID |

**交互描述:**
- 注册页面顶部有三个 Tab 对应三种接入方式，默认选中 "Agent 接入"
- Kubeconfig 方式: 拖拽上传区 + 文本粘贴区（二选一），上传后自动解析显示 server 地址
- Agent 方式: 生成命令后显示在代码框中，带 [复制] 按钮；下方实时显示等待状态（Loading spinner + "等待 Agent 连接..."），连接成功后自动刷新为集群信息
- API 对接方式: 填写凭证后 [验证凭证] → 成功后下拉选择可用集群列表

**验收标准:**
- AC-1: Kubeconfig 上传后 10s 内完成连接测试
- AC-2: Agent 方式支持 K8s 1.22+ 版本
- AC-3: 注册令牌有效期 24 小时，过期需重新生成
- AC-4: 注册成功后自动同步集群节点列表和资源总量
- AC-5: kubeconfig 文件经 AES-256 加密存储，页面不回显

#### 4.2.2 集群信息展示

**User Story:** 作为运维工程师，我需要查看已注册集群的完整信息，包括版本、节点、命名空间和资源使用情况。

**集群详情页结构:**

**顶部概要栏:** 集群名 + 状态灯 + K8s 版本 + 节点数 + 接入方式标签 + [编辑] [注销]

| Tab | 内容 |
|-----|------|
| 概览 | 资源总量/已用/可用（CPU/内存/GPU）— 环形图 + 数字；节点列表（名称/角色/状态/资源）；最近事件（K8s Events） |
| 命名空间 | namespace 列表 + 每个 namespace 的资源配额和使用量 |
| 工作负载 | 平台在该集群创建的 Job/Pod 列表（状态/创建时间/耗时） |
| 监控 | CPU/内存/网络/Pod 数 时序图（对接 Prometheus） |
| 证书 | 集群证书信息 + 到期时间 + 告警设置 |
| 日志 | 集群级别日志（Agent 日志 + K8s 事件日志） |

**验收标准:**
- AC-1: 集群信息每 60s 自动刷新一次
- AC-2: 节点列表展示 Master/Worker 角色和 Ready/NotReady 状态
- AC-3: 资源使用数据误差 ≤ 5%

#### 4.2.3 集群健康检查

**User Story:** 作为运维工程师，我需要了解集群的健康状态，及时发现和处理问题。

**自动检查项（每 5 分钟执行）:**

| 检查项 | 方法 | 健康标准 | 异常动作 |
|--------|------|---------|---------|
| API Server 可达 | GET /healthz | 返回 ok | 标记 UNREACHABLE + 告警 |
| 节点就绪 | kubectl get nodes | 全部 Ready | 告警异常节点 |
| 系统 Pod 运行 | kube-system pods | 无 CrashLoop | 告警异常 Pod |
| 证书有效性 | 证书到期检测 | 30天内不过期 | 证书过期预警 |
| 资源压力 | 节点 Conditions | 无 DiskPressure/MemoryPressure | 告警 + 建议扩容 |
| AHVP Agent 状态 | Agent 心跳 | 心跳正常 | Agent 异常告警 |

**交互:** 集群详情页顶部显示健康评分（0-100），悬停展示各项检查结果。异常时红色图标 + 点击查看详情。

**验收标准:**
- AC-1: 健康检查结果在 1 分钟内反映到前端
- AC-2: API Server 不可达时 30s 内触发告警
- AC-3: 健康检查历史记录保留 90 天

#### 4.2.4 集群编辑与注销

**User Story:** 作为管理员，我需要修改集群信息或注销不再使用的集群。

**可编辑:** 名称、描述、默认命名空间、kubeconfig（重新上传）。

**注销流程:**
1. 检查集群上是否有运行中的评测任务 → 有则提示 "请先等待任务完成或手动终止"
2. 确认注销 → 平台清理在该集群部署的 Agent 和相关资源
3. 集群从所有资源池中移除
4. 加密存储的 kubeconfig 删除

**验收标准:**
- AC-1: 注销操作需二次确认（输入集群名称确认）
- AC-2: 注销后 Agent 相关资源自动清理
- AC-3: 注销操作记录到审计日志

#### 4.2.5 命名空间管理

**User Story:** 作为管理员，我需要管理集群的命名空间，为不同的租户或项目分配独立的命名空间。

**功能:**
- 查看所有 namespace 列表（名称、状态、Pod 数、资源使用量）
- 创建新 namespace（用于评测任务隔离）
- 为 namespace 设置资源配额
- 标记 namespace 用途（system / evaluation / custom）

**创建 Namespace 表单:**

| 字段 | 类型 | 必填 | 校验 |
|------|------|------|------|
| 名称 | string | ✅ | K8s 合法 namespace 名（小写字母/数字/短横线，≤63字符） |
| 用途 | enum | ✅ | evaluation（评测）/ custom（自定义） |
| 绑定租户 | 下拉 | ❌ | 选择平台租户 |
| CPU 配额 | number | ❌ | 单位: 核，> 0 |
| 内存配额 | number | ❌ | 单位: GiB，> 0 |
| GPU 配额 | number | ❌ | 整数，≥ 0 |

**验收标准:**
- AC-1: 创建 namespace 后 10s 内在 K8s 集群中生效
- AC-2: 资源配额变更实时同步到 K8s ResourceQuota 对象
- AC-3: 不允许删除 kube-system 等系统 namespace

#### 4.2.6 资源配额管理

**User Story:** 作为管理员，我需要为每个命名空间设置资源使用上限，防止某个评测任务占用过多资源。

**配额维度:**

| 维度 | 单位 | 说明 |
|------|------|------|
| CPU requests/limits | 核 | 请求量 / 上限 |
| Memory requests/limits | GiB | 请求量 / 上限 |
| GPU | 个 | nvidia.com/gpu 数量限制 |
| Pod 数量 | 个 | 最大 Pod 数 |
| PVC 存储 | GiB | 持久卷总量限制 |

**交互:** 命名空间详情页 → [配额管理] → 表单设置各维度上限 → [保存] → 同步到 K8s

**验收标准:**
- AC-1: 配额设置后在 K8s 中创建/更新 ResourceQuota 对象
- AC-2: 超配额时 K8s 拒绝创建 Pod，平台展示友好错误提示
- AC-3: 配额使用率在 namespace 列表中以进度条展示

#### 4.2.7 集群证书管理

**User Story:** 作为运维工程师，我需要了解集群证书的到期时间，避免证书过期导致集群不可用。

**功能:**
- 展示集群 CA 证书、API Server 证书的到期时间
- 到期前 30/15/7/1 天分别发送告警通知
- 提供证书更新指引（链接到集群管理文档）

**验收标准:**
- AC-1: 证书到期时间精确到天
- AC-2: 告警通知支持飞书/邮件/Webhook

---

### 4.3 资源池管理

#### 4.3.1 创建资源池

**User Story:** 作为管理员，我需要创建资源池将同类资源分组管理，以便评测任务按资源池选择执行环境。

**创建表单:**

| 字段 | 标识 | 类型 | 必填 | 控件 | 校验 |
|------|------|------|------|------|------|
| 池名称 | name | string | ✅ | 文本 | 1-100字符，唯一 |
| 池类型 | pool_type | enum | ✅ | 单选（创建后不可变） | NODE_POOL / K8S_POOL |
| 描述 | description | string | ❌ | 多行文本 | ≤500字符 |
| 调度策略 | scheduling_policy | enum | ✅ | 单选下拉 | round_robin / least_loaded / priority / label_affinity |
| 绑定租户 | tenant_ids | string[] | ❌ | 多选下拉 | 空 = 所有租户可用 |
| 标签 | labels | string[] | ❌ | 标签输入 | ≤10个 |

**交互描述:**
- 选择 NODE_POOL 后，下方出现 "添加节点" 区域，只显示已注册且未加入其他 NODE_POOL 的节点
- 选择 K8S_POOL 后，下方出现 "添加集群" 区域，只显示已注册且状态为 ACTIVE 的集群
- 池类型一旦创建不可修改（灰色文字 + 提示 "类型创建后不可变更"）

**验收标准:**
- AC-1: NODE_POOL 类型的资源池只能添加计算节点
- AC-2: K8S_POOL 类型的资源池只能添加 K8s 集群
- AC-3: 一个节点可加入多个 NODE_POOL；一个集群可加入多个 K8S_POOL
- AC-4: 池类型字段创建后不可编辑

#### 4.3.2 添加/移除资源

**User Story:** 作为管理员，我需要向资源池中添加或移除资源，灵活调整池的容量。

**添加资源交互:**
- 资源池详情页 → [+ 添加资源] → 弹出选择面板
- NODE_POOL: 展示所有 ONLINE 状态的节点，已在池中的灰色标记
- K8S_POOL: 展示所有 ACTIVE 状态的集群，已在池中的灰色标记
- 勾选 → [确认添加]

**移除资源:**
- 资源列表中每行有 [移除] 操作
- 移除前检查：该资源上是否有通过本池调度的运行中任务
- 有运行中任务 → 提示 "该资源有 N 个运行中任务，是否强制移除？"

**验收标准:**
- AC-1: 添加/移除操作实时生效
- AC-2: 移除有运行中任务的资源需二次确认
- AC-3: 操作记录到审计日志

#### 4.3.3 资源池容量概览

**User Story:** 作为管理员和评测工程师，我需要直观了解资源池的总容量和使用情况。

**展示内容:**

| 指标 | NODE_POOL 展示 | K8S_POOL 展示 |
|------|---------------|---------------|
| 资源数量 | 节点总数 / 在线数 | 集群总数 / 活跃数 |
| CPU | 总核数 / 已用核数 | 总核数 / 已分配核数 |
| 内存 | 总容量 / 已用 | 总容量 / 已分配 |
| GPU | 总卡数 / 已用卡数 | 总 GPU / 已分配 GPU |
| 存储 | 总磁盘 / 已用 | 总 PV / 已分配 PV |

**可视化:** 资源池卡片视图，每个池一张卡片，包含: 池名 + 类型标签(蓝色NODE/绿色K8S) + 状态 + 资源使用环形图(CPU/内存/GPU) + 资源数量

**验收标准:**
- AC-1: 容量数据每 60s 自动刷新
- AC-2: 使用率超过 80% 以橙色标记，超过 95% 以红色标记

#### 4.3.4 资源池状态

**状态定义:**

| 状态 | 说明 | 对调度的影响 |
|------|------|------------|
| ACTIVE | 正常运行 | 可被评测任务选择 |
| INACTIVE | 已停用 | 不参与调度，已有任务继续运行 |
| MAINTENANCE | 维护中 | 不接受新任务，已有任务继续 |

**验收标准:**
- AC-1: 状态切换即时生效，不影响运行中的任务
- AC-2: INACTIVE/MAINTENANCE 状态的池在评测任务创建页面灰色显示

---

### 4.4 调度策略管理

#### 4.4.1 节点池调度策略

**User Story:** 作为管理员，我需要配置节点池的调度策略，让评测任务合理分配到各节点上。

**策略类型:**

| 策略 | 标识 | 说明 | 适用场景 |
|------|------|------|---------|
| 轮询 | round_robin | 依次分配到各节点 | 节点规格一致时 |
| 最低负载 | least_loaded | 优先分配到负载最低的节点 | 默认推荐 |
| 优先级 | priority | 按节点权重优先分配 | 需要优先使用特定节点 |
| 标签亲和 | label_affinity | 按任务标签匹配节点标签 | 特定芯片/环境匹配 |

**节点池调度流程:**
```
评测任务 → 选择 NODE_POOL 资源池 → 调度引擎 
   → 筛选: 在线节点 + 资源充足 + 标签匹配
   → 排序: 按策略排序
   → 分配: 选择最优节点
   → 执行: 通过 Agent 在节点上直接执行评测脚本
```

**验收标准:**
- AC-1: least_loaded 策略下，同规格节点的任务分配标准差 ≤ 20%
- AC-2: label_affinity 策略下，任务只会分配到标签匹配的节点
- AC-3: 无可用节点时任务进入排队状态，UI 显示队列位置

#### 4.4.2 集群池调度策略

**User Story:** 作为管理员，我需要配置集群池的调度策略，让评测任务以 K8s Job 的形式运行。

**调度流程:**
```
评测任务 → 选择 K8S_POOL 资源池 → 调度引擎
   → 选择集群: 按策略选择目标集群
   → 选择 Namespace: 使用池配置的 namespace 或默认 namespace
   → 生成 Job: 将评测任务转化为 K8s Job manifest
   → 提交 Job: 通过 K8s API 创建 Job
   → 监控: 监听 Job/Pod 状态变化
   → 结果回收: Job 完成后收集日志和结果
```

**K8s Job 模板（平台自动生成）:**
- 容器镜像: 平台评测基础镜像（含评测框架 + 工具链）
- 资源请求: 根据评测任务类型自动计算（GPU 任务自动加 nvidia.com/gpu 资源）
- 超时控制: Job activeDeadlineSeconds 对应任务超时时间
- 结果上传: 评测结果通过 sidecar 上传到平台存储

**验收标准:**
- AC-1: 评测任务提交后 30s 内在目标集群创建 K8s Job
- AC-2: Job 失败时自动重试（最多 3 次），重试后仍失败标记任务失败
- AC-3: Job 完成后自动清理 Pod，保留日志 7 天

#### 4.4.3 资源亲和性/反亲和性

**User Story:** 作为高级用户，我需要指定评测任务运行在特定类型的资源上（亲和性），或避免运行在某些资源上（反亲和性）。

**亲和性规则配置:**

| 字段 | 说明 | 示例 |
|------|------|------|
| 规则类型 | 亲和 / 反亲和 | affinity |
| 匹配维度 | 标签 key | gpu_model |
| 匹配值 | 标签 value | nvidia-a100 |
| 强度 | 必须(required) / 优先(preferred) | required |

**验收标准:**
- AC-1: required 亲和性无匹配资源时任务排队等待，不降级到其他资源
- AC-2: preferred 亲和性无匹配资源时选择其他资源并在任务详情标注 "未满足亲和性偏好"

#### 4.4.4 优先级调度

**User Story:** 作为管理员，我需要设置任务优先级，确保紧急评测任务优先获得资源。

**优先级定义:**

| 级别 | 数值 | 说明 | 是否可抢占 |
|------|------|------|-----------|
| CRITICAL | 1000 | 紧急任务 | 可抢占低优先级 |
| HIGH | 500 | 高优先级 | 可抢占 NORMAL |
| NORMAL | 100 | 默认 | 不可抢占 |
| LOW | 10 | 低优先级 | 可被任何高优先级抢占 |

**抢占逻辑:** 高优先级任务进入无可用资源状态 → 查找是否有低优先级任务可被抢占 → 挂起低优先级任务 → 分配资源给高优先级任务 → 低优先级任务重新排队

**验收标准:**
- AC-1: 抢占仅在 CRITICAL/HIGH 级别允许
- AC-2: 被抢占的任务可恢复运行（从最近的 checkpoint 恢复）
- AC-3: 抢占操作记录到审计日志并通知被抢占任务的创建者

---

### 4.5 运维监控

#### 4.5.1 资源监控面板

**User Story:** 作为运维工程师，我需要统一的监控面板查看所有资源的运行状态。

**全局 Dashboard 布局:**
- **顶部统计卡片（4 列）:** 节点总数(在线/离线) | 集群总数(活跃/异常) | 资源池数(活跃) | 告警数(未处理)
- **中部图表区（2×2 网格）:**
  - CPU 使用率 Top 10 节点/集群（水平柱状图）
  - 内存使用率 Top 10（水平柱状图）
  - GPU 使用率 Top 10（水平柱状图）
  - 网络流量 Top 10（折线图）
- **底部列表:** 最近告警列表（时间/资源/级别/内容/状态）

**资源级监控指标:**

| 指标 | 节点 | 集群 | 采集频率 |
|------|------|------|---------|
| CPU 使用率 | ✅ | ✅ | 15s |
| 内存使用率 | ✅ | ✅ | 15s |
| GPU 使用率 | ✅ | ✅(有 GPU 时) | 15s |
| GPU 显存 | ✅ | ✅ | 15s |
| GPU 温度 | ✅ | ❌ | 15s |
| 磁盘使用率 | ✅ | ✅(PV) | 60s |
| 网络流量 | ✅ | ✅ | 15s |
| Pod 数量 | ❌ | ✅ | 30s |

**验收标准:**
- AC-1: Dashboard 页面加载 ≤ 3s
- AC-2: 图表数据延迟 ≤ 30s
- AC-3: 支持时间范围选择（最近 1h / 6h / 24h / 7d / 30d / 自定义）

#### 4.5.2 告警规则配置

**User Story:** 作为管理员，我需要配置告警规则，在资源异常时及时收到通知。

**告警规则表单:**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 规则名称 | string | ✅ | 1-100字符 |
| 资源范围 | enum | ✅ | 全局 / 指定资源池 / 指定节点 / 指定集群 |
| 指标 | enum | ✅ | CPU/内存/GPU/磁盘/网络/心跳/Pod状态 |
| 条件类型 | enum | ✅ | 阈值(threshold) / 趋势(trend) |
| 阈值 | number | 条件 | 阈值告警时: > / < / = 目标值 |
| 趋势 | object | 条件 | 趋势告警时: 30 分钟内增长 > X% |
| 持续时间 | number | ✅ | 满足条件持续 N 分钟后触发（防抖） |
| 级别 | enum | ✅ | INFO / WARNING / CRITICAL |
| 通知渠道 | multi-select | ✅ | 飞书 / 钉钉 / 邮件 / Webhook |
| 通知对象 | multi-select | ✅ | 选择接收人 |

**预置告警规则（开箱即用）:**

| 规则 | 指标 | 阈值 | 持续 | 级别 |
|------|------|------|------|------|
| 节点离线 | 心跳超时 | > 2min | 0min | CRITICAL |
| GPU 温度过高 | GPU 温度 | > 85°C | 5min | WARNING |
| 磁盘空间不足 | 磁盘使用率 | > 90% | 10min | WARNING |
| 内存不足 | 内存使用率 | > 95% | 5min | CRITICAL |
| 集群不可达 | API Server | 不可达 | 1min | CRITICAL |
| 证书即将过期 | 证书有效期 | < 30天 | — | WARNING |

**验收标准:**
- AC-1: 自定义规则保存后 1 分钟内生效
- AC-2: 预置规则可修改阈值但不可删除
- AC-3: 支持告警静默（指定时间段内抑制某规则）

#### 4.5.3 告警通知渠道

**User Story:** 作为管理员，我需要配置多种通知渠道，确保告警信息及时送达相关人员。

**支持渠道:**

| 渠道 | 配置项 | 说明 |
|------|--------|------|
| 飞书 | Webhook URL | 机器人 Webhook |
| 钉钉 | Webhook URL + Secret | 机器人 Webhook |
| 邮件 | SMTP 配置 + 收件人列表 | 支持 HTML 模板 |
| Webhook | URL + Method + Headers | 自定义 HTTP 回调 |

**告警消息格式:**
```
[AHVP 告警] [CRITICAL] 节点离线
资源: node-gpu-01
时间: 2026-04-09 10:30:15
详情: 节点心跳超时 > 2 分钟
建议: 检查节点网络连通性和 Agent 进程状态
链接: https://ahvp.example.com/nodes/xxx
```

**验收标准:**
- AC-1: 告警触发后 30s 内发送通知
- AC-2: 渠道配置支持 [发送测试消息]
- AC-3: 通知发送失败时重试 3 次并记录发送日志

#### 4.5.4 日志聚合

**User Story:** 作为运维工程师，我需要在一个界面查看节点日志、集群日志和评测任务日志。

**日志分类:**

| 日志类型 | 来源 | 采集方式 |
|---------|------|---------|
| 节点日志 | Agent 系统日志 + OS syslog | Agent 采集上报 |
| 集群日志 | K8s Event + Pod 日志 | Cluster Agent 采集 |
| 评测日志 | 评测任务 stdout/stderr | 任务执行时实时上报 |
| 审计日志 | 平台操作记录 | 平台自动记录 |

**日志查看页面:**
- 顶部筛选: 时间范围 / 日志类型(多选) / 资源(节点/集群/任务) / 级别(DEBUG/INFO/WARN/ERROR) / 关键词搜索
- 主体: 日志流（时间 | 来源 | 级别色标 | 内容），支持实时滚动
- 操作: [导出] [全屏] [暂停滚动]

**验收标准:**
- AC-1: 日志检索响应 ≤ 3s（100 万条内）
- AC-2: 实时日志延迟 ≤ 5s
- AC-3: 日志保留策略可配置（默认 30 天）

#### 4.5.5 健康检查与自愈

**User Story:** 作为运维工程师，我需要配置自动化健康检查和自愈策略，减少人工干预。

**自愈策略配置:**

| 触发条件 | 自愈动作 | 需管理员确认 |
|---------|---------|------------|
| Agent 离线 > 5min | 自动 SSH 重启 Agent | ❌ |
| 磁盘 > 95% | 自动清理 /tmp 和评测临时文件 | ❌ |
| GPU ECC 错误 | 标记节点 ABNORMAL + 迁移任务 | ✅ |
| K8s Node NotReady > 10min | 标记为不可调度(cordon) | ❌ |
| OOM Kill | 标记任务失败 + 建议增大内存 | ❌ |

**验收标准:**
- AC-1: 自愈动作执行后生成操作日志
- AC-2: 需确认的自愈动作以告警形式通知管理员
- AC-3: 自愈策略可全局开关

#### 4.5.6 故障诊断

**User Story:** 作为运维工程师，当资源出现故障时，我需要快速诊断工具和历史记录帮助定位问题。

**一键诊断（同 4.1.5 节点诊断，集群版扩展）:**
- 集群诊断增加: API Server 响应时间 / CoreDNS 状态 / CNI 插件状态 / StorageClass 可用性

**故障记录:**
- 每次异常自动生成故障记录: 时间、资源、故障类型、影响范围、处理过程、恢复时间
- 故障列表页: 按时间倒序，可按资源/类型/状态筛选

**验收标准:**
- AC-1: 故障记录自动关联受影响的评测任务
- AC-2: 历史故障记录保留 1 年

#### 4.5.7 扩缩容管理

**User Story:** 作为管理员，我需要根据评测负载对资源进行扩缩容。

**节点池扩缩容:** 手动添加/移除节点（已在 4.3.2 覆盖）。

**集群池扩缩容:**
- **手动:** 在 K8s 集群中增减 Worker 节点（平台仅展示指引，实际操作由集群管理员完成）
- **自动 HPA:** 对评测 namespace 配置 HPA 策略，根据 CPU/GPU 使用率自动扩缩 Pod
  - 最小副本数 / 最大副本数 / 目标 CPU 使用率 / 冷却时间

**验收标准:**
- AC-1: HPA 配置变更在 30s 内同步到 K8s 集群
- AC-2: 扩缩容事件记录到操作日志

---

## 5. 数据模型

### 5.1 核心表结构

**compute_nodes（计算节点表）— 增强版**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | PK | 主键 |
| name | VARCHAR(100) | ✅ | 节点名称，唯一 |
| address | VARCHAR(255) | ✅ | IP:Port |
| token_hash | VARCHAR(256) | ✅ | 令牌哈希（不存明文） |
| node_type | ENUM | ✅ | CPU/GPU/NPU/MIXED |
| status | ENUM | ✅ | PENDING/ONLINE/OFFLINE/MAINTENANCE/ABNORMAL |
| agent_version | VARCHAR(50) | ❌ | Agent 版本 |
| hardware_info | JSONB | ❌ | CPU/GPU/内存等硬件信息 |
| software_info | JSONB | ❌ | OS/驱动/框架等软件信息 |
| labels | JSONB | ❌ | 标签 {key: value} |
| last_heartbeat | TIMESTAMP | ❌ | 最后心跳时间 |
| description | TEXT | ❌ | 备注 |
| tenant_id | UUID | FK | 所属租户 |
| created_at | TIMESTAMP | ✅ | 创建时间 |
| updated_at | TIMESTAMP | ✅ | 更新时间 |

**k8s_clusters（K8s 集群表）— 新增**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | PK | 主键 |
| name | VARCHAR(100) | ✅ | 集群名称，唯一 |
| status | ENUM | ✅ | REGISTERING/CONNECTED/ACTIVE/UNREACHABLE/HIBERNATED |
| access_type | ENUM | ✅ | KUBECONFIG/AGENT/API |
| kubeconfig_encrypted | TEXT | ❌ | AES-256 加密的 kubeconfig |
| api_server_url | VARCHAR(512) | ❌ | API Server 地址 |
| k8s_version | VARCHAR(50) | ❌ | Kubernetes 版本 |
| node_count | INT | ❌ | 集群节点数（定时同步） |
| total_cpu | DECIMAL | ❌ | 总 CPU 核数 |
| total_memory_gb | DECIMAL | ❌ | 总内存(GiB) |
| total_gpu | INT | ❌ | 总 GPU 数 |
| cloud_provider | VARCHAR(50) | ❌ | 云厂商(aliyun/aws/huawei/other) |
| cloud_cluster_id | VARCHAR(200) | ❌ | 云厂商集群 ID |
| cloud_credentials_encrypted | TEXT | ❌ | 加密的云 API 凭证 |
| cert_expiry | TIMESTAMP | ❌ | 证书过期时间 |
| health_score | INT | ❌ | 健康评分 0-100 |
| last_sync_at | TIMESTAMP | ❌ | 最后信息同步时间 |
| description | TEXT | ❌ | 描述 |
| tenant_id | UUID | FK | 所属租户 |
| created_at | TIMESTAMP | ✅ | 创建时间 |
| updated_at | TIMESTAMP | ✅ | 更新时间 |

**k8s_namespaces（命名空间表）— 新增**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | PK | 主键 |
| cluster_id | UUID | FK | 所属集群 |
| name | VARCHAR(63) | ✅ | namespace 名 |
| purpose | ENUM | ✅ | SYSTEM/EVALUATION/CUSTOM |
| cpu_quota | DECIMAL | ❌ | CPU 配额(核) |
| memory_quota_gb | DECIMAL | ❌ | 内存配额(GiB) |
| gpu_quota | INT | ❌ | GPU 配额 |
| max_pods | INT | ❌ | 最大 Pod 数 |
| storage_quota_gb | DECIMAL | ❌ | 存储配额(GiB) |
| tenant_id | UUID | FK | 绑定租户 |
| created_at | TIMESTAMP | ✅ | |
| updated_at | TIMESTAMP | ✅ | |

**resource_pools（资源池表）— 增强版**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | PK | 主键 |
| name | VARCHAR(100) | ✅ | 池名称，唯一 |
| pool_type | ENUM | ✅ | NODE_POOL / K8S_POOL（不可变） |
| status | ENUM | ✅ | ACTIVE/INACTIVE/MAINTENANCE |
| scheduling_policy | ENUM | ✅ | round_robin/least_loaded/priority/label_affinity |
| labels | JSONB | ❌ | 池标签 |
| description | TEXT | ❌ | |
| tenant_ids | UUID[] | ❌ | 绑定租户列表(空=全局) |
| created_at | TIMESTAMP | ✅ | |
| updated_at | TIMESTAMP | ✅ | |

**pool_resources（资源池-资源关联表）— 新增**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | PK | 主键 |
| pool_id | UUID | FK | 资源池 ID |
| resource_type | ENUM | ✅ | NODE / CLUSTER |
| resource_id | UUID | ✅ | 节点 ID 或集群 ID |
| priority | INT | ❌ | 在池内的优先级权重 |
| added_at | TIMESTAMP | ✅ | 加入时间 |

约束: UNIQUE(pool_id, resource_type, resource_id) + CHECK(pool_type 与 resource_type 匹配)

**alert_rules（告警规则表）— 新增**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | PK | |
| name | VARCHAR(100) | ✅ | 规则名称 |
| scope_type | ENUM | ✅ | GLOBAL/POOL/NODE/CLUSTER |
| scope_id | UUID | ❌ | 范围 ID（GLOBAL 时为空） |
| metric | VARCHAR(50) | ✅ | 监控指标 |
| condition_type | ENUM | ✅ | THRESHOLD / TREND |
| condition_value | JSONB | ✅ | 条件配置 |
| duration_minutes | INT | ✅ | 持续时间 |
| severity | ENUM | ✅ | INFO/WARNING/CRITICAL |
| channels | JSONB | ✅ | 通知渠道配置 |
| is_preset | BOOLEAN | ✅ | 是否预置规则 |
| enabled | BOOLEAN | ✅ | 是否启用 |
| created_at | TIMESTAMP | ✅ | |
| updated_at | TIMESTAMP | ✅ | |

---

## 6. API 设计

### 6.1 节点管理 API

| Method | Path | 说明 | 权限 |
|--------|------|------|------|
| GET | /api/v1/nodes | 节点列表（分页 + 筛选） | viewer+ |
| POST | /api/v1/nodes | 手动注册节点 | admin |
| POST | /api/v1/nodes/register | Agent 自动注册 | agent_token |
| GET | /api/v1/nodes/{id} | 节点详情 | viewer+ |
| PUT | /api/v1/nodes/{id} | 编辑节点 | admin |
| DELETE | /api/v1/nodes/{id} | 删除节点 | admin |
| POST | /api/v1/nodes/{id}/approve | 审批节点注册 | admin |
| POST | /api/v1/nodes/{id}/reject | 拒绝节点注册 | admin |
| PUT | /api/v1/nodes/{id}/status | 变更节点状态（维护模式等） | admin |
| POST | /api/v1/nodes/{id}/diagnose | 一键诊断 | operator+ |
| GET | /api/v1/nodes/{id}/metrics | 节点监控指标(SSE) | viewer+ |
| GET | /api/v1/nodes/{id}/logs | 节点日志 | operator+ |
| PUT | /api/v1/nodes/{id}/labels | 更新标签 | admin |
| POST | /api/v1/nodes/batch/labels | 批量打标签 | admin |

### 6.2 集群管理 API

| Method | Path | 说明 | 权限 |
|--------|------|------|------|
| GET | /api/v1/clusters | 集群列表 | viewer+ |
| POST | /api/v1/clusters | 注册集群(kubeconfig) | admin |
| POST | /api/v1/clusters/agent-token | 生成 Agent 接入令牌 | admin |
| POST | /api/v1/clusters/cloud | 通过云 API 注册集群 | admin |
| GET | /api/v1/clusters/{id} | 集群详情 | viewer+ |
| PUT | /api/v1/clusters/{id} | 编辑集群 | admin |
| DELETE | /api/v1/clusters/{id} | 注销集群 | admin |
| POST | /api/v1/clusters/{id}/sync | 手动同步集群信息 | operator+ |
| POST | /api/v1/clusters/{id}/health-check | 触发健康检查 | operator+ |
| GET | /api/v1/clusters/{id}/metrics | 集群监控指标(SSE) | viewer+ |
| GET | /api/v1/clusters/{id}/namespaces | 命名空间列表 | viewer+ |
| POST | /api/v1/clusters/{id}/namespaces | 创建命名空间 | admin |
| PUT | /api/v1/clusters/{id}/namespaces/{ns} | 编辑命名空间(配额) | admin |
| DELETE | /api/v1/clusters/{id}/namespaces/{ns} | 删除命名空间 | admin |
| GET | /api/v1/clusters/{id}/certs | 证书信息 | operator+ |
| GET | /api/v1/clusters/{id}/workloads | 工作负载列表 | viewer+ |

### 6.3 资源池 API

| Method | Path | 说明 | 权限 |
|--------|------|------|------|
| GET | /api/v1/pools | 资源池列表 | viewer+ |
| POST | /api/v1/pools | 创建资源池 | admin |
| GET | /api/v1/pools/{id} | 资源池详情 | viewer+ |
| PUT | /api/v1/pools/{id} | 编辑资源池 | admin |
| DELETE | /api/v1/pools/{id} | 删除资源池 | admin |
| POST | /api/v1/pools/{id}/resources | 添加资源 | admin |
| DELETE | /api/v1/pools/{id}/resources/{res_id} | 移除资源 | admin |
| GET | /api/v1/pools/{id}/capacity | 容量概览 | viewer+ |
| PUT | /api/v1/pools/{id}/status | 变更状态 | admin |
| GET | /api/v1/pools/{id}/available | 可选资源池(评测用) | evaluator+ |

### 6.4 运维监控 API

| Method | Path | 说明 | 权限 |
|--------|------|------|------|
| GET | /api/v1/monitoring/dashboard | 全局监控数据 | viewer+ |
| GET | /api/v1/alerts/rules | 告警规则列表 | operator+ |
| POST | /api/v1/alerts/rules | 创建告警规则 | admin |
| PUT | /api/v1/alerts/rules/{id} | 编辑告警规则 | admin |
| DELETE | /api/v1/alerts/rules/{id} | 删除告警规则 | admin |
| GET | /api/v1/alerts | 告警列表 | operator+ |
| PUT | /api/v1/alerts/{id}/ack | 确认告警 | operator+ |
| PUT | /api/v1/alerts/{id}/resolve | 解决告警 | operator+ |
| GET | /api/v1/logs | 日志查询 | operator+ |
| GET | /api/v1/logs/stream | 实时日志(SSE) | operator+ |
| GET | /api/v1/faults | 故障记录列表 | operator+ |

---

## 7. 前端页面设计

### 7.1 导航菜单结构

```
📦 资源管理
├── 📊 资源概览 Dashboard
├── 🖥️ 节点管理
│   ├── 节点列表
│   └── 待审批节点
├── ☸️ 集群管理
│   ├── 集群列表
│   └── 注册集群
├── 🗂️ 资源池管理
│   ├── 资源池列表
│   └── 创建资源池
├── ⚙️ 调度策略
└── 🔧 运维中心
    ├── 监控面板
    ├── 告警管理
    │   ├── 告警列表
    │   └── 告警规则
    ├── 日志查看
    └── 故障记录
```

### 7.2 页面详细设计

#### 7.2.1 资源概览 Dashboard

**布局:**
- 顶部: 4 个统计卡片（节点数 / 集群数 / 资源池数 / 活跃告警数）
- 中部左: 资源池卡片网格（每行 3 个，点击进入详情）
- 中部右: 资源使用率环形图（CPU / 内存 / GPU 汇总）
- 底部: 最近告警列表（最新 10 条）+ [查看全部 →]

#### 7.2.2 节点列表页

**列表列:**

| 列 | 宽度 | 排序 | 说明 |
|-----|------|------|------|
| 状态 | 60px | ✅ | 🟢🔴🟡🔵 图标 |
| 节点名称 | 200px | ✅ | 点击进入详情 |
| 类型 | 80px | ✅ | CPU/GPU/NPU 标签色 |
| IP 地址 | 150px | ❌ | |
| CPU | 100px | ✅ | 使用率%（进度条） |
| 内存 | 100px | ✅ | 使用率%（进度条） |
| GPU | 100px | ✅ | X/Y 卡（使用/总计） |
| 标签 | 200px | ❌ | 标签气泡（最多显示3个+N more） |
| 资源池 | 150px | ✅ | 所在资源池名 |
| 在线时间 | 120px | ✅ | 如 "3d 12h" |
| 操作 | 120px | ❌ | [详情] [编辑] [删除] |

**顶部操作栏:** [+ 注册节点] [批量操作 ▼] | 搜索框 | 状态筛选(多选) | 类型筛选(多选)

#### 7.2.3 集群列表页

**列表列:**

| 列 | 宽度 | 说明 |
|----|------|------|
| 状态 | 60px | 🟢ACTIVE/🔴UNREACHABLE/🟡REGISTERING |
| 集群名称 | 200px | 点击进入详情 |
| K8s 版本 | 100px | |
| 节点数 | 80px | Master + Worker |
| 接入方式 | 100px | Kubeconfig/Agent/API 标签 |
| CPU | 120px | 已用/总量（进度条） |
| 内存 | 120px | 已用/总量 |
| GPU | 80px | 已用/总量 |
| 健康评分 | 80px | 0-100 数字+颜色 |
| 证书到期 | 100px | 天数（<30天红色） |
| 操作 | 120px | [详情] [编辑] [注销] |

**顶部操作栏:** [+ 注册集群] | 搜索框 | 状态筛选 | 接入方式筛选

#### 7.2.4 资源池列表页

**展示方式:** 卡片视图（默认）/ 列表视图（可切换）

**卡片内容:**
- 标题: 池名称 + 类型标签(蓝色 NODE / 绿色 K8S)
- 状态: ACTIVE(绿) / INACTIVE(灰) / MAINTENANCE(橙)
- 统计: 资源数量 | CPU使用率 | 内存使用率 | GPU使用率 — 三个mini环形图
- 底部: 调度策略标签 + [查看详情]

#### 7.2.5 注册集群页面

**三 Tab 布局:**

**Tab 1 - Agent 接入:**
- Step 1: 输入集群名称 + 描述
- Step 2: 点击 [生成接入命令] → 代码框展示 kubectl apply 命令 + [复制]
- Step 3: 等待连接（动画 Loading + "正在等待 Agent 连接..." + 已等待时间）
- Step 4: 连接成功 → 自动展示集群信息卡片 → [确认注册]

**Tab 2 - Kubeconfig:**
- 拖拽上传区（虚线框 "拖拽 kubeconfig 文件到此处，或点击上传"）
- 或折叠面板 "手动粘贴 kubeconfig 内容" → 代码编辑器
- [测试连接] → 成功显示集群摘要 → [确认注册]

**Tab 3 - 云 API:**
- 选择云厂商(下拉) → 填写凭证 → [验证] → 选择集群(下拉) → [注册]

---

## 8. 与评测系统的集成

### 8.1 评测任务创建时选择资源池

**当前流程（product-design-v3.2 Step 5）修改为:**

原: 直接选择计算节点
新: 选择资源池 → 池类型自动决定调度方式

**交互变更:**
- Step 5 标题改为 "选择资源池"
- 展示 ACTIVE 状态的资源池卡片
- 卡片标记池类型(NODE/K8S)和可用资源概览
- 选择后:
  - NODE_POOL → 可进一步选择具体节点（可选，不选则由调度引擎自动分配）
  - K8S_POOL → 可选择目标 namespace（默认使用池配置的 namespace）

### 8.2 调度引擎适配

```
评测任务提交
    │
    ▼
┌──────────────┐
│ 读取资源池类型 │
└──────┬───────┘
       │
       ├── NODE_POOL ──▶ Node Scheduler
       │                    ├─ 筛选在线节点
       │                    ├─ 按调度策略排序
       │                    ├─ 分配节点
       │                    └─ 通过 Agent RPC 执行任务
       │
       └── K8S_POOL ──▶ K8s Scheduler
                            ├─ 选择目标集群
                            ├─ 生成 Job manifest
                            ├─ 提交到 K8s API
                            ├─ 监听 Pod 状态
                            └─ 回收结果和日志
```

### 8.3 评测报告中的资源使用信息

报告新增 "执行环境" 章节:

| 信息项 | NODE_POOL 展示 | K8S_POOL 展示 |
|--------|---------------|---------------|
| 资源池 | 池名称 + 类型 | 池名称 + 类型 |
| 执行位置 | 节点名 + IP | 集群名 + Namespace + Pod 名 |
| 硬件 | Agent 采集的硬件信息 | Pod requests/limits |
| 资源使用 | CPU/内存/GPU 峰值 + 均值 | 同左 |
| 执行耗时 | 任务总耗时 + 各阶段耗时 | 同左 |

---

## 9. 安全设计

### 9.1 Kubeconfig 安全存储

- 存储: kubeconfig 文件经 AES-256-GCM 加密后存入数据库
- 密钥管理: 加密密钥存于独立的 KMS（密钥管理服务）或环境变量，不存数据库
- 访问控制: 仅 Cluster Service 可解密 kubeconfig，其他服务无权限
- 审计: 每次解密操作记录到审计日志
- 前端: 不回显 kubeconfig 内容，仅显示 "已配置" 状态

### 9.2 RBAC 权限模型

| 角色 | 节点管理 | 集群管理 | 资源池 | 告警 | 日志 |
|------|---------|---------|--------|------|------|
| admin | 全部 | 全部 | 全部 | 全部 | 全部 |
| operator | 查看+诊断 | 查看+同步 | 查看 | 确认+处理 | 查看 |
| evaluator | 查看 | 查看 | 选择(创建任务用) | 查看 | 查看(自己的任务) |
| viewer | 查看 | 查看 | 查看 | 查看 | ❌ |

### 9.3 网络安全

**集群接入网络要求:**

| 接入方式 | 网络要求 | 端口 |
|---------|---------|------|
| Kubeconfig | 平台 → 集群 API Server | 6443(默认) |
| Agent | 集群 → 平台 Gateway | 443(HTTPS/WSS) |
| 云 API | 平台 → 云厂商 API | 443 |

**安全建议:**
- Agent 接入方式更适合内网集群（无需暴露 API Server）
- 所有通信使用 TLS 1.2+
- Agent 与平台之间使用 mTLS 双向认证
- kubeconfig 中的 token 定期轮换（建议 90 天）

---

## 10. 实现路线图

### Phase 1: 节点管理增强 + 资源池 CRUD（4 周）

**基于现有 Module 5 增强:**

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W1 | 节点状态机 + 标签管理 + 审批流程 | 后端 API + 前端页面 |
| W2 | 资源池 CRUD（NODE_POOL 类型先行） | 池管理 API + 前端 |
| W3 | 节点诊断控制台 + 基础监控增强 | 诊断 API + 监控页面 |
| W4 | 评测系统集成（任务创建选资源池） | 调度引擎改造 + 联调 |

**里程碑:** 评测任务可通过 NODE_POOL 资源池选择节点并执行

### Phase 2: K8s 集群注册 + 集群池（6 周）

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W5-6 | 集群注册（三种方式）+ Cluster Agent 开发 | 注册 API + Agent 镜像 |
| W7-8 | 集群信息展示 + 命名空间/配额管理 | 集群详情页 + namespace API |
| W9 | K8S_POOL 资源池 + 集群池调度策略 | 池绑定集群 + K8s Job 调度 |
| W10 | 集群健康检查 + 证书管理 + 联调 | 健康检查服务 + 端到端测试 |

**里程碑:** 评测任务可通过 K8S_POOL 资源池在 K8s 集群上以 Job 形式运行

### Phase 3: 运维监控 + 告警（4 周）

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W11 | 全局监控 Dashboard + Prometheus 集成 | 监控面板页面 |
| W12 | 告警规则引擎 + 预置规则 + 通知渠道 | 告警管理 API + 通知服务 |
| W13 | 日志聚合（Loki/ES 集成）+ 日志查看页面 | 日志 API + 前端 |
| W14 | 故障记录 + 诊断增强（集群版）| 故障管理 + 联调 |

**里程碑:** 统一运维监控面板上线，告警通知覆盖飞书/邮件/Webhook

### Phase 4: 调度策略 + 自动扩缩容（4 周）

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W15 | 亲和性/反亲和性调度 | 调度策略增强 |
| W16 | 优先级调度 + 抢占逻辑 | 优先级队列 + 抢占机制 |
| W17 | 自愈策略引擎 + HPA 集成 | 自愈服务 + HPA 配置 API |
| W18 | 全链路测试 + 性能优化 + 文档 | 测试报告 + 上线 |

**里程碑:** 完整资源管理能力上线，支持智能调度和自动化运维

---

## 附录 A: 集群状态机

```
                    ┌──────────────┐
  注册发起 ────────▶│ REGISTERING  │
                    └──────┬───────┘
                           │ Agent 连接成功 / kubeconfig 验证通过
                           ▼
                    ┌──────────────┐
                    │  CONNECTED   │
                    └──────┬───────┘
                           │ 信息同步完成
                           ▼
                    ┌──────────────┐  API Server 不可达  ┌───────────────┐
                    │    ACTIVE    │ ──────────────────▶ │  UNREACHABLE  │
                    └──────┬───────┘ ◀────────────────── └───────────────┘
                           │          恢复连接
                       手动休眠
                           │
                           ▼
                    ┌──────────────┐
                    │  HIBERNATED  │ ── 资源保留但不调度
                    └──────┬───────┘
                           │ 唤醒
                           ▼
                      恢复为 ACTIVE
```

## 附录 B: 告警处理状态机

```
NEW → ACKNOWLEDGED → IN_PROGRESS → RESOLVED → CLOSED
                                       ↑
                              自动恢复 ─┘
  
  任何状态 → ESCALATED（升级处理）
```
