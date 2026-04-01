import React, { useState, useEffect } from "react";
import { Card, Statistic, Row, Col, Table, Tag, Space, Button, Modal, Form, Input, Select, message, Progress, Tooltip, Badge } from "antd";
import { PlusOutlined, ReloadOutlined, ExclamationCircleOutlined, EyeOutlined, CloseCircleOutlined, RetweetOutlined } from "@ant-design/icons";
import { taskApi } from "../utils/api";
import dayjs from "dayjs";

const { confirm } = Modal;

export default function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ total:0, running:0, completed:0, failed:0 });
  const [createVisible, setCreateVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => { fetchTasks(); }, []);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await taskApi.list({ size: 100 });
      if (res.data.code === 0) {
        const data = res.data.data || [];
        setTasks(data);
        setStats({
          total: data.length,
          running: data.filter(t => t.status === "RUNNING" || t.status === "QUEUED").length,
          completed: data.filter(t => t.status === "COMPLETED").length,
          failed: data.filter(t => t.status === "FAILED").length,
        });
      }
    } catch (err) { message.error("获取任务列表失败"); }
    finally { setLoading(false); }
  };

  const handleCreate = async (values) => {
    try {
      const res = await taskApi.create(values);
      if (res.data.code === 0) {
        message.success("任务创建成功");
        setCreateVisible(false);
        form.resetFields();
        fetchTasks();
      } else { message.error(res.data.message); }
    } catch (err) { message.error("创建任务失败"); }
  };

  const handleCancel = (id) => {
    confirm({
      title: "确定要取消这个任务吗？", icon: <ExclamationCircleOutlined/>,
      content: "取消后可以重新发起",
      okText: "确定", cancelText: "取消",
      onOk: async () => {
        try { await taskApi.cancel(id); message.success("任务已取消"); fetchTasks(); }
        catch (err) { message.error("取消失败"); }
      }
    });
  };

  const handleRetry = async (id) => {
    try { await taskApi.retry(id); message.success("任务已重新发起"); fetchTasks(); }
    catch (err) { message.error("重试失败"); }
  };

  const showDetail = (task) => { setSelectedTask(task); setDetailVisible(true); };

  const statusMap = { PENDING:"default", QUEUED:"processing", RUNNING:"processing", COMPLETED:"success", FAILED:"error", CANCELLED:"default" };
  const statusText = { PENDING:"待调度", QUEUED:"排队中", RUNNING:"运行中", COMPLETED:"已完成", FAILED:"失败", CANCELLED:"已取消" };
  const evalTypeMap = { MODEL:"模型评测", CHIP:"芯片评测", FRAMEWORK:"框架评测", OPERATOR:"算子评测" };
  const priorityMap = { HIGH:"高", MEDIUM:"中", LOW:"低" };
  const taskTypeMap = { TEMPLATE:"模板任务", CUSTOM:"自定义任务" };

  const columns = [
    { title:"任务编号", dataIndex:"taskNo", key:"taskNo", width:200, ellipsis:true },
    { title:"任务类型", dataIndex:"taskType", key:"taskType", render:v => taskTypeMap[v]||v, width:100 },
    { title:"评测类型", dataIndex:"evalType", key:"evalType", render:v => <Tag>{evalTypeMap[v]||v}</Tag>, width:110 },
    { title:"优先级", dataIndex:"priority", key:"priority", width:80,
      render:v => <Tag color={{HIGH:"red",MEDIUM:"blue",LOW:"default"}[v]}>{priorityMap[v]||v}</Tag> },
    { title:"状态", dataIndex:"status", key:"status", width:100,
      render:v => <Badge status={statusMap[v]==="processing"?"processing":statusMap[v]==="success"?"success":statusMap[v]==="error"?"error":"default"} text={statusText[v]||v}/> },
    { title:"进度", dataIndex:"progress", key:"progress", width:140,
      render:v => <Progress percent={v} size="small" status={v>=100?"success":"active"} strokeColor={v>=100?"#52c41a":"#1890ff"}/> },
    { title:"创建时间", dataIndex:"createdAt", key:"createdAt", width:170,
      render:v => v ? dayjs(v).format("YYYY-MM-DD HH:mm:ss") : "-" },
    { title:"操作", key:"action", width:200, fixed:"right", render:(_,r) => (
      <Space>
        <Tooltip title="查看详情"><Button type="link" size="small" icon={<EyeOutlined/>} onClick={() => showDetail(r)}>详情</Button></Tooltip>
        {(r.status==="PENDING"||r.status==="QUEUED"||r.status==="RUNNING") &&
          <Tooltip title="取消任务"><Button type="link" size="small" danger icon={<CloseCircleOutlined/>} onClick={() => handleCancel(r.id)}>取消</Button></Tooltip>}
        {(r.status==="FAILED"||r.status==="CANCELLED") &&
          <Tooltip title="重新执行"><Button type="link" size="small" icon={<RetweetOutlined/>} onClick={() => handleRetry(r.id)}>重试</Button></Tooltip>}
      </Space>
    )},
  ];

  return (
    <div>
      <Row gutter={16} style={{marginBottom:24}}>
        <Col span={6}><Card hoverable><Statistic title="总任务数" value={stats.total} valueStyle={{fontSize:32}}/></Card></Col>
        <Col span={6}><Card hoverable><Statistic title="运行中" value={stats.running} valueStyle={{color:"#1890ff",fontSize:32}}/></Card></Col>
        <Col span={6}><Card hoverable><Statistic title="已完成" value={stats.completed} valueStyle={{color:"#52c41a",fontSize:32}}/></Card></Col>
        <Col span={6}><Card hoverable><Statistic title="失败" value={stats.failed} valueStyle={{color:"#ff4d4f",fontSize:32}}/></Card></Col>
      </Row>
      <Card title="评测任务列表" extra={<Space>
        <Button icon={<ReloadOutlined/>} onClick={fetchTasks}>刷新</Button>
        <Button type="primary" icon={<PlusOutlined/>} onClick={() => setCreateVisible(true)}>创建任务</Button>
      </Space>}>
        <Table columns={columns} dataSource={tasks} rowKey="id" loading={loading} pagination={{pageSize:10,showTotal:t=>"共 "+t+" 条"}} scroll={{x:1200}}/>
      </Card>

      <Modal title="创建评测任务" open={createVisible} onCancel={() => setCreateVisible(false)} footer={null} width={600} destroyOnClose>
        <Form form={form} onFinish={handleCreate} layout="vertical" initialValues={{taskType:"CUSTOM",priority:"MEDIUM",evalConfig:"{}"}}>
          <Form.Item name="taskType" label="任务类型" rules={[{required:true,message:"请选择任务类型"}]}>
            <Select options={[{value:"TEMPLATE",label:"模板任务"},{value:"CUSTOM",label:"自定义任务"}]}/>
          </Form.Item>
          <Form.Item name="evalType" label="评测类型" rules={[{required:true,message:"请选择评测类型"}]}>
            <Select placeholder="请选择" options={[{value:"MODEL",label:"模型评测"},{value:"CHIP",label:"芯片评测"},{value:"FRAMEWORK",label:"框架评测"},{value:"OPERATOR",label:"算子评测"}]}/>
          </Form.Item>
          <Form.Item name="priority" label="优先级" rules={[{required:true}]}>
            <Select options={[{value:"HIGH",label:"高"},{value:"MEDIUM",label:"中"},{value:"LOW",label:"低"}]}/>
          </Form.Item>
          <Form.Item name="evalConfig" label="评测配置 (JSON)" rules={[{required:true,message:"请填写评测配置"}]}>
            <Input.TextArea rows={4} placeholder='{"target":"A100","benchmark":"ResNet50","batchSize":32}'/>
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block size="large">提交任务</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title="任务详情" open={detailVisible} onCancel={() => setDetailVisible(false)} footer={[
        <Button key="close" onClick={() => setDetailVisible(false)}>关闭</Button>
      ]} width={640}>
        {selectedTask && (
          <div style={{lineHeight:2.2}}>
            <Row gutter={16}>
              <Col span={12}><b>任务编号：</b>{selectedTask.taskNo}</Col>
              <Col span={12}><b>任务类型：</b>{taskTypeMap[selectedTask.taskType]}</Col>
              <Col span={12}><b>评测类型：</b><Tag>{evalTypeMap[selectedTask.evalType]}</Tag></Col>
              <Col span={12}><b>优先级：</b><Tag color={{HIGH:"red",MEDIUM:"blue",LOW:"default"}[selectedTask.priority]}>{priorityMap[selectedTask.priority]}</Tag></Col>
              <Col span={12}><b>状态：</b><Badge status={statusMap[selectedTask.status]==="processing"?"processing":statusMap[selectedTask.status]==="success"?"success":"default"} text={statusText[selectedTask.status]}/></Col>
              <Col span={12}><b>进度：</b><Progress percent={selectedTask.progress} size="small" style={{width:120}}/></Col>
              <Col span={24}><b>评测配置：</b><pre style={{background:"#f6f8fa",padding:12,borderRadius:6,fontSize:13,marginTop:4}}>{JSON.stringify(JSON.parse(selectedTask.evalConfig||"{}"),null,2)}</pre></Col>
              <Col span={12}><b>创建时间：</b>{selectedTask.createdAt ? dayjs(selectedTask.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Col>
              {selectedTask.startedAt && <Col span={12}><b>开始时间：</b>{dayjs(selectedTask.startedAt).format("YYYY-MM-DD HH:mm:ss")}</Col>}
              {selectedTask.completedAt && <Col span={12}><b>完成时间：</b>{dayjs(selectedTask.completedAt).format("YYYY-MM-DD HH:mm:ss")}</Col>}
            </Row>
          </div>
        )}
      </Modal>
    </div>
  );
}
