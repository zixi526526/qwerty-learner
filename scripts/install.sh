#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
mode="${1:-family}"
case "$mode" in
  family|dev) ;;
  *) echo "用法: bash scripts/install.sh [family|dev]" >&2; exit 1 ;;
esac

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "请先安装 Node.js 20（含 npm），然后重新运行本脚本。" >&2
  exit 1
fi

npm install
if [ "$mode" = dev ]; then
  echo "启动 Vite 开发服务，请打开 http://localhost:5173/（以 Vite 输出为准）"
  npm run dev
else
  npm run build
  echo "启动家庭服务，请在服务就绪后打开 http://localhost:${PORT:-4173}/"
  npm run start
fi
