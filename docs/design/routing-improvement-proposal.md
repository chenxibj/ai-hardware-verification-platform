# AHVP 前端路由架构改进方案

> 文档版本：v1.0 | 作者：菜菜子 | 日期：2026-04-13

## 1. 问题复盘

### 1.1 历史路由问题汇总

| 时间 | Issue | 问题 | 根因 |
|------|-------|------|------|
| 04-01 | — | 登录后白屏 | 缺少 `<BrowserRouter>` 包裹 |
| 04-02 | — | 新增页面后路由映射遗漏 | 手动维护多处映射表 |
| 04-04 | #171 | 分享链接只支持 query param | 没有真正的 URL 路由 |
| 04-12 | #411 | 直接访问 URL 始终显示 Dashboard | currentPage state 不读 URL |
| 04-13 | #411 fix | 补丁式 pushState 同步 | 治标不治本 |

### 1.2 根因分析

**核心问题：项目已安装 `react-router-dom@6`，`index.js` 也包了 `<BrowserRouter>`，但实际路由完全没用 React Router，而是用 `useState("currentPage")` 手动切页。**

这导致了一个"影子路由系统"：

```
实际架构：
  index.js:  <BrowserRouter>          ← 装了但没用
  App.js:    useState(currentPage)    ← 真正的页面切换
  App.js:    手动 pushState/popstate  ← 补丁式 URL 同步
  MainLayout: onClick → setCurrentPage ← 命令式导航
  AppRoutes:  if/else 条件渲染        ← 不是 <Route>
  PlanCreate: useNavigate()           ← 唯一用了 React Router 的页面，和其他页面不兼容
```

### 1.3 当前架构痛点

| 痛点 | 影响 |
|------|------|
| **7 处需同步维护的映射表** | 加一个页面要改 7 个文件，极易遗漏 |
| **手动 pushState** | 浏览器前进/后退行为不可靠，子页面状态丢失 |
| **子页面无 URL** | 芯片档案、计划监控、报告详情等页面没有独立 URL，不可分享 |
| **条件渲染优先级冲突** | `AppRoutes.js` 用 if/else 链，顺序错了就渲染错页面 |
| **导航状态分散** | 7 个 useState 管不同子页面的 ID，互相重置逻辑复杂 |
| **与 React Router 冲突** | PlanCreate 用了 `useNavigate()`，但 navigate("/plans") 实际无效（没有 `<Route path="/plans">`） |

### 1.4 七处映射表一览

每新增一个页面，需要同步修改以下所有位置：

1. `App.js` → `PATH_TO_PAGE` 对象
2. `routes/AppRoutes.js` → `PAGE_COMPONENTS` 对象 + if/else 条件链
3. `layouts/MainLayout.js` → `PAGE_TITLES` 对象
4. `layouts/MainLayout.js` → `BREADCRUMB_MAP` 对象
5. `layouts/MainLayout.js` → `PARENT_MAP` 对象
6. `layouts/MainLayout.js` → `menuItems` 菜单配置
7. `nginx.conf` → SPA fallback（已有 `try_files`，一般不用改，但要意识到存在）

---

## 2. 改进方案

### 2.1 设计目标

1. **URL 即状态** — 任何页面都有唯一 URL，可分享、可刷新、可前进后退
2. **单一配置源** — 路由/菜单/面包屑/标题从一份配置生成，不重复
3. **子页面可寻址** — `/chips/42`、`/plans/666/monitor`、`/reports/77` 都可直接访问
4. **渐进式迁移** — 不一次性重写，分 3 个阶段逐步替换
5. **零回退风险** — 每个阶段完成后都是可工作状态

### 2.2 目标路由结构

