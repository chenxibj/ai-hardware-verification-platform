/**
 * @file TaskExecutionLogs.js
 * @description 任务执行日志组件 — 分页 + 过滤 + 行号
 * #225, #248: 分页重构 + 行号显示
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Spin, Button, Space, Tag, Select, Input, Pagination, Typography, Tooltip } from "antd";
import {
  ReloadOutlined, DownloadOutlined, SearchOutlined,
  VerticalAlignBottomOutlined, PauseOutlined, CaretRightOutlined,
} from "@ant-design/icons";
import api from "../../utils/api";

const { Text } = Typography;

const PAGE_SIZE = 50;
const POLL_INTERVAL = 5000;

const LEVEL_COLORS = {
  ERROR: "#ff4d4f", WARN: "#fa8c16", DEBUG: "#999", INFO: "#1890ff",
};
const LEVEL_BG = {
  ERROR: "#fff2f0", WARN: "#fff7e6",
};
const TYPE_COLORS = {
  METRIC: "#722ed1", PROGRESS: "#13c2c2", SYSTEM: "#52c41a", ERROR: "#ff4d4f",
};

function formatTimestamp(ts) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleString("zh-CN", { hour12: false }).replace(/\//g, "-");
  } catch (e) {
    return String(ts).substring(0, 19);
  }
}

export default function TaskExecutionLogs({ taskId, taskStatus }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [currentPage, setCurrentPage] = useState(1); // 1-indexed for antd
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [searchText, setSearchText] = useState("");
  const containerRef = useRef(null);
  const timerRef = useRef(null);

  const isRunning = taskStatus === "RUNNING" || taskStatus === "QUEUED";

  const fetchLogs = useCallback(async (page = currentPage) => {
    if (!taskId) return;
    try {
      setLoading(true);
      const params = {
        page: page - 1, // backend is 0-indexed
        size: PAGE_SIZE,
      };
      if (levelFilter !== "ALL") params.level = levelFilter;
      if (typeFilter !== "ALL") params.type = typeFilter;
      if (searchText) params.keyword = searchText;

      const r = await api.get(`/tasks/${taskId}/logs/page`, { params });
      if (r.data.code === 0 && r.data.data) {
        const d = r.data.data;
        setLogs(d.items || []);
        setTotalCount(d.total || 0);
        setTotalPages(d.totalPages || 0);
      }
    } catch (e) {
      console.error("fetchLogs error", e);
    } finally {
      setLoading(false);
    }
  }, [taskId, currentPage, levelFilter, typeFilter, searchText]);

  // Auto-scroll when on last page
  useEffect(() => {
    if (containerRef.current && autoRefresh && currentPage === totalPages) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoRefresh, currentPage, totalPages]);

  // Initial fetch + polling
  useEffect(() => {
    fetchLogs(currentPage);
  }, [taskId, currentPage, levelFilter, typeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling for running tasks — always stay on last page
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (isRunning && autoRefresh) {
      timerRef.current = setInterval(() => {
        // When auto-refreshing, jump to last page to see latest
        fetchLogs(currentPage).then(() => {
          // If total pages changed, jump to last page
        });
      }, POLL_INTERVAL);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, autoRefresh, currentPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // When totalPages increases during auto-refresh, jump to last page
  useEffect(() => {
    if (autoRefresh && isRunning && totalPages > 0 && currentPage < totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleSearch = () => {
    setCurrentPage(1);
    fetchLogs(1);
  };

  const handleDownload = () => {
    if (!taskId) return;
    window.open(`/api/tasks/${taskId}/logs/download`, "_blank");
  };

  const goToLastPage = () => {
    if (totalPages > 0) {
      setCurrentPage(totalPages);
      setAutoRefresh(true);
    }
  };

  // Line number width calculation
  const maxLineNo = (currentPage - 1) * PAGE_SIZE + logs.length;
  const lineNoWidth = Math.max(String(maxLineNo).length * 9 + 16, 40);

  return (
    <div>
      {/* Toolbar */}
      <Space style={{ marginBottom: 8 }} wrap>
        {isRunning && (
          <Tag
            color={autoRefresh ? "green" : "default"}
            style={{ cursor: "pointer" }}
            onClick={() => setAutoRefresh(!autoRefresh)}
            icon={autoRefresh ? <CaretRightOutlined /> : <PauseOutlined />}
          >
            {autoRefresh ? "实时刷新中" : "已暂停刷新"}
          </Tag>
        )}
        <Select
          value={levelFilter}
          onChange={(v) => { setLevelFilter(v); setCurrentPage(1); }}
          style={{ width: 100 }}
          size="small"
        >
          <Select.Option value="ALL">全部级别</Select.Option>
          <Select.Option value="INFO">INFO</Select.Option>
          <Select.Option value="WARN">WARN</Select.Option>
          <Select.Option value="ERROR">ERROR</Select.Option>
          <Select.Option value="DEBUG">DEBUG</Select.Option>
        </Select>
        <Select
          value={typeFilter}
          onChange={(v) => { setTypeFilter(v); setCurrentPage(1); }}
          style={{ width: 110 }}
          size="small"
        >
          <Select.Option value="ALL">全部类型</Select.Option>
          <Select.Option value="TEXT">TEXT</Select.Option>
          <Select.Option value="SYSTEM">SYSTEM</Select.Option>
          <Select.Option value="EVAL">EVAL</Select.Option>
          <Select.Option value="METRIC">METRIC</Select.Option>
          <Select.Option value="PROGRESS">PROGRESS</Select.Option>
        </Select>
        <Input
          placeholder="搜索日志..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 160 }}
          size="small"
          allowClear
        />
        <Button size="small" icon={<ReloadOutlined />} onClick={() => fetchLogs(currentPage)} loading={loading}>
          刷新
        </Button>
        {logs.length > 0 && (
          <Button size="small" icon={<DownloadOutlined />} onClick={handleDownload}>
            下载
          </Button>
        )}
        {totalPages > 1 && currentPage !== totalPages && (
          <Button size="small" icon={<VerticalAlignBottomOutlined />} onClick={goToLastPage}>
            跳到最新
          </Button>
        )}
        <Text type="secondary" style={{ fontSize: 12 }}>
          共 {totalCount} 条日志
        </Text>
      </Space>

      {/* Log container — terminal style with line numbers */}
      <div
        ref={containerRef}
        style={{
          background: "#1e1e1e",
          borderRadius: 8,
          minHeight: 200,
          maxHeight: 500,
          overflow: "auto",
          fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.7,
        }}
      >
        {loading && logs.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Spin tip="加载日志中..." />
          </div>
        ) : logs.length > 0 ? (
          logs.map((log, idx) => {
            const lineNo = (currentPage - 1) * PAGE_SIZE + idx + 1;
            const level = (log.level || "INFO").toUpperCase();
            const logType = (log.logType || "TEXT").toUpperCase();
            const levelColor = LEVEL_COLORS[level] || "#d4d4d4";
            const typeColor = TYPE_COLORS[logType] || null;
            const bgColor = level === "ERROR" ? "rgba(255,77,79,0.1)"
              : level === "WARN" ? "rgba(250,140,22,0.08)" : "transparent";

            return (
              <div
                key={log.id || idx}
                style={{
                  display: "flex",
                  background: bgColor,
                  borderLeft: level === "ERROR" ? "3px solid #ff4d4f"
                    : level === "WARN" ? "3px solid #fa8c16" : "3px solid transparent",
                  minHeight: 22,
                }}
              >
                {/* Line number gutter */}
                <span
                  style={{
                    display: "inline-block",
                    width: lineNoWidth,
                    minWidth: lineNoWidth,
                    textAlign: "right",
                    paddingRight: 12,
                    paddingLeft: 8,
                    color: "#5a5a5a",
                    background: "#252526",
                    borderRight: "1px solid #333",
                    userSelect: "none",
                    flexShrink: 0,
                  }}
                >
                  {lineNo}
                </span>
                {/* Log content */}
                <span style={{ padding: "0 12px", flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#d4d4d4" }}>
                  <span style={{ color: "#6a9955" }}>{formatTimestamp(log.createdAt)}</span>
                  {" "}
                  <span style={{ color: levelColor, fontWeight: 600 }}>{"[" + level + "]"}</span>
                  {" "}
                  {logType !== "TEXT" && (
                    <span style={{ color: typeColor || "#888" }}>{"[" + logType + "] "}</span>
                  )}
                  <span>{log.message || log.content || ""}</span>
                </span>
              </div>
            );
          })
        ) : (
          <div style={{ padding: 24, textAlign: "center" }}>
            {isRunning ? (
              <div style={{ color: "#1890ff" }}>
                <div style={{ fontSize: 14, marginBottom: 4 }}>[INFO] 等待日志输出...</div>
                <div style={{ fontSize: 12, color: "#999" }}>日志将在 Agent 执行任务时实时显示</div>
              </div>
            ) : (
              <div style={{ color: "#999" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                <div style={{ fontSize: 14 }}>该任务暂无执行日志</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>任务执行后日志将在此处展示</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalCount > PAGE_SIZE && (
        <div style={{ marginTop: 12, textAlign: "center" }}>
          <Pagination
            current={currentPage}
            total={totalCount}
            pageSize={PAGE_SIZE}
            onChange={handlePageChange}
            showSizeChanger={false}
            showQuickJumper
            showTotal={(total, range) => `${range[0]}-${range[1]} / ${total} 条`}
            size="small"
          />
        </div>
      )}
    </div>
  );
}
