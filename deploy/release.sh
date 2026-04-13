#!/bin/bash
# deploy/release.sh — 打版本 tag + 生成 changelog + 创建 GitHub Release
set -euo pipefail

VERSION=${1:?"Usage: ./release.sh v0.3.0"}
PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")

echo "🏷️  Creating release: $VERSION"
echo "   Previous tag: ${PREV_TAG:-'(none)'}"

# 生成 changelog：从上个 tag 到现在的所有 commit，提取 issue 编号
if [ -n "$PREV_TAG" ]; then
  COMMITS=$(git log ${PREV_TAG}..HEAD --oneline)
else
  COMMITS=$(git log --oneline -50)
fi

# 按类型分组
FEATURES=$(echo "$COMMITS" | grep -i "^[a-f0-9]* feat" || true)
FIXES=$(echo "$COMMITS" | grep -i "^[a-f0-9]* fix" || true)
DOCS=$(echo "$COMMITS" | grep -i "^[a-f0-9]* docs\|^[a-f0-9]* doc" || true)
INFRA=$(echo "$COMMITS" | grep -i "^[a-f0-9]* ci\|^[a-f0-9]* chore\|^[a-f0-9]* refactor" || true)

# 提取关联的 issue 编号
ISSUES=$(echo "$COMMITS" | grep -oP '#\d+' | sort -u | tr '\n' ' ')

# 生成 Release Notes
NOTES="## What's Changed

"
[ -n "$FEATURES" ] && NOTES+="### ✨ Features
$(echo "$FEATURES" | sed 's/^/- /')

"
[ -n "$FIXES" ] && NOTES+="### 🐛 Bug Fixes
$(echo "$FIXES" | sed 's/^/- /')

"
[ -n "$DOCS" ] && NOTES+="### 📝 Documentation
$(echo "$DOCS" | sed 's/^/- /')

"
[ -n "$INFRA" ] && NOTES+="### 🔧 Infrastructure
$(echo "$INFRA" | sed 's/^/- /')

"
[ -n "$ISSUES" ] && NOTES+="### 📋 Related Issues
$ISSUES
"

# 打 tag
git tag -a "$VERSION" -m "Release $VERSION"
git push origin "$VERSION"

# 创建 GitHub Release
echo "$NOTES" | gh release create "$VERSION" --title "$VERSION" --notes-file -

echo "✅ Release $VERSION created!"
echo "🔗 https://github.com/chenxibj/ai-hardware-verification-platform/releases/tag/$VERSION"
