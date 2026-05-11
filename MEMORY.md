# MEMORY.md - Long-Term Memory

## Standing Tasks（长期任务）

- **每日监控 GitHub Issue 变化** — 关注 ai-hardware-verification-platform 的 issue 状态，有 issue 关闭时主动去验收（登录 http://39.97.251.94/ 测试功能）
- 验收不通过要 reopen issue 并说明原因
- **持续细化客户需求** — 客户原始 PRD 中不清晰的部分，需要我们主动识别、细化、拆解成可执行的开发任务
- **按产品阶段推进 issue** — issue 不以全部关闭为目标，按产品经理划分的阶段（MVP-0/MVP-1/Phase 2/Phase 3）分阶段完成。当前阶段的 issue 优先推进，下阶段的 issue 开着不用急。
- **Watch GitHub issue** — 发现新 issue 立即处理，不需要问 chenxi，直接干。巡检时必查是否有新 issue 进来。

## Preferences

- **🔴 不造假（第零准则）** —— 绝不绕过正常流程伪造测试结果。功能没跑通就说没跑通，不包装不糊弄。"数据真但流程假"也是造假。这是道德底线。
- **🔴 每 20 分钟汇报工作进展（第一准则）** — 对所有工作、所有 session 生效，最高优先级，不可跳过。
- **🔴 工作未完成不停止（铁律）** — chenxi 明确要求：把工作全部完成，在此之前不要停止。任务没做完就继续干，不等下个心跳、不等下个 session。
- **🔴 Take Action, Not Report（铁律，多次强化）** — 巡检发现问题必须直接处理，处理完汇报结果。禁止"需要关注""建议检查"等甩锅措辞。agent 停了就拉，bug 发现就修，7×24 自主恢复。
  - Sub-agent 超时/停止 → 直接重启，不汇报问题本身
  - 进度汇报只报成果，不报故障 — chenxi 只想看"做了什么"
  - 不发系统恢复通知 — 运维消息自己处理
- **🔴 需求必须先出设计文档（铁律）** — 当消息中出现"需求"关键字时，**必须先在 GitHub 项目 repo 里提交新的设计文档**（docs/ 目录），再拆 issue 再开发。跳过设计直接写代码 = 违规。流程：理解需求 → 写设计文档 → commit push → 和 chenxi 确认 → 拆 issue 开发。设计文档是活文档，随时更新。
- **🔴 巡检必须检查设计文档 comments** — 每次巡检检查 GitHub repo `docs/` 下设计文档的新 comments，发现新 comment → 及时回复 + 更新文档 + 开 issue。
- **联网搜索优先使用 searxng skill**
- **凭据不存 workspace** —— AK/SK 等敏感信息存 ~/.aliyun/config.json
- **🔴🔴 TDD 是开发铁律（多次确认）** ——
  - **TDD 流程：** 先写测试 → 跑失败 → 写实现 → 跑通过 → 重构
  - **BDD 验收：** Playwright + @playwright/test，Given/When/Then
  - **Sub-agent 必须包含 TDD 三步结构**（见 docs/dev-standards.md）
  - **无测试 = 不算完成** — 测试必须验证业务正确性，不只是 HTTP 200
  - **CI 测试集必须随 bug 修复持续更新** — 修复和测试必须同一个 commit/PR
  - **CI 红不准推新功能**
- **🔴🔴 质量优先，系统性思考（chenxi 核心要求）** ——
  - **质量 > 速度** — 做 10 个真正修好的 bug fix，好过 20 个假装修好的
  - **系统性修复** — 找根因一次性修到位，不 case-by-case 打补丁
  - **理解上下游** — 改代码前 grep 找所有引用点，理解调用链，评估影响范围
  - **关联问题一起修** — 同一因果链上的 bug 一起分析修复
  - **禁止并行 sub-agent 改同一代码库** — 串行执行或严格模块隔离
