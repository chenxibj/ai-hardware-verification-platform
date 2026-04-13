# AHVP 前端路由架构改进方案 v2.0

> 文档版本：v2.0 | 作者：菜菜子 | 日期：2026-04-13
> v2.0 变更：采纳麦克雷 review 意见 + chenxi 决策（不做旧兼容，一次性切换）

## 1. 问题复盘

### 1.1 历史路由问题汇总

- **04-01** — 登录后白屏 → 缺少 `<BrowserRouter>` 包裹
- **04-02** — 新增页面后路由映射遗漏 → 手动维护 7 处映射表
- **04-04 #171** — 分享链接只支持 query param → 没有真正的 URL 路由
- **04-12 #411** — 直接访问 URL 始终显示 Dashboard → currentPage state 不读 URL
- **04-13 #411 fix** — 补丁式 pushState 同步 → 治标不治本

### 1.2 根因分析

**核心问题：** 项目装了 `react-router-dom@6` 但没用，自己手写了一套 `useState("currentPage")` + `pushState` 的伪路由。

```
影子路由系统：
  index.js:   <BrowserRouter>          ← 装了但没用
  App.js:     useState(currentPage)    ← 真正的页面切换
  App.js:     手动 pushState/popstate  ← 补丁式 URL 同步
  MainLayout: onClick → setCurrentPage ← 命令式导航
  AppRoutes:  if/else 条件渲染        ← 不是 <Route>
  PlanCreate: useNavigate()           ← 唯一用了 React Router，与其他页面不兼容
```

### 1.3 痛点

1. **7 处映射表** — 加一个页面改 7 个文件（App.js PATH_TO_PAGE、AppRoutes PAGE_COMPONENTS、MainLayout PAGE_TITLES/BREADCRUMB_MAP/PARENT_MAP/menuItems、nginx.conf）
2. **手动 pushState** — 前进/后退不可靠，子页面状态丢失
3. **子页面无 URL** — 芯片档案/计划监控/报告详情不可分享
4. **导航状态分散** — 7 个 useState 管子页面 ID，互相重置
5. **与 React Router 冲突** — PlanCreate 的 `navigate("/plans")` 实际无效

---

## 2. 改进方案

### 2.1 设计目标

1. **URL 即状态** — 任何页面有唯一 URL，可分享/刷新/前进后退
2. **单一配置源（SSOT）** — 1 份 routeConfig 驱动路由/菜单/面包屑/标题/权限
3. **子页面可寻址** — `/chips/942`、`/plans/666`、`/reports/77` 可直接访问
4. **路由守卫** — routeConfig 声明 `roles` 字段，无权限给友好提示（解决 #417）
5. **E2E 友好** — 每个页面容器自动加 `data-testid`
6. **不做旧兼容** — 一次性切换，旧的 `?report=X` query param 链接不保留

### 2.2 URL 规范

```
/                           → Dashboard
/chips                      → 芯片列表
/chips/:id                  → 芯片档案
/chips/compare?ids=1,2,3    → 芯片对比

/plans                      → 评测方案列表
/plans/create               → 创建评测方案
/plans/:id                  → 方案监控

/templates                  → 评测模板

/reports                    → 报告列表
/reports/:id                → 报告详情
/reports/compare?ids=1,2    → 报告对比

/tasks/:id                  → 任务详情

/nodes                      → 节点列表
/nodes/:id                  → 节点详情

/resource-pools             → 资源池
/resource-monitor           → 资源监控
/alerts                     → 告警管理
/alert-config               → 告警配置
/self-healing               → 自愈策略
/resource-onboard           → 资源纳管

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
/404                        → 404 页面（兜底）
```

### 2.3 统一路由配置（SSOT）

