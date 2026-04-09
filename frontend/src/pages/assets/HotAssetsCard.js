/**
 * @file HotAssetsCard.js
 * @description 热门资产 TOP5 卡片 — 用于 Dashboard 展示
 * @feat #267
 */
import React, { useState, useEffect } from "react";
import { Card, List, Tag, Space, Typography, Empty, Badge } from "antd";
import { FireOutlined, TrophyOutlined } from "@ant-design/icons";
import api from "../../utils/api";
import { getTopAssets } from "./reuseStore";
import { getTypeInfo } from "./constants";

const { Text } = Typography;

const MEDAL_COLORS = ["#ffd700", "#c0c0c0", "#cd7f32", "#1890ff", "#1890ff"];

export default function HotAssetsCard() {
  const [hotAssets, setHotAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHotAssets = async () => {
      setLoading(true);
      try {
        const topList = getTopAssets(5);
        if (topList.length === 0) {
          setHotAssets([]);
          return;
        }
        const res = await api.get("/assets", { params: { size: 100 } });
        if (res.data.code === 0) {
          const allAssets = res.data.data || [];
          const assetMap = {};
          allAssets.forEach((a) => { assetMap[String(a.id)] = a; });
          const merged = topList
            .map((t) => {
              const asset = assetMap[String(t.assetId)];
              if (!asset) return null;
              return { ...asset, reuseCount: t.count };
            })
            .filter(Boolean);
          setHotAssets(merged);
        }
      } catch {
        setHotAssets([]);
      } finally {
        setLoading(false);
      }
    };
    fetchHotAssets();
  }, []);

  return (
    <Card
      title={
        <Space>
          <FireOutlined style={{ color: "#fa541c" }} />
          <span>热门资产 TOP5</span>
        </Space>
      }
      size="small"
      loading={loading}
    >
      {hotAssets.length > 0 ? (
        <List
          dataSource={hotAssets}
          renderItem={(item, idx) => {
            const typeInfo = getTypeInfo(item.assetType);
            return (
              <List.Item style={{ padding: "8px 0" }}>
                <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                  <Badge
                    count={idx + 1}
                    style={{
                      backgroundColor: MEDAL_COLORS[idx] || "#1890ff",
                      marginRight: 12,
                      fontWeight: 600,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      strong
                      ellipsis
                      style={{ maxWidth: 160, display: "inline-block" }}
                    >
                      {item.name}
                    </Text>
                    <Tag
                      color={typeInfo.color}
                      style={{ marginLeft: 8, fontSize: 11 }}
                    >
                      {typeInfo.label}
                    </Tag>
                  </div>
                  <Tag color="volcano" icon={<TrophyOutlined />}>
                    {item.reuseCount} 次引用
                  </Tag>
                </div>
              </List.Item>
            );
          }}
        />
      ) : (
        <Empty
          description="暂无复用数据"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: "20px 0" }}
        />
      )}
    </Card>
  );
}
