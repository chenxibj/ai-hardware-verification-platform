/**
 * @file App.js
 * @description 应用入口
 * @feat #136, #137, #164 taskResultId, #167 nodeDetailId, #169 #170 报告管理
 */
import React, { useState, useEffect } from "react";
import api from "./utils/api";
import useAuthStore from "./stores/useAuthStore";
import useNotificationStore from "./stores/useNotificationStore";
import Login from "./pages/Login";
import MainLayout from "./layouts/MainLayout";
import AppRoutes from "./routes/AppRoutes";
import HelpPanel from "./components/HelpPanel";

function App() {
  const user = useAuthStore(s => s.user);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const setUnreadCount = useNotificationStore(s => s.setUnreadCount);
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [planMonitorId, setPlanMonitorId] = useState(null);
  const [chipReportId, setChipReportId] = useState(null);
  const [chipProfileId, setChipProfileId] = useState(null);
  const [compareChipIds, setCompareChipIds] = useState([]);
  const [taskResultId, setTaskResultId] = useState(null);
  const [nodeDetailId, setNodeDetailId] = useState(null);
  const [reportCompareIds, setReportCompareIds] = useState([]);

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
