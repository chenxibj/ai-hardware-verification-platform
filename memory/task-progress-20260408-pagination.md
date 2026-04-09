# 日志分页 + 行号功能 — 完成

**时间:** 2026-04-08 18:35
**状态:** ✅ 已完成并部署

## 修改内容

### 1. 后端 (Backend)

**TaskLogRepository.java:**
- 新增 `findByPlanIdFilteredCursor()` — Plan级日志游标分页，支持 `before` 参数
- 新增 `findByTaskIdPageable()` — Task级日志标准分页 (Page + size 模式)
- 新增 `countByTaskIdFiltered()` — 带过滤条件的计数查询

**TaskLogController.java:**
- 新增 `GET /tasks/{taskId}/logs/page` — 标准分页接口
  - 参数: `page` (0-indexed), `size` (默认50), `level`, `type`, `keyword`
  - 返回: `{ code, data: { items, total, page, size, totalPages, hasMore } }`

**GlobalLogController.java:**
- `GET /plans/{planId}/logs` 新增 `before` 参数支持，修复"加载更早日志"功能

### 2. 前端 (Frontend)

**TaskExecutionLogs.js — 完全重写:**
- ✅ 分页: antd Pagination 组件，每页50条
- ✅ 行号: VS Code 风格，灰色小字体，右对齐，固定宽度 gutter
- ✅ 过滤: 级别 (ALL/INFO/WARN/ERROR/DEBUG) + 类型 (ALL/TEXT/SYSTEM/EVAL/METRIC/PROGRESS) + 关键字搜索
- ✅ 实时刷新: 运行中任务自动轮询，自动跳转最新页
- ✅ 保持终端风格 (暗色背景 + 等宽字体)
- ✅ 调用新接口 `GET /tasks/{taskId}/logs/page`

**PlanMonitor.js:**
- ✅ 行号: 每行日志前增加行号，40px 宽度，右对齐，灰色
- ✅ 日志计数显示 "过滤后/全部"

**Logs.js (全局日志):**
- ✅ 行号: 考虑分页偏移 (page * PAGE_SIZE + i + 1)
- ✅ 无限滚动分页保持不变，行号正确递增

## 部署验证
- ✅ 后端 API `GET /tasks/3585/logs/page?page=0&size=3` 返回正确分页数据
- ✅ 前端 build 成功，已部署到 ahvp-frontend 容器
- ✅ Git 已提交并 push
- ✅ Docker 后端已重启

## 文件清单
```
backend/src/main/java/com/lab/task/TaskLogRepository.java    (新增3个查询方法)
backend/src/main/java/com/lab/task/TaskLogController.java     (新增 /logs/page 端点)
backend/src/main/java/com/lab/task/GlobalLogController.java   (before 参数支持)
frontend/src/components/tasks/TaskExecutionLogs.js            (完全重写)
frontend/src/pages/PlanMonitor.js                             (行号)
frontend/src/pages/Logs.js                                    (行号)
```
