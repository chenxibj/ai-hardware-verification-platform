/**
 * @file ChipCompare.js
 * @description 芯片对比页面 — 多报告对比分析增强
 * Issue: #140 基础, #170 增强 (US-2.2)
 *
 * 增强功能：
 * - 支持 2-5 颗芯片对比
 * - 雷达图叠加 + 维度评分对比表 + 算子级柱状图
 * - 导出对比报告 PDF
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Card, Row, Col, Select, Tag, Table, Typography, Spin, Empty, Button,
  Space, message, Divider, Tooltip, Statistic, Alert,
} from "antd";
import {
  ArrowLeftOutlined, SwapOutlined, DeleteOutlined,
  DownloadOutlined, FilePdfOutlined, TrophyOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import { exportToPdf, generateReportFilename } from "../utils/exportPdf";
import { useSearchParams, useNavigate } from "react-router-dom";

const { Title, Text } = Typography;
const { Option } = Select;

/* ── 常量 ── */
const COLORS = ["#1890ff", "#f5222d", "#52c41a", "#fa8c16", "#722ed1"];
const COLOR_NAMES = ["蓝", "红", "绿", "橙", "紫"];
const MAX_CHIPS = 5;

/* 维度映射 */
const DIMENSION_MAP = {
  compute: "计算",
  op_compat: "归一化",
  op_compat: "算子兼容",
  attention: "Attention",
  memory: "访存",
  inference: "推理",
};
const DIMENSION_KEYS = Object.keys(DIMENSION_MAP);
const DIMENSION_LABELS = Object.values(DIMENSION_MAP);

/* ── SVG 雷达图组件 ── */
function RadarChart({ chipData, size = 420 }) {
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

  const getPolygonPath = (scores) =>
    DIMENSION_LABELS.map((_, i) => {
      const pt = getPoint(i, scores[i] || 0);
      return `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`;
    }).join(" ") + " Z";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", margin: "0 auto" }}>
      {Array.from({ length: levels }, (_, l) => {
        const lr = ((l + 1) / levels) * radius;
        const pts = DIMENSION_LABELS.map((_, i) => {
          const a = startAngle + angleStep * i;
          return `${(center + lr * Math.cos(a)).toFixed(2)},${(center + lr * Math.sin(a)).toFixed(2)}`;
        }).join(" ");
        return <polygon key={l} points={pts} fill="none" stroke="#e8e8e8" strokeWidth={l === levels - 1 ? 1.5 : 0.8} />;
      })}
      {DIMENSION_LABELS.map((_, i) => {
        const a = startAngle + angleStep * i;
        return <line key={i} x1={center} y1={center} x2={(center + radius * Math.cos(a)).toFixed(2)} y2={(center + radius * Math.sin(a)).toFixed(2)} stroke="#d9d9d9" strokeWidth={0.8} />;
      })}
      {Array.from({ length: levels }, (_, l) => {
        const v = ((l + 1) / levels) * 100;
        return <text key={l} x={center + 4} y={center - ((l + 1) / levels) * radius + 4} fontSize={10} fill="#bbb">{v}</text>;
      })}
      {DIMENSION_LABELS.map((label, i) => {
        const a = startAngle + angleStep * i;
        const lr = radius + 28;
        const x = center + lr * Math.cos(a);
        const y = center + lr * Math.sin(a);
        let anchor = "middle";
        if (Math.cos(a) < -0.1) anchor = "end";
        else if (Math.cos(a) > 0.1) anchor = "start";
        return <text key={i} x={x.toFixed(2)} y={(y + 4).toFixed(2)} fontSize={12} fill="#333" textAnchor={anchor} fontWeight={500}>{label}</text>;
      })}
      {chipData.map((chip, idx) => (
        <g key={chip.chipId}>
          <path d={getPolygonPath(chip.scores)} fill={COLORS[idx % COLORS.length]} fillOpacity={0.12} stroke={COLORS[idx % COLORS.length]} strokeWidth={2} strokeLinejoin="round" />
          {chip.scores.map((score, i) => {
            const pt = getPoint(i, score);
            return <circle key={i} cx={pt.x.toFixed(2)} cy={pt.y.toFixed(2)} r={3.5} fill={COLORS[idx % COLORS.length]} stroke="#fff" strokeWidth={1.5} />;
          })}
        </g>
      ))}
    </svg>
  );
}

