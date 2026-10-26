# -*- coding: utf-8 -*-
"""Extract ALL docx files (essay + recording) into one books.json (text only)."""
import os, re, json
from docx import Document
from docx.oxml.ns import qn

BASE = r"C:\Users\13766\Desktop\vibecoding\shelf"
ESSAY_DIR = os.path.join(BASE, "essay")
REC_DIR = os.path.join(BASE, "recording")
OUT = os.path.join(BASE, "scripts", "books.json")

DATE_RE = re.compile(r'^(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日|\d{1,2}\s*月\s*\d{1,2}\s*日)')
COVER_RE = re.compile(r'(序\s*号|评\s*分|SHANGHAI|通\s*识|COURSE|学\s*院|专\s*业|学\s*号|姓\s*名|___|＿)')
ABS_RE = re.compile(r'(摘\s*要|全文摘\s*要)')
SECTION_WORDS = {'关键词', '全文摘要', '全文概要', '章节速览', '内容摘要', '摘 要', '摘要', '专家导读'}

# course key -> display / color / order
COURSES = {
    "人工智能": ("人工智能", "#2f5d8a", 10),
    "动漫社会文化史": ("动漫社会文化史", "#8a3b5c", 20),
    "大众考古": ("大众考古", "#9c6b3c", 30),
    "工程体验与感知（增材制造技术原理与应用）": ("工程体验与感知", "#3f6f4f", 40),
    "广告与社会": ("广告与社会", "#a04a3a", 50),
    "当代博物馆美术馆基础理论与方法": ("当代博物馆美术馆", "#5a4a7a", 60),
    "纪录片：用真实绘制世界": ("纪录片", "#4a6a72", 70),
    "贾鉴": ("贾鉴", "#7a6a3a", 80),
}

ESSAYS = {
    "1400R006性别冲突与广告24123966崔秋恺": {
        "title": "性别冲突与广告", "course": "1400R006 性别冲突与广告",
        "color": "#7a3a3a", "order": 1,
    },
    "《社会学思维》69号课程论文崔秋恺24123966": {
        "title": "社会学思维 课程论文", "course": "社会学思维",
        "color": "#3f4a7a", "order": 2,
    },
}

CN_DIGIT = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10}

def cn_to_int(s):
    n = 0
    for ch in s:
        n = n * 10 + CN_DIGIT.get(ch, 0)
    return n

def style_kind(style_name, text):
    s = (style_name or "").strip()
    low = s.lower()
    if '大标题' in s:
        return ('title', 0)
    if '二级正文' in s or '三级正文' in s:
        return ('subheading', 0)
    m = re.search(r'([一二三四五六七八九十]+)级标题', s)
    if m:
        return ('heading', cn_to_int(m.group(1)) + 1)
    m = re.search(r'标题\s*([0-9])', s)
    if m:
        return ('heading', int(m.group(1)) + 1)
    m = re.search(r'heading\s*([0-9])', low)
    if m:
        return ('heading', int(m.group(1)) + 1)
    if 'list' in low or '列表' in s:
        return ('heading', 3)
    if 'caption' in low or '题注' in s:
        return ('caption', 0)
    # Normal heuristics
    t = text.strip()
    if t in SECTION_WORDS:
        return ('heading', 2)
    if re.match(r'^[一二三四五六七八九十]+、', t):
        return ('heading', 2)
    if re.match(r'^（[一二三四五六七八九十]+）', t) and len(t) < 40:
        return ('heading', 3)
    if re.match(r'^图\s*[：:]', t) or re.match(r'^图\s*\d', t):
        return ('caption', 0)
    if t.startswith('【') and '】' in t:
        return ('paragraph', 0)
    return ('paragraph', 0)

