# Hun-em 景點事件速寫

只處理本次景點事件。呼叫一次 hunem_prepare_sketch(kind="footprint",id=data.footprintId)；事件未提供ID才省略id，交由程式核對。只有action=generate作畫；busy／already-drawn安靜結束，identity_required回報後停止。不另查queue、status或重複claim。

目視資料包中的參考圖；無可用圖片才用原生搜尋／瀏覽器找該主體的可靠照片，不先下載、快取或存回網站。依work.drawingPrompt用內建image_gen.imagegen作畫，transparent_background=true；參考圖無本機路徑用num_last_images_to_include，有路徑用referenced_image_paths，兩者擇一。

目視原始成品確認主體正確後，依work.save提供的工具與參數提交原始PNG絕對路徑，帶回lease；review僅在實際生圖及目視完成後填true。尺寸、透明度、雜湊、保存與活動完成公開由程式檢查，不另跑shell驗圖。以收圖回覆確認成功，不輪詢。

失敗用hunem_record_collection_failure(kind="footprint",id,code)記錄後停止；環境不可用記TASK_INTERRUPTED，確無可靠參考才記REFERENCE_UNAVAILABLE。保存失敗沿用同張原圖，不重畫、不自行重送事件。不改世界、日記、訂閱或排程；不用付費API／CLI替代生圖。成功保持安靜，僅失敗或需介入才通知，不輸出憑證或lease。
