/**
 * @file ConfirmStep.js
 * @description 创建任务最终确认步骤（模板/自定义两种模式）
 * @param {Object} props
 * @param {string}  props.mode - "template" | "custom"
 * @param {Object}  [props.template] - 已选模板（模板模式）
 * @param {Object}  [props.node] - 已选节点（模板模式）
 * @param {Object}  [props.form] - Ant Design Form 实例（自定义模式）
 * @param {Array}   [props.computeNodes] - 节点列表（自定义模式）
 */
import React from "react";
import { Descriptions, Alert, Tag, Badge, Typography } from "antd";
import {
  EVAL_TYPES, PRIORITIES, PRIORITY_COLORS, GPU_OPTIONS,
} from "../taskConstants";

const { Text } = Typography;

export default function ConfirmStep({ mode, template, node, form, computeNodes }) {
  if (mode === "template") {
    return (
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 0" }}>
        <Alert message="请确认任务配置" description="提交后将自动调度到计算节点执行"
          type="info" showIcon style={{ marginBottom: 24 }} />
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="创建模式">模板化创建</Descriptions.Item>
          <Descriptions.Item label="使用模板">{template?.name || "-"}</Descriptions.Item>
          <Descriptions.Item label="评测类型" span={2}>
            <Tag color="blue">{EVAL_TYPES[template?.evalType] || "-"}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="目标计算节点" span={2}>
            {node ? <><Badge status="success" /> {node.name} ({node.ipAddress})</> : <Text type="secondary">自动分配</Text>}
          </Descriptions.Item>
          {template?.metrics && (
            <Descriptions.Item label="评测指标" span={2}>
              {template.metrics.map(m => <Tag key={m} color="blue">{m}</Tag>)}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="模板描述" span={2}>{template?.desc || "-"}</Descriptions.Item>
        </Descriptions>
      </div>
    );
  }

  // Custom mode
  const vals = form ? form.getFieldsValue(true) : {};
  const selectedNode = computeNodes?.find(n => n.id === vals.targetNodeId);
  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 0" }}>
      <Alert message="请确认任务配置信息" description="提交后将自动调度到计算节点执行"
        type="info" showIcon style={{ marginBottom: 24 }} />
      <Descriptions bordered column={2} size="small">
        <Descriptions.Item label="创建模式">自定义创建</Descriptions.Item>
        <Descriptions.Item label="任务名称">{vals.name || "-"}</Descriptions.Item>
        <Descriptions.Item label="评测类型">{EVAL_TYPES[vals.evalType] || "-"}</Descriptions.Item>
        <Descriptions.Item label="优先级">
          <Tag color={PRIORITY_COLORS[vals.priority]}>{PRIORITIES[vals.priority] || "中"}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="目标节点" span={2}>
          {selectedNode ? <><Badge status="success" /> {selectedNode.name}</> : <Text type="secondary">自动分配</Text>}
        </Descriptions.Item>
        <Descriptions.Item label="GPU">
          {GPU_OPTIONS.find(g => g.value === vals.gpuType)?.label || "未指定"} x {vals.gpuCount || 1}
        </Descriptions.Item>
        <Descriptions.Item label="精度">{vals.precision || "FP16"}</Descriptions.Item>
        <Descriptions.Item label="Batch Size">{vals.batchSize || 32}</Descriptions.Item>
        <Descriptions.Item label="超时">{vals.timeout || 60} 分钟</Descriptions.Item>
        {vals.metrics?.length > 0 && (
          <Descriptions.Item label="评测指标" span={2}>
            {vals.metrics.map(m => <Tag key={m} color="blue">{m}</Tag>)}
          </Descriptions.Item>
        )}
        {vals.tags?.length > 0 && (
          <Descriptions.Item label="标签" span={2}>
            {vals.tags.map(t => <Tag key={t}>{t}</Tag>)}
          </Descriptions.Item>
        )}
        {vals.description && <Descriptions.Item label="描述" span={2}>{vals.description}</Descriptions.Item>}
      </Descriptions>
    </div>
  );
}
