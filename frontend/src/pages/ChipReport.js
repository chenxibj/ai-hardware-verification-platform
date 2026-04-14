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
  Spin, Button, Space, Divider, message, Descriptions, Alert, Empty, Collapse, Tooltip, Radio,
} from "antd";
import {
  ArrowLeftOutlined, TrophyOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ExperimentOutlined, WarningOutlined,
  SafetyCertificateOutlined, ClockCircleOutlined,
  DownloadOutlined, StarFilled, BulbOutlined,
  ThunderboltOutlined, RocketOutlined, ShareAltOutlined, FileExcelOutlined,
  InfoCircleOutlined, QuestionCircleOutlined,
} from "@ant-design/icons";
import RadarChart from "../components/RadarChart";
import api from "../utils/api";
import { exportToPdf, generateReportFilename } from "../utils/exportPdf";
import { useParams, useNavigate } from "react-router-dom";

const { Title, Text } = Typography;

/* 评分颜色映射 */
/* #434: color mapping for vs L40S percentage */
function scoreColor(score) {
  if (score >= 100) return "#52c41a";  // >=100% green
  if (score >= 80) return "#faad14";   // 80-99% yellow
  return "#ff4d4f";                    // <80% red
}

/* 评级 (#165) — 5级星星 */
/* #434: grading for vs L40S percentage */
function scoreGrade(score) {
  if (score >= 120) return { stars: 5, text: "远超基准", color: "#52c41a", emoji: "🏆" };
  if (score >= 100) return { stars: 4, text: "达到基准", color: "#52c41a", emoji: "🥇" };
  if (score >= 80) return { stars: 3, text: "接近基准", color: "#faad14", emoji: "👍" };
  if (score >= 60) return { stars: 2, text: "低于基准", color: "#faad14", emoji: "⚡" };
  return { stars: 1, text: "显著落后", color: "#ff4d4f", emoji: "🔧" };
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

/* Infer dataStatus when backend doesn't provide it (#405 compat) */
function inferDataStatus(op) {
  if (op.dataStatus) return op.dataStatus;
  if (op.latencyMean || op.avgLatency || op.throughput || (op.score && op.score > 0)) return "VALID";
  if (op.passed === false && !op.latencyMean && !op.throughput) return "FAILED";
  return "NO_DATA";
}

/* 维度键 -> 中文名 */
/* #435: 8-dimension mapping */
const DIM_CN = {
  compute: "计算", memory: "访存", communication: "通信", op_compat: "算子兼容",
  training: "训练", inference: "推理", scalability: "扩展性", ecosystem: "生态",
};

/* 生成能力摘要文字 */
function generateSummary(dimScores, overallScore) {
  if (!dimScores || Object.keys(dimScores).length === 0) return null;
  const grade = scoreGrade(overallScore);
  const entries = Object.entries(DIM_CN).map(([k, v]) => ({ key: k, name: v, score: dimScores[k] || 0 }));
  const strongest = entries.reduce((a, b) => a.score > b.score ? a : b);
  const weakest = entries.reduce((a, b) => a.score < b.score ? a : b);

  let text = `该芯片综合评分 vs L40S ${overallScore.toFixed(1)}%，评级为【${grade.text}】（${grade.stars}星）。`;
  text += `其中 ${strongest.name} 表现最佳（${strongest.score.toFixed(1)}%）`;
  if (weakest.score < 70) {
    text += `，${weakest.name} 是当前主要瓶颈（${weakest.score.toFixed(1)}%），建议重点优化。`;
  } else {
    text += `，各维度表现均衡。`;
  }
  return text;
}

/* 从真实评测数据提取精度信息（不使用随机数） */
function extractAccuracyData(operators, report) {
  if (!operators || operators.length === 0) return [];
  // 1. 尝试从 report 的 metrics_summary 提取 accuracy_checks
  const metricsSummary = safeParse(report?.metricsSummary);
  if (metricsSummary?.accuracy_checks && Array.isArray(metricsSummary.accuracy_checks)) {
    return metricsSummary.accuracy_checks.map(check => ({
      dtype: check.dtype || "Unknown",
      total: check.total || 0,
      passed: check.passed || 0,
      rate: check.total > 0 ? ((check.passed / check.total) * 100).toFixed(1) : "0",
    }));
  }
  // 2. 从算子 pass/fail 状态汇总（排除 NO_DATA 项）
  const validOps = operators.filter(o => o.dataStatus !== "NO_DATA");
  const totalOps = validOps.length;
  const passedOps = validOps.filter(o => o.passed).length;
  if (totalOps > 0) {
    return [{
      dtype: "综合",
      total: totalOps,
      passed: passedOps,
      rate: ((passedOps / totalOps) * 100).toFixed(1),
    }];
  }
  return [];
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
      memoryUsage: op.memoryUsage ?? op.memory_delta_mb ?? null,
      score: op.score ?? 0,
      passed: op.passed,
    }));
}

