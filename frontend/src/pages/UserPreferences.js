import React, { useState, useEffect } from "react";
import { Card, Form, Radio, Checkbox, Button, message, Divider } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import api from "../utils/api";
export default function UserPreferences() {
  const [prefs, setPrefs] = useState({ theme: "light", language: "zh-CN", emailNotify: true, smsNotify: false, browserNotify: true });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    api.get("/api/v1/users/me/preferences").then(r => { if (r.data?.data) setPrefs(r.data.data); }).catch(() => {});
  }, []);
  const handleSave = async () => {
    setLoading(true);
    try { await api.put("/api/v1/users/me/preferences", prefs); message.success("偏好已保存"); } catch(e) { message.error("保存失败"); } finally { setLoading(false); }
  };
  const upd = (k, v) => setPrefs(p => ({...p, [k]: v}));
  return (
    <Card title={<span><SettingOutlined /> 偏好设置</span>}>
      <Form layout="vertical" style={{ maxWidth: 500 }}>
        <Form.Item label="主题"><Radio.Group value={prefs.theme} onChange={e => upd("theme", e.target.value)}><Radio.Button value="light">浅色</Radio.Button><Radio.Button value="dark">深色</Radio.Button></Radio.Group></Form.Item>
        <Form.Item label="语言"><Radio.Group value={prefs.language} onChange={e => upd("language", e.target.value)}><Radio.Button value="zh-CN">中文</Radio.Button><Radio.Button value="en-US">English</Radio.Button></Radio.Group></Form.Item>
        <Divider>通知设置</Divider>
        <Form.Item><Checkbox checked={prefs.emailNotify} onChange={e => upd("emailNotify", e.target.checked)}>邮件通知</Checkbox></Form.Item>
        <Form.Item><Checkbox checked={prefs.smsNotify} onChange={e => upd("smsNotify", e.target.checked)}>短信通知</Checkbox></Form.Item>
        <Form.Item><Checkbox checked={prefs.browserNotify} onChange={e => upd("browserNotify", e.target.checked)}>浏览器通知</Checkbox></Form.Item>
        <Button type="primary" loading={loading} onClick={handleSave}>保存偏好</Button>
      </Form>
    </Card>
  );
}
