/**
 * @file RadarChart.js
 * @description 六维能力雷达图组件 — 可复用于芯片档案页、报告页、对比页
 * Issue: #139
 *
 * Props:
 *   data      - 数组 [{dimension: "计算性能", score: 82.1}, ...]
 *   width     - 宽度 (默认 '100%')
 *   height    - 高度 (默认 400)
 *   showLabel - 是否显示分数标签 (默认 true)
 *   color     - 主色调 (默认 '#1890ff')
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

export default function RadarChart({
  data = [],
  width = "100%",
  height = 400,
  showLabel = true,
  color = "#1890ff",
  fillOpacity = 0.25,
}) {
  const option = useMemo(() => {
    // 将 data 数组转为 dimension -> score Map
    const scoreMap = {};
    (data || []).forEach((item) => {
      if (item && item.dimension != null) {
        scoreMap[item.dimension] = item.score || 0;
      }
    });

    // 构建 indicator（固定 6 维，max=100）
    const indicator = DIMENSIONS.map((dim) => ({
      name: dim,
      max: 100,
    }));

    // 构建 data values（按 DIMENSIONS 顺序取分）
    const values = DIMENSIONS.map((dim) => {
      const score = scoreMap[dim];
      return score != null ? Math.round(score * 10) / 10 : 0;
    });

    return {
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          if (!params.value) return "";
          let html = `<div style="font-weight:bold;margin-bottom:4px">${params.name || "能力画像"}</div>`;
          DIMENSIONS.forEach((dim, i) => {
            const v = params.value[i] || 0;
            const barColor = v >= 80 ? "#52c41a" : v >= 60 ? "#faad14" : "#ff4d4f";
            html += `<div style="display:flex;justify-content:space-between;min-width:180px">
              <span>${dim}</span>
              <span style="color:${barColor};font-weight:bold;margin-left:12px">${v}</span>
            </div>`;
          });
          return html;
        },
      },
      radar: {
        indicator,
        shape: "polygon",
        radius: "65%",
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
          data: [
            {
              value: values,
              name: "能力画像",
              symbol: "circle",
              symbolSize: 6,
              lineStyle: {
                color,
                width: 2,
              },
              areaStyle: {
                color,
                opacity: fillOpacity,
              },
              itemStyle: {
                color,
              },
              label: showLabel
                ? {
                    show: true,
                    formatter: (params) => {
                      return params.value > 0 ? params.value : "";
                    },
                    fontSize: 11,
                    color: "#666",
                  }
                : { show: false },
            },
          ],
        },
      ],
    };
  }, [data, showLabel, color, fillOpacity]);

  return (
    <ReactECharts
      option={option}
      style={{ width, height: typeof height === "number" ? `${height}px` : height }}
      opts={{ renderer: "canvas" }}
    />
  );
}

/* 导出维度常量供其他组件使用 */
export { DIMENSIONS };
