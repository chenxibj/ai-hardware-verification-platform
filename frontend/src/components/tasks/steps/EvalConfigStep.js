/**
 * @file EvalConfigStep.js
 * @description 评测参数配置步骤 — 渐进式披露+联动+预览+JSON导入导出 (#179 US-1.4)
 */
import React, { useState, useCallback } from "react";
import {
  Form, Select, InputNumber, Switch, Radio, Slider, Checkbox,
  Row, Col, Divider, Space, Typography, Card, Button, Upload,
  Collapse, Tag, Tooltip, message, Modal, Input,
} from "antd";
import {
  SettingOutlined, InboxOutlined, CloudServerOutlined,
  ImportOutlined, ExportOutlined, EyeOutlined,
  ThunderboltOutlined, InfoCircleOutlined,
} from "@ant-design/icons";
import { GPU_OPTIONS, PRECISION_OPTIONS, PRESET_TEMPLATES } from "../taskConstants";

const { Text, Title } = Typography;
const { Panel } = Collapse;
const { Dragger } = Upload;

/* ── 参数模板预填数据 ── */
const TEMPLATE_PARAMS = {
  chip_perf: { precision: "FP16", batchSize: 64, gpuCount: 1, timeout: 120, metrics: ["算力(TOPS)", "能效比(TOPS/W)", "互联带宽(GB/s)", "P95延迟"] },
  model_accuracy: { precision: "FP32", batchSize: 32, gpuCount: 1, timeout: 60, metrics: ["Top-1准确率", "Top-5准确率", "F1值", "精度损失(%)"] },
  model_perf: { precision: "FP16", batchSize: 64, gpuCount: 1, timeout: 60, metrics: ["首包延迟", "P95延迟", "吞吐量(QPS)", "GPU利用率"] },
  framework_compat: { precision: "FP32", batchSize: 16, gpuCount: 1, timeout: 90, metrics: ["安装成功率", "模型加载率", "算子支持率", "兼容性评分"] },
  operator_perf: { precision: "FP16", batchSize: 128, gpuCount: 1, timeout: 60, metrics: ["执行延迟", "吞吐量", "精度损失", "算力利用率"] },
  scene_effect: { precision: "FP16", batchSize: 32, gpuCount: 1, timeout: 120, metrics: ["准确率", "召回率", "业务指标", "适配性评分"] },
};

