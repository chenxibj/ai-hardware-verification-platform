# E2E 测试集设计（关键路径覆盖）

## 设计原则
- 只测 API 功能，不测 UI 布局/交互
- 覆盖核心业务闭环，不求覆盖率求准确率
- 每个测试独立，不依赖执行顺序
- 测试数据自创建自清理

## 测试用例清单

### 1. 认证（4 cases）
| # | 用例 | 验证点 |
|---|------|--------|
| 1.1 | 正确账号密码登录 | 返回 token + 用户信息 |
| 1.2 | 错误密码登录 | 返回 401 |
| 1.3 | 无 token 访问受保护接口 | 返回 401 |
| 1.4 | token 获取当前用户信息 | /auth/me 返回正确 email |

### 2. 芯片 CRUD（6 cases）
| # | 用例 | 验证点 |
|---|------|--------|
| 2.1 | 创建芯片 | 返回 chipNo + id，status=REGISTERED |
| 2.2 | 查询芯片列表 | 返回数组，包含刚创建的芯片 |
| 2.3 | 按 ID 查详情 | 返回完整字段（name/manufacturer/chipType） |
| 2.4 | 更新芯片信息 | PUT 后 GET 验证更新生效 |
| 2.5 | 按名称搜索 | 只返回匹配结果 |
| 2.6 | 删除芯片 | 删除后 GET 返回 404 或空 |

### 3. 评测计划 CRUD + 状态流转（7 cases）
| # | 用例 | 验证点 |
|---|------|--------|
| 3.1 | 创建评测计划 | 返回 id + status=DRAFT |
| 3.2 | 查计划详情 | 包含 chipId/name/preset/totalTasks |
| 3.3 | 更新 DRAFT 计划 | 修改名称后 GET 验证 |
| 3.4 | 启动计划 | PUT /start → status 变为 RUNNING |
| 3.5 | 暂停运行中计划 | PUT /pause → status=PAUSED |
| 3.6 | 取消计划 | PUT /cancel → status=CANCELLED |
| 3.7 | 非法状态流转 | 已取消的计划不能启动（返回错误） |

### 4. 评测任务（5 cases）
| # | 用例 | 验证点 |
|---|------|--------|
| 4.1 | 计划启动后自动拆分子任务 | GET /plans/{id}/tasks 返回非空列表 |
| 4.2 | 任务列表包含正确字段 | taskType/status/chipId 都有值 |
| 4.3 | 任务统计 | GET /tasks/stats 返回各状态计数 |
| 4.4 | 查看任务详情 | GET /tasks/{id} 返回完整数据 |
| 4.5 | 任务日志查询 | GET /tasks/{id}/logs 返回日志数组 |

### 5. 评测报告（5 cases）
| # | 用例 | 验证点 |
|---|------|--------|
| 5.1 | 报告列表 | GET /reports 返回 records 数组 |
| 5.2 | 报告详情 | 包含 overallScore/dimensionScores/radarData |
| 5.3 | 维度评分 key 全英文 | dimensionScores 的 key ∈ {compute,memory,...} |
| 5.4 | 报告包含瓶颈分析 | bottleneckAnalysis 可 JSON.parse |
| 5.5 | 报告包含场景推荐 | scenarioRecommendations 可 JSON.parse |

### 6. 报告对比（3 cases）
| # | 用例 | 验证点 |
|---|------|--------|
| 6.1 | 创建对比 | POST /comparisons 返回对比结果 |
| 6.2 | 对比结果包含维度对比 | dimensionVsPcts 非空 |
| 6.3 | 缺少参数报错 | 不传 baselineReportId 返回错误 |

### 7. 评测模板（4 cases）
| # | 用例 | 验证点 |
|---|------|--------|
| 7.1 | 模板列表 | GET /templates 返回数组 |
| 7.2 | 创建模板 | POST 返回 id + name |
| 7.3 | 模板详情 | GET /templates/{id} 包含 configJson |
| 7.4 | 删除模板 | DELETE 后列表不含该模板 |

### 8. 节点管理（3 cases）
| # | 用例 | 验证点 |
|---|------|--------|
| 8.1 | 节点列表 | GET /nodes 返回节点数组 |
| 8.2 | 节点详情 | GET /nodes/{id} 包含 name/ip/status |
| 8.3 | 节点健康检查 | GET /nodes/{id}/health 可访问 |

### 9. 维度系统（3 cases）
| # | 用例 | 验证点 |
|---|------|--------|
| 9.1 | 维度列表 | GET /dimensions 返回维度数组 |
| 9.2 | 每个维度有完整字段 | key/label/direction/primaryMetric |
| 9.3 | key 全英文标识符 | 无中文 key |

### 10. Dashboard + 健康检查（3 cases）
| # | 用例 | 验证点 |
|---|------|--------|
| 10.1 | Dashboard 统计 | GET /dashboard/stats 返回芯片/计划/任务数 |
| 10.2 | 健康检查 | GET /health 返回 UP + 各组件状态 |
| 10.3 | 版本信息 | GET /version 返回版本号 |

### 11. 数字资产（2 cases）
| # | 用例 | 验证点 |
|---|------|--------|
| 11.1 | 资产列表 | GET /assets 返回列表 |
| 11.2 | 资产搜索 | GET /assets?keyword=xxx 可过滤 |

### 12. 日志系统（3 cases）
| # | 用例 | 验证点 |
|---|------|--------|
| 12.1 | 任务日志查询 | GET /eval-logs?taskId=xxx 返回日志 |
| 12.2 | 日志按级别过滤 | level=ERROR 只返回 ERROR 日志 |
| 12.3 | 日志导出 | GET /tasks/{id}/logs/download 返回文件 |

---

**总计：48 个测试用例**
- 认证: 4
- 芯片 CRUD: 6
- 评测计划: 7
- 评测任务: 5
- 评测报告: 5
- 报告对比: 3
- 评测模板: 4
- 节点管理: 3
- 维度系统: 3
- Dashboard/健康: 3
- 数字资产: 2
- 日志系统: 3

**预计 CI 耗时：< 2 分钟**（全 API 测试，无浏览器）
