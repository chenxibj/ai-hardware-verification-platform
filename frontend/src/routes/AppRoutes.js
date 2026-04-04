/**
 * @file AppRoutes.js
 * @description 页面路由配置
 * @feat #134, #136, #137, #161, #162, #164, #166, #167, #169, #170
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
import TaskResult from "../pages/TaskResult";
import TemplateList from "../pages/TemplateList";
import NodeList from "../pages/NodeList";
import NodeDetail from "../pages/NodeDetail";
import Users from "../pages/Users";
import Audit from "../pages/Audit";
import ReportList from "../pages/ReportList";
import ReportCompare from "../pages/ReportCompare";
// 保留旧页面路由
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
  chips: ChipList,
  "chip-compare": ChipCompare,
  plans: PlanList,
  "plans-create": PlanCreate,
  "template-list": TemplateList,
  nodes: NodeList,
  users: Users,
  audit: Audit,
  "report-list": ReportList,
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
  taskResultId, nodeDetailId, reportCompareIds,
  setCurrentPage, setPlanMonitorId, setChipReportId, setChipProfileId,
  setCompareChipIds, setTaskResultId, setNodeDetailId, setReportCompareIds,
}) {
  // 报告对比页 (#170)
  if (reportCompareIds && reportCompareIds.length >= 2) {
    return (
      <ReportCompare
        reportIds={reportCompareIds}
        onBack={() => { setReportCompareIds([]); setCurrentPage("report-list"); }}
      />
    );
  }

  // 对比页
  if (currentPage === "chip-compare") {
    return (
      <ChipCompare
        selectedChipIds={compareChipIds || []}
        onBack={() => { setCompareChipIds([]); setCurrentPage("chips"); }}
      />
    );
  }

  // 芯片档案页
  if (chipProfileId) {
    return (
      <ChipProfile
        chipId={chipProfileId}
        onBack={() => { setChipProfileId(null); setCurrentPage("chips"); }}
        onOpenMonitor={(planId) => { setChipProfileId(null); setPlanMonitorId(planId); }}
        onOpenReport={(planId) => { setChipProfileId(null); setChipReportId(planId); }}
        onCreatePlan={(chipId) => { setChipProfileId(null); setCurrentPage("plans-create"); }}
      />
    );
  }

  // 任务结果页 (#164)
  if (taskResultId) {
    return (
      <TaskResult
        taskId={taskResultId}
        onBack={() => { if (setTaskResultId) setTaskResultId(null); }}
      />
    );
  }

  // 芯片报告页
  if (chipReportId) {
    return (
      <ChipReport
        reportId={chipReportId}
        onBack={() => { setChipReportId(null); }}
      />
    );
  }

  // 计划监控页
  if (planMonitorId) {
    return (
      <PlanMonitor
        planId={planMonitorId}
        onBack={() => { setPlanMonitorId(null); setCurrentPage("plans"); }}
      />
    );
  }

  // 节点详情页 (#167)
  if (nodeDetailId) {
    return (
      <NodeDetail
        nodeId={nodeDetailId}
        onBack={() => { if (setNodeDetailId) setNodeDetailId(null); }}
      />
    );
  }

  // 报告列表页 (#169)
  if (currentPage === "report-list") {
    return (
      <ReportList
        onViewReport={(id) => setChipReportId(id)}
        onCompareReports={(ids) => { if (setReportCompareIds) setReportCompareIds(ids); }}
      />
    );
  }

  const PageComponent = PAGE_COMPONENTS[currentPage] || Dashboard;
  if (currentPage === "plans") {
    return <PlanList onOpenMonitor={(id) => setPlanMonitorId(id)} />;
  }
  if (currentPage === "chips") {
    return (
      <ChipList
        onOpenProfile={(id) => setChipProfileId(id)}
        onCompare={(ids) => { setCompareChipIds(ids); setCurrentPage("chip-compare"); }}
      />
    );
  }
  if (currentPage === "nodes") {
    return (
      <NodeList
        onOpenDetail={(id) => { if (setNodeDetailId) setNodeDetailId(id); }}
      />
    );
  }
  return <PageComponent />;
}
