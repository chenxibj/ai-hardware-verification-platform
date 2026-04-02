/**
 * @file Templates.js
 * @description 评测模板页面入口
 */
import React, { useState, useEffect } from "react";
import { Form, message, Spin } from "antd";
import api from "../utils/api";
import { parseConfig } from "../components/templates/templateConstants";
import TemplateCards from "../components/templates/TemplateCards";
import TemplateTable from "../components/templates/TemplateTable";
import TemplateEditModal from "../components/templates/TemplateEditModal";

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form] = Form.useForm();

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const r = await api.get("/templates");
      if (r.data.code === 0) setTemplates(r.data.data || []);
    } catch (e) { message.error("获取模板列表失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const handleDelete = async (id) => {
    try {
      const r = await api.delete(`/templates/${id}`);
      if (r.data.code === 0) { message.success("已删除"); fetchTemplates(); }
      else message.error(r.data.message || "删除失败");
    } catch (e) { message.error("删除失败"); }
  };

  const handleClone = async (record) => {
    try {
      const r = await api.post("/templates", {
        name: record.name + " (副本)", description: record.description,
        evalType: record.evalType, configJson: record.configJson,
      });
      if (r.data.code === 0) { message.success("克隆成功"); fetchTemplates(); }
      else message.error(r.data.message || "克隆失败");
    } catch (e) { message.error("克隆失败"); }
  };

  const handleSubmit = async (values) => {
    try {
      const config = selected
        ? { ...parseConfig(selected.configJson), evalDimension: values.evalDimension || parseConfig(selected.configJson).evalDimension }
        : { evalDimension: values.evalDimension || "", evalObject: values.evalDimension || "" };
      const payload = { name: values.name, description: values.description, evalType: values.evalType, configJson: JSON.stringify(config) };
      const r = selected ? await api.put(`/templates/${selected.id}`, payload) : await api.post("/templates", payload);
      if (r.data.code === 0) { message.success(selected ? "更新成功" : "创建成功"); setEditVisible(false); setSelected(null); form.resetFields(); fetchTemplates(); }
      else message.error(r.data.message || "操作失败");
    } catch (e) { message.error("操作失败"); }
  };

  const openEdit = (record) => {
    const config = parseConfig(record.configJson);
    setSelected(record);
    form.setFieldsValue({ name: record.name, description: record.description, evalType: record.evalType, evalDimension: config.evalDimension || config.evalObject || "" });
    setEditVisible(true);
  };

  const openCreate = () => { setSelected(null); form.resetFields(); setEditVisible(true); };
  const onView = (t) => { setSelected(t); setDetailVisible(true); };

  const systemTemplates = templates.filter(t => t.isSystem);

  return (
    <Spin spinning={loading}>
      <div>
        <TemplateCards templates={systemTemplates} onView={onView} onClone={handleClone} />
        <TemplateTable templates={templates} loading={loading}
          onRefresh={fetchTemplates} onCreate={openCreate}
          onView={onView} onEdit={openEdit} onClone={handleClone} onDelete={handleDelete} />
        <TemplateEditModal
          detailVisible={detailVisible} editVisible={editVisible}
          selected={selected} form={form}
          onDetailClose={() => setDetailVisible(false)}
          onEditClose={() => { setEditVisible(false); setSelected(null); form.resetFields(); }}
          onSubmit={handleSubmit} />
      </div>
    </Spin>
  );
}
