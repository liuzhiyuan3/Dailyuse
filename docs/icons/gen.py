#!/usr/bin/env python3
"""Dailyuse 小程序图标候选生成器。

纯标准库，无依赖。输出 1024x1024 的 SVG（满版、无外边距、无投影），
以及一个 index.html 对照页，把每版图标渲染成 144 / 96 / 64 / 40 / 32 / 24 px。

改几何参数后重跑：python3 docs/icons/gen.py
"""

import os

OUT = os.path.dirname(os.path.abspath(__file__))

ACCENT = "#3B5BDB"
TINT = "#EDF1FD"
WHITE = "#FFFFFF"

S = 1024
R = 246


def tile(fill):
    return '<rect width="%d" height="%d" rx="%d" fill="%s"/>' % (S, S, R, fill)


def glyph_ri(stroke, w, h, bar_offset=0.0, color=WHITE):
    """「日」字标记。bar_offset 为负数时中横上移。"""
    x = (S - w) / 2
    y = (S - h) / 2
    rx = min(stroke * 0.5, 72)
    bar_y = S / 2 - stroke / 2 + bar_offset
    return (
        '<rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" rx="%.0f" fill="none" '
        'stroke="%s" stroke-width="%.0f"/>'
        '<rect x="%.0f" y="%.0f" width="%.0f" height="%.0f" fill="%s"/>'
        % (x, y, w, h, rx, color, stroke, x, bar_y, w, stroke, color)
    )


def glyph_grid(cell=372, gap=92, rx=84, dim_last=False, dim_value=0.42):
    start = (S - (cell * 2 + gap)) / 2
    cells = [
        (start, start),
        (start + cell + gap, start),
        (start, start + cell + gap),
        (start + cell + gap, start + cell + gap),
    ]
    out = []
    for i, (cx, cy) in enumerate(cells):
        op = ' opacity="%s"' % dim_value if (dim_last and i == 3) else ""
        out.append(
            '<rect x="%.0f" y="%.0f" width="%d" height="%d" rx="%d" fill="%s"%s/>'
            % (cx, cy, cell, cell, rx, WHITE, op)
        )
    return "".join(out)


def glyph_stack():
    back = '<rect x="290" y="228" width="344" height="344" rx="84" fill="%s"/>' % WHITE
    front = (
        '<rect x="376" y="368" width="344" height="344" rx="84" fill="%s" '
        'stroke="%s" stroke-width="22"/>' % (WHITE, ACCENT)
    )
    return back + front


