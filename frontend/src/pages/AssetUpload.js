/**
 * @file AssetUpload.js
 * @description 数字资产上传页 — 多文件并行上传 + 进度条 + 类型选择
 * @feat #263 多文件上传, #264 前端资产管理页面
 */
import React, { useState } from "react";
import {
  Card, Upload, Button, Form, Input, Select, Space, Progress, List,
  Tag, message, Row, Col, Steps, Typography, Divider, Alert
} from "antd";
import {
  InboxOutlined, CloudUploadOutlined, ArrowLeftOutlined,
  CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined,
  ExperimentOutlined, DatabaseOutlined, CodeOutlined,
  FileTextOutlined, FolderOutlined, PlusOutlined, DeleteOutlined
} from "@ant-design/icons";
import api from "../utils/api";

const { Dragger } = Upload;
const { Text, Title } = Typography;
const { TextArea } = Input;

const ASSET_TYPES = [
  { value: "MODEL", label: "模型", icon: <ExperimentOutlined />, color: "#1890ff",
    formats: ".onnx, .pt, .pth, .pb, .h5, .tflite", maxSize: "10 GB" },
  { value: "DATASET", label: "数据集", icon: <DatabaseOutlined />, color: "#52c41a",
    formats: ".csv, .json, .txt, .zip, .tar.gz, .parquet", maxSize: "50 GB" },
  { value: "OPERATOR", label: "算子", icon: <CodeOutlined />, color: "#fa8c16",
    formats: ".py, .cpp, .h, .so, .zip", maxSize: "1 GB" },
  { value: "SCRIPT", label: "脚本", icon: <FileTextOutlined />, color: "#722ed1",
    formats: ".py, .sh, .bash", maxSize: "100 MB" },
  { value: "TEMPLATE", label: "流程模板", icon: <FolderOutlined />, color: "#13c2c2",
    formats: ".json, .yaml, .yml", maxSize: "10 MB" },
];

const UPLOAD_STATUS = {
  pending: { icon: <LoadingOutlined />, color: "#1890ff", text: "等待上传" },
  uploading: { icon: <LoadingOutlined spin />, color: "#1890ff", text: "上传中" },
  success: { icon: <CheckCircleOutlined />, color: "#52c41a", text: "上传成功" },
  error: { icon: <CloseCircleOutlined />, color: "#ff4d4f", text: "上传失败" },
};

const formatFileSize = (bytes) => {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
};

