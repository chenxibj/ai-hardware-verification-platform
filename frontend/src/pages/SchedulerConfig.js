import React, { useState, useEffect } from "react";
import { Card, Form, Select, InputNumber, Button, message, Divider } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import api from "../utils/api";
const PRIORITY_STRATEGIES = [
  { label: "FIFO（先进先出）", value: "FIFO" },
  { label: "优先级调度", value: "PRIORITY" },
  { label: "公平调度", value: "FAIR" },
];
const RETRY_STRATEGIES = [
  { label: "不重试", value: "NONE" },
  { label: "固定间隔", value: "FIXED" },
  { label: "指数退避", value: "EXPONENTIAL" },
];
export default function SchedulerConfig() {
  const [config, setConfig] = useState({ priorityStrategy: "FIFO", maxConcurrency: 4, retryStrategy: "FIXED", retryMaxAttempts: 3 });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    api.get("/api/v1/admin/scheduler-config").then(r => { if (r.data?.data) setConfig(r.data.data); }).catch(() => {});
  }, []);
  const handleSave = async () => {
    setLoading(true);
    try { await api.put("/api/v1/admin/scheduler-config", config); message.success("调度配置已保存"); } catch(e) { message.error("保存失败"); } finally { setLoading(false); }
  };
  const upd = (k, v) => setConfig(p => ({...p, [k]: v}));
  return (
    <Card title={<span><SettingOutlined /> 调度配置</span>}>
      <Form layout="vertical" style={{ maxWidth: 600 }}>
        <Form.Item label="优先级策略"><Select options={PRIORITY_STRATEGIES} value={config.priorityStrategy} onChange={v => upd("priorityStrategy", v)} /></Form.Item>
        <Form.Item label="最大并发任务数"><InputNumber min={1} max={100} value={config.maxConcurrency} onChange={v => upd("maxConcurrency", v)} /></Form.Item>
        <Divider />
        <Form.Item label="重试策略"><Select options={RETRY_STRATEGIES} value={config.retryStrategy} onChange={v => upd("retryStrategy", v)} /></Form.Item>
        <Form.Item label="最大重试次数"><InputNumber min={0} max={10} value={config.retryMaxAttempts} onChange={v => upd("retryMaxAttempts", v)} /></Form.Item>
        <Button type="primary" loading={loading} onClick={handleSave}>保存配置</Button>
      </Form>
    </Card>
  );
}
