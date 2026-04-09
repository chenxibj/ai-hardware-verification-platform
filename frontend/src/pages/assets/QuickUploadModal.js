/**
 * @file QuickUploadModal.js
 * @description 快速创建资产弹窗 — 单文件上传 + 基本信息
 */
import React, { useState } from "react";
import { Modal, Form, Input, Select, Row, Col, Button, Upload, message } from "antd";
import { CloudUploadOutlined, InboxOutlined } from "@ant-design/icons";
import api from "../../utils/api";

const { Dragger } = Upload;

export default function QuickUploadModal({ visible, onClose, onSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [form] = Form.useForm();

  const handleFinish = async (values) => {
    if (fileList.length === 0) {
      message.error("请选择文件");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", fileList[0].originFileObj);
      formData.append("name", values.name);
      formData.append("assetType", values.assetType);
      if (values.description) formData.append("description", values.description);
      if (values.version) formData.append("version", values.version);
      if (values.tags) {
        const tagArr = values.tags.split(",").map((t) => t.trim()).filter(Boolean);
        formData.append("tags", JSON.stringify(tagArr));
      }

      const res = await api.post("/assets/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data.code === 0) {
        message.success("上传成功");
        form.resetFields();
        setFileList([]);
        onSuccess();
      }
    } catch (e) {
      message.error(e.response?.data?.message || "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setFileList([]);
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title={<><CloudUploadOutlined /> 快速创建资产</>}
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={600}
      destroyOnClose
    >
      <Form form={form} onFinish={handleFinish} layout="vertical"
        initialValues={{ version: "1.0.0", assetType: "MODEL" }}>
        <Form.Item name="name" label="资产名称" rules={[{ required: true, message: "请输入名称" }]}>
          <Input placeholder="例：ResNet50-ImageNet-Pretrained" />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="assetType" label="资产类型" rules={[{ required: true }]}>
              <Select options={[
                { value: "MODEL", label: "模型" },
                { value: "DATASET", label: "数据集" },
                { value: "OPERATOR", label: "算子" },
                { value: "SCRIPT", label: "脚本" },
                { value: "TEMPLATE", label: "流程模板" },
              ]} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="version" label="版本号">
              <Input placeholder="1.0.0" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="tags" label="标签（逗号分隔）">
          <Input placeholder="例：NLP,Transformer,预训练" />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item label="上传文件">
          <Dragger
            maxCount={1}
            fileList={fileList}
            beforeUpload={() => false}
            onChange={(info) => setFileList(info.fileList)}
            onRemove={() => setFileList([])}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">点击或拖拽文件到此区域</p>
          </Dragger>
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" block size="large"
            loading={uploading} icon={<CloudUploadOutlined />}>
            {uploading ? "上传中..." : "创建资产"}
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
}
