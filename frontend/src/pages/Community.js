import React, { useState, useEffect } from "react";
import { Card, List, Tag, Space, Button, Row, Col, Statistic, Modal, Form, Input, Select, message, Avatar, Typography, Divider } from "antd";
import { ReadOutlined, PlusOutlined, LikeOutlined, EyeOutlined, MessageOutlined, SearchOutlined, PushpinOutlined } from "@ant-design/icons";
import api from "../utils/api";
import dayjs from "dayjs";
const { Paragraph, Text, Title } = Typography;

export default function Community() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({});
  const [createVisible, setCreateVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selected, setSelected] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [form] = Form.useForm();

  const fetch = async () => {
    setLoading(true);
    try {
      const params = { size:50 };
      if (searchText) params.keyword = searchText;
      if (categoryFilter) params.category = categoryFilter;
      const r = await api.get("/community/articles", { params });
      if(r.data.code===0) setArticles(r.data.data||[]);
    } catch(e) { message.error("获取失败"); }
    finally { setLoading(false); }
  };
  const fetchStats = async () => { try { const r = await api.get("/community/stats"); if(r.data.code===0) setStats(r.data.data); } catch(e){} };
  useEffect(() => { fetch(); fetchStats(); }, []);

  const handleCreate = async (values) => {
    try { const r = await api.post("/community/articles", values); if(r.data.code===0) { message.success("发布成功"); setCreateVisible(false); form.resetFields(); fetch(); fetchStats(); } }
    catch(e) { message.error("发布失败"); }
  };
  const handleLike = async (id) => { try { await api.post("/community/articles/"+id+"/like"); fetch(); } catch(e){} };
  const viewDetail = async (id) => {
    try { const r = await api.get("/community/articles/"+id); if(r.data.code===0) { setSelected(r.data.data); setDetailVisible(true); } }
    catch(e) { message.error("获取失败"); }
  };

  const catMap = { TUTORIAL:"教程", CASE_STUDY:"案例", ANNOUNCEMENT:"公告", DISCUSSION:"讨论", REQUIREMENT:"需求" };
  const catColors = { TUTORIAL:"blue", CASE_STUDY:"green", ANNOUNCEMENT:"red", DISCUSSION:"default", REQUIREMENT:"purple" };

  return (
    <div>
      <Row gutter={16} style={{marginBottom:24}}>
        <Col span={6}><Card hoverable><Statistic title="文章总数" value={stats.articles||0} prefix={<ReadOutlined/>}/></Card></Col>
        <Col span={6}><Card hoverable><Statistic title="教程" value={stats.tutorials||0} valueStyle={{color:"#1890ff"}}/></Card></Col>
        <Col span={6}><Card hoverable><Statistic title="讨论" value={stats.discussions||0}/></Card></Col>
        <Col span={6}><Card hoverable><Statistic title="需求" value={stats.requirements||0} valueStyle={{color:"#722ed1"}}/></Card></Col>
      </Row>
      <Card title="社区" extra={<Space>
        <Input placeholder="搜索" prefix={<SearchOutlined/>} value={searchText} onChange={e=>setSearchText(e.target.value)} onPressEnter={fetch} style={{width:160}} allowClear/>
        <Select placeholder="分类" allowClear style={{width:100}} value={categoryFilter} onChange={v=>{setCategoryFilter(v);}}
          options={Object.entries(catMap).map(([k,v])=>({value:k,label:v}))}/>
        <Button onClick={fetch}>查询</Button>
        <Button type="primary" icon={<PlusOutlined/>} onClick={()=>setCreateVisible(true)}>发布文章</Button>
      </Space>}>
        <List loading={loading} itemLayout="vertical" dataSource={articles} pagination={{pageSize:10}}
          renderItem={item => (
            <List.Item key={item.id} actions={[
              <span><EyeOutlined/> {item.viewCount}</span>,
              <span onClick={()=>handleLike(item.id)} style={{cursor:"pointer"}}><LikeOutlined/> {item.likeCount}</span>,
              <span><MessageOutlined/> {item.commentCount}</span>,
            ]}>
              <List.Item.Meta
                avatar={<Avatar style={{backgroundColor:"#1890ff"}}>{(item.authorName||"U")[0]}</Avatar>}
                title={<Space><a onClick={()=>viewDetail(item.id)}>{item.title}</a><Tag color={catColors[item.category]}>{catMap[item.category]||item.category}</Tag>
                  {item.isPinned && <Tag color="red"><PushpinOutlined/> 置顶</Tag>}</Space>}
                description={<span>{item.authorName} · {dayjs(item.createdAt).format("YYYY-MM-DD HH:mm")}</span>}
              />
              {item.summary && <Paragraph ellipsis={{rows:2}} style={{color:"#666"}}>{item.summary}</Paragraph>}
            </List.Item>
          )}/>
      </Card>

      <Modal title="发布文章" open={createVisible} onCancel={()=>setCreateVisible(false)} footer={null} width={700} destroyOnClose>
        <Form form={form} onFinish={handleCreate} layout="vertical" initialValues={{category:"DISCUSSION"}}>
          <Form.Item name="title" label="标题" rules={[{required:true}]}><Input placeholder="文章标题"/></Form.Item>
          <Form.Item name="category" label="分类" rules={[{required:true}]}>
            <Select options={Object.entries(catMap).map(([k,v])=>({value:k,label:v}))}/>
          </Form.Item>
          <Form.Item name="summary" label="摘要"><Input.TextArea rows={2}/></Form.Item>
          <Form.Item name="content" label="正文" rules={[{required:true}]}><Input.TextArea rows={8} placeholder="支持Markdown格式"/></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block size="large">发布</Button></Form.Item>
        </Form>
      </Modal>

      <Modal title={selected?.title} open={detailVisible} onCancel={()=>setDetailVisible(false)} width={800} footer={null}>
        {selected && <div>
          <Space style={{marginBottom:16}}><Tag color={catColors[selected.category]}>{catMap[selected.category]}</Tag>
            <Text type="secondary">{selected.authorName} · {dayjs(selected.createdAt).format("YYYY-MM-DD HH:mm")}</Text>
            <Text type="secondary"><EyeOutlined/> {selected.viewCount} · <LikeOutlined/> {selected.likeCount}</Text></Space>
          <Divider/>
          <div style={{whiteSpace:"pre-wrap",lineHeight:1.8}}>{selected.content}</div>
        </div>}
      </Modal>
    </div>
  );
}
