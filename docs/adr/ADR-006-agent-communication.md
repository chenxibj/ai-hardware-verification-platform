# ADR-006: Agent 通信选型

## 状态

已采纳 (Accepted)

## 背景

AI 软硬件验证平台的核心架构是**中心调度 + 分布式执行**：

- **中心端（Platform）：** Spring Boot 后端，负责任务编排、调度、结果聚合
- **执行端（Agent）：** 部署在各 GPU 服务器/芯片测试机上的轻量进程，负责执行评测脚本并上报结果

Agent 通信需要满足以下需求：

1. **任务分发：** Platform → Agent，将评测任务推送或由 Agent 拉取
2. **结果上报：** Agent → Platform，评测完成后提交结果和指标数据
3. **实时日志：** Agent → Platform → Frontend，评测过程中的日志流式传输
4. **心跳保活：** Agent 定期报告存活状态和资源利用率
5. **环境约束：** Agent 可能位于不同网络环境（有防火墙、NAT），需要穿透能力

当前项目已实现的通信模式：
- Agent 使用 **HTTP Pull**（轮询拉取任务）+ **HTTP Push**（主动上报结果）
- 前端使用 **WebSocket** 接收实时任务日志（`TaskLogWebSocketHandler`）
- Agent 认证使用 Token（`AgentTokenFilter`）

## 决策

采用 **Pull 模式（Agent 主动拉取任务）+ HTTP REST 上报结果 + WebSocket 日志推送** 的混合通信架构。

## 理由

### 1. Pull 模式的运维优势

- **NAT 友好：** Agent 主动外连 Platform，无需 Platform 能够访问 Agent（芯片测试机通常在内网/防火墙后）
- **部署简单：** Agent 只需知道 Platform 地址，无需注册端口或配置反向代理
- **负载均衡：** Agent 按自身能力拉取任务，天然避免过载
- **故障容错：** Platform 重启不影响 Agent（Agent 下次 Pull 自动恢复）；Agent 重启不影响 Platform

### 2. HTTP REST 的普适性

- **防火墙友好：** HTTP/HTTPS 端口几乎所有网络环境都允许
- **无状态：** 每次请求独立，便于负载均衡和水平扩展
- **调试简单：** cURL/Postman 即可测试，日志可读性好
- **Spring Boot 原生：** 无需额外框架，Controller 直接实现

### 3. WebSocket 用于实时日志

- **全双工：** 适合持续的日志流推送
- **低延迟：** 建立连接后无 HTTP 头开销
- **浏览器原生支持：** 前端直接使用 WebSocket API
- **已实现：** 项目中已有 `WebSocketConfig` + `TaskLogWebSocketHandler`

### 4. 当前方案的成熟度

- 项目已验证此模式可以工作（156+ Java 源文件的中大型系统已稳定运行）
- 任务队列通过 Redis 支撑，Pull 模式配合 Redis BLPOP 实现准实时
- Token 认证简洁有效

## 后果

### 正面

- 架构简单：HTTP + WebSocket 是 Web 开发最基础的协议栈
- 运维友好：无需额外中间件（如 gRPC 需要 Protobuf 编译、证书管理）
- 适应各种网络环境：内网、跨网段、VPN 等均可工作
- 扩展自然：增加 Agent 只需部署新节点并配置 Platform 地址

### 负面

- 轮询延迟：Pull 间隔导致任务分发有秒级延迟（可通过长轮询或缩短间隔优化）
- 带宽浪费：空闲时仍有轮询请求（量级很小，可忽略）
- 日志大量时 WebSocket 可能需要背压控制

## 替代方案

### Push 模式（Platform 主动推送任务）

- **优势：** 零延迟任务分发、无轮询开销
- **放弃原因：**
  - Platform 需要能访问 Agent 网络（防火墙/NAT 穿透困难）
  - Agent 上下线时 Platform 需维护连接状态
  - 负载均衡需要 Platform 了解每个 Agent 的能力和负载
- **适用场景：** 所有节点在同一内网、网络环境可控时可考虑

### gRPC（双向流）

- **优势：** 高性能（二进制协议、HTTP/2 多路复用）、强类型（Protobuf）、双向流天然支持日志推送
- **放弃原因：**
  - 增加编译步骤（.proto → Java/Python stub）
  - 浏览器不直接支持 gRPC（需 gRPC-Web + Envoy 代理）
  - 调试不如 HTTP 直观（二进制协议不可读）
  - 对当前规模（数十个 Agent）而言性能提升不明显
- **未来考虑：** 如 Agent 数量超过 100 且需要双向流控，可在 Agent-Platform 间引入 gRPC

### MQTT

- **优势：** 极低带宽开销、天然的发布/订阅模型、IoT 领域成熟
- **放弃原因：**
  - 需要额外的 MQTT Broker（如 EMQX/Mosquitto）
  - 消息大小限制（不适合大文件/日志传输）
  - Spring 生态集成不如 HTTP/WebSocket 原生
  - 团队无 MQTT 经验

### WebSocket 全链路（Agent 也用 WebSocket 连接 Platform）

- **优势：** 统一协议、双向实时通信
- **放弃原因：**
  - 有状态连接，Platform 重启时所有 Agent 需要重连
  - 长连接管理复杂（心跳、重连、断线缓冲）
  - HTTP REST 的简单性和调试优势在 Agent 场景更重要
- **折中：** 保留 WebSocket 仅用于前端实时日志展示

## 演进路径

1. **当前（MVP）：** HTTP Pull（5s 间隔）+ HTTP 结果上报 + WebSocket 日志
2. **短期优化：** 引入 HTTP 长轮询（Long Polling）减少延迟至 <1s
3. **中期（规模增长）：** 引入 Kafka 作为任务分发和结果收集的中间层
4. **长期（大规模）：** Agent-Platform 间可选 gRPC 双向流，Kafka 解耦下游处理
