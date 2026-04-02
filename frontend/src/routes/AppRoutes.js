/**
 * @file AppRoutes.js
 * @description 页面路由配置，根据 currentPage 渲染对应组件
 * @param {Object} props
 * @param {string} props.currentPage - 当前页面 key
 */
import React from "react";
import Dashboard from "../pages/Dashboard";
import Tasks from "../pages/Tasks";
import Templates from "../pages/Templates";
import Workflows from "../pages/Workflows";
import Reports from "../pages/Reports";
import Comparisons from "../pages/Comparisons";
import Logs from "../pages/Logs";
import Assets from "../pages/Assets";
import Resources from "../pages/Resources";
import Community from "../pages/Community";
import Users from "../pages/Users";
import AuditLogs from "../pages/AuditLogs";
import Settings from "../pages/Settings";

const PAGE_COMPONENTS = {
  dashboard: Dashboard, tasks: Tasks, templates: Templates,
  workflows: Workflows, reports: Reports, comparisons: Comparisons,
  logs: Logs, assets: Assets, resources: Resources,
  community: Community, users: Users, audit: AuditLogs, settings: Settings,
};

export default function AppRoutes({ currentPage }) {
  const PageComponent = PAGE_COMPONENTS[currentPage] || Dashboard;
  return <PageComponent />;
}
