# 前端开发规范

## 🚨 中文字符串规则（Terser 双转义 Bug）

**必须遵守：JSX 组件属性中的中文字符串必须使用 JSX 表达式 `{}` 包裹，不能使用引号直接包裹。**

### ❌ 错误写法（会被 terser 双转义成乱码）
```jsx
<Tooltip title="克隆">         // ❌ 会变成 \u514B\u9686
<Tooltip title="\u514B\u9686">  // ❌ 同样会双转义
<Popconfirm title="确定删除?" okText="确定" cancelText="取消">  // ❌ 全会乱码
<Statistic title="任务总数">    // ❌
```

### ✅ 正确写法
```jsx
<Tooltip title={"克隆"}>       // ✅ JSX 表达式
<Popconfirm title={"确定删除?"} okText={"确定"} cancelText={"取消"}>  // ✅
<Statistic title={"任务总数"}>  // ✅
```

### 受影响的属性
- `title`（Tooltip、Popconfirm、Modal.confirm、Statistic、Card...）
- `okText` / `cancelText`（Popconfirm、Modal.confirm）
- `placeholder`
- `content`（Modal.confirm）
- `tip`（Spin）
- 任何 JSX 组件的 string prop 含中文时

### 根因
CRA (Create React App) 使用 terser 压缩 JS。terser 在处理 JSX string prop 时，会对 unicode 字符做一次 escape（`中` → `\u4E2D`），但如果原文本已经包含 `\u` 形式或中文字符，terser 会做双转义（`\u4E2D` → `\\u4E2D`），导致浏览器显示字面量 `\u4E2D` 而不是 `中`。

使用 `{" "}` JSX 表达式后，terser 不会对表达式内的字符串字面量做 unicode escape，问题消失。

### 检查命令
```bash
# 检查是否有遗漏的中文 string prop
grep -rn 'title="[^"]*[\u4e00-\u9fff]' frontend/src/pages/ frontend/src/components/
```

## 其他规范

- `CI=false npm run build` — 避免 CRA 把 warning 当 error
- `nginx Cache-Control: no-cache` — index.html 必须禁缓存
- Build 后的 JS hash 会变，确保 nginx 正确加载新文件
