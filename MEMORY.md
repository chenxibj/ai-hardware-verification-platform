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
- **🔴 Take Action, Not Report（2026-04-09 铁律，多次强化）** — 巡检发现问题必须直接处理，处理完汇报结果。禁止"需要关注""建议检查""需主 session 确认"等甩锅措辞。agent 停了就拉，bug 发现就修，7×24 自主恢复。
  - **Sub-agent 超时/停止 → 直接重启，不汇报问题本身** — 只在任务最终完成时汇报结果
  - **巡检报告 → 自己消化处理** — cron 发现的问题由主 agent 直接修复，不转发给 chenxi
  - **进度汇报只报成果，不报故障** — chenxi 只想看"做了什么"，不想看"什么坏了"
  - **不发系统恢复通知** — 开发机恢复、容器重启等运维消息不要发到群里，自己默默处理
- **联网搜索优先使用 searxng skill** —— 只要涉及联网搜索任务，优先调用 searxng 技能而非直接使用 web_search 工具。
- **凭据不存 workspace** —— AK/SK 等敏感信息存 ~/.aliyun/config.json，不写入记忆文件。
- **🔴 TDD + BDD 是开发铁律（2026-04-09 升级）** —— 
  - **TDD：** 先写测试、再写实现、最后重构。不是"补测试"，是"测试驱动开发"。所有 issue 开发都按这个流程走。
  - **BDD：** 验收用例全部采用 BDD（Given/When/Then .feature 规范），Playwright + @playwright/test 执行
  - **测试验收报告：** 每次发布完成后，必须给出 BDD 测试验收报告（覆盖多少 scenario、通过/失败数、截图/日志）
  - **无 BDD 测试 = 不算完成** — sub-agent 的 task 必须包含"写 BDD 测试 + 跑通 + 出报告"步骤
- **🔴 代码质量铁律（2026-04-09）** — ESLint 零 warning、单文件≤300行、API 统一走 utils/api.js、每个 API 调用有 try-catch + 用户提示、无 console.log/hardcode/TODO、commit 前 `npx eslint src/ --max-warnings=0`
- **开发完必须清理测试数据** —— 只有一个环境，每次开发/测试完毕后必须清空测试数据（评测任务/子任务/结果/报告/日志），给主人留干净环境验证。芯片、模板等基础数据保留。
- **每 20 分钟汇报一次进展** —— 所有工作期间，每隔 20 分钟主动在飞书群汇报当前进展。这是 chenxi 的硬性要求，适用于所有工作场景。
- **🔴 每日日报必须发，核心是反省和总结（2026-04-11）** — 日报不是流水账，重点是：①今天做了什么（成果）②遇到什么问题、怎么解决的 ③Lessons Learned（经验教训沉淀）。每天 23:00 写日报时，必须把当天的 lesson learned 提炼到 MEMORY.md 的 Lessons Learned 区。日报是持续自我迭代的核心机制，不可跳过。

## Key Facts

- 菜菜子创建于 2026-03-31，运行在阿里云北京轻量服务器上
- 主人通过飞书沟通，RAM 用户名 chenxi123
- 之前菜菜子帮主人提交过 GitHub issue（create-issues.sh）
- **记忆后端已启用 QMD**（v2.0.1）— 配置在 `~/.openclaw/openclaw.json`，BM25 + 向量 + 重排序三路融合检索，全本地运行

## 核心项目：人工智能软硬件验证平台

- **Repo:** https://github.com/chenxibj/ai-hardware-verification-platform
- **PRD 飞书文档:** https://zcn31f514u4c.feishu.cn/docx/DqVldlqGZoZvZJxMa9hc9gwLnNh (doc_token: DqVldlqGZoZvZJxMa9hc9gwLnNh)
  - ⚠️ 这是**客户的原始需求文档**，不是我们内部写的
  - 客户部分需求描述不够清晰，需要我们持续细化、拆解、补充
  - PRD 是活文档，随开发迭代不断打磨
