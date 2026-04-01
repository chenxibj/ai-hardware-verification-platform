import React, { useState, useEffect } from "react";
import { Card, Table, Tag, Space, Button, Input, Select, Row, Col, Statistic, Descriptions, Modal, Form, message, Badge } from "antd";
import { FileTextOutlined, DownloadOutlined, EyeOutlined, SearchOutlined, PlusOutlined, CheckOutlined, SendOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { reportApi } from "../utils/api";
import dayjs from "dayjs";

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [detailVisible, setDetailVisible] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [form] = Form.useForm();

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = searchText ? { keyword: searchText, size: 100 } : { size: 100 };
      const res = await reportApi.list(params);
      if (res.data.code === 0) setReports(res.data.data || []);
    } catch (e) { message.error("获取报告失败"); }
    finally { setLoading(false); }
  };

  const fetchStats = async () => {
    try { const res = await reportApi.stats(); if (res.data.code === 0) setStats(res.data.data); } catch(e) {}
  };

  useEffect(() => { fetchReports(); fetchStats(); }, []);

  const handleCreate = async (values) => {
    try {
      const res = await reportApi.create(values);
      if (res.data.code === 0) { message.success("报告创建成功"); setCreateVisible(false); form.resetFields(); fetchReports(); fetchStats(); }
      else message.error(res.data.message);
    } catch(e) { message.error("创建失败"); }
  };

  const handlePublish = async (id) => {
    try { await reportApi.publish(id); message.success("报告已发布"); fetchReports(); fetchStats(); }
    catch(e) { message.error("发布失败"); }
  };

  const handleReview = async (id) => {
    try { await reportApi.review(id); message.success("已提交审核"); fetchReports(); fetchStats(); }
    catch(e) { message.error("提交失败"); }
  };

  const handleDelete = async (id) => {
    Modal.confirm({ title:"确定删除？", content:"删除后不可恢复", okText:"删除", okType:"danger", cancelText:"取消",
      onOk: async () => { try { await reportApi.delete(id); message.success("已删除"); fetchReports(); fetchStats(); } catch(e) { message.error("删除失败"); } }
    });
  };

  const statusMap = { DRAFT:{color:"default",text:"草稿"}, REVIEWING:{color:"processing",text:"审核中"}, PUBLISHED:{color:"success",text:"已发布"}, ARCHIVED:{color:"default",text:"已归档"} };
  const evalTypeMap = { MODEL:"模型评测", CHIP:"芯片评测", FRAMEWORK:"框架评测", OPERATOR:"算子评测" };

  const columns = [
    { title:"报告编号", dataIndex:"reportNo", key:"reportNo", width:180, ellipsis:true },
    { title:"报告标题", dataIndex:"title", key:"title", ellipsis:true },
    { title:"评测类型", dataIndex:"evalType", key:"evalType", width:100, render:v => <Tag>{evalTypeMap[v]||v}</Tag> },
    { title:"状态", dataIndex:"status", key:"status", width:90, render:v => <Badge status={statusMap[v]?.color==="success"?"success":statusMap[v]?.color==="processing"?"processing":"default"} text={statusMap[v]?.text||v}/> },
    { title:"评分", dataIndex:"score", key:"score", width:80, render:v => v ? <span style={{color:v>=90?"#52c41a":v>=70?"#faad14":"#ff4d4f",fontWeight:"bold"}}>{v}</span> : "-" },
    { title:"创建时间", dataIndex:"createdAt", key:"createdAt", width:170, render:v => v?dayjs(v).format("YYYY-MM-DD HH:mm"):"-" },
    { title:"操作", key:"action", width:240, render:(_,r) => (
      <Space>
        <Button type="link" size="small" icon={<EyeOutlined/>} onClick={() => { setSelectedReport(r); setDetailVisible(true); }}>查看</Button>
        {r.status==="DRAFT" && <Button type="link" size="small" icon={<SendOutlined/>} onClick={() => handleReview(r.id)}>提交审核</Button>}
        {r.status==="REVIEWING" && <Button type="link" size="small" icon={<CheckOutlined/>} onClick={() => handlePublish(r.id)} style={{color:"#52c41a"}}>发布</Button>}
        {r.status==="DRAFT" && <Button type="link" size="small" danger icon={<DeleteOutlined/>} onClick={() => handleDelete(r.id)}>删除</Button>}
      </Space>
    )},
  ];

  return (
    <div>
      <Row gutter={16} style={{marginBottom:24}}>
        <Col span={6}><Card hoverable><Statistic title="报告总数" value={stats.total||0} prefix={<FileTextOutlined/>}/></Card></Col>
        <Col span={6}><Card hoverable><Statistic title="已发布" value={stats.published||0} valueStyle={{color:"#52c41a"}}/></Card></Col>
        <Col span={6}><Card hoverable><Statistic title="审核中" value={stats.reviewing||0} valueStyle={{color:"#1890ff"}}/></Card></Col>
        <Col span={6}><Card hoverable><Statistic title="平均评分" value={stats.avgScore ? Number(stats.avgScore).toFixed(1) : "—"} suffix={stats.avgScore?"分":""}/></Card></Col>
      </Row>
      <Card title="评测报告" extra={<Space>
        <Input placeholder="搜索报告标题" prefix={<SearchOutlined/>} value={searchText} onChange={e=>setSearchText(e.target.value)} onPressEnter={fetchReports} style={{width:200}} allowClear/>
        <Button onClick={fetchReports}>搜索</Button>
        <Button type="primary" icon={<PlusOutlined/>} onClick={() => setCreateVisible(true)}>创建报告</Button>
      </Space>}>
        <Table columns={columns} dataSource={reports} rowKey="id" loading={loading} pagination={{pageSize:10,showTotal:t=>"共 "+t+" 条"}}/>
      </Card>

      <Modal title="创建评测报告" open={createVisible} onCancel={() => setCreateVisible(false)} footer={null} width={600} destroyOnClose>
        <Form form={form} onFinish={handleCreate} layout="vertical">
          <Form.Item name="title" label="报告标题" rules={[{required:true,message:"请输入标题"}]}>
            <Input placeholder="例：A100 GPU ResNet50推理性能评测报告"/>
          </Form.Item>
          <Form.Item name="evalType" label="评测类型" rules={[{required:true}]}>
            <Select placeholder="请选择" options={[{value:"MODEL",label:"模型评测"},{value:"CHIP",label:"芯片评测"},{value:"FRAMEWORK",label:"框架评测"},{value:"OPERATOR",label:"算子评测"}]}/>
          </Form.Item>
          <Form.Item name="summary" label="报告摘要"><Input.TextArea rows={3} placeholder="请输入报告摘要"/></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block size="large">创建报告</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title="报告详情" open={detailVisible} onCancel={() => setDetailVisible(false)} width={700} footer={[
        <Button key="close" type="primary" onClick={() => setDetailVisible(false)}>关闭</Button>
      ]}>
        {selectedReport && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="报告编号">{selectedReport.reportNo}</Descriptions.Item>
            <Descriptions.Item label="评测类型"><Tag>{evalTypeMap[selectedReport.evalType]||selectedReport.evalType}</Tag></Descriptions.Item>
            <Descriptions.Item label="报告标题" span={2}>{selectedReport.title}</Descriptions.Item>
            <Descriptions.Item label="状态"><Badge status={statusMap[selectedReport.status]?.color==="success"?"success":"default"} text={statusMap[selectedReport.status]?.text||selectedReport.status}/></Descriptions.Item>
            <Descriptions.Item label="综合评分"><span style={{fontSize:20,fontWeight:"bold",color:"#1890ff"}}>{selectedReport.score||"—"}</span></Descriptions.Item>
            <Descriptions.Item label="摘要" span={2}>{selectedReport.summary||"暂无摘要"}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{selectedReport.createdAt?dayjs(selectedReport.createdAt).format("YYYY-MM-DD HH:mm:ss"):"-"}</Descriptions.Item>
            {selectedReport.publishedAt && <Descriptions.Item label="发布时间">{dayjs(selectedReport.publishedAt).format("YYYY-MM-DD HH:mm:ss")}</Descriptions.Item>}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
