# 權限整合候選（尚未部署）

2026-10-19，從正式Site精確來源ff4fce53cdf8e233e0b512f5fda388f61d3858af開啟獨立checkout。此目錄的hosting.json仍指正式project，禁止將候選直接公開或在未驗收前部署；原始碼尚未push。

使用者決策：核准讀者開站保留既有受控時間補算，不能改位置／規則／手動發布。/api/state讀取仍可觸發原transaction，保留截止保底；?view=committed仍只讀。每個讀者回應採白名單投影，不發adminToken、內部工作、錯誤或憑證。

候選已加入Google授權模組、名單與30分鐘owner新鮮度，沿用7天讀者session；/journey回應前驗證資格，HTML移出public，/index.html只轉址到受保護路由。圖片驗證reader，no-store。設定／除錯／匯出只限fresh owner；正式世界reset/import/correct/control預設拒絕。

MCP正式工具呼叫需符合WORLD_OWNER_PLATFORM_ID與OWNER_EMAIL的可信平台header，不再接受任何非空identity。此pin尚未實際核對，不能拿get_site的account id假定相等。新增hunem_service_ticket供已pin平台owner領取5分鐘、限本站的sync/publication/reference票證；WORLD_SERVICE_SECRET只存服務端，讀者不能領票。REST worker-client在隱藏stdin接受serviceTicket，可用authorize命令更新。平台bypass仍按原協議處理，不當作應用層授權。

正式每日排程沿用原生MCP prepare/submit/reference/receive/publish/progress，由平台驗證owner pin；不需要REST服務票證。保留的REST維護通道才由原生owner MCP領ticket→worker-client隱藏stdin送token及serviceTicket；票證到期重新領票。不新增排程、不改生圖工具。尚未做雲端原生工具驗收，不得把本機mock當作完成。

部署前未決：以合成世界做隔離雲端驗收；驗證平台pin、服務票證與static route實際行為；備份正式D1/R2；轉移或重新授權正式站的Google origin/credentials與名單（不直接覆蓋既有世界）；驗證控管後的截止保底與教學防重；更新worker-guide及唯一排程相容指令。正式站仍保持原版私人，原服務未改。

本機驗證：17組測試、tsc、build通過；Wrangler實際匿名旅途頁/index別名/API/圖片401、MCP工具403。本機程序已停止。地圖所需operation、mealPause、journeyCarryMs及movementSpeedsKmH保留，防止休息時錯誤移動。尚未雲端驗收或部署。

2026-10-19：獨立QA版本5已完成新雲端合成驗收，詳根目錄PHASE2_CLOUD_QA.md。本候選仍未push／部署。票證改工具端Cookie __Host-hunem_service，QA實際日誌遮罩已確認。QA專屬isolation scope／初始化與檢查入口不移植到正式候選。下一步真人Google讀者旅程測試與正式備份切換。
