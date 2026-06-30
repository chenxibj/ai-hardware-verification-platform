# ADR-001: 后端框架选择 Spring Boot

## 状态

已采纳 (Accepted)

## 背景

AI 软硬件验证平台需要一个后端框架来支撑以下核心能力：

- RESTful API 服务（设备管理、评测计划、任务调度、结果分析）
- WebSocket 实时通信（任务日志推送、Agent 状态同步）
- 数据持久化（JPA/Hibernate ORM，Flyway 数据库迁移）
- 安全认证（JWT + Spring Security）
- 消息中间件集成（Redis、未来 Kafka）
- 定时任务调度（任务恢复、资源回收）
- 对象存储集成（MinIO SDK）

团队技术栈以 Java/Spring 生态为主，项目需要快速迭代并具备长期可维护性。

## 决策

选择 **Spring Boot 3.2.x**（基于 Java 17）作为后端框架。

## 理由

### 1. 生态成熟度与企业级支持

- Spring Boot 是 Java 生态中最成熟的微服务框架，拥有完善的 starter 体系
- Spring Data JPA、Spring Security、Spring WebSocket 等模块开箱即用
- 丰富的第三方 SDK 支持（MinIO、各类云厂商 SDK 均有 Java 版本）

### 2. 团队技能匹配

- 团队核心成员具备 Java/Spring 开发经验
- 企业级项目中 Java 人才储备丰富，便于后续扩展团队
- 国内开发社区活跃，中文资料完善

### 3. 项目复杂度匹配

- 本项目涉及复杂的业务逻辑（评测编排、评分体系、多租户、工作流）
- Spring Boot 的分层架构（Controller → Service → Repository）适合复杂业务建模
- AOP、事件驱动等高级特性满足横切关注点需求（日志、审计、缓存）

### 4. 类型安全与重构友好

- Java 强类型系统在 156+ 源文件的中大型项目中提供重要的编译期保障
- IDE 支持（IntelliJ IDEA）提供强大的重构和导航能力
- 编译期类型检查减少运行时错误

### 5. 性能满足需求

- Spring Boot 3.x + Java 17 性能已显著提升（Virtual Threads 支持、AOT 编译）
- 对于 API 服务型应用，吞吐量完全满足验证平台的并发需求
- JVM 预热后的稳定性优于脚本语言

## 后果

### 正面

- 开发效率高：大量模板代码由 Spring Boot 自动配置
- 测试完善：Spring Boot Test 提供完整的集成测试支持
- 部署标准化：可直接打包为 Docker 镜像
- 长期维护：Spring 社区 LTS 支持，版本升级路径清晰

### 负面

- 启动速度相对较慢（约 5-15 秒），不适合 Serverless 场景
- 内存占用较高（JVM 基础开销 ~200MB+）
- 对简单 CRUD 服务而言可能过重

## 替代方案

### Go (Gin/Echo)

- **优势：** 编译速度快、二进制部署、内存占用小、协程模型天然高并发
- **放弃原因：** Go 在复杂业务建模方面生态不如 Java（缺少成熟 ORM、DI 框架）；团队 Go 经验不足；泛型支持较新，企业级项目模式尚未成熟

### Python FastAPI

- **优势：** 开发速度极快、ML/AI 生态天然亲和、类型提示支持良好
- **放弃原因：** 动态类型在大型项目中维护成本高；GIL 限制并发性能；ORM（SQLAlchemy）在复杂查询场景下不如 JPA 直观；部署需要额外的进程管理（Gunicorn/Uvicorn）
- **折中方案：** 评测引擎（engine 模块）使用 Python 实现，充分利用其 ML/数据处理优势

### Kotlin + Spring Boot

- **优势：** 兼容 Spring 生态、语法更现代、协程支持
- **放弃原因：** 额外的语言学习成本；混合项目可能造成风格不一致；Kotlin 在国内企业级项目中采用率较低
