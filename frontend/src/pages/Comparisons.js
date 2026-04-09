/**
 * @file Comparisons.js
 * @description 评测报告对比分析页面 — 选择报告 + 展示对比结果
 *
 * 两阶段 UI:
 *   Phase 1: 从 /api/chip-reports 加载报告列表，用户勾选 2-5 份
 *   Phase 2: 调用 /api/chip-reports/compare?ids=x,y 展示对比结果
 *
 * 也支持通过 props.initialReportIds 直接进入对比模式（从报告列表页跳转）
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Table, Tag, Button, Space, Row, Col, Typography, message, Spin, Badge,
} from "antd";
import {
  SwapOutlined, ArrowLeftOutlined, ReloadOutlined,
  StarFilled, FileTextOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import ReportCompare from "./ReportCompare";

const { Title, Text } = Typography;

/** 最多同时对比 5 份报告 */
const MAX_COMPARE = 5;
/** 最少 2 份才能对比 */
const MIN_COMPARE = 2;

/** 评分颜色 */
function scoreColor(score) {
  if (score >= 80) return "#52c41a";
  if (score >= 60) return "#1890ff";
  if (score >= 40) return "#faad14";
  return "#ff4d4f";
}

/** 星级渲染 */
function renderStars(score) {
  const count = score >= 90 ? 5 : score >= 80 ? 4 : score >= 70 ? 3 : score >= 60 ? 2 : 1;
  return Array.from({ length: 5 }, (_, i) => (
    <StarFilled
      key={i}
      style={{ color: i < count ? "#fadb14" : "#e8e8e8", fontSize: 13, marginRight: 1 }}
    />
  ));
}

export default function Comparisons({ initialReportIds, onBack }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(initialReportIds || []);
  const [chipMap, setChipMap] = useState({});
  /* 当 selectedIds 被确认且 ≥2 时，进入对比视图 */
  const [comparing, setComparing] = useState(
    Array.isArray(initialReportIds) && initialReportIds.length >= MIN_COMPARE
  );

  /** 加载报告列表 + 芯片名称 */
  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/chip-reports", { params: { page: 0, size: 100 } });
      if (res.data?.code === 0) {
        const list = res.data.data || [];
        setReports(list);

        /* 批量获取芯片名 */
        const chipIds = [...new Set(list.map((r) => r.chipId).filter(Boolean))];
        const newMap = { ...chipMap };
        await Promise.all(
          chipIds
            .filter((id) => !newMap[id])
            .map((id) =>
              api.get("/chips/" + id)
                .then((cr) => {
                  if (cr.data?.code === 0) {
                    newMap[id] = cr.data.data?.name || "芯片#" + id;
                  }
                })
                .catch(() => { newMap[id] = "芯片#" + id; })
            )
        );
        setChipMap(newMap);
      } else {
        message.error(res.data?.message || "加载报告列表失败");
      }
    } catch {
      message.error("加载报告列表失败");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchReports(); }, [fetchReports]);

  /** 多选变化回调 — 限制上限 */
  const handleSelectionChange = (keys) => {
    if (keys.length > MAX_COMPARE) {
      message.warning(`最多选择 ${MAX_COMPARE} 份报告`);
      return;
    }
    setSelectedIds(keys);
  };

  /** 点击"开始对比" */
  const handleStartCompare = () => {
    if (selectedIds.length < MIN_COMPARE) {
      message.warning(`请至少选择 ${MIN_COMPARE} 份报告`);
      return;
    }
    setComparing(true);
  };

  /** 从对比结果返回选择视图 */
  const handleBackToSelect = () => {
    setComparing(false);
  };

  /** 完全返回上一页 */
  const handleFullBack = () => {
    if (onBack) {
      onBack();
    } else {
      setComparing(false);
    }
  };

  /* ── 对比结果视图 ── */
  if (comparing && selectedIds.length >= MIN_COMPARE) {
    return (
      <ReportCompare
        reportIds={selectedIds}
        onBack={onBack ? handleFullBack : handleBackToSelect}
      />
    );
  }

  /* ── 报告选择视图 ── */
  const columns = [
    {
      title: "报告编号",
      dataIndex: "reportNo",
      key: "reportNo",
      width: 180,
      render: (text) => (
        <Space>
          <FileTextOutlined style={{ color: "#1890ff" }} />
          <Text strong>{text}</Text>
        </Space>
      ),
    },
    {
      title: "芯片",
      key: "chipName",
      width: 140,
      render: (_, r) => chipMap[r.chipId] || "芯片#" + r.chipId,
    },
    {
      title: "综合评分",
      dataIndex: "overallScore",
      key: "overallScore",
      width: 110,
      align: "center",
      sorter: (a, b) => (a.overallScore || 0) - (b.overallScore || 0),
      render: (v) => (
        <span style={{ fontSize: 18, fontWeight: "bold", color: scoreColor(v || 0) }}>
          {(v || 0).toFixed(1)}
        </span>
      ),
    },
    {
      title: "评级",
      key: "grade",
      width: 120,
      align: "center",
      render: (_, r) => renderStars(r.overallScore || 0),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 90,
      align: "center",
      render: (s) => {
        const map = { PUBLISHED: { t: "已完成", c: "success" }, DRAFT: { t: "草稿", c: "default" } };
        const cfg = map[s] || { t: s, c: "default" };
        return <Tag color={cfg.c}>{cfg.t}</Tag>;
      },
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      sorter: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      render: (t) => (t ? new Date(t).toLocaleString("zh-CN") : "-"),
    },
  ];

  const isCompareEnabled = selectedIds.length >= MIN_COMPARE;

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            {onBack && (
              <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
                返回
              </Button>
            )}
          </Col>
          <Col flex="auto">
            <Title level={4} style={{ margin: 0 }}>
              <SwapOutlined /> 评测报告对比分析
            </Title>
            <Text type="secondary">
              勾选 {MIN_COMPARE}-{MAX_COMPARE} 份报告，点击"开始对比"查看多维度对比结果
            </Text>
          </Col>
          <Col>
            <Space>
              <Badge count={selectedIds.length} size="small">
                <Button
                  type="primary"
                  icon={<SwapOutlined />}
                  disabled={!isCompareEnabled}
                  onClick={handleStartCompare}
                >
                  开始对比 {selectedIds.length > 0 ? `(${selectedIds.length})` : ""}
                </Button>
              </Badge>
              <Button icon={<ReloadOutlined />} onClick={fetchReports}>
                刷新
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card>
        <Spin spinning={loading}>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={reports}
            scroll={{ x: 900 }}
            rowSelection={{
              selectedRowKeys: selectedIds,
              onChange: handleSelectionChange,
            }}
            pagination={{
              pageSize: 15,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 份报告`,
            }}
          />
        </Spin>
      </Card>
    </div>
  );
}
