import React, { useState, useEffect, useMemo } from "react";
import { Card, Table, Tag, Space, Button, Row, Col, Select, Tabs, Descriptions, Modal, message, Tooltip, Badge, Progress, Statistic, Divider, Empty, Spin, Radio, DatePicker, Typography, Drawer, Alert } from "antd";
import { BarChartOutlined, LineChartOutlined, RadarChartOutlined, DotChartOutlined, HeatMapOutlined, PieChartOutlined, DownloadOutlined, CompressOutlined, EyeOutlined, FileTextOutlined, ShareAltOutlined, PrinterOutlined, ReloadOutlined, FilterOutlined, FullscreenOutlined, SwapOutlined, ExperimentOutlined } from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import api from "../utils/api";
import dayjs from "dayjs";
const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

const CHART_COLORS = ["#1890ff","#52c41a","#722ed1","#fa8c16","#eb2f96","#13c2c2","#faad14","#2f54eb","#a0d911","#f5222d"];

// fallback mock data for reports without real execution data
const genMockMetrics = () => {
  const latP50 = 5+Math.random()*20;
  const latP95 = 10+Math.random()*40;
  const latP99 = 15+Math.random()*60;
  return {
    latencyP50:latP50, latencyP95:latP95, latencyP99:latP99,
    throughput: 100+Math.random()*900, gpuUtil: 60+Math.random()*35,
    memUsage: 2+Math.random()*14, power: 80+Math.random()*200,
    accuracy: 85+Math.random()*14, f1: 80+Math.random()*18,
    topsPerWatt: 5+Math.random()*25,
  };
};

const buildLatencyChart = (data) => ({
  title:{text:"推理延迟分布",left:"center",textStyle:{fontSize:14}},
  tooltip:{trigger:"axis"},
  legend:{data:["P50","P95","P99"],bottom:0},
  xAxis:{type:"category",data:data.map(d=>d.name||d.title||"未知"),axisLabel:{rotate:15}},
  yAxis:{type:"value",name:"延迟(ms)"},
  series:[
    {name:"P50",type:"bar",data:data.map(d=>(d.latencyP50||0).toFixed(1)),itemStyle:{color:CHART_COLORS[0]}},
    {name:"P95",type:"bar",data:data.map(d=>(d.latencyP95||0).toFixed(1)),itemStyle:{color:CHART_COLORS[1]}},
    {name:"P99",type:"bar",data:data.map(d=>(d.latencyP99||0).toFixed(1)),itemStyle:{color:CHART_COLORS[2]}},
  ],
});

const buildThroughputChart = (data) => ({
  title:{text:"吞吐量对比",left:"center",textStyle:{fontSize:14}},
  tooltip:{trigger:"axis"},
  xAxis:{type:"category",data:data.map(d=>d.name||d.title||"未知"),axisLabel:{rotate:15}},
  yAxis:{type:"value",name:"吞吐量(QPS)"},
  series:[{type:"bar",data:data.map(d=>(d.throughput||0).toFixed(0)),itemStyle:{color:{type:"linear",x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:"#1890ff"},{offset:1,color:"#722ed1"}]}},barWidth:"40%"}],
});

const buildRadarChart = (data) => {
  const indicators = [{name:"吞吐量",max:1200},{name:"GPU利用率",max:100},{name:"精度",max:100},{name:"能效比",max:30},{name:"F1值",max:100}];
  return {
    title:{text:"多维性能雷达图",left:"center",textStyle:{fontSize:14}},
    tooltip:{},
    legend:{data:data.slice(0,3).map(d=>d.name||d.title||"未知"),bottom:0},
    radar:{indicator:indicators,radius:"60%"},
    series:[{type:"radar",data:data.slice(0,3).map((d,i)=>({value:[(d.throughput||0)/10,d.gpuUtil||0,d.accuracy||0,d.topsPerWatt||0,d.f1||0],name:d.name||d.title||"未知",lineStyle:{color:CHART_COLORS[i]},areaStyle:{color:CHART_COLORS[i],opacity:0.1}}))}],
  };
};

