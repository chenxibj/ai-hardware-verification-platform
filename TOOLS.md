# TOOLS.md - Local Notes

## 本机（轻量应用服务器）

- **实例名:** OpenClaw-oazq
- **实例 ID:** 1254395c0cc449f9814a5a83ca7e11e3
- **Region:** cn-beijing
- **公网 IP:** 47.93.225.177
- **内网 IP:** 172.25.19.141
- **配置:** 2核 2GB / 40GB ESSD / 200Mbps
- **套餐:** swas.s.c2m2s40b1.linux
- **镜像:** OpenClaw 2026.3.3 (Linux)
- **到期:** 2027-03-31
- **创建:** 2026-03-31

## GitHub

- **账号:** chenxibj
- **Token 路径:** ~/.config/gh/token（不存 workspace）
- **Git Credentials:** ~/.git-credentials（已配置）
- **主项目:** chenxibj/ai-hardware-verification-platform

## 验证平台测试账号

- **地址:** http://39.97.251.94/
- **账号:** test@ahvp.com
- **密码:** Test1234（注：DB 密码可能被改过，initAdminUser 用的是 Test1234，admin 是 Admin123456）

## 飞书群（项目群）

- **Chat ID:** oc_736d709f9dc047f5509b8fbd75d9e764
- **用途:** AHVP 项目进度汇报群
- **发送方式:** `message` tool, channel=feishu, target=chat:oc_736d709f9dc047f5509b8fbd75d9e764

## SSH - 开发机

- **Host:** 39.97.251.94 (cn-beijing)
- **User:** root
- **Key:** ~/.ssh/dev-ecs.pem（不存 workspace）
- **配置:** 4C 14GB / 40GB / CentOS Stream 9
- **命令:** `ssh -i ~/.ssh/dev-ecs.pem root@39.97.251.94`
- **实例 ID:** i-2zee4yxsbkb9l5c2tiob
- **⚠️ 到期时间:** 2026-05-01T16:00Z（北京 5/2 00:00）— **已续费恢复（5/12 确认 SSH+服务正常）**

## SSH - GPU 测试机（L40S x8）

- **Host:** 180.184.249.205
- **Port:** 12345
- **User:** root
- **Key:** ~/.ssh/sshkey-chenxi.pem（不存 workspace）
- **密钥名称:** sshkey-chenxi
- **指纹:** SHA256:rNUC1ty2VyvUE2ALcPkVWRNNjk48oR6I+ymHX+xoXE0
- **主机名:** ecs-testchenxi-l40s
- **配置:** 128C / 503GB RAM / 865GB SSD / Ubuntu 24.04.1 LTS
- **GPU:** NVIDIA L40S × 8
- **命令:** `ssh -i ~/.ssh/sshkey-chenxi.pem -p 12345 root@180.184.249.205`

## Docker

- **版本:** Docker 26.1.3 + Compose v2.27.0
- **镜像加速:** 已配置 ACR 专属加速器 (`/etc/docker/daemon.json`)
- **加速地址:** https://850yjfzk.mirror.aliyuncs.com

## Alibaba Cloud (阿里云)

- **CLI:** `aliyun` v3.2.6, 已配置
- **配置路径:** `~/.aliyun/config.json`（凭据存这里，不存 workspace）
- **账号:** 1626926807252723 / RAM 用户 chenxi123
- **默认 Region:** cn-hangzhou（本机在 cn-beijing，按需指定 region）
- **能力:** 可按需创建、变更、查询阿里云产品（ECS/SWAS/OSS/RDS/SLB/DNS/VPC 等）
