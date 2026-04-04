/**
 * @file MainLayout.js
 * @description 主布局组件：侧边栏 + 顶栏 + 内容区 + Footer
 * @refactor #128 导航结构重组 - 从13模块精简为4+1导航
 * @feat #161 新增模板浏览导航入口
 */
import React, { useState } from "react";
import { Layout, Menu, Button, Badge, Dropdown, Typography } from "antd";
import {
  DashboardOutlined, ExperimentOutlined, FileSearchOutlined,
  ClusterOutlined, SettingOutlined,
  BellOutlined, UserOutlined, LogoutOutlined,
  UnorderedListOutlined, SwapOutlined, PlusCircleOutlined,
  TeamOutlined, AuditOutlined, AppstoreOutlined,
} from "@ant-design/icons";
import useAuthStore from "../stores/useAuthStore";
import useNotificationStore from "../stores/useNotificationStore";

const { Header, Sider, Content, Footer } = Layout;

const PAGE_TITLES = {
  // 主导航 4+1
  dashboard: "工作台",
  chips: "芯片列表",
  "chip-compare": "芯片对比",
  plans: "评测计划列表",
  "plans-create": "创建评测计划",
  "template-list": "评测模板",
  nodes: "节点管理",
  users: "用户管理",
  audit: "操作审计",
  // 内部跳转页面（不在侧边栏显示）
  tasks: "评测任务",
  resources: "计算资源",
  settings: "系统设置",
};

const menuItems = [
  {
    key: "dashboard",
    icon: <DashboardOutlined />,
    label: "工作台",
  },
  {
    key: "chip-mgmt",
    icon: <ExperimentOutlined />,
    label: "芯片管理",
    children: [
      { key: "chips", icon: <UnorderedListOutlined />, label: "芯片列表" },
      { key: "chip-compare", icon: <SwapOutlined />, label: "芯片对比" },
    ],
  },
  {
    key: "plan-mgmt",
    icon: <FileSearchOutlined />,
    label: "评测计划",
    children: [
      { key: "plans", icon: <UnorderedListOutlined />, label: "计划列表" },
      { key: "plans-create", icon: <PlusCircleOutlined />, label: "创建计划" },
      { key: "template-list", icon: <AppstoreOutlined />, label: "评测模板" },
    ],
  },
  {
    key: "nodes",
    icon: <ClusterOutlined />,
    label: "节点管理",
  },
  {
    key: "sys-mgmt",
    icon: <SettingOutlined />,
    label: "系统设置",
    children: [
      { key: "users", icon: <TeamOutlined />, label: "用户管理" },
      { key: "audit", icon: <AuditOutlined />, label: "操作审计" },
    ],
  },
];

export default function MainLayout({ currentPage, setCurrentPage, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const notifCount = useNotificationStore(s => s.unreadCount);

  const userMenu = {
    items: [
      { key: "role", label: `角色: ${({ ADMIN: "管理员", USER: "普通用户", REVIEWER: "审核员", OPERATOR: "运维" })[user.role] || user.role}`, disabled: true },
      { type: "divider" },
      { key: "logout", icon: <LogoutOutlined />, label: "退出登录", danger: true },
    ],
    onClick: ({ key }) => { if (key === "logout") logout(); },
  };

  /* 计算 SubMenu 的 openKeys，让当前页的父菜单自动展开 */
  const getDefaultOpenKeys = () => {
    const parentMap = {
      chips: "chip-mgmt", "chip-compare": "chip-mgmt",
      plans: "plan-mgmt", "plans-create": "plan-mgmt", "template-list": "plan-mgmt",
      users: "sys-mgmt", audit: "sys-mgmt",
    };
    const parent = parentMap[currentPage];
    return parent ? [parent] : [];
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="light"
        breakpoint="lg" collapsedWidth="80"
        onBreakpoint={broken => setCollapsed(broken)}
        style={{ borderRight: "1px solid #f0f0f0" }} width={220}>
        <div style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "center",
          borderBottom: "1px solid #f0f0f0", fontWeight: "bold", fontSize: collapsed ? 14 : 16 }}>
          {collapsed ? "AI" : <strong>AI软硬件验证平台</strong>}
        </div>
        <Menu mode="inline" selectedKeys={[currentPage]}
          defaultOpenKeys={getDefaultOpenKeys()}
          items={menuItems}
          onClick={({ key }) => setCurrentPage(key)}
          style={{ borderRight: 0 }} />
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
          {children}
        </Content>
        <Footer style={{ textAlign: "center", padding: "12px 50px", color: "#999" }}>
          人工智能软硬件验证平台 v1.0.0 ©2026 上海人工智能实验室
        </Footer>
      </Layout>
    </Layout>
  );
}
