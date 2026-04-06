import React, { useState } from "react";
import { Drawer, Collapse, Form, Input, Button, message, FloatButton } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import api from "../utils/api";
const FAQ_LIST = [
  { q: "如何创建评测任务？", a: "进入评测任务页面，点击创建计划按钮，按照6步向导完成配置。" },
  { q: "如何查看评测报告？", a: "在评测报告页面可查看所有已完成的报告，点击查看进入详情。" },
  { q: "如何注册芯片？", a: "进入芯片管理页面，点击注册芯片，填写芯片基本信息即可。" },
  { q: "如何管理计算节点？", a: "在资源管理 > 计算节点中添加和管理您的计算资源。" },
  { q: "遇到问题如何反馈？", a: "点击右下角帮助按钮，在反馈栏填写问题描述提交即可。" },
];
export default function HelpPanel() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const handleFeedback = async () => {
    try {
      const values = await form.validateFields();
      await api.post("/api/v1/feedback", values);
      message.success("反馈已提交"); form.resetFields();
    } catch(e) { message.error("提交失败"); }
  };
  return (
    <span>
      <FloatButton icon={<QuestionCircleOutlined />} tooltip="帮助" onClick={() => setOpen(true)} style={{ right: 24, bottom: 24 }} />
      <Drawer title="帮助中心" open={open} onClose={() => setOpen(false)} width={420}>
        <h4>常见问题</h4>
        <Collapse items={FAQ_LIST.map((f, i) => ({ key: String(i), label: f.q, children: f.a }))} />
        <h4 style={{ marginTop: 24 }}>问题反馈</h4>
        <Form form={form} layout="vertical">
          <Form.Item name="type" label="类型" initialValue="BUG"><Input /></Form.Item>
          <Form.Item name="content" label="描述" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Button type="primary" onClick={handleFeedback}>提交反馈</Button>
        </Form>
      </Drawer>
    </span>
  );
}
