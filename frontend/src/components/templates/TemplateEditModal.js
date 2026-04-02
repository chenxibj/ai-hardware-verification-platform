/**
 * @file TemplateEditModal.js
 * @description 模板详情 + 编辑/创建弹窗
 * @param {Object} props
 * @param {boolean}  props.detailVisible - 详情弹窗是否显示
 * @param {boolean}  props.editVisible - 编辑弹窗是否显示
 * @param {Object}   props.selected - 当前选中模板
 * @param {Object}   props.form - Ant Design Form 实例
 * @param {Function} props.onDetailClose - 关闭详情弹窗
 * @param {Function} props.onEditClose - 关闭编辑弹窗
 * @param {Function} props.onSubmit - 提交表单
 */
import React from "react";
import {
  Modal, Descriptions, Tag, Form, Input, Select, Row, Col, Typography,
} from "antd";
import {
  EVAL_TYPES, EVAL_DIMENSIONS, parseConfig,
} from "./templateConstants";
import dayjs from "dayjs";

const { TextArea } = Input;
const { Text } = Typography;

/** 渲染额外配置详情 */
const renderConfigDetail = (configJson) => {
  const config = parseConfig(configJson);
  const entries = Object.entries(config).filter(([k]) => !["evalDimension", "evalObject"].includes(k));
  if (entries.length === 0) return <Text type="secondary">无额外配置</Text>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {entries.map(([key, value]) => (
        <Tag key={key} style={{ marginBottom: 4 }}>
          <Text strong style={{ fontSize: 12 }}>{key}: </Text>
          <Text style={{ fontSize: 12 }}>{Array.isArray(value) ? value.join(", ") : String(value)}</Text>
        </Tag>
      ))}
    </div>
  );
};

export default function TemplateEditModal({
  detailVisible, editVisible, selected, form,
  onDetailClose, onEditClose, onSubmit,
}) {
  return (
    <>
      {/* Detail Modal */}
      <Modal title="模板详情" open={detailVisible} onCancel={onDetailClose} footer={null} width={700}>
        {selected && (() => {
          const config = parseConfig(selected.configJson);
          return (
            <div>
              <Descriptions bordered column={2} size="small">
                <Descriptions.Item label="名称" span={2}>
                  {selected.name} {selected.isSystem && <Tag color="purple">📦 系统预置</Tag>}
                </Descriptions.Item>
                <Descriptions.Item label="评测类型"><Tag color="blue">{EVAL_TYPES[selected.evalType] || selected.evalType}</Tag></Descriptions.Item>
                <Descriptions.Item label="评测维度"><Tag>{EVAL_DIMENSIONS[config.evalDimension] || config.evalDimension || "-"}</Tag></Descriptions.Item>
                <Descriptions.Item label="描述" span={2}>{selected.description || "-"}</Descriptions.Item>
                <Descriptions.Item label="创建时间">{selected.createdAt ? dayjs(selected.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Descriptions.Item>
                <Descriptions.Item label="更新时间">{selected.updatedAt ? dayjs(selected.updatedAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Descriptions.Item>
              </Descriptions>
              <div style={{ marginTop: 16 }}>
                <Text strong style={{ display: "block", marginBottom: 8 }}>配置参数：</Text>
                {renderConfigDetail(selected.configJson)}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Edit/Create Modal */}
      <Modal title={selected ? "编辑模板" : "新建模板"} open={editVisible}
        onCancel={onEditClose} onOk={() => form.submit()} okText={selected ? "保存" : "创建"}>
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item name="name" label="模板名称" rules={[{ required: true, message: "请输入模板名称" }]}>
            <Input placeholder="例：GPU 性能基准评测" maxLength={100} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="evalDimension" label="评测维度">
                <Select placeholder="选择评测维度" allowClear
                  options={Object.entries(EVAL_DIMENSIONS).map(([k, v]) => ({ value: k, label: v }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="evalType" label="评测类型" rules={[{ required: true, message: "请选择评测类型" }]}>
                <Select placeholder="选择评测类型"
                  options={Object.entries(EVAL_TYPES).map(([k, v]) => ({ value: k, label: v }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="描述模板用途" maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
