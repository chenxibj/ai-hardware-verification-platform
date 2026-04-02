/**
 * @file NodeSelectStep.js
 * @description 创建任务 Step 2（模板模式）— 选择计算节点
 * @param {Object} props
 * @param {Array}    props.nodes - 在线节点列表
 * @param {number}   props.selectedNodeId - 已选节点 ID
 * @param {Function} props.setSelectedNodeId - 设置已选节点
 */
import React from "react";
import {
  Row, Col, Card, Space, Radio, Badge, Tag, Alert, Divider, Typography,
} from "antd";
import { CloudServerOutlined } from "@ant-design/icons";

const { Text } = Typography;

export default function NodeSelectStep({ nodes, selectedNodeId, setSelectedNodeId }) {
  return (
    <div style={{ padding: "20px 0", maxWidth: 700, margin: "0 auto" }}>
      <Divider><CloudServerOutlined /> 选择计算节点</Divider>
      {nodes.length === 0 && (
        <Alert message="当前无在线计算节点" description="任务创建后将排队等待节点上线"
          type="warning" showIcon style={{ marginBottom: 16 }} />
      )}
      {nodes.length > 0 && (
        <Radio.Group value={selectedNodeId} onChange={e => setSelectedNodeId(e.target.value)} style={{ width: "100%" }}>
          <Space direction="vertical" style={{ width: "100%" }}>
            {nodes.map(node => (
              <Radio key={node.id} value={node.id} style={{ width: "100%" }}>
                <Card size="small" hoverable
                  style={{ display: "inline-block", width: "calc(100% - 24px)", border: selectedNodeId === node.id ? "2px solid #1890ff" : "1px solid #f0f0f0", marginLeft: 8 }}>
                  <Row justify="space-between" align="middle">
                    <Col>
                      <Space>
                        <Badge status="success" />
                        <Text strong>{node.name}</Text>
                        <Tag color="green">在线</Tag>
                        {node.ipAddress && <Text type="secondary" style={{ fontSize: 12 }}>({node.ipAddress})</Text>}
                      </Space>
                    </Col>
                    <Col>
                      {node.hardwareInfo && (
                        <Space size={16}>
                          <Text type="secondary" style={{ fontSize: 12 }}>CPU: {node.hardwareInfo.cpu_cores_logical}核</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>内存: {node.hardwareInfo.memory_total_gb?.toFixed(1)}GB</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>磁盘余: {node.hardwareInfo.disk_free_gb?.toFixed(1)}GB</Text>
                        </Space>
                      )}
                    </Col>
                  </Row>
                  {node.latestMetrics && (
                    <div style={{ marginTop: 8 }}>
                      <Space size={16}>
                        <Text type="secondary" style={{ fontSize: 11 }}>CPU: {node.latestMetrics.cpuPercent}%</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>内存: {node.latestMetrics.memoryUsedPercent}%</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>磁盘: {node.latestMetrics.diskUsedPercent}%</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>负载: {node.latestMetrics.load1m}</Text>
                      </Space>
                    </div>
                  )}
                </Card>
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      )}
      {nodes.length === 1 && <Alert message="仅一个在线节点，已自动选中" type="info" showIcon style={{ marginTop: 12 }} />}
    </div>
  );
}
