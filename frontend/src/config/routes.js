/**
 * @file routes.js
 * @description 统一路由配置 (Single Source of Truth)
 * @feat #423 前端路由架构改造
 *
 * 所有路由、菜单、面包屑、标题、权限、testId 均从此文件驱动。
 * 新增页面只需在此添加一条配置。
 */
import React, { lazy } from "react";
import {
  DashboardOutlined, ExperimentOutlined, ClusterOutlined, SettingOutlined,
  UnorderedListOutlined, AppstoreOutlined, FileSearchOutlined,
  CloudServerOutlined, DatabaseOutlined, FundProjectionScreenOutlined,
  TeamOutlined, TrophyOutlined, CloudDownloadOutlined,
  ProfileOutlined,
  AuditOutlined, DollarOutlined,
  SafetyCertificateOutlined, RocketOutlined, BellOutlined,
  RestOutlined, CloudUploadOutlined, PieChartOutlined, CheckCircleOutlined,
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
        icon: UnorderedListOutlined,
        component: lazy(() => import("../pages/ChipList")),
        breadcrumb: [{ title: "评测中心" }, { title: "芯片管理" }],
        testId: "page-chip-list",
      },
      {
        key: "chip-compare",
        path: "/chips/compare",
        title: "芯片对比",
        component: lazy(() => import("../pages/ChipCompare")),
        breadcrumb: [{ title: "评测中心" }, { title: "芯片管理" }, { title: "芯片对比" }],
        testId: "page-chip-compare",
        hidden: true,
      },
      {
        key: "chip-profile",
        path: "/chips/:id",
        title: "芯片档案",
        component: lazy(() => import("../pages/ChipProfile")),
        breadcrumb: [{ title: "评测中心" }, { title: "芯片管理" }, { title: "芯片详情" }],
        testId: "page-chip-profile",
        hidden: true,
      },
      {
        key: "template-list",
        path: "/templates",
        title: "评测模板",
        icon: AppstoreOutlined,
        component: lazy(() => import("../pages/TemplateList")),
        breadcrumb: [{ title: "评测中心" }, { title: "评测模板" }],
        testId: "page-template-list",
      },
      {
        key: "plans",
        path: "/plans",
        title: "评测任务",
        icon: FileSearchOutlined,
        component: lazy(() => import("../pages/PlanList")),
        breadcrumb: [{ title: "评测中心" }, { title: "评测任务" }],
        testId: "page-plan-list",
      },
      {
        key: "plan-create",
        path: "/plans/create",
        title: "创建评测方案",
        component: lazy(() => import("../pages/PlanCreate")),
        roles: ["super_admin", "tenant_admin", "engineer", "ADMIN", "SUPER_ADMIN", "ENGINEER"],
        breadcrumb: [{ title: "评测中心" }, { title: "评测任务" }, { title: "创建任务" }],
        testId: "page-plan-create",
        hidden: true,
      },
      {
        key: "plan-monitor",
        path: "/plans/:id",
        title: "方案监控",
        component: lazy(() => import("../pages/PlanMonitor")),
        breadcrumb: [{ title: "评测中心" }, { title: "评测任务" }, { title: "任务监控" }],
        testId: "page-plan-monitor",
        hidden: true,
      },
      {
        key: "report-list",
        path: "/reports",
        title: "评测报告",
        icon: ProfileOutlined,
        component: lazy(() => import("../pages/ReportList")),
        breadcrumb: [{ title: "评测中心" }, { title: "评测报告" }],
        testId: "page-report-list",
      },
      {
        key: "report-compare",
        path: "/chip-reports/compare",
        title: "报告对比",
        component: lazy(() => import("../pages/ReportCompare")),
        breadcrumb: [{ title: "评测中心" }, { title: "评测报告" }, { title: "报告对比" }],
        testId: "page-report-compare",
        hidden: true,
      },
      {
        key: "report-detail",
        path: "/reports/:id",
        title: "报告详情",
        component: lazy(() => import("../pages/ChipReport")),
        breadcrumb: [{ title: "评测中心" }, { title: "评测报告" }, { title: "报告详情" }],
        testId: "page-report-detail",
        hidden: true,
      },
      {
        key: "task-result",
        path: "/tasks/:id",
        title: "任务详情",
        component: lazy(() => import("../pages/TaskResult")),
        breadcrumb: [{ title: "评测中心" }, { title: "任务详情" }],
        testId: "page-task-result",
        hidden: true,
      },
      {
        key: "leaderboard",
        path: "/leaderboard",
        title: "评测榜单",
        icon: TrophyOutlined,
        component: lazy(() => import("../pages/Leaderboard")),
        breadcrumb: [{ title: "评测中心" }, { title: "评测榜单" }],
        testId: "page-leaderboard",
      },
    ],
  },
  {
    key: "asset-mgmt",
    title: "数字资产",
    icon: DatabaseOutlined,
    children: [
      {
        key: "assets",
        path: "/assets",
        title: "资产列表",
        icon: DatabaseOutlined,
        component: lazy(() => import("../pages/Assets")),
        breadcrumb: [{ title: "数字资产" }, { title: "资产列表" }],
        testId: "page-assets",
      },
      {
        key: "asset-validation",
        path: "/assets/validation",
        title: "资产校验",
        icon: CheckCircleOutlined,
        component: lazy(() => import("../pages/AssetValidation")),
        breadcrumb: [{ title: "数字资产" }, { title: "资产校验" }],
        testId: "page-asset-validation",
      },
      {
        key: "asset-recycle-bin",
        path: "/assets/recycle-bin",
        title: "回收站",
        icon: RestOutlined,
        component: lazy(() => import("../pages/AssetRecycleBin")),
        breadcrumb: [{ title: "数字资产" }, { title: "回收站" }],
        testId: "page-asset-recycle-bin",
      },
      {
        key: "asset-backup",
        path: "/assets/backup",
        title: "备份管理",
        icon: CloudUploadOutlined,
        component: lazy(() => import("../pages/AssetBackup")),
        breadcrumb: [{ title: "数字资产" }, { title: "备份管理" }],
        testId: "page-asset-backup",
      },
      {
        key: "storage-monitor",
        path: "/assets/storage",
        title: "存储监控",
        icon: PieChartOutlined,
        component: lazy(() => import("../pages/StorageMonitor")),
        breadcrumb: [{ title: "数字资产" }, { title: "存储监控" }],
        testId: "page-storage-monitor",
      },
    ],
  },
  {
    key: "resource-mgmt",
    title: "资源管理",
    icon: ClusterOutlined,
    children: [
      {
        key: "nodes",
        path: "/nodes",
        title: "节点管理",
        icon: ClusterOutlined,
        component: lazy(() => import("../pages/NodeList")),
        breadcrumb: [{ title: "资源管理" }, { title: "节点管理" }],
        testId: "page-node-list",
      },
      {
        key: "node-detail",
        path: "/nodes/:id",
        title: "节点详情",
        component: lazy(() => import("../pages/NodeDetail")),
        breadcrumb: [{ title: "资源管理" }, { title: "节点管理" }, { title: "节点详情" }],
        testId: "page-node-detail",
        hidden: true,
      },
      {
        key: "resource-pools",
        path: "/resource-pools",
        title: "资源池管理",
        icon: CloudServerOutlined,
        component: lazy(() => import("../pages/ResourcePoolList")),
        breadcrumb: [{ title: "资源管理" }, { title: "资源池管理" }],
        testId: "page-resource-pools",
      },
      {
        key: "resource-onboard",
        path: "/resource-onboard",
        title: "资源纳管",
        icon: RocketOutlined,
        component: lazy(() => import("../pages/ResourceOnboard")),
        breadcrumb: [{ title: "资源管理" }, { title: "资源纳管" }],
        testId: "page-resource-onboard",
      },
      {
        key: "resource-monitor",
        path: "/resource-monitor",
        title: "资源监控",
        icon: FundProjectionScreenOutlined,
        component: lazy(() => import("../pages/ResourceMonitor")),
        breadcrumb: [{ title: "资源管理" }, { title: "资源监控" }],
        testId: "page-resource-monitor",
      },
      {
        key: "alert-config",
        path: "/alert-config",
        title: "告警配置",
        icon: BellOutlined,
        component: lazy(() => import("../pages/AlertConfig")),
        breadcrumb: [{ title: "资源管理" }, { title: "告警配置" }],
        testId: "page-alert-config",
      },
      {
        key: "self-healing",
        path: "/self-healing",
        title: "自愈策略",
        icon: SafetyCertificateOutlined,
        component: lazy(() => import("../pages/SelfHealing")),
        breadcrumb: [{ title: "资源管理" }, { title: "自愈策略" }],
        testId: "page-self-healing",
      },
    ],
  },
  {
    key: "community-hub",
    title: "社区",
    icon: TeamOutlined,
    children: [
      {
        key: "community",
        path: "/community",
        title: "社区首页",
        icon: TeamOutlined,
        component: lazy(() => import("../pages/Community")),
        breadcrumb: [{ title: "社区" }, { title: "社区首页" }],
        testId: "page-community",
        hidden: true,
      },
      {
        key: "community-resources",
        path: "/community/resources",
        title: "资源下载",
        icon: CloudDownloadOutlined,
        component: lazy(() => import("../pages/CommunityResources")),
        breadcrumb: [{ title: "社区" }, { title: "资源下载" }],
        testId: "page-community-resources",
      },
    ],
  },
  {
    key: "sys-settings",
    title: "系统设置",
    icon: SettingOutlined,
    children: [
      {
        key: "users",
        path: "/admin/users",
        title: "用户管理",
        icon: TeamOutlined,
        component: lazy(() => import("../pages/Users")),
        roles: ["super_admin", "tenant_admin", "ADMIN", "SUPER_ADMIN", "TENANT_ADMIN"],
        breadcrumb: [{ title: "系统设置" }, { title: "用户管理" }],
        testId: "page-users",
      },
      {
        key: "tenants",
        path: "/admin/tenants",
        title: "租户管理",
        icon: TeamOutlined,
        component: lazy(() => import("../pages/TenantList")),
        roles: ["super_admin", "ADMIN", "SUPER_ADMIN"],
        breadcrumb: [{ title: "系统设置" }, { title: "租户管理" }],
        testId: "page-tenants",
      },
      {
        key: "audit",
        path: "/admin/audit",
        title: "审计日志",
        icon: AuditOutlined,
        component: lazy(() => import("../pages/Audit")),
        roles: ["super_admin", "tenant_admin", "ADMIN", "SUPER_ADMIN"],
        breadcrumb: [{ title: "系统设置" }, { title: "审计日志" }],
        testId: "page-audit",
      },
      {
        key: "scheduler-config",
        path: "/admin/scheduler",
        title: "调度配置",
        icon: SettingOutlined,
        component: lazy(() => import("../pages/SchedulerConfig")),
        roles: ["super_admin", "ADMIN", "SUPER_ADMIN"],
        breadcrumb: [{ title: "系统设置" }, { title: "调度配置" }],
        testId: "page-scheduler-config",
        hidden: true,
      },
      {
        key: "billing",
        path: "/admin/billing",
        title: "计费管理",
        icon: DollarOutlined,
        component: lazy(() => import("../pages/Billing")),
        roles: ["super_admin", "ADMIN", "SUPER_ADMIN"],
        breadcrumb: [{ title: "系统设置" }, { title: "计费管理" }],
        testId: "page-billing",
        hidden: true,
      },
    ],
  },
  /* ── 独立页面（不出现在菜单中） ── */
  {
    key: "settings",
    path: "/settings",
    title: "用户设置",
    component: lazy(() => import("../pages/Settings")),
    breadcrumb: [{ title: "用户设置" }],
    testId: "page-settings",
    hidden: true,
  },
  {
    key: "user-preferences",
    path: "/user-preferences",
    title: "偏好设置",
    component: lazy(() => import("../pages/UserPreferences")),
    breadcrumb: [{ title: "偏好设置" }],
    testId: "page-user-preferences",
    hidden: true,
  },
  {
    key: "user-points",
    path: "/user-points",
    title: "我的积分",
    component: lazy(() => import("../pages/UserPoints")),
    breadcrumb: [{ title: "我的积分" }],
    testId: "page-user-points",
    hidden: true,
  },
  {
    key: "alerts",
    path: "/alerts",
    title: "告警管理",
    component: lazy(() => import("../pages/AlertPanel")),
    breadcrumb: [{ title: "资源管理" }, { title: "告警管理" }],
    testId: "page-alerts",
    hidden: true,
  },
];

