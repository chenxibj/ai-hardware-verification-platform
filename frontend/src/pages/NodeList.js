/**
 * @file NodeList.js
 * @description 节点管理 — Tabs 布局（直接注册节点 + K8s 集群节点）
 * @feat 资源管理模块重设计, #167, #247, #249
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card, Table, Tag, Badge, Button, Space, Input, Select, Modal, Form, Row, Col,
  Typography, Tooltip, message, Popconfirm, Progress, Tabs,
} from "antd";
import {
  PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined, EyeOutlined,
  SearchOutlined, ClusterOutlined, BugOutlined,
  ToolOutlined, TagsOutlined, TagOutlined, CloudServerOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import K8sNodesTab from "../components/resource/K8sNodesTab";
import { DiagnoseModal, RepairModal } from "../components/resource/NodeDiagModals";
import NodeDetailDrawer from "../components/resource/NodeDetailDrawer";
import {
  NODE_TYPE_COLORS, NODE_STATUS_MAP,
  parseTags, serializeTags, extractType, getTagColor,
  collectAllTagKeys, extractSource, parseJSON,
} from "../components/resource/nodeHelpers";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

const { Text } = Typography;

export default function NodeList({ onOpenDetail, onOpenOnboard }) {
  const [activeTab, setActiveTab] = useState("direct");
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [tagFilter, setTagFilter] = useState(null);
  const [form] = Form.useForm();
  const [tagInputKey, setTagInputKey] = useState("");
  const [tagInputValue, setTagInputValue] = useState("");
  const [editTags, setEditTags] = useState([]);
  const [pools, setPools] = useState([]);

  const [diagVisible, setDiagVisible] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagResult, setDiagResult] = useState(null);
  const [diagNodeName, setDiagNodeName] = useState("");
  const [repairVisible, setRepairVisible] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairResult, setRepairResult] = useState(null);
  const [repairNodeName, setRepairNodeName] = useState("");
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailNode, setDetailNode] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchNodes = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const res = await api.get("/nodes", { params });
      if (res.data.code === 0) {
        const all = res.data.data || [];
        setNodes(all.filter(n => extractSource(n.tags).type !== "k8s"));
      }
    } catch (err) {
      if (err.response?.status !== 401) message.error("获取节点列表失败");
    }
    setLoading(false);
  }, [statusFilter]);

  const fetchPools = useCallback(async () => {
    try {
      const res = await api.get("/resource-pools");
      if (res.data.code === 0) setPools(res.data.data || []);
    } catch {}
  }, []);

  useEffect(() => { fetchNodes(); fetchPools(); }, [fetchNodes, fetchPools]);

  const allTagKeys = useMemo(() => collectAllTagKeys(nodes), [nodes]);

  const handleRegister = () => { setEditingNode(null); form.resetFields(); setEditTags([]); setModalVisible(true); };

  const handleEdit = (node) => {
    setEditingNode(node); setEditTags(parseTags(node.tags));
    form.setFieldsValue({ name: node.name, ipAddress: node.ipAddress, agentPort: node.agentPort, type: extractType(node.tags), description: node.description, resourcePoolId: node.resourcePoolId || undefined });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try { await api.delete(`/nodes/${id}`); message.success("节点已删除"); fetchNodes(); } catch { message.error("删除失败"); }
  };

  const handleAddTag = () => {
    const key = tagInputKey.trim();
    if (!key) { message.warning("Key 不能为空"); return; }
    if (editTags.length >= 20 || editTags.some(t => t.key === key)) return;
    setEditTags([...editTags, { key, value: tagInputValue.trim() }]);
    setTagInputKey(""); setTagInputValue("");
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      let finalTags = [...editTags];
      if (values.type) {
        finalTags = finalTags.filter(t => t.key.toLowerCase() !== "type" && !["GPU","CPU","NPU","FPGA"].includes(t.key.toUpperCase()));
        finalTags.unshift({ key: "type", value: values.type });
      }
      const payload = { name: values.name, ipAddress: values.ipAddress, agentPort: values.agentPort || 8090, description: values.description, tags: serializeTags(finalTags), resourcePoolId: values.resourcePoolId || null };
      if (editingNode) { await api.put(`/nodes/${editingNode.id}`, payload); message.success("节点已更新"); }
      else {
        const res = await api.post("/nodes", payload);
        if (res.data.code === 0 && res.data.data?.sshKey) {
          Modal.success({ title: "注册成功", content: <Input.TextArea value={res.data.data.sshKey} rows={2} readOnly />, width: 480 });
        } else { message.success("注册成功"); }
      }
      setModalVisible(false); form.resetFields(); setEditTags([]); fetchNodes();
    } catch (err) { if (err.response?.data?.message) message.error(err.response.data.message); }
    setSubmitting(false);
  };

  const handleDiagnose = async (node) => {
    setDiagNodeName(node.name); setDiagResult(null); setDiagVisible(true); setDiagLoading(true);
    try { const res = await api.post(`/nodes/${node.id}/diagnose`); if (res.data.code === 0) setDiagResult(res.data.data); else message.error(res.data.message || "诊断失败"); }
    catch (err) { message.error(err.response?.data?.message || "诊断失败"); }
    setDiagLoading(false);
  };

  const handleRepair = async (node) => {
    setRepairNodeName(node.name); setRepairResult(null); setRepairVisible(true); setRepairLoading(true);
    try { const res = await api.post(`/nodes/${node.id}/repair`); if (res.data.code === 0) { setRepairResult(res.data.data); if (res.data.data?.success) { message.success("修复成功"); fetchNodes(); } } else message.error("修复失败"); }
    catch (err) { message.error(err.response?.data?.message || "修复失败"); }
    setRepairLoading(false);
  };

  const handleRepairFromDiag = (nodeId) => {
    setDiagVisible(false);
    const node = nodes.find(n => n.id === nodeId);
    if (node) handleRepair(node);
  };

  const handleOpenDetail = async (node) => {
    setDetailNode(node); setDetailVisible(true); setDetailLoading(true);
    try { const res = await api.get(`/nodes/${node.id}`); if (res.data.code === 0) setDetailNode(res.data.data); } catch {}
    setDetailLoading(false);
  };

  const getPoolName = (poolId) => { const pool = pools.find(p => p.id === poolId); return pool ? pool.name : null; };

  const filteredNodes = nodes.filter(n => {
    if (searchText && !n.name?.toLowerCase().includes(searchText.toLowerCase()) && !n.ipAddress?.includes(searchText)) return false;
    if (tagFilter) { const tags = parseTags(n.tags); if (!tags.some(t => tagFilter.includes(":") ? `${t.key}:${t.value}` === tagFilter : t.key === tagFilter)) return false; }
    return true;
  });

  const renderTagList = (tagsStr) => {
    const tags = parseTags(tagsStr);
    if (!tags.length) return <Text type="secondary">-</Text>;
    return <Space size={2} wrap>{tags.slice(0, 5).map((t, i) => <Tag key={i} color={getTagColor(t.key)} style={{ fontSize: 11 }}>{t.value ? `${t.key}:${t.value}` : t.key}</Tag>)}{tags.length > 5 && <Tag>+{tags.length - 5}</Tag>}</Space>;
  };

  const columns = [
    { title: "名称", dataIndex: "name", width: 160, render: (text, r) => <Button type="link" style={{ padding: 0 }} onClick={() => handleOpenDetail(r)}><ClusterOutlined style={{ marginRight: 4 }} />{text}</Button> },
    { title: "地址", dataIndex: "ipAddress", width: 150, render: (ip, r) => <Text copyable={{ text: ip }}>{ip}{r.agentPort ? `:${r.agentPort}` : ""}</Text> },
    { title: "类型", width: 80, render: (_, r) => { const t = extractType(r.tags); return t ? <Tag color={NODE_TYPE_COLORS[t]}>{t}</Tag> : "-"; } },
    { title: "状态", dataIndex: "status", width: 100, render: (s, r) => { const info = NODE_STATUS_MAP[s] || { text: s, badge: "default" }; return (s === "OFFLINE" || s === "ERROR") ? <Tooltip title="点击诊断"><span style={{ cursor: "pointer" }} onClick={() => handleDiagnose(r)}><Badge status={info.badge} text={info.text} /></span></Tooltip> : <Badge status={info.badge} text={info.text} />; } },
    { title: "资源池", width: 120, render: (_, r) => { const n = getPoolName(r.resourcePoolId); return n ? <Tag color="cyan">{n}</Tag> : <Text type="secondary">未分配</Text>; } },
    { title: "标签", width: 200, render: (_, r) => renderTagList(r.tags) },
    { title: "CPU", width: 90, render: (_, r) => { const hw = parseJSON(r.hardwareInfo); return hw?.cpuUsage != null ? <Progress percent={Math.round(hw.cpuUsage)} size="small" strokeWidth={4} /> : "-"; } },
    { title: "内存", width: 90, render: (_, r) => { const hw = parseJSON(r.hardwareInfo); return hw?.memoryUsage != null ? <Progress percent={Math.round(hw.memoryUsage)} size="small" strokeWidth={4} /> : "-"; } },
    { title: "心跳", dataIndex: "lastHeartbeat", width: 120, render: (v) => !v ? <Text type="secondary">从未</Text> : <Tooltip title={dayjs(v).format("YYYY-MM-DD HH:mm:ss")}><Text type={dayjs(v).isBefore(dayjs().subtract(5, "minute")) ? "danger" : "secondary"}>{dayjs(v).fromNow()}</Text></Tooltip> },
    { title: "操作", width: 200, render: (_, r) => <Space size={4}>
      <Tooltip title="详情"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleOpenDetail(r)} /></Tooltip>
      <Tooltip title="诊断"><Button type="text" size="small" icon={<BugOutlined />} onClick={() => handleDiagnose(r)} /></Tooltip>
      <Tooltip title="修复"><Button type="text" size="small" icon={<ToolOutlined />} onClick={() => handleRepair(r)} /></Tooltip>
      <Tooltip title="编辑"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)} /></Tooltip>
      <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}><Tooltip title="删除"><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Tooltip></Popconfirm>
    </Space> },
  ];

  const directContent = (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <Input placeholder="搜索名称/IP" prefix={<SearchOutlined />} allowClear style={{ width: 180 }} value={searchText} onChange={e => setSearchText(e.target.value)} />
        <Select placeholder="状态" allowClear style={{ width: 110 }} value={statusFilter} onChange={setStatusFilter} options={Object.entries(NODE_STATUS_MAP).map(([k, v]) => ({ label: v.text, value: k }))} />
        <Select placeholder="标签" allowClear style={{ width: 140 }} value={tagFilter} onChange={setTagFilter} showSearch optionFilterProp="label">
          {allTagKeys.map(k => <Select.Option key={k} value={k} label={k}><TagOutlined style={{ marginRight: 4 }} />{k}</Select.Option>)}
        </Select>
        <Button icon={<ReloadOutlined />} onClick={fetchNodes}>刷新</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleRegister}>注册节点</Button>
      </div>
      <Table columns={columns} dataSource={filteredNodes} rowKey="id" loading={loading} pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 个` }} size="middle" scroll={{ x: 1300 }} />
    </div>
  );

  return (
    <div>
      <Card title={<Space><ClusterOutlined /><span>节点管理</span></Space>}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          { key: "direct", label: <Space><CloudServerOutlined />直接注册节点 <Tag color="blue">{filteredNodes.length}</Tag></Space>, children: directContent },
          { key: "k8s", label: <Space><ClusterOutlined />K8s 集群节点</Space>, children: <K8sNodesTab onDiagnose={handleDiagnose} /> },
        ]} />
      </Card>

      <Modal title={editingNode ? "编辑节点" : "注册节点"} open={modalVisible} onOk={handleSubmit} onCancel={() => { setModalVisible(false); form.resetFields(); setEditTags([]); }} confirmLoading={submitting} width={600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="节点名称" rules={[{ required: true }]}><Input placeholder="gpu-node-01" /></Form.Item>
          <Row gutter={16}><Col span={16}><Form.Item name="ipAddress" label="IP地址" rules={[{ required: true }]}><Input placeholder="192.168.1.100" /></Form.Item></Col><Col span={8}><Form.Item name="agentPort" label="端口"><Input type="number" placeholder="8090" /></Form.Item></Col></Row>
          <Row gutter={16}><Col span={12}><Form.Item name="type" label="类型" rules={[{ required: true }]}><Select placeholder="选择类型" options={[{ label: "CPU", value: "CPU" }, { label: "GPU", value: "GPU" }, { label: "NPU", value: "NPU" }, { label: "FPGA", value: "FPGA" }]} /></Form.Item></Col><Col span={12}><Form.Item name="resourcePoolId" label="资源池"><Select placeholder="可选" allowClear options={pools.map(p => ({ label: p.name, value: p.id }))} /></Form.Item></Col></Row>
          <Form.Item label={<Space><TagsOutlined />标签 <Text type="secondary" style={{ fontSize: 12 }}>({editTags.length}/20)</Text></Space>}>
            <div style={{ border: "1px solid #d9d9d9", borderRadius: 6, padding: 12, background: "#fafafa" }}>
              <div style={{ minHeight: 32, marginBottom: editTags.length ? 8 : 0 }}>{editTags.map((t, i) => <Tag key={i} closable onClose={() => setEditTags(editTags.filter(x => x.key !== t.key))} color={getTagColor(t.key)}>{t.value ? `${t.key}:${t.value}` : t.key}</Tag>)}{!editTags.length && <Text type="secondary" style={{ fontSize: 12 }}>暂无</Text>}</div>
              <Space.Compact style={{ width: "100%" }}><Input placeholder="Key" value={tagInputKey} onChange={e => setTagInputKey(e.target.value)} style={{ width: "35%" }} onPressEnter={handleAddTag} /><Input placeholder="Value" value={tagInputValue} onChange={e => setTagInputValue(e.target.value)} style={{ width: "45%" }} onPressEnter={handleAddTag} /><Button type="primary" icon={<PlusOutlined />} onClick={handleAddTag} style={{ width: "20%" }}>添加</Button></Space.Compact>
            </div>
          </Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} placeholder="描述" /></Form.Item>
        </Form>
      </Modal>

      <DiagnoseModal visible={diagVisible} onCancel={() => setDiagVisible(false)} loading={diagLoading} result={diagResult} nodeName={diagNodeName} onRepair={handleRepairFromDiag} />
      <RepairModal visible={repairVisible} onCancel={() => setRepairVisible(false)} loading={repairLoading} result={repairResult} nodeName={repairNodeName} />
      <NodeDetailDrawer visible={detailVisible} onClose={() => setDetailVisible(false)} node={detailNode} loading={detailLoading}
        onDiagnose={(n) => { setDetailVisible(false); handleDiagnose(n); }}
        onRepair={(n) => { setDetailVisible(false); handleRepair(n); }}
        onEdit={(n) => { setDetailVisible(false); handleEdit(n); }}
      />
    </div>
  );
}
