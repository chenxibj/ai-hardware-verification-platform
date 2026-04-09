/**
 * @file AssetPreviewTab.js
 * @description 资产在线预览 — 数据集表格/脚本代码/流程模板JSON可视化
 * @feat #266
 */
import React, { useState, useEffect } from "react";
import { Table, Typography, Empty, Spin, Card, Tag, Space } from "antd";
import {
  FileSearchOutlined, CodeOutlined, ApartmentOutlined,
} from "@ant-design/icons";
import api from "../../utils/api";

const { Text, Paragraph } = Typography;

const MAX_PREVIEW_ROWS = 100;

/** 尝试解析 CSV 文本为表格数据 */
const parseCsvText = (text) => {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length === 0) return { columns: [], data: [] };
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const columns = headers.map((h, i) => ({
    title: h || `列${i + 1}`,
    dataIndex: `col_${i}`,
    key: `col_${i}`,
    ellipsis: true,
  }));
  const data = lines.slice(1, MAX_PREVIEW_ROWS + 1).map((line, rowIdx) => {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const row = { key: rowIdx };
    cells.forEach((cell, ci) => { row[`col_${ci}`] = cell; });
    return row;
  });
  return { columns, data };
};

/** 尝试解析 JSON 数组为表格数据 */
const parseJsonArray = (arr) => {
  const sliced = arr.slice(0, MAX_PREVIEW_ROWS);
  const keys = [...new Set(sliced.flatMap((item) => Object.keys(item)))];
  const columns = keys.map((k) => ({
    title: k,
    dataIndex: k,
    key: k,
    ellipsis: true,
    render: (v) => (typeof v === "object" ? JSON.stringify(v) : String(v ?? "")),
  }));
  const data = sliced.map((item, i) => ({ ...item, key: i }));
  return { columns, data };
};

/** 数据集预览组件 */
function DatasetPreview({ asset }) {
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPreview = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/assets/${asset.id}/preview`);
        if (res.data.code === 0 && res.data.data) {
          const raw = res.data.data;
          if (typeof raw === "string") {
            setPreviewData(parseCsvText(raw));
          } else if (Array.isArray(raw)) {
            setPreviewData(parseJsonArray(raw));
          }
        }
      } catch {
        /* 后端无预览API，用模拟数据展示 */
        setPreviewData(null);
      } finally {
        setLoading(false);
      }
    };
    loadPreview();
  }, [asset.id]);

  if (loading) return <Spin />;
  if (!previewData || previewData.data.length === 0) {
    return (
      <Empty
        image={<FileSearchOutlined style={{ fontSize: 48, color: "#bbb" }} />}
        description="暂无预览数据"
      >
        <Text type="secondary">
          数据集文件预览需要后端提供预览API，当前版本暂不支持在线解析
        </Text>
      </Empty>
    );
  }

  return (
    <div>
      <Text type="secondary" style={{ marginBottom: 8, display: "block" }}>
        展示前 {Math.min(previewData.data.length, MAX_PREVIEW_ROWS)} 条数据
      </Text>
      <Table
        columns={previewData.columns}
        dataSource={previewData.data}
        size="small"
        scroll={{ x: "max-content" }}
        pagination={{ pageSize: 20, showSizeChanger: false }}
      />
    </div>
  );
}

/** 脚本代码预览组件 */
function ScriptPreview({ asset }) {
  const [code, setCode] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCode = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/assets/${asset.id}/preview`);
        if (res.data.code === 0 && res.data.data) {
          setCode(typeof res.data.data === "string"
            ? res.data.data
            : JSON.stringify(res.data.data, null, 2));
        }
      } catch {
        setCode(null);
      } finally {
        setLoading(false);
      }
    };
    loadCode();
  }, [asset.id]);

  if (loading) return <Spin />;
  if (!code) {
    return (
      <Empty
        image={<CodeOutlined style={{ fontSize: 48, color: "#bbb" }} />}
        description="暂无预览数据"
      >
        <Text type="secondary">脚本文件预览需要后端支持</Text>
      </Empty>
    );
  }

  return (
    <pre
      style={{
        background: "#1e1e1e",
        color: "#d4d4d4",
        padding: 16,
        borderRadius: 6,
        maxHeight: 500,
        overflow: "auto",
        fontSize: 13,
        lineHeight: 1.5,
        fontFamily: "Consolas, Monaco, monospace",
      }}
    >
      {code}
    </pre>
  );
}

/** 流程模板 JSON 可视化 */
function TemplatePreview({ asset }) {
  const [templateData, setTemplateData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTemplate = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/assets/${asset.id}/preview`);
        if (res.data.code === 0 && res.data.data) {
          const data = typeof res.data.data === "string"
            ? JSON.parse(res.data.data) : res.data.data;
          setTemplateData(data);
        }
      } catch {
        setTemplateData(null);
      } finally {
        setLoading(false);
      }
    };
    loadTemplate();
  }, [asset.id]);

  if (loading) return <Spin />;
  if (!templateData) {
    return (
      <Empty
        image={<ApartmentOutlined style={{ fontSize: 48, color: "#bbb" }} />}
        description="暂无预览数据"
      >
        <Text type="secondary">流程模板预览需要后端支持</Text>
      </Empty>
    );
  }

  const renderNode = (node, depth = 0) => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      return node.map((item, i) => (
        <div key={i}>{renderNode(item, depth)}</div>
      ));
    }
    return (
      <Card
        size="small"
        style={{ marginLeft: depth * 24, marginBottom: 8 }}
        title={
          <Space>
            <Tag color="blue">{node.type || node.name || "节点"}</Tag>
            {node.id && <Text type="secondary">#{node.id}</Text>}
          </Space>
        }
      >
        {Object.entries(node)
          .filter(([k]) => !["type", "name", "id", "children", "steps", "nodes"].includes(k))
          .map(([k, v]) => (
            <Paragraph key={k} style={{ margin: 0, fontSize: 12 }}>
              <Text strong>{k}:</Text>{" "}
              {typeof v === "object" ? JSON.stringify(v) : String(v)}
            </Paragraph>
          ))}
        {(node.children || node.steps || node.nodes) &&
          renderNode(node.children || node.steps || node.nodes, depth + 1)}
      </Card>
    );
  };

  return (
    <div>
      <Text type="secondary" style={{ marginBottom: 8, display: "block" }}>
        流程模板结构可视化
      </Text>
      {renderNode(templateData)}
    </div>
  );
}

/** 主预览组件：按资产类型分发 */
export default function AssetPreviewTab({ asset }) {
  if (!asset) return <Empty description="无资产信息" />;

  const assetType = asset.assetType || "";

  if (assetType === "DATASET") {
    return <DatasetPreview asset={asset} />;
  }
  if (["SCRIPT", "EVAL_SCRIPT", "OPERATOR", "OPERATOR_SCRIPT"].includes(assetType)) {
    return <ScriptPreview asset={asset} />;
  }
  if (assetType === "TEMPLATE") {
    return <TemplatePreview asset={asset} />;
  }

  return (
    <Empty
      image={<FileSearchOutlined style={{ fontSize: 48, color: "#bbb" }} />}
      description="暂无预览数据"
    >
      <Text type="secondary">
        当前资产类型（{assetType}）暂不支持在线预览
      </Text>
    </Empty>
  );
}
