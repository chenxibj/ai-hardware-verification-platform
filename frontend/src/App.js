/**
 * @file App.js
 * @description 应用入口，组合布局和路由
 * @feat #136 添加 chipReportId 状态管理
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

  // 切换页面时清除监控和报告状态
  const handleSetCurrentPage = (page) => {
    setPlanMonitorId(null);
    setChipReportId(null);
    setCurrentPage(page);
  };

  if (!isAuthenticated || !user) return <Login />;

  return (
    <MainLayout currentPage={chipReportId ? "reports" : (planMonitorId ? "plans" : currentPage)} setCurrentPage={handleSetCurrentPage}>
      <AppRoutes
        currentPage={currentPage}
        planMonitorId={planMonitorId}
        chipReportId={chipReportId}
        setCurrentPage={setCurrentPage}
        setPlanMonitorId={setPlanMonitorId}
        setChipReportId={setChipReportId}
      />
    </MainLayout>
  );
}

export default App;
