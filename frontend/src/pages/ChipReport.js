/**
 * @file ChipReport.js
 * @description 完整芯片评价报告页面 — 5 板块
 * Issue: #141 MVP-1
 *
 * 板块1: 芯片能力总览（综合评分 + 雷达图 + 能力摘要）
 * 板块2: 算子排行表
 * 板块3: 瓶颈分析（卡片式，红/橙/黄警告级别）
 * 板块4: 适用场景推荐（三栏卡片）
 * 板块5: 评测环境信息
 */
import React, { useState, useEffect, useRef } from "react";
import {
  Card, Row, Col, Statistic, Progress, Table, Tag, Typography,
  Spin, Button, Space, Divider, message, Descriptions, Alert, Empty,
} from "antd";
import {
  ArrowLeftOutlined, TrophyOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ExperimentOutlined, WarningOutlined,
  SafetyCertificateOutlined, ClockCircleOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import RadarChart from "../components/RadarChart";
import api from "../utils/api";
import { exportToPdf, generateReportFilename } from "../utils/exportPdf";

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
  if (score >= 90) return { text: "优秀", color: "#52c41a", emoji: "🏆" };
  if (score >= 75) return { text: "良好", color: "#1890ff", emoji: "👍" };
  if (score >= 60) return { text: "一般", color: "#faad14", emoji: "⚡" };
  return { text: "待改进", color: "#ff4d4f", emoji: "🔧" };
}

const safeParse = (str) => {
  if (!str) return null;
  if (typeof str === "object") return str;
  try { return JSON.parse(str); } catch (_) { return null; }
};

/* 维度键 -> 中文名 */
const DIM_CN = {
  compute_perf: "计算性能", memory_perf: "访存性能", math_func: "数学函数",
  attention: "Attention能力", normalization: "归一化性能", model_inference: "模型推理",
};

/* 生成能力摘要文字 */
function generateSummary(dimScores, overallScore) {
  if (!dimScores || Object.keys(dimScores).length === 0) return null;
  const grade = scoreGrade(overallScore);
  const entries = Object.entries(DIM_CN).map(([k, v]) => ({ key: k, name: v, score: dimScores[k] || 0 }));
  const strongest = entries.reduce((a, b) => a.score > b.score ? a : b);
  const weakest = entries.reduce((a, b) => a.score < b.score ? a : b);

  let text = `该芯片综合评分 ${overallScore.toFixed(1)} 分，评级为【${grade.text}】。`;
  text += `其中 ${strongest.name} 表现最佳（${strongest.score.toFixed(1)}分）`;
  if (weakest.score < 70) {
    text += `，${weakest.name} 是当前主要瓶颈（${weakest.score.toFixed(1)}分），建议重点优化。`;
  } else {
    text += `，各维度表现均衡。`;
  }
  return text;
}

