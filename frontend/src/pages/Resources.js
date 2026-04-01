import React, { useState, useEffect } from "react";
import { Card, Table, Tag, Space, Button, Row, Col, Statistic, Modal, Form, Input, Select, InputNumber, message, Badge, Progress } from "antd";
import { CloudServerOutlined, PlusOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined } from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";

export default function Resources() {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [createVisible, setCreateVisible] = useState(false);
  const [form] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    try { const r = await api.get("/resources",{params:{size:100}}); if(r.data.code===0) setResources(r.data.data||[]); }
    catch(e) { message.error("获取失败"); } finally { setLoading(false); }
  };
  const fetchStats = async () => { try { const r = await api.get("/resources/stats"); if(r.data.code===0) setStats(r.data.data); } catch(e){} };
  useEffect(() => { fetch(); fetchStats(); }, []);

  const handleCreate = async (values) => {
    try { const r = await api.post("/resources",values); if(r.data.code===0) { message.success("资源添加成功"); setCreateVisible(false); form.resetFields(); fetch(); fetchStats(); } }
    catch(e) { message.error("创建失败"); }
  };
  const handleStatus = async (id, status) => {
    try { await api.put("/resources/"+id+"/status",{status}); message.success("状态已更新"); fetch(); fetchStats(); }
    catch(e) { message.error("更新失败"); }
  };

  const typeColors = { GPU:"blue", CPU:"green", NPU:"purple", FPGA:"orange" };
  const statusColors = { ONLINE:"success", OFFLINE:"error", MAINTENANCE:"warning" };
  const statusText = { ONLINE:"在线", OFFLINE:"离线", MAINTENANCE:"维护中" };

  const columns = [
    { title:"编号", dataIndex:"resourceNo", key:"resourceNo", width:170, ellipsis:true },
    { title:"名称", dataIndex:"name", key:"name", width:200 },
    { title:"类型", dataIndex:"resourceType", key:"resourceType", width:80, render:v=><Tag color={typeColors[v]}>{v}</Tag> },
    { title:"型号", dataIndex:"model", key:"model", width:150 },
    { title:"厂商", dataIndex:"vendor", key:"vendor", width:100 },
    { title:"总数/可用", key:"count", width:100, render:(_,r)=><span>{r.availableCount}/{r.totalCount}</span> },
    { title:"利用率", key:"util", width:120, render:(_,r)=>{
      const pct = r.totalCount>0?Math.round((r.totalCount-r.availableCount)/r.totalCount*100):0;
      return <Progress percent={pct} size="small" status={pct>80?"exception":"active"}/>;
    }},
    { title:"状态", dataIndex:"status", key:"status", width:90, render:v=><Badge status={statusColors[v]} text={statusText[v]||v}/> },
    { title:"资源池", dataIndex:"poolName", key:"poolName", width:100 },
    { title:"操作", key:"action", width:160, render:(_,r)=>(
      <Space>
        {r.status==="ONLINE" && <Button type="link" size="small" danger onClick={()=>handleStatus(r.id,"OFFLINE")}>下线</Button>}
        {r.status==="OFFLINE" && <Button type="link" size="small" onClick={()=>handleStatus(r.id,"ONLINE")}>上线</Button>}
        {r.status!=="MAINTENANCE" && <Button type="link" size="small" onClick={()=>handleStatus(r.id,"MAINTENANCE")}>维护</Button>}
      </Space>
    )},
  ];

  return (
    <div>
      <Row gutter={16} style={{marginBottom:24}}>
        <Col span={4}><Card hoverable><Statistic title="资源组" value={stats.total||0} prefix={<CloudServerOutlined/>}/></Card></Col>
        <Col span={4}><Card hoverable><Statistic title="GPU" value={stats.gpus||0} valueStyle={{color:"#1890ff"}}/></Card></Col>
        <Col span={4}><Card hoverable><Statistic title="CPU" value={stats.cpus||0} valueStyle={{color:"#52c41a"}}/></Card></Col>
        <Col span={4}><Card hoverable><Statistic title="NPU" value={stats.npus||0} valueStyle={{color:"#722ed1"}}/></Card></Col>
        <Col span={4}><Card hoverable><Statistic title="在线" value={stats.online||0} valueStyle={{color:"#52c41a"}}/></Card></Col>
        <Col span={4}><Card hoverable><Statistic title="总设备数" value={stats.totalDevices||0}/></Card></Col>
      </Row>
      <Card title="计算资源管理" extra={<Space>
        <Button icon={<ReloadOutlined/>} onClick={()=>{fetch();fetchStats();}}>刷新</Button>
        <Button type="primary" icon={<PlusOutlined/>} onClick={()=>setCreateVisible(true)}>添加资源</Button>
      </Space>}>
        <Table columns={columns} dataSource={resources} rowKey="id" loading={loading} pagination={{pageSize:10,showTotal:t=>"共 "+t+" 条"}} scroll={{x:1300}}/>
      </Card>

      <Modal title="添加计算资源" open={createVisible} onCancel={()=>setCreateVisible(false)} footer={null} width={600} destroyOnClose>
        <Form form={form} onFinish={handleCreate} layout="vertical" initialValues={{resourceType:"GPU",totalCount:1}}>
          <Form.Item name="name" label="资源名称" rules={[{required:true}]}><Input placeholder="例：A100-GPU-Cluster-01"/></Form.Item>
          <Form.Item name="resourceType" label="资源类型" rules={[{required:true}]}>
            <Select options={[{value:"GPU",label:"GPU"},{value:"CPU",label:"CPU"},{value:"NPU",label:"NPU"},{value:"FPGA",label:"FPGA"}]}/>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="model" label="型号"><Input placeholder="例：NVIDIA A100 80GB"/></Form.Item></Col>
            <Col span={12}><Form.Item name="vendor" label="厂商"><Input placeholder="例：NVIDIA"/></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="totalCount" label="设备数量"><InputNumber min={1} style={{width:"100%"}}/></Form.Item></Col>
            <Col span={12}><Form.Item name="poolName" label="资源池"><Input placeholder="例：default-pool"/></Form.Item></Col>
          </Row>
          <Form.Item><Button type="primary" htmlType="submit" block size="large">添加</Button></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
