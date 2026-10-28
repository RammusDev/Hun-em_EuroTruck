# 收藏圖片完成追蹤與汽水包裝參考

## 2026-10-28 正式來源403備援

今天Aranciata實際購買的照片準備在正式Worker回403，不能用昨天本機HTTP200當作雲端可用的驗收。新增原廠全球版330mL包裝PNG及已核對的官方候補，保留明確全球英文標籤／圖鑑代表用途。單輪最多3來源、總8秒、單請求6秒、固定主機清單、manual redirects、原本1MiB及圖片格式驗證；已核對SHA的來源若內容改變會回REFERENCE_SOURCE_CHANGED。

原生擁有者工具`hunem_cache_soda_reference`只接受已存在購買的產品及平台原生PNG檔案，實際SHA必須與該品項已核對的來源完全相同；不能提交任意照片、URL或自行聲明來源。沿同一soda準備租約存暫存照片，queue仍純讀；作畫／原圖縮圖驗證後照原規則清除照片並留來源稽核，不建立永久照片池。這是來源拒絕雲端下載時的明確維護備援，不保證所有外部站永不拒絕存取。

若既有外掛連線尚未刷新出新增工具，既有擁有者publication入口可用`op=collection-reference-import`傳同一PNG原始bytes；仍走同一雜湊／購買資格／租約驗證，串流限制1MiB、PNG結構驗證，保持原有擁有者或短效服務票證與Origin限制。不是任意檔案上傳，不提供任意來源網址或圖鑑成品上傳替代。

## 同日後續：封存依賴缺漏修復

收藏功能完成驗證時另發現，先前107僅移植publication-queue區塊，漏掉其引用的multilingualWritingInstruction與taiwanPlaceInstruction，導致23:00封存拋ReferenceError、背景回503。正式112增加安全clock錯誤碼；113加入擁有者限定的uncommitted交易副本診斷（無自訂時間、無世界／日記提交）；114只加入已核准的寫作指引常數及既有台灣地名共用模組匯入，核心其他內容維持。新增編譯core實際23:00封存測試，不能再以午餐扣款測試代替封存驗收。

修復後雲端診斷副本成功；明確維護操作只重新arm原持久到期事件，沒有新Cron或新事件。正式原生讀回clock failures0、plan953→954，10/27日記於23:35依既有截止規則自然發布為備用文章／無圖。這是先前整合缺漏造成的實際影響，不能聲稱今天AI圖文成功，也不擅自重寫或補畫截止後日記。查證證據在根專案data/collection-completion-20261027/clock-reproduction-before-fix.json及after-fix.json。

2026-10-27。沿正式110精確來源接續，只修改收藏、照片準備、事件投遞完成追蹤與監控。原始世界、既定行程、付款／吃完／購買／喝完事件、日記、角色與唯一23:05工作不變；GET及原生queue保持純讀。

## 圖鑑包裝參考

`bridge/soda-reference-catalog.json`含37產品各一個已核對的具名包裝參考，圖片取原廠或其連結CDN；Gubernija為原廠在Beverage Trade Network刊登的2020歷史包裝，明列sourceType／sourceYear。31筆有來源支持容量，6筆null不猜測。玻璃瓶／PET／罐及必要的合照左右中選取指示全部保存。這是圖鑑插圖的明確參考款，不將未知歷史購買包裝回填為事實；`illustrationPackage.actualPurchasePackageKnown=false`不阻止依已選參考款作畫。

汽水只在已存在實際購買記錄後準備對應照片，背景最多2款／輪，沿獨立D1準備租約。固定HTTPS主機清單、manual redirects、6秒請求、1MiB大小／JPEG-PNG-WebP魔術碼驗證。以R2 `reference-photos/soda-v1/`暫存，7日TTL、失敗5分鐘退避。選單純讀返回原生圖片；作畫不臨時重查，保存驗證後刪照片、留下來源／權利／SHA稽核。修正準備列表被前兩筆已準備／退避中項目長期占住問題，檢視上限16筆、真正準備上限2款。

## 通知與圖片分開

舊`status=sent`保留為HTTP受理收據，不能當作已完成圖片。`completion`另顯示complete／drawing／reference_blocked／awaiting_image／awaiting_notification／attention_required。新收圖必須先讀回R2原圖SHA及JPEG縮圖，才寫D1收藏圖片metadata及verifiedAt；舊圖明列legacy-image-record，不冒稱這次重新逐張驗證。

既有背景事件與30分鐘健康檢查會檢查已送達而缺圖的同一實際收藏，30分鐘寬限後重試；每次HTTP受理後寬限依自動次數為30／60／120／240分鐘。有效20分鐘作畫租約、已保存圖片、參考照片未備妥時不重送。最多3次自動重送／收藏收據，沿同一事件D1租約、每輪最多2個通知、每次新generation事件ID，保留原購買／用餐payload與記錄時間；傳輸失敗仍按原穩定ID退避。超過上限警示，需人工介入，不無限喚起AI。訂閱起始水位保留，不補通知歷史、不恢復舊Cron或新增排程。

原生`hunem_record_collection_failure`接受5個有界錯誤碼：REFERENCE_UNAVAILABLE、PACKAGING_UNCONFIRMED、IMAGE_GENERATION_FAILED、IMAGE_VALIDATION_FAILED、IMAGE_SAVE_FAILED。只允許已記錄的收藏，不接收任意錯誤文字；失敗保留原圖供保存重試。未收到失敗回報只能顯示IMAGE_COMPLETION_NOT_REPORTED，不能猜模型內部根因。監控增加逾期待繪／參考受阻／重試上限警示，接入原有已授權的監控呈現與通知設定。

## 驗證

新增隔離D1/R2測試涵蓋HTTP200未完成、GET零寫入、來源受阻不消耗重送、租約防重、並行只重送一次、同payload不同generation、三次上限、失敗碼與保存後抑制。實際收圖測試模擬原圖讀回缺件，確認不產生完成metadata。37款參考、來源／容量／歷史年份、官方照片下載邊界與暫存刪除另有測試。

正式人工補畫Limonata只證明此次生圖／保存成功，不是未來自然事件的保證。正式自然觸發與長期可用性仍取決於來源、平台與額度；錯誤和缺圖會被追蹤，不宣稱永不失敗。
