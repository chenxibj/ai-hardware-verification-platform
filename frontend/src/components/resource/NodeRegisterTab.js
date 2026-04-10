/**
 * @file NodeRegisterTab.js
 * @description 节点注册 Tab — 直接注册独立节点（表单+Agent部署脚本）
 */
import React, { useState } from "react";
import {
  Form, Input, Button, Row, Col, Card, Alert, Space, Typography, message,
} from "antd";
import { CopyOutlined, RocketOutlined } from "@ant-design/icons";
import { nodeApi } from "../../utils/api";

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function NodeRegisterTab() {
  const [form] = Form.useForm();
  const [singleScript, setSingleScript] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);

  const handleGenerateScript = async () => {
    try {
      const values = await form.validateFields();
      const script = [
        "#!/bin/bash",
        "# AHVP Agent 部署脚本",
        `# 节点: ${values.nodeName} (${values.nodeIp}:${values.nodePort || 8090})`,
        "",
        "cd /opt/ahvp-agent",
        "cat > config.yaml << CONF_EOF",
        "platform:",
        "  url: http://39.97.251.94:8080/api",
        "  token: ahvp-agent-secret-2026",
        "node:",
        `  name: \"${values.nodeName}\"`,
        `  description: \"手动纳管节点 ${values.nodeIp}\"`,
        "  tags: cpu,manual",
        "agent:",
        `  port: ${values.nodePort || 8090}`,
        "  host: 0.0.0.0",
        "heartbeat:",
        "  interval: 30",
        "CONF_EOF",
        "",
        "python3 main.py &",
        "echo Agent 已启动",
      ].join("\n");
      setSingleScript(script);
      message.success("部署脚本已生成");
    } catch {
      /* validation error */
    }
  };

  const handleRegister = async () => {
    try {
      const values = await form.validateFields();
      setRegistering(true);
      await nodeApi.register({
        name: values.nodeName,
        ip: values.nodeIp,
        port: values.nodePort || 8090,
        tags: "cpu,manual",
        description: "手动纳管节点 " + values.nodeIp,
      });
      message.success("节点注册成功");
      setRegistered(true);
      form.resetFields();
      setSingleScript("");
    } catch (err) {
      message.error("注册失败: " + (err.response?.data?.message || err.message || "未知错误"));
    } finally {
      setRegistering(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text).then(
      () => message.success("已复制到剪贴板"),
      () => message.error("复制失败"),
    );
  };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <Title level={5}>注册独立节点</Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
        输入节点信息，平台将生成 Agent 部署脚本。在目标节点执行脚本后，Agent 会自动连接到平台。
      </Text>

      {registered && (
        <Alert
          message="节点注册成功"
          description="节点已注册到平台，请在目标节点上执行部署脚本以启动 Agent。"
          type="success"
          showIcon
          closable
          onClose={() => setRegistered(false)}
          style={{ marginBottom: 16 }}
        />
      )}

      <Form form={form} layout="vertical">
        <Form.Item
          name="nodeName"
          label="节点名称"
          rules={[{ required: true, message: "请输入节点名称" }]}
        >
          <Input placeholder="如: prod-node-01" />
        </Form.Item>
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item
              name="nodeIp"
              label="IP 地址"
              rules={[{ required: true, message: "请输入 IP 地址" }]}
            >
              <Input placeholder="如: 192.168.1.100" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="nodePort" label="Agent 端口" initialValue={8090}>
              <Input placeholder="8090" type="number" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="sshCredential" label="SSH 凭据（可选）">
          <Input.Password placeholder="SSH 密钥或密码，用于远程部署 Agent" />
        </Form.Item>
        <Space>
          <Button type="primary" onClick={handleGenerateScript}>
            生成部署脚本
          </Button>
          <Button
            type="primary"
            icon={<RocketOutlined />}
            onClick={handleRegister}
            loading={registering}
            style={{ background: "#722ed1", borderColor: "#722ed1" }}
          >
            直接注册到平台
          </Button>
        </Space>
      </Form>

      {singleScript && (
        <Card
          size="small"
          title="部署脚本"
          style={{ marginTop: 16 }}
          extra={
            <Button
              type="link"
              icon={<CopyOutlined />}
              onClick={() => handleCopy(singleScript)}
            >
              复制
            </Button>
          }
        >
          <TextArea
            value={singleScript}
            readOnly
            rows={12}
            style={{ fontFamily: "monospace", fontSize: 12, background: "#f5f5f5" }}
          />
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message="将上述脚本复制到目标节点执行后，Agent 会自动注册到平台"
          />
        </Card>
      )}
    </div>
  );
}
