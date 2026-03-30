import React, { useState, useEffect } from 'react';
import { Layout, Menu, Table, Tag, Space, Button, Card, Statistic, Row, Col, message } from 'antd';
import {
  DashboardOutlined,
  ProjectOutlined,
  FileTextOutlined,
  SettingOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Header, Content, Sider } = Layout;

const API_BASE = '/api';

function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, running: 0, completed: 0, failed: 0 });

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/tasks?size=100`);
      if (response.data.code === 0) {
        setTasks(response.data.data || []);
        calculateStats(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
      message.error('获取任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (tasks) => {
    const stats = {
      total: tasks.length,
      running: tasks.filter(t => t.status === 'RUNNING').length,
      completed: tasks.filter(t => t.status === 'COMPLETED').length,
      failed: tasks.filter(t => t.status === 'FAILED').length,
    };
    setStats(stats);
  };

  const columns = [
    {
      title: '任务编号',
      dataIndex: 'taskNo',
      key: 'taskNo',
    },
    {
      title: '任务类型',
      dataIndex: 'taskType',
      key: 'taskType',
      render: (type) => type === 'TEMPLATE' ? '模板' : '自定义',
    },
    {
      title: '评测类型',
      dataIndex: 'evalType',
      key: 'evalType',
      render: (type) => {
        const map = { MODEL: '模型', CHIP: '芯片', FRAMEWORK: '框架', OPERATOR: '算子' };
        return map[type] || type;
      },
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      render: (priority) => {
        const color = { HIGH: 'red', MEDIUM: 'blue', LOW: 'gray' }[priority] || 'default';
        return <Tag color={color}>{priority === 'HIGH' ? '高' : priority === 'MEDIUM' ? '中' : '低'}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const color = {
          PENDING: 'default',
          QUEUED: 'processing',
          RUNNING: 'processing',
          COMPLETED: 'success',
          FAILED: 'error',
          CANCELLED: 'default',
        }[status] || 'default';
        const text = {
          PENDING: '待调度',
          QUEUED: '排队中',
          RUNNING: '运行中',
          COMPLETED: '已完成',
          FAILED: '失败',
          CANCELLED: '已取消',
        }[status] || status;
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      render: (progress) => `${progress}%`,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (time) => time ? new Date(time).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small">详情</Button>
          {record.status === 'RUNNING' && (
            <Button type="link" size="small" danger>取消</Button>
          )}
          {(record.status === 'FAILED' || record.status === 'CANCELLED') && (
            <Button type="link" size="small">重试</Button>
          )}
        </Space>
      ),
    },
  ];

  const menuItems = [
    { key: '1', icon: <DashboardOutlined />, label: '控制台' },
    { key: '2', icon: <ProjectOutlined />, label: '任务管理' },
    { key: '3', icon: <FileTextOutlined />, label: '报告管理' },
    { key: '4', icon: <SettingOutlined />, label: '系统设置' },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div style={{ 
          height: 32, 
          margin: 16, 
          background: 'rgba(255, 255, 255, 0.2)',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 'bold',
        }}>
          {collapsed ? 'AI' : 'AI 验证平台'}
        </div>
        <Menu theme="dark" defaultSelectedKeys={['1']} mode="inline" items={menuItems} />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 16px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 18, fontWeight: 'bold' }}>人工智能软硬件验证平台</span>
          <Button icon={<ReloadOutlined />} onClick={fetchTasks}>刷新</Button>
        </Header>
        <Content style={{ padding: '24px 16px' }}>
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={6}>
              <Card>
                <Statistic title="总任务数" value={stats.total} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="运行中" value={stats.running} valueStyle={{ color: '#1890ff' }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="已完成" value={stats.completed} valueStyle={{ color: '#52c41a' }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic title="失败" value={stats.failed} valueStyle={{ color: '#ff4d4f' }} />
              </Card>
            </Col>
          </Row>

          <Card 
            title="任务列表"
            extra={
              <Button type="primary" icon={<PlusOutlined />}>
                创建任务
              </Button>
            }
          >
            <Table
              columns={columns}
              dataSource={tasks}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;
