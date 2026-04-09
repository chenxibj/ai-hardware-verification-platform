/**
 * @file CommunityResources.js
 * @description 免费资源下载页面 — 卡片网格展示 (#178 US-3.2, #289 fix)
 * @fix #289 对无 filePath 的资源禁用下载，有 sourceUrl 改为跳转源地址
 */
import React, { useState, useEffect } from "react";
import {
  Card, Row, Col, Tag, Space, Typography, Spin, message, Input,
  Select, Button, Empty, Statistic, Tooltip,
} from "antd";
import {
  SearchOutlined, FileImageOutlined,
  CodeOutlined, DatabaseOutlined, BookOutlined, FileTextOutlined,
  DownloadOutlined, FilterOutlined, AppstoreOutlined,
  LinkOutlined, StopOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Text, Title, Paragraph } = Typography;

const RESOURCE_CATEGORIES = [
  { key: "BENCHMARK_IMAGE", label: "基准镜像", icon: <FileImageOutlined />, color: "#1890ff" },
  { key: "EVAL_SCRIPT", label: "评测脚本", icon: <CodeOutlined />, color: "#52c41a" },
  { key: "BASELINE_DATA", label: "基准值数据", icon: <DatabaseOutlined />, color: "#722ed1" },
  { key: "BEST_PRACTICE", label: "最佳实践", icon: <BookOutlined />, color: "#fa8c16" },
  { key: "REPORT_TEMPLATE", label: "报告模板", icon: <FileTextOutlined />, color: "#eb2f96" },
];

const CATEGORY_MAP = Object.fromEntries(RESOURCE_CATEGORIES.map(c => [c.key, c]));

function formatFileSize(bytes) {
  if (!bytes) return "N/A";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(1)} ${units[i]}`;
}

/** #289: Determine action button for a resource */
function getResourceAction(resource) {
  if (resource.filePath) return "download";
  if (resource.sourceUrl) return "link";
  return "disabled";
}

export default function CommunityResources() {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [downloading, setDownloading] = useState(null);

  const fetchResources = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.keyword = search;
      if (categoryFilter) params.category = categoryFilter;
      const r = await api.get("/community/resources", { params });
      if (r.data.code === 0) setResources(r.data.data || []);
    } catch (e) {
      message.error("获取资源列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchResources(); }, []);

  const handleDownload = async (resource) => {
    setDownloading(resource.id);
    try {
      const r = await api.get(`/community/resources/${resource.id}/download`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", resource.fileName || resource.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success("下载成功");
      fetchResources();
    } catch (e) {
      message.error("下载失败");
    } finally {
      setDownloading(null);
    }
  };

  /** #289: Open source URL in new tab */
  const handleOpenSource = (resource) => {
    window.open(resource.sourceUrl, "_blank", "noopener,noreferrer");
  };

  /** #289: Render the action button based on resource availability */
  const renderActionButton = (resource) => {
    const action = getResourceAction(resource);
    if (action === "download") {
      return (
        <Button
          type="link"
          icon={<DownloadOutlined />}
          loading={downloading === resource.id}
          onClick={() => handleDownload(resource)}
        >
          下载
        </Button>
      );
    }
    if (action === "link") {
      return (
        <Button
          type="link"
          icon={<LinkOutlined />}
          onClick={() => handleOpenSource(resource)}
        >
          跳转源地址
        </Button>
      );
    }
    return (
      <Tooltip title="该资源暂无可下载文件">
        <Button type="link" icon={<StopOutlined />} disabled>
          暂无文件
        </Button>
      </Tooltip>
    );
  };

  return (
    <div>
      {/* Header Stats */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {RESOURCE_CATEGORIES.map(cat => {
          const count = resources.filter(r => r.category === cat.key).length;
          return (
            <Col xs={12} sm={8} md={4} lg={4} key={cat.key}>
              <Card size="small" hoverable
                onClick={() => setCategoryFilter(cat.key === categoryFilter ? null : cat.key)}
                style={{
                  borderColor: categoryFilter === cat.key ? cat.color : undefined,
                  cursor: "pointer",
                }}>
                <Statistic
                  title={<span style={{ fontSize: 12 }}>{cat.label}</span>}
                  value={count}
                  prefix={React.cloneElement(cat.icon, { style: { color: cat.color } })}
                  valueStyle={{ fontSize: 20 }}
                />
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* Search & Filter */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索资源..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onPressEnter={fetchResources}
            style={{ width: 240 }}
            allowClear
          />
          <Select
            placeholder="分类筛选"
            allowClear
            style={{ width: 140 }}
            value={categoryFilter}
            onChange={v => setCategoryFilter(v)}
            options={RESOURCE_CATEGORIES.map(c => ({ value: c.key, label: c.label }))}
          />
          <Button icon={<FilterOutlined />} onClick={fetchResources}>查询</Button>
        </Space>
      </Card>

      {/* Resource Cards Grid */}
      <Spin spinning={loading}>
        {resources.length === 0 && !loading ? (
          <Empty description="暂无资源" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Row gutter={[16, 16]}>
            {resources.map(resource => {
              const cat = CATEGORY_MAP[resource.category] || {
                label: resource.category, icon: <AppstoreOutlined />, color: "#999",
              };
              return (
                <Col xs={24} sm={12} md={8} lg={6} key={resource.id}>
                  <Card
                    hoverable
                    style={{ height: "100%" }}
                    actions={[renderActionButton(resource)]}
                  >
                    <div style={{ textAlign: "center", marginBottom: 12 }}>
                      <div style={{
                        width: 56, height: 56, borderRadius: 12,
                        background: `${cat.color}15`, display: "inline-flex",
                        alignItems: "center", justifyContent: "center",
                      }}>
                        {React.cloneElement(cat.icon, { style: { fontSize: 28, color: cat.color } })}
                      </div>
                    </div>
                    <Title level={5} ellipsis={{ rows: 1 }} style={{ textAlign: "center", marginBottom: 8 }}>
                      {resource.name}
                    </Title>
                    <Paragraph type="secondary" ellipsis={{ rows: 2 }}
                      style={{ textAlign: "center", fontSize: 12, minHeight: 36 }}>
                      {resource.description || "暂无描述"}
                    </Paragraph>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
                      <Tag color={cat.color} style={{ fontSize: 11 }}>{cat.label}</Tag>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {formatFileSize(resource.fileSize)}
                      </Text>
                    </div>
                    <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
                      <Space>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          <DownloadOutlined /> {resource.downloadCount || 0}
                        </Text>
                      </Space>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Spin>
    </div>
  );
}
