/**
 * @file App.js
 * @description 应用入口 — React Router 驱动
 * @feat #423 前端路由架构改造
 */
import React, { Suspense, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { Spin } from "antd";
import api from "./utils/api";
import useAuthStore from "./stores/useAuthStore";
import useNotificationStore from "./stores/useNotificationStore";
import Login from "./pages/Login";
import MainLayout from "./layouts/MainLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import NotFound from "./pages/NotFound";
import { routeConfig, flattenRoutes } from "./config/routes";

function App() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);

  useEffect(() => {
    if (isAuthenticated) {
      api
        .get("/notifications/count")
        .then((r) => {
          if (r.data && r.data.code === 0) {
            const d = r.data.data;
            setUnreadCount(typeof d === "number" ? d : (d && d.unread) || 0);
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated, setUnreadCount]);

  if (!isAuthenticated || !user) return <Login />;

  const routes = flattenRoutes(routeConfig);

  return (
    <MainLayout>
      <Suspense
        fallback={
          <Spin size="large" style={{ margin: "20% auto", display: "block" }} />
        }
      >
        <Routes>
          {routes.map((r) => (
            <Route
              key={r.key}
              path={r.path}
              element={
                <ProtectedRoute roles={r.roles}>
                  <div data-testid={r.testId}>
                    <r.component />
                  </div>
                </ProtectedRoute>
              }
            />
          ))}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </MainLayout>
  );
}

export default App;
