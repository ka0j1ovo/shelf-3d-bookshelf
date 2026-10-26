# 3D 书房书架 · Shelf

一个基于 **three.js** 的静态网页：温馨书房里放着两个木质书架，所有论文与课程记录都做成一本书。
点击书本抽出 → 再次点击打开 → 文档以排版好的文字显示在右侧面板。
按住书本拖动可以自由跟随鼠标，松手自动吸附到最近的槽位，从而调整书架上的顺序。
书架侧面有一块发光的搜索屏，点击后在输入框里打字即可全文检索所有文档。

## 打开方式

### 方式一：直接双击（最简单）

直接双击 `index.html` 用浏览器打开即可。
three.js 已经以 UMD 全局脚本的形式内置在 `js/vendor/` 里，**不依赖网络、不需要服务器**，`file://` 也能正常运行。

### 方式二：本地起一个静态服务

```bash
python -m http.server 8000
# 然后浏览器打开 http://localhost:8000
```

### 方式三：GitHub Pages

把仓库推送到 GitHub，在 **Settings → Pages** 里选择分支与根目录即可。
因为没有任何构建步骤，Pages 会直接托管 `index.html`。

## 操作说明

| 操作 | 效果 |
| --- | --- |
| **W / A / S / D**（或方向键） | 在书房里前后左右走动（第一人称） |
| **空格** | 跳一下 |
| 拖拽空白处 | 环视四周 |
| 点击书架上的书 | 书本抽出，停在书架前方 |
| 再次点击抽出的书 | 书本翻开，右侧显示排版后的文档 |
| 点击已打开的书 / 关闭按钮 / `Esc` | 关闭文档，书本归位 |
| 按住书本拖动 | 书本被拿起、自由跟随鼠标，松手吸附到最近槽位并调整顺序 |
| 点击书架侧面的搜索屏 | 打开搜索面板 |
| 搜索框输入关键词 | 全文检索，点结果直接打开对应文档 |
| 手机端左下角方向键 | 前后左右移动 · 中间「跳」按钮跳跃（触屏拖拽空白处环视） |

## 书架布局

- **后院靠墙的书架** → 论文（`essay/`），共 2 本
- **右侧墙的书架** → 课程记录（`recording/`），共 33 本
- 两个书架各自的搜索屏都能打开全局搜索

## 目录结构

```
shelf/
├── index.html              页面入口
├── css/style.css           页面 / 文档排版 / 搜索面板样式
├── js/
│   ├── vendor/
│   │   ├── three.min.js    three.js r147（UMD 全局版）
│   │   └── OrbitControls.js 相机控制（UMD 全局版）
│   ├── data.js             window.BOOKS —— 所有文档的可检索正文（自动生成）
│   └── main.js             书房场景、两个书架、交互、文档面板、搜索
├── essay/                  论文原稿（docx / pdf）
├── recording/              课程记录原稿（docx）
├── scripts/
│   ├── extract_all.py      把 essay/ + recording/ 的 docx 全部转成 books.json
│   ├── build_data.py       books.json → js/data.js
│   ├── smoke_test.cjs      Node 冒烟测试（真实 three.js + DOM stub）
│   ├── walk_test.cjs       WASD 走动 / 撞墙 / 相机朝向测试
│   ├── room_check.cjs      房间六面是否完整封闭
│   ├── geometry_check.cjs  书架/房间/墙体几何校验
│   └── screen_check.cjs    搜索屏位置校验
├── package.json
└── README.md
```

## 重新生成文档数据

网页里显示的文字来自 `js/data.js`（由 `scripts/` 下的 Python 脚本从 docx 提取）。
如果往 `essay/` 或 `recording/` 里新增了 docx，重新生成即可：

```bash
# 需要 python + python-docx
python scripts/extract_all.py     # 读取所有 docx → scripts/books.json
python scripts/build_data.py      # books.json → js/data.js
```

说明：

- 按需求**只保留文字**，不提取原文档中的图片，仓库保持轻量。
- `recording/` 里带 `文本` 后缀的文件是课堂录音的原始逐字稿（原文），
  不带后缀的是整理后的「导读」，两者都会作为独立的书出现在书架上。
- `essay/` 里的两个 PDF 暂未纳入（docx 版本已在书架中）。

## 技术要点

- **three.js**（r147 UMD）自绘书房：四面墙 + 天花板 + 木地板，窗户与窗帘、书桌台灯、地毯、盆栽与挂画。
- **第一人称漫游**：WASD / 方向键走动，拖拽空白处环视；相机始终被限制在房间内，且不能穿进书架。移动端自动显示左下角方向键。
- **两个书架**由同一个 `buildShelf()` 生成，行数/槽位随书量自动计算并贴合墙面。
- 书本是独立的 `Box` 组合：书脊用 Canvas 贴图**竖排**书写书名，前封面可以绕书脊翻开。
- 拖拽时把鼠标射线投到「书架本地坐标系中 z=拖拽平面」上，再 `worldToLocal`，因此任意朝向的书架都能自由拖动。
- 文档面板用 DOM + CSS 排版（宋体正文、衬线标题、问答式小标题），比在 3D 里排文字更清晰。

## 测试

```bash
node scripts/smoke_test.cjs      # 场景构建 + 35 篇文档渲染 + 点击/切换/搜索
node scripts/walk_test.cjs       # WASD 走动、撞墙滑行、相机跟随
node scripts/room_check.cjs      # 房间六面墙完整封闭（防止出现“黑墙”）
node scripts/geometry_check.cjs  # 书架不穿墙、互不重叠
node scripts/screen_check.cjs    # 搜索屏都在房间内
```
