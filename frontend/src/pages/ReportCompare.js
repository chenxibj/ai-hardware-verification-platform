/**
 * @file ReportCompare.js
 * @description 报告对比结果页 — 6 大模块 + PDF 导出
 * Issue: #447 对比结果页面, #448 PDF 导出
 *
 * 读取 URL ?ids=x,y,z，逐个获取 /api/chip-reports/{id}，前端计算对比。
 * 六个 Section: 总览卡片 / 八维雷达图+维度对比表 / 算子级性能对比 /
 *   训练性能对比 / 推理性能对比 / 关键差异摘要
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Card, Row, Col, Table, Tag, Typography, Spin, Empty, Button,
  Space, message, Select, Alert, Divider, Tooltip,
} from "antd";
import {
  ArrowLeftOutlined, SwapOutlined, StarFilled, DownloadOutlined,
  TrophyOutlined, WarningOutlined, InfoCircleOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import OverlayRadarChart, {
  COMPARE_COLORS,
} from "../components/OverlayRadarChart";
import { useSearchParams, useNavigate } from "react-router-dom";
import { exportToPdf } from "../utils/exportPdf";
import {
  calcVsPct, getMetricDirection, formatVsPct, round2,
} from "../utils/comparison";

const { Title, Text } = Typography;

/* ── 工具函数 ── */

const safeParse = (str) => {
  if (!str) return null;
  if (typeof str === "object") return str;
  try { return JSON.parse(str); } catch { return null; }
};

/** #452 + #454: 英文→中文维度映射表 */
const DIMENSION_KEY_MAP = {
  compute: "计算",
  memory: "访存",
  training: "训练",
  inference: "推理",
  op_compat: "算子兼容",
  scalability: "扩展性",
  ecosystem: "生态",
  communication: "通信",
};

/** 将维度 key 统一为中文显示 */
function normalizeDimKey(key) {
  if (!key) return "其他";
  return DIMENSION_KEY_MAP[key] || key;
}

/** 统一的维度 key 列表（中文，与后端 dimensionScores 一致） */
const ALL_DIMENSIONS = ["计算", "访存", "推理", "算子兼容", "通信", "训练", "扩展性", "生态", "其他"];

/** 评分颜色 */
function scoreColor(score) {
  if (score == null) return "#999";
  if (score >= 100) return "#52c41a";
  if (score >= 80) return "#1890ff";
  if (score >= 60) return "#faad14";
  return "#ff4d4f";
}

/** 评分星级 — #456: 修正边界值，100分=5星 */
function scoreGrade(score) {
  if (score >= 100) return { stars: 5, text: "达到/超越基准" };
  if (score >= 80) return { stars: 4, text: "接近基准" };
  if (score >= 60) return { stars: 3, text: "中等水平" };
  if (score >= 40) return { stars: 2, text: "低于基准" };
  return { stars: 1, text: "显著落后" };
}

/** 格式化时间 */
function fmtTime(ts) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  } catch {
    return String(ts);
  }
}

/** 获取报告的展示名称 */
function getReportLabel(r) {
  return r.chipName || r.actualChipModel || r.reportNo || ("报告#" + r.id);
}

/* ── 组件 ── */

