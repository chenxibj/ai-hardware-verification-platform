import React, { useState, useEffect } from "react";
import { Layout, Menu, Button, Dropdown, Avatar, Typography, message, ConfigProvider, Badge, Space } from "antd";
import { DashboardOutlined, ProjectOutlined, FileTextOutlined, SettingOutlined, UserOutlined, LogoutOutlined, TeamOutlined, DatabaseOutlined, FileSearchOutlined, CloudServerOutlined, CommentOutlined, BellOutlined, ApartmentOutlined, DiffOutlined, AuditOutlined } from "@ant-design/icons";
import zhCN from "antd/locale/zh_CN";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Tasks from "./pages/Tasks";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import Assets from "./pages/Assets";
import Logs from "./pages/Logs";
import Community from "./pages/Community";
import Resources from "./pages/Resources";
import Workflows from "./pages/Workflows";
import Comparisons from "./pages/Comparisons";
import AuditLogs from "./pages/AuditLogs";
import Settings from "./pages/Settings";
import { authApi } from "./utils/api";
import api from "./utils/api";

const { Header, Content, Sider, Footer } = Layout;
const { Text } = Typography;

function App() {
  const [user, setUser] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem("user");
    if (saved) { try { setUser(JSON.parse(saved)); } catch(e) { localStorage.clear(); } }
  }, []);
  useEffect(() => { if (user) { api.get("/notifications/count").then(r=>{if(r.data.code===0)setUnread(r.data.data.unread);}).catch(()=>{}); } }, [user, currentPage]);

  const handleLogin = (u) => setUser(u);
  const handleLogout = async () => { try{await authApi.logout();}catch(e){} localStorage.clear(); setUser(null); message.success("已退出登录"); };
  if (!user) return <ConfigProvider locale={zhCN}><Login onLogin={handleLogin}/></ConfigProvider>;

  const menuItems = [
    { key:"dashboard", icon:<DashboardOutlined/>, label:"工作台" },
    { type:"divider" },
    { key:"g1", label:"评测管理", type:"group", children:[
      { key:"tasks", icon:<ProjectOutlined/>, label:"评测任务" },
      { key:"workflows", icon:<ApartmentOutlined/>, label:"评测编排" },
      { key:"reports", icon:<FileTextOutlined/>, label:"评测报告" },
      { key:"comparisons", icon:<DiffOutlined/>, label:"报告对比" },
      { key:"logs", icon:<FileSearchOutlined/>, label:"评测日志" },
    ]},
    { key:"g2", label:"资源管理", type:"group", children:[
      { key:"assets", icon:<DatabaseOutlined/>, label:"数字资产" },
      { key:"resources", icon:<CloudServerOutlined/>, label:"计算资源" },
    ]},
    { key:"g3", label:"社区与系统", type:"group", children:[
      { key:"community", icon:<CommentOutlined/>, label:"社区" },
      { key:"users", icon:<TeamOutlined/>, label:"用户管理" },
      { key:"audit", icon:<AuditOutlined/>, label:"操作审计" },
      { key:"settings", icon:<SettingOutlined/>, label:"系统设置" },
    ]},
  ];

  const roleMap = { ADMIN:"管理员", USER:"普通用户", REVIEWER:"审核员", OPERATOR:"运维" };
  const pageTitles = { dashboard:"工作台", tasks:"评测任务管理", workflows:"评测编排工作流", reports:"评测报告管理", comparisons:"报告对比分析", logs:"评测日志", assets:"数字资产管理", resources:"计算资源管理", community:"验证平台社区", users:"用户管理", audit:"操作审计", settings:"系统设置" };

  const userMenu = { items: [
    { key:"p", icon:<UserOutlined/>, label:user.username, disabled:true },
    { key:"r", icon:<TeamOutlined/>, label:"角色："+(roleMap[user.role]||user.role), disabled:true },
    { type:"divider" },
    { key:"logout", icon:<LogoutOutlined/>, label:"退出登录", onClick:handleLogout, danger:true },
  ]};

  const pages = { dashboard:<Dashboard/>, tasks:<Tasks/>, workflows:<Workflows/>, reports:<Reports/>, comparisons:<Comparisons/>, logs:<Logs/>, assets:<Assets/>, resources:<Resources/>, community:<Community/>, users:<Users/>, audit:<AuditLogs/>, settings:<Settings/> };

  return (
    <ConfigProvider locale={zhCN}>
      <Layout style={{minHeight:"100vh"}}>
        <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="dark" width={210}
          style={{background:"linear-gradient(180deg,#001529 0%,#002140 100%)"}}>
          <div style={{height:56,margin:"8px 12px",display:"flex",alignItems:"center",justifyContent:"center",borderBottom:"1px solid rgba(255,255,255,0.1)",paddingBottom:8}}>
            <Text strong style={{color:"#fff",fontSize:collapsed?13:14,whiteSpace:"nowrap"}}>{collapsed?"AHVP":"AI软硬件验证平台"}</Text>
          </div>
          <Menu theme="dark" selectedKeys={[currentPage]} mode="inline" items={menuItems} onClick={({key})=>setCurrentPage(key)} style={{background:"transparent"}}/>
        </Sider>
        <Layout>
          <Header style={{padding:"0 24px",background:"#fff",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 1px 4px rgba(0,0,0,0.08)",zIndex:10}}>
            <Text strong style={{fontSize:18}}>{pageTitles[currentPage]||"工作台"}</Text>
            <Space size={16}>
              <Badge count={unread} size="small"><Button type="text" icon={<BellOutlined/>}/></Badge>
              <Dropdown menu={userMenu} placement="bottomRight">
                <Button type="text" style={{display:"flex",alignItems:"center",gap:8,height:40}}>
                  <Avatar size={28} icon={<UserOutlined/>} style={{backgroundColor:"#1890ff"}}/><span>{user.username}</span>
                </Button>
              </Dropdown>
            </Space>
          </Header>
          <Content style={{padding:24,background:"#f0f2f5",minHeight:360}}>{pages[currentPage]||<Dashboard/>}</Content>
          <Footer style={{textAlign:"center",color:"#999",padding:"12px 50px",fontSize:12}}>人工智能软硬件验证平台 v1.0.0 ©2026 上海人工智能实验室</Footer>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
export default App;
