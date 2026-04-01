import React, { useState, useEffect } from "react";
import { Card, Table, Tag, Space, Button, Row, Col, Statistic, Modal, Form, Input, Select, message, Badge, Progress, Steps, Divider, InputNumber, Switch, Upload, Tabs, Descriptions, Radio, Alert, Typography } from "antd";
import { ProjectOutlined, PlusOutlined, ReloadOutlined, EyeOutlined, DeleteOutlined, CopyOutlined, StopOutlined, RedoOutlined, SearchOutlined, InboxOutlined, SettingOutlined, ThunderboltOutlined, CheckCircleOutlined, ExperimentOutlined, RocketOutlined, ApiOutlined, AppstoreOutlined } from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";
const { TextArea } = Input;
const { Dragger } = Upload;
const { Text } = Typography;

const EVAL_TYPES = { PERFORMANCE:"性能评测", ACCURACY:"精度评测", COMPATIBILITY:"兼容性评测", STABILITY:"稳定性评测" };
const EVAL_OBJECTS = { CHIP:"芯片", OPERATOR:"算子", MIDDLEWARE:"中间层", FRAMEWORK:"框架", MODEL:"模型", SCENE:"场景" };
const PRIORITIES = { HIGH:"高", MEDIUM:"中", LOW:"低" };
const PRIORITY_COLORS = { HIGH:"red", MEDIUM:"blue", LOW:"default" };
const STATUS_MAP = { PENDING:"待执行", QUEUED:"排队中", RUNNING:"执行中", COMPLETED:"已完成", FAILED:"失败", CANCELLED:"已取消", TERMINATED:"已终止" };
const STATUS_COLORS = { PENDING:"default", QUEUED:"warning", RUNNING:"processing", COMPLETED:"success", FAILED:"error", CANCELLED:"default", TERMINATED:"default" };

const PRESET_TEMPLATES = [
  { id:"chip_perf", name:"芯片性能评测", icon:<ThunderboltOutlined/>, evalType:"PERFORMANCE", evalObject:"CHIP", desc:"GPU/NPU算力密度、能效比、多卡互联测试", metrics:["算力(TOPS)","能效比(TOPS/W)","互联带宽(GB/s)","P95延迟"] },
  { id:"model_accuracy", name:"模型精度评测", icon:<ExperimentOutlined/>, evalType:"ACCURACY", evalObject:"MODEL", desc:"模型在不同精度下的准确率、召回率、F1评估", metrics:["Top-1准确率","Top-5准确率","F1值","精度损失%"] },
  { id:"model_perf", name:"模型推理性能", icon:<RocketOutlined/>, evalType:"PERFORMANCE", evalObject:"MODEL", desc:"推理延迟、吞吐量、资源利用率测试", metrics:["首包延迟","P95延迟","吞吐量(QPS)","GPU利用率"] },
  { id:"framework_compat", name:"框架兼容性评测", icon:<ApiOutlined/>, evalType:"COMPATIBILITY", evalObject:"FRAMEWORK", desc:"框架在国产芯片上的适配性、算子支持率测试", metrics:["安装成功率","模型加载率","算子支持率","兼容性评分"] },
  { id:"operator_perf", name:"算子性能评测", icon:<AppstoreOutlined/>, evalType:"PERFORMANCE", evalObject:"OPERATOR", desc:"单算子/融合算子执行延迟、精度损失测试", metrics:["执行延迟","吞吐量","精度损失","算力利用率"] },
  { id:"scene_effect", name:"场景效果评测", icon:<SettingOutlined/>, evalType:"PERFORMANCE", evalObject:"SCENE", desc:"行业场景下模型实际应用效果量化评估", metrics:["准确率","召回率","业务指标","适配性评分"] },
];

const PRESET_DATASETS = [
  { value:"imagenet", label:"ImageNet-1K (通用CV)" },{ value:"coco", label:"COCO 2017 (检测/分割)" },
  { value:"squad", label:"SQuAD 2.0 (NLP问答)" },{ value:"glue", label:"GLUE Benchmark (NLU)" },
  { value:"mmlu", label:"MMLU (LLM综合)" },{ value:"humaneval", label:"HumanEval (代码生成)" },
];

const GPU_OPTIONS = [
  { value:"ascend_910b", label:"华为昇腾 910B" },{ value:"ascend_910c", label:"华为昇腾 910C" },
  { value:"cambricon_590", label:"寒武纪 MLU590" },{ value:"hygon_z100", label:"海光 DCU Z100" },
  { value:"biren_br100", label:"壁仞 BR100" },{ value:"cpu_only", label:"仅CPU（无GPU）" },
];

