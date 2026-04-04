/**
 * @file Leaderboard.js
 * @description 评测榜单页面 — Tab切换5种榜单 (#177 US-3.1)
 */
import React, { useState, useEffect } from "react";
import { Card, Table, Tabs, Tag, Space, Typography, Spin, message, Button, Tooltip } from "antd";
import {
  TrophyOutlined, ThunderboltOutlined, RocketOutlined,
  DashboardOutlined, CheckCircleOutlined, EyeOutlined,
  CrownOutlined, StarOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";

const { Text, Title } = Typography;

const LEADERBOARD_TYPES = [
  { key: "overall", label: "综合榜", icon: <TrophyOutlined />, metric: "综合评分", unit: "分" },
  { key: "compute", label: "算力榜", icon: <ThunderboltOutlined />, metric: "FP16 算力", unit: "TFLOPS" },
  { key: "inference", label: "推理榜", icon: <RocketOutlined />, metric: "推理QPS", unit: "QPS" },
  { key: "efficiency", label: "能效榜", icon: <DashboardOutlined />, metric: "能效比", unit: "TFLOPS/W" },
  { key: "compatibility", label: "兼容性榜", icon: <CheckCircleOutlined />, metric: "精度通过率", unit: "%" },
];

const CHIP_TYPE_COLORS = { GPU: "blue", NPU: "green", TPU: "orange", CPU: "default", OTHER: "purple" };

const RANK_ICONS = {
  1: <CrownOutlined style={{ color: "#faad14", fontSize: 18 }} />,
  2: <CrownOutlined style={{ color: "#bfbfbf", fontSize: 16 }} />,
  3: <CrownOutlined style={{ color: "#cd7f32", fontSize: 16 }} />,
};

export default function Leaderboard({ onViewReport }) {
  const [type, setType] = useState("overall");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLeaderboard = async (t) => {
    setLoading(true);
    try {
      const r = await api.get("/community/leaderboard", { params: { type: t } });
      if (r.data.code === 0) {
        setData((r.data.data || []).map((item, idx) => ({ ...item, rank: idx + 1 })));
      }
    } catch (e) {
      message.error("获取榜单数据失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLeaderboard(type); }, [type]);

  const currentType = LEADERBOARD_TYPES.find(t => t.key === type);

  const columns = [
    {
      title: "排名",
      dataIndex: "rank",
      width: 80,
      align: "center",
      render: (rank) => (
        <Space>
          {RANK_ICONS[rank] || <Text type="secondary" strong>#{rank}</Text>}
          {rank <= 3 && <Text strong style={{ color: rank === 1 ? "#faad14" : rank === 2 ? "#bfbfbf" : "#cd7f32" }}>#{rank}</Text>}
        </Space>
      ),
    },
    {
      title: "芯片名称",
      dataIndex: "chipName",
      render: (name, record) => (
        <Space>
          <Text strong>{name}</Text>
          {record.rank === 1 && <StarOutlined style={{ color: "#faad14" }} />}
        </Space>
      ),
    },
    {
      title: "厂商",
      dataIndex: "manufacturer",
      width: 120,
    },
    {
      title: "类型",
      dataIndex: "chipType",
      width: 80,
      render: (t) => <Tag color={CHIP_TYPE_COLORS[t] || "default"}>{t}</Tag>,
    },
    {
      title: currentType?.metric || "核心指标",
      dataIndex: "metricValue",
      width: 150,
      align: "right",
      sorter: (a, b) => (a.metricValue || 0) - (b.metricValue || 0),
      defaultSortOrder: "descend",
      render: (val) => (
        <Text strong style={{ color: "#1890ff", fontSize: 15 }}>
          {val != null ? (typeof val === "number" ? val.toFixed(2) : val) : "N/A"}
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>{currentType?.unit}</Text>
        </Text>
      ),
    },
    {
      title: "综合评分",
      dataIndex: "overallScore",
      width: 100,
      align: "center",
      render: (score) => score != null ? (
        <Tag color={score >= 80 ? "green" : score >= 60 ? "blue" : "orange"}>{score.toFixed(1)}</Tag>
      ) : "-",
    },
    {
      title: "评测日期",
      dataIndex: "evaluatedAt",
      width: 120,
      render: (d) => d ? dayjs(d).format("YYYY-MM-DD") : "-",
    },
    {
      title: "操作",
      width: 100,
      align: "center",
      render: (_, record) => (
        <Tooltip title="查看报告详情">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => onViewReport && onViewReport(record.reportId)}
          >
            详情
          </Button>
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      <Card>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <Title level={3} style={{ margin: 0 }}>
            <TrophyOutlined style={{ color: "#faad14", marginRight: 8 }} />
            评测榜单
          </Title>
          <Text type="secondary">基于公开评测报告，180天内数据</Text>
        </div>

        <Tabs
          activeKey={type}
          onChange={setType}
          centered
          items={LEADERBOARD_TYPES.map(t => ({
            key: t.key,
            label: (
              <span>{t.icon} {t.label}</span>
            ),
          }))}
        />

        <Spin spinning={loading}>
          <Table
            dataSource={data}
            columns={columns}
            rowKey={(record) => record.reportId || record.chipId || record.rank}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            size="middle"
            rowClassName={(record) => record.rank <= 3 ? "leaderboard-top3" : ""}
          />
        </Spin>
      </Card>

      <style>{`
        .leaderboard-top3 { background: linear-gradient(90deg, #fffbe6 0%, #fff 50%) !important; }
        .leaderboard-top3:hover td { background: #fffbe6 !important; }
      `}</style>
    </div>
  );
}
