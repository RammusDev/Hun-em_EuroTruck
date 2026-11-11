# 開發與文件入口

## 倉庫範圍

本倉庫對應完整工作區的`footprints-checkout/`，是網站新增修改與驗證的唯一入口。根`lib/`與`assets/`另有共用來源；站內`lib/core.mjs`是目前編譯核心。根文件、部分測試與工具未包含於此倉庫，正式D1／R2世界及圖片也不在Git內。

完整工作區接續先讀根`HANDOFF.md`，再依`SOURCE_MAP.md`選擇主題來源；固定檢查依`CHECKS.md`執行。README與作品集文件不取代這些操作規則。

## 文件導覽

| 主題 | 入口 |
| --- | --- |
| 履歷與作品集 | [PORTFOLIO.md](PORTFOLIO.md) |
| 架構與工程案例 | [ENGINEERING.md](ENGINEERING.md) |
| 圖片生命週期 | [SKETCH_LIFECYCLE.md](../SKETCH_LIFECYCLE.md) |
| 參考來源與失敗處理 | [COLLECTION_REFERENCES.md](../COLLECTION_REFERENCES.md)、[COLLECTION_COMPLETION.md](../COLLECTION_COMPLETION.md) |
| 作畫資料包 | [SKETCH_WORK.md](../SKETCH_WORK.md) |
| 管理權限與設定 | [CLOUD_MAINTENANCE.md](../CLOUD_MAINTENANCE.md) |

## 維護規則

- state GET保持純讀，不恢復讀取補算；舊五時段Cron停用，唯一23:05 AI排程保留。
- 不整包重建編譯核心，不以根`public/`覆蓋目前網站UI。
- 本機工具經根`scripts/with-d-drive.mjs`啟動，暫存與快取留在D槽；Sites憑證只走既有隱藏stdin流程。
- 部署沿原生Sites入口，不自行啟動歷史localhost發布流程。
- 保留`.openai/hosting.json`的project_id、DB／BUCKET及既有權限。
- 修改角色、日記、翻譯或圖片前讀根`CHARACTER.md`；Hun-em固定為全黑毛色、黃色圍巾。

僅有本倉庫時，先補齊完整工作區來源與授權環境再執行檢查；`npm install`或`npm run dev`不代表完整重現正式系統。
