# E2E 全量回归测试报告 — 2026-05-11

**执行时间:** 2026-05-11 06:31 CST  
**执行环境:** 39.97.251.94 (开发机)  
**后端版本:** e46b90ed (部署中) / 66c57d5e (git HEAD)  
**测试账号:** test@ahvp.com  

---

## 📊 总结

| 测试集 | 通过 | 失败 | 总数 | 通过率 |
|--------|------|------|------|--------|
| **run-all-tests.sh (BDD E2E)** | 68 | 0 | 68 | ✅ 100% |
| **smoke-test.sh (部署冒烟)** | 7 | 1 | 8 | ⚠️ 87.5% |
| **合计** | **75** | **1** | **76** | **98.7%** |

---

## ✅ BDD E2E 测试详情 (68/68 全部通过)

### Issue #152: 芯片 CRUD + 列表 — 19/19 ✅
- 芯片创建（含 chipNo 格式验证、技术规格、字段校验、枚举值）：6/6
- 芯片查询（列表、详情、名称搜索、状态筛选、类型筛选）：5/5
- 芯片更新与删除（基本信息、技术规格、删除）：3/3
- UI 检查（列表页、搜索、筛选、注册按钮、表单）：5/5

### Issue #153: 评测计划向导 + 任务拆分 — 18/18 ✅
- 评测计划创建（关联芯片、校验、列表、筛选、详情）：6/6
- 预设方案（QUICK=9, STANDARD=17, FULL=62，严格递增）：4/4
- 任务拆分（自动生成、字段完整性、维度分类、芯片关联、核心算子）：5/5
- UI 检查（列表页、向导选芯片、预设选择）：3/3

### Issue #154: 执行监控 + 报告生成 + 评分 — 14/14 ✅
- 任务执行状态流转（完整流转 DRAFT→RUNNING→COMPLETED）：✅
- 芯片状态联动（EVALUATING，已知 bug：完成后未自动变为 EVALUATED）
- 任务结果数据（9/9 completed）
- 执行监控（progress=100, dimension 分组 OPERATOR:5 MODEL:4）
- 报告生成（id=265, overallScore=60.0, 8 维度评分, 瓶颈分析, PUBLISHED 状态）
- 完整 E2E 链路：创建芯片→评测→生成报告 ✅

### Issue #155: Dashboard + 导航结构 — 17/17 ✅
- Dashboard API（芯片统计、状态分类、计划统计、健康检查）：4/4
- Dashboard UI（页面加载、统计卡片、快速操作按钮）：3/3
- 导航结构（Dashboard/芯片管理/评测计划/节点管理/系统设置，4+1 结构 5/5）：10/10

---

## ⚠️ 冒烟测试详情 (7/8)

### 通过的测试:
1. ✅ Homepage returns 200 with .js references
2. ✅ JS bundle downloadable and > 500KB (996KB)
3. ✅ Login API returns code=0
4. ✅ All containers running (frontend/backend/postgres/redis/minio)
5. ✅ Browser render check (full — 包含登录验证，5/5 子项全通过)
6. ✅ Business APIs return data (Chips=37, Templates=15)
7. ✅ All frontend routes return 200 (/, /chips, /plans, /templates, /reports, /nodes)

### 失败的测试:
8. ❌ **Version consistency** — 部署版本 `e46b90ed` vs git HEAD `66c57d5e`
   - **原因分类:** 部署间隔问题（非 bug）
   - **说明:** 近期有新 commit 推送但未重新构建部署容器。需要 `docker-compose build && docker-compose up -d` 更新
   - **严重程度:** 低 — 只是说明部署版本落后于代码，不是功能 bug

---

## 🐛 已知问题记录

### 已知 bug（非新发现）
1. **芯片状态联动不完整** — 评测计划 COMPLETED 后，芯片状态停留在 `EVALUATING` 而非自动变为 `EVALUATED`。测试脚本标记为 `[KNOWN-BUG]` 并给 PASS（因为是已知限制）

### 需要关注
1. **部署版本落后** — 部署的后端 (e46b90ed) 比 git HEAD (66c57d5e) 旧，如果新提交包含重要修复，应重新部署

---

## 🔍 操作记录

- `git pull origin main` — 拉取最新代码（Already up to date）
- 未修改任何代码
- 未重启任何服务
- 所有测试数据由测试脚本自动创建和清理

---

## 结论

**系统整体健康状态：✅ 良好**

76 项测试中 75 项通过（98.7%），唯一失败项是部署版本一致性检查（非功能 bug）。核心业务流程（芯片 CRUD、评测计划、任务执行、报告生成、Dashboard）全部正常工作。
