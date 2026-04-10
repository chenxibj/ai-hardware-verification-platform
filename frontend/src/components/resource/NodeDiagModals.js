/**
 * @file NodeDiagModals.js
 * @description 节点诊断和修复 Modal 组件
 */
import React from "react";
import { Modal, Button, Spin, Divider, Typography } from "antd";
import {
  BugOutlined, ToolOutlined, CheckCircleFilled, CloseCircleFilled,
  ExclamationCircleFilled,
} from "@ant-design/icons";
import { HEALTH_CONFIG } from "./nodeHelpers";

const { Text, Title } = Typography;

const renderDiagCheck = (label, value) => {
  if (value === true) return <div style={{ marginBottom: 4 }}><CheckCircleFilled style={{ color: "#52c41a", marginRight: 8 }} />{label}: <Text type="success">正常</Text></div>;
  if (value === false) return <div style={{ marginBottom: 4 }}><CloseCircleFilled style={{ color: "#ff4d4f", marginRight: 8 }} />{label}: <Text type="danger">异常</Text></div>;
  return <div style={{ marginBottom: 4 }}><ExclamationCircleFilled style={{ color: "#d9d9d9", marginRight: 8 }} />{label}: <Text type="secondary">{String(value)}</Text></div>;
};

export function DiagnoseModal({ visible, onCancel, loading, result, nodeName, onRepair }) {
  const renderResult = () => {
    if (!result) return null;
    const healthCfg = HEALTH_CONFIG[result.health] || HEALTH_CONFIG.UNHEALTHY;
    return (
      <div>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <Title level={4} style={{ color: healthCfg.color, margin: "8px 0 0" }}>{healthCfg.text}</Title>
          <Text type="secondary">节点 {result.nodeName} · 状态 {result.currentStatus}</Text>
        </div>
        <Divider style={{ margin: "12px 0" }} />
        <div style={{ padding: "0 8px" }}>
          {renderDiagCheck("Ping 连通性", result.pingReachable)}
          {renderDiagCheck("SSH 可达", result.sshConnectable)}
          {renderDiagCheck("Agent 进程", result.agentRunning)}
        </div>
        {result.issues?.length > 0 && (
          <>
            <Divider style={{ margin: "12px 0" }} />
            <div style={{ padding: "0 8px" }}>
              <Text strong style={{ color: "#ff4d4f" }}>问题:</Text>
              {result.issues.map((issue, i) => (
                <div key={i} style={{ marginTop: 4, paddingLeft: 8 }}>
                  <CloseCircleFilled style={{ color: "#ff4d4f", marginRight: 6, fontSize: 12 }} />
                  <Text>{issue}</Text>
                </div>
              ))}
            </div>
          </>
        )}
        {result.suggestions?.length > 0 && (
          <div style={{ padding: "8px 8px 0" }}>
            <Text strong style={{ color: "#1890ff" }}>建议:</Text>
            {result.suggestions.map((sug, i) => (
              <div key={i} style={{ marginTop: 4, paddingLeft: 8 }}>
                <span style={{ marginRight: 6 }}>💡</span>
                <Text type="secondary">{sug}</Text>
              </div>
            ))}
          </div>
        )}
        {result.issues?.length > 0 && (
          <>
            <Divider style={{ margin: "12px 0" }} />
            <div style={{ textAlign: "center" }}>
              <Button type="primary" danger icon={<ToolOutlined />} onClick={() => onRepair(result.nodeId)}>
                一键修复
              </Button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <Modal
      title={<><BugOutlined /> 节点诊断 — {nodeName}</>}
      open={visible}
      onCancel={onCancel}
      footer={[<Button key="close" onClick={onCancel}>关闭</Button>]}
      width={520}
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}><Text type="secondary">诊断中...</Text></div>
        </div>
      ) : renderResult()}
    </Modal>
  );
}

export function RepairModal({ visible, onCancel, loading, result, nodeName }) {
  const renderResult = () => {
    if (!result) return null;
    return (
      <div>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 48 }}>
            {result.success ? <CheckCircleFilled style={{ color: "#52c41a" }} /> : <CloseCircleFilled style={{ color: "#ff4d4f" }} />}
          </div>
          <Title level={4} style={{ color: result.success ? "#52c41a" : "#ff4d4f", margin: "8px 0 0" }}>
            {result.success ? "修复成功" : "修复失败"}
          </Title>
        </div>
        {result.actions?.length > 0 && (
          <div style={{ padding: "0 8px" }}>
            <Text strong>修复过程:</Text>
            {result.actions.map((action, i) => (
              <div key={i} style={{ marginTop: 6, paddingLeft: 8 }}>
                <CheckCircleFilled style={{ color: "#52c41a", marginRight: 6, fontSize: 12 }} /><Text>{action}</Text>
              </div>
            ))}
          </div>
        )}
        {result.error && <div style={{ padding: 8, marginTop: 8 }}><Text type="danger">{result.error}</Text></div>}
      </div>
    );
  };

  return (
    <Modal
      title={<><ToolOutlined /> 节点修复 — {nodeName}</>}
      open={visible}
      onCancel={onCancel}
      footer={[<Button key="close" onClick={onCancel}>关闭</Button>]}
      width={480}
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0" }}><Spin size="large" /></div>
      ) : renderResult()}
    </Modal>
  );
}
