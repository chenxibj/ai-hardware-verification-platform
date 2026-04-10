/**
 * @file MainLayout.js
 * @description 主布局组件：侧边栏+顶栏+面包屑+内容区+Footer
 * @refactor #181 导航重组+响应式+Header增强
 */
import React, { useState, useEffect } from "react";
import {
  Layout, Menu, Button, Badge, Dropdown, Typography, Breadcrumb, Avatar, Space,
} from "antd";
import {
  DashboardOutlined, ExperimentOutlined, ClusterOutlined, SettingOutlined,
  BellOutlined, UserOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  UnorderedListOutlined, AppstoreOutlined, FileSearchOutlined,
  CloudServerOutlined, DatabaseOutlined, FundProjectionScreenOutlined,
  TeamOutlined, TrophyOutlined, CloudDownloadOutlined, LockOutlined,
  ProfileOutlined, SwapOutlined, PlusCircleOutlined,
  AuditOutlined, DollarOutlined, StarOutlined,
  SafetyCertificateOutlined, ApiOutlined, RocketOutlined, BellOutlined as BellFilledOutlined,
  RestOutlined, CloudUploadOutlined, PieChartOutlined, CheckCircleOutlined,
} from "@ant-design/icons";
import useAuthStore from "../stores/useAuthStore";
import useNotificationStore from "../stores/useNotificationStore";
import logoSvg from "../assets/logo.svg";

const { Header, Sider, Content, Footer } = Layout;
const { Text } = Typography;

const PAGE_TITLES = {
  dashboard: "工作台",
  chips: "芯片管理",
  "chip-compare": "芯片对比",
  "template-list": "评测模板",
  plans: "评测任务",
  "plans-create": "创建评测任务",
  "report-list": "评测报告",
  nodes: "节点管理",
  "resource-pools": "资源池管理",
  "resource-monitor": "资源监控",
  assets: "数字资产",
  "asset-validation": "资产校验",
  "asset-recycle-bin": "回收站",
  "asset-backup": "备份管理",
  "storage-monitor": "存储监控",
  leaderboard: "评测榜单",
  "community-resources": "资源下载",
  users: "用户管理",
  tenants: "租户管理",
  alerts: "告警管理",
  "alert-config": "告警配置",
  "self-healing": "自愈策略",
  "resource-onboard": "资源纳管",
  audit: "操作审计",
  forum: "论坛",
  "demand-board": "需求对接",
  community: "社区首页",
  "user-points": "我的积分",
  "user-preferences": "偏好设置",
  "scheduler-config": "调度配置",
  billing: "计费管理",
  workflows: "流程编排",
  tasks: "评测任务",
  resources: "计算资源",
  settings: "系统设置",
};

const BREADCRUMB_MAP = {
  dashboard: [{ title: "首页" }],
  chips: [{ title: "评测中心" }, { title: "芯片管理" }],
  "chip-compare": [{ title: "评测中心" }, { title: "芯片对比" }],
  "template-list": [{ title: "评测中心" }, { title: "评测模板" }],
  plans: [{ title: "评测中心" }, { title: "评测任务" }],
  "plans-create": [{ title: "评测中心" }, { title: "创建任务" }],
  "report-list": [{ title: "评测中心" }, { title: "评测报告" }],
  nodes: [{ title: "资源管理" }, { title: "节点管理" }],
  "resource-pools": [{ title: "资源管理" }, { title: "资源池" }],
  "resource-monitor": [{ title: "资源管理" }, { title: "资源监控" }],
  assets: [{ title: "数字资产" }],
  "asset-validation": [{ title: "数字资产" }, { title: "资产校验" }],
  "asset-recycle-bin": [{ title: "数字资产" }, { title: "回收站" }],
  "asset-backup": [{ title: "数字资产" }, { title: "备份管理" }],
  "storage-monitor": [{ title: "数字资产" }, { title: "存储监控" }],
  alerts: [{ title: "资源管理" }, { title: "告警管理" }],
  "alert-config": [{ title: "资源管理" }, { title: "告警配置" }],
  "self-healing": [{ title: "资源管理" }, { title: "自愈策略" }],
  "resource-onboard": [{ title: "资源管理" }, { title: "资源纳管" }],
  leaderboard: [{ title: "社区" }, { title: "评测榜单" }],
  "community-resources": [{ title: "社区" }, { title: "资源下载" }],
  users: [{ title: "系统设置" }, { title: "用户管理" }],
  tenants: [{ title: "系统设置" }, { title: "租户管理" }],
};

const PARENT_MAP = {
  dashboard: null,
  chips: "eval-center", "chip-compare": "eval-center",
  "template-list": "eval-center", plans: "eval-center",
  "plans-create": "eval-center", "report-list": "eval-center",
  nodes: "resource-mgmt", "resource-pools": "resource-mgmt",
  "resource-monitor": "resource-mgmt", assets: "asset-mgmt",
  "asset-validation": "asset-mgmt", "asset-recycle-bin": "asset-mgmt",
  "asset-backup": "asset-mgmt", "storage-monitor": "asset-mgmt",
  alerts: "resource-mgmt",
  "alert-config": "resource-mgmt",
  "self-healing": "resource-mgmt",
  "resource-onboard": "resource-mgmt",
  leaderboard: "community-hub", "community-resources": "community-hub",
  community: "community-hub", forum: "community-hub", "demand-board": "community-hub",
  users: "sys-settings", tenants: "sys-settings",
  audit: "sys-settings", "scheduler-config": "sys-settings",
  billing: "sys-settings", workflows: "sys-settings",
  "user-points": "user-center", "user-preferences": "user-center",
};

