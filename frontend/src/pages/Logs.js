/**
 * @file Logs.js
 * @description 全局日志中心 — 从 task_logs 查询，多维过滤 + 无限滚动分页
 * Issue: #246
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Card, Tag, Space, Button, Row, Col, Statistic, Select, Input,
  message, Spin, DatePicker, Empty, Typography, Tooltip,
} from "antd";
import {
  FileSearchOutlined, ReloadOutlined, WarningOutlined,
  CloseCircleOutlined, CalendarOutlined, SearchOutlined,
  ArrowDownOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";

const { Text } = Typography;
const { RangePicker } = DatePicker;

const LEVEL_COLORS = { INFO: "blue", WARN: "orange", ERROR: "red", DEBUG: "default" };
const TYPE_COLORS = { METRIC: "purple", PROGRESS: "cyan", SYSTEM: "green", ERROR: "red", TEXT: "default", EVAL: "geekblue" };

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats] = useState({ total: 0, error: 0, warn: 0, today: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [planId, setPlanId] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [levelFilter, setLevelFilter] = useState(null);
  const [typeFilter, setTypeFilter] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [dateRange, setDateRange] = useState(null);

  const listRef = useRef(null);
  const PAGE_SIZE = 50;

  const fetchStats = useCallback(async () => {
    try {
      const r = await api.get("/logs/global/stats");
      if (r.data.code === 0) setStats(r.data.data);
    } catch (e) {
      console.error("fetchStats error", e);
    }
  }, []);

  const fetchLogs = useCallback(async (page = 0, append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const params = { size: PAGE_SIZE, page };
      if (planId) params.planId = planId;
      if (taskId) params.taskId = taskId;
      if (levelFilter) params.level = levelFilter;
      if (typeFilter) params.logType = typeFilter;
      if (searchText) params.search = searchText;
      if (dateRange && dateRange[0]) params.startTime = dateRange[0].toISOString();
      if (dateRange && dateRange[1]) params.endTime = dateRange[1].toISOString();

      const r = await api.get("/logs/global", { params });
      if (r.data.code === 0) {
        const data = r.data.data;
        const items = data.items || [];
        if (append) {
          setLogs(prev => [...prev, ...items]);
        } else {
          setLogs(items);
        }
        setHasMore(data.hasMore);
        setTotalCount(data.total);
        setCurrentPage(page);
      }
    } catch (e) {
      message.error("获取日志失败");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [planId, taskId, levelFilter, typeFilter, searchText, dateRange]);

  useEffect(() => {
    fetchLogs(0, false);
    fetchStats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    fetchLogs(0, false);
    fetchStats();
  };

  const handleLoadMore = () => {
    if (!hasMore || loadingMore) return;
    fetchLogs(currentPage + 1, true);
  };

  const handleReset = () => {
    setPlanId(null);
    setTaskId(null);
    setLevelFilter(null);
    setTypeFilter(null);
    setSearchText("");
    setDateRange(null);
    // Will trigger re-fetch via useEffect
    setTimeout(() => {
      fetchLogs(0, false);
      fetchStats();
    }, 0);
  };

  /* ── Infinite scroll handler ── */
  const handleScroll = useCallback((e) => {
    const el = e.target;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
      if (hasMore && !loadingMore) {
        handleLoadMore();
      }
    }
  }, [hasMore, loadingMore, currentPage]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Format timestamp ── */
  const formatTime = (ts) => {
    if (!ts) return "-";
    return dayjs(ts).format("YYYY-MM-DD HH:mm:ss");
  };

  return (
    <div>
      {/* Stats Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card hoverable>
            <Statistic title="日志总数" value={stats.total || 0} prefix={<FileSearchOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card hoverable>
            <Statistic title="错误数" value={stats.error || 0}
              valueStyle={{ color: "#ff4d4f" }} prefix={<CloseCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card hoverable>
            <Statistic title="警告数" value={stats.warn || 0}
              valueStyle={{ color: "#faad14" }} prefix={<WarningOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card hoverable>
            <Statistic title="今日新增" value={stats.today || 0}
              valueStyle={{ color: "#1890ff" }} prefix={<CalendarOutlined />} />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap size="middle">
          <Input
            placeholder="Plan ID"
            style={{ width: 100 }}
            value={planId || ""}
            onChange={e => setPlanId(e.target.value ? Number(e.target.value) : null)}
            allowClear
            type="number"
          />
          <Input
            placeholder="Task ID"
            style={{ width: 100 }}
            value={taskId || ""}
            onChange={e => setTaskId(e.target.value ? Number(e.target.value) : null)}
            allowClear
            type="number"
          />
          <Select
            placeholder="日志级别"
            allowClear
            style={{ width: 110 }}
            value={levelFilter}
            onChange={setLevelFilter}
            options={[
              { value: "INFO", label: "INFO" },
              { value: "WARN", label: "WARN" },
              { value: "ERROR", label: "ERROR" },
              { value: "DEBUG", label: "DEBUG" },
            ]}
          />
          <Select
            placeholder="日志类型"
            allowClear
            style={{ width: 120 }}
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "TEXT", label: "TEXT" },
              { value: "SYSTEM", label: "SYSTEM" },
              { value: "EVAL", label: "EVAL" },
              { value: "METRIC", label: "METRIC" },
              { value: "PROGRESS", label: "PROGRESS" },
            ]}
          />
          <Input
            placeholder="搜索关键字..."
            prefix={<SearchOutlined />}
            style={{ width: 180 }}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            onPressEnter={handleSearch}
            allowClear
          />
          <RangePicker
            showTime
            value={dateRange}
            onChange={setDateRange}
            style={{ width: 340 }}
          />
          <Button type="primary" onClick={handleSearch}>查询</Button>
          <Button onClick={handleReset}>重置</Button>
          <Button icon={<ReloadOutlined />} onClick={handleSearch}>刷新</Button>
        </Space>
      </Card>

      {/* Log List */}
      <Card
        title={
          <Space>
            <span>全局日志</span>
            <Text type="secondary" style={{ fontSize: 12 }}>
              共 {totalCount} 条 {hasMore ? "(上滑加载更多)" : ""}
            </Text>
          </Space>
        }
      >
        <Spin spinning={loading}>
          <div
            ref={listRef}
            onScroll={handleScroll}
            style={{
              maxHeight: 600,
              overflowY: "auto",
              background: "#fafafa",
              border: "1px solid #e8e8e8",
              borderRadius: 6,
            }}
          >
            {logs.length === 0 && !loading ? (
              <Empty description="暂无日志" style={{ padding: 40 }} />
            ) : (
              logs.map((log, i) => {
                const level = (log.level || "INFO").toUpperCase();
                const logType = (log.logType || log.log_type || "TEXT").toUpperCase();

                let rowStyle = {
                  padding: "8px 12px",
                  borderBottom: "1px solid #f0f0f0",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', Consolas, Monaco, monospace",
                };
                if (level === "ERROR") {
                  rowStyle.background = "#fff2f0";
                  rowStyle.borderLeft = "3px solid #ff4d4f";
                } else if (level === "WARN") {
                  rowStyle.background = "#fff7e6";
                  rowStyle.borderLeft = "3px solid #fa8c16";
                } else {
                  rowStyle.borderLeft = "3px solid transparent";
                }

                return (
                  <div key={log.id || i} style={rowStyle}>
                    <span style={{ color: "#999", whiteSpace: "nowrap", minWidth: 140 }}>
                      {formatTime(log.createdAt || log.created_at)}
                    </span>
                    <Tag color={LEVEL_COLORS[level] || "default"} style={{ minWidth: 50, textAlign: "center" }}>
                      {level}
                    </Tag>
                    <Tag color={TYPE_COLORS[logType] || "default"} style={{ minWidth: 70, textAlign: "center" }}>
                      {logType}
                    </Tag>
                    <Tooltip title={`Plan: ${log.planId || '-'} / Task: ${log.taskId || '-'}`}>
                      <span style={{ color: "#999", whiteSpace: "nowrap" }}>
                        P{log.planId || '-'}/T{log.taskId || '-'}
                      </span>
                    </Tooltip>
                    <span style={{ flex: 1, wordBreak: "break-all", color: level === "ERROR" ? "#cf1322" : "#333" }}>
                      {log.message || log.content || ""}
                    </span>
                  </div>
                );
              })
            )}

            {/* Load more indicator */}
            {loadingMore && (
              <div style={{ textAlign: "center", padding: 16 }}>
                <Spin size="small" /> <Text type="secondary" style={{ marginLeft: 8 }}>加载更多...</Text>
              </div>
            )}

            {hasMore && !loadingMore && (
              <div style={{ textAlign: "center", padding: 12 }}>
                <Button size="small" icon={<ArrowDownOutlined />} onClick={handleLoadMore}>
                  加载更多
                </Button>
              </div>
            )}

            {!hasMore && logs.length > 0 && (
              <div style={{ textAlign: "center", padding: 12, color: "#999" }}>
                — 已加载全部日志 —
              </div>
            )}
          </div>
        </Spin>
      </Card>
    </div>
  );
}
