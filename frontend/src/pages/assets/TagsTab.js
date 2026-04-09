/**
 * @file TagsTab.js
 * @description 标签管理 Tab — 展示 + 添加（后端 API 就绪后启用写入）
 */
import React, { useState } from "react";
import { Tag, Space, Input, Button, Typography, message } from "antd";
import { PlusOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { parseTags } from "./constants";

const { Text } = Typography;

export default function TagsTab({ asset }) {
  const [tagInput, setTagInput] = useState("");
  const tags = parseTags(asset.tags);

  const handleAdd = () => {
    if (!tagInput.trim()) return;
    message.info("标签管理将在后端 API 支持后启用");
    setTagInput("");
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        {tags.length > 0 ? (
          <Space wrap size={[8, 8]}>
            {tags.map((t, i) => {
              const isKV = typeof t === "string" && t.includes(":");
              return (
                <Tag key={i} color={isKV ? "processing" : "default"}
                  style={{ padding: "4px 12px", fontSize: 13 }}>
                  {t}
                </Tag>
              );
            })}
          </Space>
        ) : (
          <Text type="secondary">暂无标签</Text>
        )}
      </div>
      <Space>
        <Input placeholder="添加标签（key:value 格式）" value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onPressEnter={handleAdd} style={{ width: 260 }} />
        <Button icon={<PlusOutlined />} disabled>添加</Button>
      </Space>
      <div style={{ marginTop: 12, color: "#999", fontSize: 12 }}>
        <InfoCircleOutlined /> 标签 CRUD 功能将在后端标签 API 就绪后启用
      </div>
    </div>
  );
}
