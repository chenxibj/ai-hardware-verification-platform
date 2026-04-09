/**
 * @file SelfHealing.js
 * @description 自愈策略配置页 — 策略管理+执行历史+手动触发
 * Issue: #257 自愈策略
 * @feat #257
 *
 * 后端已有 API:
 * - POST /api/nodes/{id}/diagnose — 诊断节点
 * - POST /api/nodes/{id}/repair — 修复节点
 * 自愈策略配置存 localStorage，执行历史存 localStorage
 * TODO: 后端实现 /api/self-heal/policies 和 /api/self-heal/history 后迁移
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Row, Col, Switch, Button, Table, Tag, Space, Typography,
  message, Badge, Alert, Tooltip, Tabs, Divider, Modal, Form,
  Input, Select, InputNumber, Empty, Popconfirm, Spin, Timeline,
} from "antd";
import {
  ToolOutlined, SettingOutlined, HistoryOutlined, MedicineBoxOutlined,
  PlayCircleOutlined, PlusOutlined, DeleteOutlined, EditOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  ExclamationCircleOutlined, SyncOutlined, CloudServerOutlined,
  ReloadOutlined, ThunderboltOutlined, SafetyCertificateOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;

/* ============ localStorage Keys ============ */
const STORAGE_KEY_POLICIES = "ahvp_selfheal_policies";
const STORAGE_KEY_HISTORY = "ahvp_selfheal_history";
const STORAGE_KEY_GLOBAL_SWITCH = "ahvp_selfheal_enabled";

/* ============ 默认策略 ============ */
const DEFAULT_POLICIES = [
  {
    id: "auto_restart_offline",
    name: "离线节点自动重启 Agent",
    trigger: "节点状态变为 OFFLINE",
    action: "repair",
    description: "当节点检测到 OFFLINE 状态时，自动尝试重启 Agent 进程",
    cooldownMin: 10,
    maxRetries: 3,
    enabled: true,
  },
  {
    id: "auto_mark_error",
    name: "异常节点自动标记",
    trigger: "节点心跳超时 > 5 分钟",
    action: "mark_error",
    description: "心跳超时超过 5 分钟的节点自动标记为 ERROR 状态",
    cooldownMin: 5,
    maxRetries: 1,
    enabled: true,
  },
  {
    id: "auto_diagnose_error",
    name: "异常节点自动诊断",
    trigger: "节点状态变为 ERROR",
    action: "diagnose",
    description: "节点状态变为 ERROR 时自动运行诊断，获取详细错误信息",
    cooldownMin: 15,
    maxRetries: 2,
    enabled: false,
  },
  {
    id: "auto_repair_failed_heartbeat",
    name: "心跳失败自动修复",
    trigger: "连续 3 次心跳失败",
    action: "repair",
    description: "连续 3 次心跳检测失败时，自动尝试修复节点",
    cooldownMin: 20,
    maxRetries: 2,
    enabled: false,
  },
];

/* ============ 工具函数 ============ */
const loadPolicies = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_POLICIES);
    return stored ? JSON.parse(stored) : DEFAULT_POLICIES;
  } catch { return DEFAULT_POLICIES; }
};

const savePolicies = (policies) => {
  localStorage.setItem(STORAGE_KEY_POLICIES, JSON.stringify(policies));
};

const loadHistory = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_HISTORY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
};

const saveHistory = (history) => {
  localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
};

const loadGlobalSwitch = () => {
  try { return localStorage.getItem(STORAGE_KEY_GLOBAL_SWITCH) !== "false"; }
  catch { return true; }
};

