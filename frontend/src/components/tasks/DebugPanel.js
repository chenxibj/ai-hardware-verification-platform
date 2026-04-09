/**
 * @file DebugPanel.js
 * @description 失败任务调试面板 — 显示节点信息 + 完整执行日志
 * Issue: #228
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Modal, Descriptions, Typography, Spin, Button, Space, Tag, Empty, message,
} from "antd";
import {
  ReloadOutlined, DownloadOutlined, CopyOutlined,
  ClockCircleOutlined, NodeIndexOutlined,
} from "@ant-design/icons";
import api from "../../utils/api";
import dayjs from "dayjs";

const { Text, Paragraph } = Typography;

export default function DebugPanel({ taskId, visible, onClose }) {
  const [debugInfo, setDebugInfo] = useState(null);
  const [debugLog, setDebugLog] = useState("");
  const [loading, setLoading] = useState(false);
  const [logLoading, setLogLoading] = useState(false);

  const fetchDebugInfo = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const { data: resp } = await api.get("/tasks/" + taskId + "/debug-info");
      if (resp.code === 0) setDebugInfo(resp.data);
    } catch (e) {
      message.error("获取调试信息失败");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const fetchDebugLog = useCallback(async () => {
    if (!taskId) return;
    setLogLoading(true);
    try {
      const { data: resp } = await api.get("/tasks/" + taskId + "/debug-log");
      if (resp.code === 0) setDebugLog(resp.data?.content || "暂无日志");
    } catch (e) {
      setDebugLog("获取日志失败");
    } finally {
      setLogLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (visible && taskId) {
      fetchDebugInfo();
      fetchDebugLog();
    }
    if (!visible) {
      setDebugInfo(null);
      setDebugLog("");
    }
  }, [visible, taskId, fetchDebugInfo, fetchDebugLog]);

  const handleCopyLog = () => {
    navigator.clipboard.writeText(debugLog).then(() => {
      message.success("日志已复制到剪贴板");
    });
  };

  const handleDownload = () => {
    window.open("/api/tasks/" + taskId + "/logs/download?format=txt", "_blank");
  };

  return (
    <Modal
      title={
        <Space>
          <span>{"任务调试"}</span>
          {debugInfo?.taskNo && <Tag>{debugInfo.taskNo}</Tag>}
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={860}
      footer={null}
      destroyOnClose
    >
      <Spin spinning={loading}>
        {debugInfo ? (
          <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label={"任务状态"}>
              <Tag color={debugInfo.taskStatus === "FAILED" ? "error" : "default"}>
                {debugInfo.taskStatus}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={"执行节点"}>
              {debugInfo.nodeName ? (
                <Space>
                  <NodeIndexOutlined />
                  <Text>{debugInfo.nodeName}</Text>
                  <Text type="secondary">({debugInfo.nodeHost})</Text>
                  {debugInfo.nodeStatus && (
                    <Tag color={debugInfo.nodeStatus === "ONLINE" ? "green" : "default"}>
                      {debugInfo.nodeStatus}
                    </Tag>
                  )}
                </Space>
              ) : (
                <Text type="secondary">{"未分配节点"}</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={"开始时间"}>
              {debugInfo.startedAt ? (
                <Space>
                  <ClockCircleOutlined />
                  {dayjs(debugInfo.startedAt).format("YYYY-MM-DD HH:mm:ss")}
                </Space>
              ) : "-"}
            </Descriptions.Item>
            <Descriptions.Item label={"结束时间"}>
              {debugInfo.completedAt ? dayjs(debugInfo.completedAt).format("YYYY-MM-DD HH:mm:ss") : "-"}
            </Descriptions.Item>
            <Descriptions.Item label={"日志路径"} span={2}>
              <Paragraph copyable style={{ margin: 0 }}>{debugInfo.logPath}</Paragraph>
            </Descriptions.Item>
          </Descriptions>
        ) : !loading && (
          <Empty description={"无调试信息"} />
        )}
      </Spin>

      <div style={{ marginTop: 8 }}>
        <Space style={{ marginBottom: 8 }}>
          <Text strong>{"执行日志"}</Text>
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchDebugLog}>
            {"刷新"}
          </Button>
          <Button size="small" icon={<CopyOutlined />} onClick={handleCopyLog}>
            {"复制"}
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={handleDownload}>
            {"下载"}
          </Button>
        </Space>
        <Spin spinning={logLoading}>
          <pre style={{
            background: "#1e1e1e",
            color: "#d4d4d4",
            padding: 16,
            borderRadius: 8,
            maxHeight: 420,
            overflow: "auto",
            fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
            fontSize: 13,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}>
            {debugLog || "暂无日志记录"}
          </pre>
        </Spin>
      </div>
    </Modal>
  );
}
