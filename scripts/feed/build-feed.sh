#!/bin/bash
# ============================================================
# build-feed.sh - 把 OpenWrt 编译产物整理成 opkg 软件源发布结构
# 用法: build-feed.sh <openwrt源码目录> <输出目录> <架构,如 x86_64>
# 结构: 输出目录/<架构>/<feed名>/  (*.{ipk} + Packages + Packages.gz)
# ============================================================
set -euo pipefail

SRC="${1:?用法: build-feed.sh <openwrt目录> <输出目录> <架构>}"
OUT="${2:?用法: build-feed.sh <openwrt目录> <输出目录> <架构>}"
ARCH="${3:?用法: build-feed.sh <openwrt目录> <输出目录> <架构>}"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

PKG_BASE="$SRC/bin/packages/$ARCH"
TARGET_DIR=$(ls -d "$SRC/bin/targets"/*/ 2>/dev/null | head -1 || true)

if [ ! -d "$PKG_BASE" ]; then
    echo "错误: 未找到 $PKG_BASE,确认架构名是否正确" >&2
    exit 1
fi

FEEDS=(base luci packages routing telephony)
TOTAL=0

for feed in "${FEEDS[@]}"; do
    src_dir="$PKG_BASE/$feed"
    [ -d "$src_dir" ] || continue

    dst_dir="$OUT/$ARCH/$feed"
    mkdir -p "$dst_dir"

    # 只复制 ipk(源码目录里的 Packages 索引重新生成,保证与文件名路径一致)
    found=0
    for ipk in "$src_dir"/*.ipk; do
        [ -e "$ipk" ] || continue
        cp -f "$ipk" "$dst_dir/"
        found=$((found+1))
    done

    if [ "$found" -eq 0 ]; then
        echo "  - $feed: 无 ipk,跳过"
        rmdir "$dst_dir" 2>/dev/null || true
        continue
    fi

    echo "==> 生成 $feed 索引 ($found 个包)"
    bash "$SCRIPT_DIR/make-index.sh" "$dst_dir"
    TOTAL=$((TOTAL+found))
done

echo "==========================================="
echo "软件源构建完成: $TOTAL 个包"
echo "目录: $OUT/$ARCH/"
find "$OUT" -name "Packages.gz" | while read -r f; do
    echo "  源地址: \$(目录)/${f#$OUT/}"
done
