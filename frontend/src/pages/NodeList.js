/**
 * @file NodeList.js
 * @description 节点管理 — Tabs 布局（直接注册节点 + K8s 集群节点）
 * @feat 资源管理模块重设计, #167, #247, #249
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card, Table, Tag, Badge, Button, Space, Input, Select, Modal, Form, Row, Col,
  Typography, Tooltip, message, Popconfirm, Progress, Drawer, Descriptions,
  Divider, Spin, Tabs,
} from "antd";
import {
  PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined, EyeOutlined,
  SearchOutlined, ClusterOutlined, MedicineBoxOutlined, BugOutlined,
  CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled,
  ToolOutlined, TagsOutlined, TagOutlined, CloudServerOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import K8sNodesTab from "../components/resource/K8sNodesTab";
import {
  NODE_TYPE_COLORS, NODE_STATUS_MAP, HEALTH_CONFIG,
  parseTags, serializeTags, extractType, getTagColor,
  collectAllTagKeys, extractSource, parseJSON,
} from "../components/resource/nodeHelpers";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

const { Text, Title } = Typography;

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

  /* 诊断/修复状态 */
  const [diagModalVisible, setDiagModalVisible] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagResult, setDiagResult] = useState(null);
  const [diagNodeName, setDiagNodeName] = useState("");
  const [repairModalVisible, setRepairModalVisible] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairResult, setRepairResult] = useState(null);
  const [repairNodeName, setRepairNodeName] = useState("");
  const [detailDrawerVisible, setDetailDrawerVisible] = useState(false);
  const [detailNode, setDetailNode] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchNodes = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const res = await api.get("/nodes", { params });
      if (res.data.code === 0) {
        /* 只保留非 K8s 节点（直接注册节点） */
        const all = res.data.data || [];
        const manual = all.filter(n => {
          const src = extractSource(n.tags);
          return src.type !== "k8s";
        });
        setNodes(manual);
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

  /* ====== 注册/编辑 ====== */
  const handleRegister = () => {
    setEditingNode(null);
    form.resetFields();
    setEditTags([]);
    setTagInputKey(""); setTagInputValue("");
    setModalVisible(true);
  };

  const handleEdit = (node) => {
    setEditingNode(node);
    setEditTags(parseTags(node.tags));
    setTagInputKey(""); setTagInputValue("");
    form.setFieldsValue({
      name: node.name, ipAddress: node.ipAddress,
      agentPort: node.agentPort, type: extractType(node.tags),
      description: node.description, resourcePoolId: node.resourcePoolId || undefined,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id) => {
    try { await api.delete(`/nodes/${id}`); message.success("节点已删除"); fetchNodes(); }
    catch { message.error("删除失败"); }
  };

  const handleAddTag = () => {
    const key = tagInputKey.trim(); const value = tagInputValue.trim();
    if (!key) { message.warning("标签 Key 不能为空"); return; }
    if (editTags.length >= 20) { message.warning("最多 20 个标签"); return; }
    if (editTags.some(t => t.key === key)) { message.warning(`标签 "${key}" 已存在`); return; }
    setEditTags([...editTags, { key, value }]);
    setTagInputKey(""); setTagInputValue("");
  };

  const handleRemoveTag = (key) => setEditTags(editTags.filter(t => t.key !== key));

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      let finalTags = [...editTags];
      if (values.type) {
        finalTags = finalTags.filter(t => t.key.toLowerCase() !== "type" && !["GPU","CPU","NPU","FPGA"].includes(t.key.toUpperCase()));
        finalTags.unshift({ key: "type", value: values.type });
      }
      const payload = {
        name: values.name, ipAddress: values.ipAddress,
        agentPort: values.agentPort || 8090, description: values.description,
        tags: serializeTags(finalTags), resourcePoolId: values.resourcePoolId || null,
      };
      if (editingNode) {
        await api.put(`/nodes/${editingNode.id}`, payload);
        message.success("节点已更新");
      } else {
        const res = await api.post("/nodes", payload);
        if (res.data.code === 0 && res.data.data?.sshKey) {
          Modal.success({
            title: "节点注册成功",
            content: (
              <div>
                <p>节点Token（请妥善保存）：</p>
                <Input.TextArea value={res.data.data.sshKey} rows={2} readOnly />
              </div>
            ), width: 480,
          });
        } else { message.success("节点注册成功"); }
      }
      setModalVisible(false); form.resetFields(); setEditTags([]); fetchNodes();
    } catch (err) {
      if (err.response?.data?.message) message.error(err.response.data.message);
    }
    setSubmitting(false);
  };

  /* ====== 诊断 ====== */
  const handleDiagnose = async (node) => {
    setDiagNodeName(node.name); setDiagResult(null);
    setDiagModalVisible(true); setDiagLoading(true);
    try {
      const res = await api.post(`/nodes/${node.id}/diagnose`);
      if (res.data.code === 0) setDiagResult(res.data.data);
      else message.error(res.data.message || "诊断失败");
    } catch (err) { message.error(err.response?.data?.message || "诊断请求失败"); }
    setDiagLoading(false);
  };

  /* ====== 修复 ====== */
  const handleRepair = async (node) => {
    setRepairNodeName(node.name); setRepairResult(null);
    setRepairModalVisible(true); setRepairLoading(true);
    try {
      const res = await api.post(`/nodes/${node.id}/repair`);
      if (res.data.code === 0) {
        setRepairResult(res.data.data);
        if (res.data.data?.success) { message.success("节点修复成功"); fetchNodes(); }
      } else { message.error(res.data.message || "修复失败"); }
    } catch (err) { message.error(err.response?.data?.message || "修复请求失败"); }
    setRepairLoading(false);
  };

  const handleRepairFromDiag = (nodeId) => {
    setDiagModalVisible(false);
    const node = nodes.find(n => n.id === nodeId);
    if (node) handleRepair(node);
  };

  /* ====== 节点详情 ====== */
  const handleOpenDetail = async (node) => {
    setDetailNode(node); setDetailDrawerVisible(true); setDetailLoading(true);
    try {
      const res = await api.get(`/nodes/${node.id}`);
      if (res.data.code === 0) setDetailNode(res.data.data);
    } catch {}
    setDetailLoading(false);
  };

  const getPoolName = (poolId) => {
    if (!poolId) return null;
    const pool = pools.find(p => p.id === poolId);
    return pool ? pool.name : `Pool #${poolId}`;
  };

  /* 筛选 */
  const filteredNodes = nodes.filter(n => {
    if (searchText && !n.name?.toLowerCase().includes(searchText.toLowerCase())
      && !n.ipAddress?.includes(searchText)) return false;
    if (tagFilter) {
      const tags = parseTags(n.tags);
      const hasTag = tags.some(t => {
        if (tagFilter.includes(":")) { const [fk, fv] = tagFilter.split(":", 2); return t.key === fk && t.value === fv; }
        return t.key === tagFilter;
      });
      if (!hasTag) return false;
    }
    return true;
  });

  /* ====== 渲染标签 ====== */
  const renderTagList = (tagsStr) => {
    const tags = parseTags(tagsStr);
    if (tags.length === 0) return <Text type="secondary">-</Text>;
    return (
      <Space size={2} wrap>
        {tags.slice(0, 5).map((t, i) => (
          <Tag key={i} color={getTagColor(t.key)} style={{ fontSize: 11, margin: "1px 0" }}>
            {t.value ? `${t.key}:${t.value}` : t.key}
          </Tag>
        ))}
        {tags.length > 5 && (
          <Tooltip title={tags.slice(5).map(t => t.value ? `${t.key}:${t.value}` : t.key).join(", ")}>
            <Tag style={{ fontSize: 11 }}>+{tags.length - 5}</Tag>
          </Tooltip>
        )}
      </Space>
    );
  };

  /* ====== 诊断结果渲染 ====== */
  const renderDiagCheck = (label, value) => {
    if (value === true) return <div style={{ marginBottom: 4 }}><CheckCircleFilled style={{ color: "#52c41a", marginRight: 8 }} />{label}: <Text type="success">正常</Text></div>;
    if (value === false) return <div style={{ marginBottom: 4 }}><CloseCircleFilled style={{ color: "#ff4d4f", marginRight: 8 }} />{label}: <Text type="danger">异常</Text></div>;
    return <div style={{ marginBottom: 4 }}><ExclamationCircleFilled style={{ color: "#d9d9d9", marginRight: 8 }} />{label}: <Text type="secondary">{String(value)}</Text></div>;
  };

  const renderDiagResult = () => {
    if (!diagResult) return null;
    const healthCfg = HEALTH_CONFIG[diagResult.health] || HEALTH_CONFIG.UNHEALTHY;
    return (
      <div>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <Title level={4} style={{ color: healthCfg.color, margin: "8px 0 0" }}>{healthCfg.text}</Title>
          <Text type="secondary">节点 {diagResult.nodeName} · 当前状态 {diagResult.currentStatus}</Text>
        </div>
        <Divider style={{ margin: "12px 0" }} />
        <div style={{ padding: "0 8px" }}>
          {renderDiagCheck("Ping 连通性", diagResult.pingReachable)}
          {renderDiagCheck("SSH 可达", diagResult.sshConnectable)}
          {renderDiagCheck("Agent 进程", diagResult.agentRunning)}
        </div>
        {diagResult.issues?.length > 0 && (
          <>
            <Divider style={{ margin: "12px 0" }} />
            <div style={{ textAlign: "center" }}>
              <Button type="primary" danger icon={<ToolOutlined />}
                onClick={() => handleRepairFromDiag(diagResult.nodeId)}>
                一键修复
              </Button>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderRepairResult = () => {
    if (!repairResult) return null;
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>
          {repairResult.success
            ? <CheckCircleFilled style={{ color: "#52c41a" }} />
            : <CloseCircleFilled style={{ color: "#ff4d4f" }} />}
        </div>
        <Title level={4} style={{ color: repairResult.success ? "#52c41a" : "#ff4d4f" }}>
          {repairResult.success ? "修复成功" : "修复失败"}
        </Title>
        {repairResult.error && <Text type="danger">{repairResult.error}</Text>}
      </div>
    );
  };

  /* ====== 表格列 ====== */
  const columns = [
    {
      title: "名称", dataIndex: "name", width: 160,
      render: (text, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => handleOpenDetail(record)}>
          <ClusterOutlined style={{ marginRight: 4 }} />{text}
        </Button>
      ),
    },
    {
      title: "地址", dataIndex: "ipAddress", width: 150,
      render: (ip, record) => <Text copyable={{ text: ip }}>{ip}{record.agentPort ? `:${record.agentPort}` : ""}</Text>,
    },
    {
      title: "类型", width: 80,
      render: (_, record) => {
        const type = extractType(record.tags);
        return type ? <Tag color={NODE_TYPE_COLORS[type]}>{type}</Tag> : <Text type="secondary">-</Text>;
      },
    },
    {
      title: "状态", dataIndex: "status", width: 100,
      render: (status, record) => {
        const info = NODE_STATUS_MAP[status] || { text: status, badge: "default" };
        if (status === "OFFLINE" || status === "ERROR") {
          return (
            <Tooltip title="点击诊断">
              <span style={{ cursor: "pointer" }} onClick={() => handleDiagnose(record)}>
                <Badge status={info.badge} text={<Text style={{ color: info.color }}>{info.text}</Text>} />
              </span>
            </Tooltip>
          );
        }
        return <Badge status={info.badge} text={info.text} />;
      },
    },
    {
      title: "资源池", width: 120,
      render: (_, record) => {
        const name = getPoolName(record.resourcePoolId);
        return name ? <Tag color="cyan">{name}</Tag> : <Text type="secondary">未分配</Text>;
      },
    },
    { title: "标签", width: 200, render: (_, record) => renderTagList(record.tags) },
    {
      title: "CPU", width: 90,
      render: (_, record) => {
        const hw = parseJSON(record.hardwareInfo);
        return hw?.cpuUsage != null ? <Progress percent={Math.round(hw.cpuUsage)} size="small" strokeWidth={4} /> : <Text type="secondary">-</Text>;
      },
    },
    {
      title: "内存", width: 90,
      render: (_, record) => {
        const hw = parseJSON(record.hardwareInfo);
        return hw?.memoryUsage != null ? <Progress percent={Math.round(hw.memoryUsage)} size="small" strokeWidth={4} /> : <Text type="secondary">-</Text>;
      },
    },
    {
      title: "最后心跳", dataIndex: "lastHeartbeat", width: 120,
      render: (v) => {
        if (!v) return <Text type="secondary">从未</Text>;
        const d = dayjs(v);
        return (
          <Tooltip title={d.format("YYYY-MM-DD HH:mm:ss")}>
            <Text type={d.isBefore(dayjs().subtract(5, "minute")) ? "danger" : "secondary"}>{d.fromNow()}</Text>
          </Tooltip>
        );
      },
    },
    {
      title: "操作", width: 200,
      render: (_, record) => (
        <Space size={4}>
          <Tooltip title="详情"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleOpenDetail(record)} /></Tooltip>
          <Tooltip title="诊断"><Button type="text" size="small" icon={<BugOutlined />} onClick={() => handleDiagnose(record)} /></Tooltip>
          <Tooltip title="修复"><Button type="text" size="small" icon={<ToolOutlined />} onClick={() => handleRepair(record)} /></Tooltip>
          <Tooltip title="编辑"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} /></Tooltip>
          <Popconfirm title="确定删除此节点？" onConfirm={() => handleDelete(record.id)}>
            <Tooltip title="删除"><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /* ====== 直接注册节点 Tab 内容 ====== */
  const directNodesContent = (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <Input placeholder="搜索名称/IP" prefix={<SearchOutlined />} allowClear style={{ width: 180 }} value={searchText} onChange={e => setSearchText(e.target.value)} />
        <Select placeholder="状态筛选" allowClear style={{ width: 110 }} value={statusFilter} onChange={setStatusFilter}
          options={Object.entries(NODE_STATUS_MAP).map(([k, v]) => ({ label: v.text, value: k }))} />
        <Select placeholder="标签筛选" allowClear style={{ width: 140 }} value={tagFilter} onChange={setTagFilter} showSearch optionFilterProp="label">
          {allTagKeys.map(key => (
            <Select.Option key={key} value={key} label={key}><TagOutlined style={{ marginRight: 4 }} />{key}</Select.Option>
          ))}
        </Select>
        <Button icon={<ReloadOutlined />} onClick={fetchNodes}>刷新</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleRegister}>注册节点</Button>
      </div>
      <Table
        columns={columns} dataSource={filteredNodes} rowKey="id" loading={loading}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `共 ${t} 个节点` }}
        size="middle" scroll={{ x: 1300 }}
      />
    </div>
  );

  const tabItems = [
    {
      key: "direct",
      label: <Space><CloudServerOutlined />直接注册节点 <Tag color="blue">{filteredNodes.length}</Tag></Space>,
      children: directNodesContent,
    },
    {
      key: "k8s",
      label: <Space><ClusterOutlined />K8s 集群节点</Space>,
      children: <K8sNodesTab onDiagnose={handleDiagnose} />,
    },
  ];

  return (
    <div>
      <Card
        title={<Space><ClusterOutlined /><span>节点管理</span></Space>}
      >
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Card>

      {/* 注册/编辑 Modal */}
      <Modal title={editingNode ? "编辑节点" : "注册节点"} open={modalVisible}
        onOk={handleSubmit} onCancel={() => { setModalVisible(false); form.resetFields(); setEditTags([]); }}
        confirmLoading={submitting} width={600}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="节点名称" rules={[{ required: true, message: "请输入节点名称" }]}>
            <Input placeholder="如: gpu-node-01" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item name="ipAddress" label="IP地址" rules={[{ required: true, message: "请输入IP地址" }]}><Input placeholder="192.168.1.100" /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="agentPort" label="端口"><Input type="number" placeholder="8090" /></Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="type" label="节点类型" rules={[{ required: true, message: "请选择类型" }]}>
                <Select placeholder="选择节点类型" options={[
                  { label: "CPU 节点", value: "CPU" }, { label: "GPU 节点", value: "GPU" },
                  { label: "NPU 节点", value: "NPU" }, { label: "FPGA 节点", value: "FPGA" },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="resourcePoolId" label="资源池">
                <Select placeholder="选择资源池（可选）" allowClear options={pools.map(p => ({ label: p.name, value: p.id }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={<Space><TagsOutlined />标签管理 <Text type="secondary" style={{ fontSize: 12 }}>({editTags.length}/20)</Text></Space>}>
            <div style={{ border: "1px solid #d9d9d9", borderRadius: 6, padding: 12, background: "#fafafa" }}>
              <div style={{ minHeight: 32, marginBottom: editTags.length > 0 ? 8 : 0 }}>
                {editTags.map((t, i) => (
                  <Tag key={i} closable onClose={() => handleRemoveTag(t.key)} color={getTagColor(t.key)} style={{ marginBottom: 4 }}>
                    {t.value ? `${t.key}: ${t.value}` : t.key}
                  </Tag>
                ))}
                {editTags.length === 0 && <Text type="secondary" style={{ fontSize: 12 }}>暂无标签</Text>}
              </div>
              <Space.Compact style={{ width: "100%" }}>
                <Input placeholder="Key" value={tagInputKey} onChange={e => setTagInputKey(e.target.value)} style={{ width: "35%" }} onPressEnter={handleAddTag} />
                <Input placeholder="Value" value={tagInputValue} onChange={e => setTagInputValue(e.target.value)} style={{ width: "45%" }} onPressEnter={handleAddTag} />
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAddTag} style={{ width: "20%" }}>添加</Button>
              </Space.Compact>
            </div>
          </Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} placeholder="节点描述" /></Form.Item>
        </Form>
      </Modal>

      {/* 诊断 Modal */}
      <Modal title={<><BugOutlined /> 节点诊断 — {diagNodeName}</>} open={diagModalVisible}
        onCancel={() => setDiagModalVisible(false)} footer={[<Button key="close" onClick={() => setDiagModalVisible(false)}>关闭</Button>]} width={520}>
        {diagLoading ? <div style={{ textAlign: "center", padding: "40px 0" }}><Spin size="large" /><div style={{ marginTop: 16 }}><Text type="secondary">诊断中...</Text></div></div> : renderDiagResult()}
      </Modal>

      {/* 修复 Modal */}
      <Modal title={<><ToolOutlined /> 节点修复 — {repairNodeName}</>} open={repairModalVisible}
        onCancel={() => setRepairModalVisible(false)} footer={[<Button key="close" onClick={() => setRepairModalVisible(false)}>关闭</Button>]} width={480}>
        {repairLoading ? <div style={{ textAlign: "center", padding: "40px 0" }}><Spin size="large" /></div> : renderRepairResult()}
      </Modal>

      {/* 节点详情 Drawer */}
      <Drawer title={<><ClusterOutlined /> 节点详情 — {detailNode?.name}</>} open={detailDrawerVisible}
        onClose={() => setDetailDrawerVisible(false)} width={560}>
        {detailNode && (
          <Spin spinning={detailLoading}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="ID">{detailNode.id}</Descriptions.Item>
              <Descriptions.Item label="名称">{detailNode.name}</Descriptions.Item>
              <Descriptions.Item label="IP">{detailNode.ipAddress || "-"}</Descriptions.Item>
              <Descriptions.Item label="端口">{detailNode.agentPort || "-"}</Descriptions.Item>
              <Descriptions.Item label="状态">
                {(() => { const info = NODE_STATUS_MAP[detailNode.status] || { text: detailNode.status, badge: "default" }; return <Badge status={info.badge} text={info.text} />; })()}
              </Descriptions.Item>
              <Descriptions.Item label="类型">
                {(() => { const type = extractType(detailNode.tags); return type ? <Tag color={NODE_TYPE_COLORS[type]}>{type}</Tag> : "-"; })()}
              </Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>{detailNode.description || "-"}</Descriptions.Item>
              <Descriptions.Item label="最后心跳" span={2}>
                {detailNode.lastHeartbeat ? dayjs(detailNode.lastHeartbeat).format("YYYY-MM-DD HH:mm:ss") : "从未"}
              </Descriptions.Item>
            </Descriptions>
            <Divider orientation="left"><TagsOutlined /> 标签</Divider>
            <div style={{ marginBottom: 16 }}>
              {(() => {
                const tags = parseTags(detailNode.tags);
                if (tags.length === 0) return <Text type="secondary">暂无标签</Text>;
                return <Space size={[4, 4]} wrap>{tags.map((t, i) => <Tag key={i} color={getTagColor(t.key)}>{t.value ? `${t.key}: ${t.value}` : t.key}</Tag>)}</Space>;
              })()}
            </div>
            <Divider />
            <Space>
              <Button icon={<BugOutlined />} onClick={() => { setDetailDrawerVisible(false); handleDiagnose(detailNode); }}>诊断</Button>
              <Button type="primary" icon={<ToolOutlined />} onClick={() => { setDetailDrawerVisible(false); handleRepair(detailNode); }}>修复</Button>
              <Button icon={<EditOutlined />} onClick={() => { setDetailDrawerVisible(false); handleEdit(detailNode); }}>编辑</Button>
            </Space>
          </Spin>
        )}
      </Drawer>
    </div>
  );
}
