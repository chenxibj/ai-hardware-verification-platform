/**
 * @file NodeDetail.js
 * @description 计算节点详情页 — 基本信息 + 资源使用率 + 任务列表
 * @feat #167
 */
import React, { useState, useEffect } from "react";
import {
  Card, Row, Col, Descriptions, Tag, Badge, Progress, Table, Button,
  Typography, Space, Empty, Spin, Tooltip, message
} from "antd";
import {
  ArrowLeftOutlined, ReloadOutlined, ClusterOutlined,
  CheckCircleOutlined, ClockCircleOutlined
} from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

const { Text, Title } = Typography;

const NODE_STATUS_MAP = {
  ONLINE: { text: "在线", color: "#52c41a", badge: "success" },
  OFFLINE: { text: "离线", color: "#ff4d4f", badge: "error" },
  MAINTENANCE: { text: "维护中", color: "#faad14", badge: "warning" },
  BUSY: { text: "忙碌", color: "#1890ff", badge: "processing" },
  ERROR: { text: "异常", color: "#ff4d4f", badge: "error" },
};

const TASK_STATUS_MAP = {
  PENDING: { text: "待执行", color: "default" },
  QUEUED: { text: "排队中", color: "warning" },
  RUNNING: { text: "执行中", color: "processing" },
  COMPLETED: { text: "已完成", color: "success" },
  FAILED: { text: "失败", color: "error" },
  CANCELLED: { text: "已取消", color: "default" },
};