export default function ChipReport({ reportId, onBack }) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [chipName, setChipName] = useState("");
  const [planName, setPlanName] = useState("");
  const reportRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    setLoading(true);

    // reportId 可能是 planId（从 PlanList 跳转），也可能是 report id
    // 先尝试按 report id 获取，失败则按 plan id 获取
    const fetchReport = async () => {
      try {
        // 直接获取 report by id
        const res = await api.get("/chip-reports/" + reportId);
        if (res.data && res.data.code === 0 && res.data.data) {
          return res.data.data;
        }
      } catch (_) {}

      // 尝试按 plan id 获取
      try {
        const res = await api.get("/chip-reports/plan/" + reportId);
        if (res.data && res.data.code === 0 && res.data.data && res.data.data.length > 0) {
          return res.data.data[0];
        }
      } catch (_) {}

      return null;
    };

    fetchReport().then((r) => {
      if (r) {
        setReport(r);
        if (r.chipId) {
          api.get("/chips/" + r.chipId).then((cr) => {
            if (cr.data && cr.data.code === 0) setChipName(cr.data.data.name || "芯片#" + r.chipId);
          }).catch(() => {});
        }
        if (r.planId) {
          api.get("/plans/" + r.planId).then((pr) => {
            if (pr.data && pr.data.code === 0) setPlanName(pr.data.data.name || "计划#" + r.planId);
          }).catch(() => {});
        }
      } else {
        message.error("加载报告失败");
      }
    }).catch((err) => {
      message.error("加载报告失败: " + (err.message || "未知错误"));
    }).finally(() => setLoading(false));
  }, [reportId]);

  if (loading) {
    return <div style={{ textAlign: "center", padding: 100 }}><Spin size="large" tip="加载报告中..." /></div>;
  }

  if (!report) {
    return (
      <div style={{ textAlign: "center", padding: 100 }}>
        <Empty description="报告不存在或尚未生成" />
        {onBack && <Button onClick={onBack} style={{ marginTop: 16 }} icon={<ArrowLeftOutlined />}>返回</Button>}
      </div>
    );
  }

  // 解析各项数据
  const operators = safeParse(report.operatorRanking) || [];
  const radarData = safeParse(report.radarData) || [];
  const dimScores = safeParse(report.dimensionScores) || {};
  const bottleneckData = safeParse(report.bottleneckAnalysis) || [];
  const scenarioRecs = safeParse(report.scenarioRecommendations) || [];
  const overallScore = report.overallScore || 0;
  const grade = scoreGrade(overallScore);
  const summary = generateSummary(dimScores, overallScore);

  const totalOps = operators.length;
  const passedOps = operators.filter((o) => o.passed).length;

  // 算子排行表列
  const columns = [
    {
      title: "排名", key: "rank", width: 70, align: "center",
      render: (_, __, idx) => {
        const rank = idx + 1;
        if (rank <= 3) {
          const colors = ["#ffd700", "#c0c0c0", "#cd7f32"];
          return <Tag color={colors[rank - 1]} style={{ fontWeight: "bold", minWidth: 28, textAlign: "center" }}>{rank}</Tag>;
        }
        return <Text type="secondary">{rank}</Text>;
      },
    },
    {
      title: "算子名", dataIndex: "testItem", key: "testItem",
      render: (text, record) => (
        <Space>
          <ExperimentOutlined />
          <span>{text || record.name || "Unknown"}</span>
          <Tag>{record.dimension || "其他"}</Tag>
        </Space>
      ),
    },
    {
      title: "延迟(ms)", key: "latencyMean", width: 110, align: "right",
      render: (_, r) => {
        const v = r.latencyMean ?? r.avgLatency;
        return v != null ? v.toFixed(2) : "-";
      },
    },
    {
      title: "吞吐量", dataIndex: "throughput", key: "throughput", width: 110, align: "right",
      render: (v) => v != null ? v.toFixed(1) : "-",
    },
    {
      title: "评分", dataIndex: "score", key: "score", width: 100, align: "center",
      render: (v) => (
        <span style={{ color: scoreColor(v || 0), fontWeight: "bold" }}>{(v || 0).toFixed(1)}</span>
      ),
      sorter: (a, b) => (a.score || 0) - (b.score || 0),
    },
    {
      title: "状态", dataIndex: "passed", key: "passed", width: 90, align: "center",
      render: (passed) => passed
        ? <Tag icon={<CheckCircleOutlined />} color="success">通过</Tag>
        : <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>,
    },
  ];

  /* PDF export handler */
  const handleExportPdf = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const filename = generateReportFilename(chipName);
      await exportToPdf(reportRef.current, filename);
      message.success("PDF 导出成功");
    } catch (err) {
      console.error("PDF export error:", err);
      message.error("PDF 导出失败: " + (err.message || "未知错误"));
    } finally {
      setExporting(false);
    }
  };

  const reportTime = report.createdAt ? new Date(report.createdAt).toLocaleString("zh-CN") : "-";

  return (
    <div style={{ padding: "0" }}>
      {/* 操作栏：返回 + 下载PDF */}
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }} data-html2canvas-ignore>
        <div>
          {onBack && (
            <Button type="link" icon={<ArrowLeftOutlined />} onClick={onBack}
              style={{ paddingLeft: 0 }}>返回</Button>
          )}
        </div>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          loading={exporting}
          onClick={handleExportPdf}
        >
          下载 PDF
        </Button>
      </div>

      <div ref={reportRef}>

      {/* ── 板块 1: 芯片能力总览 ── */}
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
                      {grade.emoji} {grade.text}
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

            {/* 能力摘要 */}
            {summary && (
              <Alert type="info" showIcon icon={<SafetyCertificateOutlined />}
                message="能力摘要" description={summary} style={{ marginBottom: 16 }} />
            )}

            <Row gutter={16}>
              <Col span={8}>
                <Statistic title="评测通过率"
                  value={totalOps > 0 ? Math.round((passedOps / totalOps) * 100) : 0} suffix="%"
                  valueStyle={{ color: passedOps === totalOps ? "#52c41a" : "#faad14" }} />
              </Col>
              <Col span={8}>
                <Statistic title="通过 / 总数" value={passedOps} suffix={" / " + totalOps}
                  valueStyle={{ color: "#1890ff" }} />
              </Col>
              <Col span={8}>
                <Statistic title="报告状态"
                  value={report.status === "PUBLISHED" ? "已发布" : "草稿"}
                  valueStyle={{ color: report.status === "PUBLISHED" ? "#52c41a" : "#999" }} />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      {/* 雷达图 + 维度评分 */}
      {radarData.length > 0 && (
        <Card title="六维能力画像" style={{ marginBottom: 24 }}>
          <Row gutter={24} align="middle">
            <Col xs={24} md={12}>
              <RadarChart data={radarData} height={350} />
            </Col>
            <Col xs={24} md={12}>
              {Object.entries(DIM_CN).map(([key, name]) => {
                const score = dimScores[key] || 0;
                return (
                  <div key={key} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text>{name}</Text>
                      <Text strong style={{ color: scoreColor(score) }}>{score.toFixed ? score.toFixed(1) : score}</Text>
                    </div>
                    <Progress percent={Math.round(score)} strokeColor={scoreColor(score)} showInfo={false} size="small" />
                  </div>
                );
              })}
            </Col>
          </Row>
        </Card>
      )}

      {/* ── 板块 2: 算子排行表 ── */}
      {operators.length > 0 && (
        <Card title="算子排行" style={{ marginBottom: 24 }}>
          <Table
            dataSource={operators}
            columns={columns}
            rowKey={(_, idx) => idx}
            pagination={operators.length > 20 ? { pageSize: 20 } : false}
            size="middle"
          />
        </Card>
      )}

      {/* ── 板块 3: 瓶颈分析 ── */}
      {bottleneckData.length > 0 && (
        <Card
          title={<Space><WarningOutlined style={{ color: "#faad14" }} /> 瓶颈分析</Space>}
          style={{ marginBottom: 24 }}
        >
          <Row gutter={[16, 16]}>
            {bottleneckData.map((item, idx) => {
              const levelConfig = {
                error:   { bg: "#fff2f0", border: "#ffccc7", tagColor: "error",      icon: "🔴" },
                warning: { bg: "#fffbe6", border: "#ffe58f", tagColor: "warning",    icon: "🟠" },
                info:    { bg: "#e6f7ff", border: "#91d5ff", tagColor: "processing", icon: "🔵" },
              }[item.level] || { bg: "#f5f5f5", border: "#d9d9d9", tagColor: "default", icon: "⚪" };

              return (
                <Col xs={24} md={8} key={idx}>
                  <Card size="small"
                    style={{ background: levelConfig.bg, borderColor: levelConfig.border, height: "100%" }}>
                    <div style={{ marginBottom: 8 }}>
                      <Tag color={levelConfig.tagColor}>
                        {item.level === "error" ? "严重" : item.level === "warning" ? "警告" : "提示"}
                      </Tag>
                      <Tag>{item.type === "worst_operator" ? "低性能算子" :
                            item.type === "high_volatility" ? "高波动" : "薄弱维度"}</Tag>
                    </div>
                    <div><Text strong>{item.title}</Text></div>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{item.detail}</Text>
                    </div>
                    {item.score != null && (
                      <div style={{ marginTop: 8 }}>
                        <Text style={{ fontSize: 20, fontWeight: "bold", color: scoreColor(item.score) }}>
                          {item.score}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>分</Text>
                      </div>
                    )}
                  </Card>
                </Col>
              );
            })}
          </Row>
        </Card>
      )}

      {/* ── 板块 4: 适用场景推荐 ── */}
      {scenarioRecs.length > 0 && (
        <Card title="适用场景推荐" style={{ marginBottom: 24 }}>
          <Row gutter={16}>
            {["recommended", "caution", "unverified"].map((type) => {
              const items = scenarioRecs.filter(r => r.type === type);
              if (items.length === 0) return null;
              const config = {
                recommended: { title: "✅ 推荐场景", bg: "#f6ffed", border: "#b7eb8f" },
                caution:     { title: "⚠️ 需关注场景", bg: "#fffbe6", border: "#ffe58f" },
                unverified:  { title: "❌ 待验证场景", bg: "#fff2f0", border: "#ffccc7" },
              }[type];
              return (
                <Col xs={24} md={8} key={type}>
                  <Card size="small" title={config.title}
                    style={{ background: config.bg, borderColor: config.border, height: "100%" }}>
                    {items.map((item, idx) => (
                      <div key={idx} style={{ marginBottom: idx < items.length - 1 ? 16 : 0 }}>
                        <Text strong style={{ fontSize: 14 }}>{item.scenario}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>{item.reason}</Text>
                        {item.dimensions && item.dimensions.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            {item.dimensions.map(d => <Tag key={d} size="small">{d}</Tag>)}
                          </div>
                        )}
                      </div>
                    ))}
                  </Card>
                </Col>
              );
            })}
          </Row>
        </Card>
      )}

      {/* ── 板块 5: 评测环境信息 ── */}
      <Card
        title={<Space><ClockCircleOutlined /> 评测环境信息</Space>}
        style={{ marginBottom: 24 }}
      >
        <Alert
          type="info" showIcon
          message="CPU 模拟模式"
          description="当前评测数据在 CPU 模式下生成，用于验证平台功能。真实 GPU/NPU 数据需连接硬件节点执行评测。"
          style={{ marginBottom: 16 }}
        />
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="评测时间">{reportTime}</Descriptions.Item>
          <Descriptions.Item label="报告编号">{report.reportNo}</Descriptions.Item>
          <Descriptions.Item label="报告状态">
            <Tag color={report.status === "PUBLISHED" ? "success" : "default"}>
              {report.status === "PUBLISHED" ? "已发布" : "草稿"}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="生成方式">规则引擎（自动）</Descriptions.Item>
        </Descriptions>
      </Card>
      </div>
    </div>
  );
}