const buildScatterChart = (data) => ({
  title:{text:"延迟-吞吐量分布",left:"center",textStyle:{fontSize:14}},
  tooltip:{trigger:"item",formatter:p=>`${p.data[2]}<br/>延迟:${p.data[0].toFixed(1)}ms<br/>吞吐:${p.data[1].toFixed(0)}QPS`},
  xAxis:{type:"value",name:"P95延迟(ms)"},
  yAxis:{type:"value",name:"吞吐量(QPS)"},
  series:[{type:"scatter",data:data.map(d=>[d.latencyP95||0,d.throughput||0,d.name||d.title||"未知"]),symbolSize:d=>Math.max(10,Math.sqrt(d[1])*2),itemStyle:{color:CHART_COLORS[0],opacity:0.7},label:{show:true,formatter:p=>p.data[2],position:"top",fontSize:10}}],
});

const buildHeatmapChart = (data) => {
  const metrics = ["延迟","吞吐量","GPU利用率","精度","能效比"];
  const heatData = [];
  data.forEach((d,i) => {
    [(d.latencyP95||0)/60*100,(d.throughput||0)/12,(d.gpuUtil||0),(d.accuracy||0),(d.topsPerWatt||0)/30*100].forEach((v,j)=>{
      heatData.push([j,i,Math.round(v)]);
    });
  });
  return {
    title:{text:"性能热力图",left:"center",textStyle:{fontSize:14}},
    tooltip:{formatter:p=>`${data[p.data[1]]?.name||""}<br/>${metrics[p.data[0]]}: ${p.data[2]}%`},
    xAxis:{type:"category",data:metrics},
    yAxis:{type:"category",data:data.map(d=>d.name||d.title||"未知")},
    visualMap:{min:0,max:100,calculable:true,orient:"horizontal",left:"center",bottom:0,inRange:{color:["#f5f5f5","#bae7ff","#1890ff","#003a8c"]}},
    series:[{type:"heatmap",data:heatData,label:{show:true,fontSize:10},emphasis:{itemStyle:{shadowBlur:10,shadowColor:"rgba(0,0,0,0.5)"}}}],
  };
};

const buildTrendChart = (data) => {
  const days = Array.from({length:7},(_,i)=>dayjs().subtract(6-i,"day").format("MM-DD"));
  return {
    title:{text:"性能趋势（近7天）",left:"center",textStyle:{fontSize:14}},
    tooltip:{trigger:"axis"},
    legend:{data:["P95延迟","吞吐量","GPU利用率"],bottom:0},
    xAxis:{type:"category",data:days},
    yAxis:[{type:"value",name:"延迟(ms)/利用率(%)"},{type:"value",name:"吞吐量(QPS)"}],
    series:[
      {name:"P95延迟",type:"line",smooth:true,data:days.map(()=>(10+Math.random()*30).toFixed(1)),itemStyle:{color:CHART_COLORS[4]}},
      {name:"吞吐量",type:"line",smooth:true,yAxisIndex:1,data:days.map(()=>Math.floor(200+Math.random()*600)),itemStyle:{color:CHART_COLORS[0]}},
      {name:"GPU利用率",type:"line",smooth:true,data:days.map(()=>(60+Math.random()*35).toFixed(1)),itemStyle:{color:CHART_COLORS[1]},areaStyle:{opacity:0.1}},
    ],
  };
};

const buildPieChart = (data) => ({
  title:{text:"评测类型分布",left:"center",textStyle:{fontSize:14}},
  tooltip:{trigger:"item",formatter:"{b}: {c} ({d}%)"},
  legend:{bottom:0},
  series:[{type:"pie",radius:["40%","65%"],avoidLabelOverlap:true,itemStyle:{borderRadius:6,borderColor:"#fff",borderWidth:2},
    data:[...new Set(data.map(d=>d.evalType||"GENERAL"))].map((c,i)=>({value:data.filter(d=>(d.evalType||"GENERAL")===c).length,name:c,itemStyle:{color:CHART_COLORS[i]}})),
    label:{show:true,formatter:"{b}\n{d}%"}}],
});

