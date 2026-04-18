# 开发准则（强制执行，无例外）

## 1. TDD 流程（每个功能/修复必须遵循）

```
红 → 绿 → 重构
```

1. **写测试** — 描述期望行为，跑一次确认失败（红）
2. **写实现** — 最小代码让测试通过
3. **跑测试** — 确认绿色
4. **跑回归** — 确认没搞坏别的
5. **重构** — 清理代码，测试仍绿

### 测试类型
- **API 修复/新功能** → 先写 API 集成测试（backend-tests/run-tests.sh 或独立脚本）
- **前端功能** → 先写 Playwright E2E 测试（e2e-tests/tests/features/）
- **Bug 修复** → 先写能复现 bug 的测试，确认红色，再修代码

### 不算测试的
- ❌ curl 返回 200
- ❌ "手动看了一下没问题"
- ❌ docker logs 没报错

### 算测试的
- ✅ Playwright spec 文件，有 expect 断言
- ✅ API test 脚本，有 assert_status / assert_json
- ✅ 可重复运行，CI 中自动执行

## 2. CI/CD 发布准则

### Push 前
- [ ] 本地编译通过（`mvn compile` / `npm run build`）
- [ ] 新功能有对应测试
- [ ] ESLint 零 warning（`npx eslint src/ --max-warnings=0`）

### CI 必须绿色
- Push 后 CI 自动跑 E2E + API 测试
- **CI 红 = 停止推新功能，先修 CI**
- CI 绿了才自动触发 deploy

### 部署后
- Smoke test 自动跑（8 项检查）
- `/api/version` 验证版本一致性
- 失败自动回滚

### 版本追溯
- 每次构建注入 GIT_COMMIT / APP_VERSION / BUILD_TIME
- 禁止裸 `docker compose up --build`，必须用 `deploy/manual-deploy.sh` 或 CI
- 运行时通过 `/api/version` 可查当前版本

## 3. Sub-agent Task Prompt 模板

每个开发类 sub-agent 的 task 必须包含以下结构：

```
## TDD 流程（必须按顺序执行）

### Step 1: 写测试
- 在 [测试文件路径] 中添加测试用例
- 测试应描述期望行为：[具体描述]
- 跑一次确认失败（红色）

### Step 2: 写实现
- 修改 [代码文件路径]
- [具体改动描述]

### Step 3: 验证
- 跑测试确认绿色
- 跑回归：[回归命令]
- ESLint 检查（前端）

### Step 4: 提交
- 测试 + 实现在同一个 commit
- commit message 包含 issue 编号
```

## 4. 质量红线

- **无测试 = 不算完成** — 没有对应测试的修复不算修复
- **CI 红 = 最高优先级** — 高于新功能开发
- **不造假** — 功能没跑通就说没跑通
- **不并行改同一模块** — 串行执行防覆盖
