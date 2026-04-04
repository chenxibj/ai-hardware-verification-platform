import React from "react";
import { Tag, Button, message } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
const LEVEL_CONFIG = { INFO: { color: "blue" }, WARN: { color: "orange" }, ERROR: { color: "red" }, DEBUG: { color: "default" } };
export const LogLevelTag = ({ level }) => {
  const cfg = LEVEL_CONFIG[level] || LEVEL_CONFIG.DEBUG;
  return <Tag color={cfg.color}>{level}</Tag>;
};
export const LogExportButton = ({ logs = [], filename }) => {
  const handleExport = () => {
    const formatted = logs.map(l => ({ timestamp: l.createdAt || l.timestamp, level: l.level || "INFO", taskId: l.taskId, content: l.content || l.message }));
    const blob = new Blob([JSON.stringify(formatted, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename || "logs.json"; a.click();
    URL.revokeObjectURL(url);
    message.success("日志已导出");
  };
  return <Button icon={<DownloadOutlined />} onClick={handleExport}>导出日志</Button>;
};
export default LogLevelTag;
