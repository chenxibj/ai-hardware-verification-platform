/**
 * @file EvalConfigStep.js
 * @description 创建任务 Step 2（自定义模式）— 评测配置
 * @param {Object} props
 * @param {Array} props.backendResources - 后端资源列表
 * @param {Array} props.backendDatasets - 数据集列表
 * @param {Array} props.computeNodes - 全部节点
 * @param {Array} props.onlineNodes - 在线节点
 */
import React from "react";
import {
  Form, Input, Select, InputNumber, Switch, Upload, Radio,
  Row, Col, Divider, Space, Badge, Tag, Alert, Typography,
} from "antd";
import { InboxOutlined, CloudServerOutlined } from "@ant-design/icons";
import { GPU_OPTIONS, PRECISION_OPTIONS } from "../taskConstants";

const { Dragger } = Upload;
const { Text } = Typography;

export default function EvalConfigStep({
  backendResources, backendDatasets, computeNodes, onlineNodes,
}) {
  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 0" }}>
      <Divider orientation="left">数据集配置</Divider>
      <Form.Item name="datasetSource" label="数据集来源" initialValue="preset">
        <Radio.Group>
          <Radio.Button value="preset">数字资产数据集</Radio.Button>
          <Radio.Button value="custom">自定义上传</Radio.Button>
        </Radio.Group>
      </Form.Item>
      <Form.Item noStyle shouldUpdate={(prev, cur) => prev.datasetSource !== cur.datasetSource}>
        {({ getFieldValue }) => getFieldValue("datasetSource") === "preset" ? (
          <>
            {backendDatasets.length > 0 ? (
              <Form.Item name="datasetId" label="选择数据集" rules={[{ required: true, message: "请选择数据集" }]}>
                <Select placeholder="选择数据集" allowClear showSearch optionFilterProp="label"
                  options={backendDatasets.map(d => ({
                    value: String(d.id),
                    label: d.name + (d.assetType ? " (" + d.assetType + ")" : "") + ((d.version && d.version !== "null") ? " v" + d.version : ""),
                  }))} />
              </Form.Item>
            ) : (
              <Alert message="暂无可用数据集" description="请先在数字资产模块中上传数据集，然后再创建评测任务。"
                type="warning" showIcon style={{ marginBottom: 16 }} />
            )}
          </>
        ) : (
          <Form.Item name="datasetFile" label="上传数据集">
            <Dragger accept=".csv,.xlsx,.zip,.tar.gz" maxCount={1}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p>点击或拖拽上传数据集</p>
              <p className="ant-upload-hint">支持 CSV, Excel, ZIP, TAR.GZ</p>
            </Dragger>
          </Form.Item>
        )}
      </Form.Item>

      <Divider orientation="left">硬件资源</Divider>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="gpuType" label="GPU/芯片型号">
            <Select placeholder="选择芯片" allowClear
              options={backendResources.length > 0 ? backendResources.map(r => ({ value: String(r.id), label: r.name + (r.model ? " (" + r.model + ")" : "") })) : GPU_OPTIONS} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="gpuCount" label="GPU数量" initialValue={1}>
            <InputNumber min={1} max={128} style={{ width: "100%" }} />
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
            <InputNumber min={1} max={1024} style={{ width: "100%" }} />
          </Form.Item>
        </Col>
      </Row>

      <Divider orientation="left"><CloudServerOutlined /> 目标计算节点</Divider>
      <Form.Item name="targetNodeId" label="选择计算节点" extra="不选择则自动分配在线节点">
        <Select placeholder="自动分配（推荐）" allowClear style={{ width: "100%" }}>
          {computeNodes.map(node => (
            <Select.Option key={node.id} value={node.id} disabled={node.status !== "ONLINE"}>
              <Space>
                <Badge status={node.status === "ONLINE" ? "success" : "default"} />
                <span>{node.name}</span>
                <Tag color={node.tags && node.tags.includes("GPU") ? "blue" : "green"} style={{ marginLeft: 4 }}>
                  {node.tags && node.tags.includes("GPU") ? "GPU" : "CPU"}
                </Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {node.status === "ONLINE" ? "在线" : "离线"}{node.ipAddress ? ` (${node.ipAddress})` : ""}
                </Text>
              </Space>
            </Select.Option>
          ))}
        </Select>
      </Form.Item>
      {onlineNodes.length === 0 && (
        <Alert message="当前无在线计算节点，任务创建后将排队等待" type="warning" showIcon style={{ marginBottom: 16 }} />
      )}

      <Divider orientation="left">评测指标</Divider>
      <Form.Item name="metrics" label="选择评测指标">
        <Select mode="tags" placeholder="选择或输入自定义指标" tokenSeparators={[","]}
          options={[{ value: "延迟(ms)" }, { value: "吞吐量(QPS)" }, { value: "GPU利用率(%)" }, { value: "内存占用(GB)" }, { value: "功耗(W)" }, { value: "Top-1准确率" }, { value: "F1值" }, { value: "精度损失(%)" }]} />
      </Form.Item>
      <Divider orientation="left">执行配置</Divider>
      <Row gutter={16}>
        <Col span={8}><Form.Item name="timeout" label="超时时间(分钟)" initialValue={60}><InputNumber min={5} max={1440} style={{ width: "100%" }} /></Form.Item></Col>
        <Col span={8}><Form.Item name="retryCount" label="自动重试次数" initialValue={0}><InputNumber min={0} max={5} style={{ width: "100%" }} /></Form.Item></Col>
        <Col span={8}><Form.Item name="retryInterval" label="重试间隔(分钟)" initialValue={10}><InputNumber min={1} max={60} style={{ width: "100%" }} /></Form.Item></Col>
      </Row>
      <Form.Item name="enableAlert" label="异常告警" valuePropName="checked" initialValue={true}>
        <Switch checkedChildren="开启" unCheckedChildren="关闭" />
      </Form.Item>
      <Form.Item name="alertEmail" label="告警邮箱">
        <Input placeholder="接收告警通知的邮箱地址" />
      </Form.Item>
    </div>
  );
}