/* ── SVG 分组柱状图 ── */
function BarChart({ data, chipNames, width = 700, height = 340 }) {
  if (!data || data.length === 0) return <Empty description="暂无数据" />;
  const padding = { top: 30, right: 30, bottom: 60, left: 70 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const chipCount = chipNames.length;
  const barGroupWidth = chartW / data.length;
  const barWidth = Math.min(barGroupWidth * 0.7 / chipCount, 36);
  const barGap = 2;
  const maxVal = Math.max(...data.flatMap((d) => chipNames.map((_, i) => d.values[i] || 0)), 1);
  const yScale = chartH / maxVal;
  const yTicks = [];
  const step = Math.ceil(maxVal / 5);
  for (let i = 0; i <= 5; i++) { const v = step * i; if (v <= maxVal * 1.1) yTicks.push(v); }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", margin: "0 auto" }}>
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + chartH} stroke="#d9d9d9" strokeWidth={1} />
      <line x1={padding.left} y1={padding.top + chartH} x2={padding.left + chartW} y2={padding.top + chartH} stroke="#d9d9d9" strokeWidth={1} />
      {yTicks.map((v) => {
        const y = padding.top + chartH - v * yScale;
        return (
          <g key={v}>
            <line x1={padding.left} y1={y} x2={padding.left + chartW} y2={y} stroke="#f0f0f0" strokeWidth={0.8} />
            <text x={padding.left - 8} y={y + 4} fontSize={11} fill="#999" textAnchor="end">{v.toFixed(1)}</text>
          </g>
        );
      })}
      <text x={14} y={padding.top + chartH / 2} fontSize={12} fill="#666" textAnchor="middle" transform={`rotate(-90, 14, ${padding.top + chartH / 2})`}>延迟 (ms)</text>
      {data.map((group, gi) => {
        const groupX = padding.left + gi * barGroupWidth + barGroupWidth * 0.15;
        return (
          <g key={group.operator}>
            {chipNames.map((_, ci) => {
              const val = group.values[ci] || 0;
              const barH = val * yScale;
              const x = groupX + ci * (barWidth + barGap);
              const y = padding.top + chartH - barH;
              return (
                <g key={ci}>
                  <rect x={x} y={y} width={barWidth} height={barH} fill={COLORS[ci % COLORS.length]} rx={2} ry={2} opacity={0.85} />
                  {val > 0 && <text x={x + barWidth / 2} y={y - 4} fontSize={9} fill="#666" textAnchor="middle">{val.toFixed(1)}</text>}
                </g>
              );
            })}
            <text x={groupX + (chipCount * (barWidth + barGap)) / 2} y={padding.top + chartH + 18} fontSize={11} fill="#333" textAnchor="middle">{group.operator}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── 主组件 ── */
export default function ChipCompare() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedChipIds = searchParams.get("ids")?.split(",").map(Number).filter(Boolean) || [];
  const [allChips, setAllChips] = useState([]);
  const [chipIds, setChipIds] = useState(selectedChipIds);
  const [chipReports, setChipReports] = useState({});
  const [chipNames, setChipNames] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedOperators, setSelectedOperators] = useState([]);
  const [exporting, setExporting] = useState(false);
  const compareRef = useRef(null);

  useEffect(() => {
    api.get("/chips", { params: { page: 0, size: 200 } })
      .then((res) => {
        if (res.data?.code === 0) {
          setAllChips(res.data.data || []);
          const nameMap = {};
          (res.data.data || []).forEach((c) => { nameMap[c.id] = c.name; });
          setChipNames(nameMap);
        }
      })
      .catch(() => message.error("加载芯片列表失败"));
  }, []);

  const evaluatedChips = useMemo(() => allChips.filter((c) => c.status === "EVALUATED"), [allChips]);

  const fetchReports = useCallback(async (ids) => {
    if (ids.length === 0) return;
    setLoading(true);
    try {
      const results = {};
      await Promise.all(
        ids.map(async (chipId) => {
          try {
            const res = await api.get("/chip-reports", { params: { chipId, page: 0, size: 1 } });
            if (res.data?.code === 0 && res.data.data?.length > 0) {
              const report = res.data.data[0];
              let dimensionScores = {};
              let operatorRanking = [];
              try { dimensionScores = typeof report.dimensionScores === "string" ? JSON.parse(report.dimensionScores) : (report.dimensionScores || {}); } catch (_) {}
              try { operatorRanking = typeof report.operatorRanking === "string" ? JSON.parse(report.operatorRanking) : (report.operatorRanking || []); } catch (_) {}
              results[chipId] = { ...report, dimensionScores, operatorRanking };
            }
          } catch (_) {}
        })
      );
      setChipReports((prev) => ({ ...prev, ...results }));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (chipIds.length > 0) fetchReports(chipIds); }, [chipIds, fetchReports]);

  /* 雷达图数据 */
  const radarData = useMemo(() =>
    chipIds.filter((id) => chipReports[id]).map((id) => ({
      chipId: id,
      chipName: chipNames[id] || `芯片#${id}`,
      scores: DIMENSION_KEYS.map((key) => chipReports[id]?.dimensionScores?.[key] || 0),
    })), [chipIds, chipReports, chipNames]);

  /* 维度表数据 */
  const activeIds = chipIds.filter((id) => chipReports[id]);
  const dimensionTableData = useMemo(() => {
    return DIMENSION_KEYS.map((key, idx) => {
      const row = { key: idx, dimension: DIMENSION_LABELS[idx] };
      let maxScore = -1, maxChipId = null, minScore = 101;
      activeIds.forEach((id) => {
        const score = chipReports[id]?.dimensionScores?.[key] || 0;
        row[`chip_${id}`] = score;
        if (score > maxScore) { maxScore = score; maxChipId = id; }
        if (score < minScore) { minScore = score; }
      });
      row.gap = maxScore - minScore;
      row.leadChipId = maxChipId;
      return row;
    });
  }, [chipIds, chipReports, activeIds]);

  /* 算子列表 */
  const allOperators = useMemo(() => {
    const opSet = new Set();
    chipIds.forEach((id) => {
      (chipReports[id]?.operatorRanking || []).forEach((o) => { if (o.testItem && o.passed !== false) opSet.add(o.testItem); });
    });
    return Array.from(opSet).sort();
  }, [chipIds, chipReports]);

  useEffect(() => {
    if (allOperators.length > 0 && selectedOperators.length === 0) {
      setSelectedOperators(allOperators.slice(0, Math.min(8, allOperators.length)));
    }
  }, [allOperators, selectedOperators.length]);

  /* 柱状图数据 */
  const barChartData = useMemo(() => {
    return selectedOperators.map((op) => ({
      operator: op,
      values: activeIds.map((id) => {
        const ops = chipReports[id]?.operatorRanking || [];
        const match = ops.filter((o) => o.testItem === op && o.passed !== false && o.latencyMean != null)
          .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
        return match ? match.latencyMean : 0;
      }),
    }));
  }, [chipIds, chipReports, selectedOperators, activeIds]);

  const handleChipChange = (newIds) => {
    if (newIds.length > MAX_CHIPS) {
      message.warning(`最多选择 ${MAX_CHIPS} 颗芯片进行对比`);
      return;
    }
    setChipIds(newIds);
  };

  const removeChip = (id) => setChipIds((prev) => prev.filter((x) => x !== id));

  /* #170: 导出对比报告 PDF */
  const handleExportPdf = async () => {
    if (!compareRef.current) return;
    setExporting(true);
    try {
      const names = activeIds.map(id => chipNames[id] || `芯片${id}`).join("-vs-");
      await exportToPdf(compareRef.current, `对比报告-${names}.pdf`);
      message.success("对比报告 PDF 导出成功");
    } catch (e) {
      message.error("导出失败: " + e.message);
    } finally {
      setExporting(false);
    }
  };

  /* 维度评分对比表列 */
  const dimensionColumns = [
    { title: "评测维度", dataIndex: "dimension", key: "dimension", width: 120, fixed: "left", render: (v) => <Text strong>{v}</Text> },
    ...activeIds.map((id, idx) => ({
      title: (
        <Space>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", backgroundColor: COLORS[idx % COLORS.length] }} />
          {chipNames[id] || `芯片#${id}`}
        </Space>
      ),
      dataIndex: `chip_${id}`, key: `chip_${id}`, width: 130, align: "center",
      render: (v) => <Text style={{ fontWeight: "bold", color: scoreColor(v || 0) }}>{(v || 0).toFixed(1)}</Text>,
    })),
    ...(activeIds.length >= 2 ? [{
      title: "差距", dataIndex: "gap", key: "gap", width: 180, align: "center",
      render: (gap, record) => {
        const leadIdx = activeIds.indexOf(record.leadChipId);
        return (
          <div style={{
            backgroundColor: gap > 15 ? "#fff1f0" : undefined,
            border: gap > 15 ? "1px solid #ffa39e" : undefined,
            borderRadius: 4, padding: "2px 8px", display: "inline-block",
          }}>
            <Tag color={COLORS[leadIdx >= 0 ? leadIdx % COLORS.length : 0]} style={{ marginRight: 4 }}>
              {chipNames[record.leadChipId] || ""}
            </Tag>
            <Text type={gap > 15 ? "danger" : "secondary"} strong={gap > 15}>+{gap.toFixed(1)}</Text>
          </div>
        );
      },
    }] : []),
  ];

  /* 综合评分对比摘要 */
  const scoreSummary = useMemo(() => {
    if (activeIds.length < 2) return null;
    const items = activeIds.map(id => ({
      id, name: chipNames[id] || `芯片#${id}`, score: chipReports[id]?.overallScore || 0,
    })).sort((a, b) => b.score - a.score);
    return items;
  }, [activeIds, chipReports, chipNames]);

  const barChipNames = activeIds.map((id) => chipNames[id] || `芯片#${id}`);

  return (
    <div>
      {true && (
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate("/chips")} style={{ marginBottom: 16, paddingLeft: 0 }}>
          返回芯片列表
        </Button>
      )}

      {/* 1. 芯片选择区 */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Space direction="vertical" style={{ width: "100%" }}>
              <Space>
                <SwapOutlined style={{ fontSize: 18, color: "#1890ff" }} />
                <Title level={4} style={{ margin: 0 }}>芯片对比</Title>
                <Text type="secondary">选择 2-{MAX_CHIPS} 颗已评测芯片进行对比</Text>
              </Space>
              <Select
                mode="multiple" placeholder="搜索并选择芯片（已评测）"
                value={chipIds} onChange={handleChipChange}
                style={{ width: "100%", maxWidth: 700 }}
                optionFilterProp="children" maxTagCount={0} maxTagPlaceholder={() => null}
              >
                {evaluatedChips.map((c) => (
                  <Option key={c.id} value={c.id}>{c.name} ({c.manufacturer} · {c.chipType})</Option>
                ))}
              </Select>
            </Space>
          </Col>
          <Col>
            {activeIds.length >= 2 && (
              <Button type="primary" icon={<FilePdfOutlined />} loading={exporting} onClick={handleExportPdf}>
                导出对比报告 PDF
              </Button>
            )}
          </Col>
        </Row>
        {chipIds.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Space wrap>
              {chipIds.map((id, idx) => (
                <Tag key={id} color={COLORS[idx % COLORS.length]} closable onClose={() => removeChip(id)} style={{ fontSize: 14, padding: "4px 12px" }}>
                  {chipNames[id] || `芯片#${id}`}
                </Tag>
              ))}
            </Space>
          </div>
        )}
      </Card>

      {loading && <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" tip="加载报告数据中..." /></div>}
      {!loading && chipIds.length < 2 && <Card><Empty description="请至少选择 2 颗已评测芯片开始对比" /></Card>}

      {/* 对比内容区 */}
      {!loading && activeIds.length >= 2 && (
        <div ref={compareRef}>
          {/* 综合评分对比卡片 */}
          {scoreSummary && (
            <Card title={<span><TrophyOutlined style={{ marginRight: 8, color: "#faad14" }} />综合评分对比</span>} style={{ marginBottom: 24 }}>
              <Row gutter={16}>
                {scoreSummary.map((item, idx) => (
                  <Col key={item.id} xs={24} sm={12} md={Math.floor(24 / scoreSummary.length)}>
                    <Card size="small" style={{ textAlign: "center", border: idx === 0 ? "2px solid #52c41a" : undefined }}>
                      {idx === 0 && <Tag color="gold" style={{ position: "absolute", top: 4, right: 4 }}>🏆 第一</Tag>}
                      <div style={{ fontSize: 32, fontWeight: "bold", color: COLORS[activeIds.indexOf(item.id) % COLORS.length] }}>
                        {item.score.toFixed(1)}
                      </div>
                      <Text strong>{item.name}</Text>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>
          )}

          {/* 2. 雷达图 */}
          <Card title="维度能力雷达图" style={{ marginBottom: 24 }}>
            <Row gutter={24} align="middle">
              <Col xs={24} md={16}><RadarChart chipData={radarData} size={420} /></Col>
              <Col xs={24} md={8}>
                <div style={{ padding: "20px 0" }}>
                  <Title level={5} style={{ marginBottom: 16 }}>图例</Title>
                  {radarData.map((chip, idx) => (
                    <div key={chip.chipId} style={{ marginBottom: 12, display: "flex", alignItems: "center" }}>
                      <span style={{ display: "inline-block", width: 16, height: 16, borderRadius: 3, backgroundColor: COLORS[idx % COLORS.length], marginRight: 10, opacity: 0.85 }} />
                      <div>
                        <Text strong>{chip.chipName}</Text><br />
                        <Text type="secondary" style={{ fontSize: 12 }}>综合: {chipReports[chip.chipId]?.overallScore?.toFixed(1) || "-"} 分</Text>
                      </div>
                    </div>
                  ))}
                </div>
              </Col>
            </Row>
          </Card>

          {/* 3. 维度评分对比表 */}
          <Card title="各维度评分对比" style={{ marginBottom: 24 }}>
            <Table dataSource={dimensionTableData} columns={dimensionColumns} pagination={false} size="middle" scroll={{ x: 600 }} />
          </Card>

          {/* 4. 算子级性能对比 */}
          <Card
            title="算子级性能对比"
            style={{ marginBottom: 24 }}
            extra={
              <Select mode="multiple" placeholder="选择算子" value={selectedOperators} onChange={setSelectedOperators} style={{ minWidth: 300 }} maxTagCount={3}>
                {allOperators.map((op) => <Option key={op} value={op}>{op}</Option>)}
              </Select>
            }
          >
            {selectedOperators.length > 0 ? (
              <>
                <div style={{ marginBottom: 16, textAlign: "center" }}>
                  <Space>
                    {activeIds.map((id, idx) => (
                      <Space key={id} size={4}>
                        <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 2, backgroundColor: COLORS[idx % COLORS.length] }} />
                        <Text style={{ fontSize: 12 }}>{chipNames[id] || `芯片#${id}`}</Text>
                      </Space>
                    ))}
                  </Space>
                </div>
                <BarChart data={barChartData} chipNames={barChipNames} width={Math.max(700, selectedOperators.length * 130)} height={340} />
              </>
            ) : <Empty description="请选择要对比的算子" />}
          </Card>
        </div>
      )}

      {!loading && chipIds.length >= 2 && activeIds.length < 2 && (
        <Card><Empty description="所选芯片尚无足够的评测报告数据" /></Card>
      )}
    </div>
  );
}

function scoreColor(score) {
  if (score >= 80) return "#52c41a";
  if (score >= 60) return "#1890ff";
  if (score >= 40) return "#faad14";
  return "#ff4d4f";
}
