/**
 * @file useTaskData.js
 * @description 评测任务数据获取和操作的自定义 Hook
 * @returns {Object} 任务相关的 state 和方法
 */
import { useState, useEffect, useCallback } from "react";
import { message, Modal } from "antd";
import api from "../utils/api";

export default function useTaskData() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [statusFilter, setStatusFilter] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [backendResources, setBackendResources] = useState([]);
  const [backendDatasets, setBackendDatasets] = useState([]);
  const [computeNodes, setComputeNodes] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [taskReport, setTaskReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = { size: 100 };
      if (statusFilter) params.status = statusFilter;
      if (searchText) params.keyword = searchText;
      const r = await api.get("/tasks", { params });
      if (r.data.code === 0) setTasks(r.data.data || []);
    } catch (e) {
      message.error("获取失败");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchText]);

  const fetchStats = useCallback(async () => {
    try {
      const r = await api.get("/tasks/stats");
      if (r.data.code === 0) setStats(r.data.data);
    } catch (e) { /* ignore */ }
  }, []);

  const fetchResources = useCallback(async () => {
    try {
      const r = await api.get("/resources", { params: { size: 100 } });
      if (r.data.code === 0) setBackendResources(r.data.data || []);
    } catch (e) { /* ignore */ }
  }, []);

  const fetchDatasets = useCallback(async () => {
    try {
      const r = await api.get("/assets", { params: { assetType: "DATASET", size: 100 } });
      if (r.data.code === 0) setBackendDatasets(r.data.data || []);
    } catch (e) { /* ignore */ }
  }, []);

  const fetchNodes = useCallback(async () => {
    try {
      const r = await api.get("/nodes");
      if (r.data.code === 0) setComputeNodes(r.data.data || []);
    } catch (e) { /* ignore */ }
  }, []);

  const fetchExecutions = useCallback(async (taskId) => {
    try {
      const r = await api.get(`/tasks/${taskId}/executions`);
      if (r.data.code === 0) setExecutions(r.data.data || []);
    } catch (e) { /* ignore */ }
  }, []);

  const fetchTaskReport = useCallback(async (taskId) => {
    setReportLoading(true);
    try {
      const r = await api.get("/reports", { params: { taskId, page: 0, size: 1 } });
      if (r.data.code === 0 && r.data.data && r.data.data.length > 0) {
        setTaskReport(r.data.data[0]);
      } else {
        setTaskReport(null);
      }
    } catch (e) {
      setTaskReport(null);
    } finally {
      setReportLoading(false);
    }
  }, []);

  const handleCancel = useCallback((id) => {
    Modal.confirm({
      title: "确定取消任务？", okText: "确认取消", okType: "danger",
      onOk: () => api.post("/tasks/" + id + "/cancel").then(() => {
        message.success("已取消"); fetchTasks(); fetchStats();
      }),
    });
  }, [fetchTasks, fetchStats]);

  const handleRetry = useCallback((id) => {
    api.post("/tasks/" + id + "/retry").then(() => {
      message.success("已重试，自动调度中..."); fetchTasks(); fetchStats();
    }).catch(() => message.error("失败"));
  }, [fetchTasks, fetchStats]);

  const handleClone = useCallback((id) => {
    api.post("/tasks/" + id + "/clone").then(() => {
      message.success("已克隆并自动调度"); fetchTasks(); fetchStats();
    }).catch(() => message.error("失败"));
  }, [fetchTasks, fetchStats]);

  const handleDelete = useCallback((id) => {
    Modal.confirm({
      title: "确定删除？", content: "删除后不可恢复", okText: "删除", okType: "danger",
      onOk: () => api.delete("/tasks/" + id).then(() => {
        message.success("已删除"); fetchTasks(); fetchStats();
      }),
    });
  }, [fetchTasks, fetchStats]);

  const handleBatchCancel = useCallback(() => {
    api.post("/tasks/batch/cancel", { ids: selectedKeys }).then(() => {
      message.success("批量取消成功"); setSelectedKeys([]); fetchTasks(); fetchStats();
    });
  }, [selectedKeys, fetchTasks, fetchStats]);

  const handleBatchDelete = useCallback(() => {
    Modal.confirm({
      title: "确定批量删除？", okType: "danger",
      onOk: () => api.post("/tasks/batch/delete", { ids: selectedKeys }).then(() => {
        message.success("已删除"); setSelectedKeys([]); fetchTasks(); fetchStats();
      }),
    });
  }, [selectedKeys, fetchTasks, fetchStats]);

  useEffect(() => {
    fetchTasks(); fetchStats(); fetchResources(); fetchDatasets(); fetchNodes();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  return {
    tasks, loading, stats, statusFilter, setStatusFilter,
    searchText, setSearchText, selectedKeys, setSelectedKeys,
    backendResources, backendDatasets, computeNodes,
    executions, setExecutions, taskReport, setTaskReport, reportLoading,
    fetchTasks, fetchStats, fetchNodes, fetchExecutions, fetchTaskReport,
    handleCancel, handleRetry, handleClone, handleDelete,
    handleBatchCancel, handleBatchDelete,
  };
}
