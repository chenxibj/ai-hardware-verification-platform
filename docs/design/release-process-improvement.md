# AHVP 发布流程复盘与改进方案

> 文档版本：v1.0 | 作者：菜菜子 | 日期：2026-04-13

## 1. 事故时间线

### 事故 1：白屏事故（04-03 凌晨）

**现象：** 用户访问页面白屏，持续 3+ 小时  
**根因：** 前端代码改了但只做了 `npm run build`，没有重建 Docker 容器。nginx 容器内仍是旧 JS 文件，浏览器加载新 index.html 引用的 JS hash 不存在  
**关键失误：**
- 部署后没有验证页面能正常渲染
- 凌晨操作遗漏验证步骤
- 没有自动化部署流程

### 事故 2：Docker 缓存导致 JAR 不包含新 class（04-07，两次）

**现象（09:06）：** 后端启动报 Bean 冲突（两个同名 Controller）  
**现象（21:00）：** API 返回 500，新增的 Service class 不存在  
**根因：** `docker compose up -d --build` 使用了 Docker build 缓存，`COPY target/*.jar app.jar` 步骤命中缓存，打进容器的还是旧 JAR  
**关键失误：**
- 没有在构建命令加 `--no-cache`
- 同一天犯了两次同样的错误
- 没有构建产物校验机制

### 事故 3：Docker Compose 重建覆盖容器内修改（04-11）

**现象：** `docker compose up -d` 重建 backend 后，kubectl 变成 0 字节  
**根因：** 之前通过 `docker cp` 手动拷贝了正常的 kubectl 进容器。Dockerfile 中 `COPY kubectl /usr/local/bin/kubectl` 拷贝的是源码目录下的空文件（0字节），重建时覆盖了手动修复  
**关键失误：**
- 关键 binary 依赖 `docker cp`，不在 Dockerfile 中正式解决
- 源码目录的 kubectl 是空文件没有人注意

### 事故 4：并行 Sub-agent 互相覆盖代码（04-11）

**现象：** 4 个 sub-agent 并行修 bug，后 build 的覆盖前面的改动  
**根因：** 多个 agent 同时改同一代码库的不同文件，但 `docker compose up --build` 是全量构建，最后一个执行 build 的 agent 的代码覆盖了之前的  
**关键失误：**
- 没有代码合并/锁机制
- 并行开发模式下缺少协调

### 事故 5：前端构建成功但旧 JS 缓存（多次）

**现象：** 部署后用户看到的仍是旧页面  
**根因：** 
1. 浏览器缓存了旧的 index.html（已通过 nginx `Cache-Control: no-cache` 修复）
2. CDN/代理缓存（无 CDN，不适用）
3. Service Worker 缓存（CRA 默认无 SW，不适用）

### 事故 6：后端 deploy workflow 路径错误（04-03）

**现象：** CI deploy 步骤中 `cd /opt/ai-hardware-verification-platform` 目录不存在  
**根因：** deploy.yml 写的路径和实际部署路径不一致。self-hosted runner 的工作目录是 `/root/ai-hardware-verification-platform`

---

## 2. 根因分析：为什么组件总是不更新？

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

### 2.2 五个致命缺陷

| # | 缺陷 | 为什么导致组件不更新 |
|---|------|---------------------|
| 1 | **前端部署用 `docker cp` 而非重建镜像** | 只复制了 build 产物到运行中的容器，但 Docker image 没更新。下次 `docker compose up -d` 会用旧镜像重建，丢失所有 cp 进去的文件 |
| 2 | **后端构建无 `--no-cache`** | Docker 的层缓存机制会跳过 `COPY target/*.jar` 步骤（如果 context 的 checksum 没变），导致旧 JAR 被使用 |
| 3 | **后端 Dockerfile 依赖预构建 JAR** | Dockerfile 只做 `COPY target/*.jar`，不自己构建。如果忘记先 `mvn package`，或者 maven 构建出了旧版本，JAR 就是旧的 |
| 4 | **没有构建产物版本标记** | 无法快速判断容器内运行的代码版本。出问题时不知道是哪个 commit 的产物 |
| 5 | **deploy.yml 前后端独立判断，无原子性** | 前后端分别部署，如果前端部署了新接口调用但后端没重建（或反过来），会出接口不匹配 |

### 2.3 核心矛盾

