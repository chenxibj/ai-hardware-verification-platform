/**
 * @file K8sNodesTab.js
 * @description K8s 集群节点 Tab — 按集群分组展示，不允许手动增删
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Collapse, Table, Tag, Badge, Space, Typography, Button, Alert, Spin,
  Tooltip, message, Empty,
} from "antd";
import {
  ClusterOutlined, BugOutlined, ReloadOutlined,
  CheckCircleFilled, CloseCircleFilled,
} from "@ant-design/icons";
import api from "../../utils/api";
import { NODE_STATUS_MAP, extractType, NODE_TYPE_COLORS, parseTags } from "./nodeHelpers";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

const { Text } = Typography;

export default function K8sNodesTab({ onDiagnose }) {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchK8sNodes = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all clusters first, then get nodes by clusterId for each
      const clusterRes = await api.get("/k8s/clusters");
      if (clusterRes.data.code === 0) {
        const clusters = clusterRes.data.data || [];
        const allK8sNodes = [];
        for (const cluster of clusters) {
          try {
            const nodeRes = await api.get("/nodes", { params: { clusterId: cluster.id } });
            if (nodeRes.data.code === 0) {
              const clusterNodes = (nodeRes.data.data || []).map(n => ({
                ...n,
                _clusterName: cluster.name,
              }));
              allK8sNodes.push(...clusterNodes);
            }
          } catch { /* skip cluster */ }
        }
        setNodes(allK8sNodes);
      }
    } catch {
      // Fallback: get all nodes with K8s sources
      try {
        const res = await api.get("/nodes");
        if (res.data.code === 0) {
          const all = res.data.data || [];
          setNodes(all.filter(n =>
            n.source === "k8s-daemonset" || n.source === "k8s-discovery" || n.clusterId != null
          ));
        }
      } catch {
        setNodes([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchK8sNodes(); }, [fetchK8sNodes]);

  /* 按集群分组 */
  const groupedByCluster = nodes.reduce((acc, node) => {
    // Use _clusterName from enriched data, or fall back to tags/clusterId
    let clusterName = node._clusterName;
    if (!clusterName) {
      const tags = parseTags(node.tags);
      const clusterTag = tags.find(t => t.key === "cluster");
      clusterName = clusterTag ? clusterTag.value : (node.clusterId ? `集群 #${node.clusterId}` : "未知集群");
    }
    if (!acc[clusterName]) acc[clusterName] = [];
    acc[clusterName].push(node);
    return acc;
  }, {});

  const columns = [
    {
      title: "节点名称", dataIndex: "name", key: "name",
      render: (text) => <Space><ClusterOutlined />{text}</Space>,
    },
    {
      title: "IP", dataIndex: "ipAddress", key: "ip", width: 140,
      render: (ip) => <Text copyable={{ text: ip }}>{ip}</Text>,
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
      render: (status) => {
        const info = NODE_STATUS_MAP[status] || { text: status, badge: "default" };
        return <Badge status={info.badge} text={info.text} />;
      },
    },
    {
      title: "注册时间", dataIndex: "createdAt", width: 160,
      render: (v) => v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "-",
    },
    {
      title: "最后心跳", dataIndex: "lastHeartbeat", width: 120,
      render: (v) => {
        if (!v) return <Text type="secondary">从未</Text>;
        const d = dayjs(v);
        return (
          <Tooltip title={d.format("YYYY-MM-DD HH:mm:ss")}>
            <Text type={d.isBefore(dayjs().subtract(5, "minute")) ? "danger" : "secondary"}>
              {d.fromNow()}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: "操作", width: 80,
      render: (_, record) => (
        <Tooltip title="诊断">
          <Button
            type="text"
            size="small"
            icon={<BugOutlined />}
            onClick={() => onDiagnose && onDiagnose(record)}
          />
        </Tooltip>
      ),
    },
  ];

  const clusterNames = Object.keys(groupedByCluster);

  return (
    <div>
      <Alert
        message="K8s 节点由集群自动管理"
        description="K8s 集群节点通过 DaemonSet 自动注册和维护，不支持手动添加或删除。如需增减节点，请在对应 K8s 集群中操作。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <div style={{ marginBottom: 12, textAlign: "right" }}>
        <Button icon={<ReloadOutlined />} onClick={fetchK8sNodes} loading={loading}>
          刷新
        </Button>
      </div>

      <Spin spinning={loading}>
        {clusterNames.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                暂无 K8s 集群节点
                <br />
                <Text type="secondary">请先在"集群纳管"中注册 K8s 集群</Text>
              </span>
            }
          />
        ) : (
          <Collapse defaultActiveKey={clusterNames}>
            {clusterNames.map(clusterName => {
              const clusterNodes = groupedByCluster[clusterName];
              const onlineCount = clusterNodes.filter(n => n.status === "ONLINE").length;
              return (
                <Collapse.Panel
                  key={clusterName}
                  header={
                    <Space>
                      <ClusterOutlined />
                      <Text strong>{clusterName}</Text>
                      <Tag color="blue">{clusterNodes.length} 节点</Tag>
                      <Tag color={onlineCount === clusterNodes.length ? "green" : "orange"}>
                        {onlineCount} 在线
                      </Tag>
                    </Space>
                  }
                >
                  <Table
                    dataSource={clusterNodes}
                    columns={columns}
                    rowKey="id"
                    size="small"
                    pagination={false}
                  />
                </Collapse.Panel>
              );
            })}
          </Collapse>
        )}
      </Spin>
    </div>
  );
}
