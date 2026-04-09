#!/bin/bash
# 修复 CRA terser 的 ascii_only=true 导致中文被转为 \uXXXX 乱码
# 每次 npm install 后自动执行（通过 package.json postinstall）
WEBPACK_CONFIG=node_modules/react-scripts/config/webpack.config.js
if [ -f $WEBPACK_CONFIG ]; then
  sed -i 's/ascii_only: true/ascii_only: false/' $WEBPACK_CONFIG
  echo '[patch-terser] Fixed ascii_only: true -> false in webpack config'
fi
