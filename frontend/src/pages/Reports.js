import React, { useState, useEffect, useMemo } from "react";
import { Card, Table, Tag, Space, Button, Row, Col, Select, Tabs, Descriptions, Modal, message, Tooltip, Badge, Progress, Statistic, Divider, Empty, Spin, Radio, DatePicker, Typography, Drawer } from "antd";
import { BarChartOutlined, LineChartOutlined, RadarChartOutlined, DotChartOutlined, HeatMapOutlined, PieChartOutlined, DownloadOutlined, CompressOutlined, EyeOutlined, FileTextOutlined, ShareAltOutlined, PrinterOutlined, ReloadOutlined, FilterOutlined, FullscreenOutlined, SwapOutlined } from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import api from "../utils/api";
import dayjs from "dayjs";
const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

const CHART_COLORS = ["#1890ff","#52c41a","#722ed1","#fa8c16","#eb2f96","#13c2c2","#faad14","#2f54eb","#a0d911","#f5222d"];

// 模拟评测数据
const genMockData = () => {
  const models = ["ResNet50","DistilBERT","MobileNetV2","GPT2-Small","BERT-Base"];
  const chips = ["昇腾910B","昇腾910C","寒武纪590","海光Z100","壁仞BR100"];
  return models.map((m,i) => ({
    id:i+1, taskNo:`EVAL-2026-${String(i+1).padStart(4,"0")}`, name:`${m} on ${chips[i%5]}`, model:m, chip:chips[i%5],
    status:"COMPLETED", evalType:"PERFORMANCE",
    latencyP50:5+Math.random()*20, latencyP95:10+Math.random()*40, latencyP99:15+Math.random()*60,
    throughput:100+Math.random()*900, gpuUtil:60+Math.random()*35, memUsage:2+Math.random()*14,
    power:80+Math.random()*200, accuracy:85+Math.random()*14, f1:80+Math.random()*18,
    topsPerWatt:5+Math.random()*25, batchSize:2**(Math.floor(Math.random()*5)+2),
    createdAt:dayjs().subtract(i,"day").format("YYYY-MM-DD HH:mm"),
    duration:Math.floor(10+Math.random()*50)+"min",
  }));
};

const buildLatencyChart = (data) => ({
  title:{text:"推理延迟分布",left:"center",textStyle:{fontSize:14}},
  tooltip:{trigger:"axis"},
  legend:{data:["P50","P95","P99"],bottom:0},
  xAxis:{type:"category",data:data.map(d=>d.model),axisLabel:{rotate:15}},
  yAxis:{type:"value",name:"延迟(ms)"},
  series:[
    {name:"P50",type:"bar",data:data.map(d=>d.latencyP50.toFixed(1)),itemStyle:{color:CHART_COLORS[0]}},
    {name:"P95",type:"bar",data:data.map(d=>d.latencyP95.toFixed(1)),itemStyle:{color:CHART_COLORS[1]}},
    {name:"P99",type:"bar",data:data.map(d=>d.latencyP99.toFixed(1)),itemStyle:{color:CHART_COLORS[2]}},
  ],
});

const buildThroughputChart = (data) => ({
  title:{text:"吞吐量对比",left:"center",textStyle:{fontSize:14}},
  tooltip:{trigger:"axis"},
  xAxis:{type:"category",data:data.map(d=>d.model),axisLabel:{rotate:15}},
  yAxis:{type:"value",name:"吞吐量(QPS)"},
  series:[{type:"bar",data:data.map(d=>d.throughput.toFixed(0)),itemStyle:{color:{type:"linear",x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:"#1890ff"},{offset:1,color:"#722ed1"}]}},barWidth:"40%"}],
});

