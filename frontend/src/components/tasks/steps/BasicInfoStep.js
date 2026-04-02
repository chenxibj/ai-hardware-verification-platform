/**
 * @file BasicInfoStep.js
 * @description 创建任务 Step 1（自定义模式）— 基础信息填写
 */
import React from "react";
import { Form, Input, Select, Row, Col } from "antd";
import { EVAL_TYPES, PRIORITIES } from "../taskConstants";

const { TextArea } = Input;

export default function BasicInfoStep() {
  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 0" }}>
      <Form.Item name="name" label="任务名称" rules={[{ required: true, message: "请输入任务名称" }]}>
        <Input placeholder="例：华为昇腾910B ResNet50 推理性能评测" maxLength={100} showCount />
      </Form.Item>
      <Form.Item name="evalType" label="评测类型" rules={[{ required: true }]}>
        <Select options={Object.entries(EVAL_TYPES).map(([k, v]) => ({ value: k, label: v }))} placeholder="选择评测类型" />
      </Form.Item>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="priority" label="优先级" initialValue="MEDIUM">
            <Select options={Object.entries(PRIORITIES).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="tags" label="标签">
            <Select mode="tags" placeholder="输入标签后回车" tokenSeparators={[","]} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="description" label="任务描述">
        <TextArea rows={3} placeholder="详细描述评测目的、关注点" maxLength={500} showCount />
      </Form.Item>
    </div>
  );
}
