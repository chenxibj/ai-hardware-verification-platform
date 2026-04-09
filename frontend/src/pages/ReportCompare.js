/**
 * @file ReportCompare.js
 * @description 报告对比结果展示 — 综合评分 + 维度对比表 + 雷达图 + 关键指标
 *
 * 接收 reportIds 数组，调用 /api/chip-reports/compare?ids=x,y 获取数据并渲染。
 * 雷达图使用公共组件 OverlayRadarChart，维度常量从其中导入。
 */
import React, { useState, useEffect } from "react";
import {
  Card, Row, Col, Table, Tag, Typography, Spin, Empty, Button,
  Space, message, Statistic,
} from "antd";
import {
  ArrowLeftOutlined, SwapOutlined, StarFilled,
  ThunderboltOutlined, RocketOutlined, CheckCircleOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import OverlayRadarChart, {
  COMPARE_COLORS, DIMENSION_MAP, DIMENSION_KEYS, DIMENSION_LABELS,
} from "../components/OverlayRadarChart";

const { Title, Text } = Typography;

/** 安全 JSON 解析 — 处理后端返回的字符串/对象两种格式 */
const safeParse = (str) => {
  if (!str) return null;
  if (typeof str === "object") return str;
  try { return JSON.parse(str); } catch { return null; }
};

/** 评分颜色 */
function scoreColor(score) {
  if (score >= 80) return "#52c41a";
  if (score >= 60) return "#1890ff";
  if (score >= 40) return "#faad14";
  return "#ff4d4f";
}

/** 评分星级 */
function scoreGrade(score) {
  if (score >= 90) return { stars: 5, text: "卓越" };
  if (score >= 80) return { stars: 4, text: "优秀" };
  if (score >= 70) return { stars: 3, text: "良好" };
  if (score >= 60) return { stars: 2, text: "一般" };
  return { stars: 1, text: "待改进" };
}

export default function ReportCompare({ reportIds, onBack }) {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [chipNames, setChipNames] = useState({});

  useEffect(() => {
    if (!reportIds || reportIds.length < 2) return;
    setLoading(true);

    api.get("/chip-reports/compare", { params: { ids: reportIds.join(",") } })
      .then(async (res) => {
        if (res.data?.code === 0 && res.data.data) {
          const list = res.data.data.reports || res.data.data;
          setReports(Array.isArray(list) ? list : []);

          /* 获取芯片名称用于展示 */
          const cMap = {};
          await Promise.all(
            list.map((r) =>
              r.chipId
                ? api.get("/chips/" + r.chipId)
                    .then((cr) => {
                      if (cr.data?.code === 0) {
                        cMap[r.chipId] = cr.data.data?.name || "芯片#" + r.chipId;
                      }
                    })
                    .catch(() => {})
                : Promise.resolve()
            )
          );
          setChipNames(cMap);
        } else {
          message.error("加载对比数据失败");
        }
      })
      .catch(() => message.error("加载对比数据失败"))
      .finally(() => setLoading(false));
  }, [reportIds]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 100 }}>
        <Spin size="large" tip="加载对比数据..." />
      </div>
    );
  }

  if (reports.length < 2) {
    return (
      <div style={{ textAlign: "center", padding: 100 }}>
        <Empty description="对比数据不足" />
        {onBack && (
          <Button onClick={onBack} style={{ marginTop: 16 }} icon={<ArrowLeftOutlined />}>
            返回
          </Button>
        )}
      </div>
    );
  }

  /* ── 解析每份报告的维度数据 ── */
  const parsed = reports.map((r) => {
    /* compare API 返回的 dimensions 已是对象，原始 dimensionScores 可能是字符串 */
    const dimScores = r.dimensions || safeParse(r.dimensionScores) || {};
    const operators = r.operatorRanking || safeParse(r.operatorRanking) || [];
    const chipName = chipNames[r.chipId] || r.reportNo || "报告#" + r.id;
    const totalOps = Array.isArray(operators) ? operators.length : 0;
    const passedOps = Array.isArray(operators) ? operators.filter((o) => o.passed).length : 0;
    const passRate = totalOps > 0 ? ((passedOps / totalOps) * 100).toFixed(1) : "N/A";
    const latencies = Array.isArray(operators)
      ? operators.map((o) => o.latencyMean ?? Infinity).filter((v) => isFinite(v))
      : [];
    const throughputs = Array.isArray(operators) ? operators.map((o) => o.throughput ?? 0) : [];

    return {
      ...r,
      dimScores,
      chipName,
      passRate,
      bestLatency: latencies.length > 0 ? Math.min(...latencies).toFixed(2) : "N/A",
      maxThroughput: throughputs.length > 0 ? Math.max(...throughputs).toFixed(1) : "N/A",
      scores: DIMENSION_KEYS.map((k) => dimScores[k] || 0),
    };
  });

  /* ── 维度对比表 ── */
  const dimTableData = DIMENSION_KEYS.map((key, idx) => {
    const row = { key, dimension: DIMENSION_LABELS[idx] };
    parsed.forEach((p, i) => { row["report_" + i] = p.dimScores[key] || 0; });
    const vals = parsed.map((p) => p.dimScores[key] || 0);
    row.maxIdx = vals.indexOf(Math.max(...vals));
    return row;
  });

  const dimColumns = [
    {
      title: "评测维度", dataIndex: "dimension", key: "dimension", width: 130,
      render: (t) => <Text strong>{t}</Text>,
    },
    ...parsed.map((p, i) => ({
      title: <span style={{ color: COMPARE_COLORS[i] }}>{p.chipName}</span>,
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

  /* ── 雷达图数据 ── */
  const radarData = parsed.map((p) => ({ name: p.chipName, scores: p.scores }));

  return (
    <div>
      {/* 顶部标题栏 */}
      <Card style={{ marginBottom: 16 }}>
        <Row align="middle" gutter={16}>
          <Col>
            {onBack && <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回</Button>}
          </Col>
          <Col flex="auto">
            <Title level={4} style={{ margin: 0 }}>
              <SwapOutlined /> 报告对比分析（{parsed.length}份）
            </Title>
          </Col>
        </Row>
      </Card>

      {/* 综合评分并排 */}
      <Card title="综合评分对比" style={{ marginBottom: 16 }}>
        <Row gutter={16} justify="center">
          {parsed.map((p, i) => {
            const grade = scoreGrade(p.overallScore || 0);
            return (
              <Col key={i} xs={12} sm={8} md={6}>
                <Card size="small" style={{ textAlign: "center", borderColor: COMPARE_COLORS[i], borderWidth: 2 }}>
                  <div style={{ marginBottom: 8 }}>
                    <Tag color={COMPARE_COLORS[i]}>{p.chipName}</Tag>
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
                  <div style={{ marginTop: 8, fontSize: 12, color: "#999" }}>{p.reportNo}</div>
                </Card>
              </Col>
            );
          })}
        </Row>
      </Card>

      {/* 维度评分 + 雷达图 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="各维度评分对比">
            <Table
              dataSource={dimTableData}
              columns={dimColumns}
              pagination={false}
              size="small"
              bordered
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="雷达图叠加对比">
            <OverlayRadarChart chipData={radarData} size={380} />
          </Card>
        </Col>
      </Row>

      {/* 关键指标对比 */}
      <Card title="关键指标对比" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          {parsed.map((p, i) => (
            <Col key={i} xs={24} sm={12} md={24 / parsed.length}>
              <Card size="small" style={{ borderTop: `3px solid ${COMPARE_COLORS[i]}` }}>
                <div style={{ marginBottom: 8, textAlign: "center" }}>
                  <Tag color={COMPARE_COLORS[i]}>{p.chipName}</Tag>
                </div>
                <Row gutter={8}>
                  <Col span={8}>
                    <Statistic
                      title={<><ThunderboltOutlined /> 最佳延迟</>}
                      value={p.bestLatency}
                      suffix="ms"
                      valueStyle={{ fontSize: 16, color: COMPARE_COLORS[i] }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title={<><RocketOutlined /> 最高吞吐</>}
                      value={p.maxThroughput}
                      suffix="ops/s"
                      valueStyle={{ fontSize: 16, color: COMPARE_COLORS[i] }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title={<><CheckCircleOutlined /> 通过率</>}
                      value={p.passRate}
                      suffix="%"
                      valueStyle={{ fontSize: 16, color: COMPARE_COLORS[i] }}
                    />
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
