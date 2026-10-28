# 收藏圖片完成、失敗與重試

時序只由 [SKETCH_LIFECYCLE.md](SKETCH_LIFECYCLE.md) 定義。本文件只說明健康狀態、保存驗證及維修，不新增完成後作畫流程。

## 完成與公開狀態

status=sent只代表通知HTTP受理。completion的complete代表已備好成品；publication另列private-ready或published。完成仍缺圖沿原抽選工作等待／重試；完成已有圖但讀回／發布失敗為awaiting_release，只重試公開，不重畫。
缺圖狀態包含drawing、reference_blocked、awaiting_image、awaiting_notification、attention_required；未收到模型回報不能臆測原因。新收圖必須讀回原PNG核SHA及JPEG縮圖才保存verifiedAt；舊圖明列legacy-image-record，不冒稱重新驗證。

## 有界重試

既有背景事件及30分鐘健康檢查沿同一已記錄抽選檢查通知／缺圖。受理後寬限依自動次數為30／60／120／240分鐘；有效20分鐘作畫租約、已有圖或可靠照片未備妥時不再通知作畫。最多3次自動重送，傳輸失敗沿同一穩定ID退避，原工作payload／watermark保留，每輪最多2通知；超上限需介入，不無限喚起或補送歷史。

hunem_record_collection_failure只接受REFERENCE_UNAVAILABLE、PACKAGING_UNCONFIRMED、IMAGE_GENERATION_FAILED、IMAGE_VALIDATION_FAILED、IMAGE_SAVE_FAILED。保存失敗保留原圖供同圖重試，不接受任意上游文字或來源網址。

## 參考修復與限制

官方來源有時雲端403，即使本機200也不代表雲端可用。快取與來源限制以 [COLLECTION_REFERENCES.md](COLLECTION_REFERENCES.md) 為準。擁有者hunem_cache_soda_reference僅可匯入已記錄合格產品、與目錄核對SHA完全相同的原始PNG；沿D1租約與1MiB限制。既有publication的collection-reference-import是同等驗證維修入口，不是任意照片、購買或成品上傳替代。

監控只顯示有界錯誤碼、逾期、缺參考或重試上限，沿原已授權通知設定；不改世界／角色／日記／排程。人工補圖與過去成功不保證自然來源永久可用，歷次驗證見根 [DOC_HISTORY.md](../DOC_HISTORY.md) 與對應data證據。
