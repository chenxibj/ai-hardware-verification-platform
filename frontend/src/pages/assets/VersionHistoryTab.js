/**
 * @file VersionHistoryTab.js
 * @description 版本历史 Tab — localStorage 模拟版本历史
 * @fix #283 — 后端无版本端点，前端用 localStorage 模拟
 */
import React, { useState, useEffect } from "react";
import { Table, Tag, Space, Button, Tooltip, Typography, Modal, Form, Input, message } from "antd";
import {
  DownloadOutlined, LockOutlined, UnlockOutlined,
  RollbackOutlined, CloudUploadOutlined, InfoCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { formatFileSize } from "./constants";

const { Text } = Typography;

const VERSION_KEY_PREFIX = "ahvp_asset_versions_";

/** 读取 localStorage 中的版本历史 */
function loadVersions(assetId) {
  try {
    const raw = localStorage.getItem(VERSION_KEY_PREFIX + assetId);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/** 保存版本历史到 localStorage */
function saveVersions(assetId, versions) {
  localStorage.setItem(VERSION_KEY_PREFIX + assetId, JSON.stringify(versions));
}

export default function VersionHistoryTab({ asset, onDownload }) {
  const [versions, setVersions] = useState([]);
  const [addVisible, setAddVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!asset?.id) return;
    const saved = loadVersions(asset.id);
    // 确保当前版本始终存在
    const currentExists = saved.some(v => v.version === (asset.version || "1.0.0") && v.status === "current");
    if (!currentExists) {
      const current = {
        key: "v-" + Date.now(),
        version: asset.version || "1.0.0",
        note: "当前版本",
        fileSize: asset.fileSize,
        status: "current",
        createdAt: asset.updatedAt || asset.createdAt || new Date().toISOString(),
        isLocked: false,
      };
      const updated = [current, ...saved.filter(v => v.status !== "current")];
      saveVersions(asset.id, updated);
      setVersions(updated);
    } else {
      setVersions(saved);
    }
  }, [asset]);

  const handleAddVersion = (values) => {
    const newVersion = {
      key: "v-" + Date.now(),
      version: values.version,
      note: values.note || "",
      fileSize: asset.fileSize,
      status: "current",
      createdAt: new Date().toISOString(),
      isLocked: false,
    };
    // 把旧的 current 降为 history
    const updated = [newVersion, ...versions.map(v => ({ ...v, status: v.status === "current" ? "history" : v.status }))];
    saveVersions(asset.id, updated);
    setVersions(updated);
    setAddVisible(false);
    form.resetFields();
    message.success("版本已记录（本地）");
  };

  const handleToggleLock = (key) => {
    const updated = versions.map(v => v.key === key ? { ...v, isLocked: !v.isLocked } : v);
    saveVersions(asset.id, updated);
    setVersions(updated);
  };

  const columns = [
    { title: "版本号", dataIndex: "version", key: "version", width: 100,
      render: (v) => <Tag color="blue">v{v}</Tag> },
    { title: "版本说明", dataIndex: "note", key: "note", ellipsis: true },
    { title: "文件大小", dataIndex: "fileSize", key: "fileSize", width: 100,
      render: (v) => formatFileSize(v) },
    { title: "状态", dataIndex: "status", key: "status", width: 80,
      render: (v, r) => r.isLocked
        ? <Tag icon={<LockOutlined />} color="orange">锁定</Tag>
        : v === "current" ? <Tag color="green">当前</Tag> : <Tag>历史</Tag> },
    { title: "时间", dataIndex: "createdAt", key: "createdAt", width: 160,
      render: (v) => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-" },
    { title: "操作", key: "action", width: 200,
      render: (_, r) => (
        <Space>
          <Tooltip title="下载">
            <Button type="link" size="small" icon={<DownloadOutlined />}
              onClick={onDownload} disabled={!asset.filePath} />
          </Tooltip>
          {r.status !== "current" && (
            <Tooltip title="回滚到此版本">
              <Button type="link" size="small" icon={<RollbackOutlined />} disabled />
            </Tooltip>
          )}
          <Tooltip title={r.isLocked ? "解锁" : "锁定"}>
            <Button type="link" size="small"
              icon={r.isLocked ? <UnlockOutlined /> : <LockOutlined />}
              onClick={() => handleToggleLock(r.key)} />
          </Tooltip>
        </Space>
      ) },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Text type="secondary">共 {versions.length} 个版本</Text>
        <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setAddVisible(true)}>
          记录新版本
        </Button>
      </div>
      <Table columns={columns} dataSource={versions} rowKey="key" pagination={false} size="small" />
      <div style={{ marginTop: 12, color: "#999", fontSize: 12 }}>
        <InfoCircleOutlined /> 版本记录暂存于浏览器本地，后端 API 支持后将同步至服务端
      </div>

      <Modal title="记录新版本" open={addVisible} onCancel={() => setAddVisible(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleAddVersion}>
          <Form.Item name="version" label="版本号" rules={[{ required: true, message: "请输入版本号" }]}>
            <Input placeholder="例：1.1.0" />
          </Form.Item>
          <Form.Item name="note" label="版本说明">
            <Input.TextArea rows={2} placeholder="本次更新内容" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>保存</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
