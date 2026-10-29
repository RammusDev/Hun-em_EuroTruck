# 餐點與汽水：抽選預繪、完成公開

只處理本次事件的kind與collectionId。hunem.meal_completed／hunem.soda_purchased保留為既有訂閱相容名稱，現在都表示正式已確定抽選的繪圖通知；名稱不是吃完、購買或喝完的完成證明。餐點吃完、汽水同瓶喝完才由服務端公開，作畫任務只保存成品，不自行發布或改世界／日記。

1. 優先讀事件data.kind與data.collectionId，再hunem_collection_queue(kind,id=collectionId)純讀工作及快取參考。若平台觸發文字缺ID，讀hunem_collection_event_status該kind的最新sent收據及hunem_collection_queue(kind)：僅當收據collectionId與唯一候選id相同、可用的名稱／recordedAt對得上其已記錄抽選，才恢復該ID；不以吃完時間、購買完成或喝完作預繪資格。多筆、不符或無法核對就回報識別資料不足，不猜歷史項目。再hunem_claim_collection(kind,id)，只有action=generate才畫；busy／already-drawn結束。保存20分鐘lease，不輸出lease或憑證。
2. 直接參考作畫（2026-10-29）：選定項目後先claim，僅action=generate繼續；已有有效lease沿用，不重複claim。取得且實際目視的原生參考圖片直接交內建imagegen，沒有本機路徑用num_last_images_to_include，已有本機路徑才用referenced_image_paths，兩者不可同時提供。不要求先下載成檔、不要求把參考存回網站，不呼叫cache工具或重讀queue作為生圖／收圖的前置條件。已有合格快取可直接使用；沒有快取或雲端403則使用原生搜尋／瀏覽器取得可靠實物圖片並直接作畫。只有確實找不到可靠參考才回報REFERENCE_UNAVAILABLE，不以快取是否為空判斷失敗。料理符合菜名且不臆造配料；景點符合實際現況，不重建已拆建築；汽水符合已核對品牌／口味／圖鑑包裝，不用相似產品替代。參考快取只作可選維修備援，不阻擋或延遲作畫。成品才用原生receive工具保存，失敗沿用同一生成原圖重送；活動完成後才公開。

3. 實查寬高相等、透明背景與主體身份，目視後hunem_receive_collection(kind,id,lease,file=原始PNG,review={tool:"image_gen.imagegen",actuallyCalled:true,subjectRecognizable:true,originalGeneratedPath:實際原圖路徑})原生收圖；只有真實完成才填true。保存、讀回驗證與私下備妥不代表已公開。
4. 參考、生成、驗證或保存失敗，沿hunem_record_collection_failure支援的有界錯誤碼回報；已生成原圖保留供同圖保存重試，lease過期重新領取，不重新作畫。正常busy／already-drawn保持安靜，實際收圖或需介入錯誤才回報。

抽選確定與活動完成是兩個獨立觸發點：完成事件只公開備妥成品，不建立另一份AI繪圖工作。完成仍缺圖只重試原抽選工作，公開讀回失敗只重試公開；不新增定時工作、重算餐次或購買。

通知HTTP200不代表圖片完成。訂閱／投遞／成品狀態由hunem_collection_event_status核對，沿既有watermark、租約、受限重試及穩定ID防重；不自動批次補畫歷史。擁有者明確維修可重送既有工作，不新增事件。