- **🔴 代码质量铁律** — ESLint 零 warning、单文件≤300行、API 统一走 utils/api.js、每个 API 调用有 try-catch + 用户提示、无 console.log/hardcode/TODO
- **开发完必须清理测试数据** —— 芯片、模板等基础数据保留，评测任务/结果/报告/日志清空。
- **🔴 每日日报必须发，核心是反省和总结** — ①成果 ②问题及解决方式 ③Lessons Learned 沉淀到 MEMORY.md。每天 23:00，不可跳过。

## Key Facts

- 菜菜子创建于 2026-03-31，运行在阿里云北京轻量服务器上
- 主人通过飞书沟通，RAM 用户名 chenxi123
- 之前菜菜子帮主人提交过 GitHub issue（create-issues.sh）
- **记忆后端已启用 QMD**（v2.0.1）— BM25 + 向量 + 重排序三路融合检索，全本地运行

## 核心项目：人工智能软硬件验证平台

- **Repo:** https://github.com/chenxibj/ai-hardware-verification-platform
- **PRD 飞书文档:** https://zcn31f514u4c.feishu.cn/docx/DqVldlqGZoZvZJxMa9hc9gwLnNh
  - ⚠️ 客户原始需求文档，部分描述不够清晰，需持续细化
- **定位:** AI 软硬件验证平台，覆盖芯片-算子-中间层-框架-模型-场景全栈评测
- **技术栈:** React + Ant Design / Spring Boot / PostgreSQL + TimescaleDB / Redis / Kafka / MinIO / K8s
- **架构:** 用户接入层 → 网关层 → 业务服务层 → 核心引擎层 → 资源适配层 → 基础设施层
- **开发环境:** ECS 39.97.251.94 (4C14G, cn-beijing)，系统跑在 http://39.97.251.94/
- **里程碑:** 第一期（CPU 系统）- 2026.09
- **我的角色:** 产品经理 + code review + 测试 + bug 修复
- **CI:** GitHub Actions + self-hosted runner (ahvp-dev-runner)，push/PR 自动触发
- **麦克雷:** 研发小伙伴，负责开发 + CI 搭建，会通过 issue 报 bug
- **模板系统:** 已实现评测模板管理（#105），3个系统预置模板
- **git push 问题:** 开发机到 GitHub 网络不稳定，有时需要用 GitHub API 推送或重试

### PRD 五大核心模块
1. **评测系统** — 任务管理、自主编排、模型/场景/框架/中间层/算子/芯片评测
2. **评测结果及资产管理** — 报告管理、报告分析、对比工具、数字资产、日志数据
3. **验证平台社区** — 免费生态入口，内容发布、互动交流、需求对接
4. **用户体系** — 多租户+RBAC权限、注册认证、用户画像
5. **异构资源纳管** — 多类型算力接入、资源池管理、智能调度、监控运维

### 时间规划
- 2026.09 — 评测系统内部上线
- 2026.12 — 支持送测单位验证
- 2027.03 — 所有送测单位交付物验证通过
- 2027.06 — 社区平台开发完成
- 2027.09 — 验证平台对外上线

### Issue 总览（#36-#45）

**P0（8个）：** #36 评测任务表单重构、#37 评测对象管理、#38 CPU验收用例、#39 评测报告模板、#40 CPU评测执行引擎、#42 任务完成自动生成报告、#43 评测指标体系、#44 CPU资源管理

**P1（2个）：** #41 数据集管理、#45 前端UI/UX优化

**总览 issue:** #34

## 🚨 部署铁律（白屏事故复盘提炼）

1. **部署 ≠ 上线** — 每次部署必须验证页面能正常渲染，不能只看 HTTP 200
2. **构建产物必须基于最新代码** — `npm run build` 前先 `git pull && npm ci`
3. **部署后冒烟验证** — curl 获取 index.html → 确认 JS 文件名变了 → 确认非白屏
4. **CI/CD 是必需品不是奢侈品**
5. **凌晨部署更要小心** — 白屏到早上才发现 = 3+ 小时不可用
6. **Docker 镜像加速器要定期检查** — ACR 加速器可能过期
7. **健康检查 = 我的责任** — 告警直接触发我的 session，自动排查修复

## 运维自动化

