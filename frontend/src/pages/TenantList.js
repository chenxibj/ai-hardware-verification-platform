/**
 * @file TenantList.js
 * @description 租户管理页面 — 表格 + 创建/编辑弹窗
 * @feat #174 多租户管理 (US-4.2)
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Table, Tag, Badge, Button, Space, Input, Select, Modal, Form,
  Typography, Tooltip, message, InputNumber, DatePicker, Descriptions
} from "antd";
import {
  PlusOutlined, ReloadOutlined, EditOutlined, EyeOutlined,
  SearchOutlined, TeamOutlined
} from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";

const { Text } = Typography;

const STATUS_MAP = {
  ACTIVE: { text: "活跃", color: "success" },
  INACTIVE: { text: "未激活", color: "default" },
  SUSPENDED: { text: "已暂停", color: "error" },
};

export default function TenantList() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [form] = Form.useForm();

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (searchText) params.keyword = searchText;
      const res = await api.get("/tenants", { params });
      if (res.data.code === 0) setTenants(res.data.data || []);
    } catch (err) {
      if (err.response?.status !== 403) message.error("获取租户列表失败");
    }
    setLoading(false);
  }, [searchText]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const parseQuota = (quotaStr) => {
    if (!quotaStr) return {};
    try { return typeof quotaStr === "string" ? JSON.parse(quotaStr) : quotaStr; } catch { return {}; }
  };

  const handleCreate = () => {
    setEditingTenant(null);
    form.resetFields();
    form.setFieldsValue({ maxChips: 100, maxConcurrent: 10, storageGb: 500 });
    setModalVisible(true);
  };

  const handleEdit = (tenant) => {
    setEditingTenant(tenant);
    const quota = parseQuota(tenant.resourceQuota);
    form.setFieldsValue({
      name: tenant.name,
      code: tenant.code,
      description: tenant.description,
      adminEmail: tenant.contactEmail,
      status: tenant.status,
      maxChips: quota.max_chips || 100,
      maxConcurrent: quota.max_concurrent || 10,
      storageGb: quota.storage_gb || 500,
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload = {
        name: values.name,
        code: values.code,
        description: values.description,
        adminEmail: values.adminEmail,
        maxChips: values.maxChips,
        maxConcurrent: values.maxConcurrent,
        storageGb: values.storageGb,
        validUntil: values.validUntil ? values.validUntil.format("YYYY-MM-DD") : null,
        status: values.status,
      };

      if (editingTenant) {
        await api.put(`/tenants/${editingTenant.id}`, payload);
        message.success("租户已更新");
      } else {
        await api.post("/tenants", payload);
        message.success("租户创建成功");
      }
      setModalVisible(false);
      form.resetFields();
      fetchTenants();
    } catch (err) {
      if (err.response?.data?.message) message.error(err.response.data.message);
    }
    setSubmitting(false);
  };

  const columns = [
    {
      title: "名称", dataIndex: "name", width: 160,
      render: (text, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => { setSelectedTenant(record); setDetailVisible(true); }}>
          <TeamOutlined style={{ marginRight: 4 }} />{text}
        </Button>
      ),
    },
    { title: "编码", dataIndex: "code", width: 100, render: v => v || "-" },
    { title: "管理员邮箱", dataIndex: "contactEmail", width: 200, ellipsis: true, render: v => v || "-" },
    {
      title: "配额", width: 260,
      render: (_, record) => {
        const q = parseQuota(record.resourceQuota);
        return (
          <Space size={4} wrap>
            <Tag>芯片: {q.max_chips || "-"}</Tag>
            <Tag>并发: {q.max_concurrent || "-"}</Tag>
            <Tag>存储: {q.storage_gb || "-"}GB</Tag>
          </Space>
        );
      },
    },
    {
      title: "状态", dataIndex: "status", width: 90,
      render: (v) => {
        const info = STATUS_MAP[v] || { text: v, color: "default" };
        return <Badge status={info.color} text={info.text} />;
      },
    },
    {
      title: "创建时间", dataIndex: "createdAt", width: 160,
      render: v => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-",
    },
    {
      title: "操作", width: 120,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="详情">
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => { setSelectedTenant(record); setDetailVisible(true); }} />
          </Tooltip>
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title={<Space><TeamOutlined /><span>租户管理</span><Tag color="blue">{tenants.length} 个租户</Tag></Space>}
        extra={
          <Space>
            <Input placeholder="搜索名称/邮箱" prefix={<SearchOutlined />} allowClear style={{ width: 200 }}
              value={searchText} onChange={e => setSearchText(e.target.value)} onPressEnter={fetchTenants} />
            <Button icon={<ReloadOutlined />} onClick={fetchTenants}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>创建租户</Button>
          </Space>
        }
      >
        <Table columns={columns} dataSource={tenants} rowKey="id" loading={loading}
          pagination={{ pageSize: 20, showTotal: t => `共 ${t} 个租户` }} size="middle" />
      </Card>

      {/* 创建/编辑弹窗 */}
      <Modal title={editingTenant ? "编辑租户" : "创建租户"} open={modalVisible}
        onOk={handleSubmit} onCancel={() => setModalVisible(false)}
        confirmLoading={submitting} width={600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="租户名称" rules={[{ required: true, message: "请输入租户名称" }]}>
            <Input placeholder="如：上海AI实验室" />
          </Form.Item>
          <Form.Item name="code" label="租户编码">
            <Input placeholder="唯一编码，如: sh-ai-lab" disabled={!!editingTenant} />
          </Form.Item>
          <Form.Item name="adminEmail" label="管理员邮箱" rules={[{ type: "email", message: "请输入正确的邮箱" }]}>
            <Input placeholder="admin@example.com" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="租户描述" />
          </Form.Item>
          {editingTenant && (
            <Form.Item name="status" label="状态">
              <Select options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.text }))} />
            </Form.Item>
          )}
          <Card title="资源配额" size="small" style={{ marginBottom: 16 }}>
            <Space size={16} wrap>
              <Form.Item name="maxChips" label="最大芯片数" style={{ marginBottom: 0 }}>
                <InputNumber min={1} max={10000} />
              </Form.Item>
              <Form.Item name="maxConcurrent" label="最大并发任务" style={{ marginBottom: 0 }}>
                <InputNumber min={1} max={1000} />
              </Form.Item>
              <Form.Item name="storageGb" label="存储配额(GB)" style={{ marginBottom: 0 }}>
                <InputNumber min={1} max={100000} />
              </Form.Item>
              <Form.Item name="validUntil" label="有效期至" style={{ marginBottom: 0 }}>
                <DatePicker />
              </Form.Item>
            </Space>
          </Card>
        </Form>
      </Modal>

      {/* 详情弹窗 */}
      <Modal title="租户详情" open={detailVisible} onCancel={() => setDetailVisible(false)} footer={null} width={600}>
        {selectedTenant && (() => {
          const q = parseQuota(selectedTenant.resourceQuota);
          return (
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="名称">{selectedTenant.name}</Descriptions.Item>
              <Descriptions.Item label="编码">{selectedTenant.code || "-"}</Descriptions.Item>
              <Descriptions.Item label="管理员邮箱" span={2}>{selectedTenant.contactEmail || "-"}</Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>{selectedTenant.description || "-"}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Badge status={STATUS_MAP[selectedTenant.status]?.color || "default"}
                  text={STATUS_MAP[selectedTenant.status]?.text || selectedTenant.status} />
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {selectedTenant.createdAt ? dayjs(selectedTenant.createdAt).format("YYYY-MM-DD HH:mm") : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="最大芯片数">{q.max_chips || "-"}</Descriptions.Item>
              <Descriptions.Item label="最大并发">{q.max_concurrent || "-"}</Descriptions.Item>
              <Descriptions.Item label="存储配额">{q.storage_gb ? q.storage_gb + " GB" : "-"}</Descriptions.Item>
              <Descriptions.Item label="有效期至">{q.valid_until || "-"}</Descriptions.Item>
            </Descriptions>
          );
        })()}
      </Modal>
    </div>
  );
}