- **定位:** AI 软硬件验证平台，覆盖芯片-算子-中间层-框架-模型-场景全栈评测
- **技术栈:** React + Ant Design / Spring Boot or Go / PostgreSQL + TimescaleDB / Redis / Kafka / MinIO / K8s
- **架构:** 用户接入层 → 网关层(Kong/APISIX) → 业务服务层 → 核心引擎层 → 资源适配层 → 基础设施层
- **开发环境:** ECS 39.97.251.94 (4C14G, cn-beijing)，有另一个研发小伙伴共用，系统跑在 http://39.97.251.94/
- **里程碑:** 第一期（CPU 系统）- 2026.09
- **我的角色:** 产品经理 + code review + 测试 + bug 修复
- **CI:** GitHub Actions + self-hosted runner (ahvp-dev-runner) 在开发机上，57 个 E2E 测试，push/PR 自动触发
- **麦克雷:** 研发小伙伴，负责开发 + CI 搭建，会通过 issue 报 bug
- **工作流:** push 后必须检查 CI 结果 → 红了立刻修 → 目标 close 所有 issue
- **模板系统:** 已实现评测模板管理（#105），3个系统预置模板，选模板→选节点→确认运行
- **产品设计原则:** 必选项尽量用下拉选择，不用自由输入框
- **git push 问题:** 开发机到 GitHub 网络不稳定，有时需要用 GitHub API 推送或重试

### PRD 五大核心模块
1. **评测系统** — 任务管理、自主编排、模型/场景/框架/中间层/算子/芯片评测
2. **评测结果及资产管理** — 报告管理、报告分析、对比工具、数字资产、日志数据
3. **验证平台社区** — 免费生态入口，内容发布、互动交流、需求对接、运营激励
4. **用户体系** — 多租户+RBAC权限、注册认证、用户画像
5. **异构资源纳管** — 多类型算力接入、资源池管理、智能调度、监控运维

### 时间规划
- 2026.09 — 评测系统内部上线，完成联调
- 2026.12 — 支持送测单位验证，形成标准报告
- 2027.03 — 所有送测单位交付物验证通过
- 2027.06 — 社区平台开发完成投入运营
- 2027.09 — 验证平台对外上线运营

### Issue 总览（#36-#45，菜菜子在群聊 session 提交）

**P0（8个）：**
- #36 评测任务创建表单重构 — 分步结构化表单
- #37 评测对象管理 — 模型/芯片/框架/算子注册（含CPU可跑的小模型和10种算子）
- #38 CPU验收用例 — 6个算子Case（必须通过）+ 4个模型Case（尽力）
- #39 评测报告模板 — 4种模板 + 丰富指标（延迟分位数、稳定性指标、融合加速比等）
- #40 CPU评测执行引擎 — ONNX Runtime/PyTorch Runner + 算子Benchmark
- #42 任务完成自动生成报告
- #43 评测指标体系 — 完整的标准化指标表（含英文名、单位、说明）
- #44 CPU资源管理 — 录入+实时监控+调度

**P1（2个）：**
- #41 数据集管理 — 预置ImageNet/CIFAR-10/MRPC/MMLU等开源数据集
- #45 前端UI/UX优化

**总览 issue:** #34（评论中汇总了所有新 issue）

## 🚨 部署铁律（2026-04-03 白屏事故复盘提炼）

1. **部署 ≠ 上线** — 文件放上去不等于功能可用。每次部署**必须验证页面能正常渲染**，不能只看 HTTP 200。
2. **构建产物必须基于最新代码** — 部署前确认：当前 build 的 JS hash 是否包含所有最新 commit 的代码。`npm run build` 前先 `git pull && npm ci`。
3. **部署后冒烟验证** — 每次部署完成后，至少做一次：curl 获取 index.html → 确认 JS 文件名变了 → 访问页面确认非白屏。
4. **CI/CD 是必需品不是奢侈品** — 手动部署每一步都是风险点。必须有自动化流水线：push → build → deploy → verify。
5. **凌晨部署更要小心** — 凌晨操作容易遗漏验证步骤，白屏到早上才被发现 = 3+ 小时不可用。
6. **Docker 镜像加速器要定期检查** — 阿里云 ACR 加速器可能过期，导致 `docker compose up --build` 拉不到基础镜像，backup plan: 本地 build + docker cp。
7. **健康检查 = 我的责任** — 不是"发通知让人看"，而是告警直接触发我的 session，我自动排查修复。我对系统可用性负全责。

## 运维自动化