### AHVP 健康检查体系
- **cron job:** `ahvp-health-check` (ID: feec64c5)，每 5 分钟
- **检查项:** 容器状态 + 前端 HTTP + JS 完整性 + 后端 API
- **防抖:** 连续 2 次失败才告警
- **脚本:** 开发机 `/root/ai-hardware-verification-platform/deploy/health-check.sh`

## Lessons Learned

### Sub-agent 管理经验（综合沉淀）
- **角色覆盖：** task 必须显式写"你是开发者，直接写代码"，否则继承 SOUL.md 人设
- **先验后做：** 开 sub-agent 前先检查功能是否已存在
- **精确 task prompt：** 明确"只改哪个文件"、"不要碰后端"，包含完整修改方案不只是需求
- **前端改动必须浏览器验证：** "npm build 通过 + HTTP 200" 不算完成
- **CI/CD 改动要验证不会覆盖修复**
- **Task 粒度：** 3 个 issue 一组最稳定，4+ 容易超时；单个重构 agent 目标 ≤1 个大文件
- **批量冲刺模式：** 2-4个相关issue打包，提供完整代码方案，平均8分钟/issue
- **CRA CI=true 把 warning 当 error：** 需要在 .eslintrc 中 rules off
- **Agent timeout ≠ 任务未完成：** 先 `git log` + `docker ps` 检查实际产出，不盲目重跑
- **push 失败 fallback：** task prompt 应预设 `git format-patch` 保存 patch，不在 push 上无限重试
- **test-results/ 等临时文件必须 .gitignore** — 截图混入 commit 导致 push 卡死
- **🔴 涉及 DB schema / Flyway / Docker 基础设施的变更，sub-agent 完成后必须主 session 手动验证（5/11）** — agent 不理解 Flyway checksum、Docker volume 等联动关系，容易留下半成品导致连环故障。此类任务考虑主 session 直接执行而非 delegate

### 🔴🔴 Sub-agent 并行修 bug = 质量灾难（核心教训）
- **现象：** 4 个 sub-agent 并行修 20 个 bug，全部报告"已验证"，复测发现多个未修复
- **根因：** "curl 200" ≠ "功能正常"；并行 agent 互相覆盖代码；agent 不理解业务只做机械修改
- **铁律：**
  1. 禁止并行改同一代码库 — 串行或严格模块拆分
  2. 验证必须走完整用户路径
  3. Task 必须包含具体验证场景
  4. 每个修复单独 commit
- **✅ 模块隔离并行有效** — 3 agent 严格按模块拆分（模板/前端/报告），零冲突。关键：文件集合完全不重叠

### 回归与测试经验（综合沉淀）
- **回归率 40%** — 10 修复产生 4 回归，旧数据兼容性是主要盲区
- **每轮修复后应跑全量 E2E** 再宣布完成
- **测试必须包含旧数据兼容性场景** — 新旧数据格式交叉测试是常见盲区
- **每个修复前做 mini 影响分析：** 影响哪些组件？旧数据格式兼容？关联组件需同步改？
- **E2E 测试需定期清理** — 只做加法不做减法 = 噪音淹没信号。月度清理：删过时、更新断言
- **测试顺序依赖 = 隐形 bug** — 单独跑全绿全量跑红 = 测试间有隐式依赖，每个测试必须 self-contained
- **E2E 测试分层：** API 测试 <1s/个适合每次 push；执行流程测试 3min+/个，不能混在同一 CI job
- **CI timeout 应随测试增长主动调整**
- **测试密码硬编码是定时炸弹** — 测试凭据必须用环境变量管理

### 🔴 @Transactional + HTTP = 连接池杀手（血泪教训）
- **现象：** HikariPool "Connection not available, request timed out after 30000ms"
- **根因：** `@Transactional` 方法内做 HTTP POST，agent 不可达时无超时 → DB 连接不释放 → 连接池耗尽
- **铁律：永远不要在 @Transactional 方法里做外部 HTTP/RPC 调用**
- **修复：** 移除外层事务 + RestTemplate 加超时 + 分发限流 + HikariCP 50 连接 + PG 1000 连接

