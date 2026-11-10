# -*- coding: utf-8 -*-
"""04-foundation 套图渲染入口（唯一入口，可复现）。

排版函数复用 ../render_arch_sets.py（draw_arch / draw_tree / text_pixel_check / OVERFLOW），
本文件只把 spec_foundation.py 的内容落成两张 PNG，不重写排版。

    python dsh-tasks/docs/arch/04-foundation/render.py

输出：
    architecture.png  三层横切（交互 / 能力 / 地基）+ 外部边界
    hierarchy.png     点击深度 × 数据归属 + 新增模块的五个挂载点
"""
import datetime
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ARCH = os.path.dirname(HERE)
sys.path.insert(0, ARCH)
sys.path.insert(0, HERE)

import render_arch_sets as R                      # noqa: E402  排版函数来源
from spec_foundation import FOUND_ARCH, FOUND_TREE  # noqa: E402

A_PNG = os.path.join(HERE, "architecture.png")
T_PNG = os.path.join(HERE, "hierarchy.png")


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    date = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    for spec in (FOUND_ARCH, FOUND_TREE):
        spec["date"] = date

    s1, b1 = R.draw_arch(FOUND_ARCH, A_PNG)
    s2, b2, stats = R.draw_tree(FOUND_TREE, T_PNG)
    r1 = R.text_pixel_check(A_PNG)
    r2 = R.text_pixel_check(T_PNG)

    leaves = sum(stats[k] for k in ("ok", "part", "none", "plan", "wip", "new"))
    heads = sum(1 for row in FOUND_TREE["rows"] if row[2] == "head")

    print("=" * 74)
    print("04-foundation")
    print("  architecture.png  %dx%d  %.1f KB  文字暗像素 %.1f%%"
          % (s1[0], s1[1], b1 / 1024.0, r1[0] * 100))
    print("  hierarchy.png     %dx%d  %.1f KB  文字暗像素 %.1f%%  条目 %d"
          " (ok %d / new %d / plan %d / none %d / wip %d)  分组标题 %d"
          % (s2[0], s2[1], b2 / 1024.0, r2[0] * 100, leaves,
             stats["ok"], stats["new"], stats["plan"], stats["none"], stats["wip"], heads))
    print("=" * 74)
    print("行宽自检：超宽行 %d 条（0 = 所有正文都在卡片可用宽度内）" % len(R.OVERFLOW))
    for o in R.OVERFLOW[:8]:
        print("  !", o)
    for p in (A_PNG, T_PNG):
        mb = os.path.getsize(p) / 1024.0 / 1024.0
        print("  %s  %.2f MB%s" % (os.path.basename(p), mb, "" if mb < 5 else "  ← 超 5MB"))
    print("OK")


if __name__ == "__main__":
    main()
