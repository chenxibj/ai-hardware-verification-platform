/**
 * @file ChipReport.js
 * @description 完整芯片评价报告页面
 * Issue: #141, #165 增强
 *
 * 1. 报告头部信息（报告编号、芯片、时间等）
 * 2. 算子精度（dtype通过率表）
 * 3. 算子性能（延迟柱状图排行 + 吞吐表）
 * 4. 模型评测（模型性能表）
 * 5. 训练性能
 * 6. 推理性能
 * 7. 瓶颈分析 + 优化建议
 * 8. 评测环境
 */
import React, { useState, useEffect, useRef } from "react";
import {
  Card, Row, Col, Statistic, Progress, Table, Tag, Typography,
  Spin, Button, Space, Divider, message, Descriptions, Alert, Empty, Tooltip,
} from "antd";
import {
  ArrowLeftOutlined, TrophyOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ExperimentOutlined, WarningOutlined,
  SafetyCertificateOutlined, ClockCircleOutlined,
  DownloadOutlined,
  ThunderboltOutlined, RocketOutlined, ShareAltOutlined, FileExcelOutlined,
  BulbOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import { exportToPdf, generateReportFilename } from "../utils/exportPdf";
import { useParams, useNavigate } from "react-router-dom";

const { Title, Text } = Typography;

/* 评分颜色映射 — 用于算子表/训练/推理中 vs L40S 百分比着色 */
function scoreColor(score) {
  if (score >= 100) return "#52c41a";
  if (score >= 80) return "#faad14";
  return "#ff4d4f";
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

/* 从真实评测数据提取精度信息（不使用随机数） */
function extractAccuracyData(operators, report) {
  if (!operators || operators.length === 0) return [];
  const metricsSummary = safeParse(report?.metricsSummary);
  if (metricsSummary?.accuracy_checks && Array.isArray(metricsSummary.accuracy_checks)) {
    return metricsSummary.accuracy_checks.map(check => ({
      dtype: check.dtype || "Unknown",
      total: check.total || 0,
      passed: check.passed || 0,
      rate: check.total > 0 ? ((check.passed / check.total) * 100).toFixed(1) : "0",
    }));
  }
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
  const [settingBaseline, setSettingBaseline] = useState(false);

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
        {<Button onClick={() => navigate("/reports")} style={{ marginTop: 16 }} icon={<ArrowLeftOutlined />}>返回</Button>}
      </div>
    );
  }

  // 解析各项数据
  const operators = (safeParse(report.operatorRanking) || []).map(op => ({ ...op, dataStatus: inferDataStatus(op) }));
  const bottleneckData = safeParse(report.bottleneckAnalysis) || [];
  const trainingSummary = safeParse(report.trainingSummary);
  const inferenceSummary = safeParse(report.inferenceSummary);
  const baselineChipName = report.baselineChip || "L40S";

  // Split operators by category
  const trainingOps = operators.filter(o => o.dimension === "训练");
  const inferenceOps = operators.filter(o => o.dimension === "推理");

  const totalOps = operators.length;
  const validOps = operators.filter(o => o.dataStatus === "VALID");
  const noDataOps = operators.filter(o => o.dataStatus === "NO_DATA");
  const failedOps = operators.filter(o => o.dataStatus === "FAILED");
  const passedOps = operators.filter(o => o.passed).length;
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
      title: "vs L40S", dataIndex: "score", key: "score", width: 100, align: "center",
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
    { title: "vs L40S", dataIndex: "score", key: "score", width: 80, align: "center",
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
    const headers = ["排名", "算子名", "维度", "延迟(ms)", "吞吐量", "vs L40S(%)", "数据状态", "通过"];
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

      {/* ── 报告头部信息 ── */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24}>
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

      {/* ── Section 2: 算子精度 ── */}
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

      {/* ── Section 3: 算子性能（延迟柱状图 + 排行表） ── */}
      {operators.length > 0 && (
        <Card
          title={<Space><ThunderboltOutlined style={{ color: "#faad14" }} /> 算子性能排行</Space>}
          style={{ marginBottom: 24 }}
        >
          <Title level={5} style={{ marginBottom: 12 }}>延迟排行</Title>
          {renderLatencyBar()}
          <Divider />
          <Table
            dataSource={operators}
            columns={columns}
            rowKey={(_, idx) => idx}
            pagination={operators.length > 20 ? { pageSize: 20 } : false}
            size="middle"
          />
        </Card>
      )}

      {/* ── Section 4: 模型评测 ── */}
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

      {/* ── Section 5: 训练性能 ── */}
      <Card
        title={<Space><ExperimentOutlined style={{ color: "#1890ff" }} /> 训练性能分析</Space>}
        style={{ marginBottom: 24 }}
      >
        {/* Training Summary */}
        {trainingSummary ? (
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={8}>
              <Statistic title="训练算子数" value={trainingSummary.operatorCount || 0}
                suffix={`/ ${trainingSummary.validCount || 0} 有效`} />
            </Col>
            <Col xs={12} md={8}>
              <Statistic title="平均延迟" value={(trainingSummary.avgLatencyMs || 0).toFixed(3)}
                suffix="ms" />
            </Col>
            <Col xs={12} md={8}>
              <Statistic title="平均吞吐" value={(trainingSummary.avgThroughput || 0).toFixed(1)}
                suffix="ops/s" />
            </Col>
          </Row>
        ) : trainingOps.length === 0 ? (
          <Alert type="info" showIcon message="暂无训练类算子评测数据"
            description="当前评测计划未包含训练相关算子（Backward/Gradient/Optimizer等），如需评估训练性能请添加训练类评测任务。" style={{ marginBottom: 16 }} />
        ) : null}

        {/* Best/Worst training operators (#440: skip if best == worst to avoid contradiction) */}
        {trainingSummary && (trainingSummary.bestOperator || trainingSummary.worstOperator) && (
          <Row gutter={16} style={{ marginBottom: 16 }}>
            {trainingSummary.bestOperator && (
              <Col xs={trainingSummary.worstOperator && trainingSummary.worstOperator !== trainingSummary.bestOperator ? 12 : 24}>
                <Card size="small" style={{ background: "#f6ffed", borderColor: "#b7eb8f" }}>
                  <Text type="secondary">最佳算子</Text>
                  <div><Text strong style={{ fontSize: 16 }}>{trainingSummary.bestOperator}</Text></div>
                  <Text style={{ color: "#52c41a", fontWeight: "bold" }}>{(trainingSummary.bestScore || 0).toFixed(1)}%</Text>
                </Card>
              </Col>
            )}
            {trainingSummary.worstOperator && trainingSummary.worstOperator !== trainingSummary.bestOperator && (
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
                { title: "vs L40S", dataIndex: "score", key: "score", width: 100, align: "center",
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
      </Card>

      {/* ── Section 6: 推理性能 ── */}
      <Card
        title={<Space><RocketOutlined style={{ color: "#722ed1" }} /> 推理性能分析</Space>}
        style={{ marginBottom: 24 }}
      >
        {/* Inference Summary */}
        {inferenceSummary ? (
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={8}>
              <Statistic title="推理算子数" value={inferenceSummary.operatorCount || 0}
                suffix={`/ ${inferenceSummary.validCount || 0} 有效`} />
            </Col>
            <Col xs={12} md={8}>
              <Statistic title="平均延迟" value={(inferenceSummary.avgLatencyMs || 0).toFixed(3)}
                suffix="ms" />
            </Col>
            <Col xs={12} md={8}>
              <Statistic title="平均吞吐" value={(inferenceSummary.avgThroughput || 0).toFixed(1)}
                suffix="ops/s" />
            </Col>
          </Row>
        ) : inferenceOps.length === 0 ? (
          <Alert type="info" showIcon message="暂无推理类算子评测数据"
            description="当前评测计划未包含推理相关算子（Attention/MLP/BERT等），如需评估推理性能请添加推理类评测任务。" style={{ marginBottom: 16 }} />
        ) : null}

        {/* Best/Worst inference operators (#440: skip if best == worst to avoid contradiction) */}
        {inferenceSummary && (inferenceSummary.bestOperator || inferenceSummary.worstOperator) && (
          <Row gutter={16} style={{ marginBottom: 16 }}>
            {inferenceSummary.bestOperator && (
              <Col xs={inferenceSummary.worstOperator && inferenceSummary.worstOperator !== inferenceSummary.bestOperator ? 12 : 24}>
                <Card size="small" style={{ background: "#f6ffed", borderColor: "#b7eb8f" }}>
                  <Text type="secondary">最佳算子</Text>
                  <div><Text strong style={{ fontSize: 16 }}>{inferenceSummary.bestOperator}</Text></div>
                  <Text style={{ color: "#52c41a", fontWeight: "bold" }}>{(inferenceSummary.bestScore || 0).toFixed(1)}%</Text>
                </Card>
              </Col>
            )}
            {inferenceSummary.worstOperator && inferenceSummary.worstOperator !== inferenceSummary.bestOperator && (
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

      {/* ── Section 7: 瓶颈分析 ── */}
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
          {Array.isArray(bottleneckData) && bottleneckData.filter(item => item.type !== "coverage" && item.level !== "info").length > 0 ? (
            bottleneckData.filter(item => item.type !== "coverage" && item.level !== "info").map((item, idx) => {
              const suggestions = {
                worst_operator: "建议优化该算子的核函数实现，检查是否存在不必要的内存拷贝或计算冗余",
                high_volatility: "建议检查系统负载稳定性，排除其他进程干扰，增加评测轮次取平均值",
                weak_dimension: "建议针对该维度进行专项优化，参考基准芯片的实现方案",
              };
              return (
                <div key={idx} style={{ marginBottom: 8, padding: "8px 12px", background: item.level === "error" ? "#fff2f0" : "#fffbe6", borderRadius: 4 }}>
                  <Tag color={item.level === "error" ? "error" : "warning"}>{item.title}</Tag>
                  <Text style={{ fontSize: 13 }}>{suggestions[item.type] || "建议进一步分析该项性能瓶颈"}</Text>
                </div>
              );
            })
          ) : (
            <Alert type="success" message="未发现明显性能瓶颈，整体表现良好！" showIcon />
          )}
        </div>
      </Card>

      {/* ── Section 8: 评测环境 ── */}
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