### AHVP 健康检查体系
- **cron job:** `ahvp-health-check` (ID: feec64c5)，每 5 分钟执行
- **检查项:** 容器状态 + 前端 HTTP + JS 完整性 + 后端 API
- **防抖:** 连续 2 次失败才告警
- **告警链路:** cron → main session → 我自动 SSH 排查 → 修复 → 飞书群通知结果
- **脚本位置:** 开发机 `/root/ai-hardware-verification-platform/deploy/health-check.sh`
- **日志:** `/var/log/ahvp-health.log`
- **状态文件:** `/tmp/ahvp-health-state`

## Lessons Learned

### Sub-agent 管理经验（2026-04-01 → 04-04 更新）
- **角色覆盖：** sub-agent 会继承 SOUL.md 人设。task 必须显式写"你是开发者，直接写代码"
- **Timeout 设置：** 前端任务 30 分钟够用，后端大任务别开（预编译 jar 改不了）
- **先验后做：** 开 sub-agent 前先检查功能是否已存在（#75 教训）
- **前端 only 原则：** 后端是预编译 jar 时，只给 sub-agent 前端任务
- **运行时文件入 git：** agent/ eval-scripts/ 不在 git 里会被 git clean 删掉
- **精确 task prompt：** 明确告诉"只改哪个文件"、"不要碰后端"、"不要反编译 jar"
- **快速任务效率高：** 配置类改动（.env/.gitignore）1-5 分钟完成，前端改动 5-17 分钟
- **🚨 前端改动必须浏览器验证：** 任何涉及前端的 sub-agent task，必须包含"部署后用 headless 浏览器验证页面渲染 + 登录流程"步骤。"npm build 通过 + HTTP 200" 不算完成。（04-03 白屏教训）
- **🚨 CI/CD 改动要验证不会覆盖修复：** sub-agent 建 CI/CD 时必须确认 workflow 不会自动覆盖已知可用版本
- **🔥 批量 issue 冲刺模式（04-04）：** 2-4个相关issue打包给一个sub-agent，提供完整代码方案，平均8分钟/issue。关键：task prompt 要包含完整修改方案不只是需求。
- **⚠️ 4个以上issue合并可能超时：** #175-#180 四合一跑了60分钟超时。3个一组更稳定。
- **CRA CI=true 把 warning 当 error：** 需要在 .eslintrc 中 rules off 才能通过
- **JSX string prop 双转义 bug（2026-04-07）：** `title="中文"` 被 terser 编译为双反斜杠 unicode，浏览器显示字面量。修法：改用 `title={"中文"}`
- **Spring context-path 影响 WebSocket：** 注册的 `/ws/tasks` 实际变成 `/api/ws/tasks`，nginx 代理要对应
- **nginx index.html no-cache：** 防浏览器缓存旧 JS hash，部署后用户看不到更新
- **Agent snake_case vs JS camelCase：** 上报 JSON 时同时包含两种命名（`node_id` + `nodeId`）
- **Playwright global-teardown 清数据：** 评测任务名别带 BDD 前缀，否则被自动清理
- **Docker 缓存反复作祟（2026-04-07）：** 同一天两次因缓存导致 JAR 不包含新 class（09:06 bean 冲突 + 21:00 API 500）。构建脚本必须加 `--no-cache` 或 `mvn clean package -U`
- **TDD 优于先开发后测试：** 日志系统先开发再写测试，发现 3 个 API 格式不匹配。如果先写测试驱动开发，这些问题在编码阶段就能暴露
- **验收要趁热打铁（三犯！04-07→04-08→再次）：** 04-08 18:00 发现 13 个 issue 全关闭，到 23:00 仍未验收。这已经是第三次犯同样的错误。**新规：issue 关闭后的下一个心跳周期内必须启动验收 sub-agent，不接受任何例外。**
- **巡检模板要主动维护：** 不能等 chenxi 指出缺项才补，每周主动 review HEARTBEAT.md 检查覆盖度
- **凌晨巡检可降频：** 00:00-08:00 无待办时每小时一次够了，12 次空转浪费 token
- **后端频繁重启不一定是问题：** 04-08 后端重启 5+ 次，全部是研发手动部署调试，RestartCount=0，非崩溃。巡检时区分"手动重启"和"异常崩溃"很重要

