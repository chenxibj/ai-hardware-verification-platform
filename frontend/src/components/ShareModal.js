/**
 * @file ShareModal.js
 * @description #269 分享与权限控制 — 资产分享弹窗
 * 三种分享范围: 私有 / 团队可见 / 公开
 * 精细化权限: 查看 / 下载 / 编辑
 * 数据存储: localStorage
 */
import React, { useState, useEffect } from "react";
import {
  Modal, Radio, Select, Table, Tag, Button, Space, message,
  Typography, Divider, Switch, Tooltip, Alert, Avatar,
} from "antd";
import {
  LockOutlined, TeamOutlined, GlobalOutlined,
  EyeOutlined, DownloadOutlined, EditOutlined,
  UserOutlined, DeleteOutlined, CopyOutlined,
  ShareAltOutlined, LinkOutlined,
} from "@ant-design/icons";

const { Text, Paragraph } = Typography;

const SHARE_LS_KEY = "ahvp_share_settings";

/** 用户列表 — 后端 API 就绪后从 /api/users 获取 */
const USERS_PLACEHOLDER = [
  // 空状态 — 后端用户管理 API 就绪后替换为真实数据
];

const VISIBILITY = [
  { value: "private",  label: "私有",     icon: <LockOutlined />,    color: "#999",    desc: "仅自己可见" },
  { value: "team",     label: "团队可见", icon: <TeamOutlined />,    color: "#1890ff", desc: "团队内所有成员可见" },
  { value: "public",   label: "公开",     icon: <GlobalOutlined />,  color: "#52c41a", desc: "所有人可见" },
];

const PERMISSIONS = [
  { key: "view",     label: "查看", icon: <EyeOutlined />,      color: "green" },
  { key: "download", label: "下载", icon: <DownloadOutlined />,  color: "blue" },
  { key: "edit",     label: "编辑", icon: <EditOutlined />,      color: "orange" },
];

/** 读取资产分享设置 */
export const getShareSettings = (assetId) => {
  try {
    const all = JSON.parse(localStorage.getItem(SHARE_LS_KEY) || "{}");
    return all[assetId] || { visibility: "private", shares: [] };
  } catch { return { visibility: "private", shares: [] }; }
};

