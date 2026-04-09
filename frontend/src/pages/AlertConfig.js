/**
 * @file AlertConfig.js
 * @description 飞书告警配置页 — 告警规则+Webhook+告警历史
 * Issue: #256 飞书告警（前端配置页）
 * @feat #256
 * 
 * 数据存储策略：
 * - 告警规则和 Webhook 配置存 localStorage（前端纯实现）
 * - 告警历史从后端 /api/alerts 获取（已有接口）
 * - TODO: 后端实现 /api/alerts/config 后迁移到 API 存储
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Row, Col, Form, Input, Switch, InputNumber, Button, Table, Tag,
  Space, Typography, message, Badge, Alert, Tooltip, Tabs, Divider,
  Modal, Popconfirm, Empty, Select,
} from "antd";
import {
  BellOutlined, SettingOutlined, HistoryOutlined, LinkOutlined,
  PlusOutlined, DeleteOutlined, EditOutlined, SaveOutlined,
  CheckCircleOutlined, ExclamationCircleOutlined, WarningOutlined,
  InfoCircleOutlined, SendOutlined, ReloadOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;
const { TextArea } = Input;

/* ============ localStorage 存储 Key ============ */
const STORAGE_KEY_RULES = "ahvp_alert_rules";
const STORAGE_KEY_WEBHOOK = "ahvp_feishu_webhook";

/* ============ 默认告警规则 ============ */
const DEFAULT_RULES = [
  { id: "cpu_high", name: "CPU 使用率过高", metric: "cpu", operator: ">", threshold: 80, unit: "%", level: "WARNING", enabled: true, description: "节点 CPU 使用率超过阈值时触发告警" },
  { id: "memory_high", name: "内存使用率过高", metric: "memory", operator: ">", threshold: 90, unit: "%", level: "CRITICAL", enabled: true, description: "节点内存使用率超过阈值时触发告警" },
  { id: "disk_high", name: "磁盘使用率过高", metric: "disk", operator: ">", threshold: 85, unit: "%", level: "WARNING", enabled: true, description: "节点磁盘使用率超过阈值时触发告警" },
  { id: "node_offline", name: "节点离线", metric: "status", operator: "==", threshold: "OFFLINE", unit: "", level: "CRITICAL", enabled: true, description: "节点状态变为离线时触发告警" },
  { id: "node_error", name: "节点异常", metric: "status", operator: "==", threshold: "ERROR", unit: "", level: "CRITICAL", enabled: true, description: "节点状态变为异常时触发告警" },
  { id: "heartbeat_timeout", name: "心跳超时", metric: "heartbeat", operator: ">", threshold: 5, unit: "分钟", level: "WARNING", enabled: false, description: "节点心跳超时超过指定时间时触发告警" },
];

/* ============ 级别映射 ============ */
const LEVEL_MAP = {
  CRITICAL: { text: "严重", color: "#ff4d4f", icon: <ExclamationCircleOutlined />, tag: "red" },
  WARNING: { text: "警告", color: "#faad14", icon: <WarningOutlined />, tag: "orange" },
  INFO: { text: "信息", color: "#1890ff", icon: <InfoCircleOutlined />, tag: "blue" },
};

const STATUS_MAP = {
  ACTIVE: { text: "活跃", badge: "error" },
  ACKNOWLEDGED: { text: "已确认", badge: "warning" },
  RESOLVED: { text: "已解决", badge: "success" },
};

/* ============ 工具函数 ============ */
const loadRules = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_RULES);
    return stored ? JSON.parse(stored) : DEFAULT_RULES;
  } catch { return DEFAULT_RULES; }
};

const saveRules = (rules) => {
  localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(rules));
};

const loadWebhook = () => {
  try { return localStorage.getItem(STORAGE_KEY_WEBHOOK) || ""; }
  catch { return ""; }
};

const saveWebhook = (url) => {
  localStorage.setItem(STORAGE_KEY_WEBHOOK, url);
};