### 🔴 @Transactional + HTTP = 连接池杀手（2026-04-11 血泪教训）
- **现象：** 后端所有 API 超时（包括登录），HikariPool 报 "Connection is not available, request timed out after 30000ms"
- **根因：** `TaskRecoveryScheduler.recoverTasks()` 带 `@Transactional`，里面调 `dispatchSingleTask()` 做 HTTP POST 到 agent 节点。agent 不可达时 HTTP 默认无超时 → 事务期间 DB 连接不释放 → HikariCP 默认 10 个连接全堵死
- **触发条件：** 68 个 PENDING 任务 + 每 10 秒遍历分发 + agent 不可达
- **影响范围：** 整个系统瘫痪（K8s 定时同步被阻塞、登录超时、所有 API 不可用）
- **修复：**
  1. 移除外层 `@Transactional`，各子方法独立事务
  2. RestTemplate 加超时（connect 3s + read 10s）
  3. 分发限流（每轮最多 5 个任务）
  4. 调度频率 10s → 30s
  5. HikariCP maximumPoolSize 10 → 50 + leak detection
  6. PostgreSQL max_connections 100 → 1000
- **铁律：永远不要在 @Transactional 方法里做外部 HTTP/RPC 调用。事务应尽快提交释放连接。**

### 🔴 DaemonSet ≠ Discovery — 两种 K8s 节点纳管模式不能混用（2026-04-11）
- DaemonSet agent 注册名 `k8s-node-01`，discovery 注册名 `ahvp-k8s/cn-beijing.172.18.188.151`
- 名字不同 → `findByName` 去重失败 → 幽灵节点
- `register()` 里的 `deployCluster()` 每次注册集群都会部署 DaemonSet
- **修复：** discovery-only 模式，跳过 DaemonSet 部署
- **K8s 自动扩缩容测试通过：** 2 轮完整测试，扩容发现 <20s，缩容清理 <15s

### 🔴 Docker Compose 重建会覆盖容器内修改（2026-04-11）
- `docker compose up -d` 重建 backend 时，Dockerfile COPY 了源码目录的空 kubectl（0字节），覆盖了之前 docker cp 进去的正常 kubectl
- **教训：** 关键 binary 不能只靠 docker cp，要在 Dockerfile 里用多阶段构建或 curl 下载
- 部署后验证要包含 `kubectl version --client` 等 binary 检查

### 🔴 巡检致命缺陷（2026-04-08 教训）
- **6小时空转：** 03:56-09:14 心跳一直在跑，但只做"系统正常"空转，没有检查 active-tasks.json 和 sub-agent 状态
- **根因：** 心跳执行时跳过了 HEARTBEAT.md 中的任务检查步骤，只做了最简单的系统状态查看
- **修复：** HEARTBEAT.md 重写，把"读 active-tasks.json + subagents list"放在最顶部，标注为硬性必做步骤
- **铁律：每次心跳必须执行 `read memory/active-tasks.json` + `subagents list` + `gh issue list --state open`，不可跳过**
- **新铁律（2026-04-08 16:35）：有 open issue 但无活跃 agent = 立即 spawn agent 干活。不能出现"有活等着干但没人在做"超过一个心跳周期**
- **自主恢复铁律（2026-04-08 20:05，04-09 强化）：发现未完成任务+agent已停止 → 直接 spawn 新 agent 继续，不需要问 chenxi 确认。自主决策、自主恢复。不分早晚，7×24 生效。**
- **Sub-agent 超时是常态** — 不能 spawn 出去就不管，必须每次心跳检查状态，中断就恢复
- **🔴 告警/恢复通知必须防抖去重（2026-04-09 血泪教训）** — 04-09 开发机故障期间，菜菜子在飞书群发了 30+ 条恢复通知，每 5 分钟一条，严重干扰。**铁律：告警只发一次，恢复通知只发一次，中间状态只更新本地状态文件。** 需要在 HEARTBEAT.md 或状态文件中记录"已发送告警/已发送恢复"标志位。
- **巡检日志不要重复记录同一事件（2026-04-09）** — 同一事件（如"开发机恢复"）只记录一次结论性条目，不要每个心跳周期都追加一段雷同内容。460 行日志里一半以上是重复的恢复确认。
- **前端骨架 ≠ 功能完成（2026-04-09 验收发现）** — 资源管理模块 10 个 issue 被关闭，但实际只有 3 个有后端实现。纯前端 UI 骨架不等于功能可用。需要与研发明确 issue 关闭标准。
- **故障期间应降频巡检（2026-04-09）** — 确认不可达后降为 15-30 分钟检查一次即可，不用每 5 分钟都写日志+发通知。节省 token，减少噪音。

