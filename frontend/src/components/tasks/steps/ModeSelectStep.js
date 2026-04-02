/**
 * @file ModeSelectStep.js
 * @description 创建任务 Step 0 — 选择创建模式（模板/自定义）
 * @param {Object} props
 * @param {string}   props.mode - 当前模式 "template"|"custom"|null
 * @param {Function} props.setMode - 设置模式
 */
import React from "react";
import { Row, Col, Card, Typography } from "antd";
import { AppstoreOutlined, SettingOutlined } from "@ant-design/icons";

const { Text } = Typography;

export default function ModeSelectStep({ mode, setMode }) {
  return (
    <div style={{ padding: "20px 0" }}>
      <Row gutter={[24, 24]}>
        <Col span={12}>
          <Card hoverable onClick={() => setMode("template")}
            style={{ textAlign: "center", border: mode === "template" ? "2px solid #1890ff" : "1px solid #f0f0f0", minHeight: 160 }}>
            <AppstoreOutlined style={{ fontSize: 40, color: "#1890ff", marginBottom: 12 }} />
            <h3>模板化创建</h3>
            <Text type="secondary">选择预置评测模板，快速创建任务</Text>
          </Card>
        </Col>
        <Col span={12}>
          <Card hoverable onClick={() => setMode("custom")}
            style={{ textAlign: "center", border: mode === "custom" ? "2px solid #1890ff" : "1px solid #f0f0f0", minHeight: 160 }}>
            <SettingOutlined style={{ fontSize: 40, color: "#722ed1", marginBottom: 12 }} />
            <h3>自定义创建</h3>
            <Text type="secondary">灵活配置评测参数，定制化评测</Text>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
