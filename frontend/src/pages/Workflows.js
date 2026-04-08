import React, { useState, useCallback, useRef, useMemo } from "react";
import ReactFlow, { Controls, MiniMap, Background, addEdge, useNodesState, useEdgesState, MarkerType, Panel, Handle, Position } from "reactflow";
import "reactflow/dist/style.css";
import { Card, Button, Space, Drawer, Form, Input, Select, InputNumber, Switch, Tag, Modal, message, Tooltip, Divider, Row, Col, Typography, Popconfirm, Badge, Tabs, Empty } from "antd";
import { PlusOutlined, SaveOutlined, PlayCircleOutlined, DeleteOutlined, CopyOutlined, ImportOutlined, ExportOutlined, UndoOutlined, RedoOutlined, SettingOutlined, ThunderboltOutlined, DatabaseOutlined, BarChartOutlined, FileTextOutlined, BranchesOutlined, CodeOutlined, CheckCircleOutlined, ClockCircleOutlined, ApiOutlined, ExperimentOutlined, RocketOutlined, BugOutlined, CloudUploadOutlined } from "@ant-design/icons";
import api from "../utils/api";
const { TextArea } = Input;
const { Text, Title } = Typography;

const NODE_CATEGORIES = [
  { key:"data", label:"数据处理", color:"#1890ff", icon:<DatabaseOutlined/>, nodes:[
    { type:"data_load", label:"数据加载", desc:"加载评测数据集", params:[{name:"datasetId",label:"数据集",type:"select"},{name:"batchSize",label:"批次大小",type:"number",default:32},{name:"shuffle",label:"随机打乱",type:"switch",default:true}] },
    { type:"data_preprocess", label:"数据预处理", desc:"数据清洗与转换", params:[{name:"normalize",label:"归一化",type:"switch",default:true},{name:"augment",label:"数据增强",type:"switch",default:false},{name:"format",label:"输出格式",type:"select",options:["numpy","tensor","csv"]}] },
    { type:"data_split", label:"数据分割", desc:"训练/验证/测试集划分", params:[{name:"trainRatio",label:"训练集比例",type:"number",default:0.8},{name:"valRatio",label:"验证集比例",type:"number",default:0.1}] },
  ]},
  { key:"model", label:"模型操作", color:"#52c41a", icon:<ExperimentOutlined/>, nodes:[
    { type:"model_load", label:"模型加载", desc:"加载预训练模型", params:[{name:"modelPath",label:"模型路径",type:"input"},{name:"framework",label:"框架",type:"select",options:["PyTorch","TensorFlow","ONNX","MindSpore","PaddlePaddle"]},{name:"precision",label:"精度",type:"select",options:["FP32","FP16","BF16","INT8"]}] },
    { type:"model_convert", label:"模型转换", desc:"模型格式/精度转换", params:[{name:"targetFormat",label:"目标格式",type:"select",options:["ONNX","TensorRT","MindIR","Paddle"]},{name:"targetPrecision",label:"目标精度",type:"select",options:["FP32","FP16","INT8"]}] },
    { type:"model_optimize", label:"模型优化", desc:"量化/剪枝/蒸馏", params:[{name:"method",label:"优化方法",type:"select",options:["量化","剪枝","蒸馏","图优化"]},{name:"calibrationSteps",label:"校准步数",type:"number",default:100}] },
  ]},
  { key:"eval", label:"评测执行", color:"#722ed1", icon:<ThunderboltOutlined/>, nodes:[
    { type:"inference_test", label:"推理测试", desc:"执行模型推理并记录性能", params:[{name:"iterations",label:"迭代次数",type:"number",default:100},{name:"warmup",label:"预热次数",type:"number",default:10},{name:"concurrency",label:"并发数",type:"number",default:1}] },
    { type:"accuracy_eval", label:"精度评估", desc:"计算模型精度指标", params:[{name:"metrics",label:"评估指标",type:"select",options:["Top-1","Top-5","F1","mAP","BLEU","ROUGE"],mode:"multiple"}] },
    { type:"perf_profile", label:"性能剖析", desc:"CPU/GPU/内存性能分析", params:[{name:"profileGpu",label:"GPU剖析",type:"switch",default:true},{name:"profileMemory",label:"内存剖析",type:"switch",default:true},{name:"traceOps",label:"算子追踪",type:"switch",default:false}] },
    { type:"stress_test", label:"压力测试", desc:"长时间稳定性测试", params:[{name:"duration",label:"持续时间(分钟)",type:"number",default:30},{name:"targetQPS",label:"目标QPS",type:"number",default:100}] },
  ]},
  { key:"analysis", label:"分析输出", color:"#fa8c16", icon:<BarChartOutlined/>, nodes:[
    { type:"metric_calc", label:"指标计算", desc:"聚合计算评测指标", params:[{name:"aggregation",label:"聚合方式",type:"select",options:["平均值","中位数","P95","P99","最大值","最小值"]},{name:"compareBaseline",label:"对比基线",type:"switch",default:false}] },
    { type:"report_gen", label:"报告生成", desc:"自动生成评测报告", params:[{name:"template",label:"报告模板",type:"select",options:["基础版","高级版","对比版"]},{name:"format",label:"输出格式",type:"select",options:["PDF","Word","HTML","Markdown"]}] },
    { type:"data_export", label:"数据导出", desc:"导出原始评测数据", params:[{name:"format",label:"导出格式",type:"select",options:["CSV","JSON","Excel"]},{name:"includeRaw",label:"包含原始数据",type:"switch",default:false}] },
  ]},
  { key:"control", label:"流程控制", color:"#eb2f96", icon:<BranchesOutlined/>, nodes:[
    { type:"condition", label:"条件分支", desc:"根据条件选择执行路径", params:[{name:"expression",label:"条件表达式",type:"input",placeholder:"如: accuracy > 0.95"},{name:"trueLabel",label:"True分支标签",type:"input",default:"通过"},{name:"falseLabel",label:"False分支标签",type:"input",default:"不通过"}] },
    { type:"loop", label:"循环节点", desc:"重复执行指定次数", params:[{name:"times",label:"循环次数",type:"number",default:3},{name:"breakCondition",label:"中断条件",type:"input"}] },
    { type:"parallel", label:"并行执行", desc:"并行运行多个分支", params:[{name:"maxParallel",label:"最大并行数",type:"number",default:4}] },
    { type:"script", label:"自定义脚本", desc:"执行Python/Shell脚本", params:[{name:"language",label:"语言",type:"select",options:["Python","Shell","JavaScript"]},{name:"code",label:"脚本内容",type:"textarea"},{name:"timeout",label:"超时(秒)",type:"number",default:300}] },
  ]},
];

