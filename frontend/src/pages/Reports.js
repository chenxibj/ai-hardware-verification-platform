/**
 * @file Reports.js
 * @description 评测报告查看与管理 — 增强版
 * Issue: #169 US-2.1
 * 
 * 增强功能：
 * - 报告列表：编号/计划/芯片/评分/完成率/状态/时间
 * - 筛选：按芯片/状态/时间过滤
 * - 操作：[查看] [归档] [删除（软删除）]
 * - 报告版本趋势图：同芯片多报告时评分折线图
 */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Card, Table, Tag, Space, Button, Row, Col, Select, Tabs, Descriptions,
  Modal, message, Tooltip, Badge, Progress, Statistic, Divider, Empty,
  Spin, Radio, DatePicker, Typography, Drawer, Alert, Popconfirm, Input,
} from "antd";
import {
  BarChartOutlined, LineChartOutlined, RadarChartOutlined,
  DownloadOutlined, EyeOutlined, FileTextOutlined,
  ReloadOutlined, FilterOutlined, ExperimentOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  DesktopOutlined, InfoCircleOutlined, ShareAltOutlined,
  PrinterOutlined, InboxOutlined, DeleteOutlined,
  FolderOpenOutlined, UndoOutlined,
} from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import api from "../utils/api";
import dayjs from "dayjs";

const { Text, Title, Paragraph } = Typography;
const { RangePicker } = DatePicker;

/* ── 常量 ── */
const CHART_COLORS = ["#1890ff","#52c41a","#722ed1","#fa8c16","#eb2f96","#13c2c2","#faad14","#2f54eb","#a0d911","#f5222d"];

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "草稿" },
  { value: "PUBLISHED", label: "已发布" },
];

/* ── 维度名映射 ── */
const DIM_CN = {
  compute: "计算性能", memory: "访存性能", op_compat: "数学函数",
  attention: "Attention", op_compat: "归一化", inference: "模型推理",
};

