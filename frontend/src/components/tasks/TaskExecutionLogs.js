/**
 * @file TaskExecutionLogs.js
 * @description 任务实时执行日志组件 — 轮询 /api/tasks/{id}/logs
 * #225
 */
import React, { useState, useEffect, useRef } from "react";
import { Spin, Button, Space, Tag, Typography } from "antd";
import { ReloadOutlined, DownloadOutlined } from "@ant-design/icons";
import api from "../../utils/api";

const { Text } = Typography;

const POLL_INTERVAL = 3000; // 3 秒轮询

export default function TaskExecutionLogs({ taskId, taskStatus }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const containerRef = useRef(null);
  const timerRef = useRef(null);

  const isRunning = taskStatus === "RUNNING" || taskStatus === "QUEUED";

  const fetchLogs = async () => {
    if (!taskId) return;
    try {
      setLoading(true);
      const r = await api.get(`/tasks/${taskId}/logs`);
      if (r.data.code === 0) {
        setLogs(r.data.data || []);
      }
    } catch (e) {
      // silently ignore
    } finally {
      setLoading(false);
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current && autoRefresh) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoRefresh]);

  // Poll logs when task is running
  useEffect(() => {
    fetchLogs();
    if (isRunning && autoRefresh) {
      timerRef.current = setInterval(fetchLogs, POLL_INTERVAL);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [taskId, isRunning, autoRefresh]);

  const handleDownload = () => {
    if (!taskId) return;
    window.open(`/api/tasks/${taskId}/logs/download`, "_blank");
  };

  const logText = logs.map(l => l.content).join("") || "";

  return (
    <div>
      <Space style={{ marginBottom: 8 }}>
        {isRunning && (
          <Tag color={autoRefresh ? "green" : "default"} 
               style={{ cursor: "pointer" }}
               onClick={() => setAutoRefresh(!autoRefresh)}>
            {autoRefresh ? "● 实时刷新中" : "○ 已暂停刷新"}
          </Tag>
        )}
        {!isRunning && logs.length > 0 && (
          <Tag color="default">共 {logs.length} 条日志</Tag>
        )}
        <Button size="small" icon={<ReloadOutlined />} onClick={fetchLogs} loading={loading}>
          刷新
        </Button>
        {logs.length > 0 && (
          <Button size="small" icon={<DownloadOutlined />} onClick={handleDownload}>
            下载
          </Button>
        )}
      </Space>
      <div
        ref={containerRef}
        style={{
          background: "#1e1e1e",
          color: "#d4d4d4",
          padding: 16,
          borderRadius: 8,
          minHeight: 200,
          maxHeight: 500,
          overflow: "auto",
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
          fontSize: 12,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {loading && logs.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Spin tip="加载日志中..." />
          </div>
        ) : logText ? (
          logText
        ) : (
          <span style={{ color: "#666" }}>
            {isRunning
              ? "[INFO] 等待日志输出...\n[INFO] 日志将在 Agent 执行任务时实时显示"
              : "[INFO] 暂无执行日志数据"}
          </span>
        )}
      </div>
    </div>
  );
}
