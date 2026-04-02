import React, { useState, useEffect } from "react";
import { Card, Row, Col, Statistic, Table, Tag, Badge, Progress, Space, Button, Typography, Timeline, Divider, List, Avatar, Empty, Alert } from "antd";
import { DashboardOutlined, ProjectOutlined, FileTextOutlined, CloudServerOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, SyncOutlined, RiseOutlined, ThunderboltOutlined, TeamOutlined, DatabaseOutlined, BarChartOutlined, RocketOutlined, PlusCircleOutlined, AppstoreOutlined, FundOutlined, CloseCircleOutlined, BulbOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import api from "../utils/api";
import dayjs from "dayjs";
const { Text, Title, Paragraph } = Typography;

const STATUS_COLORS = { PENDING:"default", QUEUED:"warning", RUNNING:"processing", COMPLETED:"success", FAILED:"error", CANCELLED:"default" };
const STATUS_MAP = { PENDING:"待执行", QUEUED:"排队中", RUNNING:"执行中", COMPLETED:"已完成", FAILED:"失败", CANCELLED:"已取消" };
const EVAL_TYPES = { PERFORMANCE:"性能评测", ACCURACY:"精度评测", COMPATIBILITY:"兼容性评测", STABILITY:"稳定性评测", GENERAL:"通用评测" };

const quickActions = [
  { title: "创建评测任务", desc: "新建硬件评测任务", icon: <PlusCircleOutlined style={{ fontSize: 28, color: "#1890ff" }} />, path: "/tasks", gradient: "linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%)", color: "#1890ff" },
  { title: "查看评测模板", desc: "浏览和管理评测模板", icon: <AppstoreOutlined style={{ fontSize: 28, color: "#722ed1" }} />, path: "/templates", gradient: "linear-gradient(135deg, #f9f0ff 0%, #efdbff 100%)", color: "#722ed1" },
  { title: "管理计算资源", desc: "查看和配置计算资源", icon: <CloudServerOutlined style={{ fontSize: 28, color: "#52c41a" }} />, path: "/resources", gradient: "linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)", color: "#52c41a" },
  { title: "查看最新报告", desc: "浏览评测报告", icon: <FundOutlined style={{ fontSize: 28, color: "#fa8c16" }} />, path: "/reports", gradient: "linear-gradient(135deg, #fff7e6 0%, #ffe7ba 100%)", color: "#fa8c16" },
];

function buildTimeline(tasks) {
  const items = [];
  tasks.forEach(t => {
    const name = t.name || t.taskNo || "未命名任务";
    if (t.status === "COMPLETED") {
      items.push({ time: t.updatedAt || t.createdAt, label: `任务「${name}」完成`, color: "green", icon: <CheckCircleOutlined /> });
    } else if (t.status === "FAILED") {
      items.push({ time: t.updatedAt || t.createdAt, label: `任务「${name}」失败`, color: "red", icon: <CloseCircleOutlined /> });
    }
    items.push({ time: t.createdAt, label: `任务「${name}」创建`, color: "blue", icon: <ClockCircleOutlined /> });
  });
  items.sort((a, b) => new Date(b.time) - new Date(a.time));
  return items.slice(0, 10);
}

export default function Dashboard() {
  const navigate = useNavigate();
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

  const timelineItems = buildTimeline(recentTasks);

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
      {/* 新用户引导 */}
      {!loading && taskStats.total === 0 && (
        <Alert
          type="info"
          showIcon
          icon={<BulbOutlined />}
          style={{ marginBottom: 24, borderRadius: 8, background: "linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 100%)" }}
          message={<Text strong>欢迎使用 AI 硬件评测平台！</Text>}
          description={
            <Space direction="vertical" size={8} style={{ marginTop: 4 }}>
              <Text>还没有评测任务？试试从模板创建你的第一个评测任务！</Text>
              <Space>
                <Button type="primary" icon={<RocketOutlined />} onClick={() => navigate("/templates")}>从模板创建任务</Button>
                <Button icon={<PlusCircleOutlined />} onClick={() => navigate("/tasks")}>手动创建任务</Button>
              </Space>
            </Space>
          }
        />
      )}

      {/* 快速操作 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {quickActions.map(a => (
          <Col xs={24} sm={12} md={6} key={a.path}>
            <Card
              hoverable
              style={{ background: a.gradient, borderColor: "transparent", cursor: "pointer" }}
              bodyStyle={{ padding: "20px 16px" }}
              onClick={() => navigate(a.path)}
            >
              <Space align="start" size={12}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
                  {a.icon}
                </div>
                <div>
                  <Text strong style={{ fontSize: 15, color: a.color }}>{a.title}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>{a.desc}</Text>
                </div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 核心指标 — 响应式布局 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}><Card hoverable><Statistic title="评测任务总数" value={taskStats.total || 0} prefix={<ProjectOutlined style={{ color: "#1890ff" }} />} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card hoverable><Statistic title="执行中" value={taskStats.running || 0} prefix={<SyncOutlined spin style={{ color: "#1890ff" }} />} suffix={<Text type="secondary" style={{ fontSize: 12 }}>/ {taskStats.queued || 0} 排队</Text>} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card hoverable><Statistic title="评测报告" value={reportStats.total || 0} prefix={<FileTextOutlined style={{ color: "#722ed1" }} />} suffix={<Text type="secondary" style={{ fontSize: 12 }}>/ {reportStats.published || 0} 已发布</Text>} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card hoverable><Statistic title="计算资源" value={resourceStats.total || 0} prefix={<CloudServerOutlined style={{ color: "#52c41a" }} />} suffix={<Text type="secondary" style={{ fontSize: 12 }}>/ {resourceStats.online || 0} 在线</Text>} /></Card></Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}><Card size="small" style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "#fff" }}><Statistic title={<span style={{ color: "rgba(255,255,255,0.8)" }}>完成率</span>} value={taskStats.total ? Math.round((taskStats.completed || 0) / taskStats.total * 100) : 0} suffix="%" valueStyle={{ color: "#fff" }} prefix={<CheckCircleOutlined />} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card size="small" style={{ background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)", color: "#fff" }}><Statistic title={<span style={{ color: "rgba(255,255,255,0.8)" }}>失败任务</span>} value={taskStats.failed || 0} valueStyle={{ color: "#fff" }} prefix={<ExclamationCircleOutlined />} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card size="small" style={{ background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)", color: "#fff" }}><Statistic title={<span style={{ color: "rgba(255,255,255,0.8)" }}>平均评分</span>} value={reportStats.avgScore ? Number(reportStats.avgScore).toFixed(1) : "-"} valueStyle={{ color: "#fff" }} prefix={<RiseOutlined />} /></Card></Col>
        <Col xs={24} sm={12} md={6}><Card size="small" style={{ background: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)", color: "#fff" }}><Statistic title={<span style={{ color: "rgba(255,255,255,0.8)" }}>今日新增</span>} value={recentTasks.filter(t => dayjs(t.createdAt).isSame(dayjs(), "day")).length} valueStyle={{ color: "#fff" }} prefix={<ThunderboltOutlined />} /></Card></Col>
      </Row>

      {/* 图表 + 最近任务 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={8}><Card title="任务状态分布" size="small"><ReactECharts option={taskPieOption} style={{ height: 260 }} /></Card></Col>
        <Col xs={24} md={16}><Card title="近7天任务趋势" size="small"><ReactECharts option={trendOption} style={{ height: 260 }} /></Card></Col>
      </Row>

      {/* 最近任务 + 活动时间线 + 最近报告 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="最近评测任务" size="small" extra={<Button type="link" size="small" onClick={() => navigate("/tasks")}>查看全部</Button>}>
            <Table columns={columns} dataSource={recentTasks} rowKey="id" size="small" pagination={false} loading={loading} />
          </Card>
        </Col>
        <Col xs={24} lg={6}>
          <Card title="最近活动" size="small" style={{ height: "100%" }}>
            {timelineItems.length > 0 ? (
              <Timeline style={{ marginTop: 8 }}>
                {timelineItems.map((item, idx) => (
                  <Timeline.Item key={idx} color={item.color} dot={item.icon}>
                    <Text style={{ fontSize: 13 }}>{item.label}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(item.time).format("MM-DD HH:mm")}</Text>
                  </Timeline.Item>
                ))}
              </Timeline>
            ) : (
              <Empty description="暂无活动记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={6}>
          <Card title="最近报告" size="small" extra={<Button type="link" size="small" onClick={() => navigate("/reports")}>查看全部</Button>}>
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
              <Button block icon={<RocketOutlined />} type="primary" onClick={() => navigate("/tasks")}>创建评测任务</Button>
              <Button block icon={<BarChartOutlined />} onClick={() => navigate("/reports")}>查看评测报告</Button>
              <Button block icon={<CloudServerOutlined />} onClick={() => navigate("/resources")}>管理计算资源</Button>
              <Button block icon={<DatabaseOutlined />} onClick={() => navigate("/templates")}>评测模板管理</Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