const NODE_TYPE_MAP = {};
NODE_CATEGORIES.forEach(cat => cat.nodes.forEach(n => { NODE_TYPE_MAP[n.type] = { ...n, category: cat.key, color: cat.color, categoryLabel: cat.label }; }));

const WORKFLOW_TEMPLATES = [
  { id:"model_perf", name:"模型推理性能评测", desc:"标准模型推理性能测试流程", nodes:["data_load","model_load","inference_test","metric_calc","report_gen"] },
  { id:"model_accuracy", name:"模型精度评测", desc:"模型精度与性能综合评测", nodes:["data_load","data_preprocess","model_load","accuracy_eval","metric_calc","report_gen"] },
  { id:"chip_benchmark", name:"芯片基准测试", desc:"芯片算力/能效/互联全面测试", nodes:["data_load","model_load","model_convert","inference_test","perf_profile","metric_calc","report_gen"] },
  { id:"framework_compat", name:"框架兼容性测试", desc:"框架在国产芯片上的适配测试", nodes:["model_load","model_convert","inference_test","accuracy_eval","metric_calc","report_gen"] },
  { id:"stress_full", name:"稳定性压力测试", desc:"长时间高负载压力测试", nodes:["data_load","model_load","stress_test","perf_profile","metric_calc","report_gen"] },
];

