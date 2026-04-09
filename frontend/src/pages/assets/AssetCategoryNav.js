/**
 * @file AssetCategoryNav.js
 * @description 左侧分类导航树 — 五大类 + 细分子类
 */
import React from "react";
import { Card, Menu, Badge } from "antd";
import { FilterOutlined } from "@ant-design/icons";
import { CATEGORY_TREE } from "./constants";

export default function AssetCategoryNav({ selectedCategory, totalCount, onSelect }) {
  const menuItems = CATEGORY_TREE.map((cat) => ({
    key: cat.key,
    icon: cat.icon,
    label: (
      <span>
        {cat.label}
        {cat.key === "all" && totalCount > 0 && (
          <Badge count={totalCount} style={{ marginLeft: 8, backgroundColor: "#1890ff" }} size="small" />
        )}
      </span>
    ),
    children: cat.children?.map((sub) => ({
      key: sub.key,
      label: sub.label,
    })),
  }));

  return (
    <Card size="small" title={<><FilterOutlined /> 资产分类</>} bodyStyle={{ padding: 0 }}>
      <Menu
        mode="inline"
        selectedKeys={[selectedCategory]}
        defaultOpenKeys={["MODEL", "DATASET"]}
        onClick={({ key }) => onSelect(key)}
        items={menuItems}
        style={{ border: "none" }}
      />
    </Card>
  );
}
