# Hun-em 關鍵時間純程式觸發

這是尚未部署至外部帳戶的Worker來源。它只呼叫Sites專用POST入口，不呼叫AI、不保存世界、不直接連D1/R2。

## 時間

Europe/Berlin 09:00、13:30、16:15、23:00、23:30。範例Cron同時包含CET/CEST候選，Worker依scheduledTime篩選當地時間：外部Worker每日最多10次喚起，僅5次呼叫Sites。夏令時間切換有測試；Cron不保證秒級準時。暫時保留所有日子的五次呼叫，日常引擎按當日工作／休假狀態決策；不是每15分鐘更新世界。

23:05既有AI日記／插圖排程不變，新增程式觸發不處理AI寫作及生圖。23:30呼叫僅依既有截止規則補算，不提前刊登、不補畫。

## 配置（尚未設定正式環境）

Sites端三項：

- BACKGROUND_TICK_SECRET：獨立隨機密鑰，至少32 bytes、base64url編碼43字元；由Sites原生secret設定，勿重用WORLD_SERVICE_SECRET。
- BACKGROUND_TICK_WORLD_ID：既有正式世界ID，須與請求及持久世界一致。
- BACKGROUND_TICK_ORIGIN：精確Sites HTTPS origin，不含路徑。

外部Worker端：TICK_SECRET同一專用密鑰；TICK_ENDPOINT為該origin加/api/background-tick；TICK_WORLD_ID為同一世界ID。密鑰只放server secret，不放此檔、版本庫、提示詞、URL或瀏覽器。移除／更換Sites專用secret即可停用舊排程器。沒有配置secret時，入口回503且不讀寫世界。

需要先在新的隔離環境實測平台入口及真正Cron後，再配置正式帳戶與秘密。使用者目前無外部雲端帳戶，因此不可宣稱已啟用。此README不是現在要求使用者貼密鑰。

## 行為與持久性

HMAC綁定POST、origin、固定路徑、本文SHA256及伺服器時間窗60秒。本文只有worldId與requestId；不可指定快轉時間、變速、世界內容或其他操作。本文上限512 bytes。

入口只允許現有生活推進／封存／截止規則，沒有讀者資格、完整世界匯出、教材設定、圖文上傳／發布或重設功能。僅回摘要收據。

現階段沿用現有R2快照＋D1租約/CAS：請求收據與世界在同一快照提交。重複requestId或30秒內重複觸發跳過快照寫入，重放收據保留120秒（超過請求有效期）且最多128筆；不是Map記憶體去重。請求ID可在有限重試中重用；每次重試要重簽時間，不跟隨轉址。外部範例不自動重試，失敗依平台紀錄與下一次同步恢復。

定時器仍需觀察失敗／延遲；目前沒有新增郵件或AI通知。若Cron中斷，網站請求及既有晚間同步仍可補算。五分鐘高頻推進與全面局部儲存未啟用。

## 本機驗證

根目錄執行 node --test phase2-world-access/test/background.test.mjs，另以 node scripts/test-background-storage.mjs 驗證Miniflare持久D1/R2、跨隔離程序租約、重啟去重與真實引擎出遊前hook。實際Sites ingress與外部Cron自然喚起仍需各自驗證，不能以本機測試冒充。
