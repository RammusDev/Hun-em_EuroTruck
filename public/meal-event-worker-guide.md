# Hun-em 餐點事件速寫

僅處理既有「Hun-em 餐點事件速寫」的 meal 事件。保留原事件訂閱、啟用狀態、續訂與通知政策，不新增或重建排程。

唯一正常流程：抽選確定時觸發私下繪圖，吃完時才由服務端公開成品。hunem.meal_completed 是既有相容事件名稱，現在代表已確定抽選的繪圖通知；名稱不是吃完證明。任務只保存圖片，不自行發布、不改世界或日記。

1. 優先讀 data.kind 與 data.collectionId；kind 固定 meal，payload 明示其他 kind 就停止回報。先 hunem_collection_queue(kind="meal",id=collectionId) 純讀工作與快取參考。觸發文字缺 ID 時，讀 hunem_collection_event_status 的 meal 最新 sent 收據及 hunem_collection_queue(kind="meal")：只有收據 collectionId 與唯一候選 id 相同，且可用名稱／recordedAt 對得上已記錄抽選，才恢復 ID。不要要求先吃完；多筆、不符或無法核對就回報識別不足，不猜歷史項目，不批次補畫。

2. 直接參考作畫（2026-10-29）：選定項目後先claim，僅action=generate繼續；已有有效lease沿用，不重複claim。取得且實際目視的原生參考圖片直接交內建imagegen，沒有本機路徑用num_last_images_to_include，已有本機路徑才用referenced_image_paths，兩者不可同時提供。不要求先下載成檔、不要求把參考存回網站，不呼叫cache工具或重讀queue作為生圖／收圖的前置條件。已有合格快取可直接使用；沒有快取或雲端403則使用原生搜尋／瀏覽器取得可靠實物圖片並直接作畫。只有確實找不到可靠參考才回報REFERENCE_UNAVAILABLE，不以快取是否為空判斷失敗。料理符合菜名且不臆造配料；景點符合實際現況，不重建已拆建築；汽水符合已核對品牌／口味／圖鑑包裝，不用相似產品替代。參考快取只作可選維修備援，不阻擋或延遲作畫。成品才用原生receive工具保存，失敗沿用同一生成原圖重送；活動完成後才公開。


3. 沿用上一步取得的lease，不重複claim。使用內建 image_gen.imagegen，快速鉛筆淡水彩、正方形透明 PNG；依實物選自然視角，不編造配料，不需角色。若有角色須全黑貓、黃色圍巾。

4. 實查原始 PNG 寬高相等、透明 alpha，目視主體可辨識後，hunem_receive_collection(kind="meal",id,lease,file=實際原始PNG絕對路徑,review={tool:"image_gen.imagegen",actuallyCalled:true,subjectRecognizable:true,originalGeneratedPath:實際原圖絕對路徑}) 原生收圖；只有真正完成才填 true。私存及讀回成功不代表已公開。既有有效圖沿用不覆寫；保存失敗保留原圖重送，lease 過期重新領取，不重新生圖。其他失敗沿 hunem_record_collection_failure 支援的有界錯誤碼回報。成功保存並驗證後由服務端清理參考位元組；失敗保留快取供既有重試。

吃完觸發器只公開已備妥成品，不建立第二份 AI 繪圖工作。完成仍缺圖只重試原抽選工作，公開失敗只重試公開。HTTP200 不是圖片完成；沿原 watermark、租約、穩定 ID 與有界退避防重。禁止付費 API或CLI替代內建生圖；本站操作只走原生工具，公開參考照片下載及本地檔案檢查可用。不改其他任務、23:05日記或23:30截止，不新增輪詢。成功、busy、already-drawn 安靜，僅失敗或需使用者介入才通知；不得輸出 callback、secret、ticket 或 lease。
