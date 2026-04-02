import React, { useState, useEffect } from "react";
import { Card, Row, Col, Statistic, Table, Tag, Badge, Progress, Space, Button, Typography, Timeline, Divider, List, Avatar } from "antd";
import { DashboardOutlined, ProjectOutlined, FileTextOutlined, CloudServerOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, SyncOutlined, RiseOutlined, ThunderboltOutlined, TeamOutlined, DatabaseOutlined, BarChartOutlined, RocketOutlined } from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import api from "../utils/api";
import dayjs from "dayjs";
const { Text, Title } = Typography;

const STATUS_COLORS = { PENDING:"default", QUEUED:"warning", RUNNING:"processing", COMPLETED:"success", FAILED:"error", CANCELLED:"default" };
const STATUS_MAP = { PENDING:"待执行", QUEUED:"排队中", RUNNING:"执行中", COMPLETED:"已完成", FAILED:"失败", CANCELLED:"已取消" };
const EVAL_TYPES = { PERFORMANCE:"性能评测", ACCURACY:"精度评测", COMPATIBILITY:"兼容性评测", STABILITY:"稳定性评测", GENERAL:"通用评测" };

export default function Dashboard() {
  const [taskStats, setTaskStats] = useState({});
  const [reportStats, setReportStats] = useState({});
  const [resourceStats, setResourceStats] = useState({});
  const [recentTasks, setRecentTasks] = useState([]);
  const [recentReports, setRecentReports] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      api.get("/tasks/stats").then(r => r.data.code === 0 && setTaskStats(r.data.data)),
      api.get("/reports/stats").then(r => r.data.code === 0 && setReportStats(r.data.data)),
      api.get("/resources/stats").then(r => r.data.code === 0 && setResourceStats(r.data.data)),
      api.get("/tasks", { params: { size: 8, sortBy: "createdAt", sortDir: "desc" } }).then(r => r.data.code === 0 && setRecentTasks(r.data.data || [])),
      api.get("/reports", { params: { size: 5 } }).then(r => r.data.code === 0 && setRecentReports(r.data.data || [])),
    ]).finally(() => setLoading(false));
  }, []);

  const taskPieOption = {
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    series: [{
      type: "pie", radius: ["45%", "70%"], avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
      data: [
        { value: taskStats.completed || 0, name: "已完成", itemStyle: { color: "#52c41a" } },
        { value: taskStats.running || 0, name: "执行中", itemStyle: { color: "#1890ff" } },
        { value: taskStats.queued || 0, name: "排队中", itemStyle: { color: "#faad14" } },
        { value: taskStats.failed || 0, name: "失败", itemStyle: { color: "#ff4d4f" } },
        { value: taskStats.cancelled || 0, name: "已取消", itemStyle: { color: "#d9d9d9" } },
      ].filter(d => d.value > 0),
      label: { show: true, formatter: "{b}\n{d}%" },
    }],
  };

  const trendOption = {
    tooltip: { trigger: "axis" },
    legend: { data: ["创建任务", "完成任务"], bottom: 0 },
    xAxis: { type: "category", data: Array.from({ length: 7 }, (_, i) => dayjs().subtract(6 - i, "day").format("MM-DD")) },
    yAxis: { type: "value", name: "数量" },
    series: [
      { name: "创建任务", type: "line", smooth: true, data: [3, 5, 2, 8, 4, 6, 3], areaStyle: { opacity: 0.1 }, itemStyle: { color: "#1890ff" } },
      { name: "完成任务", type: "line", smooth: true, data: [2, 4, 1, 6, 3, 5, 2], areaStyle: { opacity: 0.1 }, itemStyle: { color: "#52c41a" } },
    ],
  };

  const columns = [
    { title: "编号", dataIndex: "taskNo", width: 150, ellipsis: true },
    { title: "名称", dataIndex: "name", ellipsis: true },
    { title: "类型", dataIndex: "evalType", width: 90, render: v => <Tag color="blue">{EVAL_TYPES[v] || v}</Tag> },
    { title: "状态", dataIndex: "status", width: 80, render: v => <Badge status={STATUS_COLORS[v]} text={STATUS_MAP[v] || v} /> },
    { title: "进度", dataIndex: "progress", width: 100, render: v => <Progress percent={v || 0} size="small" /> },
    { title: "创建", dataIndex: "createdAt", width: 100, render: v => v ? dayjs(v).format("MM-DD HH:mm") : "-" },
  ];

  return (
    <div>
      {/* 核心指标 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}><Card hoverable><Statistic title="评测任务总数" value={taskStats.total || 0} prefix={<ProjectOutlined style={{ color: "#1890ff" }} />} /></Card></Col>
        <Col span={6}><Card hoverable><Statistic title="执行中" value={taskStats.running || 0} prefix={<SyncOutlined spin style={{ color: "#1890ff" }} />} suffix={<Text type="secondary" style={{ fontSize: 12 }}>/ {taskStats.queued || 0} 排队</Text>} /></Card></Col>
        <Col span={6}><Card hoverable><Statistic title="评测报告" value={reportStats.total || 0} prefix={<FileTextOutlined style={{ color: "#722ed1" }} />} suffix={<Text type="secondary" style={{ fontSize: 12 }}>/ {reportStats.published || 0} 已发布</Text>} /></Card></Col>
        <Col span={6}><Card hoverable><Statistic title="计算资源" value={resourceStats.total || 0} prefix={<CloudServerOutlined style={{ color: "#52c41a" }} />} suffix={<Text type="secondary" style={{ fontSize: 12 }}>/ {resourceStats.online || 0} 在线</Text>} /></Card></Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}><Card size="small" style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "#fff" }}><Statistic title={<span style={{ color: "rgba(255,255,255,0.8)" }}>完成率</span>} value={taskStats.total ? Math.round((taskStats.completed || 0) / taskStats.total * 100) : 0} suffix="%" valueStyle={{ color: "#fff" }} prefix={<CheckCircleOutlined />} /></Card></Col>
        <Col span={6}><Card size="small" style={{ background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)", color: "#fff" }}><Statistic title={<span style={{ color: "rgba(255,255,255,0.8)" }}>失败任务</span>} value={taskStats.failed || 0} valueStyle={{ color: "#fff" }} prefix={<ExclamationCircleOutlined />} /></Card></Col>
        <Col span={6}><Card size="small" style={{ background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)", color: "#fff" }}><Statistic title={<span style={{ color: "rgba(255,255,255,0.8)" }}>平均评分</span>} value={reportStats.avgScore ? Number(reportStats.avgScore).toFixed(1) : "-"} valueStyle={{ color: "#fff" }} prefix={<RiseOutlined />} /></Card></Col>
        <Col span={6}><Card size="small" style={{ background: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)", color: "#fff" }}><Statistic title={<span style={{ color: "rgba(255,255,255,0.8)" }}>今日新增</span>} value={recentTasks.filter(t => dayjs(t.createdAt).isSame(dayjs(), "day")).length} valueStyle={{ color: "#fff" }} prefix={<ThunderboltOutlined />} /></Card></Col>
      </Row>

      {/* 图表 + 最近任务 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={8}><Card title="任务状态分布" size="small"><ReactECharts option={taskPieOption} style={{ height: 260 }} /></Card></Col>
        <Col span={16}><Card title="近7天任务趋势" size="small"><ReactECharts option={trendOption} style={{ height: 260 }} /></Card></Col>
      </Row>

      {/* 最近任务 + 最近报告 */}
      <Row gutter={[16, 16]}>
        <Col span={16}>
          <Card title="最近评测任务" size="small" extra={<Button type="link" size="small">查看全部</Button>}>
            <Table columns={columns} dataSource={recentTasks} rowKey="id" size="small" pagination={false} loading={loading} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="最近报告" size="small" extra={<Button type="link" size="small">查看全部</Button>}>
            <List size="small" dataSource={recentReports} renderItem={r => (
              <List.Item><List.Item.Meta
                avatar={<Avatar style={{ background: "#722ed1" }} icon={<FileTextOutlined />} size="small" />}
                title={<Text ellipsis style={{ maxWidth: 200 }}>{r.title || r.reportNo}</Text>}
                description={<Space size={4}><Tag size="small">{r.status}</Tag><Text type="secondary" style={{ fontSize: 11 }}>{dayjs(r.createdAt).format("MM-DD")}</Text></Space>}
              /></List.Item>
            )} />
          </Card>
          <Card title="快捷操作" size="small" style={{ marginTop: 16 }}>
            <Space direction="vertical" style={{ width: "100%" }}>
              <Button block icon={<RocketOutlined />} type="primary">创建评测任务</Button>
              <Button block icon={<BarChartOutlined />}>查看评测报告</Button>
              <Button block icon={<CloudServerOutlined />}>管理计算资源</Button>
              <Button block icon={<DatabaseOutlined />}>数字资产管理</Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