```javascript
// src/config/routes.js
import { lazy } from "react";
import {
  DashboardOutlined, ExperimentOutlined, AppstoreOutlined,
  UnorderedListOutlined, FileSearchOutlined, ClusterOutlined,
  CloudServerOutlined, DatabaseOutlined, TrophyOutlined,
  TeamOutlined, SettingOutlined, PlusCircleOutlined,
} from "@ant-design/icons";

export const routeConfig = [
  {
    key: "dashboard",
    path: "/",
    title: "Dashboard",
    icon: DashboardOutlined,
    component: lazy(() => import("../pages/Dashboard")),
    breadcrumb: [{ title: "首页" }],
    testId: "page-dashboard",
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
        testId: "page-chip-list",
        children: [
          {
            key: "chip-profile",
            path: "/chips/:id",
            title: "芯片档案",
            component: lazy(() => import("../pages/ChipProfile")),
            testId: "page-chip-profile",
            hidden: true,
          },
          {
            key: "chip-compare",
            path: "/chips/compare",
            title: "芯片对比",
            component: lazy(() => import("../pages/ChipCompare")),
            testId: "page-chip-compare",
            hidden: true,
          },
        ],
      },
      {
        key: "plans",
        path: "/plans",
        title: "评测方案",
        icon: UnorderedListOutlined,
        component: lazy(() => import("../pages/PlanList")),
        breadcrumb: [{ title: "评测中心" }, { title: "评测方案" }],
        testId: "page-plan-list",
        children: [
          {
            key: "plan-create",
            path: "/plans/create",
            title: "创建评测方案",
            component: lazy(() => import("../pages/PlanCreate")),
            roles: ["super_admin", "tenant_admin", "engineer"],
            testId: "page-plan-create",
            hidden: true,
          },
          {
            key: "plan-monitor",
            path: "/plans/:id",
            title: "方案监控",
            component: lazy(() => import("../pages/PlanMonitor")),
            testId: "page-plan-monitor",
            hidden: true,
          },
        ],
      },
      {
        key: "templates",
        path: "/templates",
        title: "评测模板",
        icon: FileSearchOutlined,
        component: lazy(() => import("../pages/TemplateList")),
        testId: "page-template-list",
      },
      {
        key: "reports",
        path: "/reports",
        title: "评测报告",
        icon: FileSearchOutlined,
        component: lazy(() => import("../pages/ReportList")),
        testId: "page-report-list",
        children: [
          {
            key: "report-detail",
            path: "/reports/:id",
            component: lazy(() => import("../pages/ChipReport")),
            testId: "page-report-detail",
            hidden: true,
          },
          {
            key: "report-compare",
            path: "/reports/compare",
            component: lazy(() => import("../pages/ReportCompare")),
            testId: "page-report-compare",
            hidden: true,
          },
        ],
      },
      {
        key: "leaderboard",
        path: "/leaderboard",
        title: "评测榜单",
        icon: TrophyOutlined,
        component: lazy(() => import("../pages/Leaderboard")),
        testId: "page-leaderboard",
      },
    ],
  },
  // ... 资源管理、数字资产、社区、系统设置 分组
];

/**
 * 扁平化路由树，提取所有有 path+component 的叶节点
 */
export function flattenRoutes(config, parent = null) {
  const routes = [];
  for (const item of config) {
    if (item.path && item.component) {
      routes.push({ ...item, parent });
    }
    if (item.children) {
      routes.push(...flattenRoutes(item.children, item));
    }
  }
  return routes;
}

/**
 * 生成 Ant Design Menu items（排除 hidden）
 */
export function generateMenuItems(config) {
  return config.filter(r => !r.hidden).map(r => ({
    key: r.path || r.key,
    icon: r.icon ? <r.icon /> : undefined,
    label: r.title,
    children: r.children
      ? r.children.filter(c => !c.hidden).map(c => ({
          key: c.path,
          icon: c.icon ? <c.icon /> : undefined,
          label: c.title,
        }))
      : undefined,
  }));
}

/**
 * 根据 pathname 找到激活的菜单 key
 */
export function findActiveKey(config, pathname) {
  const flat = flattenRoutes(config);
  // 精确匹配优先，然后前缀匹配
  const exact = flat.find(r => r.path === pathname);
  if (exact) return exact.parent?.path || exact.path;
  // /chips/42 → 匹配 /chips
  const prefix = flat
    .filter(r => r.path && !r.path.includes(":") && pathname.startsWith(r.path))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return prefix?.path || "/";
}

/**
 * 根据 pathname 生成面包屑
 */
export function findBreadcrumb(config, pathname) {
  const flat = flattenRoutes(config);
  const match = flat.find(r => matchPath(r.path, pathname));
  return match?.breadcrumb || [{ title: match?.title || "页面" }];
}
```

### 2.4 路由守卫

```javascript
// src/components/ProtectedRoute.js
import useAuthStore from "../stores/useAuthStore";
import NoPermission from "../pages/NoPermission";

export default function ProtectedRoute({ roles, children }) {
  const user = useAuthStore(s => s.user);
  if (roles && roles.length > 0 && !roles.includes(user?.role)) {
    return <NoPermission requiredRoles={roles} currentRole={user?.role} />;
  }
  return children;
}
```

### 2.5 新 App.js