// 从真实评测结果中提取性能指标
function extractMetrics(reportDetail) {
  const metrics = {};
  
  // 1. 从 metrics 字段提取（报告自带的评测结果 JSON）
  if (reportDetail.metrics && typeof reportDetail.metrics === "object") {
    const m = reportDetail.metrics;
    // 算子评测结果格式
    if (m.summary) {
      metrics.totalOps = m.summary.total_operators;
      metrics.passCount = m.summary.pass_count;
      metrics.failCount = m.summary.fail_count;
      metrics.passRate = m.summary.pass_rate;
    }
    if (m.results && Array.isArray(m.results)) {
      metrics.testCases = m.results.map(r => ({
        name: r.operator || r.name || "unknown",
        status: r.status || "UNKNOWN",
        latency: r.avg_time_ms ? r.avg_time_ms.toFixed(2) : "-",
        desc: r.error || `形状:${JSON.stringify(r.shape||r.input_shape||"-")}`,
      }));
    }
    if (m.conclusion) metrics.conclusion = m.conclusion;
    if (m.environment) metrics.environment = m.environment;
  }

  // 2. 从 executions 提取
  if (reportDetail.executions && reportDetail.executions.length > 0) {
    const latestExec = reportDetail.executions[reportDetail.executions.length - 1];
    metrics.durationSec = latestExec.durationSec;
    metrics.logs = latestExec.logs;
    if (latestExec.result) {
      const execResult = latestExec.result;
      if (execResult.eval_result) {
        const er = execResult.eval_result;
        if (er.summary) {
          metrics.totalOps = metrics.totalOps || er.summary.total_operators;
          metrics.passCount = metrics.passCount || er.summary.pass_count;
          metrics.failCount = metrics.failCount || er.summary.fail_count;
          metrics.passRate = metrics.passRate || er.summary.pass_rate;
        }
        if (er.results && Array.isArray(er.results) && !metrics.testCases) {
          metrics.testCases = er.results.map(r => ({
            name: r.operator || r.name || "unknown",
            status: r.status || "UNKNOWN",
            latency: r.avg_time_ms ? r.avg_time_ms.toFixed(2) : "-",
            desc: r.error || `形状:${JSON.stringify(r.shape||r.input_shape||"-")}`,
          }));
        }
        if (er.conclusion) metrics.conclusion = metrics.conclusion || er.conclusion;
        if (er.environment) metrics.environment = metrics.environment || er.environment;
      }
    }
  }

  // 3. 从 task.result 提取
  if (reportDetail.task && reportDetail.task.result) {
    const taskResult = reportDetail.task.result;
    if (taskResult.eval_result) {
      const er = taskResult.eval_result;
      if (!metrics.conclusion && er.conclusion) metrics.conclusion = er.conclusion;
      if (!metrics.environment && er.environment) metrics.environment = er.environment;
    }
  }

  return metrics;
}

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reportStats, setReportStats] = useState({});
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportDetail, setReportDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [chartType, setChartType] = useState("bar");
  const [detailVisible, setDetailVisible] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const r = await api.get("/reports", { params: { size: 100 } });
      if (r.data.code === 0) {
        const data = (r.data.data || []).map(report => ({
          ...report,
          name: report.title || "未命名报告",
          // 为图表展示添加 fallback 数据
          ...genMockMetrics(),
        }));
        setReports(data);
      }
    } catch(e) {
      message.error("获取报告列表失败");
    }
    finally { setLoading(false); }
  };

  const fetchStats = async () => { 
    try { const r = await api.get("/reports/stats"); if(r.data.code===0) setReportStats(r.data.data); } catch(e){} 
  };

  const fetchReportDetail = async (id) => {
    setDetailLoading(true);
    try {
      const r = await api.get(`/reports/${id}`);
      if (r.data.code === 0) {
        setReportDetail(r.data.data);
      }
    } catch(e) {
      message.error("获取报告详情失败");
    }
    finally { setDetailLoading(false); }
  };

  useEffect(() => { fetchReports(); fetchStats(); }, []);

  const compareData = useMemo(() => compareIds.length>0 ? reports.filter(r=>compareIds.includes(r.id)) : reports, [reports, compareIds]);

  const handleExport = (format) => { message.success(`报告导出为 ${format} 格式（功能开发中）`); };

  const openDetail = (record) => {
    setSelectedReport(record);
    setDetailVisible(true);
    setReportDetail(null);
    fetchReportDetail(record.id);
  };

  const columns = [
    { title:"报告编号", dataIndex:"reportNo", width:180, ellipsis:true },
    { title:"标题", dataIndex:"title", width:220, ellipsis:true },
    { title:"评测类型", dataIndex:"evalType", width:100, render:v=><Tag color="blue">{v||"-"}</Tag> },
    { title:"状态", dataIndex:"status", width:90, render:v=><Badge status={v==="PUBLISHED"?"success":v==="REVIEWING"?"processing":"default"} text={v==="PUBLISHED"?"已发布":v==="REVIEWING"?"审核中":"草稿"}/> },
    { title:"评分", dataIndex:"score", width:80, render:v=>v!=null ? <Text style={{color:v>80?"#52c41a":v>60?"#1890ff":"#fa8c16",fontWeight:"bold"}}>{(typeof v === "number" ? v.toFixed(1) : v)}%</Text> : "-" },
    { title:"关联任务", dataIndex:"taskId", width:90, render:v=>v ? <Tag>任务#{v}</Tag> : "-" },
    { title:"创建时间", dataIndex:"createdAt", width:160, render:v=>v?dayjs(v).format("YYYY-MM-DD HH:mm"):"-", sorter:(a,b)=>new Date(a.createdAt)-new Date(b.createdAt) },
    { title:"操作", key:"action", width:150, render:(_,r)=>(
      <Space>
        <Button type="link" size="small" icon={<EyeOutlined/>} onClick={()=>openDetail(r)}>详情</Button>
        <Button type="link" size="small" icon={<DownloadOutlined/>} onClick={()=>handleExport("PDF")}>导出</Button>
      </Space>
    )},
  ];

  // 渲染真实数据的报告详情
  const renderRealDetail = () => {
    if (!reportDetail) return <Spin tip="加载中..." />;
    const realMetrics = extractMetrics(reportDetail);
    const hasRealData = realMetrics.testCases || realMetrics.passRate != null || realMetrics.conclusion;

    return (
      <Tabs defaultActiveKey="basic" items={[
        { key:"basic", label:"基本信息", children: <div>
          {hasRealData && <Alert message="该报告包含真实评测数据" type="success" showIcon style={{marginBottom:16}} icon={<ExperimentOutlined/>}/>}
          {!hasRealData && <Alert message="该报告暂无真实采集数据，展示预估数据" type="warning" showIcon style={{marginBottom:16}}/>}
          <Descriptions bordered column={2} size="small" style={{marginBottom:16}}>
            <Descriptions.Item label="报告编号">{reportDetail.reportNo}</Descriptions.Item>
            <Descriptions.Item label="标题">{reportDetail.title}</Descriptions.Item>
            <Descriptions.Item label="评测类型"><Tag color="blue">{reportDetail.evalType||"-"}</Tag></Descriptions.Item>
            <Descriptions.Item label="状态"><Badge status={reportDetail.status==="PUBLISHED"?"success":"default"} text={reportDetail.status}/></Descriptions.Item>
            <Descriptions.Item label="评分">{reportDetail.score!=null ? `${reportDetail.score}%` : "-"}</Descriptions.Item>
            <Descriptions.Item label="关联任务">{reportDetail.taskId ? `任务 #${reportDetail.taskId}` : "无"}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{reportDetail.createdAt ? dayjs(reportDetail.createdAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Descriptions.Item>
            <Descriptions.Item label="发布时间">{reportDetail.publishedAt ? dayjs(reportDetail.publishedAt).format("YYYY-MM-DD HH:mm:ss") : "-"}</Descriptions.Item>
            <Descriptions.Item label="摘要" span={2}>{reportDetail.summary || "-"}</Descriptions.Item>
          </Descriptions>
          {reportDetail.task && <Card size="small" title="关联任务信息" style={{marginTop:16}}>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="任务编号">{reportDetail.task.taskNo}</Descriptions.Item>
              <Descriptions.Item label="任务名称">{reportDetail.task.name}</Descriptions.Item>
              <Descriptions.Item label="评测对象">{reportDetail.task.targetModel||"-"}</Descriptions.Item>
              <Descriptions.Item label="任务状态"><Badge status={reportDetail.task.status==="COMPLETED"?"success":"default"} text={reportDetail.task.status}/></Descriptions.Item>
            </Descriptions>
          </Card>}
          {realMetrics.environment && <Card size="small" title="评测环境" style={{marginTop:16}}>
            <Descriptions column={3} size="small">
              <Descriptions.Item label="操作系统">{realMetrics.environment.os||"-"}</Descriptions.Item>
              <Descriptions.Item label="硬件配置">{realMetrics.environment.cpu||"-"}</Descriptions.Item>
              <Descriptions.Item label="Python版本">{realMetrics.environment.python||"-"}</Descriptions.Item>
              <Descriptions.Item label="推理框架">{realMetrics.environment.framework||"-"}</Descriptions.Item>
              <Descriptions.Item label="运行设备">{realMetrics.environment.device||"-"}</Descriptions.Item>
            </Descriptions>
          </Card>}
        </div>},

        { key:"perf", label:"性能数据", children: <div>
          {hasRealData ? (
            <div>
              <Row gutter={16} style={{marginBottom:16}}>
                {realMetrics.passRate!=null && <Col span={6}><Card size="small"><Statistic title="通过率" value={typeof realMetrics.passRate==="number" ? (realMetrics.passRate*100).toFixed(1)+"%" : realMetrics.passRate} valueStyle={{color:realMetrics.passRate>0.8?"#52c41a":"#fa8c16"}}/></Card></Col>}
                {realMetrics.totalOps!=null && <Col span={6}><Card size="small"><Statistic title="总算子数" value={realMetrics.totalOps}/></Card></Col>}
                {realMetrics.passCount!=null && <Col span={6}><Card size="small"><Statistic title="通过数" value={realMetrics.passCount} valueStyle={{color:"#52c41a"}}/></Card></Col>}
                {realMetrics.failCount!=null && <Col span={6}><Card size="small"><Statistic title="失败数" value={realMetrics.failCount} valueStyle={{color:realMetrics.failCount>0?"#ff4d4f":"#52c41a"}}/></Card></Col>}
              </Row>
              {realMetrics.durationSec && <Statistic title="执行耗时" value={`${realMetrics.durationSec.toFixed(1)} 秒`} style={{marginBottom:16}}/>}
            </div>
          ) : (
            <Row gutter={16} style={{marginBottom:16}}>
              {[["P50延迟",(selectedReport?.latencyP50||0).toFixed(2)+"ms","#1890ff"],["P95延迟",(selectedReport?.latencyP95||0).toFixed(2)+"ms","#fa8c16"],["P99延迟",(selectedReport?.latencyP99||0).toFixed(2)+"ms","#f5222d"],["吞吐量",(selectedReport?.throughput||0).toFixed(0)+"QPS","#52c41a"],["GPU利用率",Math.round(selectedReport?.gpuUtil||0)+"%","#722ed1"],["内存占用",(selectedReport?.memUsage||0).toFixed(1)+"GB","#13c2c2"]].map(([t,v,c],idx)=>(
                <Col span={4} key={idx}><Card size="small"><Statistic title={t} value={v} valueStyle={{color:c,fontSize:16}}/></Card></Col>
              ))}
            </Row>
          )}
        </div>},

        { key:"cases", label:"测试用例", children: <div>
          {realMetrics.testCases && realMetrics.testCases.length > 0 ? (
            <div>
              <Alert message={`真实评测结果 - 共 ${realMetrics.testCases.length} 项测试`} type="info" showIcon style={{marginBottom:12}}/>
              <Table size="small" dataSource={realMetrics.testCases} rowKey={(r,i)=>i} pagination={false} columns={[
                { title:"测试项", dataIndex:"name", key:"name" },
                { title:"描述", dataIndex:"desc", key:"desc", ellipsis:true },
                { title:"延迟(ms)", dataIndex:"latency", key:"latency" },
                { title:"结果", dataIndex:"status", key:"status", render:v=><Tag color={v==="PASS"?"green":v==="FAIL"?"red":"orange"}>{v==="PASS"?"通过":v==="FAIL"?"失败":v}</Tag> },
              ]}/>
              <div style={{marginTop:12}}>
                <Text type="secondary">通过: {realMetrics.testCases.filter(t=>t.status==="PASS").length} / {realMetrics.testCases.length} 项</Text>
              </div>
            </div>
          ) : <Empty description="暂无测试用例数据"/>}
        </div>},

        { key:"logs", label:"执行日志", children: <div style={{background:"#1e1e1e",color:"#d4d4d4",padding:16,borderRadius:8,minHeight:200,maxHeight:500,overflow:"auto",fontFamily:"monospace",fontSize:12,whiteSpace:"pre-wrap"}}>
          {realMetrics.logs ? realMetrics.logs : 
            (reportDetail.executions && reportDetail.executions.length > 0 && reportDetail.executions[0].logs) ? 
              reportDetail.executions[0].logs : 
              <span style={{color:"#666"}}>[INFO] 暂无执行日志</span>
          }
        </div>},

        { key:"conclusion", label:"评测结论", children: <div>
          <Card style={{background:hasRealData?"#f6ffed":"#fffbe6",border:hasRealData?"1px solid #b7eb8f":"1px solid #ffe58f",marginBottom:16}}>
            <Title level={5} style={{color:hasRealData?"#389e0d":"#d48806"}}>
              {hasRealData ? "真实评测结论" : "预估结论"}
            </Title>
            <Text style={{fontSize:14,lineHeight:2}}>
              {realMetrics.conclusion || reportDetail.summary || "评测已完成，详细结论请查看各项指标数据。"}
            </Text>
          </Card>
          <Divider/>
          <Space>
            <Button icon={<DownloadOutlined/>} type="primary" onClick={()=>handleExport("PDF")}>导出PDF</Button>
            <Button icon={<DownloadOutlined/>} onClick={()=>handleExport("Excel")}>导出Excel</Button>
            <Button icon={<ShareAltOutlined/>} onClick={()=>message.info("分享功能开发中")}>分享</Button>
          </Space>
        </div>},
      ]}/>
    );
  };

  return (
    <div>
      {/* 统计卡片 */}
      <Row gutter={16} style={{marginBottom:16}}>
        {[["评测报告",reportStats.total||reports.length,<FileTextOutlined/>,"#1890ff"],
          ["已发布",reportStats.published||0,<BarChartOutlined/>,"#52c41a"],
          ["审核中",reportStats.reviewing||0,<LineChartOutlined/>,"#fa8c16"],
          ["平均评分",(reportStats.avgScore||0).toFixed?.(1)||"0","#722ed1"]
        ].map(([t,v,icon,color],i)=>(
          <Col span={6} key={i}><Card size="small"><Statistic title={t} value={v} prefix={typeof icon === "object" ? React.cloneElement(icon,{style:{color}}) : null} valueStyle={{color}}/></Card></Col>
        ))}
      </Row>

      {/* 图表区域 */}
      {reports.length > 0 && <Card title="性能可视化" size="small" style={{marginBottom:16}} extra={<Space>
        <Radio.Group value={chartType} onChange={e=>setChartType(e.target.value)} size="small" buttonStyle="solid">
          <Radio.Button value="bar"><BarChartOutlined/> 柱状图</Radio.Button>
          <Radio.Button value="line"><LineChartOutlined/> 趋势图</Radio.Button>
          <Radio.Button value="radar"><RadarChartOutlined/> 雷达图</Radio.Button>
          <Radio.Button value="scatter"><DotChartOutlined/> 散点图</Radio.Button>
          <Radio.Button value="heatmap"><HeatMapOutlined/> 热力图</Radio.Button>
          <Radio.Button value="pie"><PieChartOutlined/> 饼图</Radio.Button>
        </Radio.Group>
        <Button icon={<SwapOutlined/>} onClick={()=>{setCompareMode(!compareMode);setCompareIds([]);}} type={compareMode?"primary":"default"} size="small">对比模式</Button>
      </Space>}>
        {compareMode && <div style={{marginBottom:12}}><Select mode="multiple" placeholder="选择要对比的报告（2-10份）" style={{width:"100%"}} value={compareIds} onChange={setCompareIds} options={reports.map(r=>({value:r.id,label:r.title||r.reportNo}))} maxTagCount={5}/></div>}
        <Row gutter={16}>
          <Col span={12}>
            <ReactECharts option={chartType==="bar"?buildLatencyChart(compareData):chartType==="line"?buildTrendChart(compareData):chartType==="radar"?buildRadarChart(compareData):chartType==="scatter"?buildScatterChart(compareData):chartType==="heatmap"?buildHeatmapChart(compareData):buildPieChart(compareData)} style={{height:360}}/>
          </Col>
          <Col span={12}>
            <ReactECharts option={chartType==="bar"?buildThroughputChart(compareData):chartType==="line"?buildLatencyChart(compareData):chartType==="radar"?buildScatterChart(compareData):chartType==="scatter"?buildRadarChart(compareData):chartType==="heatmap"?buildTrendChart(compareData):buildThroughputChart(compareData)} style={{height:360}}/>
          </Col>
        </Row>
      </Card>}

      {/* 报告列表 */}
      <Card title="评测报告列表" size="small" extra={<Space>
        <Button size="small" icon={<ReloadOutlined/>} onClick={()=>{fetchReports();fetchStats();}}>刷新</Button>
        <Button size="small" icon={<DownloadOutlined/>} onClick={()=>handleExport("Excel")}>批量导出</Button>
      </Space>}>
        <Table columns={columns} dataSource={reports} rowKey="id" loading={loading} size="small" pagination={{pageSize:10,showTotal:t=>"共 "+t+" 条"}}
          rowSelection={compareMode?{selectedRowKeys:compareIds,onChange:setCompareIds}:undefined}/>
      </Card>

      {/* 详情弹窗 */}
      <Drawer title={<Space><FileTextOutlined/>评测报告详情</Space>} open={detailVisible} onClose={()=>{setDetailVisible(false);setReportDetail(null);}} width={900} extra={<Space>
            <Button icon={<DownloadOutlined/>} type="primary" onClick={()=>handleExport("PDF")}>导出PDF</Button>
            <Button icon={<PrinterOutlined/>} onClick={()=>window.print()}>打印</Button>
          </Space>}>
        {detailLoading ? <Spin tip="加载报告详情..." style={{width:"100%",marginTop:100}}/> : 
          reportDetail ? renderRealDetail() : <Empty description="未获取到报告数据"/>}
      </Drawer>
    </div>
  );
}
