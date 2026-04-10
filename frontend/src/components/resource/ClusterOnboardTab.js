/**
 * @file ClusterOnboardTab.js
 * @description 集群纳管 Tab — 已注册集群列表 + 注册新集群（3步 Steps）
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Table, Button, Space, Typography, Tag, Card, Divider, Empty,
  Popconfirm, message,
} from "antd";
import {
  PlusOutlined, ClusterOutlined, ReloadOutlined, DeleteOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import api from "../../utils/api";
import ClusterRegisterSteps from "./ClusterRegisterSteps";

const { Title, Text } = Typography;

const STATUS_MAP = {
  REGISTERING: { color: "processing", text: "注册中" },
  DEPLOYING: { color: "processing", text: "部署中" },
  DISCOVERING: { color: "processing", text: "发现中" },
  READY: { color: "success", text: "就绪" },
  ERROR: { color: "error", text: "错误" },
  CONNECTED: { color: "green", text: "已连接" },
  DISCONNECTED: { color: "red", text: "已断开" },
  PENDING: { color: "orange", text: "连接中" },
  UNKNOWN: { color: "default", text: "未知" },
};

export default function ClusterOnboardTab({ onNavigateToNodes }) {
  const [clusters, setClusters] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const fetchClusters = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await api.get("/k8s/clusters");
      if (res.data.code === 0) setClusters(res.data.data || []);
    } catch {
      setClusters([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { fetchClusters(); }, [fetchClusters]);

  const handleDelete = async (id) => {
    try {
      await api.delete(`/k8s/clusters/${id}`);
      message.success("集群已删除");
      fetchClusters();
    } catch (err) {
      message.error("删除失败: " + (err.displayMessage || "未知错误"));
    }
  };

  const clusterColumns = [
    {
      title: "集群名称", dataIndex: "name", key: "name",
      render: (text) => <Space><ClusterOutlined />{text}</Space>,
    },
    { title: "节点数", dataIndex: "nodeCount", key: "nodeCount", width: 80 },
    {
      title: "状态", dataIndex: "status", key: "status", width: 100,
      render: (status) => {
        const cfg = STATUS_MAP[status] || STATUS_MAP.UNKNOWN;
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: "注册时间", dataIndex: "createdAt", key: "createdAt", width: 180,
      render: (v) => v ? new Date(v).toLocaleString("zh-CN") : "-",
    },
    {
      title: "操作", key: "action", width: 140,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />}>详情</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* 已注册集群列表 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Title level={5} style={{ margin: 0 }}>已注册集群</Title>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchClusters}>刷新</Button>
            {!showRegister && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowRegister(true)}>
                注册新集群
              </Button>
            )}
          </Space>
        </div>

        {clusters.length > 0 ? (
          <Table
            dataSource={clusters}
            columns={clusterColumns}
            rowKey="id"
            loading={listLoading}
            size="small"
            pagination={{ pageSize: 10 }}
          />
        ) : (
          <Card>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <span>
                  暂无已注册的 K8s 集群<br />
                  <Text type="secondary">
                    {listLoading ? "加载中..." : "点击「注册新集群」开始纳管"}
                  </Text>
                </span>
              }
            >
              {!showRegister && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowRegister(true)}>
                  注册新集群
                </Button>
              )}
            </Empty>
          </Card>
        )}
      </div>

      {/* 注册新集群 */}
      {showRegister && (
        <>
          <Divider />
          <ClusterRegisterSteps
            onDone={fetchClusters}
            onCancel={() => setShowRegister(false)}
            onNavigateToNodes={onNavigateToNodes}
          />
        </>
      )}
    </div>
  );
}
