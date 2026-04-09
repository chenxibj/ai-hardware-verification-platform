/**
 * @file constants.js
 * @description 数字资产模块共享常量和工具函数
 */
import React from "react";
import {
  ExperimentOutlined, DatabaseOutlined, CodeOutlined,
  FileTextOutlined, FolderOutlined, PictureOutlined, AppstoreOutlined,
} from "@ant-design/icons";

/** 资产类型配置：图标 + 颜色 + 标签文字 */
export const ASSET_TYPES = {
  MODEL:           { label: "模型",     icon: <ExperimentOutlined />, color: "blue" },
  DATASET:         { label: "数据集",   icon: <DatabaseOutlined />,   color: "green" },
  OPERATOR:        { label: "算子",     icon: <CodeOutlined />,       color: "orange" },
  OPERATOR_SCRIPT: { label: "算子脚本", icon: <CodeOutlined />,       color: "orange" },
  SCRIPT:          { label: "脚本",     icon: <FileTextOutlined />,   color: "purple" },
  EVAL_SCRIPT:     { label: "评测脚本", icon: <FileTextOutlined />,   color: "volcano" },
  TEMPLATE:        { label: "流程模板", icon: <FolderOutlined />,     color: "cyan" },
  IMAGE:           { label: "镜像",     icon: <PictureOutlined />,    color: "purple" },
  CONFIG:          { label: "配置",     icon: <FileTextOutlined />,   color: "geekblue" },
  BENCHMARK:       { label: "基准",     icon: <AppstoreOutlined />,   color: "cyan" },
  LOG:             { label: "日志",     icon: <FileTextOutlined />,   color: "default" },
  MISC:            { label: "其他",     icon: <FolderOutlined />,     color: "default" },
};

/** 前端分类导航树（Phase 1 前端管理，后端分类 API 就绪后切换） */
export const CATEGORY_TREE = [
  { key: "all", label: "全部资产", icon: <AppstoreOutlined /> },
  { key: "MODEL", label: "模型资产", icon: <ExperimentOutlined />,
    children: [
      { key: "MODEL:image_class", label: "图像分类" },
      { key: "MODEL:object_detect", label: "目标检测" },
      { key: "MODEL:nlp", label: "自然语言处理" },
      { key: "MODEL:other", label: "其他模型" },
    ],
  },
  { key: "DATASET", label: "数据集资产", icon: <DatabaseOutlined />,
    children: [
      { key: "DATASET:image", label: "图像数据集" },
      { key: "DATASET:text", label: "文本数据集" },
      { key: "DATASET:tabular", label: "表格数据集" },
      { key: "DATASET:other", label: "其他数据集" },
    ],
  },
  { key: "OPERATOR", label: "算子资产", icon: <CodeOutlined /> },
  { key: "SCRIPT", label: "脚本资产", icon: <FileTextOutlined /> },
  { key: "TEMPLATE", label: "流程模板", icon: <FolderOutlined /> },
];

/** 上传页资产类型选项：含格式限制和大小限制 */
export const UPLOAD_ASSET_TYPES = [
  { value: "MODEL",    label: "模型",     icon: <ExperimentOutlined />, color: "#1890ff",
    formats: ".onnx, .pt, .pth, .pb, .h5, .tflite", maxSize: "10 GB" },
  { value: "DATASET",  label: "数据集",   icon: <DatabaseOutlined />,   color: "#52c41a",
    formats: ".csv, .json, .txt, .zip, .tar.gz, .parquet", maxSize: "50 GB" },
  { value: "OPERATOR", label: "算子",     icon: <CodeOutlined />,       color: "#fa8c16",
    formats: ".py, .cpp, .h, .so, .zip", maxSize: "1 GB" },
  { value: "SCRIPT",   label: "脚本",     icon: <FileTextOutlined />,   color: "#722ed1",
    formats: ".py, .sh, .bash", maxSize: "100 MB" },
  { value: "TEMPLATE", label: "流程模板", icon: <FolderOutlined />,     color: "#13c2c2",
    formats: ".json, .yaml, .yml", maxSize: "10 MB" },
];

export const getTypeInfo = (type) => ASSET_TYPES[type] || ASSET_TYPES.MISC;

export const formatFileSize = (bytes) => {
  if (!bytes) return "-";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
};

/**
 * 解析标签字段 — 后端 tags 字段是 JSONB，可能是数组/对象/逗号字符串
 * 统一返回字符串数组
 */
export const parseTags = (tagsStr) => {
  if (!tagsStr) return [];
  try {
    const parsed = typeof tagsStr === "string" ? JSON.parse(tagsStr) : tagsStr;
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "object") {
      return Object.entries(parsed).map(([k, v]) => `${k}:${v}`);
    }
    return [];
  } catch {
    // 降级：逗号分隔纯文本
    return typeof tagsStr === "string" ? tagsStr.split(",").filter(Boolean) : [];
  }
};
