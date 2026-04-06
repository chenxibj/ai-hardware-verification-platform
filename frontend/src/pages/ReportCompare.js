/**
 * @file ReportCompare.js
 * @description 多报告对比分析页面 — 综合评分 + 维度对比 + 雷达图叠加 + 关键指标
 * Issue: #170
 */
import React, { useState, useEffect } from "react";
import {
  Card, Row, Col, Table, Tag, Typography, Spin, Empty, Button,
  Space, message, Divider, Statistic,
} from "antd";
import {
  ArrowLeftOutlined, SwapOutlined, StarFilled,
  ThunderboltOutlined, RocketOutlined, CheckCircleOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text } = Typography;

const COLORS = ["#1890ff", "#f5222d", "#52c41a", "#fa8c16"];

const DIMENSION_MAP = {
  compute_perf: "计算性能",
  normalization: "归一化",
  math_func: "数学函数",
  attention: "Attention",
  memory_perf: "访存性能",
  model_inference: "模型推理",
};
const DIMENSION_KEYS = Object.keys(DIMENSION_MAP);
const DIMENSION_LABELS = Object.values(DIMENSION_MAP);

const safeParse = (str) => {
  if (!str) return null;
  if (typeof str === "object") return str;
  try { return JSON.parse(str); } catch (_) { return null; }
};

function scoreColor(score) {
  if (score >= 80) return "#52c41a";
  if (score >= 60) return "#1890ff";
  if (score >= 40) return "#faad14";
  return "#ff4d4f";
}

function scoreGrade(score) {
  if (score >= 90) return { stars: 5, text: "卓越" };
  if (score >= 80) return { stars: 4, text: "优秀" };
  if (score >= 70) return { stars: 3, text: "良好" };
  if (score >= 60) return { stars: 2, text: "一般" };
  return { stars: 1, text: "待改进" };
}

/* ── SVG 雷达图（叠加多组数据）── */
function OverlayRadarChart({ chipData, size = 420 }) {
  const center = size / 2;
  const radius = size * 0.35;
  const levels = 5;
  const angleStep = (2 * Math.PI) / DIMENSION_LABELS.length;
  const startAngle = -Math.PI / 2;

  const getPoint = (index, value) => {
    const angle = startAngle + angleStep * index;
    const r = (value / 100) * radius;
    return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
  };

  const getPolygonPath = (scores) => {
    return DIMENSION_LABELS.map((_, i) => {
      const score = scores[i] || 0;
      const pt = getPoint(i, score);
      return `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`;
    }).join(" ") + " Z";
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", margin: "0 auto" }}>
      {/* 背景网格 */}
      {Array.from({ length: levels }, (_, l) => {
        const lr = ((l + 1) / levels) * radius;
        const pts = DIMENSION_LABELS.map((_, i) => {
          const a = startAngle + angleStep * i;
          return `${(center + lr * Math.cos(a)).toFixed(2)},${(center + lr * Math.sin(a)).toFixed(2)}`;
        }).join(" ");
        return <polygon key={l} points={pts} fill="none" stroke="#e8e8e8" strokeWidth={l === levels - 1 ? 1.5 : 0.8} />;
      })}
      {/* 轴线 */}
      {DIMENSION_LABELS.map((_, i) => {
        const a = startAngle + angleStep * i;
        return (
          <line key={i} x1={center} y1={center}
            x2={center + radius * Math.cos(a)} y2={center + radius * Math.sin(a)}
            stroke="#d9d9d9" strokeWidth={0.8} />
        );
      })}
      {/* 标签 */}
      {DIMENSION_LABELS.map((label, i) => {
        const a = startAngle + angleStep * i;
        const labelR = radius + 24;
        const tx = center + labelR * Math.cos(a);
        const ty = center + labelR * Math.sin(a);
        return (
          <text key={i} x={tx} y={ty} textAnchor="middle" dominantBaseline="middle"
            fontSize={12} fill="#666">{label}</text>
        );
      })}
      {/* 数据层 */}
      {chipData.map((item, idx) => (
        <g key={idx}>
          <path d={getPolygonPath(item.scores)}
            fill={COLORS[idx % COLORS.length]} fillOpacity={0.15}
            stroke={COLORS[idx % COLORS.length]} strokeWidth={2} />
          {item.scores.map((s, i) => {
            const pt = getPoint(i, s);
            return <circle key={i} cx={pt.x} cy={pt.y} r={3.5}
              fill={COLORS[idx % COLORS.length]} stroke="#fff" strokeWidth={1.5} />;
          })}
        </g>
      ))}
      {/* 图例 */}
      {chipData.map((item, idx) => (
        <g key={"legend-" + idx}>
          <rect x={12} y={12 + idx * 22} width={14} height={14} rx={2}
            fill={COLORS[idx % COLORS.length]} fillOpacity={0.3}
            stroke={COLORS[idx % COLORS.length]} strokeWidth={1.5} />
          <text x={32} y={23 + idx * 22} fontSize={12} fill="#333">{item.name}</text>
        </g>
      ))}
    </svg>
  );
}