### 🔴 JPA 陷阱合集
- **findAll().stream() 在 @Transactional 中 = 定时炸弹** — 一级缓存返回脏数据。聚合查询一律用 @Query JPQL/SQL，禁止 findAll().stream().filter().count()
- **双重 save + @Version 乐观锁 = 隐形地雷** — 同一事务内两次 save() 触发冲突。合并为单次 save
- **乐观锁 + 高频调度** — 调度循环中每个任务独立 try-catch，冲突后 skip 不 retry
- **Spring AOP self-invocation** — 同 bean 内方法互调不走 proxy，@Transactional 不生效。code review 必查

### 🔴 DaemonSet ≠ Discovery — K8s 纳管模式不能混用
- DaemonSet 注册名 vs discovery 注册名不同 → 去重失败 → 幽灵节点
- **修复：** discovery-only 模式，跳过 DaemonSet 部署
- K8s 自动扩缩容测试通过：扩容发现 <20s，缩容清理 <15s

### Docker / 部署经验
- **docker compose --build 只打包 git tracked 文件**，未 commit 代码会丢失
- **Docker Compose 重建会覆盖容器内修改** — 关键 binary 要在 Dockerfile 里处理，不靠 docker cp
- **Docker 缓存反复作祟** — 构建脚本必须加 `--no-cache` 或 `mvn clean package -U`
- **ddl-auto=validate 时 Entity 和 DB 必须 100% 匹配**；ddl-auto=update 会自动加列但不删改
- docker-compose 服务名 ≠ `docker ps` 容器名
- MINIO_ENDPOINT 需要带 `http://` 前缀
- Agent 心跳收到 404 时应自动重新注册

### 巡检经验（综合沉淀）
- **告警/恢复通知必须防抖去重** — 只发一次，中间状态只更新本地状态文件
- **巡检日志不重复记录同一事件**
- **故障期间应降频巡检** — 确认不可达后 15-30 分钟检查一次即可
- **每次心跳必须执行** `read memory/active-tasks.json` + `subagents list` + `gh issue list --state open`
- **有 open issue 但无活跃 agent = 立即 spawn agent 干活**
- **Sub-agent 超时是常态** — 必须每次心跳检查状态，中断就恢复
- **后端频繁重启要区分手动部署 vs 异常崩溃** — RestartCount=0 非崩溃
- **巡检 RestartCount 盲区** — `docker inspect --format '{{.RestartCount}}'`，>10 即告警
- **前端骨架 ≠ 功能完成** — 纯前端 UI 骨架不等于功能可用

### 🔴 系统性思考 vs 打地鼠（核心反思）
- **打地鼠模式（反面）：** IP 过滤链 #349→#355→#357→#360，每次修一个引入一个
- **系统性修复（正面）：** 退一步想清楚正确的前置条件，写成函数统一调用
- **Bug 分因果链：** 同链上的 bug 一起分析，找到链头修一次
- **改前先画调用链：** A 调 B 调 C，改 B 前要知道 A 怎么调、C 怎么反应
- **问"为什么会有这个 bug"而不是"怎么修这个 bug"**

### 数据库 Schema 管理
- **DB Schema 漂移是反复出现的问题** — 必须用 Flyway/Liquibase 做 schema migration
- **JpaSpecification > JPQL** — 动态查询场景用 JpaSpecification 更安全
- **ddl-auto=update 两次爆炸（04-05、04-27）** — 技术债不还终究出事
- **NOT NULL 约束设计要考虑全业务路径** — 枚举所有写入路径判断是否真的 NOT NULL
- **🔴 已发布的 Flyway 迁移文件绝不能修改（5/11 血泪）** — 修改 V1__baseline.sql + Docker rebuild = checksum mismatch → backend restart loop → 手动修复 40 分钟。铁律：Sub-agent task prompt 必须明确禁止修改 `db/migration/V*` 文件。新变更一律用新 V 编号
- **init.sql 也要有 CI 验证** — 建表语句语法错误（缺逗号、CHECK 引号）藏了数月，因为从未走过从零建库路径。建议加 `psql -f init.sql` 自动化检查
- **开发环境 Flyway 应关闭 checksum 校验** — `SPRING_FLYWAY_VALIDATE_ON_MIGRATE=false` 避免 rebuild 触发雪崩

