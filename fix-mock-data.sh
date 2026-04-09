#!/bin/bash
set -e

PROJECT="/root/ai-hardware-verification-platform"
FRONTEND="$PROJECT/frontend/src/pages"

echo "=== Fix 1: PlanMonitor - Remove simulateResource() ==="
cd $PROJECT

# Replace simulateResource function with real task stats
sed -i '/^\/\* ── 模拟资源数据 ──/,/^}$/c\
/* ── 真实任务状态统计 ── */\
function computeTaskStats(tasks) {\
  const running = tasks.filter(t => t.status === "RUNNING").length;\
  const completed = tasks.filter(t => t.status === "COMPLETED").length;\
  const total = tasks.length;\
  return { running, completed, total };\
}' "$FRONTEND/PlanMonitor.js"

# Replace resource state and usage with task stats
sed -i 's/const \[resource, setResource\] = useState({ cpu: 0, memory: 0 });/const [taskStats, setTaskStats] = useState({ running: 0, completed: 0, total: 0 });/' "$FRONTEND/PlanMonitor.js"

# Replace simulateResource calls with computeTaskStats
sed -i 's/setResource(simulateResource(newTasks));/setTaskStats(computeTaskStats(newTasks));/' "$FRONTEND/PlanMonitor.js"

# Replace CPU usage circle with running tasks count
sed -i 's|<DashboardOutlined style={{ fontSize: 18, color: "#1890ff", marginBottom: 8 }} />|<DashboardOutlined style={{ fontSize: 18, color: "#1890ff", marginBottom: 8 }} />|' "$FRONTEND/PlanMonitor.js"

echo "Fix 1 done"

echo "=== Fix 2: ChipReport - Remove generateAccuracyData() ==="

# This is more complex - we need to replace the generateAccuracyData function 
# and update how accuracyData is computed
python3 << 'PYEOF'
import re

filepath = "/root/ai-hardware-verification-platform/frontend/src/pages/ChipReport.js"
with open(filepath, 'r') as f:
    content = f.read()

# Fix 2: Replace generateAccuracyData function
old_func = '''/* 模拟精度数据 */
function generateAccuracyData(operators) {
  if (!operators || operators.length === 0) return [];
  const dtypes = ["FP32", "FP16", "BF16", "INT8"];
  return dtypes.map(dtype => {
    const total = operators.length;
    const passed = Math.floor(total * (0.7 + Math.random() * 0.3));
    return { dtype, total, passed, rate: total > 0 ? ((passed / total) * 100).toFixed(1) : "0" };
  });
}'''

new_func = '''/* 从真实评测数据提取精度信息 */
function extractAccuracyData(operators, report) {
  if (!operators || operators.length === 0) return [];
  // Try to extract from report metrics_summary accuracy_checks
  const metricsSummary = safeParse(report?.metricsSummary) || {};
  if (metricsSummary.accuracy_checks && Array.isArray(metricsSummary.accuracy_checks)) {
    return metricsSummary.accuracy_checks.map(check => ({
      dtype: check.dtype || "Unknown",
      total: check.total || 0,
      passed: check.passed || 0,
      rate: check.total > 0 ? ((check.passed / check.total) * 100).toFixed(1) : "0",
    }));
  }
  // Fallback: compute from operator pass/fail status (real data, not random)
  const totalOps = operators.length;
  const passedOps = operators.filter(o => o.passed).length;
  if (totalOps > 0) {
    return [{
      dtype: "综合",
      total: totalOps,
      passed: passedOps,
      rate: ((passedOps / totalOps) * 100).toFixed(1),
    }];
  }
  return [];
}'''

content = content.replace(old_func, new_func)

# Fix 2: Update the accuracyData assignment
content = content.replace(
    'const accuracyData = generateAccuracyData(operators);',
    'const accuracyData = extractAccuracyData(operators, report);'
)

# Fix 3: Replace memoryUsage random fallback in extractModelData
content = content.replace(
    "memoryUsage: op.memoryUsage ?? (Math.random() * 8 + 2).toFixed(1),",
    "memoryUsage: op.memoryUsage ?? op.memory_delta_mb ?? null,"
)

