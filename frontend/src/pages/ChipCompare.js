/**
 * @file ChipCompare.js
 * @description 芯片对比页 — 多芯片能力对比分析
 * Issue: #140
 *
 * 功能:
 *   1. 芯片选择器（2-4 颗已评测芯片）
 *   2. 雷达图叠加对比
 *   3. 各维度评分对比表（差距 >= 15 高亮）
 *   4. 算子级性能对比（分组柱状图）
 *   5. 导出对比报告按钮（占位）
 */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Card, Select, Table, Tag, Typography, Row, Col, Space, Button,
  Spin, Empty, message, Alert, Divider, Tooltip,
} from "antd";
import {
  SwapOutlined, DownloadOutlined, ExperimentOutlined,
  BarChartOutlined, RadarChartOutlined, InfoCircleOutlined,
} from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import RadarChart, { DIMENSIONS } from "../components/RadarChart";
import api from "../utils/api";

const { Title, Text } = Typography;

/* ── 常量 ── */
const COMPARE_COLORS = ["#1890ff", "#52c41a", "#fa8c16", "#f5222d"];
const DIM_KEY_MAP = {
  compute_perf: "计算性能",
  memory_perf: "访存性能",
  math_func: "数学函数",
  attention: "Attention能力",
  normalization: "归一化性能",
  model_inference: "模型推理",
};
const DIM_KEYS = Object.keys(DIM_KEY_MAP);

const safeParse = (str) => {
  if (!str) return null;
  if (typeof str === "object") return str;
  try { return JSON.parse(str); } catch (_) { return null; }
};

