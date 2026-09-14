#!/usr/bin/env bash
# 从 node_modules/@fontsource 拷出自托管字体子集（unicode-range 分片原样保留），
# 并按项目所用字重裁剪。css 引用 .woff 回退但 woff2 优先生效，故只拷 woff2。
# 用法：scripts/vendor-fonts.sh   （需先 pnpm install；可用 SRC=… 指定其它来源目录）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${SRC:-$ROOT/node_modules/@fontsource}"
OUT="$ROOT/fonts"

[ -d "$SRC" ] || { echo "vendor-fonts: $SRC 不存在，请先运行 pnpm install" >&2; exit 1; }

# vendor <包名> <css 入口…>：拷 css 与对应字重的 woff2 分片
vendor() {
  local pkg="$1" css suffix
  shift
  echo "== $pkg"
  rm -rf "$OUT/$pkg"
  mkdir -p "$OUT/$pkg/files"
  for css in "$@"; do
    cp "$SRC/$pkg/$css" "$OUT/$pkg/$css"
    # 400.css → 「-400-normal」；400-italic.css → 「-400-italic」
    suffix="${css%.css}"
    case "$suffix" in
      *-italic) ;;
      *) suffix="$suffix-normal" ;;
    esac
    # cp -L 解引用 pnpm 的符号链接
    find "$SRC/$pkg/files" -name "*-${suffix}.woff2" -exec cp -L {} "$OUT/$pkg/files/" \;
  done
}

vendor noto-serif-sc    400.css 700.css 900.css
vendor playfair-display 400.css 400-italic.css 700.css
vendor old-standard-tt  400.css
vendor im-fell-english  400.css 400-italic.css

echo "完成：$(find "$OUT" -name '*.woff2' | wc -l | tr -d ' ') 个 woff2，共 $(du -sh "$OUT" | cut -f1)"
