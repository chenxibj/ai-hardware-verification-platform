/**
 * @file FileQueue.js
 * @description 上传文件队列 — 每个文件独立进度条 + 状态
 */
import React from "react";
import { List, Button, Progress, Typography } from "antd";
import {
  LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined, DeleteOutlined,
} from "@ant-design/icons";
import { formatFileSize } from "./constants";

const { Text } = Typography;

const STATUS_CONFIG = {
  pending:   { icon: <LoadingOutlined />,       color: "#1890ff" },
  uploading: { icon: <LoadingOutlined spin />,  color: "#1890ff" },
  success:   { icon: <CheckCircleOutlined />,   color: "#52c41a" },
  error:     { icon: <CloseCircleOutlined />,   color: "#ff4d4f" },
};

export default function FileQueue({ files, uploading, onRemove }) {
  if (files.length === 0) return null;

  return (
    <List
      size="small"
      bordered
      dataSource={files}
      renderItem={(item) => {
        const st = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
        return (
          <List.Item
            actions={
              item.status === "pending" && !uploading
                ? [<Button key="rm" type="link" danger size="small" icon={<DeleteOutlined />}
                    onClick={() => onRemove(item.uid)} />]
                : []
            }
          >
            <List.Item.Meta
              avatar={<span style={{ color: st.color }}>{st.icon}</span>}
              title={<Text>{item.name} <Text type="secondary">({formatFileSize(item.size)})</Text></Text>}
              description={
                item.status === "uploading"
                  ? <Progress percent={item.progress} size="small" />
                  : item.status === "success"
                  ? <Text type="success">✓ 上传成功 (ID: {item.assetId})</Text>
                  : item.status === "error"
                  ? <Text type="danger">✗ 上传失败</Text>
                  : <Text type="secondary">等待上传</Text>
              }
            />
          </List.Item>
        );
      }}
    />
  );
}
