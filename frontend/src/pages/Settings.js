import React, { useState, useEffect } from "react";
import { Card, Descriptions, Tag, Row, Col, Statistic, Button, message, Spin, Divider, Typography, Badge, List } from "antd";
import { HeartOutlined, DatabaseOutlined, CloudServerOutlined, CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { healthApi } from "../utils/api";

const { Title, Text } = Typography;

export default function Settings() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [user] = useState(() => { try { return JSON.parse(localStorage.getItem("user")); } catch(e) { return null; } });

  const checkHealth = async () => {
    setLoading(true);
    try {
      const res = await healthApi.check();
      setHealth(res.data);
      message.success("健康检查完成");
    } catch(e) { message.error("健康检查失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { checkHealth(); }, []);

  const StatusIcon = ({up}) => up ? <CheckCircleOutlined style={{color:"#52c41a",fontSize:20}}/> : <CloseCircleOutlined style={{color:"#ff4d4f",fontSize:20}}/>;

  return (
    <Spin spinning={loading}>
    <div>
      <Row gutter={24}>
        <Col xs={24} md={12}>
          <Card title={<span><InfoCircleOutlined/> 系统信息</span>}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="平台名称">人工智能软硬件验证平台</Descriptions.Item>
              <Descriptions.Item label="版本号">v1.0.0-SNAPSHOT</Descriptions.Item>
              <Descriptions.Item label="后端框架">Spring Boot 3.2.4</Descriptions.Item>
              <Descriptions.Item label="前端框架">React 18 + Ant Design 5</Descriptions.Item>
              <Descriptions.Item label="数据库">PostgreSQL 15</Descriptions.Item>
              <Descriptions.Item label="缓存">Redis 7</Descriptions.Item>
              <Descriptions.Item label="对象存储">MinIO</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={<span><HeartOutlined/> 服务健康状态</span>} extra={<Button icon={<ReloadOutlined/>} onClick={checkHealth} loading={loading}>刷新</Button>}>
            {health ? (
              <List itemLayout="horizontal" dataSource={[
                { name:"系统总状态", status:health.status==="UP", desc:health.status },
                { name:"数据库 (PostgreSQL)", status:health.components?.db?.status==="UP", desc:health.components?.db?.database||"" },
                { name:"缓存 (Redis)", status:health.components?.redis?.status==="UP", desc:"Redis 7" },
              ]} renderItem={item => (
                <List.Item>
                  <List.Item.Meta avatar={<StatusIcon up={item.status}/>}
                    title={<span>{item.name} <Tag color={item.status?"success":"error"}>{item.status?"正常":"异常"}</Tag></span>}
                    description={item.desc}/>
                </List.Item>
              )}/>
            ) : <Spin tip="检查中..."/>}
          </Card>
        </Col>
      </Row>

      {user && (
        <Card title="当前用户" style={{marginTop:24}}>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="用户名">{user.username}</Descriptions.Item>
            <Descriptions.Item label="邮箱">{user.email}</Descriptions.Item>
            <Descriptions.Item label="角色"><Tag color="blue">{user.role}</Tag></Descriptions.Item>
            <Descriptions.Item label="状态"><Badge status="success" text={user.status}/></Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </div>
    </Spin>
  );
}
