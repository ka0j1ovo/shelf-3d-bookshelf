# -*- coding: utf-8 -*-
"""Combine scripts/books.json into js/data.js (window.BOOKS)."""
import os, json

BASE = r"C:\Users\13766\Desktop\vibecoding\shelf"
SRC = os.path.join(BASE, "scripts", "books.json")
OUT = os.path.join(BASE, "js", "data.js")

with open(SRC, 'r', encoding='utf-8') as f:
    books = json.load(f)

for b in books:
    texts = []
    for block in b.get("content", []):
        if block.get("type") in ("heading", "subheading", "paragraph", "caption"):
            texts.append(block.get("text", ""))
        elif block.get("type") == "table":
            for row in block.get("rows", []):
                texts.append(" ".join(row))
    b["searchText"] = "\n".join(texts)

with open(OUT, 'w', encoding='utf-8') as f:
    f.write("// Auto-generated from scripts/books.json — do not edit by hand.\n")
    f.write("window.BOOKS = ")
    json.dump(books, f, ensure_ascii=False, indent=1)
    f.write(";\n")

print("wrote", OUT, "with", len(books), "books")
total_blocks = sum(len(b["content"]) for b in books)
total_chars = sum(len(b["searchText"]) for b in books)
print("total blocks:", total_blocks, "| total chars:", total_chars)
