/**
 * @file TenantList.js
 * @description 多租户管理页面 — 仅 SUPER_ADMIN 可见
 * Issue: #174
 */
import React, { useState, useEffect } from "react";
import {
  Card, Table, Tag, Space, Button, Modal, Form, Input, Select, message, Badge,
} from "antd";
import {
  PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";

const STATUS_MAP = {
  ACTIVE: { color: "success", text: "活跃" },
  INACTIVE: { color: "default", text: "未激活" },
  SUSPENDED: { color: "error", text: "已停用" },
};

export default function TenantList() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const res = await api.get("/tenants");
      if (res.data.code === 0) setTenants(res.data.data || []);
    } catch (e) {
      if (e.response?.status === 403) {
        message.error("权限不足，仅超级管理员可访问");
      } else {
        message.error("获取租户列表失败");
      }
    }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTenants(); }, []);

  const handleCreate = async (values) => {
    try {
      const res = await api.post("/tenants", values);
      if (res.data.code === 0) {
        message.success("租户创建成功");
        setCreateVisible(false);
        form.resetFields();
        fetchTenants();
      }
    } catch (e) { message.error("创建失败: " + (e.response?.data?.message || e.message)); }
  };

  const handleEdit = (tenant) => {
    setEditingTenant(tenant);
    editForm.setFieldsValue({
      name: tenant.name,
      contactEmail: tenant.contactEmail,
      description: tenant.description,
      status: tenant.status,
    });
    setEditVisible(true);
  };

  const handleUpdate = async (values) => {
    try {
      const res = await api.put(`/tenants/${editingTenant.id}`, values);
      if (res.data.code === 0) {
        message.success("更新成功");
        setEditVisible(false);
        editForm.resetFields();
        fetchTenants();
      }
    } catch (e) { message.error("更新失败"); }
  };

  const handleDelete = (id, name) => {
    Modal.confirm({
      title: `确定删除租户 "${name}" ？`,
      content: "删除后不可恢复",
      okText: "删除", okType: "danger", cancelText: "取消",
      onOk: async () => {
        try { await api.delete("/tenants/" + id); message.success("已删除"); fetchTenants(); }
        catch (e) { message.error("删除失败"); }
      },
    });
  };

  const columns = [
    { title: "租户名称", dataIndex: "name", key: "name", width: 180 },
    { title: "编码", dataIndex: "code", key: "code", width: 180, render: v => <Tag>{v}</Tag> },
    { title: "联系邮箱", dataIndex: "contactEmail", key: "contactEmail", width: 200, render: v => v || "-" },
    {
      title: "状态", dataIndex: "status", key: "status", width: 100,
      render: v => {
        const s = STATUS_MAP[v] || { color: "default", text: v };
        return <Badge status={s.color} text={s.text} />;
      },
    },
    {
      title: "用户数", dataIndex: "userCount", key: "userCount", width: 80,
      render: v => <Tag icon={<TeamOutlined />} color="blue">{v || 0}</Tag>,
    },
    { title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 160, render: v => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-" },
    {
      title: "操作", key: "action", width: 180, render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id, r.name)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title={<Space><TeamOutlined />多租户管理</Space>}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateVisible(true)}>
            创建租户
          </Button>
        }
      >
        <Table columns={columns} dataSource={tenants} rowKey="id" loading={loading}
          scroll={{ x: "max-content" }}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: t => `共 ${t} 条` }} />
      </Card>

      {/* 创建租户 Modal */}
      <Modal title="创建租户" open={createVisible} onCancel={() => setCreateVisible(false)} footer={null} width={500} destroyOnClose>
        <Form form={form} onFinish={handleCreate} layout="vertical">
          <Form.Item name="name" label="租户名称" rules={[{ required: true, message: "请输入租户名称" }]}>
            <Input placeholder="例：上海人工智能实验室" />
          </Form.Item>
          <Form.Item name="code" label="租户编码" extra="留空将自动生成">
            <Input placeholder="例：shailab（可留空）" />
          </Form.Item>
          <Form.Item name="contactEmail" label="联系邮箱">
            <Input placeholder="admin@example.com" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block size="large">创建</Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑租户 Modal */}
      <Modal title="编辑租户" open={editVisible} onCancel={() => setEditVisible(false)} footer={null} width={500} destroyOnClose>
        <Form form={editForm} onFinish={handleUpdate} layout="vertical">
          <Form.Item name="name" label="租户名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contactEmail" label="联系邮箱">
            <Input />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={[
              { value: "ACTIVE", label: "活跃" },
              { value: "INACTIVE", label: "未激活" },
              { value: "SUSPENDED", label: "已停用" },
            ]} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block size="large">保存</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
