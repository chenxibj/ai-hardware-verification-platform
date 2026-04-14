/**
 * @file Leaderboard.js
 * @description 评测榜单页面 (#177) — 排行榜表格+筛选+排序+Top3特殊样式
 */
import React, { useState, useEffect } from "react";
import {
  Card, Table, Tag, Space, Typography, Spin, message, Button, Tooltip,
  Select, Progress, Row, Col, Statistic,
} from "antd";
import {
  TrophyOutlined, ThunderboltOutlined, RocketOutlined,
  DashboardOutlined, EyeOutlined, CrownOutlined, StarFilled,
  FilterOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";

const { Text, Title } = Typography;

const CHIP_TYPE_OPTIONS = [
  { value: "ALL", label: "全部类型" },
  { value: "CPU", label: "CPU" },
  { value: "GPU", label: "GPU" },
  { value: "NPU", label: "NPU" },
  { value: "TPU", label: "TPU" },
];

const SORT_OPTIONS = [
  { value: "overall", label: "综合评分" },
  { value: "compute", label: "计算性能" },
  { value: "inference", label: "模型推理" },
];

const CHIP_TYPE_COLORS = { GPU: "blue", NPU: "green", TPU: "orange", CPU: "cyan", OTHER: "purple" };

const RANK_MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

const TOP3_BG = {
  1: "linear-gradient(90deg, #fff9e6 0%, #fff 60%)",
  2: "linear-gradient(90deg, #f5f5f5 0%, #fff 60%)",
  3: "linear-gradient(90deg, #fef3e8 0%, #fff 60%)",
};

function scoreGrade(score) {
  if (score >= 120) return { stars: 5, text: "远超基准", color: "#52c41a" };
  if (score >= 100) return { stars: 4, text: "达到基准", color: "#52c41a" };
  if (score >= 80) return { stars: 3, text: "接近基准", color: "#faad14" };
  if (score >= 60) return { stars: 2, text: "低于基准", color: "#faad14" };
  return { stars: 1, text: "显著落后", color: "#ff4d4f" };
}

function renderStars(count) {
  return Array.from({ length: 5 }, (_, i) => (
    <StarFilled key={i} style={{ color: i < count ? "#faad14" : "#e8e8e8", fontSize: 14 }} />
  ));
}

export default function Leaderboard() {
  const navigate = useNavigate();
  const [sortType, setSortType] = useState("overall");
  const [chipTypeFilter, setChipTypeFilter] = useState("ALL");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLeaderboard = async (type) => {
    setLoading(true);
    try {
      const r = await api.get("/community/leaderboard", { params: { type } });
      if (r.data.code === 0) {
        setData((r.data.data || []).map((item, idx) => ({ ...item, rank: idx + 1 })));
      }
    } catch (e) {
      message.error("获取榜单数据失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLeaderboard(sortType); }, [sortType]);

  const filtered = chipTypeFilter === "ALL"
    ? data
    : data.filter(d => d.chipType === chipTypeFilter).map((d, idx) => ({ ...d, rank: idx + 1 }));

  const topCount = Math.min(3, filtered.length);

  const columns = [
    {
      title: "排名",
      dataIndex: "rank",
      width: 80,
      align: "center",
      render: (rank) => (
        <span style={{ fontSize: rank <= 3 ? 22 : 15, fontWeight: rank <= 3 ? 700 : 400 }}>
          {RANK_MEDALS[rank] || <Text type="secondary">#{rank}</Text>}
        </span>
      ),
    },
    {
      title: "芯片名称",
      dataIndex: "chipName",
      render: (name, record) => (
        <Space>
          <Text strong style={{ fontSize: record.rank <= 3 ? 15 : 14 }}>{name}</Text>
          {record.rank === 1 && <CrownOutlined style={{ color: "#faad14" }} />}
        </Space>
      ),
    },
    {
      title: "厂商",
      dataIndex: "manufacturer",
      width: 130,
    },
    {
      title: "类型",
      dataIndex: "chipType",
      width: 90,
      render: (t) => <Tag color={CHIP_TYPE_COLORS[t] || "default"}>{t}</Tag>,
    },
    {
      title: "综合评分",
      dataIndex: "overallScore",
      width: 200,
      render: (score) => {
        if (score == null) return "-";
        const pct = Math.min(score, 100);
        const color = score >= 100 ? "#52c41a" : score >= 80 ? "#faad14" : "#ff4d4f";
        return (
          <Space style={{ width: "100%" }}>
            <Progress
              percent={pct}
              size="small"
              strokeColor={color}
              format={() => <Text strong style={{ color }}>{score.toFixed(1)}</Text>}
              style={{ width: 130, marginBottom: 0 }}
            />
          </Space>
        );
      },
    },
    {
      title: "评级",
      width: 130,
      align: "center",
      render: (_, record) => {
        if (record.overallScore == null) return "-";
        const grade = scoreGrade(record.overallScore);
        return (
          <Tooltip title={grade.text}>
            <span>{renderStars(grade.stars)}</span>
          </Tooltip>
        );
      },
    },
    {
      title: "评测日期",
      dataIndex: "evaluatedAt",
      width: 110,
      render: (d) => d ? dayjs(d).format("YYYY-MM-DD") : "-",
    },
    {
      title: "操作",
      width: 100,
      align: "center",
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/reports/${record.reportId}`)}
        >
          查看报告
        </Button>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <Card style={{ marginBottom: 16 }}>
        <Row align="middle" justify="space-between">
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              <TrophyOutlined style={{ color: "#faad14", marginRight: 8 }} />
              评测榜单
            </Title>
            <Text type="secondary">基于公开评测报告数据，实时排名</Text>
          </Col>
          <Col>
            <Row gutter={16}>
              <Col>
                <Statistic title="参评芯片" value={data.length} prefix={<DashboardOutlined />} />
              </Col>
              <Col>
                <Statistic title="最高评分" value={data.length > 0 ? (data[0]?.overallScore || 0).toFixed(1) : "N/A"} prefix={<TrophyOutlined style={{ color: "#faad14" }} />} />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <FilterOutlined />
          <Text strong>筛选：</Text>
          <Select
            value={chipTypeFilter}
            onChange={setChipTypeFilter}
            options={CHIP_TYPE_OPTIONS}
            style={{ width: 130 }}
          />
          <Text strong style={{ marginLeft: 16 }}>排序：</Text>
          <Select
            value={sortType}
            onChange={setSortType}
            options={SORT_OPTIONS}
            style={{ width: 140 }}
          />
        </Space>
      </Card>

      {/* Table */}
      <Card>
        <Spin spinning={loading}>
          <Table
            dataSource={filtered}
            columns={columns}
            rowKey={(record) => record.reportId || record.chipId || record.rank}
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
            size="middle"
            rowClassName={(record) => record.rank <= 3 ? `leaderboard-rank-${record.rank}` : ""}
          />
        </Spin>
      </Card>

      <style>{`
        .leaderboard-rank-1 td { background: ${TOP3_BG[1]} !important; }
        .leaderboard-rank-1:hover td { background: #fff9e6 !important; }
        .leaderboard-rank-2 td { background: ${TOP3_BG[2]} !important; }
        .leaderboard-rank-2:hover td { background: #f5f5f5 !important; }
        .leaderboard-rank-3 td { background: ${TOP3_BG[3]} !important; }
        .leaderboard-rank-3:hover td { background: #fef3e8 !important; }
      `}</style>
    </div>
  );
}
