/**
 * @file AppRoutes.js
 * @description 页面路由配置
 * @feat #134, #136, #137, #161, #162, #164, #166, #167
 * @feat #172, #174, #175, #176
 * @feat #177, #178, #181 评测榜单+社区资源+导航重组
 * @fix 报告对比: 接线 reportCompareIds → ReportCompare / Comparisons
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
import ResourcePoolList from "../pages/ResourcePoolList";
import AlertPanel from "../pages/AlertPanel";
import TenantList from "../pages/TenantList";
import Assets from "../pages/Assets";
import Users from "../pages/Users";
import Audit from "../pages/Audit";
import ResourceMonitor from "../pages/ResourceMonitor";
import AlertConfig from "../pages/AlertConfig";
import SelfHealing from "../pages/SelfHealing";
import ClusterList from "../pages/ClusterList";
import K8sAgent from "../pages/K8sAgent";
import Leaderboard from "../pages/Leaderboard";
import CommunityResources from "../pages/CommunityResources";
import ReportCompare from "../pages/ReportCompare";
/* 保留旧页面路由 */
import Tasks from "../pages/Tasks";
import Templates from "../pages/Templates";
import Workflows from "../pages/Workflows";
import Reports from "../pages/Reports";
import Comparisons from "../pages/Comparisons";
import Logs from "../pages/Logs";
import Resources from "../pages/Resources";
import Community from "../pages/Community";
import AuditLogs from "../pages/AuditLogs";
import Settings from "../pages/Settings";
import Forum from "../pages/Forum";
import DemandBoard from "../pages/DemandBoard";
import UserPoints from "../pages/UserPoints";
import UserPreferences from "../pages/UserPreferences";
import SchedulerConfig from "../pages/SchedulerConfig";
import Billing from "../pages/Billing";
import ReportList from "../pages/ReportList";

const PAGE_COMPONENTS = {
  dashboard: Dashboard,
  chips: ChipList,
  "chip-compare": ChipCompare,
  plans: PlanList,
  "plans-create": PlanCreate,
  "template-list": TemplateList,
  nodes: NodeList,
  "resource-pools": ResourcePoolList,
  alerts: AlertPanel,
  tenants: TenantList,
  assets: Assets,
  users: Users,
  audit: Audit,
  tasks: Tasks,
  templates: Templates,
  workflows: Workflows,
  reports: Reports,
  comparisons: Comparisons,
  logs: Logs,
  resources: Resources,
  community: Community,
  "audit-logs": AuditLogs,
  "resource-monitor": ResourceMonitor,
  "alert-config": AlertConfig,
  "self-healing": SelfHealing,
  clusters: ClusterList,
  "k8s-agent": K8sAgent,
  settings: Settings,
  forum: Forum,
  "demand-board": DemandBoard,
  "user-points": UserPoints,
  "user-preferences": UserPreferences,
  "scheduler-config": SchedulerConfig,
  billing: Billing,
  "community-resources": CommunityResources,
};

export default function AppRoutes({
  currentPage, planMonitorId, chipReportId, chipProfileId, compareChipIds,
  taskResultId, nodeDetailId, reportCompareIds,
  setCurrentPage, setPlanMonitorId, setChipReportId, setChipProfileId,
  setCompareChipIds, setTaskResultId, setNodeDetailId, setReportCompareIds,
}) {
  /**
   * 从 ReportList / Comparisons 发起的报告对比
   * 当 reportCompareIds 有 ≥2 个 ID 时，直接展示 ReportCompare 结果页
   */
  if (reportCompareIds && reportCompareIds.length >= 2) {
    return (
      <ReportCompare
        reportIds={reportCompareIds}
        onBack={() => {
          setReportCompareIds([]);
          setCurrentPage("report-list");
        }}
      />
    );
  }

  /* 芯片对比页 */
  if (currentPage === "chip-compare") {
    return (
      <ChipCompare
        selectedChipIds={compareChipIds || []}
        onBack={() => { setCompareChipIds([]); setCurrentPage("chips"); }}
      />
    );
  }

  /* 芯片档案页 */
  if (chipProfileId) {
    return (
      <ChipProfile
        chipId={chipProfileId}
        onBack={() => { setChipProfileId(null); setCurrentPage("chips"); }}
        onOpenMonitor={(planId) => { setChipProfileId(null); setPlanMonitorId(planId); }}
        onOpenReport={(planId) => { setChipProfileId(null); setChipReportId(planId); }}
        onCreatePlan={() => { setChipProfileId(null); setCurrentPage("plans-create"); }}
      />
    );
  }

  /* 任务结果页 (#164) */
  if (taskResultId) {
    return (
      <TaskResult
        taskId={taskResultId}
        onBack={() => { if (setTaskResultId) setTaskResultId(null); }}
      />
    );
  }

  /* 芯片报告页 */
  if (chipReportId) {
    return (
      <ChipReport
        reportId={chipReportId}
        onBack={() => { setChipReportId(null); }}
      />
    );
  }

  /* 计划监控页 */
  if (planMonitorId) {
    return (
      <PlanMonitor
        planId={planMonitorId}
        onBack={() => { setPlanMonitorId(null); setCurrentPage("plans"); }}
      />
    );
  }

  /* 节点详情页 (#167, #176) */
  if (nodeDetailId) {
    return (
      <NodeDetail
        nodeId={nodeDetailId}
        onBack={() => { if (setNodeDetailId) setNodeDetailId(null); }}
      />
    );
  }

  /* alerts page */
  if (currentPage === "alerts") {
    return <AlertPanel />;
  }

  /* 评测榜单 (#177) */
  if (currentPage === "leaderboard") {
    return <Leaderboard onViewReport={(reportId) => setChipReportId(reportId)} />;
  }

  /**
   * 评测报告列表 (#169)
   * onCompareReports: 用户勾选多报告后点击"对比分析"，设置 reportCompareIds 触发对比页
   */
  if (currentPage === "report-list") {
    return (
      <ReportList
        onViewReport={(reportId) => setChipReportId(reportId)}
        onCompareReports={(ids) => setReportCompareIds(ids)}
      />
    );
  }

  if (currentPage === "plans") {
    return (
      <PlanList
        onOpenMonitor={(id) => setPlanMonitorId(id)}
        onCreatePlan={() => setCurrentPage("plans-create")}
        onViewReport={(reportId) => setChipReportId(reportId)}
      />
    );
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

  if (currentPage === "plans-create") {
    return (
      <PlanCreate
        onOpenMonitor={(id) => setPlanMonitorId(id)}
        onBack={() => setCurrentPage("plans")}
      />
    );
  }

  const PageComponent = PAGE_COMPONENTS[currentPage] || Dashboard;
  return <PageComponent />;
}