def glyph_list():
    bars = [(336, 520), (452, 520), (568, 360)]
    return "".join(
        '<rect x="%d" y="%d" width="%d" height="104" rx="52" fill="%s"/>'
        % ((S - w) // 2, y, w, WHITE)
        for y, w in bars
    )


def glyph_ring():
    return (
        '<circle cx="512" cy="512" r="252" fill="none" stroke="%s" stroke-width="112"/>'
        '<circle cx="800" cy="224" r="84" fill="%s"/>' % (WHITE, WHITE)
    )


ICONS = [
    {
        "file": "01-ri-standard",
        "name": "日 · 标准",
        "note": "主推。描边 8.4%，中横居中，24px 仍可辨。",
        "svg": tile(ACCENT) + glyph_ri(86, 440, 610),
        "tone": "推荐",
    },
    {
        "file": "02-ri-heavy",
        "name": "日 · 粗描边",
        "note": "描边 12.3%。小尺寸最抗压，但细节更少，偏「符号」。",
        "svg": tile(ACCENT) + glyph_ri(126, 440, 610),
        "tone": "小尺寸最稳",
    },
    {
        "file": "03-ri-raised",
        "name": "日 · 中横上移",
        "note": "中横上移 72。更像书法的日，下方留白多，重心偏上。",
        "svg": tile(ACCENT) + glyph_ri(86, 440, 610, bar_offset=-72),
        "tone": "更有人味",
    },
    {
        "file": "04-ri-light",
        "name": "日 · 浅底蓝标",
        "note": "浅底 + 主色标记。放在白色聊天列表里更轻，但对比降低。",
        "svg": tile(TINT) + glyph_ri(96, 440, 610, color=ACCENT),
        "tone": "轻量",
        "backdrop": "#E9EDF7",
    },
    {
        "file": "05-grid-dim",
        "name": "四格 · 缺一",
        "note": "呼应首页工具栏。右下角半透明，暗示「还有一个位置」。",
        "svg": tile(ACCENT) + glyph_grid(dim_last=True),
        "tone": "备选",
    },
    {
        "file": "06-grid-solid",
        "name": "四格 · 全实心",
        "note": "同上但四格等重。更稳，也更像通用的「应用」图标。",
        "svg": tile(ACCENT) + glyph_grid(),
        "tone": "最中性",
    },
    {
        "file": "07-stack",
        "name": "叠卡",
        "note": "两张卡片错位堆叠，语义是「很多小事攒在一起」。40px 起开始糊。",
        "svg": tile(ACCENT) + glyph_stack(),
        "tone": "有故事但脆弱",
    },
    {
        "file": "08-list",
        "name": "清单三横",
        "note": "记录 / 待办的直接抽象。诚实但和一堆效率工具撞脸。",
        "svg": tile(ACCENT) + glyph_list(),
        "tone": "安全",
    },
    {
        "file": "09-ring",
        "name": "圆环 + 点",
        "note": "环 = 周期，点 = 未读。最偏「资讯」，多工具的语义传不出来。",
        "svg": tile(ACCENT) + glyph_ring(),
        "tone": "偏资讯",
    },
]


def write_svgs():
    for ic in ICONS:
        path = os.path.join(OUT, ic["file"] + ".svg")
        head = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" '
            'viewBox="0 0 %d %d"><title>Dailyuse - %s</title>' % (S, S, S, S, ic["name"])
        )
        with open(path, "w", encoding="utf-8") as f:
            f.write(head + ic["svg"] + "</svg>\n")


SIZES = [96, 64, 40, 32, 24]


def build_cards():
    cards = []
    for ic in ICONS:
        f = ic["file"]
        bd = ' style="background:%s;border-radius:12px"' % ic["backdrop"] if ic.get("backdrop") else ""
        sizes = "".join(
            '<figure class="sz"><img src="%s.svg" width="%d" height="%d" alt="">'
            "<figcaption>%d</figcaption></figure>" % (f, s, s, s)
            for s in SIZES
        )
        cards.append(
            '<article class="card">'
            '<div class="hero"%s><img src="%s.svg" width="144" height="144" alt=""></div>'
            '<div class="meta"><h3>%s</h3><p class="note">%s</p>'
            '<p class="tone">%s</p></div>'
            '<div class="sizes">%s</div>'
            '<code class="path">%s.svg</code>'
            "</article>" % (bd, f, ic["name"], ic["note"], ic["tone"], sizes, f)
        )
    return "\n      ".join(cards)


def build_ctx():
    rows = []
    for ic in ICONS[:4]:
        rows.append(
            '<div class="row"><img src="%s.svg" width="40" height="40" alt="">'
            '<span class="who">日常使用</span>'
            '<span class="msg">%s</span></div>' % (ic["file"], ic["name"])
        )
    return "\n        ".join(rows)


