# 回归测试报告 - 2026-05-01

## 测试环境
- **平台地址:** http://39.97.251.94/
- **后端:** ahvp-backend (Up 25h)
- **前端:** ahvp-frontend (Up 5d)
- **数据库:** ahvp-postgres (healthy)
- **缓存:** ahvp-redis (healthy)
- **对象存储:** ahvp-minio (healthy)
- **测试账号:** test@ahvp.com / Test1234
- **执行时间:** 2026-05-01 15:00 CST

---

## 汇总

| 测试套件 | 总用例 | 通过 | 失败 | 跳过 | 通过率 |
|----------|--------|------|------|------|--------|
| Backend 单元测试 (Maven) | 392 | 392 | 0 | 0 | 100% |
| Frontend 单元测试 (Jest) | 77 | 77 | 0 | 0 | 100% |
| Shell BDD 测试 (#152-#155) | 68 | 42 | 26 | 0 | 61.8% |
| Report E2E (#522) | 33 | 31 | 2 | 0 | 93.9% |
| Playwright E2E | 30 | 0 | 5 | 25 | 0% |
| **合计** | **600** | **542** | **33** | **25** | **90.3%** |

---

## 一、Backend 单元测试 (392/392 ✅)

48 个测试类，392 个用例全部通过。覆盖：
- 任务调度与恢复 (TaskQueue, TaskRecovery, TaskDispatcher)
- GPU Slot 管理 (GpuSlotService, OrphanReclaim)
- 评分系统 (ScoringService, SpecAwareScoring, UnifiedScoring)
- 评测计划 (PlanProgress, PlanTaskSplitter, PlanCancel)
- 报告生成 (ReportGenerator, ReportCoverage, ReportNo)
- 基线对比 (BaselineService, ComparisonService)
- 认证安全 (JwtTokenProvider, AgentTokenFilter)
- 指标归一化 (MetricsNormalizer)

**结论：后端逻辑层健康，无回归。**

---

## 二、Frontend 单元测试 (77/77 ✅)

4 个测试套件全部通过：
- fixes-279-288.test.js: API 路径、资产统计、版本历史、错误处理、Dashboard 聚合、报告评分 (28 tests)
- comparison.test.js: 对比计算、指标方向、维度评分 (35 tests)
- fix-471-eval-env.test.js: 评测环境动态展示 (7 tests)
- fixes-467-469-472-473.test.js: 计划列表/创建修复 (7 tests)

**结论：前端组件逻辑健康，无回归。**

---

## 三、Shell BDD 测试 (42/68, 61.8%)

### Issue #152 芯片 CRUD (18/19) ✅
- 唯一失败：UI 筛选功能 — 前端芯片列表页缺少按状态/类型筛选的 UI 实现
- **判定：真实功能缺失（低优先级），非回归 bug**

### Issue #153 评测计划 (6/18) ❌
- **根本原因：测试脚本过时**
  - 测试脚本向 POST /api/plans 发送 chipId + evalConfig.preset 格式
  - 后端 API 已升级，现要求 runSpecId 字段（运行规格 ID）
  - 缺少 runSpecId 导致返回 400，后续所有依赖计划创建的用例级联失败
- **判定：测试脚本未跟上 API 演进，非真实 bug**
- 12 个失败中：1 个是 API 参数不匹配，11 个是级联失败

### Issue #154 执行+报告 (1/14) ❌
- **根本原因：同 #153，计划创建失败导致整个执行链路无法测试**
- 测试脚本创建计划的代码同样缺少 runSpecId
- **判定：测试脚本问题，非真实 bug**

### Issue #155 Dashboard+导航 (17/17) ✅
- 全部通过，Dashboard API 和导航结构完整

---

## 四、Report E2E #522 (31/33, 93.9%)

独立的报告生成全流程测试（使用正确的 API 格式），大部分通过。

### 失败用例分析：
1. **1.7c Overall score > 0** — 报告综合评分为 0.0
   - 测试创建计划 → 执行任务 → 提交结果 → 生成报告，但最终 score=0.0
   - **判定：可能是真实 Bug** — 评分引擎未能基于提交的测试结果计算出有效分数

2. **4.6 Legacy data score is zero or invalid** — 旧格式数据评分也为 0.0
   - 与 1.7c 同源，评分引擎对测试数据的计算结果为 0
   - **判定：可能是真实 Bug 或测试数据不满足评分条件**

---

## 五、Playwright E2E (0/30, 全部失败)

### 根本原因：登录凭据失效
- 所有 Playwright 测试使用 admin@ahvp.com / Admin123456
- 该账号密码已被修改，API 返回 401
- 5 个测试在登录步骤超时失败（waitForSelector .ant-layout timeout）
- 25 个测试因依赖登录而被跳过（did not run）

### 涉及的测试：
- fix-425-426-427.spec.js: #425 计划详情导航、#426 通知 API 404、#427 芯片链接
- routing-phase-b.spec.js: 23 条路由可访问性测试 + 3 条导航交互测试

**判定：测试环境配置问题（admin 密码不匹配），非真实 bug**

---

## 六、发现的真实 Bug / 建议开 Issue

### Bug 1: 报告评分引擎返回 0 分
- **标题:** 报告评分为 0 — 自动生成的报告综合评分始终为 0.0
- **描述:** 通过完整 E2E 流程（创建计划 → 启动 → 提交任务结果 → 自动生成报告），报告的 overallScore 始终为 0.0。在 #522 Report E2E 测试中，Test 1.7c 和 Test 4.6 均复现此问题。评分引擎 ScoringService 单元测试通过（说明逻辑正确），但在真实 E2E 流程中未能产生非零分数，可能是评分条件不满足或测试提交的 metrics 格式不匹配评分预期。
- **优先级:** Medium
- **复现步骤:** 运行 bash e2e-tests/test-report-e2e.sh，观察 Test 1.7c

### 待修复项 1: 测试脚本需适配新 API
- **标题:** tests/run-all-tests.sh 需适配 runSpecId 必填参数
- **描述:** 后端 POST /api/plans 已新增 runSpecId 必填字段，但 run-all-tests.sh 中 #153/#154 的计划创建请求仍使用旧格式 {chipId, evalConfig.preset}。需更新为 {chipId, runSpecId, preset} 格式，runSpecId 可先通过 GET /api/run-specs 获取。
- **优先级:** High（影响 26 个用例的执行）

### 待修复项 2: Playwright 测试凭据更新
- **标题:** Playwright E2E 测试登录凭据失效
- **描述:** e2e/routing-phase-b.spec.js 和 e2e/fix-425-426-427.spec.js 硬编码使用 admin@ahvp.com / Admin123456，但该密码已被修改。需要：(a) 重置 admin 密码为 Admin123456，或 (b) 更新测试脚本使用 test@ahvp.com / Test1234，或 (c) 使用环境变量注入。
- **优先级:** High（影响全部 30 个 Playwright 用例）

### 功能缺失 1: 芯片列表筛选 UI
- **标题:** 芯片列表页缺少按状态/类型筛选功能
- **描述:** #152 测试期望芯片列表页有筛选组件（按芯片状态、芯片类型），但前端 JS 中未找到相关筛选代码。API 层面已支持 ?status=XXX&chipType=XXX 参数。
- **优先级:** Low

---

## 结论

| 类别 | 状态 |
|------|------|
| 后端逻辑 | ✅ 健康 (392/392) |
| 前端组件 | ✅ 健康 (77/77) |
| 核心 API 流程 | ⚠️ 基本健康，评分引擎需排查 |
| E2E 自动化 | ❌ 需修复：测试脚本过时 + 凭据失效 |
| 系统服务 | ✅ 全部正常运行 |

**总体评估：平台核心功能稳定，无严重回归。主要问题集中在测试基础设施（脚本过时、凭据失效），以及报告评分引擎的 E2E 集成可能存在 bug。建议优先修复测试脚本适配和凭据问题，然后排查评分引擎的真实数据链路。**
