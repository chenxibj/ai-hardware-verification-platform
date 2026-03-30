#!/bin/bash
# Gitee Issues 批量创建脚本

TOKEN="9f10f78363c6731b06d3b297dd5ecb4c"
REPO="sensecore-product/ai-hardware-verification-platform"
BASE_URL="https://gitee.com/api/v5/repos/$REPO/issues"

# 需求卡片列表
declare -a ISSUES=(
  "01-01 评测任务管理|P0|40 人日|评测系统|18 个功能点：模板化创建、自定义创建、任务调度、监控、终止/重试等"
  "01-02 自主编排系统|P1|30 人日|评测系统|13 个功能点：流程可视化编排、算子/脚本集成、模板管理"
  "01-03 模型性能评测|P0|35 人日|评测系统|12 个功能点：推理性能、训练性能、多场景适配"
  "02-01 评测报告管理|P0|25 人日|评测结果及资产管理|12 个功能点：报告生成、存储、版本控制、分享"
  "03-01 内容发布与管理|P1|20 人日|验证平台社区|12 个功能点：内容发布、审核、检索、展示"
  "04-01 用户注册与认证|P0|20 人日|用户体系|12 个功能点：多类型注册、多层级认证、登录管理"
  "05-01 异构资源接入与适配|P0|35 人日|异构资源纳管|14 个功能点：多类型资源接入、适配、兼容性验证"
)

for issue_data in "${ISSUES[@]}"; do
  IFS='|' read -r title priority effort module desc <<< "$issue_data"
  
  body="**模块**: $module
**优先级**: $priority
**预计工时**: $effort

## 功能概述

$desc

## 详细需求

查看完整需求卡片：https://gitee.com/sensecore-product/ai-hardware-verification-platform/blob/main/requirements/${title}.md

---
*自动创建于 2026-03-30*"

  echo "Creating issue: $title"
  
  response=$(curl -s -X POST "$BASE_URL" \
    -d "access_token=$TOKEN" \
    -d "title=$title" \
    -d "body=$body" \
    -d "labels=$priority")
  
  echo "Response: $response"
  echo "---"
done

echo "Done!"
