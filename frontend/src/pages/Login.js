/**
 * @file Login.js
 * @description 登录页 — 含产品简介 + 登录表单 + 注册/忘记密码入口
 * @fix #290 忘记密码链接, #291 登录页用户引导
 */
import React, { useState, useEffect, useRef } from "react";
import { Card, Form, Input, Button, message, Typography, Alert, Row, Col, Space } from "antd";
import {
  LockOutlined, MailOutlined, ExperimentOutlined,
  RocketOutlined, SafetyOutlined, BarChartOutlined,
} from "@ant-design/icons";
import useAuthStore from "../stores/useAuthStore";
import Register from "./Register";
import ForgotPassword from "./ForgotPassword";

const { Title, Text, Link, Paragraph } = Typography;

/* #291: Feature highlight cards */
const FEATURES = [
  { icon: <ExperimentOutlined style={{ fontSize: 28, color: "#667eea" }} />, title: "多层级评测", desc: "支持芯片级、算子级、模型级全方位验证" },
  { icon: <RocketOutlined style={{ fontSize: 28, color: "#764ba2" }} />, title: "自动化执行", desc: "一键创建评测任务，自动调度计算节点" },
  { icon: <SafetyOutlined style={{ fontSize: 28, color: "#52c41a" }} />, title: "精度与性能", desc: "FP32/FP16/INT8 多精度对比分析" },
  { icon: <BarChartOutlined style={{ fontSize: 28, color: "#fa8c16" }} />, title: "报告与榜单", desc: "自动生成评测报告，社区公开排行榜" },
];

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState("login"); // login | register | forgot
  const [lockInfo, setLockInfo] = useState(null);
  const [failedInfo, setFailedInfo] = useState(null);
  const login = useAuthStore((s) => s.login);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startCountdown = (minutes) => {
    if (timerRef.current) clearInterval(timerRef.current);
    let remaining = minutes * 60;
    setLockInfo({ message: "账户已锁定", countdown: remaining });
    timerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        setLockInfo(null);
      } else {
        setLockInfo({ message: "账户已锁定", countdown: remaining });
      }
    }, 1000);
  };

  const formatCountdown = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分${s.toString().padStart(2, "0")}秒`;
  };

  const handleLogin = async (values) => {
    setLoading(true);
    setFailedInfo(null);
    try {
      const result = await login(values.email, values.password);
      if (result.success) {
        message.success("登录成功");
        setLockInfo(null);
        setFailedInfo(null);
      } else {
        handleLoginError(result.message || "登录失败");
      }
    } catch (err) {
      handleLoginError(err.response?.data?.message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  const handleLoginError = (msg) => {
    if (msg.includes("锁定")) {
      const minuteMatch = msg.match(/(\d+)分钟/);
      startCountdown(minuteMatch ? parseInt(minuteMatch[1]) : 60);
    } else if (msg.includes("尝试")) {
      setFailedInfo(msg);
    } else {
      message.error(msg);
    }
  };

  if (page === "register") {
    return <Register onSwitchToLogin={() => setPage("login")} />;
  }
  if (page === "forgot") {
    return <ForgotPassword onSwitchToLogin={() => setPage("login")} />;
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px 16px",
    }}>
      <Row gutter={48} align="middle" style={{ maxWidth: 960, width: "100%" }}>
        {/* #291: Left — product intro */}
        <Col xs={0} md={12}>
          <div style={{ color: "#fff" }}>
            <Title level={2} style={{ color: "#fff", marginBottom: 8 }}>
              🔬 AI 软硬件验证平台
            </Title>
            <Paragraph style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, marginBottom: 32 }}>
              面向 AI 芯片与加速卡的全流程评测验证平台，覆盖算子精度、模型推理性能、
              兼容性稳定性等多维度测试，助力芯片选型与质量把控。
            </Paragraph>
            <Row gutter={[16, 16]}>
              {FEATURES.map((f, i) => (
                <Col span={12} key={i}>
                  <Card size="small" style={{
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 8,
                  }}>
                    <Space direction="vertical" size={4}>
                      {f.icon}
                      <Text strong style={{ color: "#fff" }}>{f.title}</Text>
                      <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>
                        {f.desc}
                      </Text>
                    </Space>
                  </Card>
                </Col>
              ))}
            </Row>
          </div>
        </Col>

        {/* Right — login form */}
        <Col xs={24} md={12}>
          <Card style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.15)", borderRadius: 12 }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <Title level={3} style={{ margin: 0 }}>欢迎登录</Title>
              <Text type="secondary">AI Hardware Verification Platform</Text>
            </div>

            {lockInfo && (
              <Alert type="error" showIcon
                message={`${lockInfo.message}，剩余 ${formatCountdown(lockInfo.countdown)}`}
                style={{ marginBottom: 16 }} />
            )}
            {failedInfo && !lockInfo && (
              <Alert type="warning" showIcon message={failedInfo} style={{ marginBottom: 16 }} />
            )}

            <Form onFinish={handleLogin} size="large">
              <Form.Item name="email" rules={[
                { required: true, message: "请输入邮箱" },
                { type: "email", message: "邮箱格式不正确" },
              ]}>
                <Input prefix={<MailOutlined />} placeholder="邮箱" />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
                <Input.Password prefix={<LockOutlined />} placeholder="密码" />
              </Form.Item>
              <Form.Item style={{ marginBottom: 12 }}>
                <Button type="primary" htmlType="submit" loading={loading} block disabled={!!lockInfo}>
                  登 录
                </Button>
              </Form.Item>
            </Form>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>
                <Text type="secondary">没有账号？</Text>{" "}
                <Link onClick={() => setPage("register")}>立即注册</Link>
              </span>
              {/* #290 */}
              <Link onClick={() => setPage("forgot")}>忘记密码？</Link>
            </div>

            <div style={{ textAlign: "center", color: "#999", fontSize: 12, marginTop: 16 }}>
              测试账号：test@ahvp.com / test123
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
