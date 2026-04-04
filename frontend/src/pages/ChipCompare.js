/**
 * @file ChipCompare.js
 * @description 芯片对比页面 — 雷达图 + 维度评分表 + 算子级性能对比
 * Issue: #140
 */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Card, Row, Col, Select, Tag, Table, Typography, Spin, Empty, Button,
  Space, message, Divider, Tooltip,
} from "antd";
import {
  ArrowLeftOutlined, SwapOutlined, DeleteOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text } = Typography;
const { Option } = Select;

/* ── 常量 ── */
const COLORS = ["#1890ff", "#f5222d", "#52c41a", "#fa8c16"];
const COLOR_NAMES = ["蓝", "红", "绿", "橙"];

/* 维度映射：英文 key → 中文标签 */
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

/* ── SVG 雷达图组件 ── */
function RadarChart({ chipData, size = 400 }) {
  const center = size / 2;
  const radius = size * 0.35;
  const levels = 5; // 同心圆层数
  const angleStep = (2 * Math.PI) / DIMENSION_LABELS.length;
  // 起始角度从顶部（-90度）
  const startAngle = -Math.PI / 2;

  // 计算某个维度在给定分数下的坐标
  const getPoint = (index, value) => {
    const angle = startAngle + angleStep * index;
    const r = (value / 100) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  // 生成多边形路径
  const getPolygonPath = (scores) => {
    return DIMENSION_LABELS.map((_, i) => {
      const score = scores[i] || 0;
      const pt = getPoint(i, score);
      return `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`;
    }).join(" ") + " Z";
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", margin: "0 auto" }}>
      {/* 背景同心多边形 */}
      {Array.from({ length: levels }, (_, l) => {
        const levelRadius = ((l + 1) / levels) * radius;
        const points = DIMENSION_LABELS.map((_, i) => {
          const angle = startAngle + angleStep * i;
          return `${(center + levelRadius * Math.cos(angle)).toFixed(2)},${(center + levelRadius * Math.sin(angle)).toFixed(2)}`;
        }).join(" ");
        return (
          <polygon
            key={l}
            points={points}
            fill="none"
            stroke="#e8e8e8"
            strokeWidth={l === levels - 1 ? 1.5 : 0.8}
          />
        );
      })}

      {/* 轴线 */}
      {DIMENSION_LABELS.map((_, i) => {
        const angle = startAngle + angleStep * i;
        const endX = center + radius * Math.cos(angle);
        const endY = center + radius * Math.sin(angle);
        return (
          <line
            key={i}
            x1={center} y1={center}
            x2={endX.toFixed(2)} y2={endY.toFixed(2)}
            stroke="#d9d9d9"
            strokeWidth={0.8}
          />
        );
      })}

      {/* 刻度标签 (20, 40, 60, 80, 100) */}
      {Array.from({ length: levels }, (_, l) => {
        const val = ((l + 1) / levels) * 100;
        const y = center - ((l + 1) / levels) * radius;
        return (
          <text
            key={l}
            x={center + 4}
            y={y + 4}
            fontSize={10}
            fill="#bbb"
          >
            {val}
          </text>
        );
      })}

      {/* 维度标签 */}
      {DIMENSION_LABELS.map((label, i) => {
        const angle = startAngle + angleStep * i;
        const labelR = radius + 28;
        const x = center + labelR * Math.cos(angle);
        const y = center + labelR * Math.sin(angle);
        // 调整文字锚点
        let anchor = "middle";
        if (Math.cos(angle) < -0.1) anchor = "end";
        else if (Math.cos(angle) > 0.1) anchor = "start";
        return (
          <text
            key={i}
            x={x.toFixed(2)}
            y={(y + 4).toFixed(2)}
            fontSize={12}
            fill="#333"
            textAnchor={anchor}
            fontWeight={500}
          >
            {label}
          </text>
        );
      })}

      {/* 芯片数据多边形 */}
      {chipData.map((chip, idx) => (
        <g key={chip.chipId}>
          <path
            d={getPolygonPath(chip.scores)}
            fill={COLORS[idx % COLORS.length]}
            fillOpacity={0.12}
            stroke={COLORS[idx % COLORS.length]}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {/* 数据点 */}
          {chip.scores.map((score, i) => {
            const pt = getPoint(i, score);
            return (
              <circle
                key={i}
                cx={pt.x.toFixed(2)}
                cy={pt.y.toFixed(2)}
                r={3.5}
                fill={COLORS[idx % COLORS.length]}
                stroke="#fff"
                strokeWidth={1.5}
              />
            );
          })}
        </g>
      ))}
    </svg>
  );
}

/* ── SVG 分组柱状图 ── */
function BarChart({ data, chipNames, width = 600, height = 320 }) {
  if (!data || data.length === 0) return <Empty description="暂无数据" />;

  const padding = { top: 30, right: 30, bottom: 60, left: 70 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const chipCount = chipNames.length;
  const barGroupWidth = chartW / data.length;
  const barWidth = Math.min(barGroupWidth * 0.7 / chipCount, 40);
  const barGap = 2;

  // 找到最大值
  const maxVal = Math.max(
    ...data.flatMap((d) => chipNames.map((_, i) => d.values[i] || 0)),
    1
  );
  const yScale = chartH / maxVal;

  // Y 轴刻度
  const yTicks = [];
  const step = Math.ceil(maxVal / 5);
  for (let i = 0; i <= 5; i++) {
    const v = step * i;
    if (v <= maxVal * 1.1) yTicks.push(v);
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", margin: "0 auto" }}>
      {/* Y 轴 */}
      <line
        x1={padding.left} y1={padding.top}
        x2={padding.left} y2={padding.top + chartH}
        stroke="#d9d9d9" strokeWidth={1}
      />
      {/* X 轴 */}
      <line
        x1={padding.left} y1={padding.top + chartH}
        x2={padding.left + chartW} y2={padding.top + chartH}
        stroke="#d9d9d9" strokeWidth={1}
      />

      {/* Y 轴标签 + 网格线 */}
      {yTicks.map((v) => {
        const y = padding.top + chartH - v * yScale;
        return (
          <g key={v}>
            <line
              x1={padding.left} y1={y}
              x2={padding.left + chartW} y2={y}
              stroke="#f0f0f0" strokeWidth={0.8}
            />
            <text x={padding.left - 8} y={y + 4} fontSize={11} fill="#999" textAnchor="end">
              {v.toFixed(1)}
            </text>
          </g>
        );
      })}

      {/* Y 轴标题 */}
      <text
        x={14}
        y={padding.top + chartH / 2}
        fontSize={12}
        fill="#666"
        textAnchor="middle"
        transform={`rotate(-90, 14, ${padding.top + chartH / 2})`}
      >
        延迟 (ms)
      </text>

      {/* 柱子 */}
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
                  <rect
                    x={x} y={y}
                    width={barWidth} height={barH}
                    fill={COLORS[ci % COLORS.length]}
                    rx={2} ry={2}
                    opacity={0.85}
                  />
                  {val > 0 && (
                    <text
                      x={x + barWidth / 2} y={y - 4}
                      fontSize={9} fill="#666" textAnchor="middle"
                    >
                      {val.toFixed(1)}
                    </text>
                  )}
                </g>
              );
            })}
            {/* X 轴标签 */}
            <text
              x={groupX + (chipCount * (barWidth + barGap)) / 2}
              y={padding.top + chartH + 18}
              fontSize={11}
              fill="#333"
              textAnchor="middle"
            >
              {group.operator}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── 主组件 ── */
