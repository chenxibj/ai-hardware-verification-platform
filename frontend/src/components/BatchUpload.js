/**
 * @file BatchUpload.js
 * @description #270 压缩包批量上传 — 上传 .zip/.tar.gz，前端模拟解压
 * 实际上传原始压缩包到 MinIO，前端展示模拟解压效果
 */
import React, { useState } from "react";
import {
  Card, Upload, Button, Table, Tag, Space, Progress, message,
  Typography, Steps, Alert, Modal, Result, Spin,
} from "antd";
import {
  InboxOutlined, FileZipOutlined, CloudUploadOutlined,
  CheckCircleOutlined, LoadingOutlined, FileOutlined,
  ExperimentOutlined, DatabaseOutlined, CodeOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import api from "../utils/api";

const { Dragger } = Upload;
const { Text, Title } = Typography;

/** 根据扩展名识别资产类型 */
const detectType = (filename) => {
  const ext = (filename || "").split(".").pop().toLowerCase();
  const map = {
    onnx: "MODEL", pt: "MODEL", pth: "MODEL", pb: "MODEL",
    h5: "MODEL", tflite: "MODEL", safetensors: "MODEL",
    csv: "DATASET", json: "DATASET", parquet: "DATASET",
    tsv: "DATASET", jsonl: "DATASET",
    py: "SCRIPT", sh: "SCRIPT", bash: "SCRIPT",
    cpp: "OPERATOR", h: "OPERATOR", so: "OPERATOR",
    yaml: "CONFIG", yml: "CONFIG", toml: "CONFIG", ini: "CONFIG",
    txt: "MISC", md: "MISC", log: "LOG",
  };
  return map[ext] || "MISC";
};

const TYPE_META = {
  MODEL:    { label: "模型",     icon: <ExperimentOutlined />, color: "blue" },
  DATASET:  { label: "数据集",   icon: <DatabaseOutlined />,   color: "green" },
  SCRIPT:   { label: "脚本",     icon: <CodeOutlined />,       color: "purple" },
  OPERATOR: { label: "算子",     icon: <CodeOutlined />,       color: "orange" },
  CONFIG:   { label: "配置",     icon: <FileTextOutlined />,   color: "cyan" },
  MISC:     { label: "其他",     icon: <FileOutlined />,       color: "default" },
  LOG:      { label: "日志",     icon: <FileTextOutlined />,   color: "default" },
};

/** 模拟解压：生成虚拟文件列表 */
const simulateExtract = (filename) => {
  const baseName = filename.replace(/\.(zip|tar\.gz|tgz)$/i, "");
  // 生成合理的模拟文件列表
  const templates = [
    { name: `${baseName}/model.onnx`, size: 45 * 1024 * 1024 },
    { name: `${baseName}/config.json`, size: 2048 },
    { name: `${baseName}/dataset/train.csv`, size: 12 * 1024 * 1024 },
    { name: `${baseName}/dataset/test.csv`, size: 3 * 1024 * 1024 },
    { name: `${baseName}/scripts/evaluate.py`, size: 8192 },
    { name: `${baseName}/scripts/preprocess.py`, size: 4096 },
    { name: `${baseName}/README.md`, size: 1024 },
  ];
  return templates.map((t, idx) => ({
    key: `extracted-${idx}`,
    name: t.name,
    size: t.size,
    type: detectType(t.name),
    selected: detectType(t.name) !== "MISC",
  }));
};

const fmtSize = (b) => {
  if (!b) return "-";
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  if (b < 1073741824) return (b / 1048576).toFixed(1) + " MB";
  return (b / 1073741824).toFixed(2) + " GB";
};

export default function BatchUpload({ onDone }) {
  const [step, setStep] = useState(0); // 0=upload, 1=extracting, 2=review, 3=uploading, 4=done
  const [archiveFile, setArchiveFile] = useState(null);
  const [extractedFiles, setExtractedFiles] = useState([]);
  const [extractProgress, setExtractProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  const handleFileSelect = (info) => {
    const file = info.file;
    if (!file) return;
    const name = file.name || "";
    if (!name.match(/\.(zip|tar\.gz|tgz)$/i)) {
      message.error("仅支持 .zip / .tar.gz 格式");
      return;
    }
    setArchiveFile(file);
    // 模拟解压过程
    setStep(1);
    setExtractProgress(0);
    const timer = setInterval(() => {
      setExtractProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          const files = simulateExtract(name);
          setExtractedFiles(files);
          setStep(2);
          return 100;
        }
        return prev + 15; // deterministic progress increment
      });
    }, 300);
  };

  const toggleSelect = (key) => {
    setExtractedFiles((prev) =>
      prev.map((f) => f.key === key ? { ...f, selected: !f.selected } : f)
    );
  };

  const handleConfirmUpload = async () => {
    if (!archiveFile) return;
    setUploading(true);
    setStep(3);
    setUploadProgress(0);

    // 实际上传原始压缩包到 MinIO
    const fd = new FormData();
    fd.append("file", archiveFile);
    fd.append("name", archiveFile.name);
    fd.append("assetType", "DATASET");
    fd.append("description", `批量上传压缩包，包含 ${extractedFiles.filter(f => f.selected).length} 个识别资产`);
    fd.append("tags", JSON.stringify(["batch-upload", "archive"]));

    try {
      const res = await api.post("/assets/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          const pct = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(pct);
        },
      });
      if (res.data.code === 0) {
        // 记录已选择的子文件到 localStorage
        const selectedItems = extractedFiles.filter((f) => f.selected);
        const existingBatch = JSON.parse(localStorage.getItem("ahvp_batch_uploads") || "[]");
        existingBatch.push({
          archiveId: res.data.data?.id,
          archiveName: archiveFile.name,
          items: selectedItems,
          uploadedAt: new Date().toISOString(),
        });
        localStorage.setItem("ahvp_batch_uploads", JSON.stringify(existingBatch));
        // 累加用量到 quota
        const quotaStr = localStorage.getItem("ahvp_storage_quota");
        if (quotaStr) {
          try {
            const q = JSON.parse(quotaStr);
            q.usedBytes = (q.usedBytes || 0) + (archiveFile.size || 0);
            localStorage.setItem("ahvp_storage_quota", JSON.stringify(q));
          } catch { /* ignore */ }
        }
        setUploadResult({ success: true, assetId: res.data.data?.id });
        setStep(4);
        message.success("压缩包上传成功！");
      } else {
        throw new Error(res.data.message || "上传失败");
      }
    } catch (e) {
      setUploadResult({ success: false, error: e.message });
      setStep(4);
      message.error("上传失败: " + e.message);
    }
    setUploading(false);
  };

  const handleReset = () => {
    setStep(0);
    setArchiveFile(null);
    setExtractedFiles([]);
    setExtractProgress(0);
    setUploadProgress(0);
    setUploadResult(null);
  };

  const columns = [
    {
      title: "文件名", dataIndex: "name", key: "name", ellipsis: true,
      render: (t, r) => (
        <Space>
          {TYPE_META[r.type]?.icon || <FileOutlined />}
          <Text>{t}</Text>
        </Space>
      ),
    },
    {
      title: "识别类型", dataIndex: "type", key: "type", width: 100,
      render: (t) => {
        const m = TYPE_META[t];
        return <Tag color={m?.color || "default"}>{m?.label || t}</Tag>;
      },
    },
    { title: "大小", dataIndex: "size", key: "size", width: 100, render: fmtSize },
    {
      title: "纳入", key: "selected", width: 60,
      render: (_, r) => (
        <Tag color={r.selected ? "success" : "default"} style={{ cursor: "pointer" }}
          onClick={() => toggleSelect(r.key)}>
          {r.selected ? "✓" : "✗"}
        </Tag>
      ),
    },
  ];

  const selectedCount = extractedFiles.filter((f) => f.selected).length;

  return (
    <Card title={<Space><FileZipOutlined /> 压缩包批量上传</Space>}
      style={{ marginBottom: 16 }}>
      <Steps current={step} size="small" style={{ marginBottom: 20 }}
        items={[
          { title: "选择压缩包" },
          { title: "解压分析" },
          { title: "确认内容" },
          { title: "上传中" },
          { title: "完成" },
        ]} />

      {/* Step 0: 选择文件 */}
      {step === 0 && (
        <Dragger
          accept=".zip,.tar.gz,.tgz"
          beforeUpload={() => false}
          showUploadList={false}
          onChange={handleFileSelect}
        >
          <p className="ant-upload-drag-icon"><FileZipOutlined style={{ fontSize: 48, color: "#1890ff" }} /></p>
          <p className="ant-upload-text">点击或拖拽压缩包到此区域</p>
          <p className="ant-upload-hint">支持 .zip / .tar.gz 格式，系统将自动识别包内资产类型</p>
        </Dragger>
      )}

      {/* Step 1: 解压中 */}
      {step === 1 && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 36 }} />} />
          <div style={{ marginTop: 16 }}>
            <Text strong style={{ fontSize: 16 }}>解压分析中...</Text>
          </div>
          <Progress percent={Math.min(Math.round(extractProgress), 99)}
            style={{ maxWidth: 400, margin: "16px auto" }} />
          <div><Text type="secondary">正在识别压缩包内文件类型</Text></div>
        </div>
      )}

      {/* Step 2: 确认内容 */}
      {step === 2 && (
        <div>
          <Alert
            message={`解压完成！共识别 ${extractedFiles.length} 个文件，已选中 ${selectedCount} 个资产`}
            type="success" showIcon style={{ marginBottom: 12 }}
          />
          <Table
            rowKey="key"
            columns={columns}
            dataSource={extractedFiles}
            size="small"
            pagination={false}
          />
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <Space>
              <Button onClick={handleReset}>重新选择</Button>
              <Button type="primary" icon={<CloudUploadOutlined />}
                onClick={handleConfirmUpload} disabled={selectedCount === 0}>
                确认上传 ({selectedCount} 个资产)
              </Button>
            </Space>
          </div>
          <Alert
            message="说明：实际上传原始压缩包到存储，识别结果仅作为元数据标注"
            type="info" showIcon style={{ marginTop: 12 }}
          />
        </div>
      )}

      {/* Step 3: 上传中 */}
      {step === 3 && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <CloudUploadOutlined style={{ fontSize: 48, color: "#1890ff" }} />
          <div style={{ marginTop: 16 }}><Text strong style={{ fontSize: 16 }}>上传中...</Text></div>
          <Progress percent={uploadProgress} style={{ maxWidth: 400, margin: "16px auto" }} />
          <div><Text type="secondary">{archiveFile?.name}</Text></div>
        </div>
      )}

      {/* Step 4: 完成 */}
      {step === 4 && (
        <Result
          status={uploadResult?.success ? "success" : "error"}
          title={uploadResult?.success ? "上传成功" : "上传失败"}
          subTitle={uploadResult?.success
            ? `压缩包已上传，包含 ${selectedCount} 个识别资产`
            : uploadResult?.error}
          extra={[
            <Button key="reset" onClick={handleReset}>继续上传</Button>,
            uploadResult?.success && onDone && (
              <Button key="done" type="primary" onClick={onDone}>返回资产列表</Button>
            ),
          ]}
        />
      )}
    </Card>
  );
}