const menuItems = [
  {
    key: "dashboard",
    icon: <DashboardOutlined />,
    label: "Dashboard",
  },
  {
    key: "eval-center",
    icon: <ExperimentOutlined />,
    label: "评测中心",
    children: [
      { key: "chips", icon: <UnorderedListOutlined />, label: "芯片管理" },
      { key: "template-list", icon: <AppstoreOutlined />, label: "评测模板" },
      { key: "plans", icon: <FileSearchOutlined />, label: "评测任务" },
      { key: "report-list", icon: <ProfileOutlined />, label: "评测报告" },
    ],
  },
  {
    key: "asset-mgmt",
    icon: <DatabaseOutlined />,
    label: "数字资产",
    children: [
      { key: "assets", icon: <DatabaseOutlined />, label: "资产列表" },
      { key: "asset-validation", icon: <CheckCircleOutlined />, label: "资产校验" },
      { key: "asset-recycle-bin", icon: <RestOutlined />, label: "回收站" },
      { key: "asset-backup", icon: <CloudUploadOutlined />, label: "备份管理" },
      { key: "storage-monitor", icon: <PieChartOutlined />, label: "存储监控" },
    ],
  },
  {
    key: "resource-mgmt",
    icon: <ClusterOutlined />,
    label: "资源管理",
    children: [
      { key: "nodes", icon: <ClusterOutlined />, label: "节点管理" },
      { key: "resource-pools", icon: <CloudServerOutlined />, label: "资源池管理" },
      { key: "resource-onboard", icon: <RocketOutlined />, label: "资源纳管" },
      { type: "divider" },
      { key: "resource-monitor", icon: <FundProjectionScreenOutlined />, label: "资源监控" },
      { key: "alert-config", icon: <BellFilledOutlined />, label: "告警配置" },
      { key: "self-healing", icon: <SafetyCertificateOutlined />, label: "自愈策略" },
    ],
  },
  {
    key: "community-hub",
    icon: <TeamOutlined />,
    label: "社区",
    children: [
      { key: "leaderboard", icon: <TrophyOutlined />, label: "评测榜单" },
      { key: "community-resources", icon: <CloudDownloadOutlined />, label: "资源下载" },
    ],
  },
  {
    key: "sys-settings",
    icon: <SettingOutlined />,
    label: "系统设置",
    children: [
      { key: "users", icon: <TeamOutlined />, label: "用户管理" },
      { key: "tenants", icon: <TeamOutlined />, label: "租户管理" },
    ],
  },
];

export default function MainLayout({ currentPage, setCurrentPage, children, chipProfileId, planMonitorId, taskResultId, nodeDetailId, reportCompareIds }) {
  const [collapsed, setCollapsed] = useState(false);
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const notifCount = useNotificationStore(s => s.unreadCount);

  /* #312: Hide admin-only menu items for non-admin users */
  const isAdmin = ["ADMIN","SUPER_ADMIN","admin","super_admin"].includes(user?.role);
  const filteredMenuItems = isAdmin ? menuItems : menuItems.filter(m => m.key !== "sys-settings");

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
      else if (key === "user-preferences") setCurrentPage("user-preferences");
    },
  };

  const getDefaultOpenKeys = () => {
    const parent = PARENT_MAP[currentPage];
    return parent ? [parent] : [];
  };

  /* #331: Dynamic breadcrumb for third-level pages */
  const getBreadcrumbItems = () => {
    if (chipProfileId) {
      return [{ title: "评测中心" }, { title: "芯片管理" }, { title: "芯片详情" }];
    }
    if (planMonitorId) {
      return [{ title: "评测中心" }, { title: "评测任务" }, { title: "任务监控" }];
    }
    if (taskResultId) {
      return [{ title: "评测中心" }, { title: "评测任务" }, { title: "任务结果" }];
    }
    if (nodeDetailId) {
      return [{ title: "资源管理" }, { title: "节点管理" }, { title: "节点详情" }];
    }
    if (reportCompareIds && reportCompareIds.length >= 2) {
      return [{ title: "评测中心" }, { title: "评测报告" }, { title: "报告对比" }];
    }
    return BREADCRUMB_MAP[currentPage] || [{ title: PAGE_TITLES[currentPage] || "工作台" }];
  };
  const breadcrumbItems = getBreadcrumbItems();

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
            : <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><img src={logoSvg} alt="logo" style={{ width: 24, height: 24 }} /><strong style={{ background: 'linear-gradient(135deg, #4FC3F7, #7C4DFF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: 13, letterSpacing: 1 }}>AI软硬件验证</strong></span>
          }
        </div>
        <Menu
          mode="inline"
          selectedKeys={[currentPage]}
          defaultOpenKeys={getDefaultOpenKeys()}
          items={filteredMenuItems}
          onClick={({ key }) => setCurrentPage(key)}
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
          人工智能软硬件验证平台 v1.0.0 ©2026 上海人工智能实验室
        </Footer>
      </Layout>
    </Layout>
  );
}
