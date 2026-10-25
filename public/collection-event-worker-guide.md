# 餐點與汽水事件速寫

只處理本次事件的kind與collectionId：hunem.meal_completed是已吃完且有來源的地方料理；hunem.soda_purchased是在實際購買時記錄汽水，不表示這瓶已喝完。兩者均以正式提交的事件為準，不改世界與日記，不新增定時工作。

1. hunem_collection_queue(kind,id=collectionId)讀來源，然後hunem_claim_collection(kind,id)。只有action=generate才作圖，busy/already-drawn直接結束。保存返回的20分鐘lease，不輸出lease或憑證。
2. 核對料理外觀或該品牌／口味的官方瓶罐照片，目視後以referenced_image_paths傳入內建image_gen.imagegen作視覺參考。每款一張獨立快速鉛筆淡水彩、正方形透明PNG。依實物選視角，少量淡彩／簡潔線條，不硬套固定構圖；不編造配料、瓶身或標籤。缺可靠照片就留待繪，不用通用食物／飲料圖代替。不需角色；如有角色必須全黑貓黃圍巾。
3. 實查PNG寬高相等、有透明背景且主體可見，目視確認種類及產品身份正確，再以hunem_receive_collection(kind,id,lease,file=實際原始PNG絕對路徑,review={tool:"image_gen.imagegen",actuallyCalled:true,subjectRecognizable:true,originalGeneratedPath:實際原圖路徑})原生file收圖。只有真實完成才填true。
4. 失敗重試沿用已完成原圖。lease過期重新領取；已有有效圖沿用，重吃／重買只累計次數，禁止自動換圖。正常busy／already-drawn安靜結束，實際收圖或需介入錯誤才回報。

訂閱只通知啟用後新發生的合格事件；歷史紀錄先顯示在收藏頁，部署不批次喚起歷史生圖。通知已送達但未成圖時，可由擁有者hunem_retry_collection_event(kind,id,requestId=固定UUID)重送既有事件，24小時最多3次，不新增餐次或購買。HTTP接收與原圖完成分開驗收。平台訂閱以hunem_collection_event_status確認，不能把接口發布當作任務已接通。
