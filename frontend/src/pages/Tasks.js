import React, { useState, useEffect } from "react";
import { Card, Table, Tag, Space, Button, Row, Col, Statistic, Modal, Form, Input, Select, message, Badge, Progress, Steps, Divider, InputNumber, Switch, Upload, Tabs, Descriptions, Radio, Alert, Typography } from "antd";
import { ProjectOutlined, PlusOutlined, ReloadOutlined, EyeOutlined, DeleteOutlined, CopyOutlined, StopOutlined, RedoOutlined, SearchOutlined, InboxOutlined, SettingOutlined, ThunderboltOutlined, CheckCircleOutlined, ExperimentOutlined, RocketOutlined, ApiOutlined, AppstoreOutlined, CloudServerOutlined, FileTextOutlined } from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";
const { TextArea } = Input;
const { Dragger } = Upload;
const { Text } = Typography;

const EVAL_TYPES = { PERFORMANCE:"性能评测", ACCURACY:"精度评测", COMPATIBILITY:"兼容性评测", STABILITY:"稳定性评测", GENERAL:"通用评测" };
const PRIORITIES = { HIGH:"高", MEDIUM:"中", LOW:"低" };
const PRIORITY_COLORS = { HIGH:"red", MEDIUM:"blue", LOW:"default" };
const STATUS_MAP = { PENDING:"待执行", QUEUED:"排队中", RUNNING:"执行中", COMPLETED:"已完成", FAILED:"失败", CANCELLED:"已取消", TERMINATED:"已终止" };
const STATUS_COLORS = { PENDING:"default", QUEUED:"warning", RUNNING:"processing", COMPLETED:"success", FAILED:"error", CANCELLED:"default", TERMINATED:"default" };

