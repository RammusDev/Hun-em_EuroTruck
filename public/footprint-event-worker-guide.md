# 參觀完成後的專屬速寫

訂閱Hun-em外掛的 `hunem.landmark_visited` 事件。收到事件後只處理該事件的footprintId，不必等到晚上，不處理日記。事件以已提交的真實visit完成紀錄為準；沒有新景點就不喚起。此頁是操作說明，不代表訂閱已啟用；以hunem_footprint_event_status的activeSubscriptions及實際送達紀錄確認。

1. 呼叫hunem_footprint_queue取得來源，再hunem_claim_footprint(id=事件footprintId)。只有action=generate才畫；busy／already-drawn就結束、不重畫。lease是20分鐘工作領取識別，不是登入憑證。
2. 逐景核對現況與實景照片，目視照片後將可用照片以referenced_image_paths傳入內建image_gen.imagegen，作為建築輪廓、比例、窗位與塔頂的視覺參考，不能只讀文字套用通用教堂。以簡潔斷續鉛筆線與少量透明淡彩畫一張快速現場速寫，避免精密建築效果圖。依實景最有辨識度的角度選正面、側面或斜視角，不固定三分之四側面、置中或80–90%佔幅；保留完整主體及適量透明邊距，不鏡像或為求變化改造立面。盡可能目視比較最近景點圖，避免固定構圖。正方形透明PNG、無文字、無通用類別替代，不複用每日舊圖；生成後實際核對寬高與透明通道，不符合就修正再收圖。已拆建築只畫真實遺址／原址現況；無法可靠核對或取得實景參考則保留待繪並如實回報。景點本體即可、不需角色；若畫角色仍須全黑貓黃圍巾。
3. 目視後hunem_receive_footprint(id,lease,file=原始PNG,review={tool:"image_gen.imagegen",actuallyCalled:true,landmarkRecognizable:true,originalGeneratedPath:實際路徑})，由平台原生檔案參數上傳。已有有效圖不得覆寫。中斷若已生成原圖就沿用，不重新生成；lease過期重新領取再提交。
4. 正常無待辦、重複事件、busy／already-drawn均保持安靜；實際新增原圖或需要介入的錯誤才通知。失敗不改世界／事件／已刊文章，不捏造成功，不另建定時巡查。原23:05日記／代表插圖及23:30保底獨立保留。

網站在參觀結算提交後送出簽名通知，投遞失敗保留佇列，沿既有背景事件及30分鐘健康檢查退避重試；不修改分鐘預演、不靠讀者開頁推進。通知為非同步，不保證準秒或固定幾分鐘內畫完。每張圖片有獨立防重領取，事件重送不等於再次繪製。

若平台已接收通知但執行沒有產圖，擁有者可用hunem_retry_footprint_event(id,requestId=固定UUID)重送該筆真實參觀，讓原事件任務重試。相同requestId不重複喚起；已畫好的景點略過，每景點每天最多3次人工重送。只重送既有已訪待繪資料，不建立新參觀或新排程。HTTP接收成功仍不等於圖片已保存，需讀回足跡原圖確認。
