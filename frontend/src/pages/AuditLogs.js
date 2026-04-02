import React, { useState, useEffect } from "react";
import { Card, Table, Tag, Space, Button, Row, Col, Statistic, Select, message, Spin } from "antd";
import { AuditOutlined, ReloadOutlined } from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [actionFilter, setActionFilter] = useState(null);
  const [resourceFilter, setResourceFilter] = useState(null);

  const fetch = async () => {
    setLoading(true);
    try {
      const params = { size:100 };
      if (actionFilter) params.action = actionFilter;
      if (resourceFilter) params.resourceType = resourceFilter;
      const r = await api.get("/audit", { params });
      if(r.data.code===0) setLogs(r.data.data||[]);
    } catch(e) { message.error("获取失败"); }
    finally { setLoading(false); }
  };
  const fetchStats = async () => { try { const r = await api.get("/audit/stats"); if(r.data.code===0) setStats(r.data.data); } catch(e){} };
  useEffect(() => { fetch(); fetchStats(); }, []);

  const actionColors = { CREATE:"green",UPDATE:"blue",DELETE:"red",LOGIN:"cyan",LOGOUT:"default",EXPORT:"purple" };

  const columns = [
    { title:"时间", dataIndex:"createdAt", width:170, render:v=>v?dayjs(v).format("YYYY-MM-DD HH:mm:ss"):"-" },
    { title:"用户", dataIndex:"username", width:100 },
    { title:"操作", dataIndex:"action", width:90, render:v=><Tag color={actionColors[v]}>{v}</Tag> },
    { title:"资源类型", dataIndex:"resourceType", width:100 },
    { title:"资源ID", dataIndex:"resourceId", width:80 },
    { title:"详情", dataIndex:"detail", ellipsis:true },
    { title:"IP", dataIndex:"ipAddress", width:120 },
  ];

  return (
    <Spin spinning={loading}>
    <div>
      <Row gutter={16} style={{marginBottom:24}}>
        <Col xs={24} sm={12} md={6} lg={5}><Card hoverable><Statistic title="总操作" value={stats.total||0} prefix={<AuditOutlined/>}/></Card></Col>
        <Col xs={24} sm={12} md={6} lg={5}><Card hoverable><Statistic title="创建" value={stats.creates||0} valueStyle={{color:"#52c41a"}}/></Card></Col>
        <Col xs={24} sm={12} md={6} lg={5}><Card hoverable><Statistic title="更新" value={stats.updates||0} valueStyle={{color:"#1890ff"}}/></Card></Col>
        <Col xs={24} sm={12} md={6} lg={5}><Card hoverable><Statistic title="删除" value={stats.deletes||0} valueStyle={{color:"#ff4d4f"}}/></Card></Col>
        <Col xs={24} sm={12} md={6} lg={4}><Card hoverable><Statistic title="登录" value={stats.logins||0}/></Card></Col>
      </Row>
      <Card title="操作审计日志" extra={<Space>
        <Select placeholder="操作类型" allowClear style={{width:100}} value={actionFilter} onChange={setActionFilter}
          options={["CREATE","UPDATE","DELETE","LOGIN","EXPORT"].map(v=>({value:v,label:v}))}/>
        <Select placeholder="资源类型" allowClear style={{width:100}} value={resourceFilter} onChange={setResourceFilter}
          options={["TASK","REPORT","ASSET","USER","RESOURCE"].map(v=>({value:v,label:v}))}/>
        <Button onClick={()=>{fetch();fetchStats();}}>查询</Button>
        <Button icon={<ReloadOutlined/>} onClick={()=>{fetch();fetchStats();}}>刷新</Button>
      </Space>}>
        <Table columns={columns} dataSource={logs} rowKey="id" loading={loading} pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showTotal: (total) => `共 ${total} 条` }} scroll={{ x: 'max-content' }} size="small"/>
      </Card>
    </div>
    </Spin>
  );
}
