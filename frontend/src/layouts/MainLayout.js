/**
 * @file MainLayout.js
 * @description 主布局组件：侧边栏+顶栏+面包屑+内容区+Footer
 * @refactor #423 路由改造 — 菜单/面包屑从 routeConfig 生成
 */
import React, { useState } from "react";
import {
  Layout, Menu, Button, Badge, Dropdown, Typography, Breadcrumb, Avatar, Space,
} from "antd";
import {
  DashboardOutlined, UserOutlined, LogoutOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
  BellOutlined, SettingOutlined, LockOutlined,
} from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import useAuthStore from "../stores/useAuthStore";
import useNotificationStore from "../stores/useNotificationStore";
import logoSvg from "../assets/logo.svg";
import {
  routeConfig, generateMenuItems, findActiveKey, findOpenKeys, findBreadcrumb,
} from "../config/routes";

const { Header, Sider, Content, Footer } = Layout;
const { Text } = Typography;

export default function MainLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const notifCount = useNotificationStore((s) => s.unreadCount);
  const location = useLocation();
  const navigate = useNavigate();

  /* 从 routeConfig 生成菜单 */
  const isAdmin = ["ADMIN", "SUPER_ADMIN", "admin", "super_admin"].includes(user?.role);
  const allMenuItems = generateMenuItems(routeConfig);
  const filteredMenuItems = isAdmin
    ? allMenuItems
    : allMenuItems.filter((m) => m.key !== "sys-settings");

  /* 当前路径对应的选中/展开/面包屑 */
  const activeKey = findActiveKey(routeConfig, location.pathname);
  const openKeys = findOpenKeys(routeConfig, location.pathname);
  const breadcrumbItems = findBreadcrumb(routeConfig, location.pathname);

  const userMenu = {
    items: [
      {
        key: "info",
        icon: <UserOutlined />,
        label: `${user.username}`,
        disabled: true,
      },
      {
        key: "role",
        label: `角色: ${({
          ADMIN: "管理员", USER: "普通用户", REVIEWER: "审核员",
          OPERATOR: "运维", SUPER_ADMIN: "超级管理员",
          TENANT_ADMIN: "租户管理员", ENGINEER: "工程师",
        })[user.role] || user.role}`,
        disabled: true,
      },
      { type: "divider" },
      { key: "user-preferences", icon: <SettingOutlined />, label: "个人设置" },
      { key: "change-password", icon: <LockOutlined />, label: "修改密码" },
      { type: "divider" },
      { key: "logout", icon: <LogoutOutlined />, label: "退出登录", danger: true },
    ],
    onClick: ({ key }) => {
      if (key === "logout") logout();
      else if (key === "user-preferences") navigate("/user-preferences");
    },
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        breakpoint="lg"
        collapsedWidth={80}
        onBreakpoint={(broken) => setCollapsed(broken)}
        style={{ borderRight: "1px solid #f0f0f0" }}
        width={220}
        trigger={null}
      >
        <div style={{
          height: 56, display: "flex", alignItems: "center", justifyContent: "center",
          borderBottom: "1px solid #f0f0f0", fontWeight: "bold", fontSize: collapsed ? 14 : 15,
          padding: "0 12px", overflow: "hidden", whiteSpace: "nowrap",
        }}>
          {collapsed
            ? <img src={logoSvg} alt="logo" style={{ width: 28, height: 28 }} />
            : <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <img src={logoSvg} alt="logo" style={{ width: 24, height: 24 }} />
                <strong style={{
                  background: "linear-gradient(135deg, #4FC3F7, #7C4DFF)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  fontSize: 13,
                  letterSpacing: 1,
                }}>AI软硬件验证</strong>
              </span>
          }
        </div>
        <Menu
          mode="inline"
          selectedKeys={[activeKey]}
          defaultOpenKeys={openKeys}
          items={filteredMenuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0, marginTop: 4 }}
        />
      </Sider>
      <Layout>
        <Header style={{
          background: "#fff", padding: "0 24px", display: "flex",
          alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid #f0f0f0", height: 56, lineHeight: "56px",
        }}>
          <Space>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16 }}
            />
            <Breadcrumb
              items={[{ title: <DashboardOutlined /> }, ...breadcrumbItems]}
              style={{ marginLeft: 8 }}
            />
          </Space>
          <Space size={16}>
            <Badge count={notifCount} size="small" offset={[-2, 2]}>
              <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} />
            </Badge>
            <Dropdown menu={userMenu} placement="bottomRight">
              <Space style={{ cursor: "pointer" }}>
                <Avatar size={32} icon={<UserOutlined />} style={{ backgroundColor: "#1890ff" }} />
                <Text style={{ maxWidth: 100 }} ellipsis>{user.username}</Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{
          margin: 16, padding: 24, background: "#fff",
          borderRadius: 8, minHeight: 280, overflow: "auto",
        }}>
          {children}
        </Content>
        <Footer style={{ textAlign: "center", padding: "12px 50px", color: "#999" }}>
          人工智能软硬件验证平台 {process.env.REACT_APP_VERSION || "dev"} ©2026 上海人工智能实验室
        </Footer>
      </Layout>
    </Layout>
  );
}
