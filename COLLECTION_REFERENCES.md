# 收藏參考照片：快取、來源與清除

時序只由 [SKETCH_LIFECYCLE.md](SKETCH_LIFECYCLE.md) 決定；照片是繪圖參考，不是成品或公開門檻。只為已記錄的合格抽選準備，不替全部研究候選下載。三類共用參考交接：成功取得即保存，同一工作重試沿用照片，不重新依賴來源網站。

## 取得與邊界

- 沿既有背景交易提交後的非同步準備，不在queue／讀者GET上網或寫入。背景每輪實際準備最多2款，檢視最多16筆，D1準備租約防重；失敗至少5分鐘退避，不阻塞世界結算。
- 料理使用可靠照片來源與已核對官方備援；每張PNG／JPEG最多1MiB、精確HTTPS主機白名單、manual redirects及整輪8秒預算。
- 汽水目錄含37款的明確品牌／口味代表包裝；31款容量有來源、6款null不猜。36款原廠／CDN，Gubernija為原廠2020歷史包裝，明列來源年份；參照包裝不回填為當時實際購買容器。
- 汽水每輪最多3個核對來源、單源6秒並共用8秒，1MiB及JPEG／PNG／WebP格式／SHA檢查；來源變動明示REFERENCE_SOURCE_CHANGED，不繞過上游拒絕。

## 保存與使用

R2 reference-photos/meal-v2、soda-v1及footprint-v1按穩定主體ID暫存照片bytes、來源、作者／權利與SHA。仍待繪的有效照片保留至成品驗證成功；取消／不再待繪的過期暫存沿7天及既有有界清理處理。原生queue只讀快取並核對格式／hash，已備好就不另搜；已畫ID不回傳參考。明確選定的圖鑑包裝可作畫，不因actualPurchasePackageKnown=false而誤判無合格參照。

首次準備失敗（含雲端403）不再阻擋原抽選事件通知。原生任務先claim，使用原生搜尋／瀏覽器取得並目視精確主體照片，以hunem_cache_sketch_reference及有效作畫lease保存原始PNG／JPEG／WebP（最多1MiB）與來源／權利，再重讀該ID queue作畫。此工具不向來源URL發請求、不改世界或公開圖片；汽水仍必須通過既有目錄SHA校驗。所有保存沿各類同一準備鎖，成功照片不被失敗下載覆蓋。景點的背景準備只查該Wikipedia來源頁面，不以名稱搜尋代替身份確認；圖片仍須目視現況。

保存原PNG及縮圖後，實際讀回SHA／JPEG成功才刪參考照片；失敗保留供同圖重試。並行準備／保存後重查成品，避免又留下照片。reference-audit永久保留不含base64的來源／權利／hash與清除原因。

沿既有有界分頁掃32件及保存游標清除TTL／舊快取，不新增Cron或永久照片池。維修、錯誤與重試見 [COLLECTION_COMPLETION.md](COLLECTION_COMPLETION.md)。
