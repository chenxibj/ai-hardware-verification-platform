/**
 * @file ChipReport.js
 * @description 芯片评价报告页面 - 简化版
 * Issue: #136
 */
import React, { useState, useEffect } from "react";
import {
  Card, Row, Col, Statistic, Progress, Table, Tag, Typography,
  Spin, Button, Space, Divider, message,
} from "antd";
import {
  ArrowLeftOutlined, TrophyOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ExperimentOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text } = Typography;

/* 评分颜色映射 */
function scoreColor(score) {
  if (score >= 80) return "#52c41a";
  if (score >= 60) return "#1890ff";
  if (score >= 40) return "#faad14";
  return "#ff4d4f";
}

/* 评分等级 */
function scoreGrade(score) {
  if (score >= 90) return "优秀";
  if (score >= 80) return "良好";
  if (score >= 60) return "合格";
  if (score >= 40) return "一般";
  return "较差";
}

export default function ChipReport({ reportId, onBack }) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [chipName, setChipName] = useState("");
  const [planName, setPlanName] = useState("");

  useEffect(() => {
    if (!reportId) return;
    setLoading(true);
    api.get("/chip-reports/" + reportId)
      .then((res) => {
        if (res.data && res.data.code === 0) {
          const r = res.data.data;
          setReport(r);
          // 加载芯片名称
          if (r.chipId) {
            api.get("/chips/" + r.chipId).then((cr) => {
              if (cr.data && cr.data.code === 0) {
                setChipName(cr.data.data.name || "芯片#" + r.chipId);
              }
            }).catch(() => {});
          }
          // 加载计划名称
          if (r.planId) {
            api.get("/plans/" + r.planId).then((pr) => {
              if (pr.data && pr.data.code === 0) {
                setPlanName(pr.data.data.name || "计划#" + r.planId);
              }
            }).catch(() => {});
          }
        } else {
          message.error("加载报告失败");
        }
      })
      .catch((err) => {
        message.error("加载报告失败: " + (err.message || "未知错误"));
      })
      .finally(() => setLoading(false));
  }, [reportId]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 100 }}>
        <Spin size="large" tip="加载报告中..." />
      </div>
    );
  }

  if (!report) {
    return (
      <div style={{ textAlign: "center", padding: 100 }}>
        <Text type="secondary">报告不存在</Text>
        {onBack && <Button onClick={onBack} style={{ marginLeft: 16 }}>返回</Button>}
      </div>
    );
  }

  // 解析 operatorRanking
  let operators = [];
  try {
    operators = typeof report.operatorRanking === "string"
      ? JSON.parse(report.operatorRanking)
      : (report.operatorRanking || []);
  } catch (e) {
    operators = [];
  }

  // 统计
  const totalOps = operators.length;
  const passedOps = operators.filter((o) => o.passed).length;
  const overallScore = report.overallScore || 0;

  // 表格列
  const columns = [
    {
      title: "排名",
      key: "rank",
      width: 70,
      align: "center",
      render: (_, __, idx) => {
        const rank = idx + 1;
        if (rank <= 3) {
          const colors = ["#ffd700", "#c0c0c0", "#cd7f32"];
          return (
            <Tag color={colors[rank - 1]} style={{ fontWeight: "bold", minWidth: 28, textAlign: "center" }}>
              {rank}
            </Tag>
          );
        }
        return <Text type="secondary">{rank}</Text>;
      },
    },
    {
      title: "算子名",
      dataIndex: "testItem",
      key: "testItem",
      render: (text, record) => (
        <Space>
          <ExperimentOutlined />
          <span>{text || "Unknown"}</span>
          <Tag>{record.dimension || "其他"}</Tag>
        </Space>
      ),
    },
    {
      title: "延迟(ms)",
      dataIndex: "latencyMean",
      key: "latencyMean",
      width: 110,
      align: "right",
      render: (v) => v != null ? v.toFixed(2) : "-",
    },
    {
      title: "吞吐量",
      dataIndex: "throughput",
      key: "throughput",
      width: 110,
      align: "right",
      render: (v) => v != null ? v.toFixed(1) : "-",
    },
    {
      title: "评分",
      dataIndex: "score",
      key: "score",
      width: 100,
      align: "center",
      render: (v) => (
        <span style={{ color: scoreColor(v || 0), fontWeight: "bold" }}>
          {(v || 0).toFixed(1)}
        </span>
      ),
      sorter: (a, b) => (a.score || 0) - (b.score || 0),
    },
    {
      title: "状态",
      dataIndex: "passed",
      key: "passed",
      width: 90,
      align: "center",
      render: (passed) =>
        passed ? (
          <Tag icon={<CheckCircleOutlined />} color="success">通过</Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>
        ),
    },
  ];

  // 格式化时间
  const reportTime = report.createdAt
    ? new Date(report.createdAt).toLocaleString("zh-CN")
    : "-";

  return (
    <div style={{ padding: "0" }}>
      {/* 返回按钮 */}
      {onBack && (
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          style={{ marginBottom: 16, paddingLeft: 0 }}
        >
          返回
        </Button>
      )}

      {/* 顶部：报告概要 */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={8}>
            <div style={{ textAlign: "center" }}>
              <Progress
                type="circle"
                percent={Math.round(overallScore)}
                strokeColor={scoreColor(overallScore)}
                size={160}
                format={() => (
                  <div>
                    <div style={{ fontSize: 36, fontWeight: "bold", color: scoreColor(overallScore) }}>
                      {overallScore.toFixed(1)}
                    </div>
                    <div style={{ fontSize: 14, color: "#666" }}>
                      {scoreGrade(overallScore)}
                    </div>
                  </div>
                )}
              />
              <div style={{ marginTop: 8, fontSize: 14, color: "#999" }}>综合评分</div>
            </div>
          </Col>
          <Col xs={24} md={16}>
            <Title level={4} style={{ marginBottom: 16 }}>
              <TrophyOutlined style={{ color: "#faad14", marginRight: 8 }} />
              芯片评测报告
            </Title>
            <Row gutter={[16, 12]}>
              <Col span={12}>
                <Text type="secondary">芯片名称：</Text>
                <Text strong>{chipName || "加载中..."}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary">评测计划：</Text>
                <Text strong>{planName || "加载中..."}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary">报告编号：</Text>
                <Text>{report.reportNo}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary">评测时间：</Text>
                <Text>{reportTime}</Text>
              </Col>
            </Row>
            <Divider style={{ margin: "16px 0" }} />
            <Row gutter={16}>
              <Col span={8}>
                <Statistic
                  title="评测通过率"
                  value={totalOps > 0 ? Math.round((passedOps / totalOps) * 100) : 0}
                  suffix="%"
                  valueStyle={{ color: passedOps === totalOps ? "#52c41a" : "#faad14" }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="通过 / 总数"
                  value={passedOps}
                  suffix={" / " + totalOps}
                  valueStyle={{ color: "#1890ff" }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="报告状态"
                  value={report.status === "PUBLISHED" ? "已发布" : "草稿"}
                  valueStyle={{ color: report.status === "PUBLISHED" ? "#52c41a" : "#999" }}
                />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      {/* 算子排行表 */}
      <Card title="算子排行" style={{ marginBottom: 24 }}>
        <Table
          dataSource={operators}
          columns={columns}
          rowKey={(_, idx) => idx}
          pagination={operators.length > 20 ? { pageSize: 20 } : false}
          size="middle"
        />
      </Card>
    </div>
  );
}