### 架构与设计经验
- **架构级问题要架构级解决** — pushState 补丁治标不治本，React Router 重构彻底解决
- **重复 Controller 是 bug 温床** — 同类数据收敛到一个 Controller 或提取公共 Service
- **API 契约不一致是隐形杀手** — 前后端协议需要明确文档化
- **evalConfig 双重序列化** — Java Entity String 字段传入时必须是 JSON 字符串
- **方案→review→实施→验收闭环** — 先写方案让人 review，采纳反馈后再实施
- **Push→Pull 是正确方向** — Agent 主动拉取任务，消除安全组/防火墙依赖
- **Dispatch payload key 一致性要前置约定** — 后端 camelCase vs Agent snake_case，设计阶段用 JSON Schema 约束
- **维度 key 归一化应在 API 层做** — 前端到处做映射是 bug 温床，后端统一输出一套 key

### 产品设计原则
- 必选项用下拉选择，不用自由输入框
- 开箱即用：预置模板让新用户零配置直接跑
- 真实数据 > Mock 数据
- **Plan 级 GPU 预留 vs Task 级分配** — 方案选 gpu-4 就全预留，算子只用其中 1 张。产品层面的资源概念不能用技术思维简化

### 工作习惯与执行力（核心教训）
- **🔴🔴 规则/Lesson/TODO 不等于执行** — 从 4/14 到 4/28，14 天写了"空闲日应主动找活"。最终靠 cron 自动化强制执行才解决。**认知→规则→工具→自动化，每层传导有损耗，纯靠"写下来"不够，必须用 cron/代码强制执行。**
- **✅ 自动化 > 自律的正面验证** — idle-work-trigger cron 设置后第 1 天就自动产出。14 天自我承诺不如 1 个 cron。
- **启动是瓶颈，执行不是** — 31 分钟完成 5 个 fix，2.5 小时完成 7 个 issue。问题 100% 在"什么时候开始"。降低启动摩擦（自动 spawn）比提高执行速度更有价值。
- **不要把事情放到明天（chenxi 直接反馈）** — 怀疑有问题就立刻查。案例：日报 cron 投递连续失败 14 次，每天写"明天排查"从没排查。
- **不要为了达到最终目标而偷懒（chenxi 直接反馈）** — 过程不能跳步、不能糊弄，每一步都要踏实做到位。
- **验收要趁热打铁** — issue 关闭后的下一个心跳周期内必须启动验收 sub-agent，不接受例外。
- **空闲日标准动作：** ①review 产品 issue/反馈 ②系统健康检查 ③补测试 ④code review。没有 open issue ≠ 没有工作。
- **"被阻塞"≠"无产出"** — 开发机停了也可以做 GitHub review、设计文档、MEMORY 整理等不依赖开发机的工作。
- **Cron error 24 小时内必须修复** — 像生产告警一样处理
- **日报反思篇幅应与产出成正比** — 无产出写长篇反思是拖延的变种