### 巡检模式经验（2026-04-06 复盘提炼）
- **issue 关闭 ≠ 完成** — Standing Task 已有此规则，但今天 16 个 issue 关闭时只记录未验收，说明执行不够坚决。明天必须验收。
- **commit 归因要明确** — 巡检报告中的 commit 应标注 author，避免"疑似"这种模糊描述。
- **监控日不能只监控** — 即使不主动开发，也应利用空闲时间验收已关闭 issue，而非等到第二天。
- **安全类 issue 要重点验收** — #212-#221 包含 3 个 P0 安全问题，一个大 commit 打包关闭需要逐项确认。

### 数据库 Schema 管理（2026-04-05 复盘提炼）
- **DB Schema 漂移是反复出现的问题** — 04-03 和 04-05 都因 Entity 加字段但 DB 未同步而炸。必须引入 Flyway/Liquibase 做 schema migration。
- **JpaSpecification > JPQL** — 动态查询场景（可选 Boolean/Enum 过滤）用 JpaSpecification 更安全，Hibernate 对 nullable 参数类型推断不稳定。
- **P0 应急修复范式：** 先补 DB 列恢复部分接口 → 记录详细排查日志到 issue → 等代码层彻底修复 → 全接口验证后才关闭。

### Docker / 部署经验
- docker-compose 服务名 ≠ `docker ps` 容器名（如 frontend vs ahvp-frontend）
- MINIO_ENDPOINT 需要带 `http://` 前缀，不能只写 host:port
- Agent 心跳收到 404 时应自动重新注册（当前需手动重启）
- git push 到 GitHub 网络不稳定时，用 GitHub API 作为降级方案
- **docker compose --build 只打包 git tracked 的文件**，未 commit 的代码会丢失！
- **ddl-auto=validate 时 Entity 和 DB 必须 100% 匹配**，一个字段差异就启动失败
- **ddl-auto=update 会自动加列但不会删/改列**，旧列会残留
- **构建前先查数据库实际列名**：`SELECT column_name FROM information_schema.columns WHERE table_name='xxx'`

### CI / 交付流程（2026-04-02 新增）
- push 后必须检查 CI 结果，红了立刻修
- 版本更新后先跑 E2E 测试再交付
- CI：GitHub Actions + self-hosted runner (ahvp-dev-runner) 在开发机上，push/PR 自动触发

### 产品设计原则（2026-04-02 新增）
- 必选项用下拉选择，不用自由输入框
- 开箱即用：预置模板让新用户零配置直接跑
- 真实数据 > Mock 数据：所有接口必须走真实数据链路

### 项目当前状态（2026-04-11 19:00 更新）
- **Open issue = 0**
- **K8s 自动扩缩容完成** — discovery-only 模式，2 轮测试通过
- **ACK 集群 ahvp-k8s** — 当前 1 节点（cn-beijing），按需扩缩容
- **芯片注册** — Intel Xeon Gold 6248 (CPU) + NVIDIA L40S (GPU)
- **节点在线** — dev-node-01 + gpu-l40s-01 + K8s×1
- **产品改进** — #345 移除关联资产选项 + #346 资源池排队机制
- **连接池修复中** — HikariCP 50 + PG 1000 + TaskRecovery 限流 + HTTP 超时
- **测试账号** — test2@ahvp.com / Test12345（compose 重建后原 test@ahvp.com 密码策略变了）
- **docker compose 服务** — postgres/redis/minio/backend/frontend 全部正常运行