function CustomNode({ data }) {
  const info = NODE_TYPE_MAP[data.nodeType] || {};
  return (
    <div style={{background:"#fff",border:`2px solid ${info.color||"#d9d9d9"}`,borderRadius:8,padding:"8px 12px",minWidth:160,boxShadow:"0 2px 8px rgba(0,0,0,0.1)",position:"relative"}}>
      <Handle type="target" position={Position.Top} style={{background:info.color||"#1890ff",width:12,height:12,border:"2px solid #fff",cursor:"crosshair",transition:"all 0.2s",boxShadow:"0 0 0 2px rgba(0,0,0,0.1)"}}/>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
        <span style={{color:info.color,fontSize:16}}>{info.icon || <SettingOutlined/>}</span>
        <Text strong style={{fontSize:13}}>{data.label}</Text>
      </div>
      <Text type="secondary" style={{fontSize:11}}>{info.desc||""}</Text>
      {data.status && <div style={{marginTop:4}}><Badge status={data.status==="running"?"processing":data.status==="done"?"success":"default"} text={<Text style={{fontSize:10}}>{data.status==="running"?"执行中":data.status==="done"?"完成":"待执行"}</Text>}/></div>}
      <Handle type="source" position={Position.Bottom} style={{background:info.color||"#1890ff",width:12,height:12,border:"2px solid #fff",cursor:"crosshair",transition:"all 0.2s",boxShadow:"0 0 0 2px rgba(0,0,0,0.1)"}}/>
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

const defaultNodes = [
  { id:"1", type:"custom", position:{x:250,y:50}, data:{label:"数据加载",nodeType:"data_load"} },
  { id:"2", type:"custom", position:{x:250,y:180}, data:{label:"模型加载",nodeType:"model_load"} },
  { id:"3", type:"custom", position:{x:250,y:310}, data:{label:"推理测试",nodeType:"inference_test"} },
  { id:"4", type:"custom", position:{x:250,y:440}, data:{label:"指标计算",nodeType:"metric_calc"} },
  { id:"5", type:"custom", position:{x:250,y:570}, data:{label:"报告生成",nodeType:"report_gen"} },
];
const defaultEdges = [
  { id:"e1-2", source:"1", target:"2", animated:true, markerEnd:{type:MarkerType.ArrowClosed} },
  { id:"e2-3", source:"2", target:"3", animated:true, markerEnd:{type:MarkerType.ArrowClosed} },
  { id:"e3-4", source:"3", target:"4", animated:true, markerEnd:{type:MarkerType.ArrowClosed} },
  { id:"e4-5", source:"4", target:"5", animated:true, markerEnd:{type:MarkerType.ArrowClosed} },
];

export default function Workflows() {
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges);
  const [selectedNode, setSelectedNode] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [paletteVisible, setPaletteVisible] = useState(false);
  const [templateVisible, setTemplateVisible] = useState(false);
  const [workflowName, setWorkflowName] = useState("新建工作流");
  const [form] = Form.useForm();
  const idRef = useRef(10);

  const onConnect = useCallback((params) => setEdges((eds) => addEdge({...params, animated:true, markerEnd:{type:MarkerType.ArrowClosed}}, eds)), [setEdges]);

  const onNodeClick = useCallback((_,node) => {
    setSelectedNode(node);
    const info = NODE_TYPE_MAP[node.data.nodeType];
    if(info) { form.setFieldsValue(node.data.params||{}); setDrawerVisible(true); }
  },[form]);

  const addNode = (nodeType) => {
    const info = NODE_TYPE_MAP[nodeType];
    if(!info) return;
    const id = String(++idRef.current);
    const newNode = { id, type:"custom", position:{x:100+Math.random()*400, y:100+Math.random()*400}, data:{label:info.label, nodeType, params:{}} };
    setNodes(nds=>[...nds, newNode]);
    setPaletteVisible(false);
    message.success(`已添加: ${info.label}`);
  };

  const deleteNode = (nodeId) => {
    setNodes(nds=>nds.filter(n=>n.id!==nodeId));
    setEdges(eds=>eds.filter(e=>e.source!==nodeId&&e.target!==nodeId));
    setDrawerVisible(false);
    message.success("节点已删除");
  };

  const saveNodeParams = () => {
    if(!selectedNode) return;
    const values = form.getFieldsValue(true);
    setNodes(nds=>nds.map(n=>n.id===selectedNode.id?{...n,data:{...n.data,params:values}}:n));
    setDrawerVisible(false);
    message.success("参数已保存");
  };

  const loadTemplate = (tpl) => {
    const newNodes = tpl.nodes.map((type, i) => {
      const info = NODE_TYPE_MAP[type];
      return { id:String(i+1), type:"custom", position:{x:250,y:50+i*130}, data:{label:info?.label||type,nodeType:type,params:{}} };
    });
    const newEdges = tpl.nodes.slice(0,-1).map((_,i) => ({
      id:`e${i+1}-${i+2}`, source:String(i+1), target:String(i+2), animated:true, markerEnd:{type:MarkerType.ArrowClosed}
    }));
    setNodes(newNodes);
    setEdges(newEdges);
    idRef.current = tpl.nodes.length + 1;
    setWorkflowName(tpl.name);
    setTemplateVisible(false);
    message.success(`已加载模板: ${tpl.name}`);
  };

  const handleSave = async () => {
    const payload = { name:workflowName, nodes:nodes.map(n=>({id:n.id,type:n.data.nodeType,label:n.data.label,position:n.position,params:n.data.params||{}})), edges:edges.map(e=>({source:e.source,target:e.target})) };
    try { const r = await api.post("/workflows", payload); if(r.data.code===0) message.success("工作流已保存"); else message.error(r.data.message||"保存失败"); } catch(e){ message.success("工作流数据已就绪（API开发中）"); }
  };

  const handleRun = () => {
    message.info("工作流引擎开发中，敬请期待");
  };

  const handleExport = () => {
    const data = JSON.stringify({name:workflowName,nodes:nodes.map(n=>({id:n.id,type:n.data.nodeType,label:n.data.label,position:n.position,params:n.data.params})),edges:edges.map(e=>({source:e.source,target:e.target}))},null,2);
    const blob = new Blob([data],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`${workflowName}.json`; a.click();
    URL.revokeObjectURL(url);
    message.success("工作流已导出");
  };


  const handleHoverStyle = `
    .react-flow__handle:hover {
      transform: translate(-50%, 0) scale(1.5) !important;
      box-shadow: 0 0 0 4px rgba(24, 144, 255, 0.3) !important;
    }
    .react-flow__handle-top:hover {
      transform: translate(-50%, 0) scale(1.5) !important;
    }
    .react-flow__handle-bottom:hover {
      transform: translate(-50%, 0) scale(1.5) !important;
    }
  `;

  const nodeInfo = selectedNode ? NODE_TYPE_MAP[selectedNode.data.nodeType] : null;

  return (
    <div style={{height:"calc(100vh - 120px)"}}>
      <style>{handleHoverStyle}</style>
      <Card size="small" style={{marginBottom:8}} bodyStyle={{padding:"8px 16px"}}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              <Input value={workflowName} onChange={e=>setWorkflowName(e.target.value)} style={{width:200,fontWeight:"bold"}} bordered={false}/>
              <Tag color="blue">{nodes.length} 节点</Tag>
              <Tag>{edges.length} 连线</Tag>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<ImportOutlined/>} onClick={()=>setTemplateVisible(true)}>模板</Button>
              <Button icon={<PlusOutlined/>} type="primary" onClick={()=>setPaletteVisible(true)}>添加节点</Button>
              <Button icon={<SaveOutlined/>} onClick={handleSave}>保存</Button>
              <Button icon={<ExportOutlined/>} onClick={handleExport}>导出</Button>
              <Tooltip title="工作流引擎开发中"><Button icon={<PlayCircleOutlined/>} style={{background:"#52c41a",borderColor:"#52c41a",color:"#fff"}} onClick={handleRun}>执行（开发中）</Button></Tooltip>
            </Space>
          </Col>
        </Row>
      </Card>

      <div style={{height:"calc(100% - 56px)",border:"1px solid #f0f0f0",borderRadius:8,overflow:"hidden"}}>
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={onNodeClick} nodeTypes={nodeTypes} deleteKeyCode="Delete" fitView connectionRadius={20}>
          <Controls/>
          <MiniMap style={{height:100}} zoomable pannable/>
          <Background variant="dots" gap={16} size={1}/>
          <Panel position="top-left">
            <Card size="small" style={{opacity:0.9,maxWidth:180}}>
              <Text type="secondary" style={{fontSize:11}}>提示：拖拽节点调整位置，连接节点间的端口创建数据流，点击节点配置参数</Text>
            </Card>
          </Panel>
        </ReactFlow>
      </div>

      {/* 节点参数配置 */}
      <Drawer title={selectedNode?`配置: ${selectedNode.data.label}`:"节点配置"} open={drawerVisible} onClose={()=>setDrawerVisible(false)} width={400} extra={<Space>
        {selectedNode&&<Popconfirm title="确定删除此节点？" onConfirm={()=>deleteNode(selectedNode.id)}><Button danger icon={<DeleteOutlined/>} size="small">删除</Button></Popconfirm>}
        <Button type="primary" onClick={saveNodeParams} icon={<CheckCircleOutlined/>}>保存</Button>
      </Space>}>
        {nodeInfo && <div>
          <div style={{marginBottom:16,padding:12,background:"#f6f8fa",borderRadius:8}}>
            <Space><span style={{color:nodeInfo.color,fontSize:20}}>{nodeInfo.icon}</span><div><Text strong>{nodeInfo.label}</Text><br/><Text type="secondary" style={{fontSize:12}}>{nodeInfo.desc}</Text></div></Space>
          </div>
          <Form form={form} layout="vertical">
            {nodeInfo.params?.map(p=>(
              <Form.Item key={p.name} name={p.name} label={p.label} initialValue={p.default}>
                {p.type==="input"?<Input placeholder={p.placeholder||`请输入${p.label}`}/>:
                 p.type==="number"?<InputNumber style={{width:"100%"}}/>:
                 p.type==="switch"?<Switch/>:
                 p.type==="textarea"?<TextArea rows={6} placeholder={p.placeholder||"请输入"}/>:
                 p.type==="select"?<Select mode={p.mode} options={(p.options||[]).map(o=>({value:o,label:o}))} placeholder={`选择${p.label}`}/>:
                 <Input/>}
              </Form.Item>
            ))}
          </Form>
        </div>}
      </Drawer>

      {/* 节点面板 */}
      <Modal title="添加节点" open={paletteVisible} onCancel={()=>setPaletteVisible(false)} footer={null} width={700}>
        <Tabs items={NODE_CATEGORIES.map(cat=>({
          key:cat.key,
          label:<span>{cat.icon} {cat.label}</span>,
          children:<Row gutter={[12,12]}>{cat.nodes.map(n=>(
            <Col span={8} key={n.type}>
              <Card size="small" hoverable onClick={()=>addNode(n.type)} style={{borderLeft:`3px solid ${cat.color}`}}>
                <Text strong style={{fontSize:13}}>{n.label}</Text>
                <br/><Text type="secondary" style={{fontSize:11}}>{n.desc}</Text>
              </Card>
            </Col>
          ))}</Row>
        }))}/>
      </Modal>

      {/* 模板选择 */}
      <Modal title="选择工作流模板" open={templateVisible} onCancel={()=>setTemplateVisible(false)} footer={null} width={600}>
        <Row gutter={[16,16]}>
          {WORKFLOW_TEMPLATES.map(t=>(
            <Col span={12} key={t.id}>
              <Card size="small" hoverable onClick={()=>loadTemplate(t)}>
                <Text strong>{t.name}</Text>
                <br/><Text type="secondary" style={{fontSize:12}}>{t.desc}</Text>
                <div style={{marginTop:8}}>{t.nodes.map(n=><Tag key={n} style={{fontSize:10,marginBottom:2}}>{NODE_TYPE_MAP[n]?.label||n}</Tag>)}</div>
              </Card>
            </Col>
          ))}
        </Row>
      </Modal>
    </div>
  );
}
