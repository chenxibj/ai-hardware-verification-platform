# 代码质量扫描报告 2026-05-11

## 摘要

| 指标 | 数量 |
|------|------|
| ESLint errors | 0 |
| ESLint warnings | 0 |
| console 语句（前端） | 17 处 |
| TODO/FIXME（前端） | 11 处 |
| TODO/FIXME（后端） | 5 处 |
| 超标大文件（>300行） | 前端 18 个 + 后端 15 个 + Agent 4 个 = **37 个** |
| 硬编码 IP/localhost | 前端 3 处（placeholder）+ 后端 2 处（逻辑判断）|
| System.out.print（后端）| 4 处 |
| catch(Exception ignored/empty) | **~35 处**（多个文件累计）|
| 重复 boilerplate 代码 | EvaluationTaskController 中 50 处相同 error response 模式 |
| 安全敏感 | AGENT_TOKEN 有默认硬编码值 |

### 测试覆盖

| 层 | 源文件数 | 测试文件数 | 覆盖率估算 |
|----|----------|-----------|-----------|
| 后端 Java | 151 | 50 | ~33%（按文件数） |
| 前端 React | 118 | 3 | **~2.5%（极低）** |
| Python Agent | 9（非test） | 10 | ~100%（按文件数，较好） |

---

## 详细发现

### P0（必须修复）

#### 1. 🔴 前端测试覆盖率极低（118 个源文件 vs 3 个测试文件）
- **现状：** 整个前端只有 3 个测试文件（`fixes-279-288.test.js`, `fixes-467-469-472-473.test.js`, `fix-471-eval-env.test.js`），全是 bugfix 回归测试
- **影响：** 前端任何改动都无法自动验证，回归风险极高
- **建议 Issue：**
  - `[FE-TEST] 为核心页面组件补充单元测试（ChipProfile, PlanCreate, PlanMonitor）`
  - `[FE-TEST] 为 hooks (useLogWebSocket) 和工具函数补充测试`

#### 2. 🔴 AGENT_TOKEN 有默认硬编码值
- **位置：** `backend/src/main/resources/application.yml` → `token: ${AGENT_TOKEN:ahvp-agent-secret-2026}`
- **风险：** 如果部署时未设置环境变量，任何人知道默认 token 就能冒充 agent
- **建议 Issue：** `[SEC] 移除 AGENT_TOKEN 默认值，未配置时启动失败`

#### 3. 🔴 EvaluationTaskController 过于臃肿（936 行）
- **问题：** 一个 Controller 文件 936 行，包含 50 处重复的 error response 构建模式（`Map<String, Object> response = new HashMap<>()`）
- **影响：** 维护困难，违反 SRP，error handling 不统一
- **建议 Issue：** `[REFACTOR] 拆分 EvaluationTaskController，抽取统一异常处理`

---

### P1（应该修复）

#### 4. 🟠 前端大量 console 语句（17 处）
**位置清单：**
- `PlanMonitor.js:128,142` — console.error
- `Logs.js:50` — console.error
- `Resources.js:123` — console.error
- `ChipList.js:87` — console.error
- `ChipReport.js:324` — console.error
- `ChipProfile.js:137` — console.error
- `PlanList.js:142` — console.error
- `TaskExecutionLogs.js:74` — console.error
- `useLogWebSocket.js:111,147,156,173,206,228,255,258` — console.error/warn/log（**最多，8处**）

**建议 Issue：** `[FE] 替换 console.xxx 为统一日志工具，生产构建移除`

#### 5. 🟠 前端 TODO 待实现（11 处，涉及核心功能）
**高优先级 TODO：**
- `AlertConfig.js` — 后端 API 未实现，前端用 localStorage 代替（2处）
- `ClusterList.js` — 后端实现后启用（3处）
- `ResourceMonitor.js` — 实时 CPU/内存 API 未对接（5处）
- `SelfHealing.js` — 自愈策略 API 未实现

**建议 Issue：**
- `[BE+FE] 实现告警配置 API /api/alerts/config`
- `[FE] ResourceMonitor 对接实时 metrics API`

#### 6. 🟠 后端 TODO（5 处）
- `TaskRecoveryScheduler.java:70` — 多实例部署需 @SchedulerLock（**生产风险**）
- `NodeMetricsController.java:61,69` — metrics_history 用合成数据（**数据准确性**）
- `ComputeNodeService.java:417` — 多实例部署需 @SchedulerLock
- `AssetService.java:78` — createdBy 硬编码为 0

**建议 Issue：**
- `[BE] 引入 ShedLock 防止定时任务多实例重复执行`（#493 已标注）
- `[BE] NodeMetrics 对接真实时序数据`

#### 7. 🟠 后端 catch(Exception ignored) 泛滥（~35 处）
**典型问题文件：**
- `ChipReportController.java` — 7 处 ignored
- `ScoreRankingController.java` — 6 处 ignored
- `ResourcePoolService.java` — 4 处 ignored
- `TemplateController.java` — 3 处 ignored

**风险：** 异常被静默吞掉，问题难以排查
**建议 Issue：** `[BE] 审计并修复所有 catch(Exception ignored) 块，至少添加 debug 日志`

#### 8. 🟠 后端 System.out.println（4 处）
- `Application.java:18-21` — 启动信息用 System.out 而非 logger
- **建议 Issue：** `[BE] Application 启动日志替换为 SLF4J`

---

### P2（建议改善）

#### 9. 🟡 前端超标大文件（18 个 >300 行）
**Top 5 最大文件：**

