/**
 * @file nodeHelpers.js
 * @description 节点管理共享工具函数和常量
 */

export const NODE_TYPE_COLORS = {
  CPU: "blue",
  GPU: "green",
  NPU: "purple",
  FPGA: "orange",
};

export const NODE_STATUS_MAP = {
  ONLINE: { text: "在线", color: "#52c41a", badge: "success" },
  OFFLINE: { text: "离线", color: "#ff4d4f", badge: "error" },
  MAINTENANCE: { text: "维护中", color: "#faad14", badge: "warning" },
  BUSY: { text: "忙碌", color: "#1890ff", badge: "processing" },
  ERROR: { text: "异常", color: "#ff4d4f", badge: "error" },
};

export const HEALTH_CONFIG = {
  HEALTHY: { color: "#52c41a", text: "健康" },
  DEGRADED: { color: "#faad14", text: "亚健康" },
  UNHEALTHY: { color: "#ff4d4f", text: "不健康" },
};

const TAG_COLORS = ["blue", "green", "orange", "purple", "cyan", "magenta", "red", "gold", "lime", "geekblue"];

/** 解析 tags 字符串为数组 */
export const parseTags = (tagsStr) => {
  if (!tagsStr) return [];
  try {
    const parsed = JSON.parse(tagsStr);
    if (Array.isArray(parsed)) return parsed.filter(t => t && t.key);
  } catch {}
  return tagsStr.split(",").filter(Boolean).map(s => {
    const trimmed = s.trim();
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      return { key: trimmed.substring(0, colonIdx).trim(), value: trimmed.substring(colonIdx + 1).trim() };
    }
    return { key: trimmed, value: "" };
  });
};

/** 序列化标签数组为 JSON 字符串 */
export const serializeTags = (tagsArr) => {
  if (!tagsArr || tagsArr.length === 0) return "";
  return JSON.stringify(tagsArr.map(t => ({ key: t.key, value: t.value || "" })));
};

/** 从标签中提取节点类型 */
export const extractType = (tags) => {
  if (!tags) return null;
  const parsed = parseTags(tags);
  const typeTag = parsed.find(t => t.key.toLowerCase() === "type");
  if (typeTag) {
    const v = typeTag.value.toUpperCase();
    if (["GPU", "NPU", "CPU", "FPGA"].includes(v)) return v;
  }
  for (const t of parsed) {
    const upper = t.key.toUpperCase();
    if (["GPU", "NPU", "CPU", "FPGA"].includes(upper)) return upper;
  }
  return null;
};

/** 获取标签颜色 */
export const getTagColor = (key) => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash) + key.charCodeAt(i);
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
};

/** 收集所有唯一标签 key */
export const collectAllTagKeys = (nodes) => {
  const keys = new Set();
  nodes.forEach(n => parseTags(n.tags).forEach(t => keys.add(t.key)));
  return Array.from(keys).sort();
};

/** 从标签提取来源信息 */
export const extractSource = (tags) => {
  if (!tags) return { type: "manual", label: "手动" };
  const parsed = parseTags(tags);
  const sourceTag = parsed.find(t => t.key === "source");
  if (sourceTag && sourceTag.value === "k8s") {
    const clusterTag = parsed.find(t => t.key === "cluster");
    return { type: "k8s", label: "K8s-" + (clusterTag ? clusterTag.value : "unknown") };
  }
  return { type: "manual", label: "手动" };
};

/** 解析 JSON 字段 */
export const parseJSON = (str) => {
  if (!str) return null;
  try { return typeof str === "string" ? JSON.parse(str) : str; } catch { return null; }
};
