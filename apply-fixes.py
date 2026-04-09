#!/usr/bin/env python3
"""Apply all mock data fixes to frontend and backend files."""
import sys

def fix_file(filepath, replacements):
    """Apply a list of (old, new) replacements to a file."""
    with open(filepath, 'r') as f:
        content = f.read()
    
    for old, new, desc in replacements:
        if old not in content:
            print(f"  WARNING: Could not find text for [{desc}] in {filepath}")
            print(f"  Searching for: {old[:80]}...")
            continue
        content = content.replace(old, new, 1)
        print(f"  ✓ {desc}")
    
    with open(filepath, 'w') as f:
        f.write(content)
    print(f"  Saved {filepath}")

BASE = "/root/ai-hardware-verification-platform"

# === Fix 1: PlanMonitor.js ===
print("\n=== Fix 1: PlanMonitor - Remove fake CPU/memory data ===")
fix_file(f"{BASE}/frontend/src/pages/PlanMonitor.js", [
    (
        '/* ── 模拟资源数据 ── */\nfunction simulateResource(tasks) {\n  const running = tasks.filter(t => t.status === "RUNNING").length;\n  return {\n    cpu: Math.min(95, 15 + running * 18 + Math.floor(Math.random() * 8)),\n    memory: Math.min(90, 30 + running * 12 + Math.floor(Math.random() * 6)),\n  };\n}',
        '/* ── 任务统计 ── */\nfunction computeTaskStats(tasks) {\n  const running = tasks.filter(t => t.status === "RUNNING").length;\n  const completed = tasks.filter(t => t.status === "COMPLETED").length;\n  const failed = tasks.filter(t => t.status === "FAILED").length;\n  const total = tasks.length;\n  return { running, completed, failed, total };\n}',
        'Replace simulateResource with computeTaskStats'
    ),
    (
        'const [resource, setResource] = useState({ cpu: 0, memory: 0 });',
        'const [taskStats, setTaskStats] = useState({ running: 0, completed: 0, failed: 0, total: 0 });',
        'Replace resource state with taskStats'
    ),
    (
        'setResource(simulateResource(newTasks));',
        'setTaskStats(computeTaskStats(newTasks));',
        'Replace setResource call'
    ),
    (
        '''            <DashboardOutlined style={{ fontSize: 18, color: "#1890ff", marginBottom: 8 }} />
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
            />''',
        '''            <DashboardOutlined style={{ fontSize: 18, color: "#1890ff", marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{"运行中任务"}</div>
            <div style={{ fontSize: 28, fontWeight: "bold", color: taskStats.running > 0 ? "#1890ff" : "#999" }}>
              {taskStats.running}
            </div>
          </Col>
          <Col xs={24} md={5} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{"已完成 / 总计"}</div>
            <div style={{ fontSize: 28, fontWeight: "bold", color: "#52c41a" }}>
              {taskStats.completed}<span style={{ fontSize: 14, color: "#999", fontWeight: "normal" }}> / {taskStats.total}</span>
            </div>''',
        'Replace CPU/Memory circles with task stats display'
    ),
])

