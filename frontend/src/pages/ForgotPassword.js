/**
 * @file ForgotPassword.js
 * @description 忘记密码页面 — 提示联系管理员重置 (#290)
 */
import React, { useState } from "react";
import { Card, Form, Input, Button, Typography, Result, Space } from "antd";
import { MailOutlined, ArrowLeftOutlined, SafetyOutlined } from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;

export default function ForgotPassword({ onSwitchToLogin }) {
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");

  const handleSubmit = (values) => {
    setEmail(values.email);
    setSubmitted(true);
  };

  return (
    <div style={{
      display: "flex", justifyContent: "center", alignItems: "center",
      minHeight: "100vh",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    }}>
      <Card style={{ width: 420, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", borderRadius: 12 }}>
        {!submitted ? (
          <>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <SafetyOutlined style={{ fontSize: 40, color: "#667eea", marginBottom: 12 }} />
              <Title level={4} style={{ margin: 0 }}>找回密码</Title>
              <Paragraph type="secondary" style={{ marginTop: 8 }}>
                输入您的注册邮箱，我们将指引您完成密码重置
              </Paragraph>
            </div>
            <Form onFinish={handleSubmit} size="large">
              <Form.Item
                name="email"
                rules={[
                  { required: true, message: "请输入邮箱" },
                  { type: "email", message: "邮箱格式不正确" },
                ]}
              >
                <Input prefix={<MailOutlined />} placeholder="注册邮箱" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" block>
                  提交
                </Button>
              </Form.Item>
            </Form>
            <div style={{ textAlign: "center" }}>
              <Button type="link" icon={<ArrowLeftOutlined />} onClick={onSwitchToLogin}>
                返回登录
              </Button>
            </div>
          </>
        ) : (
          <Result
            status="info"
            title="请联系管理员重置密码"
            subTitle={
              <Space direction="vertical" size={4}>
                <Text>您的邮箱: <Text strong>{email}</Text></Text>
                <Text type="secondary">
                  当前系统暂不支持自助密码重置，请联系系统管理员处理。
                </Text>
              </Space>
            }
            extra={
              <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onSwitchToLogin}>
                返回登录
              </Button>
            }
          />
        )}
      </Card>
    </div>
  );
}
