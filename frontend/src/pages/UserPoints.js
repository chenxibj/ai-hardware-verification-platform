import React, { useState, useEffect } from "react";
import { Card, Row, Col, Statistic, Table, Tag, Progress } from "antd";
import { TrophyOutlined, StarOutlined, RiseOutlined } from "@ant-design/icons";
import api from "../utils/api";
const LEVELS = [
  { min: 0, name: "新手", color: "#999" },
  { min: 100, name: "初级", color: "#1890ff" },
  { min: 500, name: "中级", color: "#52c41a" },
  { min: 2000, name: "高级", color: "#fa8c16" },
  { min: 5000, name: "专家", color: "#f5222d" },
];
const getLevel = (pts) => { for (let i = LEVELS.length - 1; i >= 0; i--) { if (pts >= LEVELS[i].min) return LEVELS[i]; } return LEVELS[0]; };
export default function UserPoints() {
  const [data, setData] = useState({ total: 0, records: [] });
  useEffect(() => {
    api.get("/api/v1/users/me/points").then(r => setData(r.data?.data || { total: 0, records: [] })).catch(() => {});
  }, []);
  const level = getLevel(data.total);
  const nextIdx = LEVELS.indexOf(level) + 1;
  const nextLevel = nextIdx < LEVELS.length ? LEVELS[nextIdx] : null;
  const columns = [
    { title: "时间", dataIndex: "createdAt", width: 160 },
    { title: "类型", dataIndex: "type", width: 120, render: v => <Tag>{v}</Tag> },
    { title: "变动", dataIndex: "amount", width: 80, render: v => <span style={{ color: v > 0 ? "#52c41a" : "#f5222d" }}>{v > 0 ? "+" : ""}{v}</span> },
    { title: "说明", dataIndex: "description" },
  ];
  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}><Card><Statistic title="积分总数" value={data.total} prefix={<StarOutlined />} valueStyle={{ color: level.color }} /></Card></Col>
        <Col span={8}><Card><Statistic title="当前等级" value={level.name} prefix={<TrophyOutlined />} valueStyle={{ color: level.color }} /></Card></Col>
        <Col span={8}><Card>
          <Statistic title="距下一级" value={nextLevel ? nextLevel.min - data.total : "已满级"} prefix={<RiseOutlined />} />
          {nextLevel && <Progress percent={Math.round(((data.total - level.min) / (nextLevel.min - level.min)) * 100)} size="small" />}
        </Card></Col>
      </Row>
      <Card title="积分记录"><Table dataSource={data.records} columns={columns} rowKey="id" /></Card>
    </div>
  );
}