export default function ReportCompare() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const reportIds = useMemo(
    () => searchParams.get("ids")?.split(",").map(Number).filter(Boolean) || [],
    [searchParams],
  );

  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [baselineIdx, setBaselineIdx] = useState(0);
  const [exporting, setExporting] = useState(false);
  const contentRef = useRef(null);

  /* 逐个获取报告 */
  useEffect(() => {
    if (reportIds.length < 2) { setLoading(false); return; }
    setLoading(true);

    Promise.all(
      reportIds.map((id) =>
        api.get("/chip-reports/" + id)
          .then((res) => {
            if (res.data?.code === 0 && res.data.data) return res.data.data;
            return null;
          })
          .catch(() => null),
      ),
    ).then((results) => {
      const valid = results.filter(Boolean);
      if (valid.length < 2) {
        message.error("有效报告不足 2 份，无法对比");
      }
      setReports(valid);
    }).finally(() => setLoading(false));
  }, [reportIds]);

  /* ── 解析每份报告 — #452: 统一维度 key 为中文 ── */
  const parsed = useMemo(() => reports.map((r) => {
    const rawDimScores = safeParse(r.dimensionScores) || {};
    const operators = safeParse(r.operatorRanking) || [];
    const trainingSummary = safeParse(r.trainingSummary);
    const inferenceSummary = safeParse(r.inferenceSummary);
    const label = getReportLabel(r);

    // 将英文维度 key 映射为中文并合并同一维度
    const dimScores = {};
    Object.entries(rawDimScores).forEach(([k, v]) => {
      const normalKey = normalizeDimKey(k);
      // 如果同一中文维度已存在，取较高值（两套体系合并）
      if (dimScores[normalKey] == null || (v != null && v > dimScores[normalKey])) {
        dimScores[normalKey] = v;
      }
    });

    // 算子维度 key 同样归一化
    const normalizedOps = (Array.isArray(operators) ? operators : []).map((op) => ({
      ...op,
      dimension: normalizeDimKey(op.dimension),
    }));

    return {
      ...r,
      dimScores,
      operators: normalizedOps,
      trainingSummary,
      inferenceSummary,
      label,
    };
  }), [reports]);

  /* ── 收集所有出现过的维度 ── */
  const activeDimensions = useMemo(() => {
    const dimSet = new Set();
    parsed.forEach((p) => {
      Object.keys(p.dimScores).forEach((k) => dimSet.add(k));
    });
    // 保持 ALL_DIMENSIONS 的顺序，过滤只保留实际出现的
    const ordered = ALL_DIMENSIONS.filter((d) => dimSet.has(d));
    // 如果有未预定义的维度，追加到末尾
    dimSet.forEach((d) => { if (!ordered.includes(d)) ordered.push(d); });
    return ordered;
  }, [parsed]);

  /* ── 雷达图数据 ── */
  const radarChipData = useMemo(() =>
    parsed.map((p) => ({
      name: p.label,
      scores: activeDimensions.map((d) => Math.min(p.dimScores[d] || 0, 100)),
    })),
    [parsed, activeDimensions],
  );

  /* ── 基准切换：维度 vs% 计算 ── */
  const dimVsPctData = useMemo(() => {
    if (parsed.length < 2) return [];
    const baseline = parsed[baselineIdx];
    return activeDimensions.map((dim) => {
      const row = { key: dim, dimension: dim };
      parsed.forEach((p, i) => {
        const score = p.dimScores[dim];
        row["score_" + i] = score != null ? round2(score) : null;
        if (i === baselineIdx) {
          row["vsPct_" + i] = null; // 基准自身不算 vs%
        } else {
          const bVal = baseline.dimScores[dim];
          if (bVal != null && score != null && bVal > 0 && score > 0) {
            // 维度分数都是 higher_better
            row["vsPct_" + i] = round2(calcVsPct("higher_better", bVal, score));
          } else {
            row["vsPct_" + i] = null;
          }
        }
      });
      // 最高分 index
      const vals = parsed.map((p) => p.dimScores[dim] || 0);
      row.maxIdx = vals.indexOf(Math.max(...vals));
      return row;
    });
  }, [parsed, activeDimensions, baselineIdx]);

  /* ── 算子级对比数据 ── */
  const operatorTableData = useMemo(() => {
    // 收集所有算子
    const opMap = {};
    parsed.forEach((p, i) => {
      p.operators.forEach((op) => {
        const key = op.testItem || op.name;
        if (!key) return;
        if (!opMap[key]) opMap[key] = { key, testItem: key, dimension: op.dimension || "—" };
        opMap[key]["latency_" + i] = op.latencyMean;
        opMap[key]["throughput_" + i] = op.throughput;
        opMap[key]["score_" + i] = op.score;
        opMap[key]["passed_" + i] = op.passed;
        opMap[key]["dataStatus_" + i] = op.dataStatus;
      });
    });
    return Object.values(opMap);
  }, [parsed]);

  /* ── 训练/推理维度对比数据 — #453: 同时从 summary 和 operators 中提取 ── */
  const buildSummaryData = useCallback((summaryKey) => {
    const allItems = {};
    parsed.forEach((p, i) => {
      const summary = p[summaryKey];
      if (!summary) return;
      const ops = Array.isArray(summary) ? summary : (summary.operators || summary.items || []);
      ops.forEach((op) => {
        const key = op.testItem || op.name || op.model;
        if (!key) return;
        if (!allItems[key]) allItems[key] = { key, testItem: key };
        allItems[key]["latency_" + i] = op.latencyMean ?? op.latency;
        allItems[key]["throughput_" + i] = op.throughput;
        allItems[key]["score_" + i] = op.score;
      });
    });
    return Object.values(allItems);
  }, [parsed]);

  /** #453: 从 operators 中按维度过滤出训练/推理类算子 */
  const buildOpsByDimension = useCallback((dimName) => {
    const opMap = {};
    parsed.forEach((p, i) => {
      p.operators.forEach((op) => {
        if (op.dimension !== dimName) return;
        const key = op.testItem || op.name;
        if (!key) return;
        if (!opMap[key]) opMap[key] = { key, testItem: key, dimension: op.dimension || "—" };
        opMap[key]["latency_" + i] = op.latencyMean;
        opMap[key]["throughput_" + i] = op.throughput;
        opMap[key]["score_" + i] = op.score;
        opMap[key]["passed_" + i] = op.passed;
        opMap[key]["dataStatus_" + i] = op.dataStatus;
      });
    });
    return Object.values(opMap);
  }, [parsed]);

  const trainingSummaryData = useMemo(() => buildSummaryData("trainingSummary"), [buildSummaryData]);
  const inferenceSummaryData = useMemo(() => buildSummaryData("inferenceSummary"), [buildSummaryData]);
  const trainingOps = useMemo(() => buildOpsByDimension("训练"), [buildOpsByDimension]);
  const inferenceOps = useMemo(() => buildOpsByDimension("推理"), [buildOpsByDimension]);

  const hasTraining = trainingSummaryData.length > 0 || trainingOps.length > 0;
  const hasInference = inferenceSummaryData.length > 0 || inferenceOps.length > 0;

  /* ── 关键差异摘要 ── */
  const diffSummary = useMemo(() => {
    if (parsed.length < 2) return null;

    // 综合最优
    let bestIdx = 0;
    let bestScore = -1;
    parsed.forEach((p, i) => {
      if ((p.overallScore || 0) > bestScore) {
        bestScore = p.overallScore || 0;
        bestIdx = i;
      }
    });

    // 维度差异最大
    let maxDiffDim = null;
    let maxDiff = 0;
    activeDimensions.forEach((dim) => {
      const scores = parsed.map((p) => p.dimScores[dim] || 0);
      const diff = Math.max(...scores) - Math.min(...scores);
      if (diff > maxDiff) { maxDiff = diff; maxDiffDim = dim; }
    });

    // 共同薄弱点（所有报告该维度均 < 70）
    const weakDims = activeDimensions.filter((dim) =>
      parsed.every((p) => (p.dimScores[dim] || 0) < 70),
    );

    // 各报告的最强/最弱维度
    const perReport = parsed.map((p) => {
      let strongest = null;
      let weakest = null;
      let maxS = -1;
      let minS = Infinity;
      activeDimensions.forEach((dim) => {
        const s = p.dimScores[dim];
        if (s != null && s > maxS) { maxS = s; strongest = dim; }
        if (s != null && s < minS) { minS = s; weakest = dim; }
      });
      return { label: p.label, strongest, weakest, maxS, minS };
    });

    return { bestIdx, bestScore, maxDiffDim, maxDiff, weakDims, perReport };
  }, [parsed, activeDimensions]);

  /* ── PDF 导出 ── */
  const handleExportPdf = useCallback(async () => {
    if (!contentRef.current) return;
    setExporting(true);
    try {
      const reportNos = parsed.map((p) => p.reportNo || ("ID" + p.id));
      const nameStr = reportNos.join("_vs_");
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = "对比报告_" + nameStr + "_" + today + ".pdf";
      await exportToPdf(contentRef.current, filename, { watermark: "AHVP" });
      message.success("PDF 导出成功");
    } catch (err) {
      message.error("PDF 导出失败: " + (err.message || "未知错误"));
    } finally {
      setExporting(false);
    }
  }, [parsed]);

  /* ── 加载状态 ── */
  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 100 }}>
        <Spin size="large" tip="加载对比数据..." />
      </div>
    );
  }

  if (parsed.length < 2) {
    return (
      <div style={{ textAlign: "center", padding: 100 }}>
        <Empty description="对比数据不足（需要至少 2 份报告）" />
        <Button onClick={() => navigate("/reports")} style={{ marginTop: 16 }} icon={<ArrowLeftOutlined />}>
          返回报告列表
        </Button>
      </div>
    );
  }

  /* ── 算子性能对比表列定义 ── */
  const operatorColumns = [
    {
      title: "算子", dataIndex: "testItem", key: "testItem", width: 160, fixed: "left",
      sorter: (a, b) => (a.testItem || "").localeCompare(b.testItem || ""),
    },
    {
      title: "维度", dataIndex: "dimension", key: "dimension", width: 100,
      filters: [...new Set(operatorTableData.map((r) => r.dimension))].map((d) => ({ text: d, value: d })),
      onFilter: (value, record) => record.dimension === value,
    },
    ...parsed.flatMap((p, i) => [
      {
        title: <span style={{ color: COMPARE_COLORS[i % COMPARE_COLORS.length] }}>{p.label} — 延迟(ms)</span>,
        dataIndex: "latency_" + i,
        key: "latency_" + i,
        width: 130,
        align: "right",
        sorter: (a, b) => (a["latency_" + i] ?? Infinity) - (b["latency_" + i] ?? Infinity),
        render: (v) => v != null ? v.toFixed(3) : "—",
      },
      {
        title: <span style={{ color: COMPARE_COLORS[i % COMPARE_COLORS.length] }}>{p.label} — 吞吐</span>,
        dataIndex: "throughput_" + i,
        key: "throughput_" + i,
        width: 130,
        align: "right",
        sorter: (a, b) => (a["throughput_" + i] ?? 0) - (b["throughput_" + i] ?? 0),
        render: (v) => v != null ? v.toFixed(1) : "—",
      },
      {
        title: <span style={{ color: COMPARE_COLORS[i % COMPARE_COLORS.length] }}>{p.label} — 得分</span>,
        dataIndex: "score_" + i,
        key: "score_" + i,
        width: 100,
        align: "center",
        sorter: (a, b) => (a["score_" + i] ?? 0) - (b["score_" + i] ?? 0),
        render: (v, row) => {
          // #455: FAILED/NO_DATA 算子显示 "—" 而非红色 "0"
          const dataStatus = row["dataStatus_" + i];
          if (dataStatus === "FAILED" || dataStatus === "NO_DATA") return "—";
          if (v == null) return "—";
          // score 为 0 且吞吐也为 0 或 null，视为无效数据
          if (v === 0 && (!row["throughput_" + i])) return "—";
          const passed = row["passed_" + i];
          const color = passed === false ? "#ff4d4f" : scoreColor(v);
          return <span style={{ color, fontWeight: 500 }}>{round2(v)}</span>;
        },
      },
    ]),
  ];

  /* ── 训练/推理对比表列定义 ── */
  const buildSummaryColumns = (title) => [
    {
      title: "测试项", dataIndex: "testItem", key: "testItem", width: 160, fixed: "left",
    },
    ...parsed.flatMap((p, i) => [
      {
        title: <span style={{ color: COMPARE_COLORS[i % COMPARE_COLORS.length] }}>{p.label} — 延迟(ms)</span>,
        dataIndex: "latency_" + i, key: "latency_" + i, width: 130, align: "right",
        render: (v) => v != null ? Number(v).toFixed(3) : "—",
      },
      {
        title: <span style={{ color: COMPARE_COLORS[i % COMPARE_COLORS.length] }}>{p.label} — 吞吐</span>,
        dataIndex: "throughput_" + i, key: "throughput_" + i, width: 130, align: "right",
        render: (v) => v != null ? Number(v).toFixed(1) : "—",
      },
      {
        title: <span style={{ color: COMPARE_COLORS[i % COMPARE_COLORS.length] }}>{p.label} — 得分</span>,
        dataIndex: "score_" + i, key: "score_" + i, width: 100, align: "center",
        render: (v) => v != null ? <span style={{ color: scoreColor(v) }}>{round2(v)}</span> : "—",
      },
    ]),
  ];

  /* ── 维度对比表列 ── */
  const dimColumns = [
    {
      title: "评测维度", dataIndex: "dimension", key: "dimension", width: 120,
      render: (t) => <Text strong>{t}</Text>,
    },
    ...parsed.map((p, i) => ({
      title: (
        <span style={{ color: COMPARE_COLORS[i % COMPARE_COLORS.length] }}>
          {p.label}
          {i === baselineIdx && <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>基准</Tag>}
        </span>
      ),
      key: "col_" + i,
      width: 180,
      align: "center",
      render: (_, row) => {
        const score = row["score_" + i];
        const vsPct = row["vsPct_" + i];
        const isBest = row.maxIdx === i;
        if (score == null) return <span style={{ color: "#ccc" }}>—</span>;
        const fmt = formatVsPct(vsPct);
        return (
          <div>
            <span style={{
              fontWeight: isBest ? "bold" : "normal",
              color: scoreColor(score),
              fontSize: isBest ? 16 : 14,
            }}>
              {score.toFixed(1)}
              {isBest && <span style={{ marginLeft: 4, fontSize: 11 }}>🏆</span>}
            </span>
            {vsPct != null && (
              <div style={{ fontSize: 11, color: fmt.color === "green" ? "#52c41a" : fmt.color === "red" ? "#ff4d4f" : "#999" }}>
                vs基准: {fmt.text}
              </div>
            )}
          </div>
        );
      },
    })),
  ];

  /* 修正雷达图: 需要自定义 DIMENSION_LABELS 来适配动态维度 */
  const radarLabels = activeDimensions;

  return (
    <div ref={contentRef}>
      {/* ── 顶部标题栏 ── */}
      <Card style={{ marginBottom: 16 }}>
        <Row align="middle" justify="space-between">
          <Col>
            <Space>
              <Button
                data-html2canvas-ignore
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate("/reports")}
              >
                返回
              </Button>
              <Title level={4} style={{ margin: 0 }}>
                <SwapOutlined /> 报告对比分析（{parsed.length}份）
              </Title>
            </Space>
          </Col>
          <Col data-html2canvas-ignore>
            <Space>
              <span>基准报告：</span>
              <Select
                value={baselineIdx}
                onChange={setBaselineIdx}
                style={{ width: 200 }}
                size="small"
              >
                {parsed.map((p, i) => (
                  <Select.Option key={i} value={i}>{p.label}</Select.Option>
                ))}
              </Select>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={handleExportPdf}
                loading={exporting}
              >
                导出 PDF
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* ── Section 1: 总览卡片 ── */}
      <Card title="📋 总览" style={{ marginBottom: 16 }}>
        <Row gutter={16} justify="center">
          {parsed.map((p, i) => {
            const grade = scoreGrade(p.overallScore || 0);
            const color = COMPARE_COLORS[i % COMPARE_COLORS.length];
            return (
              <Col key={p.id} xs={24} sm={12} md={Math.min(8, Math.floor(24 / parsed.length))}>
                <Card
                  size="small"
                  style={{ textAlign: "center", borderColor: color, borderWidth: 2 }}
                >
                  <Tag color={color} style={{ marginBottom: 8 }}>{p.label}</Tag>
                  <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{p.reportNo}</div>
                  <div style={{
                    fontSize: 42, fontWeight: "bold",
                    color: scoreColor(p.overallScore || 0), lineHeight: 1.2,
                  }}>
                    {(p.overallScore || 0).toFixed(1)}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {Array.from({ length: 5 }, (_, j) => (
                      <StarFilled key={j} style={{ color: j < grade.stars ? "#fadb14" : "#e8e8e8", fontSize: 16, marginRight: 2 }} />
                    ))}
                  </div>
                  <Text type="secondary" style={{ fontSize: 13 }}>{grade.text}</Text>
                  <div style={{ marginTop: 8, fontSize: 12, color: "#888" }}>
                    {fmtTime(p.createdAt)}
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      </Card>

      {/* ── Section 2: 八维雷达图 + 维度对比表 ── */}
      <Card title="📊 维度评分对比" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <Text type="secondary">雷达图叠加对比（评分上限 100）</Text>
            </div>
            <DynamicRadarChart
              chipData={radarChipData}
              dimensionLabels={radarLabels}
              size={400}
            />
          </Col>
          <Col xs={24} md={12}>
            <Table
              dataSource={dimVsPctData}
              columns={dimColumns}
              pagination={false}
              size="small"
              bordered
              scroll={{ x: true }}
            />
          </Col>
        </Row>
      </Card>

      {/* ── Section 3: 算子级性能对比表 ── */}
      <Card title="⚡ 算子级性能对比" style={{ marginBottom: 16 }}>
        {operatorTableData.length > 0 ? (
          <Table
            dataSource={operatorTableData}
            columns={operatorColumns}
            pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => "共 " + t + " 个算子" }}
            size="small"
            bordered
            scroll={{ x: "max-content" }}
          />
        ) : (
          <Empty description="无算子数据" />
        )}
      </Card>

      {/* ── Section 4: 训练性能对比 — #453: 展示 summary + 按维度过滤的算子 ── */}
      <Card title="🏋️ 训练性能对比" style={{ marginBottom: 16 }}>
        {hasTraining ? (
          <>
            {/* 训练摘要卡（如果有 trainingSummary） */}
            {parsed.some((p) => p.trainingSummary) && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="训练摘要"
                description={
                  <Row gutter={16}>
                    {parsed.map((p, i) => {
                      if (!p.trainingSummary) return null;
                      const s = p.trainingSummary;
                      return (
                        <Col key={i}>
                          <Tag color={COMPARE_COLORS[i % COMPARE_COLORS.length]}>{p.label}</Tag>
                          {s.summary || s.description || JSON.stringify(s).slice(0, 120)}
                        </Col>
                      );
                    })}
                  </Row>
                }
              />
            )}
            {/* 训练 Summary 数据表 */}
            {trainingSummaryData.length > 0 && (
              <>
                <Text strong style={{ display: "block", marginBottom: 8 }}>训练 Summary 数据</Text>
                <Table
                  dataSource={trainingSummaryData}
                  columns={buildSummaryColumns("训练")}
                  pagination={false}
                  size="small"
                  bordered
                  scroll={{ x: "max-content" }}
                  style={{ marginBottom: 16 }}
                />
              </>
            )}
            {/* 训练维度算子 */}
            {trainingOps.length > 0 && (
              <>
                <Text strong style={{ display: "block", marginBottom: 8 }}>训练维度算子对比</Text>
                <Table
                  dataSource={trainingOps}
                  columns={operatorColumns}
                  pagination={{ pageSize: 10, showTotal: (t) => "共 " + t + " 个算子" }}
                  size="small"
                  bordered
                  scroll={{ x: "max-content" }}
                />
              </>
            )}
          </>
        ) : (
          <Empty description="暂无训练性能数据" />
        )}
      </Card>

      {/* ── Section 5: 推理性能对比 — #453: 展示 summary + 按维度过滤的算子 ── */}
      <Card title="🚀 推理性能对比" style={{ marginBottom: 16 }}>
        {hasInference ? (
          <>
            {/* 推理摘要卡 */}
            {parsed.some((p) => p.inferenceSummary) && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message="推理摘要"
                description={
                  <Row gutter={16}>
                    {parsed.map((p, i) => {
                      if (!p.inferenceSummary) return null;
                      const s = p.inferenceSummary;
                      return (
                        <Col key={i}>
                          <Tag color={COMPARE_COLORS[i % COMPARE_COLORS.length]}>{p.label}</Tag>
                          {s.summary || s.description || JSON.stringify(s).slice(0, 120)}
                        </Col>
                      );
                    })}
                  </Row>
                }
              />
            )}
            {/* 推理 Summary 数据表 */}
            {inferenceSummaryData.length > 0 && (
              <>
                <Text strong style={{ display: "block", marginBottom: 8 }}>推理 Summary 数据</Text>
                <Table
                  dataSource={inferenceSummaryData}
                  columns={buildSummaryColumns("推理")}
                  pagination={false}
                  size="small"
                  bordered
                  scroll={{ x: "max-content" }}
                  style={{ marginBottom: 16 }}
                />
              </>
            )}
            {/* 推理维度算子 */}
            {inferenceOps.length > 0 && (
              <>
                <Text strong style={{ display: "block", marginBottom: 8 }}>推理维度算子对比</Text>
                <Table
                  dataSource={inferenceOps}
                  columns={operatorColumns}
                  pagination={{ pageSize: 10, showTotal: (t) => "共 " + t + " 个算子" }}
                  size="small"
                  bordered
                  scroll={{ x: "max-content" }}
                />
              </>
            )}
          </>
        ) : (
          <Empty description="暂无推理性能数据" />
        )}
      </Card>

      {/* ── Section 6: 关键差异摘要 ── */}
      {diffSummary && (
        <Card title="📝 关键差异摘要" style={{ marginBottom: 16 }}>
          <div style={{ lineHeight: 2.2 }}>
            <p>
              <TrophyOutlined style={{ color: "#faad14", marginRight: 8 }} />
              <strong>综合最优：</strong>
              <Tag color={COMPARE_COLORS[diffSummary.bestIdx % COMPARE_COLORS.length]}>
                {parsed[diffSummary.bestIdx].label}
              </Tag>
              综合评分 <strong>{round2(diffSummary.bestScore)}</strong> 分
            </p>

            {diffSummary.maxDiffDim && (
              <p>
                <WarningOutlined style={{ color: "#ff4d4f", marginRight: 8 }} />
                <strong>差异最大维度：</strong>「{diffSummary.maxDiffDim}」，
                最大差距 <strong>{round2(diffSummary.maxDiff)}</strong> 分
              </p>
            )}

            {diffSummary.weakDims.length > 0 && (
              <p>
                <InfoCircleOutlined style={{ color: "#faad14", marginRight: 8 }} />
                <strong>共同薄弱点：</strong>
                {diffSummary.weakDims.map((d) => (
                  <Tag key={d} color="warning" style={{ marginRight: 4 }}>{d}</Tag>
                ))}
                <span style={{ color: "#999" }}>（所有报告该维度均 &lt; 70 分）</span>
              </p>
            )}

            <Divider style={{ margin: "12px 0" }} />
            <div style={{ fontSize: 13, color: "#666" }}>
              <strong>各报告特点：</strong>
              {diffSummary.perReport.map((pr, i) => (
                <div key={i} style={{ marginTop: 4 }}>
                  <Tag color={COMPARE_COLORS[i % COMPARE_COLORS.length]}>{pr.label}</Tag>
                  最强维度：<strong>{pr.strongest || "—"}</strong>
                  （{pr.maxS != null && pr.maxS !== -1 ? round2(pr.maxS) + "分" : "—"}）
                  {" "}| 最弱维度：<strong>{pr.weakest || "—"}</strong>
                  （{pr.minS != null && pr.minS !== Infinity ? round2(pr.minS) + "分" : "—"}）
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * 动态维度雷达图 — 支持任意数量的中文维度标签
 * 复用 OverlayRadarChart 的样式风格，但支持动态维度列表
 */
function DynamicRadarChart({ chipData = [], dimensionLabels = [], size = 420 }) {
  if (dimensionLabels.length === 0) {
    return <Empty description="无维度数据" />;
  }

  const center = size / 2;
  const radius = size * 0.35;
  const levels = 5;
  const count = dimensionLabels.length;
  const angleStep = (2 * Math.PI) / count;
  const startAngle = -Math.PI / 2;

  const getPoint = (index, value) => {
    const angle = startAngle + angleStep * index;
    const r = (value / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  const getPolygonPath = (scores) =>
    dimensionLabels.map((_, i) => {
      const pt = getPoint(i, scores[i] || 0);
      return (i === 0 ? "M" : "L") + " " + pt.x.toFixed(2) + " " + pt.y.toFixed(2);
    }).join(" ") + " Z";

  return (
    <svg
      width={size}
      height={size}
      viewBox={"0 0 " + size + " " + size}
      style={{ display: "block", margin: "0 auto" }}
    >
      {/* 背景网格 */}
      {Array.from({ length: levels }, (_, l) => {
        const lr = ((l + 1) / levels) * radius;
        const pts = dimensionLabels.map((_, i) => {
          const a = startAngle + angleStep * i;
          return (center + lr * Math.cos(a)).toFixed(2) + "," + (center + lr * Math.sin(a)).toFixed(2);
        }).join(" ");
        return (
          <polygon key={l} points={pts} fill="none" stroke="#e8e8e8" strokeWidth={l === levels - 1 ? 1.5 : 0.8} />
        );
      })}

      {/* 轴线 */}
      {dimensionLabels.map((_, i) => {
        const a = startAngle + angleStep * i;
        return (
          <line key={i} x1={center} y1={center} x2={center + radius * Math.cos(a)} y2={center + radius * Math.sin(a)} stroke="#d9d9d9" strokeWidth={0.8} />
        );
      })}

      {/* 维度标签 */}
      {dimensionLabels.map((label, i) => {
        const a = startAngle + angleStep * i;
        const labelR = radius + 28;
        return (
          <text key={i} x={center + labelR * Math.cos(a)} y={center + labelR * Math.sin(a)} textAnchor="middle" dominantBaseline="middle" fontSize={12} fill="#666">
            {label}
          </text>
        );
      })}

      {/* 数据多边形 */}
      {chipData.map((item, idx) => {
        const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
        return (
          <g key={idx}>
            <path d={getPolygonPath(item.scores)} fill={color} fillOpacity={0.15} stroke={color} strokeWidth={2} />
            {item.scores.map((s, i) => {
              const pt = getPoint(i, s);
              return (
                <circle key={i} cx={pt.x} cy={pt.y} r={3.5} fill={color} stroke="#fff" strokeWidth={1.5} />
              );
            })}
          </g>
        );
      })}

      {/* 图例 */}
      {chipData.map((item, idx) => {
        const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
        return (
          <g key={"legend-" + idx}>
            <rect x={12} y={12 + idx * 22} width={14} height={14} rx={2} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={1.5} />
            <text x={32} y={23 + idx * 22} fontSize={12} fill="#333">{item.name}</text>
          </g>
        );
      })}
    </svg>
  );
}
