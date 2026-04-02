import React, { useState, useEffect } from "react";
import { Card, Table, Tag, Space, Button, Row, Col, Statistic, Select, Input, message, Spin } from "antd";
import { FileSearchOutlined, ReloadOutlined, WarningOutlined, CloseCircleOutlined, BugOutlined } from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [taskFilter, setTaskFilter] = useState(null);
  const [levelFilter, setLevelFilter] = useState(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = { size:100 };
      if (taskFilter) params.taskId = taskFilter;
      if (levelFilter) params.level = levelFilter;
      const r = await api.get("/eval-logs", { params });
      if(r.data.code===0) setLogs(r.data.data||[]);
    } catch(e) { message.error("获取日志失败"); }
    finally { setLoading(false); }
  };
  const fetchStats = async () => { try { const r = await api.get("/eval-logs/stats"); if(r.data.code===0) setStats(r.data.data); } catch(e){} };
  useEffect(() => { fetchLogs(); fetchStats(); }, []);

  const levelColors = { INFO:"blue", WARN:"orange", ERROR:"red", DEBUG:"default" };

  const columns = [
    { title:"时间", dataIndex:"createdAt", key:"createdAt", width:180, render:v=>v?dayjs(v).format("YYYY-MM-DD HH:mm:ss"):"-" },
    { title:"级别", dataIndex:"logLevel", key:"logLevel", width:80, render:v=><Tag color={levelColors[v]}>{v}</Tag> },
    { title:"任务ID", dataIndex:"taskId", key:"taskId", width:80 },
    { title:"步骤", dataIndex:"stepName", key:"stepName", width:120 },
    { title:"来源", dataIndex:"source", key:"source", width:120 },
    { title:"消息", dataIndex:"message", key:"message", ellipsis:true },
  ];

  return (
    <Spin spinning={loading}>
    <div>
      <Row gutter={16} style={{marginBottom:24}}>
        <Col xs={24} sm={12} md={8}><Card hoverable><Statistic title="日志总数" value={stats.total||0} prefix={<FileSearchOutlined/>}/></Card></Col>
        <Col xs={24} sm={12} md={8}><Card hoverable><Statistic title="错误数" value={stats.error||0} valueStyle={{color:"#ff4d4f"}} prefix={<CloseCircleOutlined/>}/></Card></Col>
        <Col xs={24} sm={12} md={8}><Card hoverable><Statistic title="警告数" value={stats.warn||0} valueStyle={{color:"#faad14"}} prefix={<WarningOutlined/>}/></Card></Col>
      </Row>
      <Card title="评测日志" extra={<Space>
        <Input placeholder="任务ID" style={{width:100}} value={taskFilter} onChange={e=>setTaskFilter(e.target.value||null)} allowClear/>
        <Select placeholder="日志级别" allowClear style={{width:100}} value={levelFilter} onChange={setLevelFilter}
          options={[{value:"INFO",label:"INFO"},{value:"WARN",label:"WARN"},{value:"ERROR",label:"ERROR"},{value:"DEBUG",label:"DEBUG"}]}/>
        <Button onClick={()=>{fetchLogs();fetchStats();}}>查询</Button>
        <Button icon={<ReloadOutlined/>} onClick={()=>{fetchLogs();fetchStats();}}>刷新</Button>
      </Space>}>
        <Table columns={columns} dataSource={logs} rowKey="id" loading={loading} pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showTotal: (total) => `共 ${total} 条` }} scroll={{ x: 'max-content' }} size="small"/>
      </Card>
    </div>
    </Spin>
  );
}