/* ── 版本趋势图 ── */
const buildVersionTrendChart = (trendData) => {
  if (!trendData || trendData.length < 2) return null;
  const labels = trendData.map((r, i) => r.reportNo || `v${i + 1}`);
  const scores = trendData.map(r => r.overallScore || 0);
  const times = trendData.map(r => r.createdAt ? dayjs(r.createdAt).format("MM-DD HH:mm") : "");
  return {
    title: { text: "评分版本趋势", left: "center", textStyle: { fontSize: 14 } },
    tooltip: {
      trigger: "axis",
      formatter: (params) => {
        const idx = params[0].dataIndex;
        return `<b>${labels[idx]}</b><br/>时间: ${times[idx]}<br/>评分: ${params[0].value}`;
      }
    },
    xAxis: {
      type: "category",
      data: labels,
      axisLabel: { rotate: labels.length > 5 ? 30 : 0, fontSize: 10 },
    },
    yAxis: { type: "value", name: "评分", min: 0, max: 100 },
    series: [{
      type: "line",
      data: scores,
      smooth: true,
      symbol: "circle",
      symbolSize: 8,
      lineStyle: { width: 3, color: "#1890ff" },
      areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(24,144,255,0.3)" }, { offset: 1, color: "rgba(24,144,255,0.02)" }] } },
      itemStyle: { color: "#1890ff" },
      label: { show: true, position: "top", fontSize: 11, formatter: "{c}" },
      markLine: {
        silent: true,
        data: [{ type: "average", name: "平均" }],
        lineStyle: { color: "#fa8c16", type: "dashed" },
        label: { formatter: "avg: {c}" },
      },
    }],
    grid: { bottom: 60, left: 50, right: 20, top: 50 },
  };
};

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reportStats, setReportStats] = useState({});
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportDetail, setReportDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // 筛选状态
  const [chipFilter, setChipFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const [archivedFilter, setArchivedFilter] = useState(null);
  const [dateRange, setDateRange] = useState(null);

  // 芯片列表用于下拉
  const [chipOptions, setChipOptions] = useState([]);

  // 版本趋势
  const [trendChipId, setTrendChipId] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);

  /* 加载芯片列表 */
  useEffect(() => {
    api.get("/chips", { params: { page: 0, size: 200 } })
      .then(res => {
        if (res.data?.code === 0) {
          const chips = res.data.data || [];
          setChipOptions(chips.map(c => ({ value: c.id, label: c.name })));
        }
      })
      .catch(() => {});
  }, []);

  /* 获取报告列表 */
  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, size: pageSize };
      if (chipFilter) params.chipId = chipFilter;
      if (statusFilter) params.status = statusFilter;
      if (archivedFilter != null) params.archived = archivedFilter;
      if (dateRange && dateRange[0]) params.startTime = dateRange[0].startOf("day").toISOString();
      if (dateRange && dateRange[1]) params.endTime = dateRange[1].endOf("day").toISOString();
      const r = await api.get("/chip-reports", { params });
      if (r.data?.code === 0) {
        setReports(r.data.data || []);
        setTotal(r.data.total || 0);
      }
    } catch (e) { message.error("获取报告列表失败"); }
    finally { setLoading(false); }
  }, [page, pageSize, chipFilter, statusFilter, archivedFilter, dateRange]);

  const fetchStats = useCallback(async () => {
    try {
      const r = await api.get("/chip-reports/stats");
      if (r.data?.code === 0) setReportStats(r.data.data || {});
    } catch (e) {}
  }, []);

  useEffect(() => { fetchReports(); fetchStats(); }, [fetchReports, fetchStats]);

  /* 版本趋势加载 */
  const fetchTrend = useCallback(async (chipId) => {
    if (!chipId) { setTrendData([]); return; }
    setTrendLoading(true);
    try {
      const r = await api.get(`/chip-reports/trend/${chipId}`);
      if (r.data?.code === 0) setTrendData(r.data.data || []);
    } catch (e) { message.error("获取趋势数据失败"); }
    finally { setTrendLoading(false); }
  }, []);

  useEffect(() => { if (trendChipId) fetchTrend(trendChipId); }, [trendChipId, fetchTrend]);

  /* 归档操作 */
  const handleArchive = async (id) => {
    try {
      const r = await api.post(`/chip-reports/${id}/archive`);
      if (r.data?.code === 0) {
        message.success(r.data.data?.archived ? "已归档" : "已取消归档");
        fetchReports();
        fetchStats();
      }
    } catch (e) { message.error("操作失败"); }
  };

  /* 软删除 */
  const handleDelete = async (id) => {
    try {
      const r = await api.delete(`/chip-reports/${id}`);
      if (r.data?.code === 0) {
        message.success("已删除");
        fetchReports();
        fetchStats();
      }
    } catch (e) { message.error("删除失败"); }
  };

  /* 查看详情 */
  const openDetail = (record) => {
    setSelectedReport(record);
    setDetailVisible(true);
    setReportDetail(null);
    setDetailLoading(true);
    api.get(`/chip-reports/${record.id}`)
      .then(r => {
        if (r.data?.code === 0) {
          const d = r.data.data;
          // Parse JSON fields
          ["dimensionScores", "radarData", "operatorRanking", "scenarioRecommendations"].forEach(key => {
            if (d[key] && typeof d[key] === "string") {
              try { d[key] = JSON.parse(d[key]); } catch (_) {}
            }
          });
          setReportDetail(d);
        }
      })
      .catch(() => message.error("获取详情失败"))
      .finally(() => setDetailLoading(false));
  };

  /* 重置筛选 */
  const resetFilters = () => {
    setChipFilter(null);
    setStatusFilter(null);
    setArchivedFilter(null);
    setDateRange(null);
    setPage(0);
  };

  /* 获取芯片名 */
  const getChipName = (chipId) => {
    const c = chipOptions.find(o => o.value === chipId);
    return c ? c.label : `芯片#${chipId}`;
  };

  /* 表格列定义 */
  const columns = [
    {
      title: "报告编号", dataIndex: "reportNo", width: 170, ellipsis: true,
      render: (v) => <Text copyable={{ text: v }} style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: "芯片", dataIndex: "chipId", width: 120,
      render: (v) => <Tag color="blue">{getChipName(v)}</Tag>,
    },
    {
      title: "评分", dataIndex: "overallScore", width: 90, align: "center",
      render: (v) => v != null ? (
        <Text style={{ color: v >= 80 ? "#52c41a" : v >= 60 ? "#1890ff" : "#fa8c16", fontWeight: "bold", fontSize: 16 }}>
          {v.toFixed(1)}
        </Text>
      ) : <Text type="secondary">-</Text>,
      sorter: (a, b) => (a.overallScore || 0) - (b.overallScore || 0),
    },
    {
      title: "状态", dataIndex: "status", width: 90, align: "center",
      render: (v) => {
        const map = { PUBLISHED: { s: "success", t: "已发布" }, DRAFT: { s: "default", t: "草稿" } };
        const cfg = map[v] || { s: "default", t: v || "-" };
        return <Badge status={cfg.s} text={cfg.t} />;
      },
    },
    {
      title: "归档", dataIndex: "archived", width: 70, align: "center",
      render: (v) => v ? <Tag color="orange">已归档</Tag> : null,
    },
    {
      title: "创建时间", dataIndex: "createdAt", width: 160,
      render: (v) => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-",
      sorter: (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0),
    },
    {
      title: "操作", key: "action", width: 240, fixed: "right",
      render: (_, r) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)}>查看</Button>
          <Tooltip title={r.archived ? "取消归档" : "归档"}>
            <Button type="link" size="small"
              icon={r.archived ? <UndoOutlined /> : <InboxOutlined />}
              onClick={() => handleArchive(r.id)}
            >
              {r.archived ? "取消归档" : "归档"}
            </Button>
          </Tooltip>
          <Popconfirm title="确定删除此报告？" description="删除后可在回收站恢复" onConfirm={() => handleDelete(r.id)} okText="删除" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /* 渲染详情 Drawer 内容 */
  const renderDetail = () => {
    if (!reportDetail) return <Empty description="未获取到数据" />;
    const dimScores = typeof reportDetail.dimensionScores === "object" ? reportDetail.dimensionScores : {};
    const operators = Array.isArray(reportDetail.operatorRanking) ? reportDetail.operatorRanking : [];
    const recommendations = typeof reportDetail.scenarioRecommendations === "object" ? reportDetail.scenarioRecommendations : {};

    return (
      <Tabs defaultActiveKey="overview" items={[
        {
          key: "overview", label: <span><FileTextOutlined /> 概览</span>,
          children: (
            <div>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Card size="small" style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 36, fontWeight: "bold", color: (reportDetail.overallScore||0) >= 80 ? "#52c41a" : (reportDetail.overallScore||0) >= 60 ? "#1890ff" : "#fa8c16" }}>
                      {reportDetail.overallScore != null ? reportDetail.overallScore.toFixed(1) : "-"}
                    </div>
                    <Text type="secondary">综合评分</Text>
                  </Card>
                </Col>
                <Col span={6}><Card size="small"><Statistic title="芯片" value={getChipName(reportDetail.chipId)} /></Card></Col>
                <Col span={6}><Card size="small"><Statistic title="状态" value={reportDetail.status === "PUBLISHED" ? "已发布" : "草稿"} /></Card></Col>
                <Col span={6}><Card size="small"><Statistic title="创建时间" value={reportDetail.createdAt ? dayjs(reportDetail.createdAt).format("MM-DD HH:mm") : "-"} /></Card></Col>
              </Row>
              <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
                <Descriptions.Item label="报告编号"><Text copyable>{reportDetail.reportNo}</Text></Descriptions.Item>
                <Descriptions.Item label="任务ID">{reportDetail.planId || "-"}</Descriptions.Item>
                <Descriptions.Item label="瓶颈分析" span={2}>
                  <Paragraph ellipsis={{ rows: 3, expandable: true }}>{reportDetail.bottleneckAnalysis || "暂无"}</Paragraph>
                </Descriptions.Item>
              </Descriptions>
            </div>
          ),
        },
        {
          key: "dimensions", label: <span><RadarChartOutlined /> 维度评分</span>,
          children: (
            <div>
              {Object.keys(dimScores).length > 0 ? (
                <Table
                  size="small"
                  dataSource={Object.entries(DIM_CN).map(([k, v]) => ({
                    key: k, dimension: v, score: dimScores[k] || 0,
                  }))}
                  columns={[
                    { title: "维度", dataIndex: "dimension", width: 150 },
                    { title: "评分", dataIndex: "score", width: 100, align: "center",
                      render: v => <Text style={{ fontWeight: "bold", color: v >= 80 ? "#52c41a" : v >= 60 ? "#1890ff" : "#fa8c16" }}>{v.toFixed(1)}</Text> },
                    { title: "进度", dataIndex: "score", key: "progress", render: v => <Progress percent={v} size="small" strokeColor={v >= 80 ? "#52c41a" : v >= 60 ? "#1890ff" : "#fa8c16"} /> },
                  ]}
                  pagination={false}
                />
              ) : <Empty description="暂无维度评分数据" />}
            </div>
          ),
        },
        {
          key: "operators", label: <span><ExperimentOutlined /> 算子排行</span>,
          children: (
            <div>
              {operators.length > 0 ? (
                <Table
                  size="small"
                  dataSource={operators.map((o, i) => ({ ...o, key: i }))}
                  columns={[
                    { title: "#", width: 50, render: (_, __, i) => i + 1 },
                    { title: "测试项", dataIndex: "testItem", width: 150, render: v => <Text strong>{v}</Text> },
                    { title: "评分", dataIndex: "score", width: 90, align: "center",
                      render: v => v != null ? <Text style={{ fontWeight: "bold", color: v >= 80 ? "#52c41a" : "#fa8c16" }}>{v.toFixed(1)}</Text> : "-" },
                    { title: "通过", dataIndex: "passed", width: 70, align: "center",
                      render: v => v ? <Tag color="green">通过</Tag> : <Tag color="red">失败</Tag> },
                    { title: "延迟(ms)", dataIndex: "latencyMean", width: 100, align: "right",
                      render: v => v != null ? v.toFixed(2) : "-",
                      sorter: (a, b) => (a.latencyMean || 0) - (b.latencyMean || 0) },
                  ]}
                  pagination={operators.length > 20 ? { pageSize: 20 } : false}
                />
              ) : <Empty description="暂无算子排行数据" />}
            </div>
          ),
        },
      ]} />
    );
  };

  /* 趋势图选项 */
  const trendChart = buildVersionTrendChart(trendData);

  return (
    <Spin spinning={loading}>
      <div>
        {/* 统计卡片 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          {[
            ["报告总数", reportStats.total || 0, <FileTextOutlined />, "#1890ff"],
            ["已发布", reportStats.published || 0, <CheckCircleOutlined />, "#52c41a"],
            ["草稿", reportStats.draft || 0, <ClockCircleOutlined />, "#fa8c16"],
            ["已归档", reportStats.archived || 0, <InboxOutlined />, "#722ed1"],
          ].map(([t, v, icon, color], i) => (
            <Col xs={24} sm={12} md={6} key={i}>
              <Card size="small" hoverable>
                <Statistic title={t} value={v} prefix={React.cloneElement(icon, { style: { color } })} valueStyle={{ color }} />
              </Card>
            </Col>
          ))}
        </Row>

        {/* 筛选栏 */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={[16, 12]} align="middle">
            <Col>
              <Space>
                <FilterOutlined />
                <Text strong>筛选</Text>
              </Space>
            </Col>
            <Col>
              <Select
                placeholder="选择芯片"
                allowClear
                style={{ width: 180 }}
                value={chipFilter}
                onChange={v => { setChipFilter(v); setPage(0); }}
                options={chipOptions}
                showSearch
                optionFilterProp="label"
              />
            </Col>
            <Col>
              <Select
                placeholder="状态"
                allowClear
                style={{ width: 120 }}
                value={statusFilter}
                onChange={v => { setStatusFilter(v); setPage(0); }}
                options={STATUS_OPTIONS}
              />
            </Col>
            <Col>
              <Select
                placeholder="归档"
                allowClear
                style={{ width: 120 }}
                value={archivedFilter}
                onChange={v => { setArchivedFilter(v); setPage(0); }}
                options={[{ value: true, label: "已归档" }, { value: false, label: "未归档" }]}
              />
            </Col>
            <Col>
              <RangePicker
                value={dateRange}
                onChange={v => { setDateRange(v); setPage(0); }}
                style={{ width: 260 }}
              />
            </Col>
            <Col>
              <Button onClick={resetFilters}>重置</Button>
            </Col>
            <Col>
              <Button icon={<ReloadOutlined />} onClick={() => { fetchReports(); fetchStats(); }}>刷新</Button>
            </Col>
          </Row>
        </Card>

        {/* 版本趋势图 */}
        <Card
          size="small"
          title={<span><LineChartOutlined style={{ marginRight: 8 }} />报告版本趋势</span>}
          style={{ marginBottom: 16 }}
          extra={
            <Select
              placeholder="选择芯片查看趋势"
              allowClear
              style={{ width: 200 }}
              value={trendChipId}
              onChange={setTrendChipId}
              options={chipOptions}
              showSearch
              optionFilterProp="label"
            />
          }
        >
          {trendLoading ? <Spin /> : trendChart ? (
            <ReactECharts option={trendChart} style={{ height: 300 }} />
          ) : (
            <Empty description={trendChipId ? "该芯片报告少于2份，无法显示趋势" : "请选择芯片查看评分趋势"} style={{ padding: 40 }} />
          )}
        </Card>

        {/* 报告列表 */}
        <Card
          title="评测报告列表"
          size="small"
        >
          <Table
            columns={columns}
            dataSource={reports}
            rowKey="id"
            loading={loading}
            size="small"
            scroll={{ x: "max-content" }}
            pagination={{
              current: page + 1,
              pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: ["10", "20", "50"],
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, ps) => { setPage(p - 1); setPageSize(ps); },
            }}
          />
        </Card>

        {/* 详情 Drawer */}
        <Drawer
          title={
            <Space>
              <FileTextOutlined />
              <span>报告详情</span>
              {reportDetail && <Tag color="blue">{reportDetail.reportNo}</Tag>}
            </Space>
          }
          open={detailVisible}
          onClose={() => { setDetailVisible(false); setReportDetail(null); }}
          width={900}
          extra={
            <Space>
              <Button icon={<DownloadOutlined />} type="primary" onClick={() => message.info("请使用报告导出页面导出PDF")}>导出</Button>
            </Space>
          }
        >
          {detailLoading ? (
            <div style={{ textAlign: "center", marginTop: 100 }}><Spin size="large" tip="加载中..." /></div>
          ) : renderDetail()}
        </Drawer>
      </div>
    </Spin>
  );
}
