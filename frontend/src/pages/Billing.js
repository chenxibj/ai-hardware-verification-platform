import React from "react";
import { Card, Result } from "antd";
import { DollarOutlined } from "@ant-design/icons";
export default function Billing() {
  return (<Card><Result icon={<DollarOutlined />} title="计费管理" subTitle="计费功能即将上线，敬请期待" /></Card>);
}