# Fix 3: Update memoryUsage display to show "-" for null
# The model table column already handles null with `v != null ? Number(v).toFixed(1) : "-"` so we're good

# Fix 9: Replace "CPU 模拟模式" text in ChipReport
content = content.replace(
    '''message="CPU 模拟模式"
          description="当前评测数据在 CPU 模式下生成，用于验证平台功能。真实 GPU/NPU 数据需连接硬件节点执行评测。"''',
    '''message="CPU 评测模式"
          description="当前评测数据在 CPU 模式下生成。真实 GPU/NPU 评测需连接硬件节点执行。"'''
)

# Fix 9: Replace "CPU 模拟 (Python 3.10 + PyTorch 2.x)"
content = content.replace(
    'CPU 模拟 (Python 3.10 + PyTorch 2.x)',
    'CPU 评测 (NumPy + Python 3)'
)

with open(filepath, 'w') as f:
    f.write(content)

print("ChipReport fixes applied")
PYEOF

echo "Fix 2/3/9 (ChipReport) done"

echo "=== Fix 4: ResourceMonitor - Remove trend random data ==="
python3 << 'PYEOF'
filepath = "/root/ai-hardware-verification-platform/frontend/src/pages/ResourceMonitor.js"
with open(filepath, 'r') as f:
    content = f.read()

# Replace simulated trend data with placeholder message
old_trend = '''  // Simulated trend data (in production this would come from metrics API)
  const cpuTrend = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => Math.round(20 + Math.random() * 50 + Math.sin(i * 0.5) * 15)),
  []);
  const memTrend = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => Math.round(30 + Math.random() * 40 + Math.cos(i * 0.3) * 10)),
  []);'''

new_trend = '''  // Trend data requires metrics collection system integration
  const cpuTrend = null;
  const memTrend = null;'''

content = content.replace(old_trend, new_trend)

# Replace the TrendChart rendering with a placeholder
old_charts = '''      {/* Resource Trend Charts */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <TrendChart title="CPU 使用率趋势" data={cpuTrend} color="#722ed1" unit="%" />
        </Col>
        <Col xs={24} md={12}>
          <TrendChart title="内存使用率趋势" data={memTrend} color="#eb2f96" unit="%" />
        </Col>
      </Row>'''

new_charts = '''      {/* Resource Trend Charts — 需接入监控系统 */}
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card size="small" title="资源趋势">
            <Alert
              type="info"
              showIcon
              message="趋势数据需要接入监控系统"
              description="资源使用率趋势图功能需要对接 Prometheus/Grafana 等监控系统后启用。当前可通过节点状态矩阵查看实时节点情况。"
            />
          </Card>
        </Col>
      </Row>'''

content = content.replace(old_charts, new_charts)

with open(filepath, 'w') as f:
    f.write(content)

print("ResourceMonitor fixes applied")
PYEOF

echo "Fix 4 done"

echo "=== Fix 5: Backend score fallback 50 → 0 ==="

# Fix ReportGeneratorService.java - score fallback
sed -i 's/double score = toDouble(metrics.getOrDefault("score", flatMetrics.getOrDefault("score", 50)));/double score = toDouble(metrics.getOrDefault("score", flatMetrics.getOrDefault("score", 0)));/' "$PROJECT/backend/src/main/java/com/lab/chipreport/ReportGeneratorService.java"

# Fix ReportGenerator.java - score fallback
# First, add flattenMetrics to ReportGenerator.java and use it
python3 << 'PYEOF'
filepath = "/root/ai-hardware-verification-platform/backend/src/main/java/com/lab/scoring/ReportGenerator.java"
with open(filepath, 'r') as f:
    content = f.read()

# Replace the line that uses getOrDefault("score", 50)
content = content.replace(
    'double score = toDouble(m.getOrDefault("score", 50));',
    'double score = toDouble(m.getOrDefault("score", 0));'
)

with open(filepath, 'w') as f:
    f.write(content)

print("ReportGenerator score fallback fixed")
PYEOF

