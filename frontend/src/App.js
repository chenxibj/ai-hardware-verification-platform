import React, { useState, useEffect } from "react";
import { Layout, Menu, Button, Badge, Dropdown, Avatar, Typography, Spin } from "antd";
import {
  DashboardOutlined, ProjectOutlined, ApartmentOutlined, FileTextOutlined,
  DiffOutlined, FileSearchOutlined, DatabaseOutlined, CloudServerOutlined,
  CommentOutlined, TeamOutlined, AuditOutlined, SettingOutlined,
  BellOutlined, UserOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  LogoutOutlined, AppstoreOutlined,
} from "@ant-design/icons";
import api from "./utils/api";
import useAuthStore from "./stores/useAuthStore";
import useNotificationStore from "./stores/useNotificationStore";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import Templates from "./pages/Templates";
import Workflows from "./pages/Workflows";
import Reports from "./pages/Reports";
import Comparisons from "./pages/Comparisons";
import Logs from "./pages/Logs";
import Assets from "./pages/Assets";
import Resources from "./pages/Resources";
import Community from "./pages/Community";
import Users from "./pages/Users";
import AuditLogs from "./pages/AuditLogs";
import Settings from "./pages/Settings";

const { Header, Sider, Content, Footer } = Layout;
const { Text } = Typography;

const PAGE_TITLES = {
  dashboard: "工作台", tasks: "评测任务管理", templates: "评测模板管理", workflows: "评测编排工作流",
  reports: "评测报告管理", comparisons: "报告对比分析", logs: "评测日志",
  assets: "数字资产管理", resources: "计算资源管理", community: "验证平台社区",
  users: "用户管理", audit: "操作审计", settings: "系统设置",
};

const PAGE_COMPONENTS = {
  dashboard: Dashboard, tasks: Tasks, templates: Templates, workflows: Workflows, reports: Reports,
  comparisons: Comparisons, logs: Logs, assets: Assets, resources: Resources,
  community: Community, users: Users, audit: AuditLogs, settings: Settings,
};

const menuItems = [
  { key: "dashboard", icon: <DashboardOutlined />, label: "工作台" },
  { type: "divider" },
  { key: "g1", label: "评测管理", type: "group", children: [
    { key: "tasks", icon: <ProjectOutlined />, label: "评测任务" },
    { key: "templates", icon: <AppstoreOutlined />, label: "评测模板" },
    { key: "workflows", icon: <ApartmentOutlined />, label: "评测编排" },
    { key: "reports", icon: <FileTextOutlined />, label: "评测报告" },
    { key: "comparisons", icon: <DiffOutlined />, label: "报告对比" },
    { key: "logs", icon: <FileSearchOutlined />, label: "评测日志" },
  ]},
  { key: "g2", label: "资源管理", type: "group", children: [
    { key: "assets", icon: <DatabaseOutlined />, label: "数字资产" },
    { key: "resources", icon: <CloudServerOutlined />, label: "计算资源" },
  ]},
  { key: "g3", label: "社区与系统", type: "group", children: [
    { key: "community", icon: <CommentOutlined />, label: "社区" },
    { key: "users", icon: <TeamOutlined />, label: "用户管理" },
    { key: "audit", icon: <AuditOutlined />, label: "操作审计" },
    { key: "settings", icon: <SettingOutlined />, label: "系统设置" },
  ]},
];

function App() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const notifCount = useNotificationStore((s) => s.unreadCount);
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);

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

  const handleLogout = () => {
    logout();
  };

  if (!isAuthenticated || !user) return <Login />;

  const PageComponent = PAGE_COMPONENTS[currentPage] || Dashboard;

  const userMenu = {
    items: [
      { key: "role", label: `角色: ${({ADMIN:"管理员",USER:"普通用户",REVIEWER:"审核员",OPERATOR:"运维"})[user.role] || user.role}`, disabled: true },
      { type: "divider" },
      { key: "logout", icon: <LogoutOutlined />, label: "退出登录", danger: true },
    ],
    onClick: ({ key }) => { if (key === "logout") handleLogout(); },
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="light"
        style={{ borderRight: "1px solid #f0f0f0" }} width={220}>
        <div style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "center",
          borderBottom: "1px solid #f0f0f0", fontWeight: "bold", fontSize: collapsed ? 14 : 16 }}>
          {collapsed ? "AI" : <strong>AI软硬件验证平台</strong>}
        </div>
        <Menu mode="inline" selectedKeys={[currentPage]} items={menuItems}
          onClick={({ key }) => setCurrentPage(key)} style={{ borderRight: 0 }} />
      </Sider>
      <Layout>
        <Header style={{ background: "#fff", padding: "0 24px", display: "flex",
          alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #f0f0f0" }}>
          <strong style={{ fontSize: 16 }}>{PAGE_TITLES[currentPage] || "工作台"}</strong>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Badge count={notifCount} size="small">
              <Button type="text" icon={<BellOutlined />} />
            </Badge>
            <Dropdown menu={userMenu}>
              <Button type="text" icon={<UserOutlined />}>{user.username}</Button>
            </Dropdown>
          </div>
        </Header>
        <Content style={{ margin: 16, padding: 24, background: "#fff", borderRadius: 8, minHeight: 280, overflow: "auto" }}>
          <PageComponent />
        </Content>
        <Footer style={{ textAlign: "center", padding: "12px 50px", color: "#999" }}>
          人工智能软硬件验证平台 v1.0.0 ©2026 上海人工智能实验室
        </Footer>
      </Layout>
    </Layout>
  );
}

export default App;
