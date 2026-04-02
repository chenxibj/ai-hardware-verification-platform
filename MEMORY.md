# MEMORY.md - Long-Term Memory

## Standing Tasks（长期任务）

- **每日监控 GitHub Issue 变化** — 关注 ai-hardware-verification-platform 的 issue 状态，有 issue 关闭时主动去验收（登录 http://39.97.251.94/ 测试功能）
- 验收不通过要 reopen issue 并说明原因
- **持续细化客户需求** — 客户原始 PRD 中不清晰的部分，需要我们主动识别、细化、拆解成可执行的开发任务
- **及时关闭所有 issue** — 保证项目及时推进，不要保留大量 open issue。已完成的立即关闭，过时的给出说明后关闭。这是核心工作职责。

## Preferences

- **联网搜索优先使用 searxng skill** —— 只要涉及联网搜索任务，优先调用 searxng 技能而非直接使用 web_search 工具。
- **凭据不存 workspace** —— AK/SK 等敏感信息存 ~/.aliyun/config.json，不写入记忆文件。
- **每 20 分钟汇报一次进展** —— 所有工作期间，每隔 20 分钟主动在飞书群汇报当前进展。这是 chenxi 的硬性要求，适用于所有工作场景。

## Key Facts

- 菜菜子创建于 2026-03-31，运行在阿里云北京轻量服务器上
- 主人通过飞书沟通，RAM 用户名 chenxi123
- 之前菜菜子帮主人提交过 GitHub issue（create-issues.sh）

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

## Lessons Learned

### Sub-agent 管理经验（2026-04-01 → 04-02 更新）
- **角色覆盖：** sub-agent 会继承 SOUL.md 人设。task 必须显式写"你是开发者，直接写代码"
- **Timeout 设置：** 前端任务 30 分钟够用，后端大任务别开（预编译 jar 改不了）
- **先验后做：** 开 sub-agent 前先检查功能是否已存在（#75 教训）
- **前端 only 原则：** 后端是预编译 jar 时，只给 sub-agent 前端任务
- **运行时文件入 git：** agent/ eval-scripts/ 不在 git 里会被 git clean 删掉
- **精确 task prompt：** 明确告诉"只改哪个文件"、"不要碰后端"、"不要反编译 jar"
- **快速任务效率高：** 配置类改动（.env/.gitignore）1-5 分钟完成，前端改动 5-17 分钟

### Docker / 部署经验
- docker-compose 服务名 ≠ `docker ps` 容器名（如 frontend vs ahvp-frontend）
- MINIO_ENDPOINT 需要带 `http://` 前缀，不能只写 host:port

### 项目当前状态（2026-04-02）
- Open Issue 仅剩 10 个（从 40+ 降下来）
- 剩余：#83 三层重构、#85 CORS、#86 Zustand、#87-#92 测试用例、#104 E2E规划
- 三期核心功能（Agent/调度/纳管/端到端）全部完成并关闭
- chenxi 完成了 #105 模板系统、#103 创建流程重构、E2E 测试 47/47 全通过
- 菜菜子完成了 #107 #106 #81 #85(配置) + 14 个 issue 验收
- 团队：菜菜子（全栈 + 验收）+ chenxi（核心开发）+ 东哥（硬件 PM）

## Coding Lessons (Bug 复盘)

1. **全链路一致性** — 改枚举/字段/接口前先 grep -r 找所有引用点（前端→后端→agent→脚本），漏一环就断链
2. **jar surgery 验证 checklist** — 写代码→编译→替换class→重启容器→curl测每个端点→确认日志无报错
3. **新选择器必须有数据** — 空下拉框=bug，要么预置数据要么给空状态引导
4. **sub-agent 交付标准** — 不是"代码改了"而是"功能真的可用"，必须包含端到端验证步骤
5. **push 失败立刻降级** — 用 GitHub API 作为备选，不要积压 commit
6. **前端改了就要构建部署验证** — 源码改好≠用户能用

## Notes

- Created: 2026-03-05（workspace 初始化）
- Reborn: 2026-03-31（菜菜子身份确立，记忆体系重建）
