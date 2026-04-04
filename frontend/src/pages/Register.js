import React, { useState, useEffect, useCallback } from "react";
import { Card, Form, Input, Button, message, Typography, Select, Progress, Row, Col } from "antd";
import { UserOutlined, LockOutlined, MailOutlined, BankOutlined, PhoneOutlined } from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text, Link } = Typography;
const { Option } = Select;

/** Password strength calculator */
function calcPasswordStrength(pwd) {
  if (!pwd) return { score: 0, label: "", color: "#d9d9d9" };
  let score = 0;
  if (pwd.length >= 8) score += 1;
  if (pwd.length >= 12) score += 1;
  if (/[A-Z]/.test(pwd)) score += 1;
  if (/[a-z]/.test(pwd)) score += 1;
  if (/[0-9]/.test(pwd)) score += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

  if (score <= 2) return { score: 25, label: "弱", color: "#ff4d4f" };
  if (score <= 3) return { score: 50, label: "中", color: "#faad14" };
  if (score <= 4) return { score: 75, label: "强", color: "#52c41a" };
  return { score: 100, label: "极强", color: "#1677ff" };
}

export default function Register({ onSwitchToLogin }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [pwdStrength, setPwdStrength] = useState({ score: 0, label: "", color: "#d9d9d9" });

  const handlePasswordChange = useCallback((e) => {
    setPwdStrength(calcPasswordStrength(e.target.value));
  }, []);

  const handleRegister = async (values) => {
    if (values.password !== values.confirmPassword) {
      message.error("两次密码输入不一致");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/register", {
        username: values.username,
        email: values.email,
        password: values.password,
        organization: values.organization,
        phone: values.phone || undefined,
        role: values.role || "ENGINEER",
      });
      if (res.data.code === 0) {
        message.success("注册成功！请登录");
        if (onSwitchToLogin) onSwitchToLogin();
      } else {
        message.error(res.data.message || "注册失败");
      }
    } catch (err) {
      const msg = err.response?.data?.message || "注册失败，请稍后重试";
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}>
      <Card style={{ width: 480, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", borderRadius: 12 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Title level={3} style={{ margin: 0 }}>注册账号</Title>
          <p style={{ color: "#888", marginTop: 8 }}>AI Hardware Verification Platform</p>
        </div>
        <Form form={form} onFinish={handleRegister} size="large" layout="vertical">
          <Form.Item
            name="username"
            rules={[
              { required: true, message: "请输入用户名" },
              { min: 4, message: "用户名至少4个字符" },
              { max: 30, message: "用户名最多30个字符" },
              { pattern: /^[a-zA-Z0-9_]+$/, message: "仅支持字母、数字、下划线" },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名（4-30字符，字母/数字/下划线）" />
          </Form.Item>

          <Form.Item
            name="email"
            rules={[
              { required: true, message: "请输入邮箱" },
              { type: "email", message: "邮箱格式不正确" },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="邮箱" />
          </Form.Item>

          <Form.Item
            name="organization"
            rules={[{ required: true, message: "请输入组织/单位" }]}
          >
            <Input prefix={<BankOutlined />} placeholder="组织/单位（必填）" />
          </Form.Item>

          <Form.Item name="phone">
            <Input prefix={<PhoneOutlined />} placeholder="手机号（选填）" />
          </Form.Item>

          <Form.Item
            name="role"
            initialValue="ENGINEER"
          >
            <Select placeholder="选择角色">
              <Option value="ENGINEER">评测工程师</Option>
              <Option value="PRODUCT_MGR">产品经理</Option>
              <Option value="VIEWER">只读用户</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: "请输入密码" },
              { min: 8, message: "密码至少8位" },
              { max: 32, message: "密码最多32位" },
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve();
                  if (!/[A-Z]/.test(value)) return Promise.reject("需包含大写字母");
                  if (!/[a-z]/.test(value)) return Promise.reject("需包含小写字母");
                  if (!/[0-9]/.test(value)) return Promise.reject("需包含数字");
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码（8-32字符，含大写+小写+数字）"
              onChange={handlePasswordChange}
            />
          </Form.Item>

          {form.getFieldValue("password") || pwdStrength.score > 0 ? (
            <div style={{ marginTop: -16, marginBottom: 16 }}>
              <Row align="middle" gutter={8}>
                <Col flex="auto">
                  <Progress
                    percent={pwdStrength.score}
                    showInfo={false}
                    strokeColor={pwdStrength.color}
                    size="small"
                  />
                </Col>
                <Col>
                  <Text style={{ color: pwdStrength.color, fontSize: 12 }}>{pwdStrength.label}</Text>
                </Col>
              </Row>
            </div>
          ) : null}

          <Form.Item
            name="confirmPassword"
            dependencies={["password"]}
            rules={[
              { required: true, message: "请确认密码" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) return Promise.resolve();
                  return Promise.reject("两次密码输入不一致");
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              注 册
            </Button>
          </Form.Item>

          <div style={{ textAlign: "center" }}>
            <Text type="secondary">已有账号？</Text>{" "}
            <Link onClick={onSwitchToLogin}>立即登录</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
}