/**
 * 扁平化路由树，提取所有有 path+component 的叶节点
 */
export function flattenRoutes(config) {
  const routes = [];
  for (const item of config) {
    if (item.path && item.component) {
      routes.push(item);
    }
    if (item.children) {
      routes.push(...flattenRoutes(item.children));
    }
  }
  return routes;
}

/**
 * 生成 Ant Design Menu items（排除 hidden 的节点）
 */
export function generateMenuItems(config) {
  return config
    .filter((r) => !r.hidden)
    .map((r) => {
      const visibleChildren = r.children
        ? r.children.filter((c) => !c.hidden)
        : undefined;
      // 如果分组下没有可见子项，跳过
      if (r.children && (!visibleChildren || visibleChildren.length === 0)) return null;
      return {
        key: r.path || r.key,
        icon: r.icon ? React.createElement(r.icon) : undefined,
        label: r.title,
        children:
          visibleChildren && visibleChildren.length > 0
            ? visibleChildren.map((c) => ({
                key: c.path,
                icon: c.icon ? React.createElement(c.icon) : undefined,
                label: c.title,
              }))
            : undefined,
      };
    })
    .filter(Boolean);
}

/**
 * 根据 pathname 找到激活的菜单 key
 */
export function findActiveKey(config, pathname) {
  const flat = flattenRoutes(config);

  // 精确匹配
  const exact = flat.find((r) => r.path === pathname && !r.hidden);
  if (exact) return exact.path;

  // 参数路由的子页面：/chips/42 → /chips, /plans/3 → /plans
  const staticRoutes = flat
    .filter((r) => r.path && !r.path.includes(":") && !r.hidden)
    .sort((a, b) => b.path.length - a.path.length);

  for (const route of staticRoutes) {
    if (pathname.startsWith(route.path + "/") || pathname === route.path) {
      return route.path;
    }
  }

  return "/";
}

