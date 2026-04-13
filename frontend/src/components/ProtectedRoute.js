/**
 * @file ProtectedRoute.js
 * @description 路由守卫 — 根据用户角色控制页面访问
 * @feat #423 前端路由架构改造
 */
import React from "react";
import { Result, Button } from "antd";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../stores/useAuthStore";

export default function ProtectedRoute({ roles, children }) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  if (roles && roles.length > 0 && !roles.includes(user?.role)) {
    return (
      <Result
        status="403"
        title="无访问权限"
        subTitle={`当前角色「${user?.role || "未知"}」无权访问此页面`}
        extra={
          <Button type="primary" onClick={() => navigate("/")}>
            返回首页
          </Button>
        }
      />
    );
  }

  return children;
}