export default function AssetUpload({ onBack, onSuccess }) {
  const [assetType, setAssetType] = useState(null);
  const [fileQueue, setFileQueue] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState([]);

  const selectedType = ASSET_TYPES.find(t => t.value === assetType);

  const handleFileSelect = (info) => {
    const newFiles = info.fileList.map(f => ({
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

  const removeFile = (uid) => {
    setFileQueue(prev => prev.filter(f => f.uid !== uid));
  };

  const addTag = () => {
    const v = tagInput.trim();
    if (!v) return;
    if (tags.includes(v)) { message.warning("标签已存在"); return; }
    if (tags.length >= 30) { message.warning("最多 30 个标签"); return; }
    setTags([...tags, v]);
    setTagInput("");
  };

  const removeTag = (t) => setTags(tags.filter(x => x !== t));

  const handleUpload = async () => {
    if (!assetType) { message.error("请先选择资产类型"); return; }
    if (fileQueue.length === 0) { message.error("请先添加文件"); return; }

    let values;
    try { values = await form.validateFields(); } catch { return; }

    setUploading(true);
    setCurrentStep(2);

    const MAX_CONCURRENT = 3;
    let idx = 0;
    const results = [];

    const uploadOne = async (fileItem) => {
      setFileQueue(prev => prev.map(f =>
        f.uid === fileItem.uid ? { ...f, status: "uploading", progress: 0 } : f
      ));

      const formData = new FormData();
      formData.append("file", fileItem.originFileObj);
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
            setFileQueue(prev => prev.map(f =>
              f.uid === fileItem.uid ? { ...f, progress: pct } : f
            ));
          },
        });

        if (res.data.code === 0) {
          setFileQueue(prev => prev.map(f =>
            f.uid === fileItem.uid ? { ...f, status: "success", progress: 100, assetId: res.data.data?.id } : f
          ));
          results.push({ uid: fileItem.uid, success: true });
        } else {
          throw new Error(res.data.message || "上传失败");
        }
      } catch (e) {
        setFileQueue(prev => prev.map(f =>
          f.uid === fileItem.uid ? { ...f, status: "error", progress: 0 } : f
        ));
        results.push({ uid: fileItem.uid, success: false, error: e.message });
      }
    };

    // Parallel upload with concurrency limit
    const runBatch = async () => {
      const promises = [];
      while (idx < fileQueue.length) {
        while (promises.length < MAX_CONCURRENT && idx < fileQueue.length) {
          const fileItem = fileQueue[idx++];
          const p = uploadOne(fileItem).then(() => {
            promises.splice(promises.indexOf(p), 1);
          });
          promises.push(p);
        }
        if (promises.length >= MAX_CONCURRENT) {
          await Promise.race(promises);
        }
      }
      await Promise.all(promises);
    };

    await runBatch();
    setUploading(false);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    if (failCount === 0) {
      message.success(`全部 ${successCount} 个文件上传成功！`);
    } else {
      message.warning(`${successCount} 个成功，${failCount} 个失败`);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回列表</Button>
          <Title level={4} style={{ margin: 0 }}><CloudUploadOutlined /> 上传数字资产</Title>
        </Space>
      </div>

      <Steps current={currentStep} style={{ marginBottom: 24 }}
        items={[
          { title: "选择类型" },
          { title: "添加文件 & 填写信息" },
          { title: "上传" },
        ]}
      />

      {/* Step 1: Select type */}
      <Card title="Step 1: 选择资产类型" style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]}>
          {ASSET_TYPES.map(t => (
            <Col key={t.value} xs={12} sm={8} md={4}>
              <Card
                hoverable
                style={{
                  textAlign: "center",
                  border: assetType === t.value ? `2px solid ${t.color}` : "1px solid #f0f0f0",
                  background: assetType === t.value ? `${t.color}08` : "#fff",
                }}
                onClick={() => { setAssetType(t.value); if (currentStep === 0) setCurrentStep(1); }}
                bodyStyle={{ padding: 16 }}
              >
                <div style={{ fontSize: 28, color: t.color, marginBottom: 8 }}>{t.icon}</div>
                <div style={{ fontWeight: 600 }}>{t.label}</div>
                <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{t.formats}</div>
                <div style={{ fontSize: 11, color: "#999" }}>最大 {t.maxSize}</div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* Step 2: Files & Info */}
      {assetType && (
        <>
          <Card title="Step 2: 上传文件" style={{ marginBottom: 16 }}>
            <Dragger
              multiple
              beforeUpload={() => false}
              fileList={[]}
              onChange={handleFileSelect}
              disabled={uploading}
              style={{ marginBottom: 16 }}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">点击或拖拽文件到此区域</p>
              <p className="ant-upload-hint">
                支持 {selectedType?.formats} | 单文件最大 {selectedType?.maxSize} | 支持多文件同时上传
              </p>
            </Dragger>

            {/* File queue */}
            {fileQueue.length > 0 && (
              <List
                size="small"
                bordered
                dataSource={fileQueue}
                renderItem={item => {
                  const st = UPLOAD_STATUS[item.status];
                  return (
                    <List.Item
                      actions={[
                        item.status === "pending" && !uploading ?
                          <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => removeFile(item.uid)} /> : null
                      ].filter(Boolean)}
                    >
                      <List.Item.Meta
                        avatar={<span style={{ color: st.color }}>{st.icon}</span>}
                        title={<Text>{item.name} <Text type="secondary">({formatFileSize(item.size)})</Text></Text>}
                        description={
                          item.status === "uploading" ? <Progress percent={item.progress} size="small" /> :
                          item.status === "success" ? <Text type="success">✓ 上传成功 (ID: {item.assetId})</Text> :
                          item.status === "error" ? <Text type="danger">✗ 上传失败</Text> :
                          <Text type="secondary">等待上传</Text>
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            )}
          </Card>

          <Card title="Step 2: 填写资产信息" style={{ marginBottom: 16 }}>
            <Form form={form} layout="vertical" initialValues={{ version: "1.0.0" }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="name" label="资产名称" rules={[{ required: fileQueue.length <= 1, message: "请输入资产名称" }]}
                    extra={fileQueue.length > 1 ? "多文件上传时将使用文件名作为资产名称" : undefined}>
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
                <TextArea rows={2} placeholder="资产描述信息" />
              </Form.Item>

              {/* Tags */}
              <Form.Item label="标签">
                <Space wrap style={{ marginBottom: 8 }}>
                  {tags.map(t => (
                    <Tag key={t} closable onClose={() => removeTag(t)} color="processing"
                      style={{ padding: "2px 8px" }}>
                      {t}
                    </Tag>
                  ))}
                </Space>
                <Space>
                  <Input
                    placeholder="key:value 或自由文本"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onPressEnter={addTag}
                    style={{ width: 240 }}
                  />
                  <Button icon={<PlusOutlined />} onClick={addTag}>添加</Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          {/* Upload button */}
          <Card>
            <Button
              type="primary"
              size="large"
              icon={<CloudUploadOutlined />}
              onClick={handleUpload}
              loading={uploading}
              disabled={fileQueue.length === 0}
              block
            >
              {uploading ? `上传中 (${fileQueue.filter(f => f.status === "success").length}/${fileQueue.length})` :
                `确认上传 (${fileQueue.length} 个文件)`}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
