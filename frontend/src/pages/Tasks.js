import React, { useState, useEffect } from "react";
import { Card, Table, Tag, Space, Button, Row, Col, Statistic, Modal, Form, Input, Select, message, Tooltip, Badge, Checkbox, Dropdown, Progress } from "antd";
import { ProjectOutlined, PlusOutlined, ReloadOutlined, EyeOutlined, DeleteOutlined, CopyOutlined, StopOutlined, RedoOutlined, SearchOutlined, FilterOutlined, ExportOutlined, TagOutlined } from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [createVisible, setCreateVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selected, setSelected] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [statusFilter, setStatusFilter] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [form] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    try {
      const params = { size:100 };
      if (statusFilter) params.status = statusFilter;
      if (searchText) params.keyword = searchText;
      const r = await api.get("/tasks", { params });
      if(r.data.code===0) setTasks(r.data.data||[]);
    } catch(e) { message.error("获取失败"); }
    finally { setLoading(false); }
  };
  const fetchStats = async () => { try { const r = await api.get("/tasks/stats"); if(r.data.code===0) setStats(r.data.data); } catch(e){} };
  useEffect(() => { fetch(); fetchStats(); }, []);

  const handleCreate = async (values) => {
    try { const r = await api.post("/tasks", values); if(r.data.code===0) { message.success("任务创建成功"); setCreateVisible(false); form.resetFields(); fetch(); fetchStats(); } }
    catch(e) { message.error("创建失败"); }
  };
  const handleCancel = (id) => { api.post("/tasks/"+id+"/cancel").then(()=>{message.success("已取消");fetch();fetchStats();}).catch(()=>message.error("失败")); };
  const handleRetry = (id) => { api.post("/tasks/"+id+"/retry").then(()=>{message.success("已重试");fetch();fetchStats();}).catch(()=>message.error("失败")); };
  const handleClone = (id) => { api.post("/tasks/"+id+"/clone").then(()=>{message.success("已克隆");fetch();fetchStats();}).catch(()=>message.error("失败")); };
  const handleDelete = (id) => { Modal.confirm({title:"确定删除？",okText:"删除",okType:"danger",cancelText:"取消",onOk:()=>api.delete("/tasks/"+id).then(()=>{message.success("已删除");fetch();fetchStats();})}); };
  const handleBatchCancel = () => { api.post("/tasks/batch/cancel",{ids:selectedKeys}).then(()=>{message.success("批量取消成功");setSelectedKeys([]);fetch();fetchStats();}).catch(()=>message.error("失败")); };
  const handleBatchDelete = () => { Modal.confirm({title:"确定批量删除？",okText:"删除",okType:"danger",cancelText:"取消",onOk:()=>api.post("/tasks/batch/delete",{ids:selectedKeys}).then(()=>{message.success("批量删除成功");setSelectedKeys([]);fetch();fetchStats();})}); };

  const statusMap = { PENDING:"待执行", RUNNING:"执行中", COMPLETED:"已完成", FAILED:"失败", CANCELLED:"已取消" };
  const statusColors = { PENDING:"default", RUNNING:"processing", COMPLETED:"success", FAILED:"error", CANCELLED:"warning" };
  const priorityMap = { LOW:"低",MEDIUM:"中",HIGH:"高",CRITICAL:"紧急" };
  const priorityColors = { LOW:"default",MEDIUM:"blue",HIGH:"orange",CRITICAL:"red" };
  const evalTypes = { GENERAL:"通用",MODEL:"模型",CHIP:"芯片",FRAMEWORK:"框架",OPERATOR:"算子",SCENE:"场景",MIDLAYER:"中间层" };

  const columns = [
    { title:"任务编号", dataIndex:"taskNo", key:"taskNo", width:160, ellipsis:true },
    { title:"名称", dataIndex:"name", key:"name", ellipsis:true, width:200 },
    { title:"类型", dataIndex:"evalType", key:"evalType", width:80, render:v=><Tag>{evalTypes[v]||v}</Tag> },
    { title:"优先级", dataIndex:"priority", key:"priority", width:70, render:v=><Tag color={priorityColors[v]}>{priorityMap[v]||v}</Tag> },
    { title:"状态", dataIndex:"status", key:"status", width:90, render:v=><Badge status={statusColors[v]} text={statusMap[v]||v}/> },
    { title:"进度", dataIndex:"progress", key:"progress", width:120, render:v=><Progress percent={v||0} size="small"/> },
    { title:"目标模型", dataIndex:"targetModel", key:"targetModel", width:120, ellipsis:true },
    { title:"创建时间", dataIndex:"createdAt", key:"createdAt", width:150, render:v=>v?dayjs(v).format("MM-DD HH:mm"):"-", sorter:(a,b)=>new Date(a.createdAt)-new Date(b.createdAt) },
    { title:"操作", key:"action", width:200, fixed:"right", render:(_,r)=>(
      <Space size={2}>
        <Button type="link" size="small" icon={<EyeOutlined/>} onClick={()=>{setSelected(r);setDetailVisible(true);}}>详情</Button>
        <Button type="link" size="small" icon={<CopyOutlined/>} onClick={()=>handleClone(r.id)}>克隆</Button>
        {r.status==="PENDING"&&<Button type="link" size="small" danger icon={<StopOutlined/>} onClick={()=>handleCancel(r.id)}>取消</Button>}
        {r.status==="FAILED"&&<Button type="link" size="small" icon={<RedoOutlined/>} onClick={()=>handleRetry(r.id)}>重试</Button>}
        <Button type="link" size="small" danger icon={<DeleteOutlined/>} onClick={()=>handleDelete(r.id)}>删除</Button>
      </Space>
    )},
  ];

  return (
    <div>
      <Row gutter={16} style={{marginBottom:24}}>
        <Col span={4}><Card hoverable size="small"><Statistic title="总任务" value={stats.total||0} prefix={<ProjectOutlined/>}/></Card></Col>
        <Col span={4}><Card hoverable size="small"><Statistic title="待执行" value={stats.pending||0}/></Card></Col>
        <Col span={4}><Card hoverable size="small"><Statistic title="执行中" value={stats.running||0} valueStyle={{color:"#1890ff"}}/></Card></Col>
        <Col span={4}><Card hoverable size="small"><Statistic title="已完成" value={stats.completed||0} valueStyle={{color:"#52c41a"}}/></Card></Col>
        <Col span={4}><Card hoverable size="small"><Statistic title="失败" value={stats.failed||0} valueStyle={{color:"#ff4d4f"}}/></Card></Col>
        <Col span={4}><Card hoverable size="small"><Statistic title="已取消" value={stats.cancelled||0}/></Card></Col>
      </Row>
      <Card title={<span>评测任务 {selectedKeys.length>0&&<Tag color="blue">已选 {selectedKeys.length} 项</Tag>}</span>} extra={<Space>
        <Input placeholder="搜索" prefix={<SearchOutlined/>} value={searchText} onChange={e=>setSearchText(e.target.value)} onPressEnter={fetch} style={{width:140}} allowClear/>
        <Select placeholder="状态" allowClear style={{width:95}} value={statusFilter} onChange={setStatusFilter}
          options={Object.entries(statusMap).map(([k,v])=>({value:k,label:v}))}/>
        <Button onClick={()=>{fetch();fetchStats();}}>查询</Button>
        {selectedKeys.length>0&&<><Button danger onClick={handleBatchCancel}>批量取消</Button><Button danger type="primary" onClick={handleBatchDelete}>批量删除</Button></>}
        <Button type="primary" icon={<PlusOutlined/>} onClick={()=>setCreateVisible(true)}>创建任务</Button>
      </Space>}>
        <Table columns={columns} dataSource={tasks} rowKey="id" loading={loading} scroll={{x:1400}}
          pagination={{pageSize:15,showTotal:t=>"共 "+t+" 条",showSizeChanger:true}}
          rowSelection={{selectedRowKeys:selectedKeys,onChange:setSelectedKeys}}/>
      </Card>

      <Modal title="创建评测任务" open={createVisible} onCancel={()=>setCreateVisible(false)} footer={null} width={650} destroyOnClose>
        <Form form={form} onFinish={handleCreate} layout="vertical" initialValues={{evalType:"GENERAL",priority:"MEDIUM"}}>
          <Form.Item name="name" label="任务名称" rules={[{required:true}]}><Input placeholder="例：A100 ResNet50 推理性能评测"/></Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="evalType" label="评测类型" rules={[{required:true}]}>
              <Select options={Object.entries(evalTypes).map(([k,v])=>({value:k,label:v}))}/></Form.Item></Col>
            <Col span={12}><Form.Item name="priority" label="优先级">
              <Select options={Object.entries(priorityMap).map(([k,v])=>({value:k,label:v}))}/></Form.Item></Col>
          </Row>
          <Form.Item name="targetModel" label="目标模型/芯片"><Input placeholder="例：NVIDIA A100 / ResNet50"/></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={3}/></Form.Item>
          <Form.Item name="tags" label="标签"><Input placeholder="多个标签逗号分隔，如: GPU,推理,性能"/></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block size="large">创建</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title="任务详情" open={detailVisible} onCancel={()=>setDetailVisible(false)} width={700} footer={null}>
        {selected && <div style={{lineHeight:2.5}}>
          <Row gutter={16}><Col span={12}><b>编号：</b>{selected.taskNo}</Col><Col span={12}><b>状态：</b><Badge status={statusColors[selected.status]} text={statusMap[selected.status]}/></Col></Row>
          <Row gutter={16}><Col span={12}><b>名称：</b>{selected.name}</Col><Col span={12}><b>类型：</b><Tag>{evalTypes[selected.evalType]}</Tag></Col></Row>
          <Row gutter={16}><Col span={12}><b>优先级：</b><Tag color={priorityColors[selected.priority]}>{priorityMap[selected.priority]}</Tag></Col><Col span={12}><b>目标：</b>{selected.targetModel||"-"}</Col></Row>
          <p><b>描述：</b>{selected.description||"无"}</p>
          {selected.tags && <p><b>标签：</b>{selected.tags.split(",").map(t=><Tag key={t} icon={<TagOutlined/>}>{t.trim()}</Tag>)}</p>}
          <p><b>进度：</b><Progress percent={selected.progress||0} style={{width:200}}/></p>
          <p><b>创建时间：</b>{dayjs(selected.createdAt).format("YYYY-MM-DD HH:mm:ss")}</p>
          {selected.errorMessage && <p style={{color:"#ff4d4f"}}><b>错误信息：</b>{selected.errorMessage}</p>}
        </div>}
      </Modal>
    </div>
  );
}
