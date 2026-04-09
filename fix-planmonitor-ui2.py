#!/usr/bin/env python3
"""Replace PlanMonitor Progress circles with task stats text."""

filepath = "/root/ai-hardware-verification-platform/frontend/src/pages/PlanMonitor.js"
with open(filepath, 'r') as f:
    content = f.read()

old = '''            <DashboardOutlined style={{ fontSize: 18, color: "#1890ff", marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{"CPU \\u4F7F\\u7528\\u7387"}</div>
            <Progress
              type="circle"
              percent={0}
              size={80}
              strokeColor={"#d9d9d9"}
              format={p => <span style={{ fontSize: 16, fontWeight: "bold" }}>{p}%</span>}
            />
          </Col>
          <Col xs={24} md={5} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{"\\u5185\\u5B58\\u4F7F\\u7528\\u7387"}</div>
            <Progress
              type="circle"
              percent={0}
              size={80}
              strokeColor={"#d9d9d9"}
              format={p => <span style={{ fontSize: 16, fontWeight: "bold" }}>{p}%</span>}
            />'''

new = '''            <DashboardOutlined style={{ fontSize: 18, color: "#1890ff", marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{"\\u8FD0\\u884C\\u4E2D\\u4EFB\\u52A1"}</div>
            <div style={{ fontSize: 28, fontWeight: "bold", color: taskStats.running > 0 ? "#1890ff" : "#999" }}>
              {taskStats.running}
            </div>
          </Col>
          <Col xs={24} md={5} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>{"\\u5DF2\\u5B8C\\u6210 / \\u603B\\u8BA1"}</div>
            <div style={{ fontSize: 28, fontWeight: "bold", color: "#52c41a" }}>
              {taskStats.completed}<span style={{ fontSize: 14, color: "#999", fontWeight: "normal" }}> / {taskStats.total}</span>
            </div>'''

if old in content:
    content = content.replace(old, new, 1)
    with open(filepath, 'w') as f:
        f.write(content)
    print("OK: PlanMonitor UI replaced with task stats")
else:
    print("FAIL: Could not find the expected text")
    # Debug: show what's actually around that area
    idx = content.find('DashboardOutlined')
    if idx >= 0:
        print(f"Found DashboardOutlined at position {idx}")
        print(repr(content[idx:idx+200]))
