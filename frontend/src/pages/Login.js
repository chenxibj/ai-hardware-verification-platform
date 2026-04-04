import React, { useState, useEffect, useRef } from "react";
import { Card, Form, Input, Button, message, Typography, Alert } from "antd";
import { UserOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import useAuthStore from "../stores/useAuthStore";
import Register from "./Register";

const { Title, Text, Link } = Typography;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [lockInfo, setLockInfo] = useState(null); // { message, countdown }
  const [failedInfo, setFailedInfo] = useState(null); // "还可尝试X次"
  const login = useAuthStore((s) => s.login);
  const timerRef = useRef(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const startCountdown = (minutes) => {
    if (timerRef.current) clearInterval(timerRef.current);
    let remaining = minutes * 60;
    setLockInfo({ message: `账户已锁定`, countdown: remaining });
    timerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        setLockInfo(null);
      } else {
        setLockInfo({ message: `账户已锁定`, countdown: remaining });
      }
    }, 1000);
  };

  const formatCountdown = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分${s.toString().padStart(2, '0')}秒`;
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
        const msg = result.message || "登录失败";
        // Check for lock message
        if (msg.includes("锁定")) {
          const minuteMatch = msg.match(/(\d+)分钟/);
          if (minuteMatch) {
            startCountdown(parseInt(minuteMatch[1]));
          } else {
            setLockInfo({ message: msg, countdown: 3600 });
            startCountdown(60);
          }
        } else if (msg.includes("尝试")) {
          setFailedInfo(msg);
        } else {
          message.error(msg);
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || "登录失败";
      if (msg.includes("锁定")) {
        const minuteMatch = msg.match(/(\d+)分钟/);
        if (minuteMatch) {
          startCountdown(parseInt(minuteMatch[1]));
        } else {
          startCountdown(60);
        }
      } else if (msg.includes("尝试")) {
        setFailedInfo(msg);
      } else {
        message.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (showRegister) {
    return <Register onSwitchToLogin={() => setShowRegister(false)} />;
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}>
      <Card style={{ width: 420, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", borderRadius: 12 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Title level={3} style={{ margin: 0 }}>人工智能软硬件验证平台</Title>
          <p style={{ color: "#888", marginTop: 8 }}>AI Hardware Verification Platform</p>
        </div>

        {lockInfo && (
          <Alert
            type="error"
            showIcon
            message={`${lockInfo.message}，剩余 ${formatCountdown(lockInfo.countdown)}`}
            style={{ marginBottom: 16 }}
          />
        )}

        {failedInfo && !lockInfo && (
          <Alert
            type="warning"
            showIcon
            message={failedInfo}
            style={{ marginBottom: 16 }}
          />
        )}

        <Form onFinish={handleLogin} size="large">
          <Form.Item name="email" rules={[{ required: true, message: "请输入邮箱" }, { type: "email", message: "邮箱格式不正确" }]}>
            <Input prefix={<MailOutlined />} placeholder="邮箱" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block disabled={!!lockInfo}>
              登 录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: "center", marginTop: 8 }}>
          <Text type="secondary">没有账号？</Text>{" "}
          <Link onClick={() => setShowRegister(true)}>立即注册</Link>
        </div>

        <div style={{ textAlign: "center", color: "#999", fontSize: 12, marginTop: 12 }}>
          测试账号：test@ahvp.com / test123
        </div>
      </Card>
    </div>
  );
}