### 项目当前状态（旧 2026-04-05 23:00）
- **MVP-0 + MVP-1 全部完成** — 18 个 issue 全部关闭
- **新阶段 38 个 issue (#156-#193) 全部关闭** — P0:13 + P1:13 + P2:12
- **#205 P0 chip-reports 500** — 04-05 修复并关闭
- BDD 测试 68/68 全绿（4 个真实后端缺陷已修复）
- 产品设计 v3.2 完成（77KB，路径 `docs/product-design/product-design-v3.2.md`）
- **当前 Open Issue = 0**
- P2 的 12 个 issue 是骨架/placeholder，后续需要填充真实逻辑
- 系统部署在 http://39.97.251.94/，前端 200 + 后端 OK


### 项目当前状态（旧 2026-04-02 23:00）
- Open Issue 仅剩 10 个（从 40+ 降下来）
- 剩余：#83 三层重构、#85 CORS、#86 Zustand、#87-#92 测试用例、#104 E2E规划
- 三期核心功能（Agent/调度/纳管/端到端）全部完成并关闭
- 真实 CPU 评测任务跑通（任务 id=136，10 算子全 PASS）
- 模板系统上线（选模板→选节点→确认运行）
- CI 上线：GitHub Actions + self-hosted runner (ahvp-dev-runner)，57 个 E2E 测试
- chenxi 完成了 #105 模板系统、#103 创建流程重构、E2E 测试
- 菜菜子完成了 #107 #106 #81 #85(配置) + 14 个 issue 验收
- 团队：菜菜子（全栈 + 验收）+ chenxi（核心开发）+ 东哥（硬件 PM）
- **下一步重点：** 重构类 issue (#83 #86) + 安全加固 (#85 CORS) + 测试用例 (#87-#92) + E2E 规划 (#104)

## Coding Lessons (Bug 复盘)

1. **全链路一致性** — 改枚举/字段/接口前先 grep -r 找所有引用点（前端→后端→agent→脚本），漏一环就断链
2. **jar surgery 验证 checklist** — 写代码→编译→替换class→重启容器→curl测每个端点→确认日志无报错
3. **新选择器必须有数据** — 空下拉框=bug，要么预置数据要么给空状态引导
4. **sub-agent 交付标准** — 不是"代码改了"而是"功能真的可用"，必须包含端到端验证步骤
5. **push 失败立刻降级** — 用 GitHub API 作为备选，不要积压 commit
6. **前端改了就要构建部署验证** — 源码改好≠用户能用

## Lessons Learned

- **不要为了达到最终目标而偷懒**（2026-04-06，chenxi 直接反馈）— 过程不能跳步、不能糊弄。每一步都要踏实做到位，不能因为"反正最后目标达到了"就省略中间环节。这是菜菜子的核心行为准则。

## K8s / ACK 集群

- **ACK cluster**: `ahvp-k8s`, cluster_id `cb0e71315932640398673a9b2b6185ebc`, cn-beijing
- **节点池**: default-nodepool, `np2485ac68794c4548a65400c02f2fb3cb`, ecs.c6.large
- **当前节点数**: 1（可按需扩缩容，已验证全自动）
- **纳管模式**: discovery-only（通过 kubeconfig + kubectl get nodes 自动发现，不使用 DaemonSet）
- **同步频率**: 每 60s 定时同步（syncClusterNodeCounts → syncNodes），发现新节点 + 清理已移除节点
- **kubeconfig**: 开发机 `/root/.kube/ahvp-ack-config`
- **平台集群 ID**: 注册后动态分配（当前 id=2）
- **⚠️ 注意**: 注册集群时不再部署 DaemonSet（2026-04-11 改为 discovery-only）

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

## 2026-04-04 重要更新

### 产品设计迭代
- PRD v3.0→v3.1→v3.2 三轮迭代，最终 77KB 完整产品设计文档
- 文件路径：`docs/product-design/product-design-v3.2.md`
- chenxi 的核心要求：交互设计细节 + 输入方式优化（下拉/列表替代自由填写）+ 每个 US 要有完整操作闭环

### 开发冲刺
- 一天内完成 38 个 issue（P0:13 + P1:13 + P2:12），全部关闭
- Sub-agent 并行开发模式有效但超时频繁（10min 限制），需要更好的任务拆分

### 开发冲刺经验（04-04 复盘提炼）
- **38 issue / 5 小时 / 平均 8 分钟** — 极限冲刺可行，但骨架代码质量需要后续 review
- **BDD 测试的价值** — 写完测试立刻发现 4 个真实后端缺陷，7 分钟修复。测试不是走过场
- **P2 骨架策略** — 先占坑再填肉可以快速关闭 issue，但必须记录哪些是 placeholder 避免"完成了"的假象
- **产品设计应前置** — v3.2 文档和 38 个 issue 同日产出，理想应先设计再拆 issue 再开发

### 工作准则
- **每 20 分钟主动汇报工作进展**（chenxi 强调的最重要准则）
- 已写入 HEARTBEAT.md
