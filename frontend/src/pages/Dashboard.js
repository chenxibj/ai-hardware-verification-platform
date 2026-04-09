/**
 * @file Dashboard.js
 * @description 工作台总览页 — 统计卡片 + 实时动态 + 雷达图 + 最近评测任务 + 快速操作
 * @feat #166
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Row, Col, Statistic, Tag, Badge, Progress, Space, Button,
  Typography, Timeline, List, Empty, Skeleton, Tooltip
} from "antd";
import {
  ExperimentOutlined, PlayCircleOutlined, CheckCircleOutlined,
  ClockCircleOutlined, PlusCircleOutlined,
  BarChartOutlined, AppstoreOutlined,
  SyncOutlined, RocketOutlined
} from "@ant-design/icons";
import RadarChart from "../components/RadarChart";
import HotAssetsCard from "./assets/HotAssetsCard";
import api from "../utils/api";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

const { Text, Title } = Typography;

const PLAN_STATUS_MAP = {
  DRAFT: { text: "草稿", color: "default" },
  RUNNING: { text: "执行中", color: "processing" },
  PAUSED: { text: "已暂停", color: "warning" },
  COMPLETED: { text: "已完成", color: "success" },
  FAILED: { text: "失败", color: "error" },
  CANCELLED: { text: "已取消", color: "default" },
};

const REFRESH_INTERVAL = 30000; // 30 seconds

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [recentPlans, setRecentPlans] = useState([]);
  const [radarChips, setRadarChips] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      /* #286: 从已有 API 聚合 Dashboard 数据 */
      const [tasksRes, nodesRes, reportsRes, assetsRes, plansRes, chipsRes] = await Promise.allSettled([
        api.get("/tasks", { params: { size: 5, page: 0 } }),
        api.get("/nodes", { params: { size: 100 } }),
        api.get("/chip-reports", { params: { size: 5, page: 0 } }),
        api.get("/assets", { params: { size: 100 } }),
        api.get("/plans", { params: { size: 5, page: 0, sortBy: "createdAt", sortDir: "desc" } }),
        api.get("/chips", { params: { size: 100 } }),
      ]);

      // Build stats from aggregated data
      const chips = chipsRes.status === "fulfilled" && chipsRes.value.data?.code === 0
        ? (chipsRes.value.data.data || []) : [];
      const plans = plansRes.status === "fulfilled" && plansRes.value.data?.code === 0
        ? (plansRes.value.data.data || []) : [];
      const nodes = nodesRes.status === "fulfilled" && nodesRes.value.data?.code === 0
        ? (nodesRes.value.data.data || []) : [];
      const assets = assetsRes.status === "fulfilled" && assetsRes.value.data?.code === 0
        ? (assetsRes.value.data.data || []) : [];
      const tasks = tasksRes.status === "fulfilled" && tasksRes.value.data?.code === 0
        ? (tasksRes.value.data.data || []) : [];
      const reports = reportsRes.status === "fulfilled" && reportsRes.value.data?.code === 0
        ? (reportsRes.value.data.data || []) : [];

      setStats({
        chipCount: chips.length,
        runningPlans: plans.filter(p => p.status === "RUNNING").length,
        completedPlans: plans.filter(p => p.status === "COMPLETED").length,
        unevaluatedChips: chips.filter(c => !c.capabilityProfile).length,
        nodeCount: nodes.length,
        onlineNodes: nodes.filter(n => n.status === "ONLINE" || n.status === "ACTIVE").length,
        assetCount: assets.length,
        reportCount: reports.length,
      });

      // Build activity feed from tasks + reports
      const activityItems = [];
      tasks.forEach(t => {
        activityItems.push({
          user: t.createdBy ? "用户#" + t.createdBy : "系统",
          action: t.status === "COMPLETED" ? "完成了任务" : t.status === "FAILED" ? "任务失败" : "创建了任务",
          target: t.name || t.taskNo || "",
          time: t.updatedAt || t.createdAt,
        });
      });
      reports.forEach(r => {
        activityItems.push({
          user: "系统",
          action: "生成了报告",
          target: r.reportNo || "",
          time: r.createdAt,
        });
      });
      activityItems.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
      setActivities(activityItems.slice(0, 8));

      setRecentPlans(plans.slice(0, 5));

      // Radar data from chips
      const radarSets = chips
        .filter(c => c.capabilityProfile)
        .slice(0, 4)
        .map((chip, idx) => {
          let profile = chip.capabilityProfile;
          if (typeof profile === "string") {
            try { profile = JSON.parse(profile); } catch { profile = null; }
          }
          if (!profile || !Array.isArray(profile)) return null;
          return {
            name: chip.name,
            data: profile,
            color: ["#1890ff", "#52c41a", "#fa8c16", "#f5222d"][idx % 4],
          };
        }).filter(Boolean);
      setRadarChips(radarSets);
    } catch { /* handled by individual requests */ }
    if (showLoading) setLoading(false);
  }, []);

  useEffect(() => {
    fetchData(true);
    const timer = setInterval(() => fetchData(false), REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchData]);

  // Stat cards config — #286 聚合已有 API 数据
  const statCards = stats ? [
    {
      title: "芯片总数",
      value: stats.chipCount,
      icon: <ExperimentOutlined />,
      color: "#1890ff",
      bg: "linear-gradient(135deg, #e6f7ff 0%, #bae7ff 100%)",
    },
    {
      title: "评测中",
      value: stats.runningPlans,
      icon: <PlayCircleOutlined />,
      color: "#722ed1",
      bg: "linear-gradient(135deg, #f9f0ff 0%, #efdbff 100%)",
    },
    {
      title: "已完成",
      value: stats.completedPlans,
      icon: <CheckCircleOutlined />,
      color: "#52c41a",
      bg: "linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)",
    },
    {
      title: "节点在线",
      value: stats.onlineNodes != null ? stats.onlineNodes + " / " + (stats.nodeCount || 0) : 0,
      icon: <ClockCircleOutlined />,
      color: "#13c2c2",
      bg: "linear-gradient(135deg, #e6fffb 0%, #b5f5ec 100%)",
    },
    {
      title: "数字资产",
      value: stats.assetCount,
      icon: <AppstoreOutlined />,
      color: "#fa8c16",
      bg: "linear-gradient(135deg, #fff7e6 0%, #ffe7ba 100%)",
    },
    {
      title: "评测报告",
      value: stats.reportCount,
      icon: <BarChartOutlined />,
      color: "#eb2f96",
      bg: "linear-gradient(135deg, #fff0f6 0%, #ffd6e7 100%)",
    },
  ] : [];

  // Quick action buttons
  const quickActions = [
    { title: "注册芯片", icon: <PlusCircleOutlined />, color: "#1890ff" },
    { title: "创建评测", icon: <RocketOutlined />, color: "#722ed1" },
    { title: "查看报告", icon: <BarChartOutlined />, color: "#52c41a" },
    { title: "模板管理", icon: <AppstoreOutlined />, color: "#fa8c16" },
  ];

  if (loading && !stats) {
    return (
      <div>
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Col xs={24} sm={12} md={4} key={i}>
              <Card><Skeleton active paragraph={{ rows: 1 }} /></Card>
            </Col>
          ))}
        </Row>
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} md={12}><Card><Skeleton active paragraph={{ rows: 6 }} /></Card></Col>
          <Col xs={24} md={12}><Card><Skeleton active paragraph={{ rows: 6 }} /></Card></Col>
        </Row>
      </div>
    );
  }

  return (
    <div>
      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {statCards.map((card, idx) => (
          <Col xs={24} sm={12} md={4} key={idx}>
            <Card
              hoverable
              style={{ background: card.bg, borderColor: "transparent" }}
              bodyStyle={{ padding: "20px 24px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 13 }}>{card.title}</Text>
                  <div style={{ fontSize: 32, fontWeight: 700, color: card.color, lineHeight: 1.2, marginTop: 4 }}>
                    {card.value}
                  </div>
                </div>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: "#fff", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 24, color: card.color,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
                }}>
                  {card.icon}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 中间区域：实时动态 + 最近评测任务 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* 左侧：实时动态 + 雷达图 */}
        <Col xs={24} lg={12}>
          <Card
            title="实时动态"
            size="small"
            extra={<Text type="secondary" style={{ fontSize: 12 }}>
              <SyncOutlined spin /> 30秒自动刷新
            </Text>}
            style={{ marginBottom: 16 }}
          >
            {activities.length > 0 ? (
              <Timeline style={{ marginTop: 12 }}>
                {activities.slice(0, 5).map((item, idx) => (
                  <Timeline.Item
                    key={idx}
                    color={item.action.includes("完成") ? "green" : item.action.includes("失败") ? "red" : "blue"}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <Text strong style={{ fontSize: 13 }}>{item.user}</Text>
                        <Text style={{ fontSize: 13 }}> {item.action} </Text>
                        <Text type="secondary" style={{ fontSize: 13 }}>{item.target}</Text>
                      </div>
                      <Tooltip title={item.time ? dayjs(item.time).format("YYYY-MM-DD HH:mm:ss") : ""}>
                        <Text type="secondary" style={{ fontSize: 11, whiteSpace: "nowrap", marginLeft: 8 }}>
                          {item.time ? dayjs(item.time).fromNow() : ""}
                        </Text>
                      </Tooltip>
                    </div>
                  </Timeline.Item>
                ))}
              </Timeline>
            ) : (
              <Empty description="暂无动态" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>

          {/* 雷达图 */}
          <Card title="芯片能力雷达图" size="small">
            {radarChips.length > 0 ? (
              <RadarChart datasets={radarChips} height={300} showLabel={false} fillOpacity={0.2} />
            ) : (
              <Empty
                description="暂无评测数据"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ padding: "40px 0" }}
              />
            )}
          </Card>
        </Col>

        {/* 右侧：最近评测任务 */}
        <Col xs={24} lg={12}>
          <Card
            title="最近评测任务"
            size="small"
            extra={<Button type="link" size="small">查看全部</Button>}
            style={{ height: "100%" }}
          >
            {recentPlans.length > 0 ? (
              <List
                dataSource={recentPlans}
                renderItem={(plan) => {
                  const statusInfo = PLAN_STATUS_MAP[plan.status] || { text: plan.status, color: "default" };
                  const progress = plan.totalTasks > 0
                    ? Math.round((plan.completedTasks / plan.totalTasks) * 100)
                    : plan.progress || 0;
                  return (
                    <List.Item style={{ padding: "12px 0" }}>
                      <div style={{ width: "100%" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Text strong ellipsis style={{ maxWidth: 200, display: "inline-block" }}>
                              {plan.name}
                            </Text>
                            <Tag color="blue" style={{ marginLeft: 8 }}>{plan.chipName}</Tag>
                          </div>
                          <Badge status={statusInfo.color} text={statusInfo.text} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <Progress
                            percent={progress}
                            size="small"
                            style={{ flex: 1, marginRight: 16 }}
                            strokeColor={plan.status === "COMPLETED" ? "#52c41a" : plan.status === "FAILED" ? "#ff4d4f" : undefined}
                          />
                          <Tooltip title={plan.createdAt ? dayjs(plan.createdAt).format("YYYY-MM-DD HH:mm:ss") : ""}>
                            <Text type="secondary" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                              {plan.createdAt ? dayjs(plan.createdAt).fromNow() : ""}
                            </Text>
                          </Tooltip>
                        </div>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {plan.planNo} · {plan.completedTasks}/{plan.totalTasks} 任务 · {plan.createdBy}
                        </Text>
                      </div>
                    </List.Item>
                  );
                }}
              />
            ) : (
              <Empty
                description="暂无评测任务"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ padding: "40px 0" }}
              >
                <Button type="primary" icon={<RocketOutlined />}>
                  创建第一个评测任务
                </Button>
              </Empty>
            )}
          </Card>
        </Col>
      </Row>

      {/* 热门资产 TOP5 #267 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <HotAssetsCard />
        </Col>
      </Row>

      {/* 快速操作入口 */}
      <Row gutter={[16, 16]}>
        {quickActions.map((action, idx) => (
          <Col xs={12} sm={6} key={idx}>
            <Card
              hoverable
              style={{ textAlign: "center", cursor: "pointer" }}
              bodyStyle={{ padding: "20px 12px" }}
              onClick={() => {/* nav via sidebar */}}
            >
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: `${action.color}15`,
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 12px", fontSize: 24, color: action.color,
              }}>
                {action.icon}
              </div>
              <Text strong style={{ color: action.color }}>{action.title}</Text>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
