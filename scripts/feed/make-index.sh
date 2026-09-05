#!/bin/bash
# ============================================================
# make-index.sh - 生成 opkg 软件源 Packages 索引
# 用法: make-index.sh <含 .ipk 文件的目录>
# 效果: 在该目录下生成 Packages 与 Packages.gz(opkg 可直接识别)
# 兼容: 新版 ar 格式 ipk 与旧版 tar.gz 格式 ipk
# ============================================================
set -euo pipefail

DIR="${1:?用法: make-index.sh <目录>}"
cd "$DIR"

INDEX="Packages"
: > "$INDEX"

# 从单个 ipk 提取 control 元数据
get_control() {
    local ipk="$1"
    # 新版格式:ar 归档,内含 control.tar.gz / control.tar.zst
    if ar t "$ipk" 2>/dev/null | grep -q "debian-binary"; then
        local member
        member=$(ar t "$ipk" | grep "^control\.tar\." | head -1)
        case "$member" in
            control.tar.gz|control.tar.gz2)
                ar p "$ipk" "$member" | tar -xzO ./control 2>/dev/null || ar p "$ipk" "$member" | tar -xzO control
                ;;
            control.tar.zst)
                ar p "$ipk" "$member" | zstd -d | tar -xO ./control 2>/dev/null || ar p "$ipk" "$member" | zstd -d | tar -xO control
                ;;
            control.tar.xz)
                ar p "$ipk" "$member" | xz -d | tar -xO ./control 2>/dev/null || ar p "$ipk" "$member" | xz -d | tar -xO control
                ;;
            *)
                return 1
                ;;
        esac
    else
        # 旧版格式:整体是 tar.gz
        tar -xzOf "$ipk" ./control.tar.gz 2>/dev/null | tar -xzO ./control 2>/dev/null || \
        tar -xzOf "$ipk" control.tar.gz 2>/dev/null | tar -xzO ./control 2>/dev/null || return 1
    fi
}

shopt -s nullglob
ipks=(*.ipk)
shopt -u nullglob

if [ ${#ipks[@]} -eq 0 ]; then
    echo "警告: $DIR 下没有找到 .ipk 文件" >&2
    exit 1
fi

for ipk in "${ipks[@]}"; do
    control=$(get_control "$ipk" || true)
    if [ -z "$control" ]; then
        echo "警告: 无法读取 $ipk 的 control,跳过" >&2
        continue
    fi

    pkg=$(echo "$control"  | awk -F': ' '$1=="Package"{print $2; exit}')
    ver=$(echo "$control"  | awk -F': ' '$1=="Version"{print $2; exit}')
    dep=$(echo "$control"  | awk -F': ' '$1=="Depends"{print $2; exit}')
    arch=$(echo "$control" | awk -F': ' '$1=="Architecture"{print $2; exit}')
    isize=$(echo "$control"| awk -F': ' '$1=="Installed-Size"{print $2; exit}')
    desc=$(echo "$control" | sed -n 's/^Description: //p' | head -1)

    [ -z "$pkg" ] && { echo "警告: $ipk 缺少 Package 字段,跳过" >&2; continue; }

    size=$(stat -c%s "$ipk")
    sha=$(sha256sum "$ipk" | awk '{print $1}')

    {
        echo "Package: $pkg"
        [ -n "$ver" ]  && echo "Version: $ver"
        [ -n "$dep" ]  && echo "Depends: $dep"
        [ -n "$arch" ] && echo "Architecture: $arch"
        [ -n "$isize" ] && echo "Installed-Size: $isize"
        # 多行 Description:首行接在 Description: 后,续行以空格开头
        if [ -n "$desc" ]; then
            echo "Description: $desc"
            echo "$control" | awk -v p="$pkg" '
                $0 ~ /^Description: / {flag=1; next}
                flag && /^[ ]/ {print; next}
                flag {exit}'
        fi
        echo "Filename: $ipk"
        echo "Size: $size"
        echo "SHA256sum: $sha"
        echo ""
    } >> "$INDEX"

    echo "  + $pkg ($ver) [$arch]"
done

gzip -kf "$INDEX"
echo "完成: $DIR/$INDEX ($(grep -c '^Package:' "$INDEX") 个包)"
