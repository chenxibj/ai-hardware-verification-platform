import React, { useState, useEffect, useCallback } from "react";
import { Card, Table, Tag, Button, Radio, Modal, Form, Input, Select, message, Space } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import api from "../utils/api";
const DEMAND_TYPES = ["芯片评测需求", "算子适配需求", "模型验证需求", "框架兼容需求", "定制开发需求"];
const STATUS_COLORS = { OPEN: "blue", IN_PROGRESS: "orange", MATCHED: "green", CLOSED: "default" };
const STATUS_LABELS = { OPEN: "待对接", IN_PROGRESS: "对接中", MATCHED: "已匹配", CLOSED: "已关闭" };
export default function DemandBoard() {
  const [demands, setDemands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const fetchDemands = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get("/api/v1/community/demands"); setDemands(r.data?.data?.content || []); } catch(e) {} finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchDemands(); }, [fetchDemands]);
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      await api.post("/api/v1/community/demands", values);
      message.success("需求已发布"); setModalVisible(false); form.resetFields(); fetchDemands();
    } catch(e) { message.error("发布失败"); }
  };
  const filtered = typeFilter === "all" ? demands : demands.filter(d => d.type === typeFilter);
  const columns = [
    { title: "类型", dataIndex: "type", width: 140, render: v => <Tag>{v}</Tag> },
    { title: "标题", dataIndex: "title", ellipsis: true },
    { title: "状态", dataIndex: "status", width: 90, render: v => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag> },
    { title: "时间", dataIndex: "createdAt", width: 160 },
  ];
  return (
    <Card title="需求对接" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>发布需求</Button>}>
      <Space style={{ marginBottom: 16 }}>
        <Radio.Group value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <Radio.Button value="all">全部</Radio.Button>
          {DEMAND_TYPES.map(t => <Radio.Button key={t} value={t}>{t}</Radio.Button>)}
        </Radio.Group>
      </Space>
      <Table dataSource={filtered} columns={columns} loading={loading} rowKey="id" />
      <Modal title="发布需求" open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={560}>
        <Form form={form} layout="vertical">
          <Form.Item name="type" label="需求类型" rules={[{ required: true }]}><Select options={DEMAND_TYPES.map(t => ({ label: t, value: t }))} /></Form.Item>
          <Form.Item name="title" label="需求标题" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="详细描述" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
