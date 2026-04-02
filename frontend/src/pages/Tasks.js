/**
 * @file Tasks.js
 * @description 评测任务页面入口，只做布局和子组件编排
 */
import React, { useState } from "react";
import useTaskData from "../hooks/useTaskData";
import TaskStatsCards from "../components/tasks/TaskStatsCards";
import TaskTable from "../components/tasks/TaskTable";
import TaskCreateModal from "../components/tasks/TaskCreateModal";
import TaskDetailDrawer from "../components/tasks/TaskDetailDrawer";

export default function Tasks() {
  const data = useTaskData();
  const [createVisible, setCreateVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selected, setSelected] = useState(null);

  const showDetail = (record) => {
    setSelected(record);
    setDetailVisible(true);
    data.setTaskReport(null);
    data.fetchExecutions(record.id);
    if (record.status === "COMPLETED") data.fetchTaskReport(record.id);
  };

  const handleCreateSuccess = () => {
    data.fetchTasks();
    data.fetchStats();
  };

  return (
    <div>
      <TaskStatsCards stats={data.stats} />

      <TaskTable
        tasks={data.tasks} loading={data.loading}
        selectedKeys={data.selectedKeys} setSelectedKeys={data.setSelectedKeys}
        searchText={data.searchText} setSearchText={data.setSearchText}
        statusFilter={data.statusFilter} setStatusFilter={data.setStatusFilter}
        onRefresh={() => { data.fetchTasks(); data.fetchStats(); }}
        onCreateOpen={() => { setCreateVisible(true); data.fetchNodes(); }}
        onShowDetail={showDetail}
        onClone={data.handleClone} onCancel={data.handleCancel}
        onRetry={data.handleRetry} onDelete={data.handleDelete}
        onBatchCancel={data.handleBatchCancel} onBatchDelete={data.handleBatchDelete}
      />

      <TaskCreateModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onSuccess={handleCreateSuccess}
        computeNodes={data.computeNodes}
        backendResources={data.backendResources}
        backendDatasets={data.backendDatasets}
        fetchNodes={data.fetchNodes}
      />

      <TaskDetailDrawer
        visible={detailVisible}
        selected={selected}
        executions={data.executions}
        taskReport={data.taskReport}
        reportLoading={data.reportLoading}
        onClose={() => { setDetailVisible(false); data.setExecutions([]); data.setTaskReport(null); }}
      />
    </div>
  );
}
