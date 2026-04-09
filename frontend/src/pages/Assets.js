/**
 * @file Assets.js
 * @description 数字资产管理主页面 — 统计卡片 + 搜索 + 分类导航 + 列表
 * @feat #259 #260 #261 #263 #264 #265 #267
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card, Space, Button, Row, Col, Spin, Badge, Modal, message,
} from "antd";
import {
  CloudUploadOutlined, PlusOutlined,
  ReloadOutlined, UnorderedListOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import { ASSET_TYPES } from "./assets/constants";
import AssetStatsBar from "./assets/AssetStatsBar";
import AssetCategoryNav from "./assets/AssetCategoryNav";
import AssetTable from "./assets/AssetTable";
import AssetSearchBar from "./assets/AssetSearchBar";
import QuickUploadModal from "./assets/QuickUploadModal";
import AssetDetail from "./AssetDetail";
import AssetUpload from "./AssetUpload";
import { filterAssets } from "./assets/searchFilter";
import { getAssetReuseCounts, initDemoReuseData } from "./assets/reuseStore";

const SUB_PAGE = { LIST: "list", DETAIL: "detail", UPLOAD: "upload" };

export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [searchFilters, setSearchFilters] = useState({});
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [reuseCounts, setReuseCounts] = useState({});

  const [subPage, setSubPage] = useState(SUB_PAGE.LIST);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [quickUploadVisible, setQuickUploadVisible] = useState(false);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = { size: 100 };
      const effectiveType = selectedCategory !== "all"
        ? selectedCategory.split(":")[0] : null;
      if (effectiveType) params.assetType = effectiveType;
      const res = await api.get("/assets", { params });
      if (res.data.code === 0) {
        const data = res.data.data || [];
        setAssets(data);
        initDemoReuseData(data);
        setReuseCounts(getAssetReuseCounts());
      }
    } catch {
      message.error("获取资产列表失败");
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get("/assets/stats");
      if (res.data.code === 0) setStats(res.data.data || {});
    } catch {
      /* stats 失败不阻塞页面 */
    }
  }, []);

  useEffect(() => { fetchAssets(); fetchStats(); }, [fetchAssets, fetchStats]);

  /** 前端多条件 AND 过滤 */
  const filteredAssets = useMemo(
    () => filterAssets(assets, searchFilters),
    [assets, searchFilters]
  );

  const handleSearch = (values) => {
    setSearchFilters(values || {});
  };

  const handleSearchReset = () => {
    setSearchFilters({});
  };

  /** 下载资产：优先服务端文件，无文件时跳转源地址 */
  const handleDownload = async (record) => {
    if (record.filePath) {
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
      } catch {
        message.error("下载失败");
      }
    } else if (record.sourceUrl) {
      window.open(record.sourceUrl, "_blank");
      message.info("已跳转到资源源地址");
    } else {
      message.warning("该资产暂无可下载文件");
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
  };

  const refreshAll = () => {
    setSearchFilters({});
    setSelectedCategory("all");
    fetchAssets();
    fetchStats();
  };

  const backToList = () => {
    setSubPage(SUB_PAGE.LIST);
    setSelectedAssetId(null);
    fetchAssets();
    fetchStats();
  };

  if (subPage === SUB_PAGE.DETAIL && selectedAssetId) {
    return <AssetDetail assetId={selectedAssetId} onBack={backToList} />;
  }
  if (subPage === SUB_PAGE.UPLOAD) {
    return <AssetUpload onBack={backToList} onSuccess={backToList} />;
  }

  return (
    <Spin spinning={loading && assets.length === 0}>
      <AssetStatsBar stats={stats} onCategoryClick={handleCategoryClick} />

      {/* 多条件搜索栏 #265 */}
      <AssetSearchBar onSearch={handleSearch} onReset={handleSearchReset} />

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
                <Badge count={filteredAssets.length} style={{ backgroundColor: "#1890ff" }} size="small" />
              </Space>
            }
            extra={
              <Space wrap>
                <Button icon={<ReloadOutlined />} onClick={refreshAll}>刷新</Button>
                <Button type="primary" icon={<CloudUploadOutlined />}
                  onClick={() => setSubPage(SUB_PAGE.UPLOAD)}>上传资产</Button>
                <Button icon={<PlusOutlined />}
                  onClick={() => setQuickUploadVisible(true)}>快速创建</Button>
              </Space>
            }
          >
            <AssetTable
              assets={filteredAssets}
              loading={loading}
              reuseCounts={reuseCounts}
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
