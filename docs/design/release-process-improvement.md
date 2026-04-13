# AHVP 发布流程复盘与改进方案

> 文档版本：v2.0 | 作者：菜菜子 | 日期：2026-04-13  
> v2.0 变更：采纳麦克雷 review 建议（#429）— 缓存策略/镜像 tag/回滚改进/部署锁/smoke 增强

## 1. 事故时间线

### 事故 1：白屏事故（04-03 凌晨）

**现象：** 用户访问页面白屏，持续 3+ 小时  
**根因：** 前端代码改了但只做了 `npm run build`，没有重建 Docker 容器。nginx 容器内仍是旧 JS 文件  
**关键失误：** 部署后没有验证页面能正常渲染

### 事故 2：Docker 缓存导致 JAR 不包含新 class（04-07，两次）

**现象：** 后端启动报 Bean 冲突 / API 500  
**根因：** `COPY target/*.jar app.jar` 命中 Docker 缓存，旧 JAR 被使用  
**关键失误：** 同一天犯了两次同样的错误

### 事故 3：Docker Compose 重建覆盖容器内修改（04-11）

**现象：** kubectl 变成 0 字节  
**根因：** `docker cp` 手动拷贝被 Dockerfile 中的 `COPY kubectl`（空文件）覆盖

### 事故 4：并行 Sub-agent 互相覆盖代码（04-11）

**现象：** 4 个 sub-agent 并行修 bug，后 build 的覆盖前面的改动  
**根因：** 无部署锁，最后一个执行 build 的 agent 的代码覆盖了之前的

### 事故 5：前端构建成功但旧 JS 缓存（多次）

**根因：** 浏览器缓存旧 index.html（已通过 nginx `Cache-Control: no-cache` 修复）

### 事故 6：deploy workflow 路径错误（04-03）

**根因：** deploy.yml 中 `cd /opt/ai-hardware-verification-platform` 路径不存在

---

## 2. 根因分析

### 2.1 当前发布流程

```
手动修改代码 → git commit → git push
                               ↓
                        CI: E2E 测试
                               ↓
                  Deploy workflow（CI 通过后触发）
                    ├── 前端: npm build → docker cp → nginx reload
                    └── 后端: 检查文件变更 → docker compose up --build
```

### 2.2 致命缺陷

| # | 缺陷 | 后果 |
|---|------|------|
| 1 | 前端用 `docker cp` 而非重建镜像 | compose up 会用旧镜像覆盖 |
| 2 | 后端 Dockerfile 依赖预构建 JAR | 忘了 mvn package 就是旧代码 |
| 3 | 没有构建产物版本标记 | 出问题不知道跑的哪个 commit |
| 4 | 前后端独立部署不原子 | 接口不匹配 |
| 5 | 没有部署锁 | 多 agent/人同时 build 互相覆盖 |

### 2.3 核心矛盾

```
当前：代码构建 和 Docker 构建 是分离的
应该：Docker 构建 = 代码构建（构建封装在 Dockerfile 内）
```

前端 Dockerfile 已做到多阶段构建，后端没有。

---

## 3. 改进方案

### 3.1 后端 Dockerfile 改为多阶段构建

```dockerfile
# backend/Dockerfile — 新版
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /build
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src/ src/
RUN mvn clean package -DskipTests -B

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT

# kubectl（从官方下载，不依赖本地文件）
ARG KUBECTL_VERSION=v1.28.0
RUN apk add --no-cache curl && \
    curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && mv kubectl /usr/local/bin/ && \
    apk del curl

COPY --from=builder /build/target/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

**层缓存策略（采纳麦克雷建议 1）：**
- 日常部署用 `docker compose build`（利用缓存），`COPY src/` 变化会触发重编译，不会用旧代码
- 仅在怀疑缓存问题时才加 `--no-cache`
- 后端构建从 5-10 分钟降到 1-2 分钟

### 3.2 统一 `docker compose build`，禁止 `docker cp`

**铁律：禁止使用 `docker cp` 部署代码。一切通过镜像构建。**

### 3.3 镜像 tag 策略（采纳麦克雷建议 2）

```bash
export VER=$(git rev-parse --short HEAD)

# 构建 + tag
docker compose build
docker tag ahvp-backend:latest ahvp-backend:$VER
docker tag ahvp-frontend:latest ahvp-frontend:$VER

