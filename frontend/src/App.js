/**
 * @file App.js
 * @description 应用入口
 * @feat #136, #137, #164 taskResultId, #167 nodeDetailId, #169 #170 报告管理
 * @fix #411 URL 路由同步
 */
import React, { useState, useEffect, useCallback } from "react";
import api from "./utils/api";
import useAuthStore from "./stores/useAuthStore";
import useNotificationStore from "./stores/useNotificationStore";
import Login from "./pages/Login";
import MainLayout from "./layouts/MainLayout";
import AppRoutes from "./routes/AppRoutes";
import HelpPanel from "./components/HelpPanel";

/* #411: pathname → page key 映射 */
const PATH_TO_PAGE = {
  "/": "dashboard",
  "/dashboard": "dashboard",
  "/chips": "chips",
  "/chip-compare": "chip-compare",
  "/plans": "plans",
  "/plans-create": "plans-create",
  "/template-list": "template-list",
  "/nodes": "nodes",
  "/resource-pools": "resource-pools",
  "/alerts": "alerts",
  "/tenants": "tenants",
  "/assets": "assets",
  "/users": "users",
  "/audit": "audit",
  "/tasks": "tasks",
  "/templates": "templates",
  "/workflows": "workflows",
  "/reports": "reports",
  "/comparisons": "comparisons",
  "/logs": "logs",
  "/resources": "resources",
  "/community": "community",
  "/audit-logs": "audit-logs",
  "/resource-monitor": "resource-monitor",
  "/alert-config": "alert-config",
  "/self-healing": "self-healing",
  "/resource-onboard": "resource-onboard",
  "/settings": "settings",
  "/forum": "forum",
  "/demand-board": "demand-board",
  "/user-points": "user-points",
  "/user-preferences": "user-preferences",
  "/scheduler-config": "scheduler-config",
  "/billing": "billing",
  "/leaderboard": "leaderboard",
  "/community-resources": "community-resources",
  "/report-list": "report-list",
  "/asset-validation": "asset-validation",
  "/asset-recycle-bin": "asset-recycle-bin",
  "/asset-backup": "asset-backup",
  "/storage-monitor": "storage-monitor",
};

function getPageFromPath() {
  const pathname = window.location.pathname;
  return PATH_TO_PAGE[pathname] || "dashboard";
}

function App() {
  const user = useAuthStore(s => s.user);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const setUnreadCount = useNotificationStore(s => s.setUnreadCount);
  const [currentPage, setCurrentPageRaw] = useState(() => getPageFromPath());
  const [planMonitorId, setPlanMonitorId] = useState(null);
  const [chipReportId, setChipReportId] = useState(null);
  const [chipProfileId, setChipProfileId] = useState(null);
  const [compareChipIds, setCompareChipIds] = useState([]);
  const [taskResultId, setTaskResultId] = useState(null);
  const [nodeDetailId, setNodeDetailId] = useState(null);
  const [reportCompareIds, setReportCompareIds] = useState([]);

  /* #411: Wrap setCurrentPage to also pushState */
  const setCurrentPage = useCallback((page) => {
    setCurrentPageRaw(page);
    const path = page === "dashboard" ? "/" : `/${page}`;
    if (window.location.pathname !== path) {
      window.history.pushState({ page }, "", path);
    }
  }, []);

  /* #411: Listen to popstate for browser back/forward */
  useEffect(() => {
    const onPopState = () => {
      const page = getPageFromPath();
      setCurrentPageRaw(page);
      // Reset sub-page states on navigation
      setPlanMonitorId(null);
      setChipReportId(null);
      setChipProfileId(null);
      setCompareChipIds([]);
      setTaskResultId(null);
      setNodeDetailId(null);
      setReportCompareIds([]);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  /* #171 parse URL query params for share links (?report=X, ?plan=X, ?chip=X) */
  useEffect(() => {
    if (isAuthenticated) {
      const params = new URLSearchParams(window.location.search);
      const reportId = params.get("report");
      const planId = params.get("plan");
      const chipId = params.get("chip");

      if (reportId) {
        setChipReportId(Number(reportId));
        setCurrentPage("chip-report");
        window.history.replaceState({}, "", window.location.pathname);
      } else if (planId) {
        setPlanMonitorId(Number(planId));
        setCurrentPage("plan-monitor");
        window.history.replaceState({}, "", window.location.pathname);
      } else if (chipId) {
        setChipProfileId(Number(chipId));
        setCurrentPage("chip-profile");
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      api.get("/notifications/count").then(r => {
        if (r.data && r.data.code === 0) {
          const d = r.data.data;
          setUnreadCount(typeof d === "number" ? d : (d && d.unread) || 0);
        }
      }).catch(() => {});
    }
  }, [isAuthenticated, currentPage, setUnreadCount]);

  const handleSetCurrentPage = (page) => {
    setPlanMonitorId(null);
    setChipReportId(null);
    setChipProfileId(null);
    setCompareChipIds([]);
    setTaskResultId(null);
    setNodeDetailId(null);
    setReportCompareIds([]);
    setCurrentPage(page);
  };

  if (!isAuthenticated || !user) return <Login />;

  const getActiveNav = () => {
    if (currentPage === "chip-compare") return "chips";
    if (chipProfileId) return "chips";
    if (chipReportId) return "report-list";
    if (reportCompareIds && reportCompareIds.length > 0) return "report-list";
    if (planMonitorId) return "plans";
    if (taskResultId) return "plans";
    if (nodeDetailId) return "nodes";
    return currentPage;
  };

  return (
    <MainLayout
        currentPage={getActiveNav()}
        setCurrentPage={handleSetCurrentPage}
        chipProfileId={chipProfileId}
        planMonitorId={planMonitorId}
        taskResultId={taskResultId}
        nodeDetailId={nodeDetailId}
        reportCompareIds={reportCompareIds}
      >
      <AppRoutes
        currentPage={currentPage}
        planMonitorId={planMonitorId}
        chipReportId={chipReportId}
        chipProfileId={chipProfileId}
        compareChipIds={compareChipIds}
        taskResultId={taskResultId}
        nodeDetailId={nodeDetailId}
        reportCompareIds={reportCompareIds}
        setCurrentPage={setCurrentPage}
        setPlanMonitorId={setPlanMonitorId}
        setChipReportId={setChipReportId}
        setChipProfileId={setChipProfileId}
        setCompareChipIds={setCompareChipIds}
        setTaskResultId={setTaskResultId}
        setNodeDetailId={setNodeDetailId}
        setReportCompareIds={setReportCompareIds}
      />
    </MainLayout>
  );
}

export default App;