```
/                           → Dashboard
/chips                      → 芯片列表
/chips/:id                  → 芯片档案 (原 chipProfileId)
/chips/compare?ids=1,2,3    → 芯片对比

/plans                      → 评测任务列表
/plans/create               → 创建评测任务
/plans/:id                  → 计划监控 (原 planMonitorId)

/templates                  → 评测模板

/reports                    → 报告列表
/reports/:id                → 报告详情 (原 chipReportId)
/reports/compare?ids=1,2    → 报告对比

/tasks/:id                  → 任务结果 (原 taskResultId)

/nodes                      → 节点列表
/nodes/:id                  → 节点详情 (原 nodeDetailId)

/resource-pools             → 资源池
/resource-monitor           → 资源监控
/alerts                     → 告警管理

/assets                     → 数字资产
/assets/validation          → 资产校验
/assets/recycle-bin         → 回收站
/assets/backup              → 备份
/assets/storage             → 存储监控

/leaderboard                → 评测榜单
/community                  → 社区首页
/community/resources        → 资源下载
/community/forum            → 论坛
/community/demands          → 需求对接

/admin/users                → 用户管理
/admin/tenants              → 租户管理
/admin/audit                → 审计日志
/admin/scheduler            → 调度配置
/admin/billing              → 计费管理

/settings                   → 用户设置
```

### 2.3 核心数据结构：统一路由配置

```javascript
// src/config/routes.js — 单一真相来源（Single Source of Truth）
export const routeConfig = [
  {
    key: "dashboard",
    path: "/",
    title: "Dashboard",
    icon: DashboardOutlined,
    component: lazy(() => import("../pages/Dashboard")),
    breadcrumb: [{ title: "首页" }],
  },
  {
    key: "eval-center",
    title: "评测中心",
    icon: ExperimentOutlined,
    children: [
      {
        key: "chips",
        path: "/chips",
        title: "芯片管理",
        icon: AppstoreOutlined,
        component: lazy(() => import("../pages/ChipList")),
        breadcrumb: [{ title: "评测中心" }, { title: "芯片管理" }],
        children: [
          {
            key: "chip-profile",
            path: "/chips/:id",
            title: "芯片档案",
            component: lazy(() => import("../pages/ChipProfile")),
            hidden: true, // 不在菜单中显示
          },
        ],
      },
      {
        key: "plans",
        path: "/plans",
        title: "评测任务",
        icon: UnorderedListOutlined,
        component: lazy(() => import("../pages/PlanList")),
        children: [
          { key: "plan-create", path: "/plans/create", component: lazy(() => import("../pages/PlanCreate")), hidden: true },
          { key: "plan-monitor", path: "/plans/:id", component: lazy(() => import("../pages/PlanMonitor")), hidden: true },
        ],
      },
      // ... 其他页面
    ],
  },
  // ... 其他分组
];
```

从这一份配置自动生成：
- `<Route>` 路由树
- Ant Design `<Menu>` items
- `<Breadcrumb>` 导航
- 页面标题 `document.title`
- 权限检查（未来可加 `roles: ["admin"]`）

### 2.4 架构对比

| 维度 | 当前架构 | 新架构 |
|------|----------|--------|
| 路由方式 | `useState` + 手动 `pushState` | React Router `<Routes>` |
| 页面切换 | `setCurrentPage("chips")` | `<Link to="/chips">` / `navigate("/chips")` |
| 子页面 | 7 个独立 useState 存 ID | URL params `/chips/:id` |
| 配置维护 | 7 处映射表 | 1 份 `routeConfig` |
| 代码分割 | 全量加载 | `React.lazy` + `Suspense` |
| 深度链接 | ❌ 不支持（query param 部分支持） | ✅ 完整支持 |
| 浏览器导航 | 手动 popstate（有 bug） | React Router 原生 |
| 新增页面 | 改 7 个文件 | 改 1 个文件 `routes.js` |

---

## 3. 实施计划

### Phase 1：基础设施（预计 2-3h）

**目标：** 建立新路由骨架，旧页面仍工作

