/**
 * @file templateConstants.js
 * @description 模板相关常量
 */
import React from "react";
import {
  AppstoreOutlined, ThunderboltOutlined, RocketOutlined,
  ApiOutlined, ExperimentOutlined,
} from "@ant-design/icons";

export const EVAL_TYPES = {
  PERFORMANCE: "性能评测", ACCURACY: "精度评测",
  COMPATIBILITY: "兼容性评测", STABILITY: "稳定性评测", GENERAL: "通用评测",
};

export const EVAL_DIMENSIONS = {
  OPERATOR: "算子评测", CHIP: "芯片评测", MODEL: "模型评测",
  FRAMEWORK: "框架评测", MIDDLEWARE: "中间层评测", SCENE: "场景评测",
};

export const DIMENSION_ICONS = {
  OPERATOR: <AppstoreOutlined />, MODEL: <RocketOutlined />,
  CHIP: <ThunderboltOutlined />, FRAMEWORK: <ApiOutlined />,
  SCENE: <ExperimentOutlined />,
};

export const parseConfig = (configJson) => {
  try { return JSON.parse(configJson || "{}"); } catch { return {}; }
};
