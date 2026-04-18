# GPU 节点 Agent 部署指南

## gpu-l40s-01 部署信息

- **GPU 机器:** 180.184.249.205:12345 (SSH)
- **Agent 目录:** `/opt/ahvp-agent/agent/`
- **Python venv:** `/opt/ahvp-agent/venv/`
- **systemd service:** `ahvp-agent.service`
- **环境变量配置:** 在 `/etc/systemd/system/ahvp-agent.service` 中

## 环境变量说明 (#495)

| 环境变量 | 用途 | 示例值 |
|---|---|---|
| `AGENT_NODE_NAME` | 覆盖 config.yaml 的节点名 | `gpu-l40s-01` |
| `AGENT_PORT` | 覆盖 Agent HTTP 端口 | `8090` |
| `AGENT_PLATFORM_URL` | 覆盖平台 API 地址 | `http://39.97.251.94:8080/api` |
| `AGENT_IP_ADDRESS` | 覆盖注册时的 IP（不用自动探测） | `180.184.249.205` |
| `AGENT_NODE_DESCRIPTION` | 覆盖节点描述 | `GPU L40S 8x` |
| `AGENT_NODE_TAGS` | 覆盖节点标签 | `gpu,l40s,8x,ubuntu` |
| `AGENT_PLATFORM_TOKEN` | 覆盖平台认证 token | - |

## 管理命令

```bash
# 查看状态
systemctl status ahvp-agent

# 查看日志
journalctl -u ahvp-agent -f

# 重启
systemctl restart ahvp-agent

# 停止
systemctl stop ahvp-agent
```

## 注意事项

- GPU 机器的内网 IP 是 10.12.11.42，公网 IP 是 180.184.249.205
- 开发机 39.97.251.94 无法通过内网 IP 访问 GPU 机器，所以注册时必须用公网 IP
- 端口 8090 对外不可达（云安全组未开放），任务通过 Agent 的 pull-based 机制获取（#402）
- K8s 相关日志错误可忽略（No module named kubernetes），不影响裸机 Agent 功能
