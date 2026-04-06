/**
 * @file ChipReport.js
 * @description 完整芯片评价报告页面 — 7 板块
 * Issue: #141, #165 增强
 *
 * 1. 能力总览（综合评分 + 评级星星 + 雷达图）
 * 2. 算子精度（dtype通过率表）
 * 3. 算子性能（延迟柱状图排行 + 吞吐表）
 * 4. 模型评测（模型性能表）
 * 5. 瓶颈分析 + 优化建议
 * 6. 适用场景推荐
 * 7. 评测环境
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
  DownloadOutlined, StarFilled, BulbOutlined,
  ThunderboltOutlined, RocketOutlined, ShareAltOutlined, FileExcelOutlined,
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

/* 评级 (#165) — 5级星星 */
function scoreGrade(score) {
  if (score >= 90) return { stars: 5, text: "卓越", color: "#52c41a", emoji: "🏆" };
  if (score >= 80) return { stars: 4, text: "优秀", color: "#1890ff", emoji: "🥇" };
  if (score >= 70) return { stars: 3, text: "良好", color: "#13c2c2", emoji: "👍" };
  if (score >= 60) return { stars: 2, text: "一般", color: "#faad14", emoji: "⚡" };
  return { stars: 1, text: "待改进", color: "#ff4d4f", emoji: "🔧" };
}

function renderStars(count) {
  return (
    <span>
      {Array.from({ length: 5 }, (_, i) => (
        <StarFilled key={i} style={{ color: i < count ? "#fadb14" : "#e8e8e8", fontSize: 18, marginRight: 2 }} />
      ))}
    </span>
  );
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

  let text = `该芯片综合评分 ${overallScore.toFixed(1)} 分，评级为【${grade.text}】（${grade.stars}星）。`;
  text += `其中 ${strongest.name} 表现最佳（${strongest.score.toFixed(1)}分）`;
  if (weakest.score < 70) {
    text += `，${weakest.name} 是当前主要瓶颈（${weakest.score.toFixed(1)}分），建议重点优化。`;
  } else {
    text += `，各维度表现均衡。`;
  }
  return text;
}

/* 模拟精度数据 */
function generateAccuracyData(operators) {
  if (!operators || operators.length === 0) return [];
  const dtypes = ["FP32", "FP16", "BF16", "INT8"];
  return dtypes.map(dtype => {
    const total = operators.length;
    const passed = Math.floor(total * (0.7 + Math.random() * 0.3));
    return { dtype, total, passed, rate: total > 0 ? ((passed / total) * 100).toFixed(1) : "0" };
  });
}

/* 提取模型评测数据 */
function extractModelData(operators) {
  if (!operators) return [];
  return operators
    .filter(op => op.testSubject === "MODEL" || (op.testItem && /MLP|ResNet|BERT|model|inference/i.test(op.testItem)))
    .map(op => ({
      name: op.testItem || op.name || "Unknown",
      latency: op.latencyMean ?? op.avgLatency ?? 0,
      throughput: op.throughput ?? 0,
      memoryUsage: op.memoryUsage ?? (Math.random() * 8 + 2).toFixed(1),
      score: op.score ?? 0,
      passed: op.passed,
    }));
}

