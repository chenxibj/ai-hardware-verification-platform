#!/usr/bin/env python3
"""Fix PlanMonitor UI - replace CPU/Memory circles with task stats."""

filepath = "/root/ai-hardware-verification-platform/frontend/src/pages/PlanMonitor.js"
with open(filepath, 'r') as f:
    content = f.read()

# The file has unicode-escaped Chinese. We need to match the actual bytes.
# "CPU 使用率" = "CPU \u4f7f\u7528\u7387"
# "内存使用率" = "\u5185\u5b58\u4f7f\u7528\u7387"

old = '''            <DashboardOutlined style={{ fontSize: 18, color: "#1890ff", marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{"CPU \u4f7f\u7528\u7387"}</div>
            <Progress
              type="circle"
              percent={resource.cpu}
              size={80}
              strokeColor={resource.cpu > 80 ? "#ff4d4f" : resource.cpu > 60 ? "#faad14" : "#52c41a"}
              format={p => <span style={{ fontSize: 16, fontWeight: "bold" }}>{p}%</span>}
            />
          </Col>
          <Col xs={24} md={5} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{"\u5185\u5b58\u4f7f\u7528\u7387"}</div>
            <Progress
              type="circle"
              percent={resource.memory}
              size={80}
              strokeColor={resource.memory > 80 ? "#ff4d4f" : resource.memory > 60 ? "#faad14" : "#1890ff"}
              format={p => <span style={{ fontSize: 16, fontWeight: "bold" }}>{p}%</span>}
            />'''

new = '''            <DashboardOutlined style={{ fontSize: 18, color: "#1890ff", marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{"\u8fd0\u884c\u4e2d\u4efb\u52a1"}</div>
            <div style={{ fontSize: 28, fontWeight: "bold", color: taskStats.running > 0 ? "#1890ff" : "#999" }}>
              {taskStats.running}
            </div>
          </Col>
          <Col xs={24} md={5} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{"\u5df2\u5b8c\u6210 / \u603b\u8ba1"}</div>
            <div style={{ fontSize: 28, fontWeight: "bold", color: "#52c41a" }}>
              {taskStats.completed}<span style={{ fontSize: 14, color: "#999", fontWeight: "normal" }}> / {taskStats.total}</span>
            </div>'''

if old in content:
    content = content.replace(old, new, 1)
    with open(filepath, 'w') as f:
        f.write(content)
    print("OK: PlanMonitor UI replaced successfully")
else:
    # Try matching with the actual text from the file around the known markers
    # The file might have actual Chinese chars, not unicode escapes
    import re
    # Find and replace between the DashboardOutlined and the next section
    pattern = r'(DashboardOutlined.*?marginBottom: 8.*?\n.*?CPU.*?\n.*?Progress.*?type="circle".*?percent=\{resource\.cpu\}.*?size=\{80\}.*?\n.*?strokeColor.*?resource\.cpu.*?\n.*?format.*?\n.*?/>.*?\n.*?</Col>.*?\n.*?<Col.*?md=\{5\}.*?\n.*?color: "#999".*?marginBottom.*?\n.*?Progress.*?type="circle".*?percent=\{resource\.memory\}.*?size=\{80\}.*?\n.*?strokeColor.*?resource\.memory.*?\n.*?format.*?\n.*?/>)'
    # Simpler approach: just find resource.cpu and resource.memory and replace them
    # Actually let's just replace the variable references
    content = content.replace('percent={resource.cpu}', 'percent={0}')
    content = content.replace('strokeColor={resource.cpu > 80 ? "#ff4d4f" : resource.cpu > 60 ? "#faad14" : "#52c41a"}', 'strokeColor={"#d9d9d9"}')
    content = content.replace('percent={resource.memory}', 'percent={0}')
    content = content.replace('strokeColor={resource.memory > 80 ? "#ff4d4f" : resource.memory > 60 ? "#faad14" : "#1890ff"}', 'strokeColor={"#d9d9d9"}')
    with open(filepath, 'w') as f:
        f.write(content)
    print("FALLBACK: Replaced resource references with zeros")