/** 保存资产分享设置 */
const saveShareSettings = (assetId, settings) => {
  try {
    const all = JSON.parse(localStorage.getItem(SHARE_LS_KEY) || "{}");
    all[assetId] = settings;
    localStorage.setItem(SHARE_LS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
};

export default function ShareModal({ visible, onClose, assetId, assetName }) {
  const [visibility, setVisibility] = useState("private");
  const [shares, setShares] = useState([]); // [{userId, permissions:[]}]
  const [selectedUser, setSelectedUser] = useState(null);
  const [newPerms, setNewPerms] = useState(["view"]);

  useEffect(() => {
    if (visible && assetId) {
      const s = getShareSettings(assetId);
      setVisibility(s.visibility || "private");
      setShares(s.shares || []);
    }
  }, [visible, assetId]);

  const handleAddShare = () => {
    if (!selectedUser) { message.warning("请选择用户"); return; }
    if (shares.find((s) => s.userId === selectedUser)) {
      message.warning("该用户已在分享列表中"); return;
    }
    setShares((prev) => [...prev, { userId: selectedUser, permissions: newPerms }]);
    setSelectedUser(null);
    setNewPerms(["view"]);
  };

  const handleRemoveShare = (userId) => {
    setShares((prev) => prev.filter((s) => s.userId !== userId));
  };

  const handlePermToggle = (userId, perm) => {
    setShares((prev) => prev.map((s) => {
      if (s.userId !== userId) return s;
      const perms = s.permissions.includes(perm)
        ? s.permissions.filter((p) => p !== perm)
        : [...s.permissions, perm];
      // 编辑权限自动包含查看和下载
      if (perm === "edit" && perms.includes("edit")) {
        if (!perms.includes("view")) perms.push("view");
        if (!perms.includes("download")) perms.push("download");
      }
      return { ...s, permissions: perms };
    }));
  };

  const handleSave = () => {
    saveShareSettings(assetId, { visibility, shares });
    message.success("分享设置已保存");
    if (onClose) onClose();
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/assets/${assetId}`;
    navigator.clipboard.writeText(link).then(
      () => message.success("链接已复制到剪贴板"),
      () => message.error("复制失败")
    );
  };

  const userOptions = USERS_PLACEHOLDER
    .filter((u) => !shares.find((s) => s.userId === u.id))
    .map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }));

  const columns = [
    {
      title: "用户", dataIndex: "userId", key: "user", width: 180,
      render: (uid) => {
        const u = USERS_PLACEHOLDER.find((x) => x.id === uid);
        return (
          <Space>
            <Avatar size="small" icon={<UserOutlined />} style={{ background: "#1890ff" }} />
            <div>
              <div><Text strong style={{ fontSize: 13 }}>{u?.name || uid}</Text></div>
              <div><Text type="secondary" style={{ fontSize: 11 }}>{u?.email}</Text></div>
            </div>
          </Space>
        );
      },
    },
    {
      title: "权限", key: "perms", width: 240,
      render: (_, record) => (
        <Space>
          {PERMISSIONS.map((p) => {
            const has = record.permissions.includes(p.key);
            return (
              <Tooltip key={p.key} title={p.label}>
                <Tag
                  color={has ? p.color : "default"}
                  style={{ cursor: "pointer", opacity: has ? 1 : 0.4 }}
                  onClick={() => handlePermToggle(record.userId, p.key)}
                >
                  {p.icon} {p.label}
                </Tag>
              </Tooltip>
            );
          })}
        </Space>
      ),
    },
    {
      title: "", key: "action", width: 50,
      render: (_, record) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />}
          onClick={() => handleRemoveShare(record.userId)} />
      ),
    },
  ];

  return (
    <Modal
      title={<Space><ShareAltOutlined /> 分享设置 — {assetName || "资产"}</Space>}
      open={visible}
      onCancel={onClose}
      onOk={handleSave}
      okText="保存设置"
      width={640}
      destroyOnClose
    >
      {/* 分享范围 */}
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ marginBottom: 8, display: "block" }}>分享范围</Text>
        <Radio.Group value={visibility} onChange={(e) => setVisibility(e.target.value)}
          style={{ width: "100%" }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            {VISIBILITY.map((v) => (
              <Radio key={v.value} value={v.value} style={{
                padding: "8px 12px", borderRadius: 6, width: "100%",
                background: visibility === v.value ? "#f0f5ff" : "#fafafa",
                border: visibility === v.value ? "1px solid #d6e4ff" : "1px solid #f0f0f0",
              }}>
                <Space>
                  <span style={{ color: v.color }}>{v.icon}</span>
                  <Text strong>{v.label}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{v.desc}</Text>
                </Space>
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      </div>

      <Divider style={{ margin: "12px 0" }} />

      {/* 指定用户分享 */}
      <div style={{ marginBottom: 12 }}>
        <Text strong style={{ marginBottom: 8, display: "block" }}>指定用户分享</Text>
        <Space style={{ width: "100%" }}>
          <Select
            placeholder="搜索用户..."
            showSearch
            filterOption={(input, option) =>
              (option?.label || "").toLowerCase().includes(input.toLowerCase())
            }
            value={selectedUser}
            onChange={setSelectedUser}
            options={userOptions}
            style={{ width: 260 }}
          />
          <Select
            mode="multiple"
            value={newPerms}
            onChange={setNewPerms}
            style={{ width: 200 }}
            options={PERMISSIONS.map((p) => ({ value: p.key, label: p.label }))}
            placeholder="权限"
          />
          <Button type="primary" onClick={handleAddShare}>添加</Button>
        </Space>
      </div>

      {shares.length > 0 ? (
        <Table
          rowKey="userId"
          columns={columns}
          dataSource={shares}
          size="small"
          pagination={false}
          style={{ marginBottom: 12 }}
        />
      ) : (
        <Alert message="暂未分享给任何用户" type="info" showIcon
          style={{ marginBottom: 12 }} />
      )}

      <Divider style={{ margin: "12px 0" }} />

      {/* 快速链接 */}
      <Space>
        <Button icon={<LinkOutlined />} size="small" onClick={handleCopyLink}>
          复制分享链接
        </Button>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {visibility === "private" ? "仅被分享用户可通过链接访问" :
           visibility === "team" ? "团队成员可通过链接访问" : "任何人可通过链接访问"}
        </Text>
      </Space>
    </Modal>
  );
}