def extract_docx(path, category):
    doc = Document(path)
    paras = doc.paragraphs
    raw = []  # (style, text)
    for p in paras:
        t = p.text.strip()
        if not t:
            continue
        raw.append((p.style.name if p.style else 'Normal', t))

    # find title paragraph & date
    title_idx = None
    date_text = None
    for i, (st, t) in enumerate(raw):
        if st.strip() == '大标题':
            title_idx = i
            break
    for st, t in raw:
        if DATE_RE.match(t):
            date_text = t
            break

    # ---- subtitle + content start ----
    subtitle = ""
    start = 0
    if category == 'essay':
        abs_idx = None
        for i, (st, t) in enumerate(raw):
            if ABS_RE.search(t):
                abs_idx = i
                break
        if abs_idx is not None and abs_idx > 0:
            parts = []
            joined_norm = ""
            for st, t in raw[:abs_idx]:
                if COVER_RE.search(t):
                    continue
                if len(t) > 60:
                    continue
                tn = re.sub(r'[“”"‘’\s]', '', t)
                if tn and tn in joined_norm:
                    continue
                parts.append(t)
                joined_norm = re.sub(r'[“”"‘’\s]', '', "".join(parts))
            subtitle = "".join(parts)
            start = abs_idx  # skip cover page
    else:  # recording
        if title_idx is not None:
            subtitle = raw[title_idx][1]
            start = title_idx + 1
        else:
            subtitle = ""
            start = 0

    # build content blocks
    content = []
    for i, (st, t) in enumerate(raw):
        if i < start:
            continue
        if i == title_idx:
            continue
        if DATE_RE.match(t):
            continue
        kind, level = style_kind(st, t)
        if kind == 'title':
            continue
        if kind == 'heading':
            content.append({"type": "heading", "level": level, "text": t})
        elif kind == 'subheading':
            content.append({"type": "subheading", "text": t})
        elif kind == 'caption':
            content.append({"type": "caption", "text": t})
        else:
            content.append({"type": "paragraph", "text": t})

    return subtitle, date_text, content

def parse_recording(fn):
    stem = fn[:-5]
    is_text = stem.endswith('文本')
    if is_text:
        stem = stem[:-2]
    m = re.match(r'^(.*?)(?:ex)?(\d+)$', stem)
    if not m:
        return None
    key = m.group(1).strip()
    num = m.group(2)
    if key not in COURSES:
        return None
    display, color, order = COURSES[key]
    return {
        'courseKey': key, 'display': display, 'color': color, 'order': order,
        'num': num, 'isText': is_text, 'stem': stem,
    }

def main():
    books = []
    # essays first
    for fn in sorted(os.listdir(ESSAY_DIR)):
        if not fn.lower().endswith('.docx'):
            continue
        stem = fn[:-5]
        meta = ESSAYS.get(stem)
        if not meta:
            print("SKIP essay (no meta):", fn)
            continue
        subtitle, date_text, content = extract_docx(os.path.join(ESSAY_DIR, fn), 'essay')
        books.append({
            'id': 'essay-%02d' % meta['order'],
            'title': meta['title'],
            'course': meta['course'],
            'category': 'essay',
            'subtitle': subtitle,
            'date': date_text,
            'color': meta['color'],
            'order': meta['order'],
            'sourceFile': 'essay/' + fn,
            'content': content,
        })

    # recordings
    recs = []
    for fn in sorted(os.listdir(REC_DIR)):
        if not fn.lower().endswith('.docx'):
            continue
        info = parse_recording(fn)
        if not info:
            print("SKIP recording (no meta):", fn)
            continue
        recs.append((info, fn))

    recs.sort(key=lambda x: (x[0]['order'], int(x[0]['num']) if x[0]['num'].isdigit() else 0, x[0]['isText']))
    for idx, (info, fn) in enumerate(recs):
        subtitle, date_text, content = extract_docx(os.path.join(REC_DIR, fn), 'recording')
        num = info['num']
        suffix = ' 原文' if info['isText'] else ''
        books.append({
            'id': 'rec-%02d' % (idx + 1),
            'title': '%s · %s%s' % (info['display'], num, suffix),
            'course': info['display'],
            'category': 'recording',
            'subtitle': subtitle,
            'date': date_text,
            'color': info['color'],
            'order': 100 + info['order'] + int(num) if num.isdigit() else 100,
            'sourceFile': 'recording/' + fn,
            'content': content,
        })

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(books, f, ensure_ascii=False, indent=1)

    print("wrote", OUT, "books =", len(books))
    for b in books:
        print("  %-9s %-26s %-10s blocks=%3d  subtitle=%s" % (
            b['id'], b['title'], b['course'], len(b['content']), (b['subtitle'] or '')[:34]))

if __name__ == '__main__':
    main()
