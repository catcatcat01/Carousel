# 运行手册与 GitHub 部署指南

## 项目简介

- 技术栈：React + TypeScript + Vite。
- 场景：飞书多维表格（Bitable）仪表盘组件，支持轮播展示“行为类型”文本和附件图片，同步切换，并按“时间字段”排序展示最新记录。
- 入口与脚本：`package.json:6-11`，开发 `npm run dev`，构建 `npm run build`，预览 `npm run preview`。
- Node 版本：推荐 Node 18（`.nvmrc:1`）。
- Vite 静态路径：`vite.config.js:7` 设置为 `base: "./"`，适配 GitHub Pages 子路径。

## 环境准备

- 安装 Node 18（Windows 建议用 nvm-windows 或直接安装）。
- 使用 `npm` 安装依赖：
  - `npm install`
- 首次运行前建议本地自测构建：
  - `npm run build`
  - `npm run preview`

## 本地开发运行

- 启动开发服务器：
  - `npm run dev`
- 访问本地预览地址（Vite 默认端口通常为 `5173`）。
- 注意：移动端飞书环境被禁用（`index.html:10-25` UA 检测会重定向），请在桌面端飞书的多维表格“仪表盘”中使用插件。

## 插件配置与数据要求

- 在仪表盘右侧“配置”面板内设置：
  - `数据表`：选择存在记录的表（`src/components/Carousel/index.tsx:273-275`）。
  - `视图`：选择不带筛选或筛选后仍≥配置条数的视图（`src/components/Carousel/index.tsx:276-278`）。
  - `时间字段`：用于“最新优先”排序的日期/日期时间字段（`src/components/Carousel/index.tsx:332-339`）。
  - `最新优先`：开启后按时间降序；关闭按升序（`src/components/Carousel/index.tsx:332-339`）。
  - `标题字段`：建议选择“行为类型”，显示为纯文本（`src/components/Carousel/index.tsx:279-281`）。
  - `描述字段`：可选，显示为纯文本（`src/components/Carousel/index.tsx:282-284`）。
  - `图片字段`：必须为“附件类型”（`src/components/Carousel/index.tsx:285-287`）。
  - `最多展示条数`：上限轮播条数，默认 10，建议设置为 20（`src/components/Carousel/index.tsx:288-290`）。
  - `切换间隔(毫秒)`：每张切换时间，默认 3000（`src/components/Carousel/index.tsx:291-293`）。
  - `刷新间隔(毫秒)`：定时重新拉取数据，默认 8000（`src/components/Carousel/index.tsx:294-296`）。
- 点击“确定”保存（`src/components/Carousel/index.tsx:343-348`）。

## 展示逻辑（重要）

- 文本提取：将数组/对象/字符串 JSON 统一提取为纯文本（`src/components/Carousel/index.tsx:90-129`）。
- 时间排序：选择“时间字段”后，按“最新优先”或“最旧优先”排序列表（`src/components/Carousel/index.tsx:203-219`）。
- 固定轮播集：每次刷新生成最新的 N 条；仅当 ID 列表发生变化时，重置到第 1 张，否则不中断当前轮播（`src/components/Carousel/index.tsx:220-227`）。
- 图片同步：切换到下一张前预加载其图片，图片就绪（或失败）后与文本同时切换（`src/components/Carousel/index.tsx:185-193, 241-267`）。
- 视图记录：使用视图的全部记录 ID（`getRecordIdList`），避免只取“可见区域”的少量记录（`src/components/Carousel/index.tsx:162-166`）。

## 常见问题排查

- 显示“请配置数据源”：视图无可见记录或字段 ID 无效，或在移动端环境。请在桌面端飞书仪表盘中配置，视图需至少 1 条记录。
- 图片 400 或 `REQUEST_BIZ_ERROR`：附件直链授权失败，已回退从原始值中提取常见 URL 字段；如仍失败，建议仅展示文本或在企业侧开放附件权限（`src/components/Carousel/index.tsx:131-147, 208-217`）。
- 下拉清空后保存为 `'undefined'`：已规整为真正的 `undefined`，避免取字段失败（`src/components/Carousel/index.tsx:50-61, 273-287`）。
- 轮播未完整 N 张：确认视图记录≥配置条数；代码已修正使用全部记录并固定轮播集（`src/components/Carousel/index.tsx:162-166, 220-227`）。

## 构建说明

- 生产构建：`npm run build`（产物在 `dist`，`package.json:14`）。
- 本地预览：`npm run preview`。
- 说明：构建产物不用提交到 `main` 分支；使用 GitHub Actions 自动发布时，服务端会构建并部署。

## 部署到 GitHub（推荐：Actions 自动部署）

1. 在 GitHub 创建仓库（分支 `main`）。
2. 推送代码：
   - `git init`
   - `git add -A`
   - `git commit -m "init"`
   - `git branch -M main`
   - `git remote add origin <你的仓库URL>`
   - `git push -u origin main`
3. 添加工作流文件（已内置于本项目）：`.github/workflows/deploy.yml`，内容为：

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
      - run: npm install
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

4. 仓库 Settings → Pages，将 Source 设为 “GitHub Actions”。
5. 每次 `git push` 到 `main` 将自动构建并发布。
6. 访问地址：`https://<你的GitHub用户名>.github.io/<你的仓库名>/`。

## 部署到 GitHub（备选：gh-pages）

- 安装：`npm install -D gh-pages`
- 在 `package.json` 增加脚本：`"deploy": "gh-pages -d dist"`
- 构建并发布：
  - `npm run build`
  - `npm run deploy`
- 仓库 Settings → Pages，Source 选择 `gh-pages` 分支。

## 更新与发布流程（Actions）

- 每次本地改动后只需提交并推送代码：
  - `git add <变更文件>`
  - `git commit -m "feat/fix: 描述"`
  - `git pull --rebase origin main`
  - `git push -u origin main`
- 不需要提交 `dist` 到 `main`。
- 如 `git pull --rebase` 报“有未暂存改动”：先 `git status` 查看并选择提交（`git add -A && git commit`）、暂存（`git stash -u`）或丢弃（`git restore`）。

## 运行与部署要点总结

- 仅桌面端飞书仪表盘可用；移动端 UA 被禁用。
- 时间字段决定“最新时间段”的排序，配合“最新优先”更贴近实时。
- 图片预加载与文本同步切换，避免 1 秒差异。
- 视图需至少包含 N 条记录以满足“最多展示条数”。
- 使用 GitHub Actions 自动部署，无需上传 `dist`。