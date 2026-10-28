# 收藏參考照片：快取、來源與清除

時序只由 [SKETCH_LIFECYCLE.md](SKETCH_LIFECYCLE.md) 決定；照片是繪圖參考，不是成品或公開門檻。只為已記錄的合格抽選準備，不替全部研究候選下載。

## 取得與邊界

- 沿既有背景交易提交後的非同步準備，不在queue／讀者GET上網或寫入。背景每輪實際準備最多2款，檢視最多16筆，D1準備租約防重；失敗至少5分鐘退避，不阻塞世界結算。
- 料理使用可靠照片來源與已核對官方備援；每張PNG／JPEG最多1MiB、精確HTTPS主機白名單、manual redirects及整輪8秒預算。
- 汽水目錄含37款的明確品牌／口味代表包裝；31款容量有來源、6款null不猜。36款原廠／CDN，Gubernija為原廠2020歷史包裝，明列來源年份；參照包裝不回填為當時實際購買容器。
- 汽水每輪最多3個核對來源、單源6秒並共用8秒，1MiB及JPEG／PNG／WebP格式／SHA檢查；來源變動明示REFERENCE_SOURCE_CHANGED，不繞過上游拒絕。

## 保存與使用

R2 reference-photos/meal-v2及soda-v1按穩定collection ID暫存照片bytes、來源、作者／權利與SHA，有效7天。原生queue只讀快取並核對格式／hash，作畫時不再另搜照片；已畫ID不回傳參考。明確選定的圖鑑包裝可作畫，不因actualPurchasePackageKnown=false而誤判無合格參照。

保存原PNG及縮圖後，實際讀回SHA／JPEG成功才刪參考照片；失敗保留供同圖重試。並行準備／保存後重查成品，避免又留下照片。reference-audit永久保留不含base64的來源／權利／hash與清除原因。

沿既有有界分頁掃32件及保存游標清除TTL／舊快取，不新增Cron或永久照片池。維修、錯誤與重試見 [COLLECTION_COMPLETION.md](COLLECTION_COMPLETION.md)。
