# 三類速寫：Sites先存圖，AI原生讀圖

2026-11-07使用者指定，取代123／134的任務自行瀏覽來源方式。

正式選定主體 → Sites下載並保存參考照片 → 照片就緒才通知原任務 → hunem_sketch_reference(kind,id)一次返回R2原生圖片 → imagegen → 原始成品私存／驗收 → 活動完成才公開。

| 責任 | 程式／文件 |
|---|---|
| 選定投影、公開門檻 | bridge/sketch-lifecycle.mjs、SKETCH_LIFECYCLE.md |
| 參考就緒、精簡資料、原生讀圖 | bridge/sketch-work.mjs、lib/sketch-work.ts |
| 景點照片 | bridge/footprint-reference.mjs |
| 餐點照片 | bridge/collection-reference.mjs、collection-reference-fallback.mjs |
| 汽水已審包裝 | bridge/soda-reference.mjs、soda-reference-catalog.json |
| R2重用、格式／SHA、退避／清理 | bridge/meal-reference-cache.mjs、COLLECTION_REFERENCES.md |
| 通知與防重 | bridge/footprint-events.mjs、collection-events.mjs、sketch-progress.mjs |
| 工具與權限 | bridge/collection-tools.mjs、app/mcp/route.ts |
| 三類任務提示 | public/*-event-worker-guide.md |

通知僅帶主體、固定畫風、referenceRead及提交契約，不嵌大型base64、不交世界歷史給模型分析。hunem_sketch_reference只讀R2，不連外、不領取、不改世界；照片未備妥時不能作畫。AI不搜尋、不使用瀏覽器／shell，只目視已存照片、生圖、目視原成品及提交原始PNG路徑。

照片失敗保留referencePending及安全錯誤碼，5分鐘起倍增退避（上限6小時，最多8次後停止並待人工處理）；由既有事件／健康檢查再嘗試，尚未通知AI，不新增Cron。監控顯示reference_blocked／preparing_reference。已受理通知仍不自動重送。

queueSketchWork只有參考就緒才保存排隊憑證。排隊不消耗20分鐘存圖租約，原生收圖才啟用。舊通知hunem_prepare_sketch相容入口保留唯一ID恢復與既有憑證，缺照片回reference_pending。存圖失敗重用同張原圖，不重畫。

伺服器驗證PNG尺寸、透明度、SHA與原圖／縮圖讀回；活動完成才公開。23:05每日插圖既有hunem_reference_art從Sites讀身份圖／最近成品，時序不變；state GET純讀。此改動移除來源瀏覽依賴，不保證平台imagegen或執行環境永遠可用；隔離測試不等於正式自然事件驗收。

11/7缺圖維修：bridge/sketch-repairs.mjs僅在同world、原meal ID及唯一11/7晚餐occurrence下，用使用者確認且與餐廳官方菜單相符的實際菜名覆蓋作圖／手帳投影，不改原世界／收支。該餐的照片明列熟鮭魚與南瓜馬鈴薯煎餅「成分外觀參考」，不是餐廳原餐照片；圖只依確認菜名組合配菜，不抄參考裡的其他食材。Friedenskirche使用古教堂保存組織的精確景點照片備援。兩者仍由Sites server有界下載／R2保存，再由原生工具讀圖；此個案修復不代表一般餐廳誤判料理的抽取缺陷已全面修正。
