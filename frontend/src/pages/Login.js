import React, { useState } from "react";
import { Card, Form, Input, Button, message, Typography, Tabs } from "antd";
import { UserOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";
import useAuthStore from "../stores/useAuthStore";

const { Title } = Typography;

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("login");
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const handleLogin = async (values) => {
    setLoading(true);
    try {
      const result = await login(values.email, values.password);
      if (result.success) {
        message.success("登录成功");
      } else {
        message.error(result.message || "登录失败");
      }
    } catch (err) {
      message.error(err.response?.data?.message || "登录失败");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values) => {
    setLoading(true);
    try {
      const result = await register(values.username, values.email, values.password);
      if (result.success) {
        message.success("注册成功");
      } else {
        message.error(result.message || "注册失败");
      }
    } catch (err) {
      message.error(err.response?.data?.message || "注册失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"100vh",background:"linear-gradient(135deg, #667eea 0%, #764ba2 100%)"}}>
      <Card style={{width:420,boxShadow:"0 8px 24px rgba(0,0,0,0.15)",borderRadius:12}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <Title level={3} style={{margin:0}}>人工智能软硬件验证平台</Title>
          <p style={{color:"#888",marginTop:8}}>AI Hardware Verification Platform</p>
        </div>
        <Tabs activeKey={tab} onChange={setTab} centered items={[
          { key:"login", label:"登录", children: (
            <Form onFinish={handleLogin} size="large">
              <Form.Item name="email" rules={[{required:true,message:"请输入邮箱"},{type:"email",message:"邮箱格式不正确"}]}>
                <Input prefix={<MailOutlined/>} placeholder="邮箱"/>
              </Form.Item>
              <Form.Item name="password" rules={[{required:true,message:"请输入密码"}]}>
                <Input.Password prefix={<LockOutlined/>} placeholder="密码"/>
              </Form.Item>
              <Form.Item><Button type="primary" htmlType="submit" loading={loading} block>登 录</Button></Form.Item>
            </Form>
          )},
          { key:"register", label:"注册", children: (
            <Form onFinish={handleRegister} size="large">
              <Form.Item name="username" rules={[{required:true,message:"请输入用户名"},{min:2,message:"至少2个字符"}]}>
                <Input prefix={<UserOutlined/>} placeholder="用户名"/>
              </Form.Item>
              <Form.Item name="email" rules={[{required:true,message:"请输入邮箱"},{type:"email",message:"邮箱格式不正确"}]}>
                <Input prefix={<MailOutlined/>} placeholder="邮箱"/>
              </Form.Item>
              <Form.Item name="password" rules={[{required:true,message:"请输入密码"},{min:6,message:"密码至少6位"}]}>
                <Input.Password prefix={<LockOutlined/>} placeholder="密码"/>
              </Form.Item>
              <Form.Item><Button type="primary" htmlType="submit" loading={loading} block>注 册</Button></Form.Item>
            </Form>
          )}
        ]}/>
        <div style={{textAlign:"center",color:"#999",fontSize:12,marginTop:8}}>测试账号：test@ahvp.com / test123</div>
      </Card>
    </div>
  );
}