/* ============ 主组件 ============ */
export default function AlertConfig() {
  const [activeTab, setActiveTab] = useState("rules");
  const [rules, setRules] = useState(loadRules);
  const [webhookUrl, setWebhookUrl] = useState(loadWebhook);
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [ruleModalVisible, setRuleModalVisible] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [form] = Form.useForm();

  // 加载告警历史
  const fetchAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const res = await api.get("/alerts");
      if (res.data.code === 0) setAlerts(res.data.data || []);
    } catch { /* 静默失败 */ }
    setAlertsLoading(false);
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  /* ---- 告警规则操作 ---- */
  const handleToggleRule = (ruleId, enabled) => {
    const updated = rules.map(r => r.id === ruleId ? { ...r, enabled } : r);
    setRules(updated);
    saveRules(updated);
    message.success(`规则已${enabled ? "启用" : "禁用"}`);
  };

  const handleEditRule = (rule) => {
    setEditingRule(rule);
    form.setFieldsValue(rule);
    setRuleModalVisible(true);
  };

  const handleAddRule = () => {
    setEditingRule(null);
    form.resetFields();
    form.setFieldsValue({ level: "WARNING", enabled: true, operator: ">", metric: "cpu", unit: "%" });
    setRuleModalVisible(true);
  };

  const handleSaveRule = () => {
    form.validateFields().then(values => {
      let updated;
      if (editingRule) {
        updated = rules.map(r => r.id === editingRule.id ? { ...r, ...values } : r);
      } else {
        const newRule = { ...values, id: `custom_${Date.now()}` };
        updated = [...rules, newRule];
      }
      setRules(updated);
      saveRules(updated);
      setRuleModalVisible(false);
      message.success(editingRule ? "规则已更新" : "规则已添加");
    });
  };

  const handleDeleteRule = (ruleId) => {
    const updated = rules.filter(r => r.id !== ruleId);
    setRules(updated);
    saveRules(updated);
    message.success("规则已删除");
  };

  /* ---- Webhook 操作 ---- */
  const handleSaveWebhook = () => {
    saveWebhook(webhookUrl);
    message.success("Webhook URL 已保存");
  };

  const handleTestWebhook = async () => {
    if (!webhookUrl) {
      message.warning("请先配置 Webhook URL");
      return;
    }
    setTestingWebhook(true);
    try {
      // TODO: 后端实现 /api/alerts/test-webhook 接口后替换
      // 当前直接尝试发送到飞书 Webhook（可能有跨域限制）
      const testPayload = {
        msg_type: "interactive",
        card: {
          header: {
            title: { tag: "plain_text", content: "🔔 AHVP 告警测试" },
            template: "blue",
          },
          elements: [
            { tag: "div", text: { tag: "plain_text", content: "这是一条测试告警消息，确认飞书 Webhook 配置正确。" } },
            { tag: "div", text: { tag: "plain_text", content: `发送时间: ${new Date().toLocaleString("zh-CN")}` } },
          ],
        },
      };
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayload),
      });
      message.success("测试消息已发送，请检查飞书群");
    } catch (err) {
      message.warning("直接发送可能被跨域限制，请确认 Webhook URL 正确。后端 API 就绪后将通过后端转发。");
    }
    setTestingWebhook(false);
  };

  /* ---- 告警规则列表 ---- */
  const ruleColumns = [
    {
      title: "启用", dataIndex: "enabled", width: 70,
      render: (v, r) => <Switch checked={v} size="small" onChange={(checked) => handleToggleRule(r.id, checked)} />,
    },
    {
      title: "规则名称", dataIndex: "name", width: 160,
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{v}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>{r.description}</Text>
        </div>
      ),
    },
    {
      title: "触发条件", width: 200,
      render: (_, r) => (
        <Tag>
          {r.metric} {r.operator} {r.threshold}{r.unit}
        </Tag>
      ),
    },
    {
      title: "级别", dataIndex: "level", width: 90,
      render: v => {
        const info = LEVEL_MAP[v] || { text: v, tag: "default" };
        return <Tag color={info.tag} icon={info.icon}>{info.text}</Tag>;
      },
    },
    {
      title: "操作", width: 120,
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditRule(r)}>编辑</Button>
          <Popconfirm title="确认删除此规则？" onConfirm={() => handleDeleteRule(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /* ---- 告警历史列表 ---- */
  const alertColumns = [
    {
      title: "级别", dataIndex: "level", width: 90,
      render: v => {
        const info = LEVEL_MAP[v] || { text: v, tag: "default" };
        return <Tag color={info.tag} icon={info.icon}>{info.text}</Tag>;
      },
    },
    { title: "节点", dataIndex: "nodeName", width: 120, render: v => v || "-" },
    { title: "规则", dataIndex: "ruleName", width: 120, render: v => v || "-" },
    { title: "描述", dataIndex: "message", ellipsis: true },
    {
      title: "状态", dataIndex: "status", width: 100,
      render: v => {
        const info = STATUS_MAP[v] || { text: v, badge: "default" };
        return <Badge status={info.badge} text={info.text} />;
      },
    },
    {
      title: "时间", dataIndex: "createdAt", width: 160,
      render: v => v ? new Date(v).toLocaleString("zh-CN") : "-",
    },
  ];

  const enabledCount = rules.filter(r => r.enabled).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Space>
          <BellOutlined style={{ fontSize: 20, color: "#1890ff" }} />
          <Title level={4} style={{ margin: 0 }}>告警配置</Title>
          <Tag color="blue">{enabledCount} 条规则已启用</Tag>
        </Space>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab={<span><SettingOutlined /> 告警规则</span>} key="rules">
          <Card
            size="small"
            title="告警规则列表"
            extra={
              <Button type="primary" icon={<PlusOutlined />} size="small" onClick={handleAddRule}>
                添加规则
              </Button>
            }
          >
            <Alert
              message="告警规则配置"
              description="配置的告警规则将在后端监控服务就绪后自动生效。当前规则保存在浏览器本地存储中。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Table
              columns={ruleColumns}
              dataSource={rules}
              rowKey="id"
              size="small"
              pagination={false}
            />
          </Card>
        </TabPane>

        <TabPane tab={<span><LinkOutlined /> 飞书 Webhook</span>} key="webhook">
          <Card size="small" title="飞书 Webhook 配置">
            <Alert
              message="飞书机器人 Webhook"
              description="在飞书群中添加自定义机器人，获取 Webhook URL 填入下方。告警触发时将通过此 Webhook 发送通知到飞书群。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Form layout="vertical" style={{ maxWidth: 600 }}>
              <Form.Item label="Webhook URL" required>
                <Input
                  placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  prefix={<LinkOutlined />}
                />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveWebhook}>
                    保存配置
                  </Button>
                  <Button
                    icon={<SendOutlined />}
                    onClick={handleTestWebhook}
                    loading={testingWebhook}
                    disabled={!webhookUrl}
                  >
                    发送测试
                  </Button>
                </Space>
              </Form.Item>
            </Form>
            <Divider />
            <Title level={5}>Webhook 消息格式预览</Title>
            <Card size="small" style={{ background: "#f5f5f5" }}>
              <pre style={{ fontSize: 12, margin: 0, whiteSpace: "pre-wrap" }}>
{`{
  "msg_type": "interactive",
  "card": {
    "header": {
      "title": "🔔 AHVP 告警通知",
      "template": "red"
    },
    "elements": [
      { "tag": "div", "text": "节点 dev-node-01 CPU 使用率 85% > 80%" },
      { "tag": "div", "text": "级别: 警告 | 时间: 2026-04-09 10:30:00" }
    ]
  }
}`}
              </pre>
            </Card>
          </Card>
        </TabPane>

        <TabPane tab={<span><HistoryOutlined /> 告警历史</span>} key="history">
          <Card
            size="small"
            title="告警历史记录"
            extra={
              <Button icon={<ReloadOutlined />} size="small" onClick={fetchAlerts}>
                刷新
              </Button>
            }
          >
            {alerts.length === 0 ? (
              <Empty
                description={<span>暂无告警记录<br /><Text type="secondary">系统运行正常，未产生告警</Text></span>}
              />
            ) : (
              <Table
                columns={alertColumns}
                dataSource={alerts}
                rowKey="id"
                loading={alertsLoading}
                size="small"
                pagination={{ pageSize: 15, showTotal: t => `共 ${t} 条记录` }}
              />
            )}
          </Card>
        </TabPane>
      </Tabs>

      {/* 规则编辑弹窗 */}
      <Modal
        title={editingRule ? "编辑告警规则" : "添加告警规则"}
        open={ruleModalVisible}
        onOk={handleSaveRule}
        onCancel={() => setRuleModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="规则名称" rules={[{ required: true, message: "请输入规则名称" }]}>
            <Input placeholder="例如：CPU 使用率过高" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="metric" label="监控指标" rules={[{ required: true }]}>
                <Select options={[
                  { value: "cpu", label: "CPU" },
                  { value: "memory", label: "内存" },
                  { value: "disk", label: "磁盘" },
                  { value: "gpu", label: "GPU" },
                  { value: "status", label: "状态" },
                  { value: "heartbeat", label: "心跳" },
                ]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="operator" label="比较符" rules={[{ required: true }]}>
                <Select options={[
                  { value: ">", label: ">" },
                  { value: ">=", label: ">=" },
                  { value: "<", label: "<" },
                  { value: "<=", label: "<=" },
                  { value: "==", label: "==" },
                ]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="threshold" label="阈值" rules={[{ required: true, message: "请输入阈值" }]}>
                <Input placeholder="80" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="unit" label="单位">
                <Input placeholder="%" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="level" label="告警级别" rules={[{ required: true }]}>
                <Select options={[
                  { value: "CRITICAL", label: "严重" },
                  { value: "WARNING", label: "警告" },
                  { value: "INFO", label: "信息" },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="描述">
            <TextArea rows={2} placeholder="规则描述..." />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
