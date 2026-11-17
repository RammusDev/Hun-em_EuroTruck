# Hun-em — European Road Diary & Automated Travel Journal

**English** | [繁體中文 ↓](#中文說明)

An ongoing travel simulation following Hun-em, an entirely black cat wearing his signature yellow scarf, as he delivers cargo and explores Europe. Completed activities become multilingual diary entries, illustrations, and travel collections.

This personal project was developed with AI assistance. It combines an event-driven simulation, persistent cloud storage, and AI content workflows to keep the journey moving even when nobody visits the website, while keeping travel events, expenses, stories, and publication timing consistent.

[Live website](https://hun-em-europe.rammus-shigoto.chatgpt.site/journey) · [Portfolio notes](docs/PORTFOLIO.md) · [Architecture and engineering cases](docs/ENGINEERING.md) · [Development guide](docs/DEVELOPMENT.md)

> The live website requires Google identity verification and owner approval. This repository contains the website source, but excludes production world data, cloud images, and some shared modules and tools from the full workspace. A standalone clone is not a complete, ready-to-run development environment. The linked supporting documents are currently in Traditional Chinese.

## Features

- **A continuing European journey:** deliveries, ferries, refueling, meal breaks, accommodation, and sightseeing follow shared daily routines. The destination catalog covers **591 cities across 19 countries**; these are available destinations, not completed visits.
- **Interactive journey map:** Google Maps displays the character's simulated position, routes, and completed landmark visits, with a Leaflet/OpenStreetMap fallback.
- **Four-language journals:** Traditional Chinese, English, German, and Japanese entries draw on the same archived daily events and include language-learning material.
- **Illustrated travel collections:** landmarks, regional meals, and soft drinks appear in albums and collection journals. Images are prepared privately after selection and become public only after the corresponding activity is completed.
- **Identity and reader approval:** the website verifies Google identity and checks viewing permission. Approved readers enter the journey; new readers are directed to an application page. Submitting an application triggers a Gmail API notification to the owner for manual review.
- **Owner administration:** access approval, rejection and revocation, protected settings, snapshot restoration, task status, diagnostic exports with sensitive fields masked, and email alerts for operational issues.

## Tech stack

**JavaScript, TypeScript, React, Cloudflare Workers, Durable Objects, Cloudflare D1, Cloudflare R2, Google Maps JavaScript API, Google Identity Services, Gmail API, OAuth 2.0, Model Context Protocol (MCP).**

| Area | Implementation |
| --- | --- |
| Application | React, Next.js App Router structure, vinext/Vite, and vanilla JavaScript/CSS for the journey and collection interfaces |
| Backend and scheduling | Cloudflare Workers and Durable Objects with persistent alarms |
| Persistence | D1 for structured state and access records; R2 for image assets and stored snapshots |
| Maps | Google Maps JavaScript API; Leaflet/OpenStreetMap fallback |
| Identity and notifications | Google Identity Services for identity verification; OAuth 2.0-authorized Gmail API for owner notifications |
| AI workflows | MCP tools and event subscriptions, image generation, multilingual writing packages, and content validation |
| Verification | Node.js tests, Miniflare D1/R2 integration checks, TypeScript checks, and application builds |
| Hosting | Cloudflare-backed deployment managed through Sites |

## Engineering decisions

| Challenge | Approach |
| --- | --- |
| Continue the world without an open browser | Persist the next events and use Durable Object alarms, with health checks for missing or overdue work |
| Avoid duplicate expenses, visits, and publication on retries | Stable event IDs, version checks, D1 leases, and persisted commit receipts |
| Keep planned activities separate from completed facts | Separate future plans, due-event settlement, and reader-facing projections; state GET requests remain read-only |
| Handle unpredictable AI completion times | Separate notification, validated asset storage, and activity-gated publication |
| Control access independently of Google identity | Maintain application and approval states in D1 and enforce permissions on the server |
| Keep mobile updates stable | Preserve existing page elements and images during position updates, pause reads in hidden tabs, and use smaller preview images |

The daily journal workflow archives the day's facts at 23:00 Europe/Berlin and schedules AI writing and illustration work at 23:05. Content validation and publication rules handle incomplete output; generation and delivery failures can still require manual recovery.

## Validation and limitations

Before release 139 on November 8, 2026, **202 website tests, 191 shared-module tests, and 3 tooling tests** passed, along with TypeScript checks and the website build. These are historical release results, not a claim that GitHub CI is configured. Shared-module and tooling tests are not all included in this repository.

One mobile image-preview comparison reduced an image from approximately 90 KB to 36 KB, about 60%. This describes that image sample, not an overall website speed improvement. Production observations also confirmed event progression after a fix for stalled background work.

AI writing and illustration can fail because of reference availability, task startup, generation, or asset handoff issues. Long-running unattended operation, cross-day/daylight-saving behavior, and complete disaster recovery remain areas for continued validation. No uptime or failure-free operation guarantee is claimed.

## Development and repository scope

The project uses AI tools to assist with code, writing, and illustrations. The portfolio documents product decisions, workflow design, diagnosis, verification, and release management as part of that development process.

This repository corresponds to `footprints-checkout/` in the full workspace. Some shared source modules, catalogs, operational instructions, and fixed check runners live outside this checkout. Production D1/R2 data and images are managed separately. Installing dependencies alone does not reproduce the live system.

Read the [development guide](docs/DEVELOPMENT.md) before maintenance work. The portfolio documentation does not replace production operating instructions.

---

## 中文說明

### Hun-em｜歐洲公路日記

[English ↑](#hun-em--european-road-diary--automated-travel-journal) | **繁體中文**

一個持續運作的角色旅行網站：讓披著黃色圍巾的全黑貓 Hun-em 在歐洲配送、旅行，將已發生的生活事件整理成四語日記、插圖與收藏。

本專案以 AI 協作方式開發，結合事件驅動模擬、雲端持久化與生成式內容工作流。工程重點是讓世界能在無人開啟網站時繼續推進，並讓行程、收支、圖文與公開時機維持一致。

[線上網站](https://hun-em-europe.rammus-shigoto.chatgpt.site) · [作品集與履歷文案](docs/PORTFOLIO.md) · [架構與工程案例](docs/ENGINEERING.md) · [維護入口](docs/DEVELOPMENT.md)

> 網站需要 Google 登入及擁有者核准。此倉庫保存網站來源，不含正式世界資料、完整根目錄工具或雲端圖片；單獨clone並非可直接啟動的完整開發環境。

### 產品功能

- **持續推進的旅程**：配送、渡輪、加油、餐休與旅遊共用作息規則；地圖呈現當前位置與已完成足跡。
- **四語旅行日記**：依同一份已封存事件，產生繁體中文、英文、日文與德文日記，搭配語言學習內容。
- **旅行收藏**：景點、餐點與汽水插圖以手帳與相簿呈現；選定時準備圖片，活動完成後才公開。
- **擁有者維護**：具權限控制的設定管理、版本回復、工作狀態與遮罩診斷下載。

目的地資料涵蓋 **19國、591個城市**；這是可選目的地範圍，並非角色已完成的旅行數量。

### 工程重點

| 問題 | 設計與實作 |
| --- | --- |
| 無人開站時仍需推進世界 | Durable Objects持久鬧鐘接續事件，另以健康檢查處理缺失或逾期事件 |
| 重送不能重複扣款或刊登 | 穩定事件ID、版本核對、D1租約與提交收據，重送讀回既有結果 |
| 計畫不應冒充已發生的事實 | 分離未來計畫、到期結算與讀者投影；state GET保持純讀 |
| AI完成時間不可預測 | 私下備圖與完成後公開分成兩階段，區分通知、保存驗證與公開 |
| 手機持續更新容易閃爍 | 位置更新保留既有頁面與圖片，背景分頁停止讀取，使用較小預覽圖 |

### 技術組成

- **應用層**：JavaScript、TypeScript、React、Next.js App Router結構、vinext／Vite；旅程與手帳包含原生JavaScript／CSS介面。
- **雲端與資料**：Cloudflare Workers、Durable Objects、D1、R2，透過Sites管理發布。
- **AI整合**：MCP工具與事件訂閱、原生圖像生成、四語寫作閱讀包與內容驗證。
- **品質檢查**：Node.js測試、Miniflare D1／R2隔離驗證、TypeScript檢查與網站建置。

### 驗證成果與限制

2026-11-08正式139發布前，**202項站內、191項共用及3項工具測試**通過，型別檢查與網站建置亦通過。共用與工具測試位於完整工作區，未全部包含於本倉庫。此為當次發布紀錄，並非目前已配置GitHub自動CI。

手機預覽最佳化的一個同圖比較由約90 KB降至36 KB，約減少60%；僅代表該圖片樣本，不代表全站載入速度提升60%。事件卡住修復已有正式自然事件成功接續的紀錄。

AI圖文仍可能因參考來源、平台啟動或生成失敗需要人工修復；長期無人操作、跨日／DST與完整災難復原仍需持續驗證。目前沒有對外宣稱可用率或零故障保證。

### 開發方式

這是持續維護的個人AI協作專案。作品集以需求取捨、流程設計、問題診斷、驗證與發布管理呈現工作內容；程式與圖文產出使用AI工具協助。詳見[作品集說明](docs/PORTFOLIO.md)。

接續維護請閱讀[開發與文件入口](docs/DEVELOPMENT.md)，避免將展示說明當作正式環境操作指南。
