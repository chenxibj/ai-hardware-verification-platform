/**
 * @file App.js
 * @description 应用入口
 * @feat #136, #137, #164 taskResultId
 */
import React, { useState, useEffect } from "react";
import api from "./utils/api";
import useAuthStore from "./stores/useAuthStore";
import useNotificationStore from "./stores/useNotificationStore";
import Login from "./pages/Login";
import MainLayout from "./layouts/MainLayout";
import AppRoutes from "./routes/AppRoutes";

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
    setCurrentPage(page);
  };

  if (!isAuthenticated || !user) return <Login />;

  const getActiveNav = () => {
    if (currentPage === "chip-compare") return "chips";
    if (chipProfileId) return "chips";
    if (chipReportId) return "reports";
    if (planMonitorId) return "plans";
    if (taskResultId) return "plans";
    return currentPage;
  };

  return (
    <MainLayout currentPage={getActiveNav()} setCurrentPage={handleSetCurrentPage}>
      <AppRoutes
        currentPage={currentPage}
        planMonitorId={planMonitorId}
        chipReportId={chipReportId}
        chipProfileId={chipProfileId}
        compareChipIds={compareChipIds}
        taskResultId={taskResultId}
        setCurrentPage={setCurrentPage}
        setPlanMonitorId={setPlanMonitorId}
        setChipReportId={setChipReportId}
        setChipProfileId={setChipProfileId}
        setCompareChipIds={setCompareChipIds}
        setTaskResultId={setTaskResultId}
      />
    </MainLayout>
  );
}

export default App;