1. 创建 `src/config/routes.js` 统一路由配置
2. 创建 `src/routes/RouteRenderer.js` — 从 routeConfig 递归生成 `<Route>` 树
3. 创建 `src/hooks/useRouteConfig.js` — 生成菜单项、面包屑、标题
4. 改造 `App.js`：去掉 7 个 useState，用 `<Routes>` + `<Outlet>`
5. 改造 `MainLayout.js`：菜单/面包屑/标题从 routeConfig 自动生成

**验证标准：**
- 所有现有 URL 仍可访问
- 侧边栏导航正常
- 浏览器前进/后退正常

### Phase 2：子页面路由化（预计 2-3h）

**目标：** 消灭所有 ID useState，全部用 URL params

1. `/chips/:id` → ChipProfile（去掉 chipProfileId state）
2. `/plans/:id` → PlanMonitor（去掉 planMonitorId state）
3. `/plans/create` → PlanCreate
4. `/reports/:id` → ChipReport（去掉 chipReportId state）
5. `/tasks/:id` → TaskResult（去掉 taskResultId state）
6. `/nodes/:id` → NodeDetail（去掉 nodeDetailId state）
7. `/reports/compare?ids=X,Y` → ReportCompare（去掉 reportCompareIds state）
8. `/chips/compare?ids=X,Y` → ChipCompare（去掉 compareChipIds state）

每个页面改造模式：
```javascript
// Before（props 传入 ID）
function ChipProfile({ chipId, onBack }) { ... }

// After（URL params）
function ChipProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  // onBack → navigate("/chips")
}
```

**验证标准：**
- 直接访问 `/chips/942` 可以看到芯片档案
- 分享 URL 给别人可以直接打开
- 面包屑有"返回"链接

### Phase 3：清理 + 代码分割（预计 1-2h）

**目标：** 删除旧代码，优化性能

1. 删除 App.js 中所有 `PATH_TO_PAGE`、手动 `pushState`、`popstate` 监听
2. 删除 MainLayout.js 中 `PAGE_TITLES`、`BREADCRUMB_MAP`、`PARENT_MAP`（全从 routeConfig 生成）
3. 删除 `routes/AppRoutes.js`（被 RouteRenderer 替代）
4. `React.lazy` 懒加载非首屏页面
5. 添加 `<Suspense fallback={<Spin />}>` loading 态
6. 添加 404 兜底路由

**验证标准：**
- 首屏只加载 Dashboard 的 JS chunk
- 切换页面按需加载
- 未知 URL 显示 404 页面
- ESLint 零 warning

---

## 4. 关键改造示例

### 4.1 新 App.js（Phase 1 后）

```jsx
import React, { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Spin } from "antd";
import useAuthStore from "./stores/useAuthStore";
import Login from "./pages/Login";
import MainLayout from "./layouts/MainLayout";
import { routeConfig, flattenRoutes } from "./config/routes";

function App() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  if (!isAuthenticated) return <Login />;

  const routes = flattenRoutes(routeConfig);

  return (
    <MainLayout>
      <Suspense fallback={<Spin size="large" style={{ margin: "20% auto", display: "block" }} />}>
        <Routes>
          {routes.map(r => (
            <Route key={r.key} path={r.path} element={<r.component />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </MainLayout>
  );
}
```

### 4.2 新 MainLayout.js 菜单生成

```jsx
import { useLocation, useNavigate } from "react-router-dom";
import { routeConfig } from "../config/routes";

function MainLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  // 从 routeConfig 自动生成 Menu items
  const menuItems = routeConfig
    .filter(r => !r.hidden)
    .map(r => ({
      key: r.path || r.key,
      icon: r.icon && <r.icon />,
      label: r.title,
      children: r.children?.filter(c => !c.hidden).map(c => ({
        key: c.path,
        icon: c.icon && <c.icon />,
        label: c.title,
      })),
    }));

  // 当前激活菜单项 — 自动匹配
  const activeKey = findActiveKey(routeConfig, location.pathname);

  return (
    <Layout>
      <Sider>
        <Menu
          items={menuItems}
          selectedKeys={[activeKey]}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Content>{children}</Content>
    </Layout>
  );
}
```

