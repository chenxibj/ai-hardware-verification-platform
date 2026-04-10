/**
 * @file ResourceOnboard.js
 * @description 资源纳管页面 — Tabs 布局（节点注册 + 集群纳管）
 * @feat 资源管理模块重设计
 */
import React, { useState } from "react";
import { Card, Tabs, Typography, Space } from "antd";
import { RocketOutlined, CloudServerOutlined, ClusterOutlined } from "@ant-design/icons";
import NodeRegisterTab from "../components/resource/NodeRegisterTab";
import ClusterOnboardTab from "../components/resource/ClusterOnboardTab";

const { Title } = Typography;

export default function ResourceOnboard({ onBack }) {
  const [activeTab, setActiveTab] = useState("node-register");

  const tabItems = [
    {
      key: "node-register",
      label: (
        <Space><CloudServerOutlined />节点注册</Space>
      ),
      children: <NodeRegisterTab />,
    },
    {
      key: "cluster-onboard",
      label: (
        <Space><ClusterOutlined />集群纳管</Space>
      ),
      children: <ClusterOnboardTab onNavigateToNodes={() => onBack && onBack()} />,
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <Space>
          <RocketOutlined style={{ fontSize: 20, color: "#1890ff" }} />
          <Title level={4} style={{ margin: 0 }}>资源纳管</Title>
        </Space>
      </div>
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="large"
        />
      </Card>
    </div>
  );
}
