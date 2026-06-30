# Architecture Decision Records (ADR)

本目录记录 AI 软硬件验证平台的关键架构决策。

## 索引

| 编号 | 标题 | 状态 |
|------|------|------|
| [ADR-001](ADR-001-spring-boot.md) | 后端框架选择 Spring Boot | 已采纳 |
| [ADR-002](ADR-002-postgresql-timescaledb.md) | 数据库选择 PostgreSQL + TimescaleDB | 已采纳 |
| [ADR-003](ADR-003-react-antdesign.md) | 前端框架选择 React + Ant Design | 已采纳 |
| [ADR-004](ADR-004-kafka.md) | 消息队列选择 Kafka | 已规划 |
| [ADR-005](ADR-005-minio.md) | 对象存储选择 MinIO | 已采纳 |
| [ADR-006](ADR-006-agent-communication.md) | Agent 通信选型 | 已采纳 |

## ADR 格式说明

每个 ADR 包含以下章节：

- **状态：** 已提议 (Proposed) / 已采纳 (Accepted) / 已废弃 (Deprecated) / 已替代 (Superseded)
- **背景：** 决策产生的上下文和驱动力
- **决策：** 具体采用的方案
- **理由：** 为什么选择这个方案
- **后果：** 正面和负面影响
- **替代方案：** 曾经考虑但最终未采用的方案及原因
