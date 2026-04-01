import React, { useState, useEffect } from "react";
import { Card, Table, Tag, Space, Button, Row, Col, Statistic, Modal, Form, Input, Select, message } from "antd";
import { DiffOutlined, PlusOutlined, EyeOutlined, DeleteOutlined } from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";

export default function Comparisons() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    try { const r = await api.get("/comparisons"); if(r.data.code===0) setRecords(r.data.data||[]); }
    catch(e) { message.error("获取失败"); } finally { setLoading(false); }
  };
  useEffect(() => { fetch(); }, []);

  const handleCreate = async (values) => {
    try { const r = await api.post("/comparisons",values); if(r.data.code===0){message.success("对比记录创建成功");setCreateVisible(false);form.resetFields();fetch();} }
    catch(e) { message.error("创建失败"); }
  };
  const handleDelete = (id) => { Modal.confirm({title:"确定删除？",onOk:()=>api.delete("/comparisons/"+id).then(()=>{message.success("已删除");fetch();})}); };

  const typeMap = { REPORT:"报告对比", EXPERIMENT:"实验对比", CROSS_PLATFORM:"跨平台对比" };

  const columns = [
    { title:"编号", dataIndex:"comparisonNo", width:170, ellipsis:true },
    { title:"标题", dataIndex:"title", ellipsis:true },
    { title:"对比类型", dataIndex:"compareType", width:120, render:v=><Tag color="blue">{typeMap[v]||v}</Tag> },
    { title:"报告IDs", dataIndex:"reportIds", width:120, ellipsis:true },
    { title:"创建时间", dataIndex:"createdAt", width:150, render:v=>v?dayjs(v).format("MM-DD HH:mm"):"-" },
    { title:"操作", key:"action", width:140, render:(_,r)=>(
      <Space>
        <Button type="link" size="small" icon={<EyeOutlined/>} onClick={()=>{setSelected(r);setDetailVisible(true);}}>详情</Button>
        <Button type="link" size="small" danger icon={<DeleteOutlined/>} onClick={()=>handleDelete(r.id)}>删除</Button>
      </Space>
    )},
  ];

  return (
    <div>
      <Card title="评测报告对比" extra={<Space>
        <Button type="primary" icon={<PlusOutlined/>} onClick={()=>setCreateVisible(true)}>新建对比</Button>
      </Space>}>
        <Table columns={columns} dataSource={records} rowKey="id" loading={loading} pagination={{pageSize:10}}/>
      </Card>

      <Modal title="新建对比" open={createVisible} onCancel={()=>setCreateVisible(false)} footer={null} width={600} destroyOnClose>
        <Form form={form} onFinish={handleCreate} layout="vertical" initialValues={{compareType:"REPORT"}}>
          <Form.Item name="title" label="对比标题" rules={[{required:true}]}><Input placeholder="例：A100 vs V100 推理性能对比"/></Form.Item>
          <Form.Item name="compareType" label="对比类型">
            <Select options={Object.entries(typeMap).map(([k,v])=>({value:k,label:v}))}/>
          </Form.Item>
          <Form.Item name="reportIds" label="报告ID（逗号分隔）"><Input placeholder="例：1,2,3"/></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={3}/></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block size="large">创建</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title="对比详情" open={detailVisible} onCancel={()=>setDetailVisible(false)} width={700} footer={null}>
        {selected && <div style={{lineHeight:2.5}}>
          <p><b>编号：</b>{selected.comparisonNo}</p><p><b>标题：</b>{selected.title}</p>
          <p><b>类型：</b><Tag color="blue">{typeMap[selected.compareType]}</Tag></p>
          <p><b>报告IDs：</b>{selected.reportIds}</p><p><b>描述：</b>{selected.description||"无"}</p>
          <p><b>创建时间：</b>{dayjs(selected.createdAt).format("YYYY-MM-DD HH:mm:ss")}</p>
        </div>}
      </Modal>
    </div>
  );
}
