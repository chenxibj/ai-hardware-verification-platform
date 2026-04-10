/**
 * @file NodeDetailDrawer.js
 * @description 节点详情 Drawer 组件
 */
import React from "react";
import {
  Drawer, Descriptions, Badge, Tag, Divider, Space, Button, Spin, Typography,
} from "antd";
import {
  ClusterOutlined, BugOutlined, ToolOutlined, EditOutlined, TagsOutlined,
} from "@ant-design/icons";
import { NODE_STATUS_MAP, NODE_TYPE_COLORS, extractType, parseTags, getTagColor } from "./nodeHelpers";
import dayjs from "dayjs";

const { Text } = Typography;

export default function NodeDetailDrawer({
  visible, onClose, node, loading, onDiagnose, onRepair, onEdit,
}) {
  if (!node) return null;

  return (
    <Drawer
      title={<><ClusterOutlined /> 节点详情 — {node.name}</>}
      open={visible}
      onClose={onClose}
      width={560}
    >
      <Spin spinning={loading}>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="ID">{node.id}</Descriptions.Item>
          <Descriptions.Item label="名称">{node.name}</Descriptions.Item>
          <Descriptions.Item label="IP">{node.ipAddress || "-"}</Descriptions.Item>
          <Descriptions.Item label="端口">{node.agentPort || "-"}</Descriptions.Item>
          <Descriptions.Item label="状态">
            {(() => {
              const info = NODE_STATUS_MAP[node.status] || { text: node.status, badge: "default" };
              return <Badge status={info.badge} text={info.text} />;
            })()}
          </Descriptions.Item>
          <Descriptions.Item label="类型">
            {(() => {
              const type = extractType(node.tags);
              return type ? <Tag color={NODE_TYPE_COLORS[type]}>{type}</Tag> : "-";
            })()}
          </Descriptions.Item>
          <Descriptions.Item label="描述" span={2}>{node.description || "-"}</Descriptions.Item>
          <Descriptions.Item label="最后心跳" span={2}>
            {node.lastHeartbeat ? dayjs(node.lastHeartbeat).format("YYYY-MM-DD HH:mm:ss") : "从未"}
          </Descriptions.Item>
        </Descriptions>

        <Divider orientation="left"><TagsOutlined /> 标签</Divider>
        <div style={{ marginBottom: 16 }}>
          {(() => {
            const tags = parseTags(node.tags);
            if (tags.length === 0) return <Text type="secondary">暂无标签</Text>;
            return (
              <Space size={[4, 4]} wrap>
                {tags.map((t, i) => (
                  <Tag key={i} color={getTagColor(t.key)}>
                    {t.value ? `${t.key}: ${t.value}` : t.key}
                  </Tag>
                ))}
              </Space>
            );
          })()}
        </div>

        <Divider />
        <Space>
          <Button icon={<BugOutlined />} onClick={() => onDiagnose && onDiagnose(node)}>诊断</Button>
          <Button type="primary" icon={<ToolOutlined />} onClick={() => onRepair && onRepair(node)}>修复</Button>
          <Button icon={<EditOutlined />} onClick={() => onEdit && onEdit(node)}>编辑</Button>
        </Space>
      </Spin>
    </Drawer>
  );
}
