# Hun-em EventClock與已退役固定計時器

目前使用event-worker.mjs的EventClock持久單次鬧鐘，並沿既有30分鐘健康檢查接續已保存事件。正式架構、配置、驗證與恢復流程以 [EVENT_ARCHITECTURE.md](../../EVENT_ARCHITECTURE.md) 及 [HANDOFF.md](../../HANDOFF.md) 為準。網站state GET保持純讀；唯一23:05 AI日記排程保留。

## 舊來源的界線

本目錄仍保留舊worker.mjs／固定Cron範例作相容與歷史查核，舊hunem-key-time-timer的五時段Cron已停用。不要以範例重新配置、部署或啟用它，也不要以讀者開頁補算作故障備援。

目前操作使用根scripts/event-cloud-control.mjs，按事件架構文件核對既有正式設定；密鑰只走隱藏stdin與服務端secret，不寫入README、命令參數或版本庫。不要從本README臆造環境設定或重設世界。

## 本機驗證

依根 [CHECKS.md](../../CHECKS.md) 選現行背景／網站測試；歷史相容測試另行執行。隔離成功不等於正式自然事件驗收。
