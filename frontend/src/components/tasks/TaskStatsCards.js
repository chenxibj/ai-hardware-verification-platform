/**
 * @file TaskStatsCards.js
 * @description 任务统计卡片组件，展示各状态任务数量
 * @param {Object} props
 * @param {Object} props.stats - 统计数据 { total, queued, running, completed, failed, cancelled }
 */
import React from "react";
import { Card, Row, Col, Statistic } from "antd";
import { ProjectOutlined } from "@ant-design/icons";

const STAT_ITEMS = [
  { title: "总任务", key: "total", icon: <ProjectOutlined />, color: null },
  { title: "排队中", key: "queued", icon: null, color: "#faad14" },
  { title: "执行中", key: "running", icon: null, color: "#1890ff" },
  { title: "已完成", key: "completed", icon: null, color: "#52c41a" },
  { title: "失败", key: "failed", icon: null, color: "#ff4d4f" },
  { title: "已取消", key: "cancelled", icon: null, color: null },
];

export default function TaskStatsCards({ stats }) {
  return (
    <Row gutter={16} style={{ marginBottom: 24 }}>
      {STAT_ITEMS.map(({ title, key, icon, color }) => (
        <Col span={4} key={key}>
          <Card hoverable size="small">
            <Statistic
              title={title}
              value={stats[key] || 0}
              prefix={icon}
              valueStyle={color ? { color } : {}}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
}
