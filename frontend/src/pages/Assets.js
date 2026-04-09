/**
 * @file Assets.js
 * @description 数字资产管理主页面 — 统计卡片 + 分类导航 + 列表 + 详情/上传子页面路由
 * @feat #259 #260 #261 #263 #264
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Space, Button, Input, Select, Row, Col, Spin, Badge, Modal, message,
} from "antd";
import {
  SearchOutlined, CloudUploadOutlined, PlusOutlined,
  ReloadOutlined, UnorderedListOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import { ASSET_TYPES } from "./assets/constants";
import AssetStatsBar from "./assets/AssetStatsBar";
import AssetCategoryNav from "./assets/AssetCategoryNav";
import AssetTable from "./assets/AssetTable";
import QuickUploadModal from "./assets/QuickUploadModal";
import AssetDetail from "./AssetDetail";
import AssetUpload from "./AssetUpload";

const SUB_PAGE = { LIST: "list", DETAIL: "detail", UPLOAD: "upload" };

export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("all");

  const [subPage, setSubPage] = useState(SUB_PAGE.LIST);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [quickUploadVisible, setQuickUploadVisible] = useState(false);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = { size: 100 };
      if (searchText) params.keyword = searchText;
      // 分类导航和下拉筛选都影响 assetType 参数
      const effectiveType = typeFilter || (selectedCategory !== "all" ? selectedCategory.split(":")[0] : null);
      if (effectiveType) params.assetType = effectiveType;
      const res = await api.get("/assets", { params });
      if (res.data.code === 0) setAssets(res.data.data || []);
    } catch (e) {
      message.error("获取资产列表失败");
    } finally {
      setLoading(false);
    }
  }, [searchText, typeFilter, selectedCategory]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get("/assets/stats");
      if (res.data.code === 0) setStats(res.data.data || {});
    } catch (e) {
      /* stats 失败不阻塞页面 */
    }
  }, []);

  useEffect(() => { fetchAssets(); fetchStats(); }, [fetchAssets, fetchStats]);

  const handleDownload = async (record) => {
    if (!record.filePath) { message.warning("该资产没有关联文件"); return; }
    try {
      const res = await api.get(`/assets/${record.id}/download`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", record.name || "download");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      message.error("下载失败");
    }
  };

  const handleDelete = (id, name) => {
    Modal.confirm({
      title: "确定删除？",
      content: `将删除资产「${name}」`,
      okText: "删除", okType: "danger", cancelText: "取消",
      onOk: async () => {
        try {
          await api.delete(`/assets/${id}`);
          message.success("已删除");
          fetchAssets();
          fetchStats();
        } catch (e) {
          message.error(e.response?.data?.message || "删除失败");
        }
      },
    });
  };

  const handleCategoryClick = (category) => {
    setSelectedCategory(category);
    setTypeFilter(null);
  };

  const refreshAll = () => {
    setSearchText("");
    setTypeFilter(null);
    setSelectedCategory("all");
  };

  const backToList = () => {
    setSubPage(SUB_PAGE.LIST);
    setSelectedAssetId(null);
    fetchAssets();
    fetchStats();
  };

  // --- 子页面路由 ---
  if (subPage === SUB_PAGE.DETAIL && selectedAssetId) {
    return <AssetDetail assetId={selectedAssetId} onBack={backToList} />;
  }
  if (subPage === SUB_PAGE.UPLOAD) {
    return <AssetUpload onBack={backToList} onSuccess={backToList} />;
  }

  const typeOptions = Object.entries(ASSET_TYPES)
    .filter(([k]) => ["MODEL", "DATASET", "OPERATOR", "SCRIPT", "TEMPLATE"].includes(k))
    .map(([k, v]) => ({ value: k, label: v.label }));

  return (
    <Spin spinning={loading && assets.length === 0}>
      <AssetStatsBar stats={stats} onCategoryClick={handleCategoryClick} />

      <Row gutter={16}>
        <Col xs={24} md={5} lg={4}>
          <AssetCategoryNav
            selectedCategory={selectedCategory}
            totalCount={Number(stats.total) || 0}
            onSelect={handleCategoryClick}
          />
        </Col>

        <Col xs={24} md={19} lg={20}>
          <Card
            title={
              <Space>
                <UnorderedListOutlined />
                <span>
                  {selectedCategory === "all" ? "全部资产" :
                    (ASSET_TYPES[selectedCategory.split(":")[0]]?.label || selectedCategory)}
                </span>
                <Badge count={assets.length} style={{ backgroundColor: "#1890ff" }} size="small" />
              </Space>
            }
            extra={
              <Space wrap>
                <Input placeholder="搜索资产..." prefix={<SearchOutlined />}
                  value={searchText} onChange={(e) => setSearchText(e.target.value)}
                  onPressEnter={fetchAssets} style={{ width: 180 }} allowClear />
                <Select placeholder="类型" allowClear style={{ width: 110 }}
                  value={typeFilter} onChange={setTypeFilter} options={typeOptions} />
                <Button icon={<SearchOutlined />} onClick={fetchAssets}>查询</Button>
                <Button icon={<ReloadOutlined />} onClick={refreshAll} />
                <Button type="primary" icon={<CloudUploadOutlined />}
                  onClick={() => setSubPage(SUB_PAGE.UPLOAD)}>上传资产</Button>
                <Button icon={<PlusOutlined />}
                  onClick={() => setQuickUploadVisible(true)}>快速创建</Button>
              </Space>
            }
          >
            <AssetTable
              assets={assets}
              loading={loading}
              onView={(id) => { setSelectedAssetId(id); setSubPage(SUB_PAGE.DETAIL); }}
              onDownload={handleDownload}
              onDelete={handleDelete}
            />
          </Card>
        </Col>
      </Row>

      <QuickUploadModal
        visible={quickUploadVisible}
        onClose={() => setQuickUploadVisible(false)}
        onSuccess={() => { setQuickUploadVisible(false); fetchAssets(); fetchStats(); }}
      />
    </Spin>
  );
}
