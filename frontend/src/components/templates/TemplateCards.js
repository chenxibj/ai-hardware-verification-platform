/**
 * @file TemplateCards.js
 * @description 系统预置模板卡片展示
 * @param {Object} props
 * @param {Array}    props.templates - 系统模板列表
 * @param {Function} props.onView - 查看详情回调
 * @param {Function} props.onClone - 克隆模板回调
 */
import React from "react";
import { Row, Col, Card, Space, Tag, Tooltip, Typography } from "antd";
import { EyeOutlined, CopyOutlined, AppstoreOutlined } from "@ant-design/icons";
import {
  EVAL_TYPES, EVAL_DIMENSIONS, DIMENSION_ICONS, parseConfig,
} from "./templateConstants";

const { Paragraph } = Typography;

export default function TemplateCards({ templates, onView, onClone }) {
  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
      {templates.map(t => {
        const config = parseConfig(t.configJson);
        const dim = config.evalDimension || config.evalObject;
        return (
          <Col xs={24} sm={12} md={8} key={t.id}>
            <Card hoverable size="small"
              style={{ borderLeft: "3px solid #1890ff" }}
              actions={[
                <Tooltip title="查看详情">
                  <EyeOutlined key="view" onClick={() => onView(t)} />
                </Tooltip>,
                <Tooltip title="克隆为自定义模板">
                  <CopyOutlined key="clone" onClick={() => onClone(t)} />
                </Tooltip>,
              ]}>
              <Card.Meta
                avatar={<div style={{ fontSize: 28, color: "#1890ff" }}>
                  {DIMENSION_ICONS[dim] || <AppstoreOutlined />}
                </div>}
                title={<Space>{t.name}<Tag color="purple" style={{ fontSize: 10 }}>📦 系统</Tag></Space>}
                description={
                  <>
                    <Paragraph type="secondary" ellipsis={{ rows: 2 }}
                      style={{ marginBottom: 8, fontSize: 13 }}>
                      {t.description}
                    </Paragraph>
                    <Space size={4} wrap>
                      <Tag color="blue">{EVAL_TYPES[t.evalType] || t.evalType}</Tag>
                      {dim && <Tag>{EVAL_DIMENSIONS[dim] || dim}</Tag>}
                      {config.operators && <Tag color="cyan">{config.operators.length} 算子</Tag>}
                      {config.models && <Tag color="green">{config.models.length} 模型</Tag>}
                      {config.priority && (
                        <Tag>{config.priority === "LOW" ? "低优先级" : config.priority === "HIGH" ? "高优先级" : "中优先级"}</Tag>
                      )}
                    </Space>
                  </>
                }
              />
            </Card>
          </Col>
        );
      })}
    </Row>
  );
}