### 4.3 面包屑自动生成

```jsx
function AutoBreadcrumb() {
  const location = useLocation();
  const crumbs = findBreadcrumb(routeConfig, location.pathname);
  return <Breadcrumb items={crumbs} />;
}
```

---

## 5. 迁移检查清单

### 新增页面 SOP（改造后）

只需 **1 步**：在 `src/config/routes.js` 中添加一条配置。

```javascript
{
  key: "new-page",
  path: "/new-page",
  title: "新页面",
  icon: StarOutlined,
  component: lazy(() => import("../pages/NewPage")),
  breadcrumb: [{ title: "分组" }, { title: "新页面" }],
}
```

菜单、路由、面包屑、标题全部自动生效。

### 改造完成后删除的代码

| 文件 | 删除内容 |
|------|----------|
| `App.js` | `PATH_TO_PAGE`、7 个 useState、`pushState`、`popstate`、`handleSetCurrentPage` |
| `routes/AppRoutes.js` | 整个文件（~200 行） |
| `MainLayout.js` | `PAGE_TITLES`、`BREADCRUMB_MAP`、`PARENT_MAP`（~80 行） |

预计净减少 **~300 行**代码，同时新增 `config/routes.js`（~150 行）+ 工具函数（~50 行）。

---

## 6. 风险与对策

| 风险 | 概率 | 对策 |
|------|------|------|
| 旧的 `setCurrentPage` 调用遗漏 | 高 | `grep -r "setCurrentPage"` 全局搜索，逐个替换为 `navigate()` |
| query param 分享链接 (`?report=X`) 失效 | 中 | Phase 2 添加重定向：`/?report=77` → `/reports/77` |
| nginx 对新 URL 返回 404 | 低 | 已有 `try_files $uri /index.html`，无需修改 |
| 子页面组件依赖 props 传入 ID | 高 | 统一改用 `useParams()` 获取 |
| PlanCreate 的 `useNavigate` 与旧系统冲突 | 中 | Phase 1 完成后自然解决 |

---

## 7. 测试策略

### E2E 测试用例（BDD）

```gherkin
Feature: URL 路由

  Scenario: 直接访问芯片页面
    Given 用户已登录
    When 在浏览器地址栏输入 "/chips"
    Then 应显示芯片管理页面
    And 侧边栏"芯片管理"菜单项应高亮

  Scenario: 浏览器前进后退
    Given 用户在 Dashboard
    When 点击侧边栏"评测任务"
    Then URL 变为 "/plans"
    When 点击浏览器后退按钮
    Then URL 变为 "/"
    And 页面显示 Dashboard

  Scenario: 子页面深度链接
    Given 用户已登录
    When 在浏览器地址栏输入 "/chips/942"
    Then 应显示 id=942 的芯片档案页面
    And 面包屑显示"评测中心 > 芯片管理 > 芯片档案"

  Scenario: 分享链接兼容
    Given 用户已登录
    When 访问 "/?report=77"
    Then 应重定向到 "/reports/77"

  Scenario: 404 处理
    Given 用户已登录
    When 访问 "/nonexistent-page"
    Then 应显示 404 页面或重定向到 Dashboard
```

---

## 8. 结论

当前路由是 **"伪 SPA 路由"** — 装了 React Router 但没用，自己手写了一套命令式导航。这种架构在页面少的时候勉强能用，但随着项目扩展到 40+ 页面，维护成本和 bug 频率急剧上升。

改进核心：**从命令式导航（`setCurrentPage`）迁移到声明式路由（`<Route path>`）**，用一份统一配置驱动路由、菜单、面包屑。

预计工作量：**6-8h**，分 3 个 Phase 渐进式迁移，每个 Phase 结束后系统都可正常使用。
