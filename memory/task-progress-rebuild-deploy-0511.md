# 重建部署任务报告 - 2026-05-11

## 任务背景
E2E 回归测试发现冒烟测试版本一致性失败：容器内版本 `e46b90ed`，git HEAD 是 `d63a9b2e`（注：任务描述中说 HEAD 是 66c57d5e，实际 pull 后 HEAD 是 `d63a9b2e`）。

## 执行时间
- 开始: 2026-05-11 11:30 CST
- 完成: 2026-05-11 12:02 CST
- 总耗时: ~32 分钟

## 执行步骤及结果

### 1. Git 更新
- `git pull origin main` → Already up to date
- Git HEAD: `d63a9b2e` (docs: design document for eval params configuration (US-1.4))
- 有本地 stash 已保存

### 2. 根因发现
- `.env` 文件中 `GIT_COMMIT=e46b90ed` 是旧值（2026-05-01 的 build）
- Docker Compose 通过 `${GIT_COMMIT:-unknown}` 环境变量注入版本
- 即使 rebuild 了后端 image，如果不更新 `.env`，版本信息仍然是旧的

### 3. 修复
- 更新 `.env`: `GIT_COMMIT=d63a9b2e`, `APP_VERSION=d63a9b2e`, `BUILD_TIME=2026-05-11T03:40:30Z`

### 4. 后端重建 ✅
- `docker compose build --no-cache backend` → BUILD SUCCESS (6m23s Maven + 24s package)
- `docker compose up -d backend` → Container recreated and started
- Health check: `{"status":"UP"}` (DB: UP, Redis: UP)
- Version: `{"version":"d63a9b2e","gitCommit":"d63a9b2e","buildTime":"2026-05-11T03:40:30Z"}`

### 5. 前端重建 ✅
- `docker compose build --no-cache frontend` → Compiled successfully
- npm ci: 1472 packages installed
- React build: 70 JS chunks generated
- `docker compose up -d frontend` → Container recreated and started
- HTTP status: **200**
- JS bundle check: **1** (有 static/js 引用，非白屏)

### 6. 冒烟验证 ✅
- **登录**: `POST /api/auth/login` → 返回 token ✅
- **芯片列表**: `GET /api/chips` with Bearer token → 返回 30 条数据 ✅ (包括 CHIP-BASELINE-L40S 等)

## 容器状态
| Container | Status |
|-----------|--------|
| ahvp-postgres | Running (Healthy) |
| ahvp-redis | Running (Healthy) |
| ahvp-minio | Running (Healthy) |
| ahvp-backend | Running (Recreated) |
| ahvp-frontend | Running (Recreated) |

## 版本对齐
- Git HEAD: `d63a9b2e`
- Backend /api/version: `d63a9b2e` ✅
- Frontend version.json: `d63a9b2e` (通过 gen-version.sh 从 .env 读取)

## 结论
✅ **部署成功** - 前后端容器已重建并部署到最新代码 `d63a9b2e`，所有冒烟测试通过。
