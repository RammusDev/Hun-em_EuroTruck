# 餐點與汽水：抽選預繪、完成公開

只處理本次事件的kind與collectionId。hunem.meal_completed／hunem.soda_purchased保留為既有訂閱相容名稱，現在都表示正式已確定抽選的繪圖通知；名稱不是吃完、購買或喝完的完成證明。餐點吃完、汽水同瓶喝完才由服務端公開，作畫任務只保存成品，不自行發布或改世界／日記。

1. 優先讀事件data.kind與data.collectionId，再hunem_collection_queue(kind,id=collectionId)純讀工作及快取參考。若平台觸發文字缺ID，讀hunem_collection_event_status該kind的最新sent收據及hunem_collection_queue(kind)：僅當收據collectionId與唯一候選id相同、可用的名稱／recordedAt對得上其已記錄抽選，才恢復該ID；不以吃完時間、購買完成或喝完作預繪資格。多筆、不符或無法核對就回報識別資料不足，不猜歷史項目。再hunem_claim_collection(kind,id)，只有action=generate才畫；busy／already-drawn結束。保存20分鐘lease，不輸出lease或憑證。
2. 目視快取的料理外觀或已核對品牌／口味包裝。有快取直接沿用，不重新下載。無快取（含雲端403）時由本次原生任務取得並目視可靠實物照片；用hunem_cache_sketch_reference(kind,id,lease,file=原始參考照片,source={sourcePage,sourceImage,credit,license,visuallyMatched:true})保存後重讀該ID queue，使用返回的原生圖片。PNG／JPEG／WebP最多1MiB；汽水必須完全符合既有目錄的來源SHA，不以相似包裝替代。來源仍不可用才回報待繪，不因雲端準備器失敗直接停止。每款用內建imagegen畫快速鉛筆淡水彩、正方形透明PNG，不編造配料、瓶罐或標籤；依實物選視角，不硬套構圖；不需角色，如有角色仍須全黑貓黃圍巾。
3. 實查寬高相等、透明背景與主體身份，目視後hunem_receive_collection(kind,id,lease,file=原始PNG,review={tool:"image_gen.imagegen",actuallyCalled:true,subjectRecognizable:true,originalGeneratedPath:實際原圖路徑})原生收圖；只有真實完成才填true。保存、讀回驗證與私下備妥不代表已公開。
4. 參考、生成、驗證或保存失敗，沿hunem_record_collection_failure支援的有界錯誤碼回報；已生成原圖保留供同圖保存重試，lease過期重新領取，不重新作畫。正常busy／already-drawn保持安靜，實際收圖或需介入錯誤才回報。

抽選確定與活動完成是兩個獨立觸發點：完成事件只公開備妥成品，不建立另一份AI繪圖工作。完成仍缺圖只重試原抽選工作，公開讀回失敗只重試公開；不新增定時工作、重算餐次或購買。

通知HTTP200不代表圖片完成。訂閱／投遞／成品狀態由hunem_collection_event_status核對，沿既有watermark、租約、受限重試及穩定ID防重；不自動批次補畫歷史。擁有者明確維修可重送既有工作，不新增事件。