export default function EvalConfigStep({
  backendResources, backendDatasets, computeNodes, onlineNodes, form,
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importJson, setImportJson] = useState("");

  /* 模板预填 */
  const handleTemplateApply = useCallback((templateId) => {
    const params = TEMPLATE_PARAMS[templateId];
    if (params && form) {
      form.setFieldsValue(params);
      message.success("模板参数已填入");
    }
  }, [form]);

  /* 精度联动 — 获取当前选择的精度 */
  const currentPrecision = Form.useWatch?.("precision", form) || "FP16";

  /* JSON 导出 */
  const handleExport = () => {
    if (!form) return;
    const values = form.getFieldsValue(true);
    const json = JSON.stringify(values, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eval-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success("配置已导出");
  };

  /* JSON 导入 */
  const handleImport = () => {
    try {
      const obj = JSON.parse(importJson);
      form.setFieldsValue(obj);
      setImportModalVisible(false);
      setImportJson("");
      message.success("配置已导入");
    } catch (e) {
      message.error("JSON 格式错误");
    }
  };

  /* 实时摘要预览数据 */
  const previewData = form ? form.getFieldsValue(true) : {};

  return (
    <Row gutter={24} style={{ padding: "12px 0" }}>
      {/* 左侧：参数配置 */}
      <Col xs={24} lg={16}>
        {/* 模板快速填充 */}
        <Card size="small" title={<span><ThunderboltOutlined /> 快速模板填充</span>} style={{ marginBottom: 16 }}>
          <Space wrap>
            {PRESET_TEMPLATES.map(t => (
              <Button
                key={t.id}
                size="small"
                icon={t.icon}
                onClick={() => handleTemplateApply(t.id)}
              >
                {t.name}
              </Button>
            ))}
          </Space>
        </Card>

        {/* 导入/导出工具栏 */}
        <Space style={{ marginBottom: 16 }}>
          <Button icon={<ImportOutlined />} size="small" onClick={() => setImportModalVisible(true)}>导入JSON</Button>
          <Button icon={<ExportOutlined />} size="small" onClick={handleExport}>导出JSON</Button>
        </Space>

        {/* ── 常用参数（默认展示）── */}
        <Divider orientation="left">基础参数</Divider>

        <Form.Item name="datasetSource" label="数据集来源" initialValue="preset">
          <Radio.Group buttonStyle="solid">
            <Radio.Button value="preset">数字资产数据集</Radio.Button>
            <Radio.Button value="custom">自定义上传</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.datasetSource !== cur.datasetSource}>
          {({ getFieldValue }) => getFieldValue("datasetSource") === "preset" ? (
            <Form.Item name="datasetId" label="选择数据集" rules={[{ required: true, message: "请选择数据集" }]}>
              <Select placeholder="选择数据集" allowClear showSearch optionFilterProp="label"
                options={backendDatasets.map(d => ({
                  value: String(d.id),
                  label: d.name + (d.assetType ? ` (${d.assetType})` : "") + ((d.version && d.version !== "null") ? ` v${d.version}` : ""),
                }))} />
            </Form.Item>
          ) : (
            <Form.Item name="datasetFile" label="上传数据集">
              <Dragger accept=".csv,.xlsx,.zip,.tar.gz" maxCount={1}>
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p>点击或拖拽上传数据集</p>
              </Dragger>
            </Form.Item>
          )}
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="gpuType" label="GPU/芯片型号">
              <Select placeholder="选择芯片" allowClear
                options={backendResources.length > 0
                  ? backendResources.map(r => ({ value: String(r.id), label: r.name + (r.model ? ` (${r.model})` : "") }))
                  : GPU_OPTIONS
                } />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="gpuCount" label="GPU数量" initialValue={1}>
              <Slider min={1} max={128} marks={{ 1: "1", 4: "4", 8: "8", 16: "16", 32: "32", 64: "64", 128: "128" }} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="precision" label="精度类型" initialValue="FP16">
              <Select options={PRECISION_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="batchSize" label="Batch Size" initialValue={32}>
              <Slider min={1} max={1024} marks={{ 1: "1", 32: "32", 64: "64", 128: "128", 256: "256", 512: "512", 1024: "1K" }} />
            </Form.Item>
          </Col>
        </Row>

        {/* ── 精度联动参数 ── */}
        {(currentPrecision === "FP16" || currentPrecision === "BF16") && (
          <Card size="small" style={{ marginBottom: 16, background: "#f6ffed", borderColor: "#b7eb8f" }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <InfoCircleOutlined /> {currentPrecision} 精度专项参数
            </Text>
            {currentPrecision === "FP16" && (
              <Form.Item name="fp16Threshold" label="FP16 精度阈值" initialValue={0.001} style={{ marginTop: 8, marginBottom: 0 }}>
                <Slider min={0.0001} max={0.1} step={0.0001} marks={{ 0.0001: "0.0001", 0.001: "0.001", 0.01: "0.01", 0.1: "0.1" }} />
              </Form.Item>
            )}
            {currentPrecision === "BF16" && (
              <Form.Item name="bf16Threshold" label="BF16 精度阈值" initialValue={0.005} style={{ marginTop: 8, marginBottom: 0 }}>
                <Slider min={0.0001} max={0.1} step={0.0001} marks={{ 0.0001: "0.0001", 0.005: "0.005", 0.01: "0.01", 0.1: "0.1" }} />
              </Form.Item>
            )}
          </Card>
        )}

        <Form.Item name="metrics" label="评测指标">
          <Checkbox.Group>
            <Row gutter={[8, 8]}>
              {["延迟(ms)", "吞吐量(QPS)", "GPU利用率(%)", "内存占用(GB)", "功耗(W)", "Top-1准确率", "F1值", "精度损失(%)"].map(m => (
                <Col span={12} key={m}><Checkbox value={m}>{m}</Checkbox></Col>
              ))}
            </Row>
          </Checkbox.Group>
        </Form.Item>

        {/* ── 高级参数（折叠）── */}
        <Collapse
          ghost
          activeKey={showAdvanced ? ["advanced"] : []}
          onChange={(keys) => setShowAdvanced(keys.includes("advanced"))}
        >
          <Panel
            header={<Space><SettingOutlined /><Text>高级参数</Text><Tag color="blue" style={{ fontSize: 11 }}>可选</Tag></Space>}
            key="advanced"
          >
            <Divider orientation="left" style={{ fontSize: 13 }}>执行配置</Divider>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="timeout" label="超时时间(分钟)" initialValue={60}>
                  <Slider min={5} max={1440} marks={{ 5: "5", 60: "60", 240: "4h", 720: "12h", 1440: "24h" }} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="retryCount" label="自动重试次数" initialValue={0}>
                  <Select options={[0,1,2,3,4,5].map(n => ({ value: n, label: `${n} 次` }))} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="retryInterval" label="重试间隔(分钟)" initialValue={10}>
                  <Select options={[1,5,10,15,30,60].map(n => ({ value: n, label: `${n} 分钟` }))} />
                </Form.Item>
              </Col>
            </Row>

            <Divider orientation="left" style={{ fontSize: 13 }}>告警配置</Divider>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="enableAlert" label="异常告警" valuePropName="checked" initialValue={true}>
                  <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="alertEmail" label="告警邮箱">
                  <Select mode="tags" placeholder="输入邮箱后回车" tokenSeparators={[","]} />
                </Form.Item>
              </Col>
            </Row>

            <Divider orientation="left" style={{ fontSize: 13 }}>环境配置</Divider>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="warmupRuns" label="Warmup 次数" initialValue={3}>
                  <Select options={[0,1,3,5,10].map(n => ({ value: n, label: `${n} 次` }))} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="testRuns" label="正式运行次数" initialValue={5}>
                  <Select options={[1,3,5,10,20,50].map(n => ({ value: n, label: `${n} 次` }))} />
                </Form.Item>
              </Col>
            </Row>
          </Panel>
        </Collapse>
      </Col>

      {/* 右侧：实时预览摘要 */}
      <Col xs={24} lg={8}>
        <Card
          title={<span><EyeOutlined /> 配置摘要</span>}
          size="small"
          style={{ position: "sticky", top: 16 }}
        >
          <Space direction="vertical" style={{ width: "100%" }} size={4}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Text type="secondary">数据集来源</Text>
              <Text>{previewData.datasetSource === "preset" ? "数字资产" : "自定义"}</Text>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Text type="secondary">精度类型</Text>
              <Tag color="blue">{previewData.precision || "FP16"}</Tag>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Text type="secondary">Batch Size</Text>
              <Text>{previewData.batchSize || 32}</Text>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Text type="secondary">GPU 数量</Text>
              <Text>{previewData.gpuCount || 1}</Text>
            </div>
            {previewData.fp16Threshold && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Text type="secondary">FP16 阈值</Text>
                <Text>{previewData.fp16Threshold}</Text>
              </div>
            )}
            {previewData.bf16Threshold && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Text type="secondary">BF16 阈值</Text>
                <Text>{previewData.bf16Threshold}</Text>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Text type="secondary">超时</Text>
              <Text>{previewData.timeout || 60} 分钟</Text>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Text type="secondary">重试</Text>
              <Text>{previewData.retryCount || 0} 次</Text>
            </div>
            <Divider style={{ margin: "8px 0" }} />
            <Text type="secondary" style={{ fontSize: 12 }}>评测指标</Text>
            <div>
              {(previewData.metrics || []).map(m => (
                <Tag key={m} color="blue" style={{ marginBottom: 4, fontSize: 11 }}>{m}</Tag>
              ))}
              {(!previewData.metrics || previewData.metrics.length === 0) && <Text type="secondary" style={{ fontSize: 12 }}>未选择</Text>}
            </div>
          </Space>
        </Card>
      </Col>

      {/* JSON 导入弹窗 */}
      <Modal
        title="导入JSON配置"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        onOk={handleImport}
        okText="导入"
      >
        <Input.TextArea
          rows={10}
          value={importJson}
          onChange={e => setImportJson(e.target.value)}
          placeholder='粘贴JSON配置，例如：{"precision":"FP16","batchSize":64}'
        />
      </Modal>
    </Row>
  );
}