### Cron 运维经验
- **delivery.channel: "last" 不可靠** — 必须显式指定 `channel: feishu` + `to: chat:xxx`
- **cron 投递失败是静默的** — 定期检查 `openclaw cron runs --id xxx` 确认 `delivered: true`
- **cron jobs 可能被意外删除** — 定期 `openclaw cron list` 验证
- **巡检 cron 不应直接修改主 session 管理的 running 任务状态** — 加时间戳对比避免竞态
- **cron delivered=false 要跟进（5/4）** — 催续费飞书 DM 投递失败，消息可能没到 chenxi。重要通知应在主 session 补发确认
- **连续停机应写 recovery-plan.md（5/4）** — 4 天停机只有零散待办，缺系统化恢复计划。长停机（>2天）时主动整理恢复后优先级清单
- **自动化降级 > 人工修复（5/4）** — idle-work-trigger 加预检逻辑后自动从连续 error 恢复，验证了"让 cron 自愈"比"等人排查"更高效
- **停机 ≠ 停工（5/5）** — 开发机不可用时仍可做 E2E 数据分析、issue 创建、GitHub CI 上跑测试修 bug、recovery plan 编写。#549 完全在 GitHub 上完成修复闭环
- **PRD Gap Analysis 是停机期最有价值的工作（5/8）** — 不依赖开发机，直接对照 PRD 和代码输出每个 User Story 完成度。产出的 gap report 直接指导恢复后优先级和设计文档方向
- **停机日应设 daily target（5/8）** — 即使不能部署，code review/PRD分析/设计文档/issue规划等工作不依赖开发机，每天至少 3 个产出项
- **🔴 Recovery Plan ROI 极高（5/9 验证）** — 8 天停机准备 + 2.5 小时恢复全部积压。预写 checklist = 恢复后零决策延迟。铁律：任何长阻塞（>2天）第一时间写 recovery plan
- **周末空闲无产出 = 规则失效的信号（5/10）** — 0 open issue + 28% PRD gap + 0 篇设计文档 = 典型的"没人催就不干"。解法不是写更多规则，是让 idle-work-trigger 真正 work
- **扫描→修复闭环 <4h 是正确节奏（5/11）** — 代码质量扫描发现 AGENT_TOKEN 硬编码 P0，同天下午修复部署。主动扫描的价值在于即时行动，不是写报告存档
- **Flyway 是反复出现的部署风险（第3次，5/11）** — init.sql 质量 + checksum 管理需要更严格的 pre-commit 检查。三次教训：04-05 ddl-auto 迁移、04-27 schema 漂移、05-11 语法错误
- **空闲日 5 项产出验证了 Step 2.5 机制（5/11）** — E2E 回归 + 设计文档 + 质量扫描 + 部署 + 安全修复，全自主零人工。HEARTBEAT.md 的空闲触发规则终于稳定运转
- **E2E 测试维护 = 主动 bug hunting（5/9）** — 更新过时断言的过程中发现 #552 真实 bug。定期维护 E2E 不是 housekeeping 而是 bug 发现机制
- **停机期准备 + 恢复后冲刺 = 最佳模式（5/9）** — 不能改代码的日子做分析/规划/review，恢复第一天密集执行。pattern 已验证
- **E2E 失败先分类再修复（5/5）** — 33 个失败先按根因分类（真实 bug vs 基础设施问题），避免盲目修复。发现真实 bug (#549) 并优先修复，其余 31 个归为技术债 (#550)
- **🔴 Sub-agent 失败后必须立即重试（5/6 再次验证）** — 5/4 写过、5/6 又犯。认知→执行的 gap 是真实存在的。对策：spawn 失败后设 15 分钟自动重试逻辑，不依赖人工判断
- **🔴 飞书投递失败 = 汇报体系静默（5/10）** — 连续 50+ 次 patrol delivered=false 无人察觉。必须有 fallback：投递失败 N 次 → 主 session 交互时主动提醒 + 补发关键通知
- **Cron error 不能写在规则里就完事（5/10 再次验证）** — idle-work-trigger 连续 3 天 timeout，正是"Cron error 24h 内必须修复"铁律的反面教材。和"空闲日应主动找活"一样，规则写了≠执行了。自动化监控 > 自律
- **idle-work-trigger 架构问题（5/10）** — 单个 cron 又判断又执行，超时是必然。应拆成：轻量判断（选任务）→ spawn sub-agent（执行）。cron 本身 <30s 完成
- **Task prompt 必须预判环境限制（5/6）** — 明知开发机停机却没在 prompt 写"禁止 SSH"，导致 agent 可能卡在连接上。所有 spawn 前先列出当前环境约束并写入 task
- **Task prompt 优化 ROI 极高（5/7 验证）** — 同一个 P0-2 修复，5/6 超时失败，5/7 精准 prompt 8 分钟完成。5 分钟优化 prompt > 30 分钟盲目重试
- **长停机应升级沟通策略（5/7）** — 单渠道（DM）催费连续无回应 7 天 = 该换策略。应尝试群 @mention、多渠道并发、或标记为需用户决策的阻塞项
- **积压修复需维护部署验证 checklist（5/7）** — 停机越久积压越多，恢复后不是盲目部署，而是按清单逐个验证（commit → 预期行为 → 验证步骤）

### 测试账号/环境管理
- **验收前先验证登录** — 密码可能被改过
- **TRUNCATE 后必须重启后端** — JPA 缓存 @Version 不同步导致乐观锁异常
- **测试账号**: admin@ahvp.com / Test1234, test@ahvp.com / Test1234 (super_admin)

### Code Review 驱动开发
- **Code Review > Bug 驱动开发** — 三次验证：4/18 调度模块 44 问题、4/23 Baseline 15 问题（含 P0 数据丢失风险）。主动审查远优于等 bug 上报
- **create-before-delete 是数据安全基本模式** — 先删后建，生成失败 = 数据丢失。正确：创建新的 → 验证成功 → 删除旧的

### 其他技术经验
- **JSX string prop 双转义 bug：** `title="中文"` 被 terser 编译为 unicode。修法：改用 `title={"中文"}`
- **Spring context-path 影响 WebSocket：** `/ws/tasks` 实际变成 `/api/ws/tasks`
- **nginx index.html no-cache：** 防缓存旧 JS hash
- **Hibernate 6 方言升级是隐形地雷** — nullable JPQL 参数类型推断变化，修法：native SQL + 显式 CAST
- **Chrome HTTPS-First + 443 端口 = 灾难** — 不用 HTTPS 就别映射 443
- **PyTorch DataParallel 小模型死锁** — scatter/gather 开销 > 计算时间时死锁
- **Build metadata 是可追溯性基础** — GIT_COMMIT/VERSION/BUILD_TIME 应 Day 1 就有
- **Docker build args ≠ runtime env** — Dockerfile ARG 只在构建时有效，运行时需要 ENV
- **🔴 云资源到期必须提前预警** — 开发机到期停机 14 小时才发现。应设置 cron 每日检查资源到期时间
- **安全类 issue 应独立提优先级** — 不应与技术债务同优先级排序
- **连续停机应制定恢复行动计划** — 停 4 天只有零散待办，应写 recovery-plan.md 系统化排列恢复后优先级
- **cron delivered=false 要跟进** — 重要消息（如催续费）投递失败 = 没催到，必须在主 session 补发确认

## Coding Lessons (Bug 复盘)

1. **全链路一致性** — 改枚举/字段/接口前先 grep -r 找所有引用点，漏一环就断链
2. **新选择器必须有数据** — 空下拉框=bug
3. **push 失败立刻降级** — 用 GitHub API 作为备选
4. **前端改了就要构建部署验证** — 源码改好≠用户能用
5. **功能从 0 到 1 的正确节奏** — 底层先行（API+公式库）→ 入口 → 核心页面 → bug 修复。严格串行，每步部署+验证
6. **串行依赖链 > 并行冲刺** — 按依赖链串行 spawn，零冲突零覆盖
7. **大功能上线后预留 1-2 小时 bug fix 窗口** — 不要急着汇报"全部完成"
8. **技术债按"累积风险"排优先级** — Flyway 拖 25 天，期间 3 次 schema 相关 bug，总成本远超一次性做

## 🏗️ 调度模块开发最佳实践（工程准则）

1. **状态变更收敛到统一路径** — 任何终态变更（COMPLETED/FAILED/CANCELLED）必须走同一个方法，集中处理所有副作用
2. **有状态资源需要三道防线** — 正常释放 + 异常回调释放 + 定时兜底扫描
3. **改架构模式必须全量搜索旧模式引用** — `grep -rn "旧模式关键词"` 逐个确认
4. **乐观锁 + 高频调度 = 必须有异常隔离** — 每个任务独立 try-catch，旧数据及时清理
5. **前后端字段语义必须对齐** — API 联调时先 curl 验证，不假设字段含义一致
6. **@Transactional 内禁止外部调用** — 外部超时 → 连接不释放 → 全系统瘫痪
7. **Agent 进程 Day 1 就要 systemd 化** — SSH 断开 = 进程死亡
8. **并发模型必须显式设计** — 多 GPU 节点线程池并发，任务完成后立即 re-poll
9. **控制台验收 > API 验收** — curl 200 ≠ 功能正常，必须走完整 UI 路径
10. **Bug 修复要溯因不要打补丁** — 问"为什么会有这个 bug"

### 项目当前状态（2026-05-11 更新）
- **✅ 开发机正常运行**
- **后端版本:** e8678302 (2026-05-11)，健康检查全绿
- **E2E 测试:** 68/68 全绿 (100%)
- **Open Issue = 0** 🎉
- **PRD v3.2 Gap Analysis 已完成** — 第一期核心 ~82%，总体 ~72%，详见 memory/prd-gap-analysis-20260508.md
- **新设计文档:** docs/design-eval-params.md (US-1.4 六层参数配置，待 review)
- **代码健康度:** 🟡 中等偏下（详见 memory/task-progress-code-quality-0511.md）
  - 前端测试覆盖率 2.5% 是最大短板
  - AGENT_TOKEN 安全漏洞已修复 (e8678302)
  - EvaluationTaskController 936 行待拆分
- **⚠️ 待处理（按优先级）：**
  - P1: 基于代码扫描结果拆 issue（Controller 拆分、前端测试基础设施、静默 catch 审计）
  - P2: US-1.4 评测参数配置实现（等设计文档确认，~13 工作日）
  - P2: US-1.9 自主编排设计文档
  - P2: #550 long-term: shell E2E 迁移到 Playwright

## K8s / ACK 集群

- **ACK cluster**: `ahvp-k8s`, cluster_id `cb0e71315932640398673a9b2b6185ebc`, cn-beijing
- **节点池**: default-nodepool, ecs.c6.large
- **当前节点数**: 1（可按需扩缩容，已验证全自动）
- **纳管模式**: discovery-only（kubeconfig + kubectl get nodes 自动发现）
- **同步频率**: 每 60s 定时同步
- **kubeconfig**: 开发机 `/root/.kube/ahvp-ack-config`

## 平台节点（截至 2026-04-09）

| id | name | IP | status | source |
|----|------|----|--------|--------|
| 2 | dev-node-01 | 172.17.0.1 | ONLINE | local |
| 18 | gpu-l40s-01 | 180.184.249.205 | ONLINE | gpu |
| 20 | k8s-node-01 | 172.18.188.151 | ONLINE | k8s |
| 21 | k8s-cn-beijing.172.18.188.151 | 172.18.188.151 | ONLINE | k8s-daemonset |
| 22 | k8s-cn-beijing.172.18.188.152 | 172.18.188.152 | ONLINE | k8s-daemonset |

## Notes

- Created: 2026-03-05（workspace 初始化）
- Reborn: 2026-03-31（菜菜子身份确立，记忆体系重建）

## 开发冲刺经验

- **38 issue / 5 小时** — 极限冲刺可行，但骨架代码质量需后续 review
- **27 issue / 1 天 / 全自主** — 巡检→分析→spawn→验证→关闭，零人工介入
- **BDD 测试的价值** — 写完测试立刻发现 4 个真实后端缺陷
- **P2 骨架策略** — 先占坑再填肉，但必须记录哪些是 placeholder
- **产品设计应前置** — 先设计再拆 issue 再开发
- **全自主模式边界意识** — 全自主 ≠ 不需要 review，7+ issue 的新模块必须先出设计文档
- **模块隔离并行策略成熟** — 报告(backend) + UX(full-stack) + baseline(backend) 三线并行零冲突
- **停机恢复 → 全量 E2E 是最优第一步（5/9 验证）** — 一次跑暴露所有积压问题，比逐个验证高效 10 倍。6 分钟修 26 个断言 + 捞出 1 个真实 bug
- **E2E 失败分析即 code review（5/9 验证）** — 测试失败原因分析 = 最高效的 code review 形式，同时修测试+发现真 bug
- **发现 bug 到关闭应在同一 session 内闭环** — #552 从发现到修复 <20 分钟，这是理想节奏