```
当前：代码构建 和 Docker 构建 是分离的
      mvn package → 产出 JAR → docker build COPY JAR
      npm build → 产出 build/ → docker cp build/

应该：Docker 构建 = 代码构建（构建封装在 Dockerfile 内）
      docker build → 内部执行 mvn package → 产出镜像
      docker build → 内部执行 npm build → 产出镜像
```

前端 Dockerfile 已经做到了（多阶段构建：`npm ci` + `npm run build`），但**后端 Dockerfile 没有**——它只是 `COPY target/*.jar`，依赖外部预构建。

---

## 3. 改进方案

### 3.1 后端 Dockerfile 改为多阶段构建

```dockerfile
# backend/Dockerfile — 新版
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /build
COPY pom.xml .
# 先下载依赖（利用 Docker 层缓存加速）
RUN mvn dependency:go-offline -B
COPY src/ src/
RUN mvn clean package -DskipTests -B

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# kubectl（从官方下载，不依赖本地文件）
RUN apk add --no-cache curl && \
    curl -LO "https://dl.k8s.io/release/$(curl -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && mv kubectl /usr/local/bin/ && \
    apk del curl

COPY --from=builder /build/target/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

**优势：**
- 构建完全封装在 Docker 内，不依赖宿主机的 mvn/java 环境
- `COPY pom.xml` + `dependency:go-offline` 层缓存：只有 pom.xml 变化才重新下载依赖
- `COPY src/` 变化才重新编译，但一定会用最新源码
- kubectl 从官方下载，不依赖本地空文件

### 3.2 统一使用 `docker compose up --build`，禁止 `docker cp`

```yaml
# docker-compose.yml 增加 build 参数
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
      args:
        - BUILDKIT_INLINE_CACHE=1
    # ...
  
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        - BUILDKIT_INLINE_CACHE=1
    # ...
```

**部署命令统一为：**
```bash
# 每次部署
docker compose build --no-cache backend frontend
docker compose up -d backend frontend
```

**铁律：禁止使用 `docker cp` 部署代码。一切通过镜像构建。**

### 3.3 构建产物版本标记

在构建时注入 git commit hash，运行时可查询：

```dockerfile
# 前端 Dockerfile 增加
ARG GIT_COMMIT=unknown
ENV REACT_APP_GIT_COMMIT=$GIT_COMMIT

# 后端 Dockerfile 增加
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT
```

```yaml
# docker-compose.yml
services:
  backend:
    build:
      args:
        GIT_COMMIT: ${GIT_COMMIT:-unknown}
  frontend:
    build:
      args:
        GIT_COMMIT: ${GIT_COMMIT:-unknown}
```

```bash
# 部署脚本
export GIT_COMMIT=$(git rev-parse --short HEAD)
docker compose build backend frontend
docker compose up -d backend frontend
```

**验证方式：**
- 前端：页面底部或 console 显示 commit hash
- 后端：`GET /api/health` 返回 `{ "version": "abc1234" }`
- 快速确认：`docker inspect ahvp-backend | grep GIT_COMMIT`

### 3.4 deploy.yml 改进

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
          fetch-depth: 2  # 用于检测变更

      - name: Detect changes
        id: changes
        run: |
          echo "frontend=$(git diff HEAD~1 --name-only -- frontend/ | wc -l)" >> $GITHUB_OUTPUT
          echo "backend=$(git diff HEAD~1 --name-only -- backend/ | wc -l)" >> $GITHUB_OUTPUT

      - name: Build & Deploy
        env:
          GIT_COMMIT: ${{ github.sha }}
        run: |
          cd /root/ai-hardware-verification-platform
          git pull origin main
          
          SERVICES=""
          if [ "${{ steps.changes.outputs.frontend }}" -gt 0 ]; then
            SERVICES="$SERVICES frontend"
          fi
          if [ "${{ steps.changes.outputs.backend }}" -gt 0 ]; then
            SERVICES="$SERVICES backend"
          fi
          
          if [ -n "$SERVICES" ]; then
            echo "Building: $SERVICES"
            docker compose build --no-cache $SERVICES
            docker compose up -d $SERVICES
          else
            echo "No frontend/backend changes, skip deploy"
          fi

      - name: Version verification
        run: |
          echo "=== Container versions ==="
          docker inspect ahvp-frontend --format='Frontend: {{range .Config.Env}}{{println .}}{{end}}' | grep GIT || true
          docker inspect ahvp-backend --format='Backend: {{range .Config.Env}}{{println .}}{{end}}' | grep GIT || true
          
          echo "=== Expected: ${{ github.sha }} ==="

      - name: Smoke test
        run: |
          sleep 10
          bash deploy/smoke-test.sh

      - name: Rollback on failure
        if: failure()
        run: |
          echo "❌ Deploy failed, rebuilding from previous commit..."
          cd /root/ai-hardware-verification-platform
          git checkout HEAD~1
          docker compose build --no-cache frontend backend
          docker compose up -d frontend backend
          git checkout main
```

