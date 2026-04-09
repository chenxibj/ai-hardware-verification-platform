/**
 * @file OverlayRadarChart.js
 * @description SVG 雷达图组件 — 支持多组数据叠加渲染
 *
 * 从 ReportCompare 中提取复用，ChipCompare / Comparisons 等页面均可调用。
 * 纯展示组件，无 API 调用。
 */
import React from "react";

/** 对比颜色常量 */
export const COMPARE_COLORS = ["#1890ff", "#f5222d", "#52c41a", "#fa8c16", "#722ed1"];

/** 六维映射 */
export const DIMENSION_MAP = {
  compute_perf: "计算性能",
  normalization: "归一化",
  math_func: "数学函数",
  attention: "Attention",
  memory_perf: "访存性能",
  model_inference: "模型推理",
};
export const DIMENSION_KEYS = Object.keys(DIMENSION_MAP);
export const DIMENSION_LABELS = Object.values(DIMENSION_MAP);

/**
 * 叠加雷达图
 * @param {Array<{name: string, scores: number[]}>} chipData  每组数据
 * @param {number} size  SVG 尺寸
 */
export default function OverlayRadarChart({ chipData = [], size = 420 }) {
  const center = size / 2;
  const radius = size * 0.35;
  const levels = 5;
  const angleStep = (2 * Math.PI) / DIMENSION_LABELS.length;
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
    DIMENSION_LABELS.map((_, i) => {
      const pt = getPoint(i, scores[i] || 0);
      return `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`;
    }).join(" ") + " Z";

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "block", margin: "0 auto" }}
    >
      {/* 背景网格 */}
      {Array.from({ length: levels }, (_, l) => {
        const lr = ((l + 1) / levels) * radius;
        const pts = DIMENSION_LABELS.map((_, i) => {
          const a = startAngle + angleStep * i;
          return `${(center + lr * Math.cos(a)).toFixed(2)},${(center + lr * Math.sin(a)).toFixed(2)}`;
        }).join(" ");
        return (
          <polygon
            key={l}
            points={pts}
            fill="none"
            stroke="#e8e8e8"
            strokeWidth={l === levels - 1 ? 1.5 : 0.8}
          />
        );
      })}

      {/* 轴线 */}
      {DIMENSION_LABELS.map((_, i) => {
        const a = startAngle + angleStep * i;
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={center + radius * Math.cos(a)}
            y2={center + radius * Math.sin(a)}
            stroke="#d9d9d9"
            strokeWidth={0.8}
          />
        );
      })}

      {/* 维度标签 */}
      {DIMENSION_LABELS.map((label, i) => {
        const a = startAngle + angleStep * i;
        const labelR = radius + 24;
        return (
          <text
            key={i}
            x={center + labelR * Math.cos(a)}
            y={center + labelR * Math.sin(a)}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={12}
            fill="#666"
          >
            {label}
          </text>
        );
      })}

      {/* 数据多边形层 */}
      {chipData.map((item, idx) => {
        const color = COMPARE_COLORS[idx % COMPARE_COLORS.length];
        return (
          <g key={idx}>
            <path
              d={getPolygonPath(item.scores)}
              fill={color}
              fillOpacity={0.15}
              stroke={color}
              strokeWidth={2}
            />
            {item.scores.map((s, i) => {
              const pt = getPoint(i, s);
              return (
                <circle
                  key={i}
                  cx={pt.x}
                  cy={pt.y}
                  r={3.5}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
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
            <rect
              x={12}
              y={12 + idx * 22}
              width={14}
              height={14}
              rx={2}
              fill={color}
              fillOpacity={0.3}
              stroke={color}
              strokeWidth={1.5}
            />
            <text x={32} y={23 + idx * 22} fontSize={12} fill="#333">
              {item.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