| 文件 | 行数 | 备注 |
|------|------|------|
| ChipProfile.js | 1461 | 🔴 **严重超标**，应拆分为多个子组件 |
| PlanCreate.js | 1243 | 🔴 表单逻辑过重 |
| ChipReport.js | 1010 | 🟠 报告展示，考虑拆分 section |
| ReportCompare.js | 944 | 🟠 |
| Resources.js | 878 | 🟠 |

其他 >300 行：TaskResult(811), PlanMonitor(796), ChipList(649), SelfHealing(575), ResourceMonitor(552), Dashboard(536), Reports(529), ResourcePoolList(518), routes.js(511), ChipCompare(482), PlanList(478), TemplateList(473), AlertConfig(447)

**建议 Issue：** `[FE-REFACTOR] 拆分 ChipProfile.js (1461行) 和 PlanCreate.js (1243行)`

#### 10. 🟡 后端超标大文件（15 个 >300 行）
**Top 5：**

| 文件 | 行数 |
|------|------|
| EvaluationTaskController.java | 936 |
| TaskDispatcher.java | 712 |
| EvaluationResultService.java | 647 |
| ComputeNodeController.java | 637 |
| BaselineService.java | 610 |

其他：TaskLogController(529), PlanTaskSplitter(523), TaskRecoveryScheduler(501), K8sClusterService(496), ComputeNodeService(471), EvaluationTaskService(428), ChipReportController(426), ResourcePoolService(416), EvaluationPlanService(408), ChipService(368)

#### 11. 🟡 Python Agent executor.py 过大（1101 行）
- 核心执行逻辑全在一个文件，建议按评测类型拆分

#### 12. 🟡 前端硬编码 IP placeholder（3 处，低风险）
- `NodeList.js:217` — placeholder="192.168.1.100"
- `Resources.js:550` — placeholder="例如：192.168.1.100"
- `NodeRegisterTab.js:118` — placeholder="如: 192.168.1.100"
- 这些是表单提示文案，不影响功能，但建议统一常量

#### 13. 🟡 后端 localhost 检查逻辑（2 处，合理使用）
- `TaskDispatcher.java:338` — 拒绝 127.0.0.1/localhost 节点调度
- `ComputeNodeService.java:87` — 判断是否本地节点
- 属于合理的业务逻辑，无需修改

---

## 后端测试覆盖缺口分析

### 有测试的模块
- task（15 个测试文件）✅ 覆盖最好
- scoring（5 个测试文件）✅
- chipreport（5 个测试文件）✅
- result（5 个测试文件）✅
- plan（4 个测试文件）✅
- gpu（3 个测试文件）✅
- baseline（2 个测试文件）✅
- config（2 个测试文件）✅
- comparison（1 个测试文件）⚠️
- dimension（1 个测试文件）⚠️
- user（1 个测试文件）⚠️
- system（1 个测试文件）⚠️

### ⚠️ 完全没有测试的 Service/Controller
- `AlertService` / `AlertController` — 告警模块
- `AssetService` / `DigitalAssetService` / `DigitalAssetController` — 资产管理
- `K8sClusterService` / `K8sClusterController` — K8s 集群管理
- `ResourcePoolService` / `ResourcePoolController` — 资源池
- `TenantService` / `TenantController` — 多租户
- `EvaluationPlanService` / `EvaluationPlanController` — 评测计划核心逻辑
- `AuthController` — 认证
- `AdminController` — 管理后台
- `ComputeNodeController` — 计算节点管理
- `CommunityResourceController` / `LeaderboardController` — 社区功能
- `WorkflowController` / `BillingController` / `FeedbackController` — 新模块

---

## 建议的 Issue 拆分

### 高优先级（P0，本周处理）
1. **`[SEC] 移除 AGENT_TOKEN 默认值，强制环境变量配置`** — 安全风险
2. **`[BE-REFACTOR] 拆分 EvaluationTaskController，引入统一异常处理`** — 936行，50处重复
3. **`[FE-TEST] 建立前端测试基础设施，为核心组件补测试`** — 118:3 覆盖率

### 中优先级（P1，本 Sprint）
4. **`[BE] 引入 ShedLock 防止定时任务多实例重复执行`** — 已有 #493 TODO
5. **`[FE] 统一前端日志工具，替换 console.xxx`** — 17 处
6. **`[BE] 审计修复 catch(Exception ignored) 至少加 debug 日志`** — ~35 处
7. **`[BE+FE] 实现告警配置、集群管理、自愈策略后端 API`** — 多个 TODO 依赖
8. **`[BE] Application 启动日志改用 SLF4J`** — 4 处 System.out

### 低优先级（P2，Backlog）
9. **`[FE-REFACTOR] 拆分 ChipProfile (1461行)、PlanCreate (1243行)`**
10. **`[BE-REFACTOR] 拆分 TaskDispatcher (712行)、EvaluationResultService (647行)`**
11. **`[AGENT] 拆分 executor.py (1101行) 按评测类型模块化`**
12. **`[BE-TEST] 补充 Alert、Asset、K8s、ResourcePool、Tenant 模块测试`**
13. **`[FE] 统一表单 placeholder 常量`**

---

## 总体评估

**代码健康度：🟡 中等偏下**

**优势：**
- ESLint 零报错，前端代码规范较好
- 后端核心模块（task、scoring、result）测试覆盖较好
- Python Agent 测试覆盖率不错
- 安全敏感配置大部分使用环境变量

**主要风险：**
- 前端几乎无测试（2.5%），重构/改动风险极高
- 后端多个重要模块（认证、资源池、K8s、多租户）零测试
- 大文件泛滥，代码可维护性下降
- 异常处理不规范，生产排障困难
- 定时任务无分布式锁，多实例部署风险
