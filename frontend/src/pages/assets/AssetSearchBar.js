/**
 * @file AssetSearchBar.js
 * @description 多条件组合搜索栏 — 名称、分类、标签、场景、创建人
 * @feat #265
 */
import React from "react";
import { Form, Input, Select, Button, Space, Row, Col } from "antd";
import { SearchOutlined, ClearOutlined } from "@ant-design/icons";
import { ASSET_TYPES } from "./constants";

const TYPE_OPTIONS = Object.entries(ASSET_TYPES)
  .filter(([k]) => ["MODEL", "DATASET", "OPERATOR", "SCRIPT", "TEMPLATE"].includes(k))
  .map(([k, v]) => ({ value: k, label: v.label }));

const SCENE_OPTIONS = [
  { value: "图像分类", label: "图像分类" },
  { value: "目标检测", label: "目标检测" },
  { value: "自然语言处理", label: "自然语言处理" },
  { value: "性能评测", label: "性能评测" },
  { value: "精度验证", label: "精度验证" },
];

export default function AssetSearchBar({ onSearch, onReset }) {
  const [form] = Form.useForm();

  const handleSearch = () => {
    const values = form.getFieldsValue();
    if (onSearch) onSearch(values);
  };

  const handleReset = () => {
    form.resetFields();
    if (onReset) onReset();
  };

  return (
    <Form form={form} layout="inline" style={{ marginBottom: 16 }}>
      <Row gutter={[8, 8]} style={{ width: "100%" }}>
        <Col xs={24} sm={12} md={6} lg={5}>
          <Form.Item name="name" style={{ marginBottom: 0, width: "100%" }}>
            <Input
              placeholder="资产名称"
              prefix={<SearchOutlined />}
              allowClear
              onPressEnter={handleSearch}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={5} lg={4}>
          <Form.Item name="assetType" style={{ marginBottom: 0, width: "100%" }}>
            <Select
              placeholder="资产分类"
              allowClear
              options={TYPE_OPTIONS}
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={5} lg={4}>
          <Form.Item name="tags" style={{ marginBottom: 0, width: "100%" }}>
            <Input placeholder="标签" allowClear onPressEnter={handleSearch} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={5} lg={4}>
          <Form.Item name="scene" style={{ marginBottom: 0, width: "100%" }}>
            <Select
              placeholder="场景"
              allowClear
              options={SCENE_OPTIONS}
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={5} lg={4}>
          <Form.Item name="createdBy" style={{ marginBottom: 0, width: "100%" }}>
            <Input
              placeholder="创建人"
              allowClear
              onPressEnter={handleSearch}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={4} lg={3}>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleSearch}
              >
                搜索
              </Button>
              <Button icon={<ClearOutlined />} onClick={handleReset}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
}
