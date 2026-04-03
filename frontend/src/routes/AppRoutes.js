/**
 * @file AppRoutes.js
 * @description 页面路由配置，根据 currentPage 渲染对应组件
 * @refactor #128 导航结构重组 - 新增芯片管理/评测计划/节点管理/审计页面
 */
import React from "react";
import Dashboard from "../pages/Dashboard";
import ChipList from "../pages/ChipList";
import ChipCompare from "../pages/ChipCompare";
import PlanList from "../pages/PlanList";
import PlanCreate from "../pages/PlanCreate";
import Nodes from "../pages/Nodes";
import Users from "../pages/Users";
import Audit from "../pages/Audit";
// 保留旧页面路由（隐藏导航但可从内部跳转）
import Tasks from "../pages/Tasks";
import Templates from "../pages/Templates";
import Workflows from "../pages/Workflows";
import Reports from "../pages/Reports";
import Comparisons from "../pages/Comparisons";
import Logs from "../pages/Logs";
import Assets from "../pages/Assets";
import Resources from "../pages/Resources";
import Community from "../pages/Community";
import AuditLogs from "../pages/AuditLogs";
import Settings from "../pages/Settings";

const PAGE_COMPONENTS = {
  dashboard: Dashboard,
  // 新导航页面
  chips: ChipList,
  "chip-compare": ChipCompare,
  plans: PlanList,
  "plans-create": PlanCreate,
  nodes: Nodes,
  users: Users,
  audit: Audit,
  // 保留旧路由（不在导航中显示）
  tasks: Tasks,
  templates: Templates,
  workflows: Workflows,
  reports: Reports,
  comparisons: Comparisons,
  logs: Logs,
  assets: Assets,
  resources: Resources,
  community: Community,
  "audit-logs": AuditLogs,
  settings: Settings,
};

export default function AppRoutes({ currentPage }) {
  const PageComponent = PAGE_COMPONENTS[currentPage] || Dashboard;
  return <PageComponent />;
}
