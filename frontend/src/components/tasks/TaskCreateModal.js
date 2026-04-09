/**
 * @file TaskCreateModal.js
 * @description 创建评测任务弹窗（4步流程：模式选择→配置→节点→确认）
 * @param {Object} props
 * @param {boolean}  props.visible - 是否显示
 * @param {Function} props.onClose - 关闭回调
 * @param {Function} props.onSuccess - 创建成功回调
 * @param {Array}    props.computeNodes - 计算节点列表
 * @param {Array}    props.backendResources - 后端资源列表
 * @param {Array}    props.backendDatasets - 数据集列表
 * @param {Function} props.fetchNodes - 拉取节点列表
 */
import React, { useState } from "react";
import {
  Modal, Form, Steps, Button, Divider, message,
} from "antd";
import {
  AppstoreOutlined, ProjectOutlined, SettingOutlined,
  CheckCircleOutlined, ExperimentOutlined, CloudServerOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import api from "../../utils/api";
import axios from "axios";
import dayjs from "dayjs";
import { PRESET_TEMPLATES } from "./taskConstants";
import ModeSelectStep from "./steps/ModeSelectStep";
import TemplateSelectStep from "./steps/TemplateSelectStep";
import NodeSelectStep from "./steps/NodeSelectStep";
import ConfirmStep from "./steps/ConfirmStep";
import BasicInfoStep from "./steps/BasicInfoStep";
import EvalConfigStep from "./steps/EvalConfigStep";

const agentApi = axios.create({ baseURL: "/agent-api" });

/**
 * 创建评测任务弹窗
 */
export default function TaskCreateModal({
  visible, onClose, onSuccess,
  computeNodes, backendResources, backendDatasets, fetchNodes,
}) {
  const [form] = Form.useForm();
  const [createStep, setCreateStep] = useState(0);
  const [createMode, setCreateMode] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const onlineNodes = computeNodes.filter(n => n.status === "ONLINE");

  // Auto-select single online node
  React.useEffect(() => {
    if (onlineNodes.length === 1) setSelectedNodeId(onlineNodes[0].id);
  }, [computeNodes]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetCreate = () => {
    setCreateStep(0); setCreateMode(null);
    setSelectedTemplate(null); setSelectedNodeId(null);
    form.resetFields(); onClose();
  };

  const getStepItems = () => {
    if (createMode === "template") {
      return [
        { title: "选择模式", icon: <AppstoreOutlined /> },
        { title: "选择模板", icon: <ExperimentOutlined /> },
        { title: "选择节点", icon: <CloudServerOutlined /> },
        { title: "确认提交", icon: <CheckCircleOutlined /> },
      ];
    }
    return [
      { title: "选择模式", icon: <AppstoreOutlined /> },
      { title: "基础信息", icon: <ProjectOutlined /> },
      { title: "评测配置", icon: <SettingOutlined /> },
      { title: "确认提交", icon: <CheckCircleOutlined /> },
    ];
  };

  const canNext = () => {
    if (createStep === 0) return !!createMode;
    if (createMode === "template" && createStep === 1) return !!selectedTemplate;
    return true;
  };

  const handleNext = async () => {
    if (createStep === 0 && canNext()) { setCreateStep(1); return; }
    if (createMode === "template") {
      if (createStep === 1 && selectedTemplate) setCreateStep(2);
      else if (createStep === 2) setCreateStep(3);
    } else {
      if (createStep === 1) {
        try { await form.validateFields(["name", "evalType"]); setCreateStep(2); }
        catch (e) { /* validation errors shown */ }
      } else if (createStep === 2) setCreateStep(3);
    }
  };

  const handleSubmit = async () => {
    if (createMode === "template") {
      const payload = {
        name: `${selectedTemplate.name} - ${dayjs().format("MMDD-HHmm")}`,
        evalType: selectedTemplate.evalType,
        templateId: selectedTemplate.id,
        metrics: selectedTemplate.metrics.join(","),
      };
      if (selectedNodeId) payload.targetNodeId = selectedNodeId;
      try {
        const r = await api.post("/tasks", payload);
        if (r.data.code === 0) {
          /* #317: Fix createdBy (backend always sets 1) */
          const taskData = r.data.data;
          const user = JSON.parse(localStorage.getItem("user") || "{}");
          if (taskData?.id && user?.id) {
            agentApi.post("/api/tasks/fix-created-by", { taskId: taskData.id, userId: user.id }).catch(() => {});
          }
          message.success("任务创建成功，已自动调度执行"); resetCreate(); onSuccess();
        }
        else message.error(r.data.message || "创建失败");
      } catch (e) { message.error("创建失败"); }
    } else {
      try {
        const values = await form.validateFields();
        const payload = {
          ...values,
          metrics: values.metrics ? values.metrics.join(",") : "",
          tags: values.tags ? values.tags.join(",") : "",
        };
        if (selectedTemplate) { payload.templateId = selectedTemplate.id; payload.evalType = selectedTemplate.evalType; }
        if (selectedNodeId) payload.targetNodeId = selectedNodeId;
        const r = await api.post("/tasks", payload);
        if (r.data.code === 0) {
          /* #317: Fix createdBy (backend always sets 1) */
          const taskData = r.data.data;
          const user = JSON.parse(localStorage.getItem("user") || "{}");
          if (taskData?.id && user?.id) {
            agentApi.post("/api/tasks/fix-created-by", { taskId: taskData.id, userId: user.id }).catch(() => {});
          }
          message.success("任务创建成功，已自动调度执行"); resetCreate(); onSuccess();
        }
        else message.error(r.data.message || "创建失败");
      } catch (e) { message.error("请检查必填字段是否填写完整"); }
    }
  };

  const renderStepContent = () => {
    if (createStep === 0) return <ModeSelectStep mode={createMode} setMode={setCreateMode} />;
    if (createMode === "template") {
      if (createStep === 1) return <TemplateSelectStep selected={selectedTemplate} onSelect={(t) => { setSelectedTemplate(t); form.setFieldsValue({ evalType: t.evalType, metrics: t.metrics }); }} />;
      if (createStep === 2) return <NodeSelectStep nodes={onlineNodes} allNodes={computeNodes} selectedNodeId={selectedNodeId} setSelectedNodeId={setSelectedNodeId} />;
      if (createStep === 3) return <ConfirmStep mode="template" template={selectedTemplate} node={computeNodes.find(n => n.id === selectedNodeId)} />;
    } else {
      if (createStep === 1) return <BasicInfoStep />;
      if (createStep === 2) return <EvalConfigStep backendResources={backendResources} backendDatasets={backendDatasets} computeNodes={computeNodes} onlineNodes={onlineNodes} form={form} />;
      if (createStep === 3) return <ConfirmStep mode="custom" form={form} computeNodes={computeNodes} />;
    }
    return null;
  };

  return (
    <Modal title="创建评测任务" open={visible} onCancel={resetCreate}
      footer={null} width={900} destroyOnClose>
      <Steps current={createStep} style={{ marginBottom: 24 }} items={getStepItems()} />
      <Form form={form} layout="vertical"
        initialValues={{ priority: "MEDIUM", precision: "FP16", batchSize: 32, timeout: 60, retryCount: 0, retryInterval: 10, enableAlert: true, datasetSource: "preset" }}>
        {renderStepContent()}
        <Divider />
        <div style={{ textAlign: "right" }}>
          {createStep > 0 && <Button style={{ marginRight: 8 }} onClick={() => setCreateStep(s => s - 1)}>上一步</Button>}
          {createStep < 3 && <Button type="primary" disabled={!canNext()} onClick={handleNext}>下一步</Button>}
          {createStep === 3 && <Button type="primary" size="large" onClick={handleSubmit} icon={<RocketOutlined />}>确认并运行</Button>}
        </div>
      </Form>
    </Modal>
  );
}