### 3.5 发布检查清单（人工/自动化）

每次发布后，自动执行以下验证：

```bash
#!/bin/bash
# deploy/post-deploy-check.sh

echo "=== 1. 版本一致性 ==="
EXPECTED=$(git rev-parse --short HEAD)
FRONTEND_VER=$(curl -s http://localhost/version.json | jq -r '.commit' 2>/dev/null)
BACKEND_VER=$(curl -s http://localhost:8080/api/health | jq -r '.version' 2>/dev/null)
echo "Expected: $EXPECTED"
echo "Frontend: $FRONTEND_VER"
echo "Backend:  $BACKEND_VER"
[ "$FRONTEND_VER" = "$EXPECTED" ] && echo "✅ Frontend version match" || echo "❌ Frontend version MISMATCH"
[ "$BACKEND_VER" = "$EXPECTED" ] && echo "✅ Backend version match" || echo "❌ Backend version MISMATCH"

echo ""
echo "=== 2. 页面渲染 ==="
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/)
JS_REF=$(curl -s http://localhost/ | grep -c '\.js')
echo "HTTP: $HTTP (expect 200)"
echo "JS refs: $JS_REF (expect > 0)"

echo ""
echo "=== 3. API 健康 ==="
HEALTH=$(curl -s http://localhost:8080/api/health | jq -r '.status' 2>/dev/null)
echo "Health: $HEALTH (expect UP)"

echo ""
echo "=== 4. 关键接口 ==="
LOGIN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ahvp.com","password":"Test1234"}' | jq -r '.code' 2>/dev/null)
echo "Login: code=$LOGIN (expect 0)"

echo ""
echo "=== 5. 容器状态 ==="
for c in ahvp-frontend ahvp-backend ahvp-postgres ahvp-redis ahvp-minio; do
  STATUS=$(docker inspect -f '{{.State.Status}}' $c 2>/dev/null)
  STARTED=$(docker inspect -f '{{.State.StartedAt}}' $c 2>/dev/null | cut -d. -f1)
  echo "  $c: $STATUS (started: $STARTED)"
done
```

---

## 4. 改进优先级

| 优先级 | 改进项 | 解决的问题 | 预计工作量 |
|--------|--------|-----------|-----------|
| P0 | 后端 Dockerfile 多阶段构建 | JAR 不更新 / kubectl 空文件 | 1h |
| P0 | 禁止 docker cp，统一 compose build | 容器内文件被覆盖 | 0.5h |
| P1 | 构建产物版本标记 | 无法确认运行版本 | 1h |
| P1 | deploy.yml 改进 | 部署不原子 / 路径错误 | 1h |
| P2 | post-deploy-check.sh | 部署后无验证 | 0.5h |
| P2 | smoke-test.sh 中登录密码更新 | smoke test 报假红 | 0.1h |

**总计：约 4h**

---

## 5. 发布铁律（团队公约）

1. **构建封装在 Dockerfile 内** — 不依赖宿主机环境，`docker compose build` 即完整构建
2. **禁止 `docker cp` 部署代码** — 一切通过镜像构建，保证可重复性
3. **每次部署加 `--no-cache`** — `docker compose build --no-cache` 避免缓存陷阱
4. **版本必须可查** — 前端 version.json + 后端 /api/health 返回 commit hash
5. **部署后必须验证** — smoke test 通过才算部署成功，失败自动回滚
6. **前后端同步部署** — 有接口变更时前后端必须一起部署，不能只部署一侧
7. **不改运行中的容器** — 不 exec 进容器改文件，不 docker cp，需要改就改 Dockerfile 重建
