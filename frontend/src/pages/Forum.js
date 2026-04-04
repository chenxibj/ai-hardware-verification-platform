import React, { useState, useEffect, useCallback } from "react";
import { Card, Table, Tag, Button, Modal, Form, Input, Select, message, Space } from "antd";
import { PlusOutlined, LikeOutlined, MessageOutlined } from "@ant-design/icons";
import api from "../utils/api";
const CATEGORIES = ["技术讨论", "评测分享", "问题求助", "公告通知", "建议反馈"];
export default function Forum() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get("/api/v1/community/posts"); setPosts(r.data?.data?.content || []); } catch(e) {} finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchPosts(); }, [fetchPosts]);
  const handlePublish = async () => {
    try {
      const values = await form.validateFields();
      await api.post("/api/v1/community/posts", values);
      message.success("发布成功"); setModalVisible(false); form.resetFields(); fetchPosts();
    } catch(e) { message.error("发布失败"); }
  };
  const columns = [
    { title: "标题", dataIndex: "title", ellipsis: true },
    { title: "分类", dataIndex: "category", width: 100, render: v => <Tag>{v}</Tag> },
    { title: "作者", dataIndex: "authorName", width: 100 },
    { title: "点赞", dataIndex: "likeCount", width: 70, render: v => <Space><LikeOutlined />{v || 0}</Space> },
    { title: "评论", dataIndex: "commentCount", width: 70, render: v => <Space><MessageOutlined />{v || 0}</Space> },
    { title: "时间", dataIndex: "createdAt", width: 160 },
  ];
  return (
    <Card title="论坛" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>发布帖子</Button>}>
      <Table dataSource={posts} columns={columns} loading={loading} rowKey="id" />
      <Modal title="发布帖子" open={modalVisible} onOk={handlePublish} onCancel={() => setModalVisible(false)} width={640}>
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="category" label="分类" rules={[{ required: true }]}><Select options={CATEGORIES.map(c => ({ label: c, value: c }))} /></Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true }]}><Input.TextArea rows={6} /></Form.Item>
          <Form.Item name="tags" label="标签"><Select mode="tags" placeholder="输入标签按回车" /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
