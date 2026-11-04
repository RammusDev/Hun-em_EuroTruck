# 收藏圖片完成、失敗與重試

時序只由 [SKETCH_LIFECYCLE.md](SKETCH_LIFECYCLE.md) 定義。本文件只說明健康狀態、保存驗證及維修，不新增完成後作畫流程。

## 完成與公開狀態

status=sent只代表通知HTTP受理。completion的complete代表已備好成品；publication另列private-ready或published。完成仍缺圖沿原抽選工作等待／重試；完成已有圖但讀回／發布失敗為awaiting_release，只重試公開，不重畫。
缺圖狀態包含drawing、reference_blocked、awaiting_image、awaiting_notification、attention_required；未收到模型回報不能臆測原因。新收圖必須讀回原PNG核SHA及JPEG縮圖才保存verifiedAt；舊圖明列legacy-image-record，不冒稱重新驗證。

reference_blocked僅在任務明確回報REFERENCE_UNAVAILABLE或PACKAGING_UNCONFIRMED時成立；網站快取為空或舊下載器403不代表原生參考不可用，不能據此判失敗。成品保存不要求網站留有參考照片。

## 有界重試

2026-11-04：三類均停止受理後因缺圖而自動重送。30分鐘健康檢查只觀察／告警及重試已備圖的公開，不因沉默、鎖到期或失敗碼再次喚起AI。傳輸尚未受理保留同一穩定ID、最多8次有限退避；送前以項目層鎖防並發，已有成品、已領取或其他訂閱已受理則抑制。已知失敗記錄待介入；人工指定重送沿既有requestId及每日上限，同一requestId跨訂閱只受理一次，作畫鎖有效時不投遞。舊pending自動重送亦抑制。原生任務直接使用可靠參考，不等待網站快取；世界、活動完成門檻及日記排程不變。

hunem_record_collection_failure支援meal、soda及footprint；只接受REFERENCE_UNAVAILABLE、PACKAGING_UNCONFIRMED、IMAGE_GENERATION_FAILED、IMAGE_VALIDATION_FAILED、IMAGE_SAVE_FAILED、RATE_LIMITED、TASK_INTERRUPTED、FILE_TRANSFER_FAILED、CLAIM_EXPIRED。不存任意上游文字或來源網址。保存失敗在同次任務沿用原圖；跨任務原圖取回未實作。

bridge/sketch-progress.mjs在既有D1表保存領取、檔案接收／接收完成、保存與失敗觀測，最近12步及分階段累計。可選hunem_record_sketch_progress以有效lease回報reference_ready或image_generated；沒有回報則明示未知，不能以未回報判定未生成。收圖入口自動區分檔案傳入、驗證與儲存失敗。狀態GET純讀，已完成項目仍可讀回觀測；tokens與實際生成次數保留null，不由通知／工具次數推算。三類監控共用原通知設定。

新景點與餐點／汽水相同，收圖要求有效20分鐘lease，保存D1時再次核對；PNG需方形、有可見主體及全透明像素，原圖／縮圖讀回核對後才登記。既有圖片不重寫。

## 參考修復與限制

官方來源有時雲端403，即使本機200也不代表雲端可用。快取與來源限制以 [COLLECTION_REFERENCES.md](COLLECTION_REFERENCES.md) 為準。擁有者hunem_cache_soda_reference僅可匯入已記錄合格產品、與目錄核對SHA完全相同的原始PNG；沿D1租約與1MiB限制。既有publication的collection-reference-import是同等驗證維修入口，不是任意照片、購買或成品上傳替代。

監控只顯示有界錯誤碼、逾期、缺參考或重試上限，沿原已授權通知設定；不改世界／角色／日記／排程。人工補圖與過去成功不保證自然來源永久可用，歷次驗證見根 [DOC_HISTORY.md](../DOC_HISTORY.md) 與對應data證據。
