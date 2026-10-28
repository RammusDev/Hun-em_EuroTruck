# Hun-em 正式網站來源

這是目前網站的唯一開發／驗證入口，正式世界在雲端D1／R2。本目錄不是通用starter範例；歷史通用README已完整保全於根data/docs-consolidation-20261028/changes.json。

接續先讀根 [HANDOFF.md](../HANDOFF.md)、[SOURCE_MAP.md](../SOURCE_MAP.md)；固定檢查與建置見 [CHECKS.md](../CHECKS.md)。目前網站測試位於test／tests，框架建置沿scripts/run-framework.mjs，不整包重建bridge核心或複製根UI。

圖片時序唯一來源 [SKETCH_LIFECYCLE.md](SKETCH_LIFECYCLE.md)，照片及失敗處理各見COLLECTION_REFERENCES／COLLECTION_COMPLETION。權限、雲端設定與診斷見 [CLOUD_MAINTENANCE.md](CLOUD_MAINTENANCE.md)。

保留.openai/hosting.json的project_id、DB／BUCKET及既有存取權限。部署只走Sites來源helper，憑證經隱藏stdin，工具經根with-d-drive啟動器；不手動改D1世界或恢復舊Cron。