export default function ChipReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const reportId = Number(id);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [chip, setChip] = useState(null);
  const [chipName, setChipName] = useState("");
  const [planName, setPlanName] = useState("");
  const [plan, setPlan] = useState(null);
  const reportRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [weightMode, setWeightMode] = useState("equal");
  const [settingBaseline, setSettingBaseline] = useState(false);
  const [baselineChip, setBaselineChip] = useState(null);

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
          // Fetch L40S baseline chip for comparison (#438)
          api.get("/chips", { params: { keyword: "L40S", page: 0, size: 10 } }).then(cr => {
            const chips = cr.data?.data || [];
            const baseline = chips.find(c => c.chipNo === "CHIP-BASELINE-L40S") || chips[0];
            if (baseline) setBaselineChip(baseline);
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
        {<Button onClick={() => navigate("/reports")} style={{ marginTop: 16 }} icon={<ArrowLeftOutlined />}>返回</Button>}
      </div>
    );
  }

  // 解析各项数据
  const operators = (safeParse(report.operatorRanking) || []).map(op => ({ ...op, dataStatus: inferDataStatus(op) }));
  const radarData = safeParse(report.radarData) || [];
  const dimScores = safeParse(report.dimensionScores) || {};
  const bottleneckData = safeParse(report.bottleneckAnalysis) || [];
  const scenarioRecs = safeParse(report.scenarioRecommendations) || [];
  const trainingSummary = safeParse(report.trainingSummary);
  const inferenceSummary = safeParse(report.inferenceSummary);
  const baselineChipName = report.baselineChip || "L40S";

  // Split operators by category
  const trainingOps = operators.filter(o => o.dimension === "训练");
  const inferenceOps = operators.filter(o => o.dimension === "推理");
  const overallScore = report.overallScore || 0;
  // #439: Scenario-weighted score calculation
  const WEIGHT_PRESETS = {
    equal: { label: "均衡", weights: { compute: 1, memory: 1, communication: 1, op_compat: 1, training: 1, inference: 1, scalability: 1, ecosystem: 1 } },
    inference: { label: "推理优先", weights: { compute: 0.8, memory: 1.2, communication: 0.5, op_compat: 1.0, training: 0.3, inference: 2.0, scalability: 0.5, ecosystem: 0.7 } },
    training: { label: "训练优先", weights: { compute: 1.2, memory: 1.0, communication: 1.5, op_compat: 0.8, training: 2.0, inference: 0.3, scalability: 1.5, ecosystem: 0.7 } },
    mixed: { label: "混合负载", weights: { compute: 1.2, memory: 1.2, communication: 1.0, op_compat: 1.0, training: 1.2, inference: 1.2, scalability: 1.0, ecosystem: 0.8 } },
  };
  const currentWeights = WEIGHT_PRESETS[weightMode].weights;
  const weightedScore = (() => {
    const entries = Object.entries(currentWeights);
    let totalWeight = 0, totalWeightedScore = 0;
    for (const [key, w] of entries) {
      const s = dimScores[key] || 0;
      if (s > 0) {
        totalWeight += w;
        totalWeightedScore += s * w;
      }
    }
    return totalWeight > 0 ? totalWeightedScore / totalWeight : overallScore;
  })();
  const displayScore = weightMode === "equal" ? overallScore : weightedScore;
  const grade = scoreGrade(displayScore);
  const summary = generateSummary(dimScores, displayScore);

  // #287: 检测所有维度评分是否都 = 100（可能是后端评分异常）
  const allScores100 = radarData.length > 0 && false /* #434: 100% is normal for vs-baseline */;

  const totalOps = operators.length;
  const validOps = operators.filter(o => o.dataStatus === "VALID");
  const noDataOps = operators.filter(o => o.dataStatus === "NO_DATA");
  const failedOps = operators.filter(o => o.dataStatus === "FAILED");
  const passedOps = operators.filter(o => o.passed).length;
  const coverageData = (safeParse(report.bottleneckAnalysis) || []).find(b => b.type === "coverage");
  const accuracyData = extractAccuracyData(operators, report);
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
      render: (v, record) => {
        if (record.dataStatus === "NO_DATA") return <Text type="secondary">—</Text>;
        return <span style={{ color: scoreColor(v || 0), fontWeight: "bold" }}>{(v || 0).toFixed(1)}%</span>;
      },
      sorter: (a, b) => (a.score || 0) - (b.score || 0),
    },
    {
      title: "状态", key: "status", width: 120, align: "center",
      render: (_, record) => {
        if (record.dataStatus === "NO_DATA") {
          return <Tooltip title="任务已执行完成，但未采集到有效性能指标数据"><Tag icon={<WarningOutlined />} color="warning">无有效数据</Tag></Tooltip>;
        }
        if (record.dataStatus === "FAILED") {
          return <Tag icon={<CloseCircleOutlined />} color="error">评测失败</Tag>;
        }
        return record.passed
          ? <Tag icon={<CheckCircleOutlined />} color="success">通过</Tag>
          : <Tag icon={<CloseCircleOutlined />} color="error">未达标</Tag>;
      },
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
      render: v => <span style={{ color: scoreColor(v || 0), fontWeight: "bold" }}>{(v || 0).toFixed(1)}%</span> },
    { title: "状态", key: "status", width: 80, align: "center",
      render: (_, record) => {
        if (record.dataStatus === "NO_DATA") return <Tag color="warning">无数据</Tag>;
        return record.passed ? <Tag color="success">PASS</Tag> : <Tag color="error">FAIL</Tag>;
      }
    },
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
    const headers = ["排名", "算子名", "维度", "延迟(ms)", "吞吐量", "评分(%)", "数据状态", "通过"];
    const rows = operators.map((op, idx) => [
      idx + 1,
      (op.testItem || op.name || "Unknown").replace(/,/g, " "),
      (op.dimension || "其他").replace(/,/g, " "),
      (op.latencyMean ?? op.avgLatency ?? 0).toFixed(2),
      (op.throughput ?? 0).toFixed(1),
      op.dataStatus === "NO_DATA" ? "—" : (op.score ?? 0).toFixed(1),
      op.dataStatus === "VALID" ? "有效" : op.dataStatus === "NO_DATA" ? "无数据" : "失败",
      op.passed ? "通过" : op.dataStatus === "NO_DATA" ? "—" : "未达标",
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
    const shareUrl = window.location.origin + "/reports/" + (report.id || reportId);
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

    const handleSetBaseline = async () => {
      setSettingBaseline(true);
      try {
        const res = await api.put("/chip-reports/" + (report.id || reportId) + "/set-baseline");
        if (res.data?.code === 0) {
          message.success("✅ 已标记为可采信基线，芯片画像已更新");
          // Refresh report data
          const rr = await api.get("/chip-reports/" + (report.id || reportId));
          if (rr.data?.code === 0) setReport(rr.data.data);
        } else {
          message.error(res.data?.message || "标记失败");
        }
      } catch (err) {
        message.error("标记失败: " + (err.response?.data?.message || err.message));
      } finally {
        setSettingBaseline(false);
      }
    };

    const reportTime = report.createdAt ? new Date(report.createdAt).toLocaleString("zh-CN") : "-";

  /* 延迟柱状图（纯CSS实现） */
  const renderLatencyBar = () => {
    if (operators.length === 0) return null;
    const sorted = [...operators]
      .filter(o => o.dataStatus === "VALID" && (o.latencyMean ?? o.avgLatency) > 0)
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
          {true && (
            <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate("/reports")} style={{ paddingLeft: 0 }}>返回</Button>
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
          {report.isBaseline ? (
            <Tag color="blue" style={{ lineHeight: '30px', fontSize: 14 }}>🏷️ 可采信基线</Tag>
          ) : (
            <Button type="primary" ghost icon={<SafetyCertificateOutlined />}
              loading={settingBaseline} onClick={handleSetBaseline}>
              📌 标记为可采信基线
            </Button>
          )}
        </Space>
      </div>

      <div ref={reportRef}>

      {/* ── Section 1: 能力总览 (#165) ── */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={8}>
            <div style={{ textAlign: "center" }}>
              {/* #439: Scenario weighting selector */}
              <Radio.Group value={weightMode} onChange={e => setWeightMode(e.target.value)}
                size="small" buttonStyle="solid" style={{ marginBottom: 12 }}>
                {Object.entries(WEIGHT_PRESETS).map(([k, v]) => (
                  <Radio.Button key={k} value={k}>{v.label}</Radio.Button>
                ))}
              </Radio.Group>
              <Progress
                type="circle"
                percent={Math.min(100, Math.round(displayScore))}
                strokeColor={scoreColor(displayScore)}
                size={160}
                format={() => (
                  <div>
                    <div style={{ fontSize: 36, fontWeight: "bold", color: scoreColor(displayScore) }}>
                      {displayScore.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 14, color: "#666" }}>
                      {grade.emoji} {grade.text}
                    </div>
                    {weightMode !== "equal" && (
                      <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                        {WEIGHT_PRESETS[weightMode].label}加权
                      </div>
                    )}
                  </div>
                )}
              />
              <div style={{ marginTop: 8 }}>{renderStars(grade.stars)}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#999" }}>vs L40S · {grade.stars}星评级</div>
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
                {report.isBaseline && <Tag color="blue" style={{ marginLeft: 8 }}>🏷️ 可采信基线</Tag>}
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
            {allScores100 && (
              <Alert type="warning" showIcon icon={<WarningOutlined />}
                message="评分异常提示"
                description="该报告所有维度评分均为 100 分，可能存在评分计算异常。请结合实际评测数据核实，或使用真实硬件重新评测。"
                style={{ marginBottom: 16 }}
              />
            )}
            {coverageData && coverageData.coverage && (
              <Alert
                type={coverageData.coverage.isComplete ? "success" : "warning"}
                showIcon
                icon={coverageData.coverage.isComplete ? <CheckCircleOutlined /> : <WarningOutlined />}
                message={coverageData.title}
                description={coverageData.detail}
                style={{ marginBottom: 16 }}
              />
            )}
            <Row gutter={16}>
              <Col span={6}>
                <Statistic title="有效数据"
                  value={validOps.length} suffix={" / " + totalOps + " 项"}
                  valueStyle={{ color: validOps.length === totalOps ? "#52c41a" : "#faad14" }} />
              </Col>
              <Col span={6}>
                <Statistic title="通过率"
                  value={validOps.length > 0 ? Math.round((passedOps / validOps.length) * 100) : 0} suffix="%"
                  valueStyle={{ color: passedOps === validOps.length ? "#52c41a" : "#faad14" }} />
              </Col>
              <Col span={6}>
                <Statistic title="无数据 / 失败"
                  value={noDataOps.length + " / " + failedOps.length}
                  valueStyle={{ color: failedOps.length > 0 ? "#ff4d4f" : noDataOps.length > 0 ? "#faad14" : "#52c41a", fontSize: 20 }} />
              </Col>
              <Col span={6}>
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
        <Card title={<Space>能力画像 (vs L40S) <Tooltip title="综合评分为各维度 vs L40S 百分比的等权平均值。百分比 = (L40S基准延迟 / 被测芯片延迟) × 100%。≥30% 表示达到或超越 L40S。"><QuestionCircleOutlined style={{ color: "#999", fontSize: 14 }} /></Tooltip></Space>} style={{ marginBottom: 24 }}>
          <Alert
            type="info"
            showIcon={false}
            message={<Text style={{ fontSize: 12 }}>📐 <strong>评分公式：</strong>score = 100 - 20×log₁₀(avg_latency_ms) &nbsp;|&nbsp; <strong>等级标准：</strong><span style={{ color: "#52c41a" }}>≥80 优秀</span> · <span style={{ color: "#1890ff" }}>60-79 良好</span> · <span style={{ color: "#faad14" }}>40-59 一般</span> · <span style={{ color: "#ff4d4f" }}>&lt;40 较差</span> &nbsp;|&nbsp; <strong>综合评分</strong> = 六维等权平均</Text>}
            style={{ marginBottom: 16 }}
          />
          {/* #298: scoring ceiling warning */}
          {overallScore >= 99 && (
            <Alert
              type="warning"
              showIcon
              message={<Text style={{ fontSize: 12 }}><strong>⚠️ 评分触及上限</strong>：当前芯片所有算子延迟极低（&lt;0.1ms），评分公式结果超过 100 后被截断至满分。高端 GPU 在标准负载下差异无法体现，建议增加大 batch / 大模型等压力测试以获得更有区分度的评分。</Text>}
              style={{ marginBottom: 16 }}
            />
          )}
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

          {/* 评测方法说明 */}
          <Divider style={{ margin: "16px 0 8px" }} />
          <Collapse ghost size="small" items={radarData.filter(d => d.detail).map((d) => ({
            key: d.dimKey || d.dimension,
            label: (
              <Space>
                <Tag color={scoreColor(d.score)}>{d.dimension}</Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>{d.detail?.description}</Text>
              </Space>
            ),
            children: (
              <div style={{ paddingLeft: 16, fontSize: 13 }}>
                <Row gutter={[16, 8]}>
                  <Col span={24}>
                    <Text type="secondary">评测方法：</Text>
                    <Text>{d.detail?.evalMethod}</Text>
                  </Col>
                  <Col span={24}>
                    <Text type="secondary">打分依据：</Text>
                    <Text>{d.detail?.scoringBasis}</Text>
                  </Col>
                  <Col span={24}>
                    <Text type="secondary">评分标准：</Text>
                    <Text>{d.detail?.scoringStandard}</Text>
                  </Col>
                  <Col span={24}>
                    <Text type="secondary">覆盖算子：</Text>
                    <Space size={[4, 4]} wrap>
                      {(d.detail?.coveredOperators || []).map(op => <Tag key={op} size="small">{op}</Tag>)}
                    </Space>
                  </Col>
                </Row>
              </div>
            ),
          }))} />
        </Card>
      )}

      {/* ── Section 2: 芯片规格卡片 (#438) ── */}
      {chip && (
        <Card
          title={<Space><ExperimentOutlined style={{ color: "#1890ff" }} /> 芯片规格卡片</Space>}
          extra={baselineChip ? <Tag color="blue">vs {baselineChip.name}</Tag> : null}
          style={{ marginBottom: 24 }}
        >
          <Row gutter={[24, 16]}>
            <Col xs={24} md={baselineChip ? 12 : 24}>
              <Title level={5} style={{ marginBottom: 12 }}>
                {chip.name} <Tag color="geekblue">{chip.chipType || "GPU"}</Tag>
              </Title>
              <Descriptions column={2} size="small" bordered>
                <Descriptions.Item label="厂商">{chip.manufacturer || "-"}</Descriptions.Item>
                <Descriptions.Item label="架构">{chip.architecture || "-"}</Descriptions.Item>
                <Descriptions.Item label="工艺制程">{chip.processNode || "-"}</Descriptions.Item>
                <Descriptions.Item label="TDP">{chip.tdpWatts ? `${chip.tdpWatts}W` : "-"}</Descriptions.Item>
                <Descriptions.Item label="显存">{chip.memoryGb ? `${chip.memoryGb}GB ${chip.memoryType || ""}` : "-"}</Descriptions.Item>
                <Descriptions.Item label="显存带宽">{chip.memoryBandwidthTbps ? `${chip.memoryBandwidthTbps} TB/s` : "-"}</Descriptions.Item>
                <Descriptions.Item label="FP32">{chip.peakGflopsFp32 ? `${chip.peakGflopsFp32} TFLOPS` : "-"}</Descriptions.Item>
                <Descriptions.Item label="FP16">{chip.peakGflopsFp16 ? `${chip.peakGflopsFp16} TFLOPS` : "-"}</Descriptions.Item>
                <Descriptions.Item label="BF16">{chip.bf16Tflops ? `${chip.bf16Tflops} TFLOPS` : "-"}</Descriptions.Item>
                <Descriptions.Item label="FP8">{chip.fp8Tflops ? `${chip.fp8Tflops} TFLOPS` : "-"}</Descriptions.Item>
                <Descriptions.Item label="INT8">{chip.int8Tops ? `${chip.int8Tops} TOPS` : "-"}</Descriptions.Item>
                <Descriptions.Item label="互联">{chip.interconnectType || "-"}{chip.interconnectBandwidthGbps ? ` (${chip.interconnectBandwidthGbps} Gbps)` : ""}</Descriptions.Item>
                <Descriptions.Item label="精度支持" span={2}>{chip.supportedPrecisions || "-"}</Descriptions.Item>
              </Descriptions>
            </Col>
            {baselineChip && (
              <Col xs={24} md={12}>
                <Title level={5} style={{ marginBottom: 12 }}>
                  {baselineChip.name} <Tag color="orange">基准</Tag>
                </Title>
                <Descriptions column={2} size="small" bordered>
                  <Descriptions.Item label="厂商">{baselineChip.manufacturer || "-"}</Descriptions.Item>
                  <Descriptions.Item label="架构">{baselineChip.architecture || "-"}</Descriptions.Item>
                  <Descriptions.Item label="工艺制程">{baselineChip.processNode || "-"}</Descriptions.Item>
                  <Descriptions.Item label="TDP">{baselineChip.tdpWatts ? `${baselineChip.tdpWatts}W` : "-"}</Descriptions.Item>
                  <Descriptions.Item label="显存">{baselineChip.memoryGb ? `${baselineChip.memoryGb}GB ${baselineChip.memoryType || ""}` : "-"}</Descriptions.Item>
                  <Descriptions.Item label="显存带宽">{baselineChip.memoryBandwidthTbps ? `${baselineChip.memoryBandwidthTbps} TB/s` : "-"}</Descriptions.Item>
                  <Descriptions.Item label="FP32">{baselineChip.peakGflopsFp32 ? `${baselineChip.peakGflopsFp32} TFLOPS` : "-"}</Descriptions.Item>
                  <Descriptions.Item label="FP16">{baselineChip.peakGflopsFp16 ? `${baselineChip.peakGflopsFp16} TFLOPS` : "-"}</Descriptions.Item>
                  <Descriptions.Item label="BF16">{baselineChip.bf16Tflops ? `${baselineChip.bf16Tflops} TFLOPS` : "-"}</Descriptions.Item>
                  <Descriptions.Item label="FP8">{baselineChip.fp8Tflops ? `${baselineChip.fp8Tflops} TFLOPS` : "-"}</Descriptions.Item>
                  <Descriptions.Item label="INT8">{baselineChip.int8Tops ? `${baselineChip.int8Tops} TOPS` : "-"}</Descriptions.Item>
                  <Descriptions.Item label="互联">{baselineChip.interconnectType || "-"}{baselineChip.interconnectBandwidthGbps ? ` (${baselineChip.interconnectBandwidthGbps} Gbps)` : ""}</Descriptions.Item>
                  <Descriptions.Item label="精度支持" span={2}>{baselineChip.supportedPrecisions || "-"}</Descriptions.Item>
                </Descriptions>
              </Col>
            )}
          </Row>

          {/* Comparison table */}
          {baselineChip && (
            <>
              <Divider style={{ margin: "16px 0" }} />
              <Title level={5}>关键指标对比</Title>
              <Table
                dataSource={[
                  { key: "fp32", metric: "FP32 算力", tested: chip.peakGflopsFp32, baseline: baselineChip.peakGflopsFp32, unit: "TFLOPS" },
                  { key: "fp16", metric: "FP16 算力", tested: chip.peakGflopsFp16, baseline: baselineChip.peakGflopsFp16, unit: "TFLOPS" },
                  { key: "bf16", metric: "BF16 算力", tested: chip.bf16Tflops, baseline: baselineChip.bf16Tflops, unit: "TFLOPS" },
                  { key: "fp8", metric: "FP8 算力", tested: chip.fp8Tflops, baseline: baselineChip.fp8Tflops, unit: "TFLOPS" },
                  { key: "int8", metric: "INT8 算力", tested: chip.int8Tops, baseline: baselineChip.int8Tops, unit: "TOPS" },
                  { key: "mem", metric: "显存容量", tested: chip.memoryGb, baseline: baselineChip.memoryGb, unit: "GB" },
                  { key: "bw", metric: "显存带宽", tested: chip.memoryBandwidthTbps, baseline: baselineChip.memoryBandwidthTbps, unit: "TB/s" },
                  { key: "ic", metric: "互联带宽", tested: chip.interconnectBandwidthGbps, baseline: baselineChip.interconnectBandwidthGbps, unit: "Gbps" },
                  { key: "tdp", metric: "TDP", tested: chip.tdpWatts, baseline: baselineChip.tdpWatts, unit: "W" },
                ].filter(r => r.tested != null || r.baseline != null)}
                columns={[
                  { title: "指标", dataIndex: "metric", key: "metric", width: 120 },
                  { title: chip.name || "被测芯片", key: "tested", width: 150, align: "right",
                    render: (_, r) => r.tested != null ? <Text strong>{r.tested} {r.unit}</Text> : <Text type="secondary">—</Text> },
                  { title: baselineChip.name || "基准", key: "baseline", width: 150, align: "right",
                    render: (_, r) => r.baseline != null ? <Text>{r.baseline} {r.unit}</Text> : <Text type="secondary">—</Text> },
                  { title: "对比", key: "ratio", width: 120, align: "center",
                    render: (_, r) => {
                      if (r.tested == null || r.baseline == null || r.baseline === 0) return <Text type="secondary">—</Text>;
                      // For TDP, lower is better
                      const isTdp = r.key === "tdp";
                      const ratio = r.tested / r.baseline;
                      const pct = (ratio * 100).toFixed(0);
                      const color = isTdp
                        ? (ratio <= 1 ? "#52c41a" : ratio <= 1.2 ? "#faad14" : "#ff4d4f")
                        : (ratio >= 1 ? "#52c41a" : ratio >= 0.8 ? "#faad14" : "#ff4d4f");
                      const arrow = isTdp
                        ? (ratio < 1 ? "↓" : ratio > 1 ? "↑" : "=")
                        : (ratio > 1 ? "↑" : ratio < 1 ? "↓" : "=");
                      return <Text strong style={{ color }}>{pct}% {arrow}</Text>;
                    }
                  },
                ]}
                pagination={false}
                size="small"
              />
            </>
          )}
        </Card>
      )}

      {/* ── Section 3: 算子精度 (#165) ── */}
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

      {/* ── Section 4: 算子性能（延迟柱状图 + 排行表） (#165) ── */}
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

      {/* ── Section 5: 模型评测 (#165) ── */}
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

      {/* ── Section 6: 训练性能 (#437) ── */}
      <Card
        title={<Space><ExperimentOutlined style={{ color: "#1890ff" }} /> 训练性能分析</Space>}
        extra={<Tag color={dimScores.training >= 100 ? "green" : dimScores.training >= 80 ? "orange" : "red"}>
          评分: {(dimScores.training || 0).toFixed(1)}% vs {baselineChipName}
        </Tag>}
        style={{ marginBottom: 24 }}
      >
        {/* Training Summary */}
        {trainingSummary ? (
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={6}>
              <Statistic title="训练算子数" value={trainingSummary.operatorCount || 0}
                suffix={`/ ${trainingSummary.validCount || 0} 有效`} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="综合评分" value={(trainingSummary.overallScore || 0).toFixed(1)}
                suffix="% vs L40S"
                valueStyle={{ color: scoreColor(trainingSummary.overallScore || 0) }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="平均延迟" value={(trainingSummary.avgLatencyMs || 0).toFixed(3)}
                suffix="ms" />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="平均吞吐" value={(trainingSummary.avgThroughput || 0).toFixed(1)}
                suffix="ops/s" />
            </Col>
          </Row>
        ) : trainingOps.length === 0 ? (
          <Alert type="info" showIcon message="暂无训练类算子评测数据"
            description="当前评测计划未包含训练相关算子（Backward/Gradient/Optimizer等），如需评估训练性能请添加训练类评测任务。" style={{ marginBottom: 16 }} />
        ) : null}

        {/* Best/Worst training operators */}
        {trainingSummary && (trainingSummary.bestOperator || trainingSummary.worstOperator) && (
          <Row gutter={16} style={{ marginBottom: 16 }}>
            {trainingSummary.bestOperator && (
              <Col xs={12}>
                <Card size="small" style={{ background: "#f6ffed", borderColor: "#b7eb8f" }}>
                  <Text type="secondary">最佳算子</Text>
                  <div><Text strong style={{ fontSize: 16 }}>{trainingSummary.bestOperator}</Text></div>
                  <Text style={{ color: "#52c41a", fontWeight: "bold" }}>{(trainingSummary.bestScore || 0).toFixed(1)}%</Text>
                </Card>
              </Col>
            )}
            {trainingSummary.worstOperator && (
              <Col xs={12}>
                <Card size="small" style={{ background: "#fff2f0", borderColor: "#ffccc7" }}>
                  <Text type="secondary">最弱算子</Text>
                  <div><Text strong style={{ fontSize: 16 }}>{trainingSummary.worstOperator}</Text></div>
                  <Text style={{ color: "#ff4d4f", fontWeight: "bold" }}>{(trainingSummary.worstScore || 0).toFixed(1)}%</Text>
                </Card>
              </Col>
            )}
          </Row>
        )}

        {/* Training throughput table */}
        {trainingOps.length > 0 && (
          <>
            <Title level={5}>训练算子吞吐表</Title>
            <Table
              dataSource={trainingOps}
              columns={[
                { title: "算子", dataIndex: "testItem", key: "testItem",
                  render: t => <Space><ExperimentOutlined />{t}</Space> },
                { title: "延迟(ms)", key: "latency", width: 100, align: "right",
                  render: (_, r) => (r.latencyMean ?? 0).toFixed(2) },
                { title: "吞吐(ops/s)", dataIndex: "throughput", key: "throughput", width: 120, align: "right",
                  render: v => (v ?? 0).toFixed(1) },
                { title: "评分", dataIndex: "score", key: "score", width: 100, align: "center",
                  render: (v, r) => r.dataStatus === "NO_DATA" ? <Text type="secondary">—</Text>
                    : <span style={{ color: scoreColor(v || 0), fontWeight: "bold" }}>{(v || 0).toFixed(1)}%</span> },
                { title: "状态", key: "status", width: 80, align: "center",
                  render: (_, r) => r.passed ? <Tag color="success">PASS</Tag> : <Tag color="error">FAIL</Tag> },
              ]}
              rowKey={(_, idx) => `train-${idx}`}
              pagination={false}
              size="small"
            />
          </>
        )}

        {/* Scalability info */}
        {dimScores.scalability > 0 && (
          <>
            <Divider />
            <Title level={5}>扩展性评估</Title>
            <Row gutter={16}>
              <Col xs={12} md={8}>
                <Statistic title="扩展性评分" value={(dimScores.scalability || 0).toFixed(1)}
                  suffix="% vs L40S"
                  valueStyle={{ color: scoreColor(dimScores.scalability || 0) }} />
              </Col>
              <Col xs={12} md={16}>
                <Alert type={dimScores.scalability >= 100 ? "success" : dimScores.scalability >= 80 ? "warning" : "error"}
                  showIcon
                  message={dimScores.scalability >= 100 ? "多卡扩展性达到或超越 L40S 基准" :
                    dimScores.scalability >= 80 ? "多卡扩展性接近 L40S 基准" :
                    "多卡扩展性低于 L40S 基准，分布式训练效率可能受限"}
                />
              </Col>
            </Row>
          </>
        )}
      </Card>

      {/* ── Section 7: 推理性能 (#437) ── */}
      <Card
        title={<Space><RocketOutlined style={{ color: "#722ed1" }} /> 推理性能分析</Space>}
        extra={<Tag color={dimScores.inference >= 100 ? "green" : dimScores.inference >= 80 ? "orange" : "red"}>
          评分: {(dimScores.inference || 0).toFixed(1)}% vs {baselineChipName}
        </Tag>}
        style={{ marginBottom: 24 }}
      >
        {/* Inference Summary */}
        {inferenceSummary ? (
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={6}>
              <Statistic title="推理算子数" value={inferenceSummary.operatorCount || 0}
                suffix={`/ ${inferenceSummary.validCount || 0} 有效`} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="综合评分" value={(inferenceSummary.overallScore || 0).toFixed(1)}
                suffix="% vs L40S"
                valueStyle={{ color: scoreColor(inferenceSummary.overallScore || 0) }} />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="平均延迟" value={(inferenceSummary.avgLatencyMs || 0).toFixed(3)}
                suffix="ms" />
            </Col>
            <Col xs={12} md={6}>
              <Statistic title="平均吞吐" value={(inferenceSummary.avgThroughput || 0).toFixed(1)}
                suffix="ops/s" />
            </Col>
          </Row>
        ) : inferenceOps.length === 0 ? (
          <Alert type="info" showIcon message="暂无推理类算子评测数据"
            description="当前评测计划未包含推理相关算子（Attention/MLP/BERT等），如需评估推理性能请添加推理类评测任务。" style={{ marginBottom: 16 }} />
        ) : null}

        {/* Best/Worst inference operators */}
        {inferenceSummary && (inferenceSummary.bestOperator || inferenceSummary.worstOperator) && (
          <Row gutter={16} style={{ marginBottom: 16 }}>
            {inferenceSummary.bestOperator && (
              <Col xs={12}>
                <Card size="small" style={{ background: "#f6ffed", borderColor: "#b7eb8f" }}>
                  <Text type="secondary">最佳算子</Text>
                  <div><Text strong style={{ fontSize: 16 }}>{inferenceSummary.bestOperator}</Text></div>
                  <Text style={{ color: "#52c41a", fontWeight: "bold" }}>{(inferenceSummary.bestScore || 0).toFixed(1)}%</Text>
                </Card>
              </Col>
            )}
            {inferenceSummary.worstOperator && (
              <Col xs={12}>
                <Card size="small" style={{ background: "#fff2f0", borderColor: "#ffccc7" }}>
                  <Text type="secondary">最弱算子</Text>
                  <div><Text strong style={{ fontSize: 16 }}>{inferenceSummary.worstOperator}</Text></div>
                  <Text style={{ color: "#ff4d4f", fontWeight: "bold" }}>{(inferenceSummary.worstScore || 0).toFixed(1)}%</Text>
                </Card>
              </Col>
            )}
          </Row>
        )}

        {/* Inference cross-eval table */}
        {inferenceOps.length > 0 && (
          <>
            <Title level={5}>推理算子横评</Title>
            <Table
              dataSource={inferenceOps}
              columns={[
                { title: "算子/模型", dataIndex: "testItem", key: "testItem",
                  render: (t, r) => {
                    const isPrefill = /prefill|encode|prompt/i.test(t);
                    const isDecode = /decode|generate|token/i.test(t);
                    return (
                      <Space>
                        <RocketOutlined />
                        {t}
                        {isPrefill && <Tag color="blue" size="small">Prefill</Tag>}
                        {isDecode && <Tag color="purple" size="small">Decode</Tag>}
                      </Space>
                    );
                  }
                },
                { title: "延迟(ms)", key: "latency", width: 100, align: "right",
                  render: (_, r) => (r.latencyMean ?? 0).toFixed(2) },
                { title: "P95(ms)", key: "p95", width: 100, align: "right",
                  render: (_, r) => (r.latencyP95 ?? 0).toFixed(2) },
                { title: "吞吐(ops/s)", dataIndex: "throughput", key: "throughput", width: 120, align: "right",
                  render: v => (v ?? 0).toFixed(1) },
                { title: "vs L40S", dataIndex: "score", key: "score", width: 100, align: "center",
                  render: (v, r) => r.dataStatus === "NO_DATA" ? <Text type="secondary">—</Text>
                    : <span style={{ color: scoreColor(v || 0), fontWeight: "bold" }}>{(v || 0).toFixed(1)}%</span> },
                { title: "状态", key: "status", width: 80, align: "center",
                  render: (_, r) => r.passed ? <Tag color="success">PASS</Tag> : <Tag color="error">FAIL</Tag> },
              ]}
              rowKey={(_, idx) => `inf-${idx}`}
              pagination={false}
              size="small"
            />
          </>
        )}

        {/* Decode vs Prefill separation */}
        {inferenceOps.length > 0 && (() => {
          const prefillOps = inferenceOps.filter(o => /prefill|encode|prompt/i.test(o.testItem || ""));
          const decodeOps = inferenceOps.filter(o => /decode|generate|token/i.test(o.testItem || ""));
          if (prefillOps.length === 0 && decodeOps.length === 0) return null;
          return (
            <>
              <Divider />
              <Title level={5}>Prefill / Decode 阶段对比</Title>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Card size="small" title="Prefill 阶段" style={{ background: "#e6f7ff", borderColor: "#91d5ff" }}>
                    {prefillOps.length > 0 ? prefillOps.map((op, i) => (
                      <div key={i} style={{ marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                        <Text>{op.testItem}</Text>
                        <Space>
                          <Text type="secondary">{(op.latencyMean ?? 0).toFixed(2)}ms</Text>
                          <Text strong style={{ color: scoreColor(op.score || 0) }}>{(op.score || 0).toFixed(1)}%</Text>
                        </Space>
                      </div>
                    )) : <Text type="secondary">暂无 Prefill 阶段数据</Text>}
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card size="small" title="Decode 阶段" style={{ background: "#f9f0ff", borderColor: "#d3adf7" }}>
                    {decodeOps.length > 0 ? decodeOps.map((op, i) => (
                      <div key={i} style={{ marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                        <Text>{op.testItem}</Text>
                        <Space>
                          <Text type="secondary">{(op.latencyMean ?? 0).toFixed(2)}ms</Text>
                          <Text strong style={{ color: scoreColor(op.score || 0) }}>{(op.score || 0).toFixed(1)}%</Text>
                        </Space>
                      </div>
                    )) : <Text type="secondary">暂无 Decode 阶段数据</Text>}
                  </Card>
                </Col>
              </Row>
            </>
          );
        })()}
      </Card>

      {/* ── Section 8: 瓶颈分析 (#165 增强) ── */}
      <Card
        title={<Space><WarningOutlined style={{ color: "#faad14" }} /> 瓶颈分析与优化建议</Space>}
        style={{ marginBottom: 24 }}
      >
        {Array.isArray(bottleneckData) && bottleneckData.length > 0 ? (
          <Row gutter={[16, 16]}>
            {bottleneckData.filter(item => item.type !== "coverage").map((item, idx) => {
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
              compute: "建议优化矩阵运算核函数，使用 Tensor Core / 硬件加速指令，增大计算并行度",
              memory: "建议优化数据布局减少 cache miss，使用异步拷贝和内存合并访问",
              op_compat: "建议使用快速数学近似实现，检查激活函数是否有硬件原生支持",
              attention: "建议使用 FlashAttention 或分块注意力机制，降低显存占用",
              op_compat: "建议融合归一化与前后算子，减少内存读写次数",
              inference: "建议优化模型图编译，使用算子融合和量化技术提升端到端性能",
            };
            return (
              <div key={key} style={{ marginBottom: 8, padding: "8px 12px", background: score < 60 ? "#fff2f0" : "#fffbe6", borderRadius: 4 }}>
                <Tag color={score < 60 ? "error" : "warning"}>{name} ({score.toFixed(1)}%)</Tag>
                <Text style={{ fontSize: 13 }}>{suggestions[key] || "建议进一步分析该维度性能瓶颈"}</Text>
              </div>
            );
          }).filter(Boolean)}
          {Object.entries(DIM_CN).every(([key]) => (dimScores[key] || 0) >= 80) && (
            <Alert type="success" message="所有维度评分均在 80 分以上，整体表现优秀！" showIcon />
          )}
        </div>
      </Card>

      {/* ── Section 9: 适用场景推荐 (#165) ── */}
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

      {/* ── Section 10: 评测环境 (#165) ── */}
      <Card
        title={<Space><ClockCircleOutlined /> 评测环境</Space>}
        style={{ marginBottom: 24 }}
      >
        <Alert
          type="info" showIcon
          message="CPU 评测模式"
          description="当前评测数据在 CPU 模式下生成。真实 GPU/NPU 评测需连接硬件节点执行。"
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
              <Descriptions.Item label="运行时">CPU 评测 (NumPy + Python 3)</Descriptions.Item>
              <Descriptions.Item label="报告编号">{report.reportNo}</Descriptions.Item>
              <Descriptions.Item label="生成时间">{reportTime}</Descriptions.Item>
              <Descriptions.Item label="报告状态">
                <Tag color={report.status === "PUBLISHED" ? "success" : "default"}>
                  {report.status === "PUBLISHED" ? "已发布" : "草稿"}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
            {(report.executionNodeName || report.executionNodeIp || report.actualChipModel) && (
              <>
                <Title level={5} style={{ marginTop: 16 }}>执行环境</Title>
                <Descriptions column={1} size="small" bordered>
                  {report.executionNodeName && (
                    <Descriptions.Item label="执行节点">{report.executionNodeName}</Descriptions.Item>
                  )}
                  {report.executionNodeIp && (
                    <Descriptions.Item label="节点 IP">{report.executionNodeIp}</Descriptions.Item>
                  )}
                  {report.actualChipModel && (
                    <Descriptions.Item label="实际芯片型号">{report.actualChipModel}</Descriptions.Item>
                  )}
                </Descriptions>
              </>
            )}
          </Col>
        </Row>
      </Card>
      </div>
    </div>
  );
}
