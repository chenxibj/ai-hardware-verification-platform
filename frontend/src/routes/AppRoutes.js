/**
 * @file AppRoutes.js
 * @description 页面路由配置，根据 currentPage 渲染对应组件
 * @refactor #128 导航结构重组 - 新增芯片管理/评测计划/节点管理/审计页面
 * @feat #134 支持 planMonitorId 渲染执行监控页面
 * @feat #136 支持 chipReportId 渲染芯片评价报告页面
 * @feat #137 支持 chipProfileId 渲染芯片档案页
 */
import React from "react";
import Dashboard from "../pages/Dashboard";
import ChipList from "../pages/ChipList";
import ChipCompare from "../pages/ChipCompare";
import ChipProfile from "../pages/ChipProfile";
import PlanList from "../pages/PlanList";
import PlanCreate from "../pages/PlanCreate";
import PlanMonitor from "../pages/PlanMonitor";
import ChipReport from "../pages/ChipReport";
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

export default function AppRoutes({
  currentPage, planMonitorId, chipReportId, chipProfileId, compareChipIds,
  setCurrentPage, setPlanMonitorId, setChipReportId, setChipProfileId, setCompareChipIds,
}) {
  // 如果进入对比页
  if (currentPage === "chip-compare") {
    return (
      <ChipCompare
        selectedChipIds={compareChipIds || []}
        onBack={() => {
          setCompareChipIds([]);
          setCurrentPage("chips");
        }}
      />
    );
  }

  // 如果有 chipProfileId，渲染芯片档案页
  if (chipProfileId) {
    return (
      <ChipProfile
        chipId={chipProfileId}
        onBack={() => {
          setChipProfileId(null);
          setCurrentPage("chips");
        }}
        onOpenMonitor={(planId) => {
          setChipProfileId(null);
          setPlanMonitorId(planId);
        }}
        onOpenReport={(planId) => {
          setChipProfileId(null);
          setChipReportId(planId);
        }}
        onCreatePlan={(chipId) => {
          setChipProfileId(null);
          setCurrentPage("plans-create");
        }}
      />
    );
  }

  // 如果有 chipReportId，渲染芯片评价报告页面
  if (chipReportId) {
    return (
      <ChipReport
        reportId={chipReportId}
        onBack={() => {
          setChipReportId(null);
        }}
      />
    );
  }

  // 如果有 planMonitorId，渲染监控页面
  if (planMonitorId) {
    return (
      <PlanMonitor
        planId={planMonitorId}
        onBack={() => {
          setPlanMonitorId(null);
          setCurrentPage("plans");
        }}
      />
    );
  }

  const PageComponent = PAGE_COMPONENTS[currentPage] || Dashboard;
  // 传递 setPlanMonitorId 给 PlanList 以支持跳转到监控页
  if (currentPage === "plans") {
    return <PlanList onOpenMonitor={(id) => setPlanMonitorId(id)} />;
  }
  // 传递 setChipProfileId 给 ChipList 以支持跳转到档案页
  if (currentPage === "chips") {
    return (
      <ChipList
        onOpenProfile={(id) => setChipProfileId(id)}
        onCompare={(ids) => {
          setCompareChipIds(ids);
          setCurrentPage("chip-compare");
        }}
      />
    );
  }
  return <PageComponent />;
}
