/**
 * @file AssetReuseTab.js
 * @description 资产复用记录 — 展示引用此资产的评测任务
 * @feat #267
 */
import React, { useState, useEffect } from "react";
import { Table, Empty, Tag, Typography, Space, Statistic } from "antd";
import {
  LinkOutlined, ExperimentOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { getAssetReuseRecords } from "./reuseStore";

const { Text } = Typography;

const REUSE_COLUMNS = [
  {
    title: "任务名称",
    dataIndex: "taskName",
    key: "taskName",
    ellipsis: true,
    render: (v) => (
      <Space size={4}>
        <ExperimentOutlined style={{ color: "#1890ff" }} />
        <Text strong>{v}</Text>
      </Space>
    ),
  },
  {
    title: "评测计划",
    dataIndex: "planName",
    key: "planName",
    ellipsis: true,
    render: (v) => v ? <Tag color="blue">{v}</Tag> : "-",
  },
  {
    title: "引用时间",
    dataIndex: "usedAt",
    key: "usedAt",
    width: 180,
    render: (v) => v ? dayjs(v).format("YYYY-MM-DD HH:mm:ss") : "-",
    sorter: (a, b) => new Date(a.usedAt) - new Date(b.usedAt),
    defaultSortOrder: "descend",
  },
  {
    title: "使用人",
    dataIndex: "usedBy",
    key: "usedBy",
    width: 120,
  },
];

export default function AssetReuseTab({ asset }) {
  const [records, setRecords] = useState([]);

  useEffect(() => {
    if (!asset?.id) return;
    const data = getAssetReuseRecords(asset.id);
    setRecords(data);
  }, [asset]);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Space size={24}>
          <Statistic
            title="总复用次数"
            value={records.length}
            prefix={<LinkOutlined />}
            valueStyle={{ color: "#1890ff" }}
          />
        </Space>
      </div>
      {records.length > 0 ? (
        <Table
          columns={REUSE_COLUMNS}
          dataSource={records.map((r, i) => ({ ...r, key: i }))}
          size="small"
          pagination={{ pageSize: 10 }}
        />
      ) : (
        <Empty
          image={<LinkOutlined style={{ fontSize: 48, color: "#bbb" }} />}
          description="暂无复用记录"
        >
          <Text type="secondary">
            当评测任务引用此资产时，复用记录将在此展示
          </Text>
        </Empty>
      )}
    </div>
  );
}
