/**
 * @file AssetUpload.js
 * @description 数字资产上传页 — 三步骤：选类型 → 添加文件+填信息 → 并行上传
 * @feat #263 多文件上传
 */
import React, { useState } from "react";
import {
  Card, Upload, Button, Form, Input, Space, Tag, Steps, Row, Col, message,
} from "antd";
import {
  InboxOutlined, CloudUploadOutlined, ArrowLeftOutlined, PlusOutlined,
} from "@ant-design/icons";
import api from "../utils/api";
import { UPLOAD_ASSET_TYPES } from "./assets/constants";
import AssetTypeSelector from "./assets/AssetTypeSelector";
import FileQueue from "./assets/FileQueue";

const { Dragger } = Upload;
const MAX_CONCURRENT = 3;

export default function AssetUpload({ onBack }) {
  const [assetType, setAssetType] = useState(null);
  const [fileQueue, setFileQueue] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState([]);
  const [form] = Form.useForm();

  const selectedType = UPLOAD_ASSET_TYPES.find((t) => t.value === assetType);

  const handleTypeChange = (type) => {
    setAssetType(type);
    if (currentStep === 0) setCurrentStep(1);
  };

  const handleFileSelect = (info) => {
    const newFiles = info.fileList.map((f) => ({
      uid: f.uid,
      name: f.name,
      size: f.size || f.originFileObj?.size || 0,
      originFileObj: f.originFileObj,
      status: "pending",
      progress: 0,
      assetId: null,
    }));
    setFileQueue(newFiles);
  };

  const addTag = () => {
    const v = tagInput.trim();
    if (!v) return;
    if (tags.includes(v)) { message.warning("标签已存在"); return; }
    if (tags.length >= 30) { message.warning("最多 30 个标签"); return; }
    setTags([...tags, v]);
    setTagInput("");
  };

  /** 并行上传：最多 MAX_CONCURRENT 个同时进行 */
  const handleUpload = async () => {
    if (!assetType) { message.error("请先选择资产类型"); return; }
    if (fileQueue.length === 0) { message.error("请先添加文件"); return; }

    let values;
    try { values = await form.validateFields(); } catch { return; }

    setUploading(true);
    setCurrentStep(2);

    let idx = 0;
    const results = [];

    const uploadOne = async (fileItem) => {
      setFileQueue((prev) => prev.map((f) =>
        f.uid === fileItem.uid ? { ...f, status: "uploading", progress: 0 } : f
      ));

      const formData = new FormData();
      formData.append("file", fileItem.originFileObj);
      // 单文件时用表单名称，多文件时用文件名
      formData.append("name", fileQueue.length === 1 ? (values.name || fileItem.name) : fileItem.name);
      formData.append("assetType", assetType);
      if (values.description) formData.append("description", values.description);
      if (tags.length > 0) formData.append("tags", JSON.stringify(tags));
      if (values.version) formData.append("version", values.version);

      try {
        const res = await api.post("/assets/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (e) => {
            const pct = Math.round((e.loaded / e.total) * 100);
            setFileQueue((prev) => prev.map((f) =>
              f.uid === fileItem.uid ? { ...f, progress: pct } : f
            ));
          },
        });

        if (res.data.code === 0) {
          setFileQueue((prev) => prev.map((f) =>
            f.uid === fileItem.uid ? { ...f, status: "success", progress: 100, assetId: res.data.data?.id } : f
          ));
          results.push({ success: true });
        } else {
          throw new Error(res.data.message || "上传失败");
        }
      } catch (e) {
        setFileQueue((prev) => prev.map((f) =>
          f.uid === fileItem.uid ? { ...f, status: "error" } : f
        ));
        results.push({ success: false, error: e.message });
      }
    };

    // 并发控制：维护 promises 池
    const promises = [];
    const runNext = () => {
      if (idx >= fileQueue.length) return null;
      const fileItem = fileQueue[idx++];
      const p = uploadOne(fileItem).then(() => {
        promises.splice(promises.indexOf(p), 1);
      });
      promises.push(p);
      return p;
    };

    // 初始填满并发池
    for (let i = 0; i < Math.min(MAX_CONCURRENT, fileQueue.length); i++) { runNext(); }
    // 每完成一个启动下一个
    while (promises.length > 0) {
      await Promise.race(promises);
      runNext();
    }

    setUploading(false);
    const ok = results.filter((r) => r.success).length;
    const fail = results.filter((r) => !r.success).length;
    if (fail === 0) {
      message.success(`全部 ${ok} 个文件上传成功！`);
    } else {
      message.warning(`${ok} 个成功，${fail} 个失败`);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回列表</Button>
        <span style={{ fontSize: 18, fontWeight: 600 }}><CloudUploadOutlined /> 上传数字资产</span>
      </div>

      <Steps current={currentStep} style={{ marginBottom: 24 }}
        items={[{ title: "选择类型" }, { title: "添加文件 & 填写信息" }, { title: "上传" }]} />

      <Card title="Step 1: 选择资产类型" style={{ marginBottom: 16 }}>
        <AssetTypeSelector value={assetType} onChange={handleTypeChange} />
      </Card>

      {assetType && (
        <>
          <Card title="Step 2: 上传文件" style={{ marginBottom: 16 }}>
            <Dragger multiple beforeUpload={() => false} fileList={[]}
              onChange={handleFileSelect} disabled={uploading} style={{ marginBottom: 16 }}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">点击或拖拽文件到此区域</p>
              <p className="ant-upload-hint">
                支持 {selectedType?.formats} | 单文件最大 {selectedType?.maxSize} | 支持多文件
              </p>
            </Dragger>
            <FileQueue files={fileQueue} uploading={uploading}
              onRemove={(uid) => setFileQueue((prev) => prev.filter((f) => f.uid !== uid))} />
          </Card>

          <Card title="Step 2: 填写资产信息" style={{ marginBottom: 16 }}>
            <Form form={form} layout="vertical" initialValues={{ version: "1.0.0" }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="name" label="资产名称"
                    rules={[{ required: fileQueue.length <= 1, message: "请输入资产名称" }]}
                    extra={fileQueue.length > 1 ? "多文件时将使用文件名" : undefined}>
                    <Input placeholder="例：ResNet50-ImageNet-Pretrained" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="version" label="版本号" extra="三段式 semver: v{major}.{minor}.{patch}">
                    <Input placeholder="1.0.0" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="description" label="描述">
                <Input.TextArea rows={2} placeholder="资产描述信息" />
              </Form.Item>
              <Form.Item label="标签">
                <Space wrap style={{ marginBottom: 8 }}>
                  {tags.map((t) => (
                    <Tag key={t} closable onClose={() => setTags(tags.filter((x) => x !== t))}
                      color="processing" style={{ padding: "2px 8px" }}>{t}</Tag>
                  ))}
                </Space>
                <Space>
                  <Input placeholder="key:value 或自由文本" value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onPressEnter={addTag} style={{ width: 240 }} />
                  <Button icon={<PlusOutlined />} onClick={addTag}>添加</Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          <Card>
            <Button type="primary" size="large" icon={<CloudUploadOutlined />}
              onClick={handleUpload} loading={uploading} disabled={fileQueue.length === 0} block>
              {uploading
                ? `上传中 (${fileQueue.filter((f) => f.status === "success").length}/${fileQueue.length})`
                : `确认上传 (${fileQueue.length} 个文件)`}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