export default function ChipCompare({ selectedChipIds = [], onBack }) {
  const [allChips, setAllChips] = useState([]);
  const [chipIds, setChipIds] = useState(selectedChipIds);
  const [chipReports, setChipReports] = useState({}); // { chipId: reportData }
  const [chipNames, setChipNames] = useState({}); // { chipId: chipName }
  const [loading, setLoading] = useState(false);
  const [selectedOperators, setSelectedOperators] = useState([]);

  /* 加载芯片列表 */
  useEffect(() => {
    api.get("/chips", { params: { page: 0, size: 200 } })
      .then((res) => {
        if (res.data && res.data.code === 0) {
          setAllChips(res.data.data || []);
          // 建立名称映射
          const nameMap = {};
          (res.data.data || []).forEach((c) => { nameMap[c.id] = c.name; });
          setChipNames(nameMap);
        }
      })
      .catch(() => message.error("加载芯片列表失败"));
  }, []);

  /* 已评测的芯片列表（用于下拉选择） */
  const evaluatedChips = useMemo(
    () => allChips.filter((c) => c.status === "EVALUATED"),
    [allChips]
  );

  /* 加载已选芯片的报告数据 */
  const fetchReports = useCallback(async (ids) => {
    if (ids.length === 0) return;
    setLoading(true);
    try {
      const results = {};
      await Promise.all(
        ids.map(async (chipId) => {
          try {
            const res = await api.get("/chip-reports", { params: { chipId, page: 0, size: 1 } });
            if (res.data && res.data.code === 0 && res.data.data && res.data.data.length > 0) {
              const report = res.data.data[0];
              // 解析 JSON 字段
              let dimensionScores = {};
              let operatorRanking = [];
              try {
                dimensionScores = typeof report.dimensionScores === "string"
                  ? JSON.parse(report.dimensionScores) : (report.dimensionScores || {});
              } catch (_) {}
              try {
                operatorRanking = typeof report.operatorRanking === "string"
                  ? JSON.parse(report.operatorRanking) : (report.operatorRanking || []);
              } catch (_) {}
              results[chipId] = {
                ...report,
                dimensionScores,
                operatorRanking,
              };
            }
          } catch (_) {
            /* 单个芯片加载失败不影响其他 */
          }
        })
      );
      setChipReports((prev) => ({ ...prev, ...results }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (chipIds.length > 0) fetchReports(chipIds);
  }, [chipIds, fetchReports]);

  /* 雷达图数据 */
  const radarData = useMemo(() => {
    return chipIds
      .filter((id) => chipReports[id])
      .map((id) => {
        const ds = chipReports[id].dimensionScores || {};
        return {
          chipId: id,
          chipName: chipNames[id] || `芯片#${id}`,
          scores: DIMENSION_KEYS.map((key) => ds[key] || 0),
        };
      });
  }, [chipIds, chipReports, chipNames]);

  /* 维度评分对比表数据 */
  const dimensionTableData = useMemo(() => {
    const activeIds = chipIds.filter((id) => chipReports[id]);
    return DIMENSION_KEYS.map((key, idx) => {
      const row = { key: idx, dimension: DIMENSION_LABELS[idx] };
      let maxScore = -1;
      let maxChipId = null;
      let minScore = 101;

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
  }, [chipIds, chipReports]);

  /* 算子列表 */
  const allOperators = useMemo(() => {
    const opSet = new Set();
    chipIds.forEach((id) => {
      const ops = chipReports[id]?.operatorRanking || [];
      ops.forEach((o) => {
        if (o.testItem && o.passed !== false) opSet.add(o.testItem);
      });
    });
    return Array.from(opSet).sort();
  }, [chipIds, chipReports]);

  /* 初始化选中算子 */
  useEffect(() => {
    if (allOperators.length > 0 && selectedOperators.length === 0) {
      setSelectedOperators(allOperators.slice(0, Math.min(6, allOperators.length)));
    }
  }, [allOperators, selectedOperators.length]);

  /* 柱状图数据 */
  const barChartData = useMemo(() => {
    const activeIds = chipIds.filter((id) => chipReports[id]);
    return selectedOperators.map((op) => {
      const values = activeIds.map((id) => {
        const ops = chipReports[id]?.operatorRanking || [];
        // 找到该算子中 passed 且分数最高的记录
        const match = ops
          .filter((o) => o.testItem === op && o.passed !== false && o.latencyMean != null)
          .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
        return match ? match.latencyMean : 0;
      });
      return { operator: op, values };
    });
  }, [chipIds, chipReports, selectedOperators]);

  /* 芯片选择变更 */
  const handleChipChange = (newIds) => {
    if (newIds.length > 4) {
      message.warning("最多选择 4 颗芯片进行对比");
      return;
    }
    setChipIds(newIds);
  };

  const removeChip = (id) => {
    setChipIds((prev) => prev.filter((x) => x !== id));
  };

  /* 维度评分对比表列 */
  const activeIds = chipIds.filter((id) => chipReports[id]);
  const dimensionColumns = [
    {
      title: "评测维度",
      dataIndex: "dimension",
      key: "dimension",
      width: 120,
      fixed: "left",
      render: (v) => <Text strong>{v}</Text>,
    },
    ...activeIds.map((id, idx) => ({
      title: (
        <Space>
          <span style={{
            display: "inline-block",
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: COLORS[idx % COLORS.length],
          }} />
          {chipNames[id] || `芯片#${id}`}
        </Space>
      ),
      dataIndex: `chip_${id}`,
      key: `chip_${id}`,
      width: 130,
      align: "center",
      render: (v) => (
        <Text style={{ fontWeight: "bold", color: scoreColor(v || 0) }}>
          {(v || 0).toFixed(1)}
        </Text>
      ),
    })),
    ...(activeIds.length >= 2 ? [{
      title: "差距",
      dataIndex: "gap",
      key: "gap",
      width: 180,
      align: "center",
      render: (gap, record) => {
        const leadIdx = activeIds.indexOf(record.leadChipId);
        const bgColor = gap > 15 ? "#fff1f0" : undefined;
        const borderColor = gap > 15 ? "#ffa39e" : undefined;
        return (
          <div style={{
            backgroundColor: bgColor,
            border: borderColor ? `1px solid ${borderColor}` : undefined,
            borderRadius: 4,
            padding: "2px 8px",
            display: "inline-block",
          }}>
            <Tag
              color={COLORS[leadIdx >= 0 ? leadIdx % COLORS.length : 0]}
              style={{ marginRight: 4 }}
            >
              {chipNames[record.leadChipId] || ""}
            </Tag>
            <Text type={gap > 15 ? "danger" : "secondary"} strong={gap > 15}>
              +{gap.toFixed(1)}
            </Text>
          </div>
        );
      },
    }] : []),
  ];

  const barChipNames = activeIds.map((id) => chipNames[id] || `芯片#${id}`);

  return (
    <div>
      {/* 返回按钮 */}
      {onBack && (
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          style={{ marginBottom: 16, paddingLeft: 0 }}
        >
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
                <Text type="secondary">选择 2-4 颗已评测芯片进行对比</Text>
              </Space>
              <Select
                mode="multiple"
                placeholder="搜索并选择芯片（已评测）"
                value={chipIds}
                onChange={handleChipChange}
                style={{ width: "100%", maxWidth: 600 }}
                optionFilterProp="children"
                maxTagCount={0}
                maxTagPlaceholder={() => null}
              >
                {evaluatedChips.map((c) => (
                  <Option key={c.id} value={c.id}>
                    {c.name} ({c.manufacturer} · {c.chipType})
                  </Option>
                ))}
              </Select>
            </Space>
          </Col>
        </Row>
        {/* 已选芯片标签 */}
        {chipIds.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Space wrap>
              {chipIds.map((id, idx) => (
                <Tag
                  key={id}
                  color={COLORS[idx % COLORS.length]}
                  closable
                  onClose={() => removeChip(id)}
                  style={{ fontSize: 14, padding: "4px 12px" }}
                >
                  {chipNames[id] || `芯片#${id}`}
                </Tag>
              ))}
            </Space>
          </div>
        )}
      </Card>

      {/* 加载中 */}
      {loading && (
        <div style={{ textAlign: "center", padding: 60 }}>
          <Spin size="large" tip="加载报告数据中..." />
        </div>
      )}

      {/* 无数据提示 */}
      {!loading && chipIds.length < 2 && (
        <Card>
          <Empty description="请至少选择 2 颗已评测芯片开始对比" />
        </Card>
      )}

      {/* 有数据展示 */}
      {!loading && activeIds.length >= 2 && (
        <>
          {/* 2. 雷达图对比 */}
          <Card title="维度能力雷达图" style={{ marginBottom: 24 }}>
            <Row gutter={24} align="middle">
              <Col xs={24} md={16}>
                <RadarChart chipData={radarData} size={420} />
              </Col>
              <Col xs={24} md={8}>
                <div style={{ padding: "20px 0" }}>
                  <Title level={5} style={{ marginBottom: 16 }}>图例</Title>
                  {radarData.map((chip, idx) => (
                    <div key={chip.chipId} style={{ marginBottom: 12, display: "flex", alignItems: "center" }}>
                      <span style={{
                        display: "inline-block",
                        width: 16,
                        height: 16,
                        borderRadius: 3,
                        backgroundColor: COLORS[idx % COLORS.length],
                        marginRight: 10,
                        opacity: 0.85,
                      }} />
                      <div>
                        <Text strong>{chip.chipName}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          综合: {chipReports[chip.chipId]?.overallScore?.toFixed(1) || "-"} 分
                        </Text>
                      </div>
                    </div>
                  ))}
                </div>
              </Col>
            </Row>
          </Card>

          {/* 3. 各维度评分对比表 */}
          <Card title="各维度评分对比" style={{ marginBottom: 24 }}>
            <Table
              dataSource={dimensionTableData}
              columns={dimensionColumns}
              pagination={false}
              size="middle"
              scroll={{ x: 600 }}
            />
          </Card>

          {/* 4. 算子级性能对比 */}
          <Card
            title="算子级性能对比"
            extra={
              <Select
                mode="multiple"
                placeholder="选择算子"
                value={selectedOperators}
                onChange={setSelectedOperators}
                style={{ minWidth: 280 }}
                maxTagCount={3}
              >
                {allOperators.map((op) => (
                  <Option key={op} value={op}>{op}</Option>
                ))}
              </Select>
            }
          >
            {selectedOperators.length > 0 ? (
              <>
                {/* 图例 */}
                <div style={{ marginBottom: 16, textAlign: "center" }}>
                  <Space>
                    {activeIds.map((id, idx) => (
                      <Space key={id} size={4}>
                        <span style={{
                          display: "inline-block",
                          width: 14,
                          height: 14,
                          borderRadius: 2,
                          backgroundColor: COLORS[idx % COLORS.length],
                        }} />
                        <Text style={{ fontSize: 12 }}>{chipNames[id] || `芯片#${id}`}</Text>
                      </Space>
                    ))}
                  </Space>
                </div>
                <BarChart
                  data={barChartData}
                  chipNames={barChipNames}
                  width={Math.max(600, selectedOperators.length * 120)}
                  height={320}
                />
              </>
            ) : (
              <Empty description="请选择要对比的算子" />
            )}
          </Card>
        </>
      )}

      {/* 有选芯片但部分无报告数据 */}
      {!loading && chipIds.length >= 2 && activeIds.length < 2 && (
        <Card>
          <Empty description="所选芯片尚无足够的评测报告数据，请选择已评测的芯片" />
        </Card>
      )}
    </div>
  );
}

/* 评分颜色 */
function scoreColor(score) {
  if (score >= 80) return "#52c41a";
  if (score >= 60) return "#1890ff";
  if (score >= 40) return "#faad14";
  return "#ff4d4f";
}
