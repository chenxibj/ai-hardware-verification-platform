/**
 * @file RadarChart.js
 * @description 六维能力雷达图组件 — 可复用于芯片档案页、报告页、对比页
 * Issue: #139, #140
 *
 * 单数据集模式 (向后兼容):
 *   data      - 数组 [{dimension: "计算性能", score: 82.1}, ...]
 *   color     - 主色调 (默认 '#1890ff')
 *
 * 多数据集模式 (对比页):
 *   datasets  - 数组 [{name: "芯片A", data: [{dimension, score}], color: '#1890ff'}, ...]
 *
 * 通用 Props:
 *   width     - 宽度 (默认 '100%')
 *   height    - 高度 (默认 400)
 *   showLabel - 是否显示分数标签 (默认 true)
 *   fillOpacity - 填充透明度 (默认 0.25)
 */
import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";

/* 六维固定轴（顺序固定，保证雷达图一致性） */
const DIMENSIONS = [
  "计算性能",
  "访存性能",
  "数学函数",
  "Attention能力",
  "归一化性能",
  "模型推理",
];

/* 默认多芯片颜色 */
const DEFAULT_COLORS = ["#1890ff", "#52c41a", "#fa8c16", "#f5222d"];

export default function RadarChart({
  data = [],
  datasets = null,
  width = "100%",
  height = 400,
  showLabel = true,
  color = "#1890ff",
  fillOpacity = 0.25,
}) {
  const option = useMemo(() => {
    // 构建 indicator（固定 6 维，max=100）
    const indicator = DIMENSIONS.map((dim) => ({
      name: dim,
      max: 100,
    }));

    // 判断是多数据集模式还是单数据集模式
    const isMulti = datasets && datasets.length > 0;

    // 辅助函数：将 data 数组转换为按 DIMENSIONS 顺序排列的 values
    // #288: 构建 dataStatus map 以区分 0 分 vs 未评测
    const toValues = (items) => {
      const scoreMap = {};
      const statusMap = {};
      (items || []).forEach((item) => {
        if (item && item.dimension != null) {
          scoreMap[item.dimension] = item.score || 0;
          statusMap[item.dimension] = item.dataStatus || "VALID";
        }
      });
      return DIMENSIONS.map((dim) => {
        const score = scoreMap[dim];
        const status = statusMap[dim];
        // #288: 当 score=0 且 dataStatus=NO_DATA 时，用 null 标记未评测
        if ((score == null || score === 0) && status === "NO_DATA") return null;
        return score != null ? Math.round(score * 10) / 10 : 0;
      });
    };

    // #288: 构建 dataStatus 快速查表
    const buildStatusMap = (items) => {
      const m = {};
      (items || []).forEach((item) => {
        if (item && item.dimension != null) m[item.dimension] = item.dataStatus || "VALID";
      });
      return m;
    };

    let seriesData;
    let legendData;

    if (isMulti) {
      // 多数据集模式（对比页）
      legendData = datasets.map((ds) => ds.name);
      seriesData = datasets.map((ds, idx) => {
        const c = ds.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length];
        return {
          value: toValues(ds.data),
          name: ds.name,
          symbol: "circle",
          symbolSize: 6,
          lineStyle: { color: c, width: 2 },
          areaStyle: { color: c, opacity: fillOpacity },
          itemStyle: { color: c },
          label: showLabel
            ? {
                show: true,
                formatter: (params) => (params.value == null ? "未评测" : params.value > 0 ? params.value : ""),
                fontSize: 11,
                color: "#666",
              }
            : { show: false },
        };
      });
    } else {
      // 单数据集模式（向后兼容）
      legendData = null;
      const values = toValues(data);
      seriesData = [
        {
          value: values,
          name: "能力画像",
          symbol: "circle",
          symbolSize: 6,
          lineStyle: { color, width: 2 },
          areaStyle: { color, opacity: fillOpacity },
          itemStyle: { color },
          label: showLabel
            ? {
                show: true,
                formatter: (params) => (params.value == null ? "未评测" : params.value > 0 ? params.value : ""),
                fontSize: 11,
                color: "#666",
              }
            : { show: false },
        },
      ];
    }

    return {
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          if (!params.value) return "";
          let html = `<div style="font-weight:bold;margin-bottom:4px">${params.name || "能力画像"}</div>`;
          DIMENSIONS.forEach((dim, i) => {
            const v = params.value[i];
            if (v == null) {
              html += `<div style="display:flex;justify-content:space-between;min-width:180px">
                <span>${dim}</span>
                <span style="color:#999;font-style:italic;margin-left:12px">未评测</span>
              </div>`;
            } else {
              const barColor = v >= 80 ? "#52c41a" : v >= 60 ? "#faad14" : "#ff4d4f";
              html += `<div style="display:flex;justify-content:space-between;min-width:180px">
                <span>${dim}</span>
                <span style="color:${barColor};font-weight:bold;margin-left:12px">${v}</span>
              </div>`;
            }
          });
          return html;
        },
      },
      ...(legendData
        ? {
            legend: {
              data: legendData,
              bottom: 0,
              itemWidth: 14,
              itemHeight: 14,
              textStyle: { fontSize: 13 },
            },
          }
        : {}),
      radar: {
        indicator,
        shape: "polygon",
        radius: isMulti ? "58%" : "65%",
        center: isMulti ? ["50%", "45%"] : ["50%", "50%"],
        axisName: {
          color: "#333",
          fontSize: 13,
          fontWeight: 500,
        },
        splitNumber: 5,
        splitArea: {
          areaStyle: {
            color: ["#fff", "#f5f7fa", "#fff", "#f5f7fa", "#fff"],
          },
        },
        splitLine: {
          lineStyle: { color: "#e8e8e8" },
        },
        axisLine: {
          lineStyle: { color: "#d9d9d9" },
        },
      },
      series: [
        {
          type: "radar",
          data: seriesData,
        },
      ],
    };
  }, [data, datasets, showLabel, color, fillOpacity]);

  return (
    <ReactECharts
      option={option}
      style={{
        width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
      opts={{ renderer: "canvas" }}
    />
  );
}

/* 导出维度常量供其他组件使用 */
export { DIMENSIONS };
