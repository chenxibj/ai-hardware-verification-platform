/**
 * @file App.js
 * @description 应用入口 — React Router 驱动
 * @feat #423 前端路由架构改造
 */
import React, { Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Spin } from "antd";
// #426: api import removed (notifications/count endpoint not available)
import useAuthStore from "./stores/useAuthStore";
// #426: notification store import removed (endpoint not available)
import Login from "./pages/Login";
import MainLayout from "./layouts/MainLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import NotFound from "./pages/NotFound";
import { routeConfig, flattenRoutes } from "./config/routes";

function App() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // #426: /api/notifications/count endpoint not available yet — skip to avoid 404
  // When the backend implements the endpoint, re-enable this block.
  // useEffect(() => { ... fetch notification count ... }, [isAuthenticated]);

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
