import React, { useState, useEffect } from "react";
import { Card, Spin, Empty, Tag, Row, Col, Statistic } from "antd";
import { LineChartOutlined, WarningOutlined } from "@ant-design/icons";
import api from "../../utils/api";
export default function ReportAnalysis({ reportId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!reportId) return;
    api.get("/api/v1/reports/" + reportId + "/analysis").then(r => setData(r.data?.data)).catch(() => {}).finally(() => setLoading(false));
  }, [reportId]);
  if (loading) return <Spin />;
  if (!data) return <Empty description="暂无分析数据" />;
  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="趋势" value={data.trend || "持平"} prefix={<LineChartOutlined />} /></Card></Col>
        <Col span={6}><Card><Statistic title="波动率" value={data.volatility || 0} suffix="%" /></Card></Col>
        <Col span={6}><Card><Statistic title="异常点" value={data.anomalyCount || 0} prefix={<WarningOutlined />} valueStyle={data.anomalyCount > 0 ? { color: "#cf1322" } : {}} /></Card></Col>
        <Col span={6}><Card><Statistic title="置信度" value={data.confidence || 95} suffix="%" /></Card></Col>
      </Row>
      <Card title="趋势分析" size="small">
        <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>趋势图表区域（ECharts 集成中）</div>
        {data.anomalies?.length > 0 && (
          <div style={{ marginTop: 8 }}>{data.anomalies.map((a, i) => <Tag key={i} color="red">异常: {a}</Tag>)}</div>
        )}
      </Card>
    </div>
  );
}