export default function ChipCompare() {
  /* ── 状态 ── */
  const [chips, setChips] = useState([]);            // 全部已评测芯片
  const [chipsLoading, setChipsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]); // 选中芯片 IDs
  const [reports, setReports] = useState({});          // chipId -> report
  const [reportsLoading, setReportsLoading] = useState(false);
  const [selectedOperator, setSelectedOperator] = useState(null); // 选中算子

  /* ── 加载已评测芯片列表 ── */
  useEffect(() => {
    setChipsLoading(true);
    api.get("/chips", { params: { status: "EVALUATED", size: 100 } })
      .then((res) => {
        if (res.data && res.data.code === 0) {
          setChips(res.data.data || []);
        }
      })
      .catch(() => message.error("加载芯片列表失败"))
      .finally(() => setChipsLoading(false));
  }, []);

  /* ── 选中芯片变化时加载对应报告 ── */
  useEffect(() => {
    if (selectedIds.length === 0) {
      setReports({});
      setSelectedOperator(null);
      return;
    }

    setReportsLoading(true);
    const promises = selectedIds.map((chipId) =>
      api.get("/chip-reports/chip/" + chipId)
        .then((res) => {
          if (res.data && res.data.code === 0) {
            const list = res.data.data || [];
            // 取最新的一份报告
            return { chipId, report: list.length > 0 ? list[list.length - 1] : null };
          }
          return { chipId, report: null };
        })
        .catch(() => ({ chipId, report: null }))
    );

    Promise.all(promises).then((results) => {
      const map = {};
      results.forEach(({ chipId, report }) => {
        if (report) map[chipId] = report;
      });
      setReports(map);
      setSelectedOperator(null);
    }).finally(() => setReportsLoading(false));
  }, [selectedIds]);

  /* ── 选中芯片的详细信息 ── */
  const selectedChips = useMemo(
    () => selectedIds.map((id) => chips.find((c) => c.id === id)).filter(Boolean),
    [selectedIds, chips]
  );

  /* ── 雷达图 datasets ── */
  const radarDatasets = useMemo(() => {
    return selectedChips.map((chip, idx) => {
      const report = reports[chip.id];
      const radarData = report ? safeParse(report.radarData) || [] : [];
      return {
        name: chip.name,
        data: radarData,
        color: COMPARE_COLORS[idx % COMPARE_COLORS.length],
      };
    });
  }, [selectedChips, reports]);

  /* ── 维度评分对比表数据 ── */
  const dimensionTableData = useMemo(() => {
    if (selectedChips.length < 2) return [];

    return DIM_KEYS.map((key) => {
      const dimName = DIM_KEY_MAP[key];
      const row = { key, dimension: dimName };
      let maxScore = -1;
      let minScore = 101;
      let maxChip = "";
      let minChip = "";

      selectedChips.forEach((chip) => {
        const report = reports[chip.id];
        const dimScores = report ? safeParse(report.dimensionScores) || {} : {};
        const score = dimScores[key] || 0;
        row["chip_" + chip.id] = score;
        if (score > maxScore) { maxScore = score; maxChip = chip.name; }
        if (score < minScore) { minScore = score; minChip = chip.name; }
      });

      const gap = Math.round((maxScore - minScore) * 10) / 10;
      row.gap = gap;
      row.leader = maxChip;
      row.isSignificant = gap >= 15;
      return row;
    });
  }, [selectedChips, reports]);

  /* ── 维度对比表列定义 ── */
  const dimensionColumns = useMemo(() => {
    const cols = [
      {
        title: "评测维度",
        dataIndex: "dimension",
        key: "dimension",
        width: 130,
        fixed: "left",
        render: (text) => <Text strong>{text}</Text>,
      },
    ];

    selectedChips.forEach((chip, idx) => {
      const c = COMPARE_COLORS[idx % COMPARE_COLORS.length];
      cols.push({
        title: (
          <Space>
            <span style={{
              display: "inline-block", width: 10, height: 10,
              borderRadius: "50%", backgroundColor: c,
            }} />
            {chip.name}
          </Space>
        ),
        dataIndex: "chip_" + chip.id,
        key: "chip_" + chip.id,
        width: 120,
        align: "center",
        render: (score) => {
          const color = score >= 80 ? "#52c41a" : score >= 60 ? "#1890ff" : score >= 40 ? "#faad14" : "#ff4d4f";
          return <span style={{ color, fontWeight: "bold", fontSize: 15 }}>{(score || 0).toFixed(1)}</span>;
        },
      });
    });

    cols.push({
      title: "差距",
      dataIndex: "gap",
      key: "gap",
      width: 150,
      align: "center",
      render: (gap, record) => {
        if (gap === 0) return <Tag color="default">持平</Tag>;
        const isHigh = record.isSignificant;
        return (
          <Space>
            <span style={{
              color: isHigh ? "#ff4d4f" : "#666",
              fontWeight: isHigh ? "bold" : "normal",
              fontSize: isHigh ? 15 : 13,
            }}>
              {gap.toFixed(1)}
            </span>
            <Tag color={isHigh ? "red" : "blue"}>
              {record.leader} 领先
            </Tag>
          </Space>
        );
      },
      sorter: (a, b) => a.gap - b.gap,
    });

    return cols;
  }, [selectedChips]);

  /* ── 算子列表（合并所有芯片的算子） ── */
  const allOperators = useMemo(() => {
    const opSet = new Set();
    selectedChips.forEach((chip) => {
      const report = reports[chip.id];
      const ops = report ? safeParse(report.operatorRanking) || [] : [];
      ops.forEach((op) => {
        const name = op.testItem || op.name;
        if (name) opSet.add(name);
      });
    });
    return Array.from(opSet).sort();
  }, [selectedChips, reports]);

  /* ── 算子柱状图 ECharts option ── */
  const operatorChartOption = useMemo(() => {
    if (!selectedOperator || selectedChips.length === 0) return null;

    const chipNames = selectedChips.map((c) => c.name);
    const latencyValues = [];
    const throughputValues = [];

    selectedChips.forEach((chip, idx) => {
      const report = reports[chip.id];
      const ops = report ? safeParse(report.operatorRanking) || [] : [];
      const op = ops.find((o) => (o.testItem || o.name) === selectedOperator);
      latencyValues.push(op ? (op.latencyMean ?? op.avgLatency ?? 0) : 0);
      throughputValues.push(op ? (op.throughput ?? 0) : 0);
    });

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
      },
      legend: { data: ["延迟 (ms)", "吞吐量"], bottom: 0 },
      grid: { left: "3%", right: "4%", bottom: "15%", containLabel: true },
      xAxis: {
        type: "category",
        data: chipNames,
        axisLabel: { fontSize: 13 },
      },
      yAxis: [
        {
          type: "value",
          name: "延迟 (ms)",
          position: "left",
          axisLabel: { formatter: "{value} ms" },
        },
        {
          type: "value",
          name: "吞吐量",
          position: "right",
        },
      ],
      series: [
        {
          name: "延迟 (ms)",
          type: "bar",
          yAxisIndex: 0,
          data: latencyValues.map((v, i) => ({
            value: Math.round(v * 100) / 100,
            itemStyle: { color: COMPARE_COLORS[i % COMPARE_COLORS.length] },
          })),
          barMaxWidth: 50,
          label: {
            show: true,
            position: "top",
            formatter: (p) => p.value > 0 ? p.value.toFixed(2) : "",
            fontSize: 11,
          },
        },
        {
          name: "吞吐量",
          type: "bar",
          yAxisIndex: 1,
          data: throughputValues.map((v, i) => ({
            value: Math.round(v * 10) / 10,
            itemStyle: {
              color: COMPARE_COLORS[i % COMPARE_COLORS.length],
              opacity: 0.6,
            },
          })),
          barMaxWidth: 50,
          label: {
            show: true,
            position: "top",
            formatter: (p) => p.value > 0 ? p.value.toFixed(1) : "",
            fontSize: 11,
          },
        },
      ],
    };
  }, [selectedOperator, selectedChips, reports]);

  /* ── 多算子对比柱状图 (无选择算子时，显示综合评分对比) ── */
  const overviewChartOption = useMemo(() => {
    if (selectedChips.length < 2) return null;

    const chipNames = selectedChips.map((c) => c.name);
    const scores = selectedChips.map((chip) => {
      const report = reports[chip.id];
      return report ? (report.overallScore || 0) : 0;
    });

    return {
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: "3%", right: "4%", bottom: "8%", containLabel: true },
      xAxis: {
        type: "category",
        data: chipNames,
        axisLabel: { fontSize: 13 },
      },
      yAxis: {
        type: "value",
        name: "综合评分",
        max: 100,
      },
      series: [
        {
          type: "bar",
          data: scores.map((v, i) => ({
            value: Math.round(v * 10) / 10,
            itemStyle: {
              color: COMPARE_COLORS[i % COMPARE_COLORS.length],
              borderRadius: [6, 6, 0, 0],
            },
          })),
          barMaxWidth: 60,
          label: {
            show: true,
            position: "top",
            formatter: (p) => p.value.toFixed(1),
            fontSize: 13,
            fontWeight: "bold",
          },
        },
      ],
    };
  }, [selectedChips, reports]);

  /* ── 处理芯片选择变化 ── */
  const handleChipChange = useCallback((ids) => {
    if (ids.length > 4) {
      message.warning("最多选择 4 颗芯片进行对比");
      return;
    }
    setSelectedIds(ids);
  }, []);

  /* ── 导出（占位） ── */
  const handleExport = useCallback(() => {
    message.info("对比报告导出功能开发中，敬请期待...");
  }, []);

  /* ── 有效对比条件 ── */
  const hasEnoughChips = selectedIds.length >= 2;
  const hasReports = Object.keys(reports).length >= 2;
  const canCompare = hasEnoughChips && hasReports && !reportsLoading;

  return (
    <div>
      {/* ── 芯片选择器 ── */}
      <Card
        title={
          <Space>
            <SwapOutlined style={{ color: "#1890ff" }} />
            <span>芯片对比分析</span>
          </Space>
        }
        extra={
          <Button
            icon={<DownloadOutlined />}
            disabled={!canCompare}
            onClick={handleExport}
          >
            导出对比报告
          </Button>
        }
        style={{ marginBottom: 24 }}
      >
        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          message="选择 2-4 颗已完成评测的芯片进行对比分析"
          style={{ marginBottom: 16 }}
        />
        <Select
          mode="multiple"
          placeholder="请选择要对比的芯片（2-4 颗）"
          value={selectedIds}
          onChange={handleChipChange}
          loading={chipsLoading}
          style={{ width: "100%" }}
          size="large"
          maxTagCount={4}
          optionFilterProp="label"
          options={chips.map((chip) => ({
            value: chip.id,
            label: `${chip.name}（${chip.manufacturer} · ${chip.chipType}）`,
          }))}
          tagRender={({ label, value, closable, onClose }) => {
            const idx = selectedIds.indexOf(value);
            const c = COMPARE_COLORS[idx >= 0 ? idx % COMPARE_COLORS.length : 0];
            return (
              <Tag
                color={c}
                closable={closable}
                onClose={onClose}
                style={{ marginRight: 4, fontSize: 13 }}
              >
                {label}
              </Tag>
            );
          }}
        />
        {selectedIds.length === 1 && (
          <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
            请至少再选择 1 颗芯片开始对比
          </Text>
        )}
      </Card>

      {/* ── 加载中 ── */}
      {reportsLoading && (
        <div style={{ textAlign: "center", padding: 60 }}>
          <Spin size="large" tip="加载评测报告中..." />
        </div>
      )}

      {/* ── 无选择提示 ── */}
      {!reportsLoading && !hasEnoughChips && (
        <Card>
          <Empty
            description="请在上方选择 2-4 颗芯片开始对比"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      )}

      {/* ── 对比内容 ── */}
      {canCompare && (
        <>
          {/* 综合评分对比 + 雷达图 */}
          <Card
            title={
              <Space>
                <RadarChartOutlined style={{ color: "#1890ff" }} />
                <span>能力画像对比</span>
              </Space>
            }
            style={{ marginBottom: 24 }}
          >
            <Row gutter={24}>
              <Col xs={24} lg={14}>
                <RadarChart
                  datasets={radarDatasets}
                  height={420}
                  showLabel={false}
                  fillOpacity={0.15}
                />
              </Col>
              <Col xs={24} lg={10}>
                {overviewChartOption && (
                  <ReactECharts
                    option={overviewChartOption}
                    style={{ height: "420px" }}
                    opts={{ renderer: "canvas" }}
                  />
                )}
              </Col>
            </Row>
          </Card>

          {/* 维度评分对比表 */}
          <Card
            title="各维度评分对比"
            style={{ marginBottom: 24 }}
          >
            <Table
              dataSource={dimensionTableData}
              columns={dimensionColumns}
              pagination={false}
              size="middle"
              bordered
              scroll={{ x: "max-content" }}
              summary={() => {
                if (selectedChips.length < 2) return null;
                // 总结行：综合评分
                return (
                  <Table.Summary.Row style={{ background: "#fafafa" }}>
                    <Table.Summary.Cell index={0}>
                      <Text strong>综合评分</Text>
                    </Table.Summary.Cell>
                    {selectedChips.map((chip, idx) => {
                      const report = reports[chip.id];
                      const score = report ? (report.overallScore || 0) : 0;
                      const color = score >= 80 ? "#52c41a" : score >= 60 ? "#1890ff" : "#faad14";
                      return (
                        <Table.Summary.Cell key={chip.id} index={idx + 1} align="center">
                          <span style={{ color, fontWeight: "bold", fontSize: 16 }}>
                            {score.toFixed(1)}
                          </span>
                        </Table.Summary.Cell>
                      );
                    })}
                    <Table.Summary.Cell index={selectedChips.length + 1} align="center">
                      {(() => {
                        const scores = selectedChips.map((c) => {
                          const r = reports[c.id];
                          return r ? (r.overallScore || 0) : 0;
                        });
                        const max = Math.max(...scores);
                        const min = Math.min(...scores);
                        const gap = Math.round((max - min) * 10) / 10;
                        const leaderIdx = scores.indexOf(max);
                        const leader = selectedChips[leaderIdx]?.name || "";
                        return gap > 0 ? (
                          <Space>
                            <span style={{ fontWeight: "bold", fontSize: 15 }}>{gap.toFixed(1)}</span>
                            <Tag color="blue">{leader} 领先</Tag>
                          </Space>
                        ) : (
                          <Tag color="default">持平</Tag>
                        );
                      })()}
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                );
              }}
            />
          </Card>

          {/* 算子级性能对比 */}
          <Card
            title={
              <Space>
                <BarChartOutlined style={{ color: "#1890ff" }} />
                <span>算子级性能对比</span>
              </Space>
            }
            style={{ marginBottom: 24 }}
          >
            {allOperators.length > 0 ? (
              <>
                <div style={{ marginBottom: 16 }}>
                  <Space>
                    <Text>选择算子：</Text>
                    <Select
                      placeholder="选择要对比的算子"
                      value={selectedOperator}
                      onChange={setSelectedOperator}
                      style={{ minWidth: 260 }}
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      options={allOperators.map((op) => ({
                        value: op,
                        label: op,
                      }))}
                    />
                  </Space>
                </div>

                {selectedOperator && operatorChartOption ? (
                  <ReactECharts
                    option={operatorChartOption}
                    style={{ height: "360px" }}
                    opts={{ renderer: "canvas" }}
                  />
                ) : (
                  <OperatorSummaryTable
                    chips={selectedChips}
                    reports={reports}
                    colors={COMPARE_COLORS}
                    onSelectOp={setSelectedOperator}
                  />
                )}
              </>
            ) : (
              <Empty description="选中芯片暂无算子评测数据" />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* ── 算子总览表（未选择具体算子时显示） ── */
function OperatorSummaryTable({ chips, reports, colors, onSelectOp }) {
  // 收集所有算子并合并各芯片的评分
  const data = useMemo(() => {
    const opMap = {};

    chips.forEach((chip) => {
      const report = reports[chip.id];
      const ops = report ? safeParse(report.operatorRanking) || [] : [];
      ops.forEach((op) => {
        const name = op.testItem || op.name;
        if (!name) return;
        if (!opMap[name]) {
          opMap[name] = { name, dimension: op.dimension || "其他" };
        }
        opMap[name]["score_" + chip.id] = op.score || 0;
        opMap[name]["latency_" + chip.id] = op.latencyMean ?? op.avgLatency ?? 0;
      });
    });

    return Object.values(opMap).sort((a, b) => {
      // 按第一颗芯片评分降序
      const scoreA = a["score_" + chips[0]?.id] || 0;
      const scoreB = b["score_" + chips[0]?.id] || 0;
      return scoreB - scoreA;
    });
  }, [chips, reports]);

  const columns = useMemo(() => {
    const cols = [
      {
        title: "算子名",
        dataIndex: "name",
        key: "name",
        width: 180,
        fixed: "left",
        render: (text, record) => (
          <Space>
            <ExperimentOutlined />
            <a onClick={() => onSelectOp(text)} style={{ cursor: "pointer" }}>{text}</a>
            <Tag>{record.dimension}</Tag>
          </Space>
        ),
      },
    ];

    chips.forEach((chip, idx) => {
      const c = colors[idx % colors.length];
      cols.push({
        title: (
          <Tooltip title={chip.name + " 评分"}>
            <Space>
              <span style={{
                display: "inline-block", width: 8, height: 8,
                borderRadius: "50%", backgroundColor: c,
              }} />
              <span style={{ fontSize: 12 }}>{chip.name}</span>
            </Space>
          </Tooltip>
        ),
        dataIndex: "score_" + chip.id,
        key: "score_" + chip.id,
        width: 100,
        align: "center",
        render: (score) => {
          const v = score || 0;
          const color = v >= 80 ? "#52c41a" : v >= 60 ? "#1890ff" : v >= 40 ? "#faad14" : "#ff4d4f";
          return <span style={{ color, fontWeight: "bold" }}>{v.toFixed(1)}</span>;
        },
        sorter: (a, b) => (a["score_" + chip.id] || 0) - (b["score_" + chip.id] || 0),
      });
    });

    return cols;
  }, [chips, colors, onSelectOp]);

  if (data.length === 0) {
    return <Empty description="无算子数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <>
      <Alert
        type="info"
        message="点击算子名称可查看详细的延迟/吞吐对比柱状图"
        style={{ marginBottom: 12 }}
        showIcon
        closable
      />
      <Table
        dataSource={data}
        columns={columns}
        rowKey="name"
        size="small"
        pagination={data.length > 15 ? { pageSize: 15 } : false}
        scroll={{ x: "max-content" }}
      />
    </>
  );
}
