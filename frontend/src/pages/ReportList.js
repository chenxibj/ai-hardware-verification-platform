/**
 * @file ReportList.js
 * @description 评测报告查看与管理 — 列表 + 筛选 + 搜索 + 多选对比
 * Issue: #169
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Card, Table, Tag, Button, Space, Input, Select, Slider, Row, Col,
  Typography, message, Popconfirm, Badge, Tooltip,
} from "antd";
import {
  EyeOutlined, DeleteOutlined, DownloadOutlined,
  SearchOutlined, FilterOutlined, SwapOutlined,
  StarFilled, FileTextOutlined, ReloadOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Title, Text } = Typography;
const { Option } = Select;

/* 评级 */
function scoreGrade(score) {
  if (score >= 90) return { stars: 5, text: "卓越", color: "#52c41a" };
  if (score >= 80) return { stars: 4, text: "优秀", color: "#1890ff" };
  if (score >= 70) return { stars: 3, text: "良好", color: "#13c2c2" };
  if (score >= 60) return { stars: 2, text: "一般", color: "#faad14" };
  return { stars: 1, text: "待改进", color: "#ff4d4f" };
}
function renderStars(count) {
  return Array.from({ length: 5 }, (_, i) => (
    <StarFilled key={i} style={{ color: i < count ? "#fadb14" : "#e8e8e8", fontSize: 14, marginRight: 1 }} />
  ));
}

const STATUS_MAP = {
  DRAFT: { text: "草稿", color: "default" },
  PUBLISHED: { text: "已完成", color: "success" },
  GENERATING: { text: "生成中", color: "processing" },
};

