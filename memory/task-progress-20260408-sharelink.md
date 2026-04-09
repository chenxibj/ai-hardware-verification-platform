# Task: 修复报告分享链接不可用

## 状态: ✅ 已完成

## 问题
ChipReport.js 分享功能生成 `http://39.97.251.94/?report=10`，但 App.js 不解析 URL query parameter，打开分享链接只看到首页。

## 修复内容
- **文件:** `frontend/src/App.js`
- **改动:** 新增 useEffect，在 `isAuthenticated` 变为 true 后解析 URL query params
  - `?report=X` → 跳转到 chip-report 页面
  - `?plan=X` → 跳转到 plan-monitor 页面
  - `?chip=X` → 跳转到 chip-profile 页面
  - 跳转后用 `window.history.replaceState` 清除 URL 参数，避免刷新重复跳转

## 部署
- ✅ `npm run build` 成功
- ✅ `docker cp build/. ahvp-frontend:/usr/share/nginx/html/` 已部署
- ✅ `http://39.97.251.94/?report=10` 返回 200

## Git
- ✅ Commit: `7c96014f` - feat(#171): parse URL query params for share links
- ✅ Pushed to GitHub

## 时间
- 开始: 2026-04-08 18:17
- 完成: 2026-04-08 18:23
