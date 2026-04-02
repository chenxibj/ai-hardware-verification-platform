/**
 * @file taskConstants.js
 * @description 评测任务相关常量定义，供所有 task 子组件共享
 */
import React from "react";
import {
  ThunderboltOutlined, ExperimentOutlined, RocketOutlined,
  ApiOutlined, AppstoreOutlined, SettingOutlined,
} from "@ant-design/icons";

export const EVAL_TYPES = {
  PERFORMANCE: "性能评测",
  ACCURACY: "精度评测",
  COMPATIBILITY: "兼容性评测",
  STABILITY: "稳定性评测",
  GENERAL: "通用评测",
};

export const PRIORITIES = { HIGH: "高", MEDIUM: "中", LOW: "低" };
export const PRIORITY_COLORS = { HIGH: "red", MEDIUM: "blue", LOW: "default" };

export const STATUS_MAP = {
  PENDING: "待执行", QUEUED: "排队中", RUNNING: "执行中",
  COMPLETED: "已完成", FAILED: "失败", CANCELLED: "已取消", TERMINATED: "已终止",
};
export const STATUS_COLORS = {
  PENDING: "default", QUEUED: "warning", RUNNING: "processing",
  COMPLETED: "success", FAILED: "error", CANCELLED: "default", TERMINATED: "default",
};

export const PRESET_TEMPLATES = [
  { id: "chip_perf", name: "芯片性能评测", icon: <ThunderboltOutlined />, evalType: "PERFORMANCE", desc: "GPU/NPU算力密度、能效比、多卡互联测试", metrics: ["算力(TOPS)", "能效比(TOPS/W)", "互联带宽(GB/s)", "P95延迟"] },
  { id: "model_accuracy", name: "模型精度评测", icon: <ExperimentOutlined />, evalType: "ACCURACY", desc: "模型在不同精度下的准确率、召回率、F1评估", metrics: ["Top-1准确率", "Top-5准确率", "F1值", "精度损失%"] },
  { id: "model_perf", name: "模型推理性能", icon: <RocketOutlined />, evalType: "PERFORMANCE", desc: "推理延迟、吞吐量、资源利用率测试", metrics: ["首包延迟", "P95延迟", "吞吐量(QPS)", "GPU利用率"] },
  { id: "framework_compat", name: "框架兼容性评测", icon: <ApiOutlined />, evalType: "COMPATIBILITY", desc: "框架在国产芯片上的适配性、算子支持率测试", metrics: ["安装成功率", "模型加载率", "算子支持率", "兼容性评分"] },
  { id: "operator_perf", name: "算子性能评测", icon: <AppstoreOutlined />, evalType: "PERFORMANCE", desc: "单算子/融合算子执行延迟、精度损失测试", metrics: ["执行延迟", "吞吐量", "精度损失", "算力利用率"] },
  { id: "scene_effect", name: "场景效果评测", icon: <SettingOutlined />, evalType: "PERFORMANCE", desc: "行业场景下模型实际应用效果量化评估", metrics: ["准确率", "召回率", "业务指标", "适配性评分"] },
];

export const GPU_OPTIONS = [
  { value: "ascend_910b", label: "华为昇腾 910B" },
  { value: "ascend_910c", label: "华为昇腾 910C" },
  { value: "cambricon_590", label: "寒武纪 MLU590" },
  { value: "hygon_z100", label: "海光 DCU Z100" },
  { value: "biren_br100", label: "壁仞 BR100" },
  { value: "cpu_only", label: "仅CPU（无GPU）" },
];

export const PRECISION_OPTIONS = [
  { value: "FP32", label: "FP32（单精度）" },
  { value: "FP16", label: "FP16（半精度）" },
  { value: "BF16", label: "BF16" },
  { value: "INT8", label: "INT8（量化）" },
];
