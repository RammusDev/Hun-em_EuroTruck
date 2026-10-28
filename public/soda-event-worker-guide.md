# Hun-em 汽水購買事件速寫

僅處理既有「Hun-em 汽水購買事件速寫」的 soda 事件。保留原事件訂閱、啟用狀態、續訂與通知政策，不新增或重建排程。

唯一正常流程：抽選確定時觸發私下繪圖，同一瓶汽水喝完時才由服務端公開成品。hunem.soda_purchased 是既有相容事件名稱，現在代表已確定抽選的繪圖通知；名稱不是同一瓶汽水喝完證明。任務只保存圖片，不自行發布、不改世界或日記。

1. 優先讀 data.kind 與 data.collectionId；kind 固定 soda，payload 明示其他 kind 就停止回報。先 hunem_collection_queue(kind="soda",id=collectionId) 純讀工作與快取參考。觸發文字缺 ID 時，讀 hunem_collection_event_status 的 soda 最新 sent 收據及 hunem_collection_queue(kind="soda")：只有收據 collectionId 與唯一候選 id 相同，且可用名稱／recordedAt 對得上已記錄抽選，才恢復 ID。不要要求先同一瓶汽水喝完；多筆、不符或無法核對就回報識別不足，不猜歷史項目，不批次補畫。

2. 參考照片交接規則（2026-10-28修正）：抽選後立即處理，不要求活動先完成。先讀該ID的queue；未領取才claim，已有有效lease直接沿用，僅action=generate繼續；busy／already-drawn安靜結束。取得20分鐘lease後先目視queue的原生參考圖片。有合格快取就沿用，不重新下載。沒有快取（含雲端403）時，不因準備器失敗直接結束：使用原生搜尋／瀏覽器取得並目視這個確切主體的可靠實物照片，將照片原始PNG／JPEG／WebP（最多1MiB，超限可另找合格小圖；不可改造包裝）用hunem_cache_sketch_reference(kind,id,lease,file,source={sourcePage,sourceImage,credit,license,visuallyMatched:true})原生file保存。只有實際目視一致才填true。工具若已有照片會保留既有圖；保存後重新讀該ID queue，使用返回的原生照片生圖。公開照片下載可用一般下載工具，但不能以HTTP／CLI代替本站原生認證、claim、存參考或收圖。找不到可靠參考才保留待繪並回報明確錯誤。不用參考照片冒充成品，不在完成時另畫。
汽水必須符合queue的illustrationPackage品牌／口味及已核對包裝來源SHA，原始位元組不得改造；工具會拒絕非已核對SHA。actualPurchasePackageKnown=false不代表缺少圖鑑參照，不另找相似產品或猜容量。

3. 沿用上一步取得的lease，不重複claim。使用內建 image_gen.imagegen，快速鉛筆淡水彩、正方形透明 PNG；依實物選自然視角，不編造瓶罐、標籤或包裝，不需角色。若有角色須全黑貓、黃色圍巾。

4. 實查原始 PNG 寬高相等、透明 alpha，目視主體可辨識後，hunem_receive_collection(kind="soda",id,lease,file=實際原始PNG絕對路徑,review={tool:"image_gen.imagegen",actuallyCalled:true,subjectRecognizable:true,originalGeneratedPath:實際原圖絕對路徑}) 原生收圖；只有真正完成才填 true。私存及讀回成功不代表已公開。既有有效圖沿用不覆寫；保存失敗保留原圖重送，lease 過期重新領取，不重新生圖。其他失敗沿 hunem_record_collection_failure 支援的有界錯誤碼回報。成功保存並驗證後由服務端清理參考位元組；失敗保留快取供既有重試。

同一瓶汽水喝完觸發器只公開已備妥成品，不建立第二份 AI 繪圖工作。完成仍缺圖只重試原抽選工作，公開失敗只重試公開。HTTP200 不是圖片完成；沿原 watermark、租約、穩定 ID 與有界退避防重。禁止付費 API或CLI替代內建生圖；本站操作只走原生工具，公開參考照片下載及本地檔案檢查可用。不改其他任務、23:05日記或23:30截止，不新增輪詢。成功、busy、already-drawn 安靜，僅失敗或需使用者介入才通知；不得輸出 callback、secret、ticket 或 lease。