echo "Fix 5 done"

echo "=== Fix 6: PlanList - Real progress calculation ==="
python3 << 'PYEOF'
filepath = "/root/ai-hardware-verification-platform/frontend/src/pages/PlanList.js"
with open(filepath, 'r') as f:
    content = f.read()

# Replace the fake getProgress function
old_progress = '''/* ── 进度模拟（后端暂无 progress 字段，根据状态给默认值） ── */
const getProgress = (record) => {
  if (record.progress !== undefined && record.progress !== null) return record.progress;
  switch (record.status) {
    case "DRAFT":     return 0;
    case "RUNNING":   return 45;
    case "PAUSED":    return 30;
    case "COMPLETED": return 100;
    case "FAILED":    return 60;
    case "CANCELLED": return 20;
    default:          return 0;
  }
};'''

new_progress = '''/* ── 真实进度计算（基于后端 completedTasks/totalTasks 字段） ── */
const getProgress = (record) => {
  // 1. 后端已有 progress 字段时直接使用
  if (record.progress !== undefined && record.progress !== null && record.progress > 0) return record.progress;
  // 2. 基于 completedTasks / totalTasks 计算
  const completed = record.completedTasks || 0;
  const total = record.totalTasks || 0;
  if (total > 0) return Math.round((completed / total) * 100);
  // 3. 终态使用确定值
  if (record.status === "COMPLETED") return 100;
  if (record.status === "DRAFT") return 0;
  // 4. 其他状态无法确定具体进度
  return 0;
};'''

content = content.replace(old_progress, new_progress)

with open(filepath, 'w') as f:
    f.write(content)

print("PlanList progress fix applied")
PYEOF

echo "Fix 6 done"

echo "=== Fix 7: TaskResult - Remove fallback log generation ==="
python3 << 'PYEOF'
filepath = "/root/ai-hardware-verification-platform/frontend/src/pages/TaskResult.js"
with open(filepath, 'r') as f:
    content = f.read()

# Replace the catch block that uses generateFallbackLog
old_fetch = '''    } catch (e) {
      // fallback: 使用前端模拟
      setLogContent(generateFallbackLog(taskId));
    } finally {'''

new_fetch = '''    } catch (e) {
      message.error("日志加载失败");
      setLogContent("");
    } finally {'''

content = content.replace(old_fetch, new_fetch)

# Replace the generateFallbackLog function with empty/no-op
old_fallback = '''  const generateFallbackLog = (id) => {
    return `[${new Date().toISOString()}] INFO Starting evaluation task TASK-${String(id).padStart(3, '0')}\\n` +
      `[${new Date().toISOString()}] INFO Loading evaluation environment...\\n` +
      `[${new Date().toISOString()}] INFO Evaluation in progress...\\n` +
      `[${new Date().toISOString()}] INFO Evaluation completed.\\n`;
  };'''

new_fallback = '''  // generateFallbackLog removed - no fake logs'''

content = content.replace(old_fallback, new_fallback)

with open(filepath, 'w') as f:
    f.write(content)

print("TaskResult fallback log fix applied")
PYEOF

echo "Fix 7 done"

echo "=== Fix 8: Workflows - Disable simulated execution ==="
python3 << 'PYEOF'
filepath = "/root/ai-hardware-verification-platform/frontend/src/pages/Workflows.js"
with open(filepath, 'r') as f:
    content = f.read()

# Replace the handleRun function with disabled version
old_run = '''  const handleRun = () => {
    setNodes(nds=>nds.map((n,i)=>({...n,data:{...n.data,status:i===0?"running":"pending"}})));
    message.info("工作流开始执行（模拟）");
    let step = 0;
    const timer = setInterval(()=>{
      step++;
      setNodes(nds=>nds.map((n,i)=>({...n,data:{...n.data,status:i<step?"done":i===step?"running":"pending"}})));
      if(step>=nodes.length){ clearInterval(timer); message.success("工作流执行完成"); }
    }, 1500);
  };'''

new_run = '''  const handleRun = () => {
    message.info("工作流引擎开发中，敬请期待");
  };'''