/**
 * 根据 pathname 找到父级分组的 key（侧边栏展开）
 */
export function findOpenKeys(config, pathname) {
  for (const group of config) {
    if (!group.children) continue;
    const flat = flattenRoutes([group]);
    for (const route of flat) {
      if (!route.path) continue;
      if (route.path === pathname) return [group.key];
      if (route.path.includes(":")) {
        const prefix = route.path.split(":")[0];
        if (pathname.startsWith(prefix)) return [group.key];
      }
    }
    // 静态前缀匹配
    const staticPaths = flat
      .filter((r) => r.path && !r.path.includes(":"))
      .sort((a, b) => b.path.length - a.path.length);
    for (const r of staticPaths) {
      if (pathname.startsWith(r.path + "/") || pathname === r.path) {
        return [group.key];
      }
    }
  }
  return [];
}

/**
 * 根据 pathname 生成面包屑
 */
export function findBreadcrumb(config, pathname) {
  const flat = flattenRoutes(config);

  // 精确匹配
  const exact = flat.find((r) => r.path === pathname);
  if (exact && exact.breadcrumb) return exact.breadcrumb;

  // 参数路由匹配
  for (const route of flat) {
    if (route.path && route.path.includes(":")) {
      const prefix = route.path.split(":")[0];
      if (pathname.startsWith(prefix) && route.breadcrumb) {
        return route.breadcrumb;
      }
    }
  }

  return [{ title: "页面" }];
}
