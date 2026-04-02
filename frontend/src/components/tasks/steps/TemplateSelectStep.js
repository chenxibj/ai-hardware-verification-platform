/**
 * @file TemplateSelectStep.js
 * @description 创建任务 Step 1（模板模式）— 选择评测模板
 * @param {Object}   props
 * @param {Object}   props.selected - 已选模板
 * @param {Function} props.onSelect - 选中模板回调
 */
import React from "react";
import { Row, Col, Card, Tag, Divider, Alert, Typography } from "antd";
import { PRESET_TEMPLATES } from "../taskConstants";

const { Text } = Typography;

export default function TemplateSelectStep({ selected, onSelect }) {
  return (
    <div style={{ padding: "20px 0" }}>
      <Divider>选择评测模板</Divider>
      <Row gutter={[16, 16]}>
        {PRESET_TEMPLATES.map(t => (
          <Col span={8} key={t.id}>
            <Card size="small" hoverable onClick={() => onSelect(t)}
              style={{ border: selected?.id === t.id ? "2px solid #1890ff" : "1px solid #f0f0f0", minHeight: 140 }}>
              <div style={{ textAlign: "center", marginBottom: 8 }}>
                {React.cloneElement(t.icon, { style: { fontSize: 28, color: "#1890ff" } })}
              </div>
              <h4 style={{ margin: 0, textAlign: "center" }}>{t.name}</h4>
              <Text type="secondary" style={{ fontSize: 12, display: "block", textAlign: "center", marginTop: 4 }}>
                {t.desc}
              </Text>
              <div style={{ marginTop: 8, textAlign: "center" }}>
                {t.metrics.slice(0, 2).map(m => <Tag key={m} color="blue" style={{ fontSize: 11 }}>{m}</Tag>)}
                {t.metrics.length > 2 && <Tag style={{ fontSize: 11 }}>+{t.metrics.length - 2}</Tag>}
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      {selected && <Alert message={`已选择: ${selected.name}`} type="success" showIcon style={{ marginTop: 16 }} />}
    </div>
  );
}