const PRECISION_OPTIONS = [
  { value:"FP32", label:"FP32（单精度）" },{ value:"FP16", label:"FP16（半精度）" },
  { value:"BF16", label:"BF16" },{ value:"INT8", label:"INT8（量化）" },
];

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
  const [createStep, setCreateStep] = useState(0);
  const [createMode, setCreateMode] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [form] = Form.useForm();

  const fetchTasks = async () => { setLoading(true); try { const params = {size:100}; if(statusFilter) params.status=statusFilter; if(searchText) params.keyword=searchText; const r = await api.get("/tasks",{params}); if(r.data.code===0) setTasks(r.data.data||[]); } catch(e){message.error("获取失败");} finally{setLoading(false);} };
  const fetchStats = async () => { try { const r = await api.get("/tasks/stats"); if(r.data.code===0) setStats(r.data.data); } catch(e){} };
  useEffect(() => { fetchTasks(); fetchStats(); }, []);

  const handleCreate = async (values) => {
    const payload = { ...values, metrics: values.metrics ? values.metrics.join(",") : "", tags: values.tags ? values.tags.join(",") : "" };
    if (selectedTemplate) { payload.templateId = selectedTemplate.id; payload.evalType = selectedTemplate.evalType; payload.evalObject = selectedTemplate.evalObject; }
    try { const r = await api.post("/tasks", payload); if(r.data.code===0) { message.success("任务创建成功"); resetCreate(); fetchTasks(); fetchStats(); } else message.error(r.data.message||"创建失败"); } catch(e) { message.error("创建失败"); }
  };
  const resetCreate = () => { setCreateVisible(false); setCreateStep(0); setCreateMode(null); setSelectedTemplate(null); form.resetFields(); };
  const handleCancel = (id) => { Modal.confirm({title:"确定取消任务？",okText:"确认取消",okType:"danger",onOk:()=>api.post("/tasks/"+id+"/cancel").then(()=>{message.success("已取消");fetchTasks();fetchStats();})}); };
  const handleRetry = (id) => { api.post("/tasks/"+id+"/retry").then(()=>{message.success("已重试");fetchTasks();fetchStats();}).catch(()=>message.error("失败")); };
  const handleClone = (id) => { api.post("/tasks/"+id+"/clone").then(()=>{message.success("已克隆");fetchTasks();fetchStats();}).catch(()=>message.error("失败")); };
  const handleDelete = (id) => { Modal.confirm({title:"确定删除？",content:"删除后不可恢复",okText:"删除",okType:"danger",onOk:()=>api.delete("/tasks/"+id).then(()=>{message.success("已删除");fetchTasks();fetchStats();})}); };
  const handleBatchCancel = () => { api.post("/tasks/batch/cancel",{ids:selectedKeys}).then(()=>{message.success("批量取消成功");setSelectedKeys([]);fetchTasks();fetchStats();}); };
  const handleBatchDelete = () => { Modal.confirm({title:"确定批量删除？",okType:"danger",onOk:()=>api.post("/tasks/batch/delete",{ids:selectedKeys}).then(()=>{message.success("已删除");setSelectedKeys([]);fetchTasks();fetchStats();})}); };

  const columns = [
    { title:"任务编号", dataIndex:"taskNo", width:140, ellipsis:true, fixed:"left" },
    { title:"名称", dataIndex:"name", ellipsis:true, width:200 },
    { title:"评测类型", dataIndex:"evalType", width:100, render:v=><Tag color="blue">{EVAL_TYPES[v]||v}</Tag> },
    { title:"评测对象", dataIndex:"evalObject", width:90, render:v=><Tag>{EVAL_OBJECTS[v]||v}</Tag> },
    { title:"优先级", dataIndex:"priority", width:70, render:v=><Tag color={PRIORITY_COLORS[v]}>{PRIORITIES[v]||v}</Tag> },
    { title:"状态", dataIndex:"status", width:90, render:v=><Badge status={STATUS_COLORS[v]} text={STATUS_MAP[v]||v}/> },
    { title:"进度", dataIndex:"progress", width:120, render:v=><Progress percent={v||0} size="small" strokeColor={v>=100?"#52c41a":v>=50?"#1890ff":"#faad14"}/> },
    { title:"目标", dataIndex:"targetModel", width:140, ellipsis:true },
    { title:"创建时间", dataIndex:"createdAt", width:140, render:v=>v?dayjs(v).format("MM-DD HH:mm"):"-", sorter:(a,b)=>new Date(a.createdAt)-new Date(b.createdAt) },
    { title:"操作", key:"action", width:220, fixed:"right", render:(_,r)=>(
      <Space size={2}>
        <Button type="link" size="small" icon={<EyeOutlined/>} onClick={()=>{setSelected(r);setDetailVisible(true);}}>详情</Button>
        <Button type="link" size="small" icon={<CopyOutlined/>} onClick={()=>handleClone(r.id)}>克隆</Button>
        {(r.status==="PENDING"||r.status==="QUEUED"||r.status==="RUNNING")&&<Button type="link" size="small" danger icon={<StopOutlined/>} onClick={()=>handleCancel(r.id)}>取消</Button>}
        {r.status==="FAILED"&&<Button type="link" size="small" icon={<RedoOutlined/>} onClick={()=>handleRetry(r.id)}>重试</Button>}
        <Button type="link" size="small" danger icon={<DeleteOutlined/>} onClick={()=>handleDelete(r.id)}>删除</Button>
      </Space>
    )},
  ];

  const renderModeSelect = () => (
    <div style={{padding:"20px 0"}}>
      <Row gutter={[24,24]}>
        <Col span={12}><Card hoverable style={{textAlign:"center",border:createMode==="template"?"2px solid #1890ff":"1px solid #f0f0f0",minHeight:160}} onClick={()=>setCreateMode("template")}><AppstoreOutlined style={{fontSize:40,color:"#1890ff",marginBottom:12}}/><h3>模板化创建</h3><Text type="secondary">选择预置评测模板，快速创建任务</Text></Card></Col>
        <Col span={12}><Card hoverable style={{textAlign:"center",border:createMode==="custom"?"2px solid #1890ff":"1px solid #f0f0f0",minHeight:160}} onClick={()=>setCreateMode("custom")}><SettingOutlined style={{fontSize:40,color:"#722ed1",marginBottom:12}}/><h3>自定义创建</h3><Text type="secondary">灵活配置评测参数，定制化评测</Text></Card></Col>
      </Row>
      {createMode==="template" && <div style={{marginTop:24}}><Divider>选择评测模板</Divider><Row gutter={[16,16]}>
        {PRESET_TEMPLATES.map(t=>(<Col span={8} key={t.id}><Card size="small" hoverable style={{border:selectedTemplate?.id===t.id?"2px solid #1890ff":"1px solid #f0f0f0"}} onClick={()=>{setSelectedTemplate(t);form.setFieldsValue({evalType:t.evalType,evalObject:t.evalObject,metrics:t.metrics});}}><div style={{textAlign:"center",marginBottom:8}}>{React.cloneElement(t.icon,{style:{fontSize:28,color:"#1890ff"}})}</div><h4 style={{margin:0,textAlign:"center"}}>{t.name}</h4><Text type="secondary" style={{fontSize:12,display:"block",textAlign:"center"}}>{t.desc}</Text></Card></Col>))}
      </Row></div>}
    </div>
  );

  const renderBasicInfo = () => (
    <div style={{maxWidth:700,margin:"0 auto",padding:"20px 0"}}>
      <Form.Item name="name" label="任务名称" rules={[{required:true,message:"请输入任务名称"}]}><Input placeholder="例：华为昇腾910B ResNet50 推理性能评测" maxLength={100} showCount/></Form.Item>
      <Row gutter={16}>
        <Col span={12}><Form.Item name="evalType" label="评测类型" rules={[{required:true}]}><Select options={Object.entries(EVAL_TYPES).map(([k,v])=>({value:k,label:v}))} placeholder="选择评测类型"/></Form.Item></Col>
        <Col span={12}><Form.Item name="evalObject" label="评测对象" rules={[{required:true}]}><Select options={Object.entries(EVAL_OBJECTS).map(([k,v])=>({value:k,label:v}))} placeholder="选择评测对象"/></Form.Item></Col>
      </Row>
      <Form.Item name="targetModel" label="评测目标（模型/芯片/框架名称）" rules={[{required:true}]}><Input placeholder="例：ResNet50 / 华为昇腾910B / PyTorch 2.1"/></Form.Item>
      <Row gutter={16}>
        <Col span={12}><Form.Item name="priority" label="优先级" initialValue="MEDIUM"><Select options={Object.entries(PRIORITIES).map(([k,v])=>({value:k,label:v}))}/></Form.Item></Col>
        <Col span={12}><Form.Item name="tags" label="标签"><Select mode="tags" placeholder="输入标签后回车" tokenSeparators={[","]}/></Form.Item></Col>
      </Row>
      <Form.Item name="description" label="任务描述"><TextArea rows={3} placeholder="详细描述评测目的、关注点" maxLength={500} showCount/></Form.Item>
    </div>
  );

  const renderEvalConfig = () => (
    <div style={{maxWidth:700,margin:"0 auto",padding:"20px 0"}}>
      <Divider orientation="left">数据集配置</Divider>
      <Form.Item name="datasetSource" label="数据集来源" initialValue="preset"><Radio.Group><Radio.Button value="preset">预置数据集</Radio.Button><Radio.Button value="custom">自定义上传</Radio.Button></Radio.Group></Form.Item>
      <Form.Item noStyle shouldUpdate={(prev,cur)=>prev.datasetSource!==cur.datasetSource}>
        {({getFieldValue})=>getFieldValue("datasetSource")==="preset" ?
          <Form.Item name="datasetId" label="选择数据集"><Select options={PRESET_DATASETS} placeholder="选择预置数据集" allowClear/></Form.Item> :
          <Form.Item name="datasetFile" label="上传数据集"><Dragger accept=".csv,.xlsx,.zip,.tar.gz" maxCount={1}><p className="ant-upload-drag-icon"><InboxOutlined/></p><p>点击或拖拽上传数据集</p><p className="ant-upload-hint">支持 CSV, Excel, ZIP, TAR.GZ</p></Dragger></Form.Item>
        }
      </Form.Item>
      <Divider orientation="left">硬件资源</Divider>
      <Row gutter={16}>
        <Col span={12}><Form.Item name="gpuType" label="GPU/芯片型号"><Select options={GPU_OPTIONS} placeholder="选择芯片" allowClear/></Form.Item></Col>
        <Col span={12}><Form.Item name="gpuCount" label="GPU数量" initialValue={1}><InputNumber min={1} max={128} style={{width:"100%"}}/></Form.Item></Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}><Form.Item name="precision" label="精度类型" initialValue="FP16"><Select options={PRECISION_OPTIONS}/></Form.Item></Col>
        <Col span={12}><Form.Item name="batchSize" label="Batch Size" initialValue={32}><InputNumber min={1} max={1024} style={{width:"100%"}}/></Form.Item></Col>
      </Row>
      <Divider orientation="left">评测指标</Divider>
      <Form.Item name="metrics" label="选择评测指标"><Select mode="tags" placeholder="选择或输入自定义指标" tokenSeparators={[","]} options={[{value:"延迟(ms)"},{value:"吞吐量(QPS)"},{value:"GPU利用率(%)"},{value:"内存占用(GB)"},{value:"功耗(W)"},{value:"Top-1准确率"},{value:"F1值"},{value:"精度损失(%)"}]}/></Form.Item>
      <Divider orientation="left">执行配置</Divider>
      <Row gutter={16}>
        <Col span={8}><Form.Item name="timeout" label="超时时间(分钟)" initialValue={60}><InputNumber min={5} max={1440} style={{width:"100%"}}/></Form.Item></Col>
        <Col span={8}><Form.Item name="retryCount" label="自动重试次数" initialValue={0}><InputNumber min={0} max={5} style={{width:"100%"}}/></Form.Item></Col>
        <Col span={8}><Form.Item name="retryInterval" label="重试间隔(分钟)" initialValue={10}><InputNumber min={1} max={60} style={{width:"100%"}}/></Form.Item></Col>
      </Row>
      <Form.Item name="enableAlert" label="异常告警" valuePropName="checked" initialValue={true}><Switch checkedChildren="开启" unCheckedChildren="关闭"/></Form.Item>
      <Form.Item name="alertEmail" label="告警邮箱"><Input placeholder="接收告警通知的邮箱地址"/></Form.Item>
    </div>
  );

  const renderConfirm = () => {
    const vals = form.getFieldsValue(true);
    return (
      <div style={{maxWidth:700,margin:"0 auto",padding:"20px 0"}}>
        <Alert message="请确认任务配置信息" description="提交后将进入任务队列等待执行" type="info" showIcon style={{marginBottom:24}}/>
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="创建模式">{createMode==="template"?"模板化创建":"自定义创建"}</Descriptions.Item>
          {selectedTemplate && <Descriptions.Item label="使用模板">{selectedTemplate.name}</Descriptions.Item>}
          <Descriptions.Item label="任务名称" span={2}>{vals.name||"-"}</Descriptions.Item>
          <Descriptions.Item label="评测类型">{EVAL_TYPES[vals.evalType]||"-"}</Descriptions.Item>
          <Descriptions.Item label="评测对象">{EVAL_OBJECTS[vals.evalObject]||"-"}</Descriptions.Item>
          <Descriptions.Item label="评测目标" span={2}>{vals.targetModel||"-"}</Descriptions.Item>
          <Descriptions.Item label="优先级"><Tag color={PRIORITY_COLORS[vals.priority]}>{PRIORITIES[vals.priority]||"中"}</Tag></Descriptions.Item>
          <Descriptions.Item label="GPU">{GPU_OPTIONS.find(g=>g.value===vals.gpuType)?.label||"未指定"} x {vals.gpuCount||1}</Descriptions.Item>
          <Descriptions.Item label="精度">{vals.precision||"FP16"}</Descriptions.Item>
          <Descriptions.Item label="Batch Size">{vals.batchSize||32}</Descriptions.Item>
          <Descriptions.Item label="超时">{vals.timeout||60} 分钟</Descriptions.Item>
          <Descriptions.Item label="重试">{vals.retryCount||0} 次，间隔 {vals.retryInterval||10} 分钟</Descriptions.Item>
          {vals.metrics?.length>0 && <Descriptions.Item label="评测指标" span={2}>{vals.metrics.map(m=><Tag key={m} color="blue">{m}</Tag>)}</Descriptions.Item>}
          {vals.tags?.length>0 && <Descriptions.Item label="标签" span={2}>{vals.tags.map(t=><Tag key={t}>{t}</Tag>)}</Descriptions.Item>}
          {vals.description && <Descriptions.Item label="描述" span={2}>{vals.description}</Descriptions.Item>}
        </Descriptions>
      </div>
    );
  };

  const stepContents = [renderModeSelect, renderBasicInfo, renderEvalConfig, renderConfirm];
  const canNext = () => { if(createStep===0) return createMode==="custom"||(createMode==="template"&&selectedTemplate); return true; };

  return (
    <div>
      <Row gutter={16} style={{marginBottom:24}}>
        {[["总任务","total",<ProjectOutlined/>,null],["排队中","queued",null,"#faad14"],["执行中","running",null,"#1890ff"],["已完成","completed",null,"#52c41a"],["失败","failed",null,"#ff4d4f"],["已取消","cancelled",null,null]].map(([t,k,icon,color],i)=>(
          <Col span={4} key={k}><Card hoverable size="small"><Statistic title={t} value={stats[k]||0} prefix={icon} valueStyle={color?{color}:{}}/></Card></Col>
        ))}
      </Row>
      <Card title={<span>评测任务 {selectedKeys.length>0&&<Tag color="blue">已选 {selectedKeys.length} 项</Tag>}</span>} extra={<Space>
        <Input placeholder="搜索任务" prefix={<SearchOutlined/>} value={searchText} onChange={e=>setSearchText(e.target.value)} onPressEnter={fetchTasks} style={{width:160}} allowClear/>
        <Select placeholder="状态筛选" allowClear style={{width:110}} value={statusFilter} onChange={setStatusFilter} options={Object.entries(STATUS_MAP).map(([k,v])=>({value:k,label:v}))}/>
        <Button onClick={()=>{fetchTasks();fetchStats();}} icon={<ReloadOutlined/>}>刷新</Button>
        {selectedKeys.length>0&&<><Button danger onClick={handleBatchCancel}>批量取消</Button><Button danger type="primary" onClick={handleBatchDelete}>批量删除</Button></>}
        <Button type="primary" icon={<PlusOutlined/>} size="large" onClick={()=>setCreateVisible(true)}>创建评测任务</Button>
      </Space>}>
        <Table columns={columns} dataSource={tasks} rowKey="id" loading={loading} scroll={{x:1500}} pagination={{pageSize:15,showTotal:t=>"共 "+t+" 条",showSizeChanger:true}} rowSelection={{selectedRowKeys:selectedKeys,onChange:setSelectedKeys}}/>
      </Card>

      <Modal title="创建评测任务" open={createVisible} onCancel={resetCreate} footer={null} width={900} destroyOnClose>
        <Steps current={createStep} style={{marginBottom:24}} items={[{title:"选择模式",icon:<AppstoreOutlined/>},{title:"基础信息",icon:<ProjectOutlined/>},{title:"评测配置",icon:<SettingOutlined/>},{title:"确认提交",icon:<CheckCircleOutlined/>}]}/>
        <Form form={form} onFinish={handleCreate} layout="vertical" initialValues={{priority:"MEDIUM",precision:"FP16",batchSize:32,timeout:60,retryCount:0,retryInterval:10,enableAlert:true,datasetSource:"preset"}}>
          {stepContents[createStep]()}
          <Divider/>
          <div style={{textAlign:"right"}}>
            {createStep>0 && <Button style={{marginRight:8}} onClick={()=>setCreateStep(s=>s-1)}>上一步</Button>}
            {createStep<3 && <Button type="primary" disabled={!canNext()} onClick={()=>setCreateStep(s=>s+1)}>下一步</Button>}
            {createStep===3 && <Button type="primary" size="large" htmlType="submit" icon={<RocketOutlined/>}>提交任务</Button>}
          </div>
        </Form>
      </Modal>

      <Modal title="任务详情" open={detailVisible} onCancel={()=>setDetailVisible(false)} width={800} footer={null}>
        {selected && <Tabs items={[
          {key:"info",label:"基本信息",children:(<Descriptions bordered column={2} size="small">
            <Descriptions.Item label="编号">{selected.taskNo}</Descriptions.Item>
            <Descriptions.Item label="状态"><Badge status={STATUS_COLORS[selected.status]} text={STATUS_MAP[selected.status]}/></Descriptions.Item>
            <Descriptions.Item label="名称" span={2}>{selected.name}</Descriptions.Item>
            <Descriptions.Item label="评测类型"><Tag color="blue">{EVAL_TYPES[selected.evalType]||selected.evalType}</Tag></Descriptions.Item>
            <Descriptions.Item label="评测对象"><Tag>{EVAL_OBJECTS[selected.evalObject]||selected.evalObject||"-"}</Tag></Descriptions.Item>
            <Descriptions.Item label="优先级"><Tag color={PRIORITY_COLORS[selected.priority]}>{PRIORITIES[selected.priority]||selected.priority}</Tag></Descriptions.Item>
            <Descriptions.Item label="目标">{selected.targetModel||"-"}</Descriptions.Item>
            <Descriptions.Item label="进度" span={2}><Progress percent={selected.progress||0} style={{maxWidth:300}}/></Descriptions.Item>
            <Descriptions.Item label="创建时间">{dayjs(selected.createdAt).format("YYYY-MM-DD HH:mm:ss")}</Descriptions.Item>
            {selected.completedAt&&<Descriptions.Item label="完成时间">{dayjs(selected.completedAt).format("YYYY-MM-DD HH:mm:ss")}</Descriptions.Item>}
            {selected.description&&<Descriptions.Item label="描述" span={2}>{selected.description}</Descriptions.Item>}
            {selected.errorMessage&&<Descriptions.Item label="错误信息" span={2}><Text type="danger">{selected.errorMessage}</Text></Descriptions.Item>}
          </Descriptions>)},
          {key:"config",label:"评测配置",children:(<Descriptions bordered column={2} size="small">
            <Descriptions.Item label="GPU型号">{selected.gpuType||"未指定"}</Descriptions.Item>
            <Descriptions.Item label="GPU数量">{selected.gpuCount||"-"}</Descriptions.Item>
            <Descriptions.Item label="精度">{selected.precision||"-"}</Descriptions.Item>
            <Descriptions.Item label="Batch Size">{selected.batchSize||"-"}</Descriptions.Item>
            <Descriptions.Item label="数据集">{selected.datasetId||"未指定"}</Descriptions.Item>
            <Descriptions.Item label="超时">{selected.timeout||"-"} 分钟</Descriptions.Item>
            <Descriptions.Item label="重试次数">{selected.retryCount||0}</Descriptions.Item>
            <Descriptions.Item label="重试间隔">{selected.retryInterval||"-"} 分钟</Descriptions.Item>
            {selected.metrics&&<Descriptions.Item label="评测指标" span={2}>{selected.metrics.split(",").map(m=><Tag key={m} color="blue">{m.trim()}</Tag>)}</Descriptions.Item>}
          </Descriptions>)},
          {key:"log",label:"执行日志",children:(<div style={{background:"#1e1e1e",color:"#d4d4d4",padding:16,borderRadius:8,minHeight:200,fontFamily:"monospace",fontSize:12}}><p>[{dayjs().format("HH:mm:ss")}] 任务日志加载中...</p><p>[INFO] 暂无执行日志数据</p></div>)},
        ]}/>}
      </Modal>
    </div>
  );
}