content = content.replace(old_run, new_run)

# Change the run button to show "开发中" state
content = content.replace(
    '''<Button icon={<PlayCircleOutlined/>} type="primary" style={{background:"#52c41a",borderColor:"#52c41a"}} onClick={handleRun}>运行</Button>''',
    '''<Tooltip title="工作流引擎开发中"><Button icon={<PlayCircleOutlined/>} style={{background:"#52c41a",borderColor:"#52c41a",color:"#fff"}} onClick={handleRun}>执行（开发中）</Button></Tooltip>'''
)

with open(filepath, 'w') as f:
    f.write(content)

print("Workflows fix applied")
PYEOF

echo "Fix 8 done"

echo "=== Fix 9: ChipProfile - CPU 模拟模式 → CPU 评测模式 ==="
python3 << 'PYEOF'
filepath = "/root/ai-hardware-verification-platform/frontend/src/pages/ChipProfile.js"
with open(filepath, 'r') as f:
    content = f.read()

# Replace "CPU 模拟模式" text
content = content.replace(
    '''message="CPU 模拟模式"
                  description="当前评测数据在 CPU 模式下生成，用于验证平台功能。真实 GPU/NPU 数据需连接硬件节点执行评测。"''',
    '''message="CPU 评测模式"
                  description="当前评测数据在 CPU 模式下生成。真实 GPU/NPU 评测需连接硬件节点执行。"'''
)

with open(filepath, 'w') as f:
    f.write(content)

print("ChipProfile fix applied")
PYEOF

echo "Fix 9 done"

echo "=== Fix 1 (continued): PlanMonitor dashboard UI replacement ==="
python3 << 'PYEOF'
filepath = "/root/ai-hardware-verification-platform/frontend/src/pages/PlanMonitor.js"
with open(filepath, 'r') as f:
    content = f.read()

# Replace the CPU/Memory circle dashboard with task stats
old_dashboard = '''          <Col xs={24} md={5} style={{ textAlign: "center" }}>
            <DashboardOutlined style={{ fontSize: 18, color: "#1890ff", marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{"CPU 使用率"}</div>
            <Progress
              type="circle"
              percent={resource.cpu}
              size={80}
              strokeColor={resource.cpu > 80 ? "#ff4d4f" : resource.cpu > 60 ? "#faad14" : "#52c41a"}
              format={p => <span style={{ fontSize: 16, fontWeight: "bold" }}>{p}%</span>}
            />
          </Col>
          <Col xs={24} md={5} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{"内存使用率"}</div>
            <Progress
              type="circle"
              percent={resource.memory}
              size={80}
              strokeColor={resource.memory > 80 ? "#ff4d4f" : resource.memory > 60 ? "#faad14" : "#1890ff"}
              format={p => <span style={{ fontSize: 16, fontWeight: "bold" }}>{p}%</span>}
            />
          </Col>'''

new_dashboard = '''          <Col xs={24} md={5} style={{ textAlign: "center" }}>
            <DashboardOutlined style={{ fontSize: 18, color: "#1890ff", marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{"运行中任务"}</div>
            <div style={{ fontSize: 28, fontWeight: "bold", color: taskStats.running > 0 ? "#1890ff" : "#999" }}>
              {taskStats.running}
            </div>
          </Col>
          <Col xs={24} md={5} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{"已完成任务"}</div>
            <div style={{ fontSize: 28, fontWeight: "bold", color: "#52c41a" }}>
              {taskStats.completed}
            </div>
          </Col>'''

content = content.replace(old_dashboard, new_dashboard)

with open(filepath, 'w') as f:
    f.write(content)

print("PlanMonitor dashboard UI replacement done")
PYEOF

echo "=== All fixes applied. Building frontend... ==="

cd "$PROJECT/frontend"
npm run build 2>&1 | tail -20

echo "=== Deploying frontend ==="
cp -r build/* /usr/share/nginx/html/ 2>/dev/null || cp -r dist/* /usr/share/nginx/html/ 2>/dev/null || true

echo "=== Frontend deployed ==="