# 部署
docker compose up -d backend frontend
```

**优势：** 回滚只需切 tag，秒级完成，不用重新构建。

### 3.4 回滚方案改进（采纳麦克雷建议 3）

```bash
# 回滚：秒级切换到上一个版本
docker tag ahvp-backend:$PREV_VER ahvp-backend:latest
docker tag ahvp-frontend:$PREV_VER ahvp-frontend:latest
docker compose up -d backend frontend

# 飞书通知
curl -X POST "$FEISHU_WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "{\"msg_type\":\"text\",\"content\":{\"text\":\"⚠️ 部署失败，已回滚到 $PREV_VER\"}}"
```

取代旧方案的 `git checkout HEAD~1` + 重新构建（慢且可能也失败）。

### 3.5 部署锁（采纳麦克雷建议 4）

```bash
LOCKFILE=/tmp/ahvp-deploy.lock

if [ -f "$LOCKFILE" ]; then
  LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$LOCKFILE") ))
  if [ "$LOCK_AGE" -gt 1800 ]; then
    echo "⚠️ Stale lock (${LOCK_AGE}s), removing..."
    rm -f "$LOCKFILE"
  else
    echo "Another deploy in progress (${LOCK_AGE}s ago), waiting..."
    for i in $(seq 1 60); do
      [ ! -f "$LOCKFILE" ] && break
      sleep 5
    done
    [ -f "$LOCKFILE" ] && { echo "❌ Deploy lock timeout"; exit 1; }
  fi
fi

echo "$(whoami)@$(date +%s)" > "$LOCKFILE"
trap "rm -f $LOCKFILE" EXIT

# ... build & deploy ...
```

防止多个 agent/人同时触发部署互相覆盖。包含过期锁清理（30 分钟）。

### 3.6 构建产物版本标记

**后端：** `GET /api/health` 返回 commit hash（通过 GIT_COMMIT 环境变量）

**前端：** 构建时生成 `version.json`，页面底部显示版本号

```dockerfile
# 前端 Dockerfile 增加
ARG GIT_COMMIT=unknown
ENV REACT_APP_GIT_COMMIT=$GIT_COMMIT
```

**快速确认：** `docker inspect ahvp-backend | grep GIT_COMMIT`

### 3.7 smoke-test 增强（采纳麦克雷建议 5）

在现有 5 项检查基础上补充业务断言：

```bash
# Test 6: 关键 API 返回非空数据
echo "[6/8] Checking business APIs..."
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ahvp.com","password":"Test1234"}' | jq -r '.data.token')

CHIPS=$(curl -s http://localhost:8080/api/chips -H "Authorization: Bearer $TOKEN" | jq '.data.total // 0')
TEMPLATES=$(curl -s http://localhost:8080/api/templates -H "Authorization: Bearer $TOKEN" | jq '.data.total // 0')
echo "  Chips: $CHIPS, Templates: $TEMPLATES"
[ "$CHIPS" -gt 0 ] && [ "$TEMPLATES" -gt 0 ] && check "Business APIs return data" 0 || check "Business APIs return data" 1

# Test 7: 前端路由可访问（nginx try_files 生效）
echo "[7/8] Checking frontend routes..."
for route in / /chips /plans /templates /reports /nodes; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost${route}")
  if [ "$HTTP" != "200" ]; then
    check "Frontend route ${route} returns 200" 1
    break
  fi
done
check "All frontend routes return 200" 0

# Test 8: 版本一致性
echo "[8/8] Checking version consistency..."
EXPECTED=$(git rev-parse --short HEAD)
BACKEND_VER=$(docker inspect ahvp-backend --format='{{range .Config.Env}}{{println .}}{{end}}' | grep GIT_COMMIT | cut -d= -f2 | head -c8)
echo "  Expected: $EXPECTED, Backend: $BACKEND_VER"
[ "$BACKEND_VER" = "$EXPECTED" ] && check "Version consistency" 0 || check "Version consistency (expected $EXPECTED, got $BACKEND_VER)" 1
```

### 3.8 deploy.yml 改进

```yaml
name: Deploy

on:
  workflow_run:
    workflows: ["CI Pipeline"]
    types: [completed]
    branches: [main]

jobs:
  deploy:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: self-hosted
    timeout-minutes: 20
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Acquire deploy lock
        run: |
          LOCKFILE=/tmp/ahvp-deploy.lock
          if [ -f "$LOCKFILE" ]; then
            LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$LOCKFILE") ))
            if [ "$LOCK_AGE" -gt 1800 ]; then
              rm -f "$LOCKFILE"
            else
              echo "Deploy in progress, waiting..."
              for i in $(seq 1 60); do [ ! -f "$LOCKFILE" ] && break; sleep 5; done
              [ -f "$LOCKFILE" ] && { echo "Lock timeout"; exit 1; }
            fi
          fi
          echo "$$@$(date +%s)" > "$LOCKFILE"

      - name: Build, Tag & Deploy
        env:
          GIT_COMMIT: ${{ github.sha }}
        run: |
          cd /root/ai-hardware-verification-platform
          git pull origin main
          
          VER=$(echo "$GIT_COMMIT" | head -c8)
          PREV_VER=$(docker inspect ahvp-backend --format='{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep GIT_COMMIT | cut -d= -f2 | head -c8 || echo "none")
          echo "PREV_VER=$PREV_VER" >> $GITHUB_ENV
          echo "VER=$VER" >> $GITHUB_ENV
          
          docker compose build backend frontend
          docker tag ahvp-backend:latest ahvp-backend:$VER
          docker tag ahvp-frontend:latest ahvp-frontend:$VER
          docker compose up -d backend frontend

      - name: Smoke test
        run: |
          sleep 15
          cd /root/ai-hardware-verification-platform
          bash deploy/smoke-test.sh

      - name: Rollback on failure
        if: failure()
        run: |
          if [ -n "$PREV_VER" ] && [ "$PREV_VER" != "none" ]; then
            docker tag ahvp-backend:$PREV_VER ahvp-backend:latest
            docker tag ahvp-frontend:$PREV_VER ahvp-frontend:latest
            docker compose -f /root/ai-hardware-verification-platform/docker-compose.yml up -d backend frontend
            echo "Rolled back to $PREV_VER"
          fi

      - name: Release deploy lock
        if: always()
        run: rm -f /tmp/ahvp-deploy.lock
```

---

## 4. 实施清单

| # | 改进项 | 来源 | 预计 |
|---|--------|------|------|
| 1 | 后端 Dockerfile 多阶段构建 | 菜菜方案 | 1h |
| 2 | 禁止 docker cp，统一 compose build | 菜菜方案 | 0.5h |
| 3 | 日常构建利用缓存，去掉默认 --no-cache | 麦克雷建议 1 | - |
| 4 | 镜像 tag 策略（commit hash） | 麦克雷建议 2 | 0.5h |
| 5 | GIT_COMMIT 环境变量注入（前端+后端） | 菜菜方案 | 0.5h |
| 6 | 回滚改用镜像 tag + 飞书通知 | 麦克雷建议 3 | 0.5h |
| 7 | 部署锁（防并行覆盖） | 麦克雷建议 4 | 0.5h |
| 8 | deploy.yml 路径修复 + 整合改进 | 菜菜方案 | 1h |
| 9 | smoke-test 补充业务断言 | 麦克雷建议 5 | 0.5h |
| 10 | post-deploy-check.sh | 菜菜方案 | 0.5h |

**总计：约 5h**

---

## 5. 发布铁律（团队公约）

1. **构建封装在 Dockerfile 内** — 不依赖宿主机环境，`docker compose build` 即完整构建
2. **禁止 `docker cp` 部署代码** — 一切通过镜像构建，保证可重复性
3. **日常构建利用缓存** — 多阶段构建的 `COPY src/` 保证代码最新；仅在怀疑缓存问题时加 `--no-cache`
4. **每次构建打 tag** — `docker tag ahvp-backend:latest ahvp-backend:$(git rev-parse --short HEAD)`
5. **版本必须可查** — 前端 version.json + 后端 /api/health 返回 commit hash
6. **部署前获取锁** — `/tmp/ahvp-deploy.lock`，防止并行覆盖
7. **部署后必须验证** — smoke test 通过才算成功，失败自动回滚到上一个 tag
8. **前后端同步部署** — 有接口变更时前后端必须一起部署
9. **不改运行中的容器** — 不 exec 改文件，不 docker cp，需要改就改 Dockerfile 重建