const buildRadarChart = (data) => {
  const indicators = [{name:"吞吐量",max:1200},{name:"GPU利用率",max:100},{name:"精度",max:100},{name:"能效比",max:30},{name:"F1值",max:100}];
  return {
    title:{text:"多维性能雷达图",left:"center",textStyle:{fontSize:14}},
    tooltip:{},
    legend:{data:data.slice(0,3).map(d=>d.model),bottom:0},
    radar:{indicator:indicators,radius:"60%"},
    series:[{type:"radar",data:data.slice(0,3).map((d,i)=>({value:[d.throughput/10,d.gpuUtil,d.accuracy,d.topsPerWatt,d.f1],name:d.model,lineStyle:{color:CHART_COLORS[i]},areaStyle:{color:CHART_COLORS[i],opacity:0.1}}))}],
  };
};

const buildScatterChart = (data) => ({
  title:{text:"延迟-吞吐量分布",left:"center",textStyle:{fontSize:14}},
  tooltip:{trigger:"item",formatter:p=>`${p.data[2]}<br/>延迟:${p.data[0].toFixed(1)}ms<br/>吞吐:${p.data[1].toFixed(0)}QPS`},
  xAxis:{type:"value",name:"P95延迟(ms)"},
  yAxis:{type:"value",name:"吞吐量(QPS)"},
  series:[{type:"scatter",data:data.map(d=>[d.latencyP95,d.throughput,d.model]),symbolSize:d=>Math.sqrt(d[1])*2,itemStyle:{color:CHART_COLORS[0],opacity:0.7},label:{show:true,formatter:p=>p.data[2],position:"top",fontSize:10}}],
});