```jsx
import React, { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Spin } from "antd";
import useAuthStore from "./stores/useAuthStore";
import Login from "./pages/Login";
import MainLayout from "./layouts/MainLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import NotFound from "./pages/NotFound";
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
            <Route
              key={r.key}
              path={r.path}
              element={
                <ProtectedRoute roles={r.roles}>
                  <div data-testid={r.testId}>
                    <r.component />
                  </div>
                </ProtectedRoute>
              }
            />
          ))}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </MainLayout>
  );
}
```

### 2.6 页面改造模式

```javascript
// Before — props 传入 ID + onBack 回调
function ChipProfile({ chipId, onBack }) {
  const [chip, setChip] = useState(null);
  useEffect(() => { api.get(`/chips/${chipId}`).then(...) }, [chipId]);
  return <Button onClick={onBack}>返回</Button>;
}

// After — URL params + navigate
import { useParams, useNavigate } from "react-router-dom";
function ChipProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [chip, setChip] = useState(null);
  useEffect(() => { api.get(`/chips/${id}`).then(...) }, [id]);
  return <Button onClick={() => navigate("/chips")}>返回</Button>;
}
```

### 2.7 登录后路由恢复

```javascript
// Login.js — 登录成功后恢复用户之前的页面
function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async () => {
    await doLogin(email, password);
    // 恢复登录前的页面，默认 Dashboard
    const from = location.state?.from?.pathname || "/";
    navigate(from, { replace: true });
  };
}

// ProtectedRoute 或 App 层面：未登录时记录来源
if (!isAuthenticated) {
  return <Navigate to="/login" state={{ from: location }} replace />;
}
```

---

## 3. 实施计划（v2.0 调整）

> 采纳麦克雷建议：Phase 1+2 合并，避免过渡态两套路由并存。

### Phase A：路由全面改造（合并原 Phase 1+2，预计 4-5h）

**一次性完成：**
1. 创建 `src/config/routes.js` 统一配置
2. 创建 `src/components/ProtectedRoute.js` 路由守卫
3. 创建 `src/pages/NotFound.js` 404 页面
4. 重写 `App.js` — 用 `<Routes>` 替代 useState + if/else
5. 改造 `MainLayout.js` — 菜单/面包屑/标题从 routeConfig 生成
6. 改造所有子页面组件 — props ID → `useParams()`：
   - ChipProfile: `chipId` prop → `useParams().id`
   - PlanMonitor: `planMonitorId` prop → `useParams().id`
   - ChipReport: `chipReportId` prop → `useParams().id`
   - TaskResult: `taskResultId` prop → `useParams().id`
   - NodeDetail: `nodeDetailId` prop → `useParams().id`
   - ChipCompare: `selectedChipIds` prop → `useSearchParams().get("ids")`
   - ReportCompare: `reportIds` prop → `useSearchParams().get("ids")`
7. 删除旧文件 `routes/AppRoutes.js`
8. 全局搜索替换 `setCurrentPage` → `navigate()`
9. 登录后路由恢复逻辑

**验证标准：**
- 所有 URL 直接可访问（/chips, /plans, /chips/942, /plans/666 等）
- 侧边栏导航正常，高亮正确
- 浏览器前进/后退正常
- 未知 URL 显示 404
- 权限不足显示友好提示（#417）
- 登录过期后重新登录恢复原页面

### Phase B：代码分割 + 清理 + 全量测试（预计 2-3h）

1. `React.lazy` 懒加载非首屏页面
2. `Suspense` loading 态
3. 清理所有旧代码残留（grep 验证无遗留的 setCurrentPage/currentPage/pushState）
4. ESLint 零 warning
5. **全量接口/页面测试**（见第 4 节）

---

## 4. 全量测试清单

> chenxi 要求：路由变更后所有接口测一遍，确保变更在所有页面生效。

### 4.1 页面可访问性测试

每个路由 URL 必须：① 直接访问可渲染 ② 侧边栏高亮正确 ③ 面包屑正确