# === Fix 2 & 3: ChipReport.js ===
print("\n=== Fix 2/3/9: ChipReport - Accuracy data, memory fallback, CPU text ===")
fix_file(f"{BASE}/frontend/src/pages/ChipReport.js", [
    (
        '''/* 模拟精度数据 */
function generateAccuracyData(operators) {
  if (!operators || operators.length === 0) return [];
  const dtypes = ["FP32", "FP16", "BF16", "INT8"];
  return dtypes.map(dtype => {
    const total = operators.length;
    const passed = Math.floor(total * (0.7 + Math.random() * 0.3));
    return { dtype, total, passed, rate: total > 0 ? ((passed / total) * 100).toFixed(1) : "0" };
  });
}''',
        '''/* 从真实评测数据提取精度信息（不使用随机数） */
function extractAccuracyData(operators, report) {
  if (!operators || operators.length === 0) return [];
  // 1. 尝试从 report 的 metrics_summary 提取 accuracy_checks
  const metricsSummary = safeParse(report?.metricsSummary);
  if (metricsSummary?.accuracy_checks && Array.isArray(metricsSummary.accuracy_checks)) {
    return metricsSummary.accuracy_checks.map(check => ({
      dtype: check.dtype || "Unknown",
      total: check.total || 0,
      passed: check.passed || 0,
      rate: check.total > 0 ? ((check.passed / check.total) * 100).toFixed(1) : "0",
    }));
  }
  // 2. 从算子 pass/fail 状态汇总（真实数据）
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
}''',
        'Replace generateAccuracyData with extractAccuracyData'
    ),
    (
        'const accuracyData = generateAccuracyData(operators);',
        'const accuracyData = extractAccuracyData(operators, report);',
        'Update accuracyData call'
    ),
    (
        'memoryUsage: op.memoryUsage ?? (Math.random() * 8 + 2).toFixed(1),',
        'memoryUsage: op.memoryUsage ?? op.memory_delta_mb ?? null,',
        'Fix memory fallback random'
    ),
    (
        '''message="CPU 模拟模式"
          description="当前评测数据在 CPU 模式下生成，用于验证平台功能。真实 GPU/NPU 数据需连接硬件节点执行评测。"''',
        '''message="CPU 评测模式"
          description="当前评测数据在 CPU 模式下生成。真实 GPU/NPU 评测需连接硬件节点执行。"''',
        'Fix CPU 模拟模式 → CPU 评测模式'
    ),
    (
        'CPU 模拟 (Python 3.10 + PyTorch 2.x)',
        'CPU 评测 (NumPy + Python 3)',
        'Fix CPU 模拟 text'
    ),
])

# === Fix 4: ResourceMonitor.js ===
print("\n=== Fix 4: ResourceMonitor - Remove trend random data ===")
fix_file(f"{BASE}/frontend/src/pages/ResourceMonitor.js", [
    (
        '''  // Simulated trend data (in production this would come from metrics API)
  const cpuTrend = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => Math.round(20 + Math.random() * 50 + Math.sin(i * 0.5) * 15)),
  []);
  const memTrend = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => Math.round(30 + Math.random() * 40 + Math.cos(i * 0.3) * 10)),
  []);''',
        '''  // 趋势数据需要接入监控系统
  const cpuTrend = null;
  const memTrend = null;''',
        'Remove random trend data'
    ),
    (
        '''      {/* Resource Trend Charts */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <TrendChart title="CPU 使用率趋势" data={cpuTrend} color="#722ed1" unit="%" />
        </Col>
        <Col xs={24} md={12}>
          <TrendChart title="内存使用率趋势" data={memTrend} color="#eb2f96" unit="%" />
        </Col>
      </Row>''',
        '''      {/* Resource Trend Charts — 需接入监控系统 */}
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card size="small" title="资源趋势">
            <Alert
              type="info"
              showIcon
              message="趋势数据需要接入监控系统"
              description="资源使用率趋势图需对接 Prometheus 等监控系统后启用。当前可通过节点状态矩阵查看实时节点情况。"
            />
          </Card>
        </Col>
      </Row>''',
        'Replace trend charts with info alert'
    ),
])

# === Fix 5: Backend score fallback ===
print("\n=== Fix 5a: ReportGeneratorService - score fallback 50 → 0 ===")
fix_file(f"{BASE}/backend/src/main/java/com/lab/chipreport/ReportGeneratorService.java", [
    (
        'double score = toDouble(metrics.getOrDefault("score", flatMetrics.getOrDefault("score", 50)));',
        'double score = toDouble(metrics.getOrDefault("score", flatMetrics.getOrDefault("score", 0)));',
        'Score fallback 50 → 0'
    ),
])

print("\n=== Fix 5b: ReportGenerator - score fallback 50 → 0 ===")
fix_file(f"{BASE}/backend/src/main/java/com/lab/scoring/ReportGenerator.java", [
    (
        'double score = toDouble(m.getOrDefault("score", 50));',
        'double score = toDouble(m.getOrDefault("score", 0));',
        'Score fallback 50 → 0'
    ),
])

