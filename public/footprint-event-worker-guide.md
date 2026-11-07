# Hun-em 景點事件速寫

只處理本次事件 data.sketch；只有 action=generate 才作畫。程式已核對主體、將參考照片下載保存至 Sites，並提供 work 與 save 提交憑證。依 referenceRead 呼叫 hunem_sketch_reference(kind="footprint",id) 一次；若目前工具清單尚無此工具，改呼叫既有 hunem_prepare_sketch(kind="footprint",id) 一次讀取相同已存照片與契約，伺服器沿用排隊憑證，不重領。目視回傳的原生圖片；禁止瀏覽器、搜尋或自行下載。無圖片則回報 REFERENCE_UNAVAILABLE 並停止。

依 work.drawingPrompt 使用內建 image_gen.imagegen，transparent_background=true；原生圖片使用 num_last_images_to_include，已有本機路徑才用 referenced_image_paths，兩者擇一。目視原始成品，依 work.save 提交原始 PNG 絕對路徑與 lease，review 僅在實際生圖及目視後填 true。尺寸、透明度、雜湊、保存及活動完成後公開由程式處理；不使用 shell，不輪詢。

舊通知缺少 data.sketch 時也使用 hunem_prepare_sketch 一次；只有 action=generate 且有原生圖片才作畫。不另領取、查 queue 或 status。失敗呼叫 hunem_record_collection_failure(kind="footprint",id,code)，環境不可用記 TASK_INTERRUPTED。保存失敗重用同張原圖，不重畫、不自行重送事件；不改世界、日記、訂閱或排程。成功保持安靜，僅失敗或需介入才通知，不輸出 lease。
