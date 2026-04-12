/**
 * @file TaskDetailDrawer.js
 * @description 任务详情弹窗（基本信息 + 执行记录 + 实时日志）
 * #225 - 日志 tab 使用 TaskExecutionLogs 组件实时轮询
 */
import React from "react";
import {
  Modal, Tabs, Descriptions, Badge, Progress, Tag, Table,
  Divider, Button, Space, Row, Col, Card, Alert, Typography, message,
} from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import {
  EVAL_TYPES, PRIORITIES, PRIORITY_COLORS, STATUS_MAP, STATUS_COLORS,
} from "./taskConstants";
import TaskExecutionLogs from "./TaskExecutionLogs";
import dayjs from "dayjs";

const { Text } = Typography;

export default function TaskDetailDrawer({
  visible, selected, executions, taskReport, reportLoading, onClose,
}) {
  if (!selected) return null;

  const infoTab = (
    <div>
      <Descriptions bordered column={2} size="small">
        <Descriptions.Item label="编号">{selected.taskNo}</Descriptions.Item>
        <Descriptions.Item label="状态">
          <Badge status={STATUS_COLORS[selected.status]} text={STATUS_MAP[selected.status]} />
        </Descriptions.Item>
        <Descriptions.Item label="名称" span={2}>{selected.name}</Descriptions.Item>
        <Descriptions.Item label="评测类型">
          <Tag color="blue">{EVAL_TYPES[selected.evalType] || selected.evalType}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="优先级">
          <Tag color={PRIORITY_COLORS[selected.priority]}>{PRIORITIES[selected.priority] || selected.priority}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="进度" span={2}>
          <Progress percent={selected.progress || 0} style={{ maxWidth: 300 }} />
        </Descriptions.Item>
        <Descriptions.Item label="创建时间">
          {dayjs(selected.createdAt).format("YYYY-MM-DD HH:mm:ss")}
        </Descriptions.Item>
        {selected.completedAt && (
          <Descriptions.Item label="完成时间">
            {dayjs(selected.completedAt).format("YYYY-MM-DD HH:mm:ss")}
          </Descriptions.Item>
        )}
        {selected.assignedNodeId && (
          <Descriptions.Item label="执行节点">节点 #{selected.assignedNodeId}</Descriptions.Item>
        )}
        {selected.description && (
          <Descriptions.Item label="描述" span={2}>{selected.description}</Descriptions.Item>
        )}
        {selected.errorMessage && (
          <Descriptions.Item label="错误信息" span={2}>
            <Text type="danger">{selected.errorMessage}</Text>
          </Descriptions.Item>
        )}
        {selected.status === "QUEUED" && selected.queueReason && (
          <Descriptions.Item label="排队原因" span={2}>
            <Text type="warning">{selected.queueReason}</Text>
          </Descriptions.Item>
        )}
      </Descriptions>

      {selected.status === "COMPLETED" && (
        <div style={{ marginTop: 24 }}>
          <Divider orientation="left"><FileTextOutlined /> 关联评测报告</Divider>
          {reportLoading ? (
            <Text type="secondary">加载报告中...</Text>
          ) : taskReport ? (
            <Card size="small" style={{ background: "#f6ffed", border: "1px solid #b7eb8f" }}>
              <Row justify="space-between" align="middle">
                <Col>
                  <Space direction="vertical" size={4}>
                    <Text strong>{taskReport.reportNo}</Text>
                    <Text type="secondary">{taskReport.summary}</Text>
                    <Space>
                      <Tag color="green">{taskReport.status}</Tag>
                      <Tag color="blue">评分: {taskReport.score}</Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        生成于 {dayjs(taskReport.createdAt).format("YYYY-MM-DD HH:mm:ss")}
                      </Text>
                    </Space>
                  </Space>
                </Col>
                <Col>
                  <Button type="primary" icon={<FileTextOutlined />}
                    onClick={() => { onClose(); message.info("请前往「评测报告」页面查看报告 " + taskReport.reportNo); }}>
                    查看报告
                  </Button>
                </Col>
              </Row>
            </Card>
          ) : (
            <Alert message="暂无报告" description="该任务已完成但尚未生成评测报告" type="info" showIcon />
          )}
        </div>
      )}
    </div>
  );

  const execColumns = [
    { title: "执行ID", dataIndex: "id", width: 70 },
    { title: "节点ID", dataIndex: "nodeId", width: 70 },
    { title: "状态", dataIndex: "status", width: 100, render: v => <Badge status={STATUS_COLORS[v] || "default"} text={v} /> },
    { title: "耗时", dataIndex: "durationSec", width: 100, render: v => v ? `${v.toFixed(1)}s` : "-" },
    { title: "调度时间", dataIndex: "dispatchedAt", width: 160, render: v => v ? dayjs(v).format("MM-DD HH:mm:ss") : "-" },
    { title: "完成时间", dataIndex: "completedAt", width: 160, render: v => v ? dayjs(v).format("MM-DD HH:mm:ss") : "-" },
  ];

  const execTab = executions.length > 0
    ? <Table size="small" dataSource={executions} rowKey="id" pagination={false} columns={execColumns} />
    : <Text type="secondary">暂无执行记录</Text>;

  // #225: 使用 TaskExecutionLogs 组件实时轮询日志
  const logTab = (
    <TaskExecutionLogs taskId={selected.id} taskStatus={selected.status} />
  );

  return (
    <Modal title="任务详情" open={visible} width={800} footer={null}
      onCancel={onClose} destroyOnClose>
      <Tabs items={[
        { key: "info", label: "基本信息", children: infoTab },
        { key: "exec", label: "执行记录", children: execTab },
        { key: "log", label: "执行日志", children: logTab },
      ]} />
    </Modal>
  );
}
