import React, { useState, useEffect } from "react";
import { Card, Table, Tag, Space, Button, Row, Col, Statistic, Select, message, Modal, Badge, Form, Input, Spin } from "antd";
import { TeamOutlined, UserOutlined, ReloadOutlined, SafetyOutlined, PlusOutlined } from "@ant-design/icons";
import { userApi } from "../utils/api";
import dayjs from "dayjs";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [createVisible, setCreateVisible] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await userApi.list({ size: 100 });
      if (res.data.code === 0) setUsers(res.data.data || []);
    } catch(e) {
      if (e.response?.status === 403) {
        message.warning("权限不足，无法查看用户列表");
      } else {
        message.error("获取用户列表失败");
      }
    }
    finally { setLoading(false); }
  };

  const fetchStats = async () => {
    try { const res = await userApi.stats(); if (res.data.code === 0) setStats(res.data.data); } catch(e) {}
  };

  const handleCreate = async (values) => {
    setCreateLoading(true);
    try {
      const res = await userApi.create(values);
      if (res.data.code === 0) { message.success("用户创建成功"); setCreateVisible(false); form.resetFields(); fetchUsers(); fetchStats(); }
      else message.error(res.data.message || "创建失败");
    } catch(e) { message.error(e.response?.data?.message || "创建失败"); }
    finally { setCreateLoading(false); }
  };
  useEffect(() => { fetchUsers(); fetchStats(); }, []);

  const handleRoleChange = async (id, role) => {
    try {
      await userApi.updateRole(id, role);
      message.success("角色已更新");
      fetchUsers();
    } catch(e) { message.error(e.response?.data?.message || "更新失败"); }
  };

  const handleStatusChange = async (id, status) => {
    const action = status === "ACTIVE" ? "启用" : "禁用";
    Modal.confirm({ title: action + "用户？", okText: "确定", cancelText: "取消",
      onOk: async () => {
        try { await userApi.updateStatus(id, status); message.success("状态已更新"); fetchUsers(); fetchStats(); }
        catch(e) { message.error(e.response?.data?.message || "更新失败"); }
      }
    });
  };

  const roleMap = { ADMIN:"管理员", USER:"普通用户", REVIEWER:"审核员", OPERATOR:"运维" };
  const roleOptions = [
    {value:"ADMIN",label:"管理员"},{value:"USER",label:"普通用户"},
    {value:"REVIEWER",label:"审核员"},{value:"OPERATOR",label:"运维"}
  ];

  const columns = [
    { title:"ID", dataIndex:"id", key:"id", width:60 },
    { title:"用户名", dataIndex:"username", key:"username", width:120 },
    { title:"邮箱", dataIndex:"email", key:"email", width:200 },
    { title:"手机", dataIndex:"phone", key:"phone", width:130, render:v => v||"-" },
    { title:"角色", dataIndex:"role", key:"role", width:130,
      render:(v,r) => <Select value={v} size="small" style={{width:110}} options={roleOptions}
        onChange={val => handleRoleChange(r.id, val)}/> },
    { title:"状态", dataIndex:"status", key:"status", width:90,
      render:v => <Badge status={v==="ACTIVE"?"success":"error"} text={v==="ACTIVE"?"正常":"禁用"}/> },
    { title:"最后登录", dataIndex:"lastLoginAt", key:"lastLoginAt", width:170,
      render:v => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "从未登录" },
    { title:"注册时间", dataIndex:"createdAt", key:"createdAt", width:170,
      render:v => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-" },
    { title:"操作", key:"action", width:100, render:(_,r) => (
      r.status==="ACTIVE"
        ? <Button type="link" size="small" danger onClick={() => handleStatusChange(r.id,"LOCKED")}>禁用</Button>
        : <Button type="link" size="small" onClick={() => handleStatusChange(r.id,"ACTIVE")}>启用</Button>
    )},
  ];

  return (
    <Spin spinning={loading}>
    <div>
      <Row gutter={16} style={{marginBottom:24}}>
        <Col xs={24} sm={12} md={8}><Card hoverable><Statistic title="用户总数" value={stats.total||0} prefix={<TeamOutlined/>}/></Card></Col>
        <Col xs={24} sm={12} md={8}><Card hoverable><Statistic title="活跃用户" value={stats.active||0} valueStyle={{color:"#52c41a"}} prefix={<UserOutlined/>}/></Card></Col>
        <Col xs={24} sm={12} md={8}><Card hoverable><Statistic title="已禁用" value={stats.inactive||0} valueStyle={{color:"#ff4d4f"}} prefix={<SafetyOutlined/>}/></Card></Col>
      </Row>
      <Card title="用户管理" extra={<Space><Button icon={<ReloadOutlined/>} onClick={() => { fetchUsers(); fetchStats(); }}>刷新</Button><Button type="primary" icon={<PlusOutlined/>} onClick={() => setCreateVisible(true)}>新增用户</Button></Space>}>
        <Table columns={columns} dataSource={users} rowKey="id" loading={loading} pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showTotal: (total) => `共 ${total} 条` }} scroll={{ x: 'max-content' }}/>
      </Card>

      <Modal title="新增用户" open={createVisible} onCancel={() => { setCreateVisible(false); form.resetFields(); }} footer={null} destroyOnClose>
        <Form form={form} onFinish={handleCreate} layout="vertical" initialValues={{ role: "USER", password: "ahvp123456" }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}><Input placeholder="请输入用户名" maxLength={64}/></Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, message: "请输入邮箱" }, { type: "email", message: "邮箱格式不正确" }]}><Input placeholder="请输入邮箱"/></Form.Item>
          <Form.Item name="phone" label="手机号"><Input placeholder="请输入手机号（选填）"/></Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}><Select options={[{value:"ADMIN",label:"管理员"},{value:"USER",label:"普通用户"},{value:"REVIEWER",label:"审核员"},{value:"OPERATOR",label:"运维"}]}/></Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, message: "请输入初始密码" }]}><Input.Password placeholder="初始密码"/></Form.Item>
          <div style={{ textAlign: "right" }}>
            <Space>
              <Button onClick={() => { setCreateVisible(false); form.resetFields(); }}>取消</Button>
              <Button type="primary" htmlType="submit" loading={createLoading}>创建</Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
    </Spin>
  );
}
