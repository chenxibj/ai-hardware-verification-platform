# ADR-003: 前端框架选择 React + Ant Design

## 状态

已采纳 (Accepted)

## 背景

AI 软硬件验证平台前端需要支撑以下场景：

- **复杂表单与表格：** 评测计划配置、设备管理、参数编辑
- **数据可视化：** 性能指标图表、对比分析、仪表盘
- **实时交互：** 任务状态更新、日志流、进度追踪
- **企业级 UI：** 规范统一的交互体验、响应式布局、国际化
- **中大型 SPA：** 多模块路由、状态管理、权限控制

项目已确定使用 ECharts 进行数据可视化（echarts-for-react），需要与前端框架良好集成。

## 决策

选择 **React 18 + Ant Design 5 + Zustand** 作为前端技术栈。

## 理由

### 1. React 的核心优势

- **组件模型清晰：** 函数组件 + Hooks 模式，逻辑复用简洁（评测流程中大量共享逻辑）
- **生态最完善：** React 周边库数量远超其他框架（ReactFlow 用于工作流可视化、ECharts-for-React 等）
- **TypeScript 支持：** React + TS 的最佳实践最为成熟
- **大型项目验证：** Meta、Netflix、Airbnb 等大厂项目验证了 React 在复杂应用中的表现

### 2. Ant Design 对企业级应用的适配

- **组件覆盖全面：** Table（复杂数据展示）、Form（动态表单）、Tree（层级结构）、Drawer（详情面板）等完美匹配验证平台需求
- **开箱即用的设计系统：** 统一的视觉语言，无需额外 UI 设计师支持
- **中文生态友好：** 阿里出品，文档、社区、问题排查均有中文资源
- **ProComponents：** 高级组件如 ProTable、ProForm 可加速后台开发

### 3. Zustand 轻量状态管理

- 相比 Redux 的模板代码，Zustand API 极简
- 支持中间件（持久化、日志）
- 与 React 18 并发特性兼容良好
- 适合中大型项目的模块化 store

### 4. 技术栈一致性

- Create React App (react-scripts) 提供零配置的开发环境
- 与 ECharts、ReactFlow 等可视化库天然兼容
- 前后端分离架构，通过 Nginx 代理实现统一部署

## 后果

### 正面

- 开发效率高：Ant Design 组件直接使用，减少 80% 的 UI 开发工作
- 招聘友好：React 是国内前端开发者最熟悉的框架
- 可维护性好：组件化架构，模块间解耦清晰
- 文档丰富：Ant Design 5 文档覆盖所有组件的 API 和示例

### 负面

- Bundle 体积较大：Ant Design 全量引入可能影响首屏加载（可通过按需加载优化）
- React 学习曲线：Hooks 的闭包陷阱、useEffect 依赖管理需要经验
- 版本碎片化：React 18/19、CRA/Vite/Next 等选择较多

## 替代方案

### Vue 3 + Element Plus

- **优势：** 模板语法直观、上手更快；Vue 3 Composition API 接近 React Hooks；Element Plus 组件质量高
- **放弃原因：**
  - Vue 在复杂大型项目中的生态深度不如 React（如缺少 ReactFlow 等同等质量的库）
  - 团队已有 React 经验积累
  - TypeScript 集成虽已改善但历史包袱较多
  - 国际化场景下社区资源略少

### Angular + NG-ZORRO

- **优势：** 全栈框架、内置 DI/路由/表单验证/HTTP 客户端；NG-ZORRO 与 Ant Design 同源
- **放弃原因：**
  - 学习曲线陡峭（RxJS、装饰器、模块系统）
  - 项目启动成本高，boilerplate 较多
  - 国内 Angular 开发者占比较低，招聘难度大
  - 对于快速迭代的验证平台项目，过于"重"

### React + Tailwind CSS（无组件库）

- **优势：** 完全自定义设计、Bundle 更小、设计自由度最高
- **放弃原因：**
  - 所有组件（Table、Form、Modal、DatePicker 等）需从零实现或拼凑
  - 企业级应用需要一致性，组件库提供的约束反而是优势
  - 开发周期会大幅延长