# === Fix 6: PlanList.js ===
print("\n=== Fix 6: PlanList - Real progress calculation ===")
fix_file(f"{BASE}/frontend/src/pages/PlanList.js", [
    (
        '''/* ── 进度模拟（后端暂无 progress 字段，根据状态给默认值） ── */
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
};''',
        '''/* ── 真实进度（基于后端 progress/completedTasks/totalTasks 字段） ── */
const getProgress = (record) => {
  // 后端已返回 progress 字段
  if (record.progress != null && record.progress > 0) return record.progress;
  // 基于 completedTasks / totalTasks 计算
  const completed = record.completedTasks || 0;
  const total = record.totalTasks || 0;
  if (total > 0) return Math.round((completed / total) * 100);
  // 终态
  if (record.status === "COMPLETED") return 100;
  if (record.status === "DRAFT") return 0;
  return 0;
};''',
        'Real progress calculation'
    ),
])

# === Fix 7: TaskResult.js ===
print("\n=== Fix 7: TaskResult - Remove fallback log ===")
fix_file(f"{BASE}/frontend/src/pages/TaskResult.js", [
    (
        '''    } catch (e) {
      // fallback: 使用前端模拟
      setLogContent(generateFallbackLog(taskId));
    } finally {''',
        '''    } catch (e) {
      message.error("日志加载失败");
      setLogContent("");
    } finally {''',
        'Remove fallback log on error'
    ),
    (
        '''  const generateFallbackLog = (id) => {
    return `[${new Date().toISOString()}] INFO Starting evaluation task TASK-${String(id).padStart(3, '0')}\\n` +
      `[${new Date().toISOString()}] INFO Loading evaluation environment...\\n` +
      `[${new Date().toISOString()}] INFO Evaluation in progress...\\n` +
      `[${new Date().toISOString()}] INFO Evaluation completed.\\n`;
  };''',
        '  // generateFallbackLog removed — 不再生成假日志',
        'Remove generateFallbackLog function'
    ),
])

# === Fix 8: Workflows.js ===
print("\n=== Fix 8: Workflows - Disable simulated execution ===")
fix_file(f"{BASE}/frontend/src/pages/Workflows.js", [
    (
        '''  const handleRun = () => {
    setNodes(nds=>nds.map((n,i)=>({...n,data:{...n.data,status:i===0?"running":"pending"}})));
    message.info("工作流开始执行（模拟）");
    let step = 0;
    const timer = setInterval(()=>{
      step++;
      setNodes(nds=>nds.map((n,i)=>({...n,data:{...n.data,status:i<step?"done":i===step?"running":"pending"}})));
      if(step>=nodes.length){ clearInterval(timer); message.success("工作流执行完成"); }
    }, 1500);
  };''',
        '''  const handleRun = () => {
    message.info("工作流引擎开发中，敬请期待");
  };''',
        'Replace simulated run with info message'
    ),
    (
        '<Button icon={<PlayCircleOutlined/>} type="primary" style={{background:"#52c41a",borderColor:"#52c41a"}} onClick={handleRun}>运行</Button>',
        '<Tooltip title="工作流引擎开发中"><Button icon={<PlayCircleOutlined/>} style={{background:"#52c41a",borderColor:"#52c41a",color:"#fff"}} onClick={handleRun}>执行（开发中）</Button></Tooltip>',
        'Change run button text to 开发中'
    ),
])

# === Fix 9: ChipProfile.js ===
print("\n=== Fix 9: ChipProfile - CPU 模拟模式 → CPU 评测模式 ===")
fix_file(f"{BASE}/frontend/src/pages/ChipProfile.js", [
    (
        '''message="CPU 模拟模式"
                  description="当前评测数据在 CPU 模式下生成，用于验证平台功能。真实 GPU/NPU 数据需连接硬件节点执行评测。"''',
        '''message="CPU 评测模式"
                  description="当前评测数据在 CPU 模式下生成。真实 GPU/NPU 评测需连接硬件节点执行。"''',
        'Fix CPU 模拟模式 → CPU 评测模式'
    ),
])

print("\n=== All code fixes applied! ===")
