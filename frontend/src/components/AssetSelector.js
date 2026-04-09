/**
 * @file AssetSelector.js
 * @description #268 评测任务资产选择器 — 弹出 Modal 选择/搜索资产，支持多选+快速上传
 * 数据来源：先尝试 API /assets，fallback 到 localStorage
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Modal, Table, Tag, Input, Button, Space, Upload, message, Empty, Typography,
} from "antd";
import {
  SearchOutlined, CloudUploadOutlined, DatabaseOutlined,
  ExperimentOutlined, CodeOutlined, FileTextOutlined, FolderOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Text } = Typography;

const TYPE_META = {
  MODEL:    { label: "模型",   icon: <ExperimentOutlined />, color: "blue" },
  DATASET:  { label: "数据集", icon: <DatabaseOutlined />,   color: "green" },
  OPERATOR: { label: "算子",   icon: <CodeOutlined />,       color: "orange" },
  SCRIPT:   { label: "脚本",   icon: <FileTextOutlined />,   color: "purple" },
  TEMPLATE: { label: "模板",   icon: <FolderOutlined />,     color: "cyan" },
};

const fmtSize = (b) => {
  if (!b) return "-";
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  if (b < 1073741824) return (b / 1048576).toFixed(1) + " MB";
  return (b / 1073741824).toFixed(2) + " GB";
};

const LS_KEY = "ahvp_assets";
const MAPPING_KEY = "ahvp_plan_asset_map";

/** 读取 plan-asset 映射 */
export const getPlanAssets = (planId) => {
  try {
    const m = JSON.parse(localStorage.getItem(MAPPING_KEY) || "{}");
    return m[planId] || [];
  } catch { return []; }
};

/** 保存 plan-asset 映射 */
export const savePlanAssets = (planId, assetIds) => {
  try {
    const m = JSON.parse(localStorage.getItem(MAPPING_KEY) || "{}");
    m[planId] = assetIds;
    localStorage.setItem(MAPPING_KEY, JSON.stringify(m));
  } catch { /* ignore */ }
};

export default function AssetSelector({ visible, onClose, selectedIds = [], onSelect }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(selectedIds);
  const [uploading, setUploading] = useState(false);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/assets", { params: { size: 200 } });
      if (res.data.code === 0 && res.data.data?.length > 0) {
        const list = res.data.data.map((a) => ({
          id: a.id, name: a.name, assetType: a.assetType,
          fileSize: a.fileSize || a.size || 0,
          version: a.version, createdAt: a.createdAt,
        }));
        setAssets(list);
        // 同步到 localStorage
        localStorage.setItem(LS_KEY, JSON.stringify(list));
        return;
      }
    } catch { /* fallback */ }
    // Fallback: localStorage
    try {
      const ls = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      setAssets(ls);
    } catch { setAssets([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) { fetchAssets(); setSelected(selectedIds); }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = assets.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (a.name || "").toLowerCase().includes(q)
      || (a.assetType || "").toLowerCase().includes(q);
  });

  const handleQuickUpload = async (info) => {
    const file = info.file;
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", file.name);
    // 猜类型
    const ext = (file.name || "").split(".").pop().toLowerCase();
    const typeMap = { onnx: "MODEL", pt: "MODEL", pth: "MODEL", csv: "DATASET",
      json: "DATASET", py: "SCRIPT", sh: "SCRIPT", zip: "DATASET", gz: "DATASET" };
    fd.append("assetType", typeMap[ext] || "MISC");
    try {
      const res = await api.post("/assets/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data.code === 0) {
        const newId = res.data.data?.id;
        message.success("快速上传成功");
        await fetchAssets();
        if (newId) setSelected((prev) => [...prev, newId]);
      } else { message.error(res.data.message || "上传失败"); }
    } catch (e) { message.error("上传失败: " + e.message); }
    setUploading(false);
  };

  const handleOk = () => { if (onSelect) onSelect(selected); if (onClose) onClose(); };

  const columns = [
    {
      title: "名称", dataIndex: "name", key: "name", ellipsis: true,
      render: (t, r) => (
        <Space>
          {TYPE_META[r.assetType]?.icon || <FolderOutlined />}
          <Text>{t}</Text>
        </Space>
      ),
    },
    {
      title: "类型", dataIndex: "assetType", key: "type", width: 100,
      render: (t) => {
        const m = TYPE_META[t];
        return m ? <Tag color={m.color}>{m.label}</Tag> : <Tag>{t}</Tag>;
      },
    },
    { title: "大小", dataIndex: "fileSize", key: "size", width: 100, render: fmtSize },
    {
      title: "版本", dataIndex: "version", key: "ver", width: 80,
      render: (v) => v || "-",
    },
  ];

  const rowSelection = {
    selectedRowKeys: selected,
    onChange: (keys) => setSelected(keys),
  };

  return (
    <Modal
      title="选择关联资产"
      open={visible}
      onCancel={onClose}
      onOk={handleOk}
      width={720}
      okText={`确认选择 (${selected.length})`}
      destroyOnClose
    >
      <Space style={{ marginBottom: 12, width: "100%" }} wrap>
        <Input
          placeholder="搜索资产名称..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 260 }}
          allowClear
        />
        <Upload showUploadList={false} beforeUpload={() => false}
          onChange={handleQuickUpload} disabled={uploading}>
          <Button icon={<CloudUploadOutlined />} loading={uploading}>快速上传</Button>
        </Upload>
        <Text type="secondary">已选 {selected.length} 项</Text>
      </Space>

      {filtered.length === 0 && !loading ? (
        <Empty description="暂无资产，请先上传" />
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          loading={loading}
          rowSelection={rowSelection}
          size="small"
          pagination={{ pageSize: 8, showSizeChanger: false }}
          scroll={{ y: 360 }}
        />
      )}

      {selected.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>已选资产: </Text>
          {selected.map((id) => {
            const a = assets.find((x) => x.id === id);
            return (
              <Tag key={id} closable color="blue"
                onClose={() => setSelected((p) => p.filter((x) => x !== id))}>
                <CheckCircleOutlined style={{ marginRight: 4 }} />
                {a?.name || id}
              </Tag>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
