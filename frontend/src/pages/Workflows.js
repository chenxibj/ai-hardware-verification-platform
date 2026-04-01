import React, { useState, useEffect } from "react";
import { Card, Table, Tag, Space, Button, Row, Col, Statistic, Modal, Form, Input, Select, message, Badge, Steps } from "antd";
import { ApartmentOutlined, PlusOutlined, PlayCircleOutlined, PauseCircleOutlined, DeleteOutlined, EyeOutlined } from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";

export default function Workflows() {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [createVisible, setCreateVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    try { const r = await api.get("/workflows",{params:{size:100}}); if(r.data.code===0) setWorkflows(r.data.data||[]); }
    catch(e) { message.error("获取失败"); } finally { setLoading(false); }
  };
  const fetchStats = async () => { try { const r = await api.get("/workflows/stats"); if(r.data.code===0) setStats(r.data.data); } catch(e){} };
  useEffect(() => { fetch(); fetchStats(); }, []);

  const handleCreate = async (values) => {
    const steps = (values.stepNames||"").split("\n").filter(s=>s.trim()).map((s,i)=>({name:s.trim(),order:i+1,type:"EVAL",status:"PENDING"}));
    try { const r = await api.post("/workflows",{...values,steps:JSON.stringify(steps)}); if(r.data.code===0){message.success("工作流创建成功");setCreateVisible(false);form.resetFields();fetch();fetchStats();} }
    catch(e){message.error("创建失败");}
  };
  const handleStatus = (id, status) => { api.put("/workflows/"+id+"/status",{status}).then(()=>{message.success("状态已更新");fetch();fetchStats();}).catch(()=>message.error("失败")); };

  const statusMap = {DRAFT:"草稿",ACTIVE:"运行中",DISABLED:"已停用"};
  const statusColors = {DRAFT:"default",ACTIVE:"success",DISABLED:"error"};

  const columns = [
    { title:"编号", dataIndex:"workflowNo", width:160, ellipsis:true },
    { title:"名称", dataIndex:"name", ellipsis:true },
    { title:"描述", dataIndex:"description", ellipsis:true, width:200 },
    { title:"步骤数", key:"steps", width:80, render:(_,r)=>{try{return JSON.parse(r.steps||"[]").length;}catch(e){return 0;}} },
    { title:"状态", dataIndex:"status", width:90, render:v=><Badge status={statusColors[v]} text={statusMap[v]||v}/> },
    { title:"创建时间", dataIndex:"createdAt", width:150, render:v=>v?dayjs(v).format("MM-DD HH:mm"):"-" },
    { title:"操作", key:"action", width:200, render:(_,r)=>(
      <Space>
        <Button type="link" size="small" icon={<EyeOutlined/>} onClick={()=>{setSelected(r);setDetailVisible(true);}}>详情</Button>
        {r.status==="DRAFT"&&<Button type="link" size="small" icon={<PlayCircleOutlined/>} onClick={()=>handleStatus(r.id,"ACTIVE")}>启用</Button>}
        {r.status==="ACTIVE"&&<Button type="link" size="small" danger icon={<PauseCircleOutlined/>} onClick={()=>handleStatus(r.id,"DISABLED")}>停用</Button>}
        {r.status==="DISABLED"&&<Button type="link" size="small" icon={<PlayCircleOutlined/>} onClick={()=>handleStatus(r.id,"ACTIVE")}>启用</Button>}
      </Space>
    )},
  ];

  return (
    <div>
      <Row gutter={16} style={{marginBottom:24}}>
        <Col span={6}><Card hoverable><Statistic title="总工作流" value={stats.total||0} prefix={<ApartmentOutlined/>}/></Card></Col>
        <Col span={6}><Card hoverable><Statistic title="运行中" value={stats.active||0} valueStyle={{color:"#52c41a"}}/></Card></Col>
        <Col span={6}><Card hoverable><Statistic title="草稿" value={stats.draft||0}/></Card></Col>
        <Col span={6}><Card hoverable><Statistic title="已停用" value={stats.disabled||0} valueStyle={{color:"#ff4d4f"}}/></Card></Col>
      </Row>
      <Card title="评测编排工作流" extra={<Space>
        <Button icon={<PlusOutlined/>} type="primary" onClick={()=>setCreateVisible(true)}>创建工作流</Button>
      </Space>}>
        <Table columns={columns} dataSource={workflows} rowKey="id" loading={loading} pagination={{pageSize:10}}/>
      </Card>

      <Modal title="创建评测工作流" open={createVisible} onCancel={()=>setCreateVisible(false)} footer={null} width={600} destroyOnClose>
        <Form form={form} onFinish={handleCreate} layout="vertical">
          <Form.Item name="name" label="工作流名称" rules={[{required:true}]}><Input placeholder="例：A100-ResNet50-全流程评测"/></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2}/></Form.Item>
          <Form.Item name="stepNames" label="步骤（每行一个步骤名称）" rules={[{required:true}]}>
            <Input.TextArea rows={6} placeholder={"环境准备\n模型加载\n数据预处理\n推理评测\n结果分析\n报告生成"}/>
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block size="large">创建</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title="工作流详情" open={detailVisible} onCancel={()=>setDetailVisible(false)} width={700} footer={null}>
        {selected && <div>
          <p><b>编号：</b>{selected.workflowNo}</p><p><b>名称：</b>{selected.name}</p>
          <p><b>状态：</b><Badge status={statusColors[selected.status]} text={statusMap[selected.status]}/></p>
          <p><b>描述：</b>{selected.description||"无"}</p>
          <p style={{marginTop:16}}><b>步骤：</b></p>
          {(()=>{try{const steps=JSON.parse(selected.steps||"[]");return <Steps direction="vertical" size="small" current={-1}
            items={steps.map(s=>({title:s.name,description:"类型: "+(s.type||"EVAL"),status:"wait"}))}/>;}catch(e){return <span>无步骤</span>;}})()}
        </div>}
      </Modal>
    </div>
  );
}