CSS = """
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 48px 40px 80px;
    background: #F4F6FB; color: #16203A;
    font-family: "PingFang SC", "Hiragino Sans GB", -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  header { max-width: 1180px; margin: 0 auto 36px; }
  h1 { margin: 0 0 10px; font-size: 26px; font-weight: 600; letter-spacing: .5px; }
  .lede { margin: 0; font-size: 14px; line-height: 1.75; color: #5A657F; max-width: 800px; }
  .lede b { color: #3B5BDB; font-weight: 600; }
  .bar { display: flex; gap: 22px; flex-wrap: wrap; margin-top: 18px; font-size: 12px; color: #8A94AB; }
  .bar span { display: inline-flex; align-items: center; gap: 7px; }
  .sw { width: 14px; height: 14px; border-radius: 4px; border: 1px solid rgba(0,0,0,.06); }

  .grid {
    max-width: 1180px; margin: 0 auto;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 20px;
  }
  .card {
    background: #fff; border: 1px solid #E6EAF4; border-radius: 16px;
    padding: 22px 22px 18px; box-shadow: 0 6px 20px rgba(59,91,219,.06);
  }
  .hero { display: flex; justify-content: center; padding: 12px 0 18px; }
  .hero[style] { padding: 20px 0 22px; margin-bottom: -4px; }
  .hero img { border-radius: 34px; box-shadow: 0 8px 22px rgba(59,91,219,.18); }
  h3 { margin: 0 0 6px; font-size: 15px; font-weight: 600; }
  .note { margin: 0; font-size: 12.5px; line-height: 1.65; color: #6B7694; min-height: 42px; }
  .tone {
    display: inline-block; margin: 8px 0 0; padding: 2px 9px; border-radius: 999px;
    background: #EEF2FE; color: #3B5BDB; font-size: 11.5px; letter-spacing: .3px;
  }
  .sizes {
    display: flex; align-items: flex-end; flex-wrap: wrap; gap: 14px; margin-top: 16px;
    padding-top: 16px; border-top: 1px dashed #E6EAF4;
  }
  .sz { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .sz img { border-radius: 22%; }
  .sz figcaption { font-size: 10.5px; color: #A6AEC4; font-variant-numeric: tabular-nums; }
  .path {
    display: block; margin-top: 10px; font-size: 11px; color: #A6AEC4;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .ctx { max-width: 1180px; margin: 44px auto 0; }
  .ctx h2 { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
  .ctx p { margin: 0 0 16px; font-size: 12.5px; color: #8A94AB; }
  .phone { width: 380px; background: #EDEDED; border-radius: 14px; padding: 10px 0; }
  .row { display: flex; align-items: center; gap: 12px; background: #fff; padding: 11px 14px; margin: 0 0 1px; }
  .row img { border-radius: 22%; flex: none; }
  .who { font-size: 15px; color: #111; }
  .msg { margin-left: auto; font-size: 12px; color: #B2B2B2; }
"""


def write_html():
    html = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dailyuse 图标候选 · 9 版</title>
<style>%s</style>
</head>
<body>
<header>
  <h1>Dailyuse 图标候选 · 9 版</h1>
  <p class="lede">
    全部手写矢量，几何按 <b>%d×%d</b> 网格精确对齐：满版方块、圆角 24%%、无外边距、无投影（微信会自己裁圆角）。
    每张卡片下方是 <b>144 / 96 / 64 / 40 / 32 / 24 px</b> 的真实渲染尺寸 —— 只用看得清 40px 那一档的版本。
  </p>
  <div class="bar">
    <span><i class="sw" style="background:#3B5BDB"></i>主色 #3B5BDB</span>
    <span><i class="sw" style="background:#EDF1FD"></i>浅底 #EDF1FD</span>
    <span><i class="sw" style="background:#F4F6FB"></i>页面底 #F4F6FB</span>
    <span>源文件：docs/icons/*.svg</span>
    <span>上传用：docs/icons/square/*.png（直角满版，让微信自己裁圆角）</span>
  </div>
</header>

<main class="grid">
      %s
</main>

<section class="ctx">
  <h2>放进微信会话列表的样子</h2>
  <p>图标实际显示约 40px，这一档才是真正的考场。</p>
  <div class="phone">
        %s
  </div>
</section>
</body>
</html>
""" % (CSS, S, S, build_cards(), build_ctx())

    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)


if __name__ == "__main__":
    write_svgs()
    write_html()
    print("generated %d svg + index.html -> %s" % (len(ICONS), OUT))