| URL | 页面 | 验证项 |
|-----|------|--------|
| `/` | Dashboard | 首页渲染 |
| `/chips` | 芯片列表 | 列表加载 + 筛选 |
| `/chips/:id` | 芯片档案 | 数据加载 + 返回按钮 |
| `/chips/compare?ids=X,Y` | 芯片对比 | 对比数据 |
| `/plans` | 方案列表 | 列表 + 创建按钮 |
| `/plans/create` | 创建方案 | 完整向导流程 |
| `/plans/:id` | 方案监控 | 任务列表 + 进度 |
| `/templates` | 模板列表 | 列表渲染 |
| `/reports` | 报告列表 | 列表 + 查看按钮 |
| `/reports/:id` | 报告详情 | 完整报告渲染 |
| `/reports/compare?ids=X,Y` | 报告对比 | 对比数据 |
| `/tasks/:id` | 任务详情 | 结果 + 日志 |
| `/nodes` | 节点列表 | 状态 + 在线状态 |
| `/nodes/:id` | 节点详情 | 监控数据 |
| `/resource-pools` | 资源池 | 列表渲染 |
| `/resource-monitor` | 资源监控 | 图表渲染 |
| `/alerts` | 告警 | 列表渲染 |
| `/assets` | 数字资产 | 列表渲染 |
| `/leaderboard` | 榜单 | 数据渲染 |
| `/community` | 社区 | 页面渲染 |
| `/admin/users` | 用户管理 | 列表 + 权限检查 |
| `/admin/tenants` | 租户管理 | 列表渲染 |
| `/admin/audit` | 审计日志 | 列表渲染 |
| `/settings` | 设置 | 页面渲染 |
| `/nonexistent` | 404 | 404 页面渲染 |

### 4.2 导航交互测试

| 测试场景 | 步骤 | 预期 |
|----------|------|------|
| 侧边栏导航 | 点击每个菜单项 | URL 变化 + 页面切换 + 高亮 |
| 浏览器后退 | Dashboard → chips → 后退 | 回到 Dashboard |
| 浏览器前进 | 后退后 → 前进 | 回到 chips |
| 深度链接 | 直接访问 /chips/942 | 芯片档案页 + 面包屑正确 |
| F5 刷新 | 在 /plans 页面刷新 | 仍在 /plans |
| 快速连续点击 | 500ms 内点 2 个菜单 | 最终停在最后点的页面 |

### 4.3 权限测试

| 角色 | 访问 /plans/create | 访问 /admin/users | 预期 |
|------|-------------------|-------------------|------|
| super_admin | ✅ | ✅ | 正常 |
| engineer | ✅ | ❌ 权限提示 | 权限提示 |
| viewer | ❌ 权限提示 | ❌ 权限提示 | 权限提示 |

### 4.4 登录流程测试

| 测试场景 | 步骤 | 预期 |
|----------|------|------|
| 登录过期恢复 | 在 /plans/666 → token 过期 → 重新登录 | 回到 /plans/666 |
| 首次登录 | 直接登录 | 进入 Dashboard |
| 未登录访问 | 直接访问 /chips | 跳转登录页 |

### 4.5 API 接口联动测试

确保页面路由变更不影响 API 调用：

| 页面 | 关键 API | 验证 |
|------|---------|------|
| /chips | GET /api/chips | 列表数据正确 |
| /chips/:id | GET /api/chips/:id | 档案数据正确 |
| /plans | GET /api/plans | 列表数据正确 |
| /plans/create | POST /api/plans | 创建成功 |
| /plans/:id | GET /api/plans/:id + GET /api/plans/:id/tasks | 方案+任务数据 |
| /reports/:id | GET /api/chip-reports/:id | 报告数据正确 |
| /tasks/:id | GET /api/tasks/:id + GET /api/tasks/:id/logs | 任务+日志 |
| /nodes | GET /api/nodes | 节点列表 |
| /nodes/:id | GET /api/nodes/:id | 节点详情 |

---

## 5. 新增页面 SOP

改造后新增页面只需 **1 步**：在 `src/config/routes.js` 加一条配置。

```javascript
{
  key: "new-page",
  path: "/new-page",
  title: "新页面",
  icon: StarOutlined,
  component: lazy(() => import("../pages/NewPage")),
  breadcrumb: [{ title: "分组" }, { title: "新页面" }],
  testId: "page-new-page",
  roles: ["admin"],  // 可选，不填则所有已登录用户可访问
}
```

菜单、路由、面包屑、标题、权限、testId 全部自动生效。

---

## 6. 改造完成后删除的代码

| 文件 | 删除内容 | 行数 |
|------|----------|------|
| `App.js` | PATH_TO_PAGE、7 个 useState、pushState、popstate、handleSetCurrentPage | ~100 行 |
| `routes/AppRoutes.js` | 整个文件 | ~200 行 |
| `MainLayout.js` | PAGE_TITLES、BREADCRUMB_MAP、PARENT_MAP | ~80 行 |
| **合计** | | **~380 行** |

新增：`config/routes.js`（~200 行）+ `ProtectedRoute.js`（~20 行）+ `NotFound.js`（~30 行）+ 工具函数（~50 行）= **~300 行**

净减少 ~80 行，维护点从 7 个降到 1 个。