export default function NodeDetail({ nodeId, onBack }) {
  const [node, setNode] = useState(null);
  const [envInfo, setEnvInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [nodeRes, envRes] = await Promise.allSettled([
        api.get(`/nodes/${nodeId}`),
        api.get(`/nodes/${nodeId}/env-info`),
      ]);
      if (nodeRes.status === "fulfilled" && nodeRes.value.data.code === 0) {
        setNode(nodeRes.value.data.data);
      }
      if (envRes.status === "fulfilled" && envRes.value.data.code === 0) {
        setEnvInfo(envRes.value.data.data);
      }
    } catch {
      message.error("获取节点详情失败");
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [nodeId]);

  if (loading) {
    return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;
  }

  if (!node) {
    return <Empty description="节点不存在" />;
  }

  const statusInfo = NODE_STATUS_MAP[node.status] || { text: node.status, badge: "default" };

  const parseHw = (str) => {
    if (!str) return {};
    try { return typeof str === "string" ? JSON.parse(str) : str; } catch { return {}; }
  };

  const hw = parseHw(node.hardwareInfo);

  const extractType = (tags) => {
    if (!tags) return "未知";
    const upper = tags.toUpperCase();
    if (upper.includes("GPU")) return "GPU";
    if (upper.includes("NPU")) return "NPU";
    if (upper.includes("CPU")) return "CPU";
    if (upper.includes("FPGA")) return "FPGA";
    return "其他";
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack} style={{ marginRight: 12 }}>返回</Button>
        <Title level={4} style={{ display: "inline", verticalAlign: "middle" }}>
          <ClusterOutlined style={{ marginRight: 8 }} />
          {node.name}
        </Title>
        <Badge status={statusInfo.badge} text={statusInfo.text} style={{ marginLeft: 12 }} />
        <Button icon={<ReloadOutlined />} style={{ float: "right" }} onClick={fetchData}>刷新</Button>
      </div>

      <Row gutter={[16, 16]}>
        {/* 基本信息 */}
        <Col xs={24} lg={12}>
          <Card title="基本信息" size="small">
            <Descriptions column={2} size="small">
              <Descriptions.Item label="名称">{node.name}</Descriptions.Item>
              <Descriptions.Item label="状态"><Badge status={statusInfo.badge} text={statusInfo.text} /></Descriptions.Item>
              <Descriptions.Item label="IP地址">
                <Text copyable>{node.ipAddress || "-"}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="端口">{node.agentPort || "-"}</Descriptions.Item>
              <Descriptions.Item label="类型">
                <Tag color="blue">{extractType(node.tags)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="标签">{node.tags || "-"}</Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>{node.description || "-"}</Descriptions.Item>
              <Descriptions.Item label="最后心跳">
                {node.lastHeartbeat ? (
                  <Tooltip title={dayjs(node.lastHeartbeat).format("YYYY-MM-DD HH:mm:ss")}>
                    {dayjs(node.lastHeartbeat).fromNow()}
                  </Tooltip>
                ) : "从未"}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {node.createdAt ? dayjs(node.createdAt).format("YYYY-MM-DD HH:mm") : "-"}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 资源使用率 */}
        <Col xs={24} lg={12}>
          <Card title="资源使用率" size="small">
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <Text>CPU 使用率</Text>
                <Text strong>{hw.cpuUsage != null ? `${Math.round(hw.cpuUsage)}%` : "-"}</Text>
              </div>
              <Progress
                percent={hw.cpuUsage != null ? Math.round(hw.cpuUsage) : 0}
                strokeColor={hw.cpuUsage > 80 ? "#ff4d4f" : hw.cpuUsage > 60 ? "#faad14" : "#52c41a"}
                showInfo={false}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <Text>内存使用率</Text>
                <Text strong>{hw.memoryUsage != null ? `${Math.round(hw.memoryUsage)}%` : "-"}</Text>
              </div>
              <Progress
                percent={hw.memoryUsage != null ? Math.round(hw.memoryUsage) : 0}
                strokeColor={hw.memoryUsage > 80 ? "#ff4d4f" : hw.memoryUsage > 60 ? "#faad14" : "#52c41a"}
                showInfo={false}
              />
            </div>
            {hw.gpuUsage != null && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text>GPU 使用率</Text>
                  <Text strong>{Math.round(hw.gpuUsage)}%</Text>
                </div>
                <Progress
                  percent={Math.round(hw.gpuUsage)}
                  strokeColor="#722ed1"
                  showInfo={false}
                />
              </div>
            )}
            {hw.diskUsage != null && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text>磁盘使用率</Text>
                  <Text strong>{Math.round(hw.diskUsage)}%</Text>
                </div>
                <Progress
                  percent={Math.round(hw.diskUsage)}
                  strokeColor="#1890ff"
                  showInfo={false}
                />
              </div>
            )}
          </Card>
        </Col>

        {/* 环境信息 */}
        {envInfo && Object.keys(envInfo).length > 0 && (
          <Col span={24}>
            <Card title="环境信息" size="small">
              <Descriptions column={3} size="small">
                {envInfo.os_pretty && <Descriptions.Item label="操作系统">{envInfo.os_pretty}</Descriptions.Item>}
                {envInfo.kernel_version && <Descriptions.Item label="内核版本">{envInfo.kernel_version}</Descriptions.Item>}
                {envInfo.cpu_model && <Descriptions.Item label="CPU型号">{envInfo.cpu_model}</Descriptions.Item>}
                {envInfo.cpu_threads > 0 && <Descriptions.Item label="CPU线程数">{envInfo.cpu_threads}</Descriptions.Item>}
                {envInfo.gpu_count > 0 && <Descriptions.Item label="GPU数量">{envInfo.gpu_count}</Descriptions.Item>}
                {envInfo.gpus?.length > 0 && (
                  <Descriptions.Item label="GPU型号">
                    {envInfo.gpus.map(g => `${g.name} (${g.memory_mb}MB)`).join(", ")}
                  </Descriptions.Item>
                )}
                {envInfo.cuda_version && <Descriptions.Item label="CUDA">{envInfo.cuda_version}</Descriptions.Item>}
                {envInfo.python_version && <Descriptions.Item label="Python">{envInfo.python_version}</Descriptions.Item>}
                {envInfo.dl_frameworks && Object.keys(envInfo.dl_frameworks).length > 0 && (
                  <Descriptions.Item label="深度学习框架" span={3}>
                    <Space wrap>
                      {Object.entries(envInfo.dl_frameworks).map(([k, v]) => (
                        <Tag key={k} color="blue">{k} {v}</Tag>
                      ))}
                    </Space>
                  </Descriptions.Item>
                )}
              </Descriptions>
            </Card>
          </Col>
        )}
      </Row>
    </div>
  );
}
