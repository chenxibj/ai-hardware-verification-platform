/**
 * @file AssetStatsBar.js
 * @description 统计卡片行 — 展示各类资产数量，点击可快速筛选
 */
import React from "react";
import { Row, Col, Card, Statistic } from "antd";
import {
  DatabaseOutlined, ExperimentOutlined, CodeOutlined,
  FileTextOutlined, AppstoreOutlined,
} from "@ant-design/icons";

export default function AssetStatsBar({ stats, onCategoryClick }) {
  const items = [
    { key: "total",      title: "总资产",  value: stats.total,      icon: <DatabaseOutlined />,   color: undefined,  category: "all" },
    { key: "models",     title: "模型",    value: stats.models,     icon: <ExperimentOutlined />, color: "#1890ff",  category: "MODEL" },
    { key: "datasets",   title: "数据集",  value: stats.datasets,   icon: <DatabaseOutlined />,   color: "#52c41a",  category: "DATASET" },
    { key: "scripts",    title: "脚本",    value: stats.scripts,    icon: <CodeOutlined />,       color: "#722ed1",  category: "SCRIPT" },
    { key: "configs",    title: "配置",    value: stats.configs,    icon: <FileTextOutlined />,   color: undefined,  category: null },
    { key: "benchmarks", title: "基准",    value: stats.benchmarks, icon: <AppstoreOutlined />,   color: undefined,  category: null },
  ];

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
      {items.map((it) => (
        <Col key={it.key} xs={12} sm={8} md={6} lg={4}>
          <Card
            hoverable
            size="small"
            onClick={() => it.category && onCategoryClick(it.category)}
            style={{ cursor: it.category ? "pointer" : "default" }}
          >
            <Statistic
              title={it.title}
              value={Number(it.value) || 0}
              prefix={it.icon}
              valueStyle={it.color ? { color: it.color } : undefined}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
}