const PRESET_TEMPLATES = [
  { id:"chip_perf", name:"芯片性能评测", icon:<ThunderboltOutlined/>, evalType:"PERFORMANCE", desc:"GPU/NPU算力密度、能效比、多卡互联测试", metrics:["算力(TOPS)","能效比(TOPS/W)","互联带宽(GB/s)","P95延迟"] },
  { id:"model_accuracy", name:"模型精度评测", icon:<ExperimentOutlined/>, evalType:"ACCURACY", desc:"模型在不同精度下的准确率、召回率、F1评估", metrics:["Top-1准确率","Top-5准确率","F1值","精度损失%"] },
  { id:"model_perf", name:"模型推理性能", icon:<RocketOutlined/>, evalType:"PERFORMANCE", desc:"推理延迟、吞吐量、资源利用率测试", metrics:["首包延迟","P95延迟","吞吐量(QPS)","GPU利用率"] },
  { id:"framework_compat", name:"框架兼容性评测", icon:<ApiOutlined/>, evalType:"COMPATIBILITY", desc:"框架在国产芯片上的适配性、算子支持率测试", metrics:["安装成功率","模型加载率","算子支持率","兼容性评分"] },
  { id:"operator_perf", name:"算子性能评测", icon:<AppstoreOutlined/>, evalType:"PERFORMANCE", desc:"单算子/融合算子执行延迟、精度损失测试", metrics:["执行延迟","吞吐量","精度损失","算力利用率"] },
  { id:"scene_effect", name:"场景效果评测", icon:<SettingOutlined/>, evalType:"PERFORMANCE", desc:"行业场景下模型实际应用效果量化评估", metrics:["准确率","召回率","业务指标","适配性评分"] },
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
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [form] = Form.useForm();
  const [backendResources, setBackendResources] = useState([]);
  const [backendDatasets, setBackendDatasets] = useState([]);
  const [computeNodes, setComputeNodes] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [taskReport, setTaskReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  const fetchTasks = async () => { setLoading(true); try { const params = {size:100}; if(statusFilter) params.status=statusFilter; if(searchText) params.keyword=searchText; const r = await api.get("/tasks",{params}); if(r.data.code===0) setTasks(r.data.data||[]); } catch(e){message.error("获取失败");} finally{setLoading(false);} };
  const fetchStats = async () => { try { const r = await api.get("/tasks/stats"); if(r.data.code===0) setStats(r.data.data); } catch(e){} };
  const fetchResources = async () => { try { const r = await api.get("/resources", {params:{size:100}}); if(r.data.code===0) setBackendResources(r.data.data||[]); } catch(e){} };
  const fetchDatasets = async () => { try { const r = await api.get("/assets", {params:{assetType:"DATASET",size:100}}); if(r.data.code===0) setBackendDatasets(r.data.data||[]); } catch(e){} };
  const fetchNodes = async () => { try { const r = await api.get("/nodes"); if(r.data.code===0) { const nodes = r.data.data||[]; setComputeNodes(nodes); const online = nodes.filter(n=>n.status==="ONLINE"); if(online.length===1) setSelectedNodeId(online[0].id); } } catch(e){} };
  const fetchExecutions = async (taskId) => { try { const r = await api.get(`/tasks/${taskId}/executions`); if(r.data.code===0) setExecutions(r.data.data||[]); } catch(e){} };
  const fetchTaskReport = async (taskId) => { setReportLoading(true); try { const r = await api.get("/reports", {params:{taskId,page:0,size:1}}); if(r.data.code===0 && r.data.data && r.data.data.length>0) { setTaskReport(r.data.data[0]); } else { setTaskReport(null); } } catch(e){ setTaskReport(null); } finally{ setReportLoading(false); } };

  useEffect(() => { fetchTasks(); fetchStats(); fetchResources(); fetchDatasets(); fetchNodes(); }, []);

  const handleCreate = async (values) => {
    const payload = { ...values, metrics: values.metrics ? values.metrics.join(",") : "", tags: values.tags ? values.tags.join(",") : "" };
    if (selectedTemplate) { payload.templateId = selectedTemplate.id; payload.evalType = selectedTemplate.evalType; }
    if (selectedNodeId) { payload.targetNodeId = selectedNodeId; }
    try { const r = await api.post("/tasks", payload); if(r.data.code===0) { message.success("任务创建成功，已自动调度执行"); resetCreate(); fetchTasks(); fetchStats(); } else message.error(r.data.message||"创建失败"); } catch(e) { message.error("创建失败"); }
  };
  const resetCreate = () => { setCreateVisible(false); setCreateStep(0); setCreateMode(null); setSelectedTemplate(null); setSelectedNodeId(null); form.resetFields(); };
  const handleCancel = (id) => { Modal.confirm({title:"确定取消任务？",okText:"确认取消",okType:"danger",onOk:()=>api.post("/tasks/"+id+"/cancel").then(()=>{message.success("已取消");fetchTasks();fetchStats();})}); };
  const handleRetry = (id) => { api.post("/tasks/"+id+"/retry").then(()=>{message.success("已重试，自动调度中...");fetchTasks();fetchStats();}).catch(()=>message.error("失败")); };
  const handleClone = (id) => { api.post("/tasks/"+id+"/clone").then(()=>{message.success("已克隆并自动调度");fetchTasks();fetchStats();}).catch(()=>message.error("失败")); };
  const handleDelete = (id) => { Modal.confirm({title:"确定删除？",content:"删除后不可恢复",okText:"删除",okType:"danger",onOk:()=>api.delete("/tasks/"+id).then(()=>{message.success("已删除");fetchTasks();fetchStats();})}); };
  const handleBatchCancel = () => { api.post("/tasks/batch/cancel",{ids:selectedKeys}).then(()=>{message.success("批量取消成功");setSelectedKeys([]);fetchTasks();fetchStats();}); };
  const handleBatchDelete = () => { Modal.confirm({title:"确定批量删除？",okType:"danger",onOk:()=>api.post("/tasks/batch/delete",{ids:selectedKeys}).then(()=>{message.success("已删除");setSelectedKeys([]);fetchTasks();fetchStats();})}); };

  const showDetail = (record) => {
    setSelected(record);
    setDetailVisible(true);
    setTaskReport(null);
    fetchExecutions(record.id);
    if (record.status === "COMPLETED") {
      fetchTaskReport(record.id);
    }
  };

  const isPreset = (record) => record.tags && record.tags.includes("SYSTEM_PRESET");

  const columns = [
    { title:"任务编号", dataIndex:"taskNo", width:140, ellipsis:true, fixed:"left" },
    { title:"名称", dataIndex:"name", ellipsis:true, width:260, render:(v,r)=><span>{v} {isPreset(r) && <Tag color="purple" style={{marginLeft:4,fontSize:11}}>📦 系统预置</Tag>}</span> },
    { title:"评测类型", dataIndex:"evalType", width:100, render:v=><Tag color="blue">{EVAL_TYPES[v]||v}</Tag> },
    { title:"优先级", dataIndex:"priority", width:70, render:v=><Tag color={PRIORITY_COLORS[v]}>{PRIORITIES[v]||v}</Tag> },
    { title:"状态", dataIndex:"status", width:90, render:v=><Badge status={STATUS_COLORS[v]} text={STATUS_MAP[v]||v}/> },
    { title:"进度", dataIndex:"progress", width:120, render:v=><Progress percent={v||0} size="small" strokeColor={v>=100?"#52c41a":v>=50?"#1890ff":"#faad14"}/> },
    { title:"创建时间", dataIndex:"createdAt", width:140, render:v=>v?dayjs(v).format("MM-DD HH:mm"):"-", sorter:(a,b)=>new Date(a.createdAt)-new Date(b.createdAt) },
    { title:"操作", key:"action", width:220, fixed:"right", render:(_,r)=>(
      <Space size={2}>
        <Button type="link" size="small" icon={<EyeOutlined/>} onClick={()=>showDetail(r)}>详情</Button>
        <Button type="link" size="small" icon={<CopyOutlined/>} onClick={()=>handleClone(r.id)}>克隆</Button>
        {(r.status==="PENDING"||r.status==="QUEUED"||r.status==="RUNNING")&&<Button type="link" size="small" danger icon={<StopOutlined/>} onClick={()=>handleCancel(r.id)}>取消</Button>}
        {r.status==="FAILED"&&<Button type="link" size="small" icon={<RedoOutlined/>} onClick={()=>handleRetry(r.id)}>重试</Button>}
        {!isPreset(r) && <Button type="link" size="small" danger icon={<DeleteOutlined/>} onClick={()=>handleDelete(r.id)}>删除</Button>}
      </Space>
    )},
  ];

  const onlineNodes = computeNodes.filter(n => n.status === "ONLINE");

  // ===== Template Flow: Step 0 - Mode Select =====
  const renderModeSelect = () => (
    <div style={{padding:"20px 0"}}>
      <Row gutter={[24,24]}>
        <Col span={12}><Card hoverable style={{textAlign:"center",border:createMode==="template"?"2px solid #1890ff":"1px solid #f0f0f0",minHeight:160}} onClick={()=>setCreateMode("template")}><AppstoreOutlined style={{fontSize:40,color:"#1890ff",marginBottom:12}}/><h3>模板化创建</h3><Text type="secondary">选择预置评测模板，快速创建任务</Text></Card></Col>
        <Col span={12}><Card hoverable style={{textAlign:"center",border:createMode==="custom"?"2px solid #1890ff":"1px solid #f0f0f0",minHeight:160}} onClick={()=>setCreateMode("custom")}><SettingOutlined style={{fontSize:40,color:"#722ed1",marginBottom:12}}/><h3>自定义创建</h3><Text type="secondary">灵活配置评测参数，定制化评测</Text></Card></Col>
      </Row>
    </div>
  );

  // ===== Template Flow: Step 1 - Select Template =====
  const renderTemplateSelect = () => (
    <div style={{padding:"20px 0"}}>
      <Divider>选择评测模板</Divider>
      <Row gutter={[16,16]}>
        {PRESET_TEMPLATES.map(t=>(
          <Col span={8} key={t.id}>
            <Card size="small" hoverable style={{border:selectedTemplate?.id===t.id?"2px solid #1890ff":"1px solid #f0f0f0",minHeight:140}} onClick={()=>{setSelectedTemplate(t);form.setFieldsValue({evalType:t.evalType,metrics:t.metrics});}}>
              <div style={{textAlign:"center",marginBottom:8}}>{React.cloneElement(t.icon,{style:{fontSize:28,color:"#1890ff"}})}</div>
              <h4 style={{margin:0,textAlign:"center"}}>{t.name}</h4>
              <Text type="secondary" style={{fontSize:12,display:"block",textAlign:"center",marginTop:4}}>{t.desc}</Text>
              <div style={{marginTop:8,textAlign:"center"}}>{t.metrics.slice(0,2).map(m=><Tag key={m} color="blue" style={{fontSize:11}}>{m}</Tag>)}{t.metrics.length>2 && <Tag style={{fontSize:11}}>+{t.metrics.length-2}</Tag>}</div>
            </Card>
          </Col>
        ))}
      </Row>
      {selectedTemplate && <Alert message={`已选择: ${selectedTemplate.name}`} type="success" showIcon style={{marginTop:16}}/>}
    </div>
  );

  // ===== Template Flow: Step 2 - Select Node =====
  const renderNodeSelect = () => (
    <div style={{padding:"20px 0",maxWidth:700,margin:"0 auto"}}>
      <Divider><CloudServerOutlined /> 选择计算节点</Divider>
      {onlineNodes.length === 0 && <Alert message="当前无在线计算节点" description="任务创建后将排队等待节点上线" type="warning" showIcon style={{marginBottom:16}}/>}
      {onlineNodes.length > 0 && (
        <Radio.Group value={selectedNodeId} onChange={e=>setSelectedNodeId(e.target.value)} style={{width:"100%"}}>
          <Space direction="vertical" style={{width:"100%"}}>
            {onlineNodes.map(node=>(
              <Radio key={node.id} value={node.id} style={{width:"100%"}}>
                <Card size="small" hoverable style={{display:"inline-block",width:"calc(100% - 24px)",border:selectedNodeId===node.id?"2px solid #1890ff":"1px solid #f0f0f0",marginLeft:8}}>
                  <Row justify="space-between" align="middle">
                    <Col>
                      <Space>
                        <Badge status="success"/>
                        <Text strong>{node.name}</Text>
                        <Tag color="green">在线</Tag>
                        {node.ipAddress && <Text type="secondary" style={{fontSize:12}}>({node.ipAddress})</Text>}
                      </Space>
                    </Col>
                    <Col>
                      {node.hardwareInfo && <Space size={16}>
                        <Text type="secondary" style={{fontSize:12}}>CPU: {node.hardwareInfo.cpu_cores_logical}核</Text>
                        <Text type="secondary" style={{fontSize:12}}>内存: {node.hardwareInfo.memory_total_gb?.toFixed(1)}GB</Text>
                        <Text type="secondary" style={{fontSize:12}}>磁盘余: {node.hardwareInfo.disk_free_gb?.toFixed(1)}GB</Text>
                      </Space>}
                    </Col>
                  </Row>
                  {node.latestMetrics && <div style={{marginTop:8}}>
                    <Space size={16}>
                      <Text type="secondary" style={{fontSize:11}}>CPU: {node.latestMetrics.cpuPercent}%</Text>
                      <Text type="secondary" style={{fontSize:11}}>内存: {node.latestMetrics.memoryUsedPercent}%</Text>
                      <Text type="secondary" style={{fontSize:11}}>磁盘: {node.latestMetrics.diskUsedPercent}%</Text>
                      <Text type="secondary" style={{fontSize:11}}>负载: {node.latestMetrics.load1m}</Text>
                    </Space>
                  </div>}
                </Card>
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      )}
      {onlineNodes.length === 1 && <Alert message="仅一个在线节点，已自动选中" type="info" showIcon style={{marginTop:12}}/>}
    </div>
  );

  // ===== Template Flow: Step 3 - Confirm =====
  const renderTemplateConfirm = () => {
    const selectedNode = computeNodes.find(n => n.id === selectedNodeId);
    return (
      <div style={{maxWidth:700,margin:"0 auto",padding:"20px 0"}}>
        <Alert message="请确认任务配置" description="提交后将自动调度到计算节点执行" type="info" showIcon style={{marginBottom:24}}/>
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="创建模式">模板化创建</Descriptions.Item>
          <Descriptions.Item label="使用模板">{selectedTemplate?.name || "-"}</Descriptions.Item>
          <Descriptions.Item label="评测类型" span={2}><Tag color="blue">{EVAL_TYPES[selectedTemplate?.evalType]||"-"}</Tag></Descriptions.Item>
          <Descriptions.Item label="目标计算节点" span={2}>
            {selectedNode ? <><Badge status="success"/> {selectedNode.name} ({selectedNode.ipAddress})</> : <Text type="secondary">自动分配</Text>}
          </Descriptions.Item>
          {selectedTemplate?.metrics && <Descriptions.Item label="评测指标" span={2}>{selectedTemplate.metrics.map(m=><Tag key={m} color="blue">{m}</Tag>)}</Descriptions.Item>}
          <Descriptions.Item label="模板描述" span={2}>{selectedTemplate?.desc || "-"}</Descriptions.Item>
        </Descriptions>
      </div>
    );
  };

  // ===== Custom Flow: Step 1 - Basic Info =====
  const renderBasicInfo = () => (
    <div style={{maxWidth:700,margin:"0 auto",padding:"20px 0"}}>
      <Form.Item name="name" label="任务名称" rules={[{required:true,message:"请输入任务名称"}]}><Input placeholder="例：华为昇腾910B ResNet50 推理性能评测" maxLength={100} showCount/></Form.Item>
      <Form.Item name="evalType" label="评测类型" rules={[{required:true}]}><Select options={Object.entries(EVAL_TYPES).map(([k,v])=>({value:k,label:v}))} placeholder="选择评测类型"/></Form.Item>
      <Row gutter={16}>
        <Col span={12}><Form.Item name="priority" label="优先级" initialValue="MEDIUM"><Select options={Object.entries(PRIORITIES).map(([k,v])=>({value:k,label:v}))}/></Form.Item></Col>
        <Col span={12}><Form.Item name="tags" label="标签"><Select mode="tags" placeholder="输入标签后回车" tokenSeparators={[","]}/></Form.Item></Col>
      </Row>
      <Form.Item name="description" label="任务描述"><TextArea rows={3} placeholder="详细描述评测目的、关注点" maxLength={500} showCount/></Form.Item>
    </div>
  );

  // ===== Custom Flow: Step 2 - Eval Config =====
  const renderEvalConfig = () => (
    <div style={{maxWidth:700,margin:"0 auto",padding:"20px 0"}}>
      <Divider orientation="left">数据集配置</Divider>
      <Form.Item name="datasetSource" label="数据集来源" initialValue="preset"><Radio.Group><Radio.Button value="preset">数字资产数据集</Radio.Button><Radio.Button value="custom">自定义上传</Radio.Button></Radio.Group></Form.Item>
      <Form.Item noStyle shouldUpdate={(prev,cur)=>prev.datasetSource!==cur.datasetSource}>
        {({getFieldValue})=>getFieldValue("datasetSource")==="preset" ?
          <>{backendDatasets.length>0 ? <Form.Item name="datasetId" label="选择数据集" rules={[{required:true,message:"请选择数据集"}]}><Select placeholder="选择数据集" options={backendDatasets.map(d=>({value:String(d.id),label:d.name+(d.assetType?" ("+d.assetType+")":"")+((d.version&&d.version!=="null")?" v"+d.version:"")}))} allowClear showSearch optionFilterProp="label"/></Form.Item> : <Alert message="暂无可用数据集" description="请先在数字资产模块中上传数据集，然后再创建评测任务。" type="warning" showIcon style={{marginBottom:16}}/>}</> :
          <Form.Item name="datasetFile" label="上传数据集"><Dragger accept=".csv,.xlsx,.zip,.tar.gz" maxCount={1}><p className="ant-upload-drag-icon"><InboxOutlined/></p><p>点击或拖拽上传数据集</p><p className="ant-upload-hint">支持 CSV, Excel, ZIP, TAR.GZ</p></Dragger></Form.Item>
        }
      </Form.Item>
      <Divider orientation="left">硬件资源</Divider>
      <Row gutter={16}>
        <Col span={12}><Form.Item name="gpuType" label="GPU/芯片型号"><Select placeholder="选择芯片" options={backendResources.length>0 ? backendResources.map(r=>({value:String(r.id),label:r.name+(r.model?" ("+r.model+")":"")})) : GPU_OPTIONS} allowClear/></Form.Item></Col>
        <Col span={12}><Form.Item name="gpuCount" label="GPU数量" initialValue={1}><InputNumber min={1} max={128} style={{width:"100%"}}/></Form.Item></Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}><Form.Item name="precision" label="精度类型" initialValue="FP16"><Select options={PRECISION_OPTIONS}/></Form.Item></Col>
        <Col span={12}><Form.Item name="batchSize" label="Batch Size" initialValue={32}><InputNumber min={1} max={1024} style={{width:"100%"}}/></Form.Item></Col>
      </Row>

      <Divider orientation="left"><CloudServerOutlined /> 目标计算节点</Divider>
      <Form.Item name="targetNodeId" label="选择计算节点" extra="不选择则自动分配在线节点">
        <Select placeholder="自动分配（推荐）" allowClear style={{width:"100%"}}>
          {computeNodes.map(node => (
            <Select.Option key={node.id} value={node.id} disabled={node.status !== "ONLINE"}>
              <Space>
                <Badge status={node.status === "ONLINE" ? "success" : "default"} />
                <span>{node.name}</span>
                <Tag color={node.tags && node.tags.includes("GPU") ? "blue" : "green"} style={{marginLeft:4}}>
                  {node.tags && node.tags.includes("GPU") ? "GPU" : "CPU"}
                </Tag>
                <Text type="secondary" style={{fontSize:12}}>
                  {node.status === "ONLINE" ? "在线" : "离线"}{node.ipAddress ? ` (${node.ipAddress})` : ""}
                </Text>
              </Space>
            </Select.Option>
          ))}
        </Select>
      </Form.Item>
      {onlineNodes.length === 0 && <Alert message="当前无在线计算节点，任务创建后将排队等待" type="warning" showIcon style={{marginBottom:16}}/>}

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

  // ===== Custom Flow: Step 3 - Confirm =====
  const renderCustomConfirm = () => {
    const vals = form.getFieldsValue(true);
    const selectedNode = computeNodes.find(n => n.id === vals.targetNodeId);
    return (
      <div style={{maxWidth:700,margin:"0 auto",padding:"20px 0"}}>
        <Alert message="请确认任务配置信息" description="提交后将自动调度到计算节点执行" type="info" showIcon style={{marginBottom:24}}/>
        <Descriptions bordered column={2} size="small">
          <Descriptions.Item label="创建模式">自定义创建</Descriptions.Item>
          <Descriptions.Item label="任务名称">{vals.name||"-"}</Descriptions.Item>
          <Descriptions.Item label="评测类型">{EVAL_TYPES[vals.evalType]||"-"}</Descriptions.Item>
          <Descriptions.Item label="优先级"><Tag color={PRIORITY_COLORS[vals.priority]}>{PRIORITIES[vals.priority]||"中"}</Tag></Descriptions.Item>
          <Descriptions.Item label="目标节点" span={2}>
            {selectedNode ? <><Badge status="success"/> {selectedNode.name}</> : <Text type="secondary">自动分配</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="GPU">{GPU_OPTIONS.find(g=>g.value===vals.gpuType)?.label||"未指定"} x {vals.gpuCount||1}</Descriptions.Item>
          <Descriptions.Item label="精度">{vals.precision||"FP16"}</Descriptions.Item>
          <Descriptions.Item label="Batch Size">{vals.batchSize||32}</Descriptions.Item>
          <Descriptions.Item label="超时">{vals.timeout||60} 分钟</Descriptions.Item>
          {vals.metrics?.length>0 && <Descriptions.Item label="评测指标" span={2}>{vals.metrics.map(m=><Tag key={m} color="blue">{m}</Tag>)}</Descriptions.Item>}
          {vals.tags?.length>0 && <Descriptions.Item label="标签" span={2}>{vals.tags.map(t=><Tag key={t}>{t}</Tag>)}</Descriptions.Item>}
          {vals.description && <Descriptions.Item label="描述" span={2}>{vals.description}</Descriptions.Item>}
        </Descriptions>
      </div>
    );
  };

  // ===== Step logic =====
  const getStepItems = () => {
    if (createMode === "template") {
      return [
        {title:"选择模式",icon:<AppstoreOutlined/>},
        {title:"选择模板",icon:<ExperimentOutlined/>},
        {title:"选择节点",icon:<CloudServerOutlined/>},
        {title:"确认提交",icon:<CheckCircleOutlined/>},
      ];
    }
    // custom mode or default
    return [
      {title:"选择模式",icon:<AppstoreOutlined/>},
      {title:"基础信息",icon:<ProjectOutlined/>},
      {title:"评测配置",icon:<SettingOutlined/>},
      {title:"确认提交",icon:<CheckCircleOutlined/>},
    ];
  };

  const getStepContent = () => {
    if (createStep === 0) return renderModeSelect();
    if (createMode === "template") {
      if (createStep === 1) return renderTemplateSelect();
      if (createStep === 2) return renderNodeSelect();
      if (createStep === 3) return renderTemplateConfirm();
    } else {
      if (createStep === 1) return renderBasicInfo();
      if (createStep === 2) return renderEvalConfig();
      if (createStep === 3) return renderCustomConfirm();
    }
    return null;
  };

  const canNext = () => {
    if (createStep === 0) return !!createMode;
    if (createMode === "template") {
      if (createStep === 1) return !!selectedTemplate;
      if (createStep === 2) return true; // node can be optional
    }
    return true;
  };

  const handleNext = async () => {
    if (createStep === 0) {
      if (canNext()) setCreateStep(1);
    } else if (createMode === "template") {
      if (createStep === 1 && selectedTemplate) setCreateStep(2);
      else if (createStep === 2) setCreateStep(3);
    } else {
      // custom mode
      if (createStep === 1) {
        try {
          await form.validateFields(["name", "evalType"]);
          setCreateStep(2);
        } catch (e) { /* validation errors shown */ }
      } else if (createStep === 2) {
        setCreateStep(3);
      }
    }
  };

  const handleSubmit = async () => {
    if (createMode === "template") {
      // Template mode: directly create with template info
      const payload = {
        name: `${selectedTemplate.name} - ${dayjs().format("MMDD-HHmm")}`,
        evalType: selectedTemplate.evalType,
        templateId: selectedTemplate.id,
        metrics: selectedTemplate.metrics.join(","),
      };
      if (selectedNodeId) payload.targetNodeId = selectedNodeId;
      try {
        const r = await api.post("/tasks", payload);
        if(r.data.code===0) { message.success("任务创建成功，已自动调度执行"); resetCreate(); fetchTasks(); fetchStats(); }
        else message.error(r.data.message||"创建失败");
      } catch(e) { message.error("创建失败"); }
    } else {
      // Custom mode
      try {
        const values = await form.validateFields();
        handleCreate(values);
      } catch (e) { message.error("请检查必填字段是否填写完整"); }
    }
  };

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
        <Button type="primary" icon={<PlusOutlined/>} size="large" onClick={()=>{setCreateVisible(true);fetchNodes();}}>创建评测任务</Button>
      </Space>}>
        <Table columns={columns} dataSource={tasks} rowKey="id" loading={loading} scroll={{x:1200}} pagination={{pageSize:15,showTotal:t=>"共 "+t+" 条",showSizeChanger:true}} rowSelection={{selectedRowKeys:selectedKeys,onChange:setSelectedKeys}}/>
      </Card>

      <Modal title="创建评测任务" open={createVisible} onCancel={resetCreate} footer={null} width={900} destroyOnClose>
        <Steps current={createStep} style={{marginBottom:24}} items={getStepItems()}/>
        <Form form={form} onFinish={handleCreate} layout="vertical" initialValues={{priority:"MEDIUM",precision:"FP16",batchSize:32,timeout:60,retryCount:0,retryInterval:10,enableAlert:true,datasetSource:"preset"}}>
          {getStepContent()}
          <Divider/>
          <div style={{textAlign:"right"}}>
            {createStep>0 && <Button style={{marginRight:8}} onClick={()=>setCreateStep(s=>s-1)}>上一步</Button>}
            {createStep<3 && <Button type="primary" disabled={!canNext()} onClick={handleNext}>下一步</Button>}
            {createStep===3 && <Button type="primary" size="large" onClick={handleSubmit} icon={<RocketOutlined/>}>确认并运行</Button>}
          </div>
        </Form>
      </Modal>

      <Modal title="任务详情" open={detailVisible} onCancel={()=>{setDetailVisible(false);setExecutions([]);setTaskReport(null);}} width={800} footer={null}>
        {selected && <Tabs items={[
          {key:"info",label:"基本信息",children:(<div>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="编号">{selected.taskNo}</Descriptions.Item>
              <Descriptions.Item label="状态"><Badge status={STATUS_COLORS[selected.status]} text={STATUS_MAP[selected.status]}/></Descriptions.Item>
              <Descriptions.Item label="名称" span={2}>{selected.name}</Descriptions.Item>
              <Descriptions.Item label="评测类型"><Tag color="blue">{EVAL_TYPES[selected.evalType]||selected.evalType}</Tag></Descriptions.Item>
              <Descriptions.Item label="优先级"><Tag color={PRIORITY_COLORS[selected.priority]}>{PRIORITIES[selected.priority]||selected.priority}</Tag></Descriptions.Item>
              <Descriptions.Item label="进度" span={2}><Progress percent={selected.progress||0} style={{maxWidth:300}}/></Descriptions.Item>
              <Descriptions.Item label="创建时间">{dayjs(selected.createdAt).format("YYYY-MM-DD HH:mm:ss")}</Descriptions.Item>
              {selected.completedAt&&<Descriptions.Item label="完成时间">{dayjs(selected.completedAt).format("YYYY-MM-DD HH:mm:ss")}</Descriptions.Item>}
              {selected.description&&<Descriptions.Item label="描述" span={2}>{selected.description}</Descriptions.Item>}
              {selected.errorMessage&&<Descriptions.Item label="错误信息" span={2}><Text type="danger">{selected.errorMessage}</Text></Descriptions.Item>}
            </Descriptions>
            {/* 问题4: 关联报告 */}
            {selected.status === "COMPLETED" && (
              <div style={{marginTop:24}}>
                <Divider orientation="left"><FileTextOutlined /> 关联评测报告</Divider>
                {reportLoading ? (
                  <Text type="secondary">加载报告中...</Text>
                ) : taskReport ? (
                  <Card size="small" style={{background:"#f6ffed",border:"1px solid #b7eb8f"}}>
                    <Row justify="space-between" align="middle">
                      <Col>
                        <Space direction="vertical" size={4}>
                          <Text strong>{taskReport.reportNo}</Text>
                          <Text type="secondary">{taskReport.summary}</Text>
                          <Space>
                            <Tag color="green">{taskReport.status}</Tag>
                            <Tag color="blue">评分: {taskReport.score}</Tag>
                            <Text type="secondary" style={{fontSize:12}}>生成于 {dayjs(taskReport.createdAt).format("YYYY-MM-DD HH:mm:ss")}</Text>
                          </Space>
                        </Space>
                      </Col>
                      <Col>
                        <Button type="primary" icon={<FileTextOutlined/>} onClick={()=>{setDetailVisible(false);message.info("请前往「评测报告」页面查看报告 "+taskReport.reportNo);}}>查看报告</Button>
                      </Col>
                    </Row>
                  </Card>
                ) : (
                  <Alert message="暂无报告" description="该任务已完成但尚未生成评测报告" type="info" showIcon/>
                )}
              </div>
            )}
          </div>)},
          {key:"exec",label:"执行记录",children:(
            <div>
              {executions.length > 0 ? (
                <Table size="small" dataSource={executions} rowKey="id" pagination={false} columns={[
                  { title:"执行ID", dataIndex:"id", width:70 },
                  { title:"节点ID", dataIndex:"nodeId", width:70 },
                  { title:"状态", dataIndex:"status", width:100, render:v=><Badge status={STATUS_COLORS[v]||"default"} text={v}/> },
                  { title:"耗时", dataIndex:"durationSec", width:100, render:v=>v ? `${v.toFixed(1)}s` : "-" },
                  { title:"调度时间", dataIndex:"dispatchedAt", width:160, render:v=>v?dayjs(v).format("MM-DD HH:mm:ss"):"-" },
                  { title:"完成时间", dataIndex:"completedAt", width:160, render:v=>v?dayjs(v).format("MM-DD HH:mm:ss"):"-" },
                ]}/>
              ) : <Text type="secondary">暂无执行记录</Text>}
            </div>
          )},
          {key:"log",label:"执行日志",children:(<div style={{background:"#1e1e1e",color:"#d4d4d4",padding:16,borderRadius:8,minHeight:200,maxHeight:400,overflow:"auto",fontFamily:"monospace",fontSize:12,whiteSpace:"pre-wrap"}}>
            {executions.length > 0 && executions[executions.length-1].logs ? 
              executions[executions.length-1].logs :
              <span style={{color:"#666"}}>[INFO] 暂无执行日志数据</span>
            }
          </div>)},
        ]}/>}
      </Modal>
    </div>
  );
}