export default function ReportCompare({ reportIds, onBack }) {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [chipNames, setChipNames] = useState({});
  const [planNames, setPlanNames] = useState({});

  useEffect(() => {
    if (!reportIds || reportIds.length < 2) return;
    setLoading(true);

    api.get("/chip-reports/compare", { params: { ids: reportIds.join(",") } })
      .then(async (res) => {
        if (res.data?.code === 0 && res.data.data) {
          const list = res.data.data;
          setReports(list);

          // Fetch chip/plan names
          const cMap = {};
          const pMap = {};
          await Promise.all([
            ...list.map(r => r.chipId ? api.get("/chips/" + r.chipId).then(cr => {
              if (cr.data?.code === 0) cMap[r.chipId] = cr.data.data?.name || "芯片#" + r.chipId;
            }).catch(() => {}) : Promise.resolve()),
            ...list.map(r => r.planId ? api.get("/plans/" + r.planId).then(pr => {
              if (pr.data?.code === 0) pMap[r.planId] = pr.data.data?.name || "任务#" + r.planId;
            }).catch(() => {}) : Promise.resolve()),
          ]);
          setChipNames(cMap);
          setPlanNames(pMap);
        } else {
          message.error("加载对比数据失败");
        }
      })
      .catch(() => message.error("加载对比数据失败"))
      .finally(() => setLoading(false));
  }, [reportIds]);

  if (loading) {
    return <div style={{ textAlign: "center", padding: 100 }}><Spin size="large" tip="加载对比数据..." /></div>;
  }

  if (reports.length < 2) {
    return (
      <div style={{ textAlign: "center", padding: 100 }}>
        <Empty description="对比数据不足" />
        {onBack && <Button onClick={onBack} style={{ marginTop: 16 }} icon={<ArrowLeftOutlined />}>返回</Button>}
      </div>
    );
  }

  // Parse dimension scores for each report
  const parsed = reports.map(r => {
    const dimScores = safeParse(r.dimensionScores) || {};
    const operators = safeParse(r.operatorRanking) || [];
    const chipName = chipNames[r.chipId] || "芯片#" + r.chipId;
    const totalOps = operators.length;
    const passedOps = operators.filter(o => o.passed).length;
    const passRate = totalOps > 0 ? ((passedOps / totalOps) * 100).toFixed(1) : "N/A";
    const bestLatency = operators.length > 0
      ? Math.min(...operators.map(o => o.latencyMean ?? o.avgLatency ?? Infinity).filter(v => isFinite(v)))
      : null;
    const maxThroughput = operators.length > 0
      ? Math.max(...operators.map(o => o.throughput ?? 0))
      : null;
    return {
      ...r, dimScores, operators, chipName, passRate,
      bestLatency: bestLatency != null && isFinite(bestLatency) ? bestLatency.toFixed(2) : "N/A",
      maxThroughput: maxThroughput != null ? maxThroughput.toFixed(1) : "N/A",
      scores: DIMENSION_KEYS.map(k => dimScores[k] || 0),
    };
  });

  // 维度对比表数据
  const dimensionTableData = DIMENSION_KEYS.map((key, idx) => {
    const row = { key, dimension: DIMENSION_LABELS[idx] };
    parsed.forEach((p, i) => {
      row["report_" + i] = p.dimScores[key] || 0;
    });
    // Find max in this dimension
    const vals = parsed.map(p => p.dimScores[key] || 0);
    row.maxIdx = vals.indexOf(Math.max(...vals));
    return row;
  });

  const dimensionColumns = [
    { title: "评测维度", dataIndex: "dimension", key: "dimension", width: 130,
      render: t => <Text strong>{t}</Text> },
    ...parsed.map((p, i) => ({
      title: <span style={{ color: COLORS[i] }}>{p.chipName}</span>,
      dataIndex: "report_" + i,
      key: "report_" + i,
      width: 120,
      align: "center",
      render: (v, row) => (
        <span style={{
          fontWeight: row.maxIdx === i ? "bold" : "normal",
          color: scoreColor(v),
          fontSize: row.maxIdx === i ? 16 : 14,
        }}>
          {v.toFixed(1)}
          {row.maxIdx === i && <span style={{ marginLeft: 4, fontSize: 11 }}>🏆</span>}
        </span>
      ),
    })),
  ];

  // Radar chart data
  const radarData = parsed.map(p => ({
    name: p.chipName,
    scores: p.scores,
  }));

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row align="middle" gutter={16}>
          <Col>
            <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>
          </Col>
          <Col flex="auto">
            <Title level={4} style={{ margin: 0 }}>
              <SwapOutlined /> 报告对比分析（{parsed.length}份）
            </Title>
          </Col>
        </Row>
      </Card>

      {/* Section 1: 综合评分并排 */}
      <Card title="综合评分对比" style={{ marginBottom: 16 }}>
        <Row gutter={16} justify="center">
          {parsed.map((p, i) => {
            const grade = scoreGrade(p.overallScore || 0);
            return (
              <Col key={i} xs={12} sm={8} md={6}>
                <Card size="small" style={{ textAlign: "center", borderColor: COLORS[i], borderWidth: 2 }}>
                  <div style={{ marginBottom: 8 }}>
                    <Tag color={COLORS[i]}>{p.chipName}</Tag>
                  </div>
                  <div style={{ fontSize: 42, fontWeight: "bold", color: scoreColor(p.overallScore || 0), lineHeight: 1.2 }}>
                    {(p.overallScore || 0).toFixed(1)}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {Array.from({ length: 5 }, (_, j) => (
                      <StarFilled key={j} style={{ color: j < grade.stars ? "#fadb14" : "#e8e8e8", fontSize: 16, marginRight: 2 }} />
                    ))}
                  </div>
                  <Text type="secondary" style={{ fontSize: 13 }}>{grade.text}</Text>
                  <div style={{ marginTop: 8, fontSize: 12, color: "#999" }}>
                    {p.reportNo}
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      </Card>

      {/* Section 2: 维度评分对比表 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="各维度评分对比">
            <Table dataSource={dimensionTableData} columns={dimensionColumns}
              pagination={false} size="small" bordered />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="雷达图叠加对比">
            <OverlayRadarChart chipData={radarData} size={380} />
          </Card>
        </Col>
      </Row>

      {/* Section 3: 关键指标对比 */}
      <Card title="关键指标对比" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          {parsed.map((p, i) => (
            <Col key={i} xs={24} sm={12} md={24 / parsed.length}>
              <Card size="small" style={{ borderTop: `3px solid ${COLORS[i]}` }}>
                <div style={{ marginBottom: 8, textAlign: "center" }}>
                  <Tag color={COLORS[i]}>{p.chipName}</Tag>
                </div>
                <Row gutter={8}>
                  <Col span={8}>
                    <Statistic title={<><ThunderboltOutlined /> 最佳延迟</>}
                      value={p.bestLatency} suffix="ms"
                      valueStyle={{ fontSize: 16, color: COLORS[i] }} />
                  </Col>
                  <Col span={8}>
                    <Statistic title={<><RocketOutlined /> 最高吞吐</>}
                      value={p.maxThroughput} suffix="ops/s"
                      valueStyle={{ fontSize: 16, color: COLORS[i] }} />
                  </Col>
                  <Col span={8}>
                    <Statistic title={<><CheckCircleOutlined /> 通过率</>}
                      value={p.passRate} suffix="%"
                      valueStyle={{ fontSize: 16, color: COLORS[i] }} />
                  </Col>
                </Row>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  );
}