/* ============ 主组件 ============ */
export default function SelfHealing() {
  const [activeTab, setActiveTab] = useState("policies");
  const [policies, setPolicies] = useState(loadPolicies);
  const [history, setHistory] = useState(loadHistory);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [globalEnabled, setGlobalEnabled] = useState(loadGlobalSwitch);
  const [actionLoading, setActionLoading] = useState({});
  const [policyModalVisible, setPolicyModalVisible] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [form] = Form.useForm();

  // 获取节点列表
  const fetchNodes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/nodes");
      if (res.data.code === 0) setNodes(res.data.data || []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchNodes(); }, [fetchNodes]);

  /* ---- 全局开关 ---- */
  const handleGlobalToggle = (checked) => {
    setGlobalEnabled(checked);
    localStorage.setItem(STORAGE_KEY_GLOBAL_SWITCH, String(checked));
    message.success(`自愈功能已${checked ? "启用" : "停用"}`);
  };

  /* ---- 策略操作 ---- */
  const handleTogglePolicy = (policyId, enabled) => {
    const updated = policies.map(p => p.id === policyId ? { ...p, enabled } : p);
    setPolicies(updated);
    savePolicies(updated);
  };

  const handleEditPolicy = (policy) => {
    setEditingPolicy(policy);
    form.setFieldsValue(policy);
    setPolicyModalVisible(true);
  };

  const handleAddPolicy = () => {
    setEditingPolicy(null);
    form.resetFields();
    form.setFieldsValue({ action: "repair", cooldownMin: 10, maxRetries: 3, enabled: true });
    setPolicyModalVisible(true);
  };

  const handleSavePolicy = () => {
    form.validateFields().then(values => {
      let updated;
      if (editingPolicy) {
        updated = policies.map(p => p.id === editingPolicy.id ? { ...p, ...values } : p);
      } else {
        updated = [...policies, { ...values, id: `custom_${Date.now()}` }];
      }
      setPolicies(updated);
      savePolicies(updated);
      setPolicyModalVisible(false);
      message.success(editingPolicy ? "策略已更新" : "策略已添加");
    });
  };

  const handleDeletePolicy = (policyId) => {
    const updated = policies.filter(p => p.id !== policyId);
    setPolicies(updated);
    savePolicies(updated);
    message.success("策略已删除");
  };

  /* ---- 手动操作 ---- */
  const handleDiagnose = async (nodeId, nodeName) => {
    setActionLoading(prev => ({ ...prev, [`diag_${nodeId}`]: true }));
    try {
      const res = await api.post(`/nodes/${nodeId}/diagnose`);
      const entry = {
        id: Date.now(),
        time: new Date().toISOString(),
        nodeId,
        nodeName,
        action: "diagnose",
        success: res.data.code === 0,
        detail: res.data.code === 0
          ? JSON.stringify(res.data.data, null, 2)
          : (res.data.message || "诊断失败"),
      };
      const updated = [entry, ...history].slice(0, 100);
      setHistory(updated);
      saveHistory(updated);
      if (res.data.code === 0) {
        message.success(`节点 ${nodeName} 诊断完成`);
        Modal.info({
          title: `节点 ${nodeName} 诊断结果`,
          width: 600,
          content: <pre style={{ fontSize: 12, maxHeight: 400, overflow: "auto" }}>{JSON.stringify(res.data.data, null, 2)}</pre>,
        });
      } else {
        message.error(`诊断失败: ${res.data.message}`);
      }
    } catch (err) {
      message.error(`诊断请求失败: ${err.message}`);
      const entry = {
        id: Date.now(), time: new Date().toISOString(),
        nodeId, nodeName, action: "diagnose", success: false,
        detail: err.message,
      };
      const updated = [entry, ...history].slice(0, 100);
      setHistory(updated);
      saveHistory(updated);
    }
    setActionLoading(prev => ({ ...prev, [`diag_${nodeId}`]: false }));
  };

  const handleRepair = async (nodeId, nodeName) => {
    setActionLoading(prev => ({ ...prev, [`repair_${nodeId}`]: true }));
    try {
      const res = await api.post(`/nodes/${nodeId}/repair`);
      const data = res.data.data || {};
      const entry = {
        id: Date.now(),
        time: new Date().toISOString(),
        nodeId,
        nodeName,
        action: "repair",
        success: data.success === true,
        detail: (data.actions || []).join("\n") || (res.data.message || "未知结果"),
      };
      const updated = [entry, ...history].slice(0, 100);
      setHistory(updated);
      saveHistory(updated);
      if (data.success) {
        message.success(`节点 ${nodeName} 修复成功`);
      } else {
        message.warning(`节点 ${nodeName} 修复尝试完成，部分操作可能未成功`);
        Modal.warning({
          title: `节点 ${nodeName} 修复结果`,
          width: 600,
          content: (
            <div>
              {(data.actions || []).map((a, i) => (
                <div key={i} style={{ padding: "4px 0", fontSize: 13 }}>
                  {a.includes("失败") ? <CloseCircleOutlined style={{ color: "#ff4d4f", marginRight: 8 }} /> : <CheckCircleOutlined style={{ color: "#52c41a", marginRight: 8 }} />}
                  {a}
                </div>
              ))}
            </div>
          ),
        });
      }
      fetchNodes();
    } catch (err) {
      message.error(`修复请求失败: ${err.message}`);
      const entry = {
        id: Date.now(), time: new Date().toISOString(),
        nodeId, nodeName, action: "repair", success: false, detail: err.message,
      };
      const updated = [entry, ...history].slice(0, 100);
      setHistory(updated);
      saveHistory(updated);
    }
    setActionLoading(prev => ({ ...prev, [`repair_${nodeId}`]: false }));
  };

  /* ---- 策略表格列 ---- */
  const policyColumns = [
    {
      title: "启用", dataIndex: "enabled", width: 70,
      render: (v, r) => (
        <Switch
          checked={v && globalEnabled}
          size="small"
          disabled={!globalEnabled}
          onChange={(checked) => handleTogglePolicy(r.id, checked)}
        />
      ),
    },
    {
      title: "策略名称", dataIndex: "name", width: 200,
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 500 }}>{v}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>{r.description}</Text>
        </div>
      ),
    },
    {
      title: "触发条件", dataIndex: "trigger", width: 200,
      render: v => <Tag color="blue">{v}</Tag>,
    },
    {
      title: "动作", dataIndex: "action", width: 100,
      render: v => {
        const map = {
          repair: { text: "自动修复", color: "green" },
          diagnose: { text: "自动诊断", color: "blue" },
          mark_error: { text: "标记异常", color: "orange" },
          notify: { text: "发送通知", color: "purple" },
        };
        const info = map[v] || { text: v, color: "default" };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: "冷却/重试", width: 120,
      render: (_, r) => (
        <Text style={{ fontSize: 12 }}>{r.cooldownMin}分钟 / 最多{r.maxRetries}次</Text>
      ),
    },
    {
      title: "操作", width: 120,
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditPolicy(r)}>编辑</Button>
          <Popconfirm title="确认删除此策略？" onConfirm={() => handleDeletePolicy(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /* ---- 节点操作表格列 ---- */
  const nodeColumns = [
    {
      title: "节点", dataIndex: "name", width: 160,
      render: (v, r) => (
        <Space>
          <Badge status={
            r.status === "ONLINE" ? "success" :
            r.status === "ERROR" ? "error" :
            r.status === "OFFLINE" ? "default" : "warning"
          } />
          <div>
            <div style={{ fontWeight: 500 }}>{v}</div>
            <Text type="secondary" style={{ fontSize: 11 }}>{r.ipAddress}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: "状态", dataIndex: "status", width: 80,
      render: v => {
        const map = {
          ONLINE: { color: "green", text: "在线" },
          OFFLINE: { color: "default", text: "离线" },
          ERROR: { color: "red", text: "异常" },
          BUSY: { color: "blue", text: "繁忙" },
          MAINTENANCE: { color: "orange", text: "维护" },
        };
        const info = map[v] || { color: "default", text: v };
        return <Tag color={info.color}>{info.text}</Tag>;
      },
    },
    {
      title: "最后心跳", dataIndex: "lastHeartbeat", width: 160,
      render: v => v ? new Date(v).toLocaleString("zh-CN") : "-",
    },
    {
      title: "操作", width: 200,
      render: (_, r) => (
        <Space>
          <Button
            size="small"
            icon={<MedicineBoxOutlined />}
            loading={actionLoading[`diag_${r.id}`]}
            onClick={() => handleDiagnose(r.id, r.name)}
          >
            诊断
          </Button>
          <Popconfirm title={`确认修复节点 ${r.name}？`} onConfirm={() => handleRepair(r.id, r.name)}>
            <Button
              size="small"
              type="primary"
              icon={<ToolOutlined />}
              loading={actionLoading[`repair_${r.id}`]}
              danger={r.status === "ERROR" || r.status === "OFFLINE"}
            >
              修复
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /* ---- 历史记录列 ---- */
  const historyColumns = [
    {
      title: "时间", dataIndex: "time", width: 160,
      render: v => v ? new Date(v).toLocaleString("zh-CN") : "-",
    },
    { title: "节点", dataIndex: "nodeName", width: 120 },
    {
      title: "动作", dataIndex: "action", width: 100,
      render: v => {
        const map = { diagnose: "诊断", repair: "修复", mark_error: "标记异常" };
        return <Tag>{map[v] || v}</Tag>;
      },
    },
    {
      title: "结果", dataIndex: "success", width: 80,
      render: v => v
        ? <Tag color="green" icon={<CheckCircleOutlined />}>成功</Tag>
        : <Tag color="red" icon={<CloseCircleOutlined />}>失败</Tag>,
    },
    {
      title: "详情", dataIndex: "detail", ellipsis: true,
      render: v => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
  ];

  const enabledPolicies = policies.filter(p => p.enabled).length;

  return (
    <Spin spinning={loading}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Space>
          <SafetyCertificateOutlined style={{ fontSize: 20, color: "#1890ff" }} />
          <Title level={4} style={{ margin: 0 }}>自愈策略</Title>
          <Tag color={globalEnabled ? "green" : "default"}>
            {globalEnabled ? "已启用" : "已停用"}
          </Tag>
        </Space>
        <Space>
          <Text style={{ fontSize: 13 }}>自愈总开关</Text>
          <Switch checked={globalEnabled} onChange={handleGlobalToggle} />
          <Button icon={<ReloadOutlined />} onClick={fetchNodes}>刷新节点</Button>
        </Space>
      </div>

      {!globalEnabled && (
        <Alert
          message="自愈功能已停用"
          description="开启自愈总开关后，配置的策略将自动对异常节点执行修复操作。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab={<span><SettingOutlined /> 策略配置</span>} key="policies">
          <Card
            size="small"
            title={`自愈策略（${enabledPolicies}/${policies.length} 启用）`}
            extra={
              <Button type="primary" icon={<PlusOutlined />} size="small" onClick={handleAddPolicy}>
                添加策略
              </Button>
            }
          >
            <Alert
              message="策略说明"
              description="自愈策略将在后端调度服务就绪后自动执行。当前可通过「手动操作」标签页对节点进行诊断和修复。策略配置保存在浏览器本地存储中。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Table
              columns={policyColumns}
              dataSource={policies}
              rowKey="id"
              size="small"
              pagination={false}
            />
          </Card>
        </TabPane>

        <TabPane tab={<span><ThunderboltOutlined /> 手动操作</span>} key="manual">
          <Card size="small" title="节点诊断与修复">
            <Alert
              message="手动操作"
              description="选择节点进行手动诊断或修复。诊断将获取节点详细状态信息，修复将尝试重启 Agent 并恢复服务。"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Table
              columns={nodeColumns}
              dataSource={nodes}
              rowKey="id"
              size="small"
              pagination={nodes.length > 10 ? { pageSize: 10 } : false}
            />
          </Card>
        </TabPane>

        <TabPane tab={<span><HistoryOutlined /> 执行历史</span>} key="history">
          <Card
            size="small"
            title="自愈执行历史"
            extra={
              <Space>
                <Text type="secondary" style={{ fontSize: 12 }}>共 {history.length} 条记录</Text>
                {history.length > 0 && (
                  <Popconfirm title="确认清空历史记录？" onConfirm={() => { setHistory([]); saveHistory([]); }}>
                    <Button size="small" danger icon={<DeleteOutlined />}>清空</Button>
                  </Popconfirm>
                )}
              </Space>
            }
          >
            {history.length === 0 ? (
              <Empty description="暂无执行记录" />
            ) : (
              <Table
                columns={historyColumns}
                dataSource={history}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 15, showTotal: t => `共 ${t} 条` }}
              />
            )}
          </Card>
        </TabPane>
      </Tabs>

      {/* 策略编辑弹窗 */}
      <Modal
        title={editingPolicy ? "编辑自愈策略" : "添加自愈策略"}
        open={policyModalVisible}
        onOk={handleSavePolicy}
        onCancel={() => setPolicyModalVisible(false)}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="策略名称" rules={[{ required: true, message: "请输入策略名称" }]}>
            <Input placeholder="例如：离线节点自动重启" />
          </Form.Item>
          <Form.Item name="trigger" label="触发条件" rules={[{ required: true, message: "请输入触发条件" }]}>
            <Input placeholder="例如：节点状态变为 OFFLINE" />
          </Form.Item>
          <Form.Item name="action" label="执行动作" rules={[{ required: true }]}>
            <Select options={[
              { value: "repair", label: "自动修复（重启 Agent）" },
              { value: "diagnose", label: "自动诊断" },
              { value: "mark_error", label: "标记为异常" },
              { value: "notify", label: "发送通知" },
            ]} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="cooldownMin" label="冷却时间（分钟）">
                <InputNumber min={1} max={60} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="maxRetries" label="最大重试次数">
                <InputNumber min={1} max={10} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="策略描述..." />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Spin>
  );
}
