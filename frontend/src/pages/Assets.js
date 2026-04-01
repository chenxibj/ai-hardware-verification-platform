import React, { useState, useEffect } from "react";
import { Card, Table, Tag, Space, Button, Row, Col, Statistic, Modal, Form, Input, Select, message, Tooltip, Badge } from "antd";
import { DatabaseOutlined, PlusOutlined, ReloadOutlined, EyeOutlined, DeleteOutlined, SearchOutlined, CloudUploadOutlined } from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";

export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [createVisible, setCreateVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selected, setSelected] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState(null);
  const [form] = Form.useForm();

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const params = { size:100 };
      if (searchText) params.keyword = searchText;
      if (typeFilter) params.assetType = typeFilter;
      const res = await api.get("/assets", { params });
      if (res.data.code===0) setAssets(res.data.data||[]);
    } catch(e) { message.error("获取资产列表失败"); }
    finally { setLoading(false); }
  };
  const fetchStats = async () => { try { const r = await api.get("/assets/stats"); if(r.data.code===0) setStats(r.data.data); } catch(e){} };
  useEffect(() => { fetchAssets(); fetchStats(); }, []);

  const handleCreate = async (values) => {
    try { const r = await api.post("/assets", values); if(r.data.code===0) { message.success("资产创建成功"); setCreateVisible(false); form.resetFields(); fetchAssets(); fetchStats(); } }
    catch(e) { message.error("创建失败"); }
  };
  const handleDelete = (id) => {
    Modal.confirm({ title:"确定删除？", okText:"删除", okType:"danger", cancelText:"取消",
      onOk: async () => { try { await api.delete("/assets/"+id); message.success("已删除"); fetchAssets(); fetchStats(); } catch(e){message.error("删除失败");} }
    });
  };

  const typeMap = { MODEL:"模型", DATASET:"数据集", SCRIPT:"脚本", BENCHMARK:"基准", CONFIG:"配置" };
  const typeColors = { MODEL:"blue", DATASET:"green", SCRIPT:"orange", BENCHMARK:"purple", CONFIG:"cyan" };

  const columns = [
    { title:"资产编号", dataIndex:"assetNo", key:"assetNo", width:180, ellipsis:true },
    { title:"名称", dataIndex:"name", key:"name", ellipsis:true },
    { title:"类型", dataIndex:"assetType", key:"assetType", width:90, render:v => <Tag color={typeColors[v]}>{typeMap[v]||v}</Tag> },
    { title:"版本", dataIndex:"version", key:"version", width:70 },
    { title:"状态", dataIndex:"status", key:"status", width:80, render:v => <Badge status={v==="ACTIVE"?"success":"default"} text={v==="ACTIVE"?"可用":"归档"}/> },
    { title:"描述", dataIndex:"description", key:"description", ellipsis:true, width:200 },
    { title:"创建时间", dataIndex:"createdAt", key:"createdAt", width:160, render:v=>v?dayjs(v).format("YYYY-MM-DD HH:mm"):"-" },
    { title:"操作", key:"action", width:150, render:(_,r) => (
      <Space>
        <Button type="link" size="small" icon={<EyeOutlined/>} onClick={()=>{setSelected(r);setDetailVisible(true);}}>详情</Button>
        <Button type="link" size="small" danger icon={<DeleteOutlined/>} onClick={()=>handleDelete(r.id)}>删除</Button>
      </Space>
    )},
  ];

  return (
    <div>
      <Row gutter={16} style={{marginBottom:24}}>
        <Col span={5}><Card hoverable><Statistic title="总资产" value={stats.total||0} prefix={<DatabaseOutlined/>}/></Card></Col>
        <Col span={5}><Card hoverable><Statistic title="模型" value={stats.models||0} valueStyle={{color:"#1890ff"}}/></Card></Col>
        <Col span={5}><Card hoverable><Statistic title="数据集" value={stats.datasets||0} valueStyle={{color:"#52c41a"}}/></Card></Col>
        <Col span={5}><Card hoverable><Statistic title="脚本" value={stats.scripts||0} valueStyle={{color:"#fa8c16"}}/></Card></Col>
        <Col span={4}><Card hoverable><Statistic title="基准" value={stats.benchmarks||0} valueStyle={{color:"#722ed1"}}/></Card></Col>
      </Row>
      <Card title="数字资产管理" extra={<Space>
        <Input placeholder="搜索" prefix={<SearchOutlined/>} value={searchText} onChange={e=>setSearchText(e.target.value)} onPressEnter={fetchAssets} style={{width:160}} allowClear/>
        <Select placeholder="类型筛选" allowClear style={{width:110}} value={typeFilter} onChange={v=>{setTypeFilter(v);}} options={Object.entries(typeMap).map(([k,v])=>({value:k,label:v}))}/>
        <Button onClick={fetchAssets}>查询</Button>
        <Button type="primary" icon={<PlusOutlined/>} onClick={()=>setCreateVisible(true)}>新增资产</Button>
      </Space>}>
        <Table columns={columns} dataSource={assets} rowKey="id" loading={loading} pagination={{pageSize:10,showTotal:t=>"共 "+t+" 条"}}/>
      </Card>
      <Modal title="新增数字资产" open={createVisible} onCancel={()=>setCreateVisible(false)} footer={null} width={600} destroyOnClose>
        <Form form={form} onFinish={handleCreate} layout="vertical" initialValues={{version:"1.0",assetType:"MODEL"}}>
          <Form.Item name="name" label="资产名称" rules={[{required:true}]}><Input placeholder="例：ResNet50-ImageNet-Pretrained"/></Form.Item>
          <Form.Item name="assetType" label="资产类型" rules={[{required:true}]}>
            <Select options={Object.entries(typeMap).map(([k,v])=>({value:k,label:v}))}/>
          </Form.Item>
          <Form.Item name="version" label="版本"><Input/></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={3}/></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block size="large">创建</Button></Form.Item>
        </Form>
      </Modal>
      <Modal title="资产详情" open={detailVisible} onCancel={()=>setDetailVisible(false)} footer={null} width={600}>
        {selected && <div style={{lineHeight:2.5}}>
          <p><b>编号：</b>{selected.assetNo}</p><p><b>名称：</b>{selected.name}</p>
          <p><b>类型：</b><Tag color={typeColors[selected.assetType]}>{typeMap[selected.assetType]}</Tag></p>
          <p><b>版本：</b>{selected.version}</p><p><b>描述：</b>{selected.description||"无"}</p>
          <p><b>创建时间：</b>{selected.createdAt?dayjs(selected.createdAt).format("YYYY-MM-DD HH:mm:ss"):"-"}</p>
        </div>}
      </Modal>
    </div>
  );
}