const buildHeatmapChart = (data) => {
  const metrics = ["延迟","吞吐量","GPU利用率","精度","能效比"];
  const heatData = [];
  data.forEach((d,i) => {
    [d.latencyP95/60*100,d.throughput/12,d.gpuUtil,d.accuracy,d.topsPerWatt/30*100].forEach((v,j)=>{
      heatData.push([j,i,Math.round(v)]);
    });
  });
  return {
    title:{text:"性能热力图",left:"center",textStyle:{fontSize:14}},
    tooltip:{formatter:p=>`${data[p.data[1]]?.model||""}<br/>${metrics[p.data[0]]}: ${p.data[2]}%`},
    xAxis:{type:"category",data:metrics},
    yAxis:{type:"category",data:data.map(d=>d.model)},
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
  title:{text:"芯片分布",left:"center",textStyle:{fontSize:14}},
  tooltip:{trigger:"item",formatter:"{b}: {c} ({d}%)"},
  legend:{bottom:0},
  series:[{type:"pie",radius:["40%","65%"],avoidLabelOverlap:true,itemStyle:{borderRadius:6,borderColor:"#fff",borderWidth:2},
    data:[...new Set(data.map(d=>d.chip))].map((c,i)=>({value:data.filter(d=>d.chip===c).length,name:c,itemStyle:{color:CHART_COLORS[i]}})),
    label:{show:true,formatter:"{b}\n{d}%"}}],
});

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [chartType, setChartType] = useState("bar");
  const [detailVisible, setDetailVisible] = useState(false);

  const mockData = useMemo(() => genMockData(), []);

  useEffect(() => {
    setLoading(true);
    // 模拟API调用
    setTimeout(() => {
      setReports(mockData);
      setLoading(false);
    }, 500);
  }, []);

  const fetchReports = () => { setLoading(true); setTimeout(()=>{setReports(genMockData());setLoading(false);},500); };

  const compareData = useMemo(() => compareIds.length>0 ? reports.filter(r=>compareIds.includes(r.id)) : reports, [reports, compareIds]);

  const handleExport = (format) => { message.success(`报告导出为 ${format} 格式（功能开发中）`); };

  const columns = [
    { title:"编号", dataIndex:"taskNo", width:160 },
    { title:"评测名称", dataIndex:"name", width:220, ellipsis:true },
    { title:"模型", dataIndex:"model", width:120, render:v=><Tag color="blue">{v}</Tag> },
    { title:"芯片", dataIndex:"chip", width:120, render:v=><Tag color="purple">{v}</Tag> },
    { title:"P95延迟", dataIndex:"latencyP95", width:100, render:v=><span>{v.toFixed(1)} ms</span>, sorter:(a,b)=>a.latencyP95-b.latencyP95 },
    { title:"吞吐量", dataIndex:"throughput", width:100, render:v=><span>{v.toFixed(0)} QPS</span>, sorter:(a,b)=>a.throughput-b.throughput },
    { title:"GPU利用率", dataIndex:"gpuUtil", width:110, render:v=><Progress percent={Math.round(v)} size="small" strokeColor={v>80?"#52c41a":v>50?"#1890ff":"#faad14"}/> },
    { title:"精度", dataIndex:"accuracy", width:90, render:v=><span style={{color:v>95?"#52c41a":v>90?"#1890ff":"#fa8c16"}}>{v.toFixed(1)}%</span> },
    { title:"操作", key:"action", width:150, render:(_,r)=>(
      <Space>
        <Button type="link" size="small" icon={<EyeOutlined/>} onClick={()=>{setSelectedReport(r);setDetailVisible(true);}}>详情</Button>
        <Button type="link" size="small" icon={<DownloadOutlined/>} onClick={()=>handleExport("PDF")}>导出</Button>
      </Space>
    )},
  ];

  return (
    <div>
      {/* 统计卡片 */}
      <Row gutter={16} style={{marginBottom:16}}>
        {[["评测报告",reports.length,<FileTextOutlined/>,"#1890ff"],["平均延迟",(reports.reduce((s,r)=>s+r.latencyP95,0)/Math.max(reports.length,1)).toFixed(1)+"ms",<LineChartOutlined/>,"#fa8c16"],["平均吞吐",(reports.reduce((s,r)=>s+r.throughput,0)/Math.max(reports.length,1)).toFixed(0)+"QPS",<BarChartOutlined/>,"#52c41a"],["平均精度",(reports.reduce((s,r)=>s+r.accuracy,0)/Math.max(reports.length,1)).toFixed(1)+"%",<RadarChartOutlined/>,"#722ed1"]].map(([t,v,icon,color],i)=>(
          <Col span={6} key={i}><Card size="small"><Statistic title={t} value={v} prefix={React.cloneElement(icon,{style:{color}})} valueStyle={{color}}/></Card></Col>
        ))}
      </Row>

      {/* 图表区域 */}
      <Card title="性能可视化" size="small" style={{marginBottom:16}} extra={<Space>
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
        {compareMode && <div style={{marginBottom:12}}><Select mode="multiple" placeholder="选择要对比的报告（2-10份）" style={{width:"100%"}} value={compareIds} onChange={setCompareIds} options={reports.map(r=>({value:r.id,label:`${r.model} on ${r.chip}`}))} maxTagCount={5}/></div>}
        <Row gutter={16}>
          <Col span={12}>
            <ReactECharts option={chartType==="bar"?buildLatencyChart(compareData):chartType==="line"?buildTrendChart(compareData):chartType==="radar"?buildRadarChart(compareData):chartType==="scatter"?buildScatterChart(compareData):chartType==="heatmap"?buildHeatmapChart(compareData):buildPieChart(compareData)} style={{height:360}}/>
          </Col>
          <Col span={12}>
            <ReactECharts option={chartType==="bar"?buildThroughputChart(compareData):chartType==="line"?buildLatencyChart(compareData):chartType==="radar"?buildScatterChart(compareData):chartType==="scatter"?buildRadarChart(compareData):chartType==="heatmap"?buildTrendChart(compareData):buildThroughputChart(compareData)} style={{height:360}}/>
          </Col>
        </Row>
      </Card>

      {/* 报告列表 */}
      <Card title="评测报告列表" size="small" extra={<Space>
        <Button size="small" icon={<ReloadOutlined/>} onClick={fetchReports}>刷新</Button>
        <Select defaultValue="all" size="small" style={{width:110}} options={[{value:"all",label:"全部报告"},{value:"PERFORMANCE",label:"性能评测"},{value:"ACCURACY",label:"精度评测"}]}/>
        <Button size="small" icon={<DownloadOutlined/>} onClick={()=>handleExport("Excel")}>批量导出</Button>
      </Space>}>
        <Table columns={columns} dataSource={reports} rowKey="id" loading={loading} size="small" pagination={{pageSize:10,showTotal:t=>"共 "+t+" 条"}}
          rowSelection={compareMode?{selectedRowKeys:compareIds,onChange:setCompareIds}:undefined}/>
      </Card>

      {/* 详情弹窗 */}
      <Drawer title="评测报告详情" open={detailVisible} onClose={()=>setDetailVisible(false)} width={800}>
        {selectedReport && <div>
          <Descriptions bordered column={2} size="small" style={{marginBottom:16}}>
            <Descriptions.Item label="编号">{selectedReport.taskNo}</Descriptions.Item>
            <Descriptions.Item label="名称">{selectedReport.name}</Descriptions.Item>
            <Descriptions.Item label="模型"><Tag color="blue">{selectedReport.model}</Tag></Descriptions.Item>
            <Descriptions.Item label="芯片"><Tag color="purple">{selectedReport.chip}</Tag></Descriptions.Item>
            <Descriptions.Item label="P50延迟">{selectedReport.latencyP50.toFixed(2)} ms</Descriptions.Item>
            <Descriptions.Item label="P95延迟">{selectedReport.latencyP95.toFixed(2)} ms</Descriptions.Item>
            <Descriptions.Item label="P99延迟">{selectedReport.latencyP99.toFixed(2)} ms</Descriptions.Item>
            <Descriptions.Item label="吞吐量">{selectedReport.throughput.toFixed(0)} QPS</Descriptions.Item>
            <Descriptions.Item label="GPU利用率"><Progress percent={Math.round(selectedReport.gpuUtil)} size="small"/></Descriptions.Item>
            <Descriptions.Item label="显存占用">{selectedReport.memUsage.toFixed(1)} GB</Descriptions.Item>
            <Descriptions.Item label="功耗">{selectedReport.power.toFixed(0)} W</Descriptions.Item>
            <Descriptions.Item label="能效比">{selectedReport.topsPerWatt.toFixed(1)} TOPS/W</Descriptions.Item>
            <Descriptions.Item label="精度">{selectedReport.accuracy.toFixed(2)}%</Descriptions.Item>
            <Descriptions.Item label="F1值">{selectedReport.f1.toFixed(2)}%</Descriptions.Item>
            <Descriptions.Item label="Batch Size">{selectedReport.batchSize}</Descriptions.Item>
            <Descriptions.Item label="执行时长">{selectedReport.duration}</Descriptions.Item>
          </Descriptions>
          <Divider>性能图表</Divider>
          <Row gutter={16}>
            <Col span={12}><ReactECharts option={buildRadarChart([selectedReport])} style={{height:300}}/></Col>
            <Col span={12}><ReactECharts option={buildLatencyChart([selectedReport])} style={{height:300}}/></Col>
          </Row>
          <Divider/>
          <Space>
            <Button icon={<DownloadOutlined/>} type="primary" onClick={()=>handleExport("PDF")}>导出PDF</Button>
            <Button icon={<DownloadOutlined/>} onClick={()=>handleExport("Word")}>导出Word</Button>
            <Button icon={<DownloadOutlined/>} onClick={()=>handleExport("Excel")}>导出Excel</Button>
            <Button icon={<ShareAltOutlined/>} onClick={()=>message.info("分享功能开发中")}>分享</Button>
            <Button icon={<PrinterOutlined/>} onClick={()=>window.print()}>打印</Button>
          </Space>
        </div>}
      </Drawer>
    </div>
  );
}
