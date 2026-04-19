/**
 * @file TaskStatsCards.js
 * @description 任务统计卡片组件，展示各状态任务数量
 * @feat #519 异常任务统计卡片（卡顿任务数）
 * @feat #520 排队任务统计
 */
import React from "react";
import { Card, Row, Col, Statistic, Tooltip } from "antd";
import {
  ProjectOutlined, WarningOutlined, ClockCircleOutlined,
} from "@ant-design/icons";

const STAT_ITEMS = [
  { title: "总任务", key: "total", icon: <ProjectOutlined />, color: null },
  { title: "排队中", key: "queued", icon: <ClockCircleOutlined />, color: "#faad14" },
  { title: "执行中", key: "running", icon: null, color: "#1890ff" },
  { title: "已完成", key: "completed", icon: null, color: "#52c41a" },
  { title: "失败", key: "failed", icon: null, color: "#ff4d4f" },
  { title: "卡顿告警", key: "stalled", icon: <WarningOutlined />, color: "#fa8c16",
    tooltip: "运行中任务超过5分钟无进度更新" },
];

export default function TaskStatsCards({ stats }) {
  return (
    <Row gutter={16} style={{ marginBottom: 24 }}>
      {STAT_ITEMS.map(({ title, key, icon, color, tooltip }) => (
        <Col span={4} key={key}>
          <Tooltip title={tooltip} placement="top">
            <Card hoverable size="small"
              style={key === "stalled" && stats[key] > 0 ? {
                borderColor: "#fa8c16",
                background: "linear-gradient(135deg, #fff7e6 0%, #ffe7ba 100%)",
              } : {}}
            >
              <Statistic
                title={title}
                value={stats[key] || 0}
                prefix={icon}
                valueStyle={color ? { color } : {}}
              />
            </Card>
          </Tooltip>
        </Col>
      ))}
    </Row>
  );
}