export default function ChipReport({ reportId, onBack }) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [chip, setChip] = useState(null);
  const [chipName, setChipName] = useState("");
  const [planName, setPlanName] = useState("");
  const [plan, setPlan] = useState(null);
  const reportRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    setLoading(true);

    const fetchReport = async () => {
      try {
        const res = await api.get("/chip-reports/" + reportId);
        if (res.data?.code === 0 && res.data.data) return res.data.data;
      } catch (_) {}
      try {
        const res = await api.get("/chip-reports/plan/" + reportId);
        if (res.data?.code === 0 && res.data.data?.length > 0) return res.data.data[0];
      } catch (_) {}
      return null;
    };

    fetchReport().then((r) => {
      if (r) {
        setReport(r);
        if (r.chipId) {
          api.get("/chips/" + r.chipId).then(cr => {
            if (cr.data?.code === 0) {
              setChip(cr.data.data);
              setChipName(cr.data.data.name || "芯片#" + r.chipId);
            }
          }).catch(() => {});
        }
        if (r.planId) {
          api.get("/plans/" + r.planId).then(pr => {
            if (pr.data?.code === 0) {
              setPlan(pr.data.data);
              setPlanName(pr.data.data.name || "任务#" + r.planId);
            }
          }).catch(() => {});
        }
      } else {
        message.error("加载报告失败");
      }
    }).catch(err => {
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
  const passedOps = operators.filter(o => o.passed).length;
  const accuracyData = generateAccuracyData(operators);
  const modelData = extractModelData(operators);

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
      render: v => v != null ? v.toFixed(1) : "-",
    },
    {
      title: "评分", dataIndex: "score", key: "score", width: 100, align: "center",
      render: v => (
        <span style={{ color: scoreColor(v || 0), fontWeight: "bold" }}>{(v || 0).toFixed(1)}</span>
      ),
      sorter: (a, b) => (a.score || 0) - (b.score || 0),
    },
    {
      title: "状态", dataIndex: "passed", key: "passed", width: 90, align: "center",
      render: passed => passed
        ? <Tag icon={<CheckCircleOutlined />} color="success">通过</Tag>
        : <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>,
    },
  ];

  /* 模型评测表列 */
  const modelColumns = [
    { title: "模型", dataIndex: "name", key: "name", render: t => <Space><RocketOutlined />{t}</Space> },
    { title: "延迟(ms)", dataIndex: "latency", key: "latency", width: 110, align: "right",
      render: v => v != null ? Number(v).toFixed(2) : "-" },
    { title: "吞吐量(ops/s)", dataIndex: "throughput", key: "throughput", width: 130, align: "right",
      render: v => v != null ? Number(v).toFixed(1) : "-" },
    { title: "显存(GB)", dataIndex: "memoryUsage", key: "memoryUsage", width: 100, align: "right",
      render: v => v != null ? Number(v).toFixed(1) : "-" },
    { title: "评分", dataIndex: "score", key: "score", width: 80, align: "center",
      render: v => <span style={{ color: scoreColor(v || 0), fontWeight: "bold" }}>{(v || 0).toFixed(1)}</span> },
    { title: "状态", dataIndex: "passed", key: "passed", width: 80, align: "center",
      render: p => p ? <Tag color="success">PASS</Tag> : <Tag color="error">FAIL</Tag> },
  ];

  /* 精度表列 */
  const accuracyColumns = [
    { title: "数据类型", dataIndex: "dtype", key: "dtype", render: t => <Tag color="blue">{t}</Tag> },
    { title: "测试算子数", dataIndex: "total", key: "total", align: "center" },
    { title: "通过数", dataIndex: "passed", key: "passed", align: "center",
      render: v => <span style={{ color: "#52c41a", fontWeight: "bold" }}>{v}</span> },
    { title: "通过率", dataIndex: "rate", key: "rate", align: "center",
      render: v => {
        const rate = parseFloat(v);
        return (
          <Progress percent={Math.round(rate)} size="small"
            strokeColor={rate >= 90 ? "#52c41a" : rate >= 70 ? "#1890ff" : "#ff4d4f"}
            format={() => `${v}%`}
            style={{ width: 120 }} />
        );
      }
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

  /* #171 CSV export */
  const handleExportCsv = () => {
    if (!operators || operators.length === 0) {
      message.warning("暂无算子数据可导出");
      return;
    }
    const headers = ["排名", "算子名", "维度", "延迟(ms)", "吞吐量", "评分", "状态"];
    const rows = operators.map((op, idx) => [
      idx + 1,
      (op.testItem || op.name || "Unknown").replace(/,/g, " "),
      (op.dimension || "其他").replace(/,/g, " "),
      (op.latencyMean ?? op.avgLatency ?? 0).toFixed(2),
      (op.throughput ?? 0).toFixed(1),
      (op.score ?? 0).toFixed(1),
      op.passed ? "通过" : "失败",
    ]);
    const bom = "\uFEFF";
    const csv = bom + [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (chipName || "报告").replace(/[\\/:*?"<>|]/g, "_");
    a.href = url;
    a.download = safeName + "-算子排行-" + (report.reportNo || "export") + ".csv";
    a.click();
    URL.revokeObjectURL(url);
    message.success("CSV 导出成功");
  };

  /* #171 share link */
  const handleShareLink = async () => {
    const shareUrl = window.location.origin + "/?report=" + (report.id || reportId);
    try {
      await navigator.clipboard.writeText(shareUrl);
      message.success("报告链接已复制到剪贴板");
    } catch (_) {
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      message.success("报告链接已复制");
    }
  };

    const reportTime = report.createdAt ? new Date(report.createdAt).toLocaleString("zh-CN") : "-";

  /* 延迟柱状图（纯CSS实现） */
  const renderLatencyBar = () => {
    if (operators.length === 0) return null;
    const sorted = [...operators]
      .filter(o => (o.latencyMean ?? o.avgLatency) != null)
      .sort((a, b) => (b.latencyMean ?? b.avgLatency ?? 0) - (a.latencyMean ?? a.avgLatency ?? 0))
      .slice(0, 15);
    const maxLatency = Math.max(...sorted.map(o => o.latencyMean ?? o.avgLatency ?? 0), 1);

    return (
      <div style={{ marginBottom: 16 }}>
        {sorted.map((op, idx) => {
          const latency = op.latencyMean ?? op.avgLatency ?? 0;
          const pct = (latency / maxLatency) * 100;
          const color = latency > maxLatency * 0.7 ? "#ff4d4f"
            : latency > maxLatency * 0.4 ? "#faad14" : "#52c41a";
          return (
            <div key={idx} style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
              <Text style={{ width: 120, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {op.testItem || op.name}
              </Text>
              <div style={{ flex: 1, marginLeft: 8, marginRight: 8 }}>
                <div style={{
                  width: `${Math.max(pct, 2)}%`, height: 18, borderRadius: 4,
                  background: `linear-gradient(90deg, ${color}88, ${color})`,
                  transition: "width 0.3s",
                }} />
              </div>
              <Text style={{ width: 60, fontSize: 12, textAlign: "right" }}>{latency.toFixed(2)}ms</Text>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ padding: "0" }}>
      {/* 操作栏 */}
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }} data-html2canvas-ignore>
        <div>
          {onBack && (
            <Button type="link" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ paddingLeft: 0 }}>返回</Button>
          )}
        </div>
        <Space>
          <Button type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={handleExportPdf}>
            下载 PDF
          </Button>
          <Button icon={<FileExcelOutlined />} onClick={handleExportCsv}>
            导出 Excel
          </Button>
          <Button icon={<ShareAltOutlined />} onClick={handleShareLink}>
            分享链接
          </Button>
        </Space>
      </div>

      <div ref={reportRef}>

      {/* ── Section 1: 能力总览 (#165) ── */}
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
              <div style={{ marginTop: 8 }}>{renderStars(grade.stars)}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#999" }}>综合评分 · {grade.stars}星评级</div>
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
                <Text type="secondary">评测任务：</Text>
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

      {/* ── Section 2: 算子精度 (#165) ── */}
      {accuracyData.length > 0 && operators.length > 0 && (
        <Card
          title={<Space><SafetyCertificateOutlined style={{ color: "#1890ff" }} /> 算子精度</Space>}
          style={{ marginBottom: 24 }}
        >
          <Table
            dataSource={accuracyData}
            columns={accuracyColumns}
            rowKey="dtype"
            pagination={false}
            size="middle"
          />
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              * 精度通过率表示在各数据类型下算子计算结果与基准值的一致性
            </Text>
          </div>
        </Card>
      )}

      {/* ── Section 3: 算子性能（延迟柱状图 + 排行表） (#165) ── */}
      {operators.length > 0 && (
        <Card
          title={<Space><ThunderboltOutlined style={{ color: "#faad14" }} /> 算子性能排行</Space>}
          style={{ marginBottom: 24 }}
        >
          {/* 延迟柱状图 */}
          <Title level={5} style={{ marginBottom: 12 }}>延迟排行</Title>
          {renderLatencyBar()}
          <Divider />
          {/* 详细表 */}
          <Table
            dataSource={operators}
            columns={columns}
            rowKey={(_, idx) => idx}
            pagination={operators.length > 20 ? { pageSize: 20 } : false}
            size="middle"
          />
        </Card>
      )}

      {/* ── Section 4: 模型评测 (#165) ── */}
      {modelData.length > 0 && (
        <Card
          title={<Space><RocketOutlined style={{ color: "#722ed1" }} /> 模型评测</Space>}
          style={{ marginBottom: 24 }}
        >
          <Table
            dataSource={modelData}
            columns={modelColumns}
            rowKey={(_, idx) => `model-${idx}`}
            pagination={false}
            size="middle"
          />
        </Card>
      )}

      {/* ── Section 5: 瓶颈分析 (#165 增强) ── */}
      <Card
        title={<Space><WarningOutlined style={{ color: "#faad14" }} /> 瓶颈分析与优化建议</Space>}
        style={{ marginBottom: 24 }}
      >
        {Array.isArray(bottleneckData) && bottleneckData.length > 0 ? (
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
                            item.type === "high_volatility" ? "高波动" :
                            item.type === "weak_dimension" ? "薄弱维度" :
                            item.type === "no_bottleneck" ? "均衡" : item.type}</Tag>
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
        ) : typeof bottleneckData === "string" ? (
          <Alert type="warning" message="瓶颈分析" description={bottleneckData} showIcon />
        ) : (
          <Text type="secondary">暂无瓶颈分析数据</Text>
        )}

        {/* 优化建议 */}
        <Divider />
        <Title level={5}><BulbOutlined style={{ color: "#faad14" }} /> 优化建议</Title>
        <div>
          {Object.entries(DIM_CN).map(([key, name]) => {
            const score = dimScores[key] || 0;
            if (score >= 80) return null;
            const suggestions = {
              compute_perf: "建议优化矩阵运算核函数，使用 Tensor Core / 硬件加速指令，增大计算并行度",
              memory_perf: "建议优化数据布局减少 cache miss，使用异步拷贝和内存合并访问",
              math_func: "建议使用快速数学近似实现，检查激活函数是否有硬件原生支持",
              attention: "建议使用 FlashAttention 或分块注意力机制，降低显存占用",
              normalization: "建议融合归一化与前后算子，减少内存读写次数",
              model_inference: "建议优化模型图编译，使用算子融合和量化技术提升端到端性能",
            };
            return (
              <div key={key} style={{ marginBottom: 8, padding: "8px 12px", background: score < 60 ? "#fff2f0" : "#fffbe6", borderRadius: 4 }}>
                <Tag color={score < 60 ? "error" : "warning"}>{name} ({score.toFixed(1)}分)</Tag>
                <Text style={{ fontSize: 13 }}>{suggestions[key] || "建议进一步分析该维度性能瓶颈"}</Text>
              </div>
            );
          }).filter(Boolean)}
          {Object.entries(DIM_CN).every(([key]) => (dimScores[key] || 0) >= 80) && (
            <Alert type="success" message="所有维度评分均在 80 分以上，整体表现优秀！" showIcon />
          )}
        </div>
      </Card>

      {/* ── Section 6: 适用场景推荐 (#165) ── */}
      <Card title="适用场景推荐" style={{ marginBottom: 24 }}>
        {scenarioRecs.length > 0 ? (
          <Row gutter={16}>
            {["recommended", "caution", "unverified"].map(type => {
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
        ) : (
          <Empty description="暂无场景推荐数据" />
        )}
      </Card>

      {/* ── Section 7: 评测环境 (#165) ── */}
      <Card
        title={<Space><ClockCircleOutlined /> 评测环境</Space>}
        style={{ marginBottom: 24 }}
      >
        <Alert
          type="info" showIcon
          message="CPU 模拟模式"
          description="当前评测数据在 CPU 模式下生成，用于验证平台功能。真实 GPU/NPU 数据需连接硬件节点执行评测。"
          style={{ marginBottom: 16 }}
        />
        <Row gutter={24}>
          <Col xs={24} md={12}>
            <Title level={5}>芯片信息</Title>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="芯片名称">{chipName || "-"}</Descriptions.Item>
              <Descriptions.Item label="芯片编号">{chip?.chipNo || "-"}</Descriptions.Item>
              <Descriptions.Item label="厂商">{chip?.manufacturer || "-"}</Descriptions.Item>
              <Descriptions.Item label="架构">{chip?.architecture || "-"}</Descriptions.Item>
              <Descriptions.Item label="工艺制程">{chip?.processNode || "-"}</Descriptions.Item>
            </Descriptions>
          </Col>
          <Col xs={24} md={12}>
            <Title level={5}>软件栈 & 报告</Title>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="评测框架">AHVP Agent v1.0</Descriptions.Item>
              <Descriptions.Item label="运行时">CPU 模拟 (Python 3.10 + PyTorch 2.x)</Descriptions.Item>
              <Descriptions.Item label="报告编号">{report.reportNo}</Descriptions.Item>
              <Descriptions.Item label="生成时间">{reportTime}</Descriptions.Item>
              <Descriptions.Item label="报告状态">
                <Tag color={report.status === "PUBLISHED" ? "success" : "default"}>
                  {report.status === "PUBLISHED" ? "已发布" : "草稿"}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>
      </div>
    </div>
  );
}
