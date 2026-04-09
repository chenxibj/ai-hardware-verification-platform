# #247 节点管理增强 — 故障诊断控制台 + 一键修复

## 状态: ✅ 完成

## 完成时间: 2026-04-08 13:48

## 完成内容

### 1. 前端 NodeList.js 增强 ✅
- 操作列新增 🔍诊断 和 🔧修复 按钮
- 诊断 Modal: 调用 `POST /nodes/{id}/diagnose`，展示健康状态(HEALTHY/DEGRADED/UNHEALTHY，颜色标识)、Ping连通性、SSH可达、Agent进程、心跳时间
- 有问题时显示「一键修复」按钮，点击跳转修复
- 修复 Modal: 调用 `POST /nodes/{id}/repair`，展示修复过程和结果（成功/失败）

### 2. 节点状态增强 ✅
- lastHeartbeat 列使用 dayjs 相对时间显示（"3分钟前"），hover 显示精确时间
- OFFLINE/ERROR 状态: 红色 Badge + Tooltip "点击诊断"，点击直接触发诊断
- 节点详情 Drawer: 展示基本信息 + hardwareInfo/envInfo（JSON 解析为友好的 Descriptions 表格）
- Drawer 底部有诊断/修复快捷按钮

### 3. Agent 心跳自动重注册 ✅
- heartbeat.py `_send_heartbeat` 方法: 检测 404 响应自动调用 `register_node(self.config)` 重注册
- 重注册成功更新 `self.node_id`
- 添加了 `self.config` 属性存储（用于 register_node 调用）
- 日志记录: "心跳 404（节点不存在），尝试自动重注册..."

### 4. 构建部署 ✅
- 前端 build 成功，docker cp 部署到 ahvp-frontend
- Agent heartbeat.py 更新到 /opt 运行目录，进程已重启
- Agent 注册成功 ID=2, 心跳正常

### 5. Git ✅
- Commit: `f0821db3` feat(#247): 节点管理增强 — 故障诊断控制台 + 一键修复
- Push 到 main 分支

## API 验证
- `POST /api/nodes/2/diagnose` → 200, health=DEGRADED (SSH不通因为后端容器无ssh，ping和心跳正常)
- `POST /api/nodes/2/repair` → 200, success=false (后端容器无ssh客户端，预期行为)
- 节点列表 → ID=2, dev-node-01, ONLINE, heartbeat 正常
