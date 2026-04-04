import React from "react";
import { Form, Select, InputNumber, Divider, Alert } from "antd";
const { Option } = Select;
const PRECISIONS = ["FP32", "FP16", "BF16", "INT8", "INT4"];
const QUANT_METHODS = ["PTQ", "QAT", "GPTQ", "AWQ", "SmoothQuant"];
export default function PrecisionConfigTab({ config = {}, onChange }) {
  const update = (k, v) => onChange && onChange({ ...config, [k]: v });
  return (
    <div>
      <Alert message="芯片精度评测参数配置" type="info" showIcon style={{ marginBottom: 16 }} />
      <Form layout="vertical">
        <Form.Item label="基准精度">
          <Select value={config.baselinePrecision || "FP32"} onChange={v => update("baselinePrecision", v)}>
            {PRECISIONS.map(p => <Option key={p} value={p}>{p}</Option>)}
          </Select>
        </Form.Item>
        <Form.Item label="目标精度（可多选）">
          <Select mode="multiple" value={config.targetPrecisions || []} onChange={v => update("targetPrecisions", v)} placeholder="选择目标精度">
            {PRECISIONS.map(p => <Option key={p} value={p}>{p}</Option>)}
          </Select>
        </Form.Item>
        <Form.Item label="量化方法">
          <Select value={config.quantMethod || "PTQ"} onChange={v => update("quantMethod", v)}>
            {QUANT_METHODS.map(m => <Option key={m} value={m}>{m}</Option>)}
          </Select>
        </Form.Item>
        <Divider />
        <Form.Item label="精度误差阈值">
          <InputNumber min={0} max={100} step={0.1} value={config.errorThreshold || 1.0} onChange={v => update("errorThreshold", v)} addonAfter="%" />
        </Form.Item>
      </Form>
    </div>
  );
}
