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
      message.error("\u83B7\u53D6\u8C03\u8BD5\u4FE1\u606F\u5931\u8D25");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const fetchDebugLog = useCallback(async () => {
    if (!taskId) return;
    setLogLoading(true);
    try {
      const { data: resp } = await api.get("/tasks/" + taskId + "/debug-log");
      if (resp.code === 0) setDebugLog(resp.data?.content || "\u6682\u65E0\u65E5\u5FD7");
    } catch (e) {
      setDebugLog("\u83B7\u53D6\u65E5\u5FD7\u5931\u8D25");
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
      message.success("\u65E5\u5FD7\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F");
    });
  };

  const handleDownload = () => {
    window.open("/api/tasks/" + taskId + "/logs/download?format=txt", "_blank");
  };

  return (
    <Modal
      title={
        <Space>
          <span>{"\u4EFB\u52A1\u8C03\u8BD5"}</span>
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
            <Descriptions.Item label={"\u4EFB\u52A1\u72B6\u6001"}>
              <Tag color={debugInfo.taskStatus === "FAILED" ? "error" : "default"}>
                {debugInfo.taskStatus}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={"\u6267\u884C\u8282\u70B9"}>
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
                <Text type="secondary">{"\u672A\u5206\u914D\u8282\u70B9"}</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={"\u5F00\u59CB\u65F6\u95F4"}>
              {debugInfo.startedAt ? (
                <Space>
                  <ClockCircleOutlined />
                  {dayjs(debugInfo.startedAt).format("YYYY-MM-DD HH:mm:ss")}
                </Space>
              ) : "-"}
            </Descriptions.Item>
            <Descriptions.Item label={"\u7ED3\u675F\u65F6\u95F4"}>
              {debugInfo.completedAt ? dayjs(debugInfo.completedAt).format("YYYY-MM-DD HH:mm:ss") : "-"}
            </Descriptions.Item>
            <Descriptions.Item label={"\u65E5\u5FD7\u8DEF\u5F84"} span={2}>
              <Paragraph copyable style={{ margin: 0 }}>{debugInfo.logPath}</Paragraph>
            </Descriptions.Item>
          </Descriptions>
        ) : !loading && (
          <Empty description={"\u65E0\u8C03\u8BD5\u4FE1\u606F"} />
        )}
      </Spin>

      <div style={{ marginTop: 8 }}>
        <Space style={{ marginBottom: 8 }}>
          <Text strong>{"\u6267\u884C\u65E5\u5FD7"}</Text>
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchDebugLog}>
            {"\u5237\u65B0"}
          </Button>
          <Button size="small" icon={<CopyOutlined />} onClick={handleCopyLog}>
            {"\u590D\u5236"}
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={handleDownload}>
            {"\u4E0B\u8F7D"}
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
            {debugLog || "\u6682\u65E0\u65E5\u5FD7\u8BB0\u5F55"}
          </pre>
        </Spin>
      </div>
    </Modal>
  );
}