export default function ReportList({ onViewReport, onCompareReports }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState(undefined);
  const [scoreRange, setScoreRange] = useState([0, 100]);
  const [keyword, setKeyword] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [chipMap, setChipMap] = useState({});
  const [planMap, setPlanMap] = useState({});

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, size: pageSize };
      if (statusFilter) params.status = statusFilter;
      if (scoreRange[0] > 0) params.minScore = scoreRange[0];
      if (scoreRange[1] < 100) params.maxScore = scoreRange[1];
      if (keyword.trim()) params.keyword = keyword.trim();

      const res = await api.get("/chip-reports", { params });
      if (res.data?.code === 0) {
        const reports = res.data.data || [];
        setData(reports);
        setTotal(res.data.total || 0);

        // Fetch chip and plan names for display
        const chipIds = [...new Set(reports.map(r => r.chipId).filter(Boolean))];
        const planIds = [...new Set(reports.map(r => r.planId).filter(Boolean))];

        const newChipMap = { ...chipMap };
        const newPlanMap = { ...planMap };

        await Promise.all([
          ...chipIds.filter(id => !newChipMap[id]).map(id =>
            api.get("/chips/" + id).then(cr => {
              if (cr.data?.code === 0) newChipMap[id] = cr.data.data?.name || "芯片#" + id;
            }).catch(() => { newChipMap[id] = "芯片#" + id; })
          ),
          ...planIds.filter(id => !newPlanMap[id]).map(id =>
            api.get("/plans/" + id).then(pr => {
              if (pr.data?.code === 0) newPlanMap[id] = pr.data.data?.name || "计划#" + id;
            }).catch(() => { newPlanMap[id] = "计划#" + id; })
          ),
        ]);
        setChipMap(newChipMap);
        setPlanMap(newPlanMap);
      }
    } catch (e) {
      message.error("加载报告列表失败");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, scoreRange, keyword]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleDelete = async (id) => {
    try {
      const res = await api.delete("/chip-reports/" + id);
      if (res.data?.code === 0) {
        message.success("报告已删除");
        fetchReports();
      } else {
        message.error(res.data?.message || "删除失败");
      }
    } catch (e) {
      message.error("删除失败");
    }
  };

  const handleExportPdf = (record) => {
    if (onViewReport) {
      // Navigate to report page where PDF export already exists
      onViewReport(record.id);
    }
  };

  const handleCompare = () => {
    if (selectedRowKeys.length < 2) {
      message.warning("请至少选择2份报告进行对比");
      return;
    }
    if (selectedRowKeys.length > 4) {
      message.warning("最多支持4份报告对比");
      return;
    }
    if (onCompareReports) {
      onCompareReports(selectedRowKeys);
    }
  };

  const columns = [
    {
      title: "报告编号", dataIndex: "reportNo", key: "reportNo", width: 180,
      render: (text) => (
        <Space><FileTextOutlined style={{ color: "#1890ff" }} /><Text strong>{text}</Text></Space>
      ),
    },
    {
      title: "芯片名称", key: "chipName", width: 140,
      render: (_, r) => chipMap[r.chipId] || "芯片#" + r.chipId,
    },
    {
      title: "计划名称", key: "planName", width: 140,
      render: (_, r) => planMap[r.planId] || "计划#" + r.planId,
    },
    {
      title: "综合评分", dataIndex: "overallScore", key: "overallScore", width: 110, align: "center",
      sorter: (a, b) => (a.overallScore || 0) - (b.overallScore || 0),
      render: (v) => {
        const score = v || 0;
        const color = score >= 80 ? "#52c41a" : score >= 60 ? "#1890ff" : score >= 40 ? "#faad14" : "#ff4d4f";
        return <span style={{ fontSize: 18, fontWeight: "bold", color }}>{score.toFixed(1)}</span>;
      },
    },
    {
      title: "评级", key: "grade", width: 130, align: "center",
      render: (_, r) => {
        const grade = scoreGrade(r.overallScore || 0);
        return (
          <Tooltip title={grade.text}>
            <span>{renderStars(grade.stars)}</span>
          </Tooltip>
        );
      },
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 100, align: "center",
      render: (s) => {
        const cfg = STATUS_MAP[s] || { text: s, color: "default" };
        return <Badge status={cfg.color === "success" ? "success" : cfg.color === "processing" ? "processing" : "default"} text={cfg.text} />;
      },
    },
    {
      title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 170,
      sorter: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      render: (t) => t ? new Date(t).toLocaleString("zh-CN") : "-",
    },
    {
      title: "操作", key: "action", width: 200, fixed: "right",
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />}
            onClick={() => onViewReport && onViewReport(record.id)}>查看</Button>
          <Button type="link" size="small" icon={<DownloadOutlined />}
            onClick={() => handleExportPdf(record)}>PDF</Button>
          <Popconfirm title="确定删除此报告？" onConfirm={() => handleDelete(record.id)}
            okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 12]} align="middle">
          <Col flex="auto">
            <Title level={4} style={{ margin: 0 }}>
              <FileTextOutlined /> 评测报告管理
            </Title>
          </Col>
          <Col>
            <Space>
              <Badge count={selectedRowKeys.length} size="small">
                <Button icon={<SwapOutlined />} disabled={selectedRowKeys.length < 2}
                  onClick={handleCompare} type={selectedRowKeys.length >= 2 ? "primary" : "default"}>
                  对比分析 {selectedRowKeys.length > 0 ? `(${selectedRowKeys.length})` : ""}
                </Button>
              </Badge>
              <Button icon={<ReloadOutlined />} onClick={fetchReports}>刷新</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card style={{ marginBottom: 16 }} size="small">
        <Row gutter={[16, 12]} align="middle">
          <Col xs={24} sm={8} md={6}>
            <Input placeholder="搜索报告编号或芯片名" prefix={<SearchOutlined />}
              value={keyword} onChange={e => setKeyword(e.target.value)}
              onPressEnter={() => { setPage(0); fetchReports(); }}
              allowClear />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select placeholder="状态筛选" style={{ width: "100%" }} allowClear
              value={statusFilter} onChange={v => { setStatusFilter(v); setPage(0); }}>
              <Option value="PUBLISHED">已完成</Option>
              <Option value="DRAFT">草稿</Option>
            </Select>
          </Col>
          <Col xs={24} sm={10} md={8}>
            <Space>
              <FilterOutlined />
              <Text type="secondary" style={{ fontSize: 12 }}>评分:</Text>
              <Slider range min={0} max={100} value={scoreRange}
                onChange={v => setScoreRange(v)}
                onAfterChange={() => { setPage(0); }}
                style={{ width: 160 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>{scoreRange[0]}-{scoreRange[1]}</Text>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1100 }}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => {
              if (keys.length > 4) {
                message.warning("最多选择4份报告");
                return;
              }
              setSelectedRowKeys(keys);
            },
          }}
          pagination={{
            current: page + 1,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, s) => { setPage(p - 1); setPageSize(s); },
          }}
        />
      </Card>
    </div>
  );
}
