/**
 * @file AssetTypeSelector.js
 * @description 资产类型选择卡片行
 */
import React from "react";
import { Row, Col, Card } from "antd";
import { UPLOAD_ASSET_TYPES } from "./constants";

export default function AssetTypeSelector({ value, onChange }) {
  return (
    <Row gutter={[16, 16]}>
      {UPLOAD_ASSET_TYPES.map((t) => (
        <Col key={t.value} xs={12} sm={8} md={4}>
          <Card
            hoverable
            bodyStyle={{ padding: 16, textAlign: "center" }}
            style={{
              border: value === t.value ? `2px solid ${t.color}` : "1px solid #f0f0f0",
              background: value === t.value ? `${t.color}08` : "#fff",
            }}
            onClick={() => onChange(t.value)}
          >
            <div style={{ fontSize: 28, color: t.color, marginBottom: 8 }}>{t.icon}</div>
            <div style={{ fontWeight: 600 }}>{t.label}</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{t.formats}</div>
            <div style={{ fontSize: 11, color: "#999" }}>最大 {t.maxSize}</div>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
