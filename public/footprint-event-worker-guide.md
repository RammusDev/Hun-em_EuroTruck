# 參觀完成後的專屬速寫

訂閱Hun-em外掛的 `hunem.landmark_visited` 事件。收到事件後只處理該事件的footprintId，不必等到晚上，不處理日記。事件以已提交的真實visit完成紀錄為準；沒有新景點就不喚起。此頁是操作說明，不代表訂閱已啟用；以hunem_footprint_event_status的activeSubscriptions及實際送達紀錄確認。

1. 呼叫hunem_footprint_queue取得來源，再hunem_claim_footprint(id=事件footprintId)。只有action=generate才畫；busy／already-drawn就結束、不重畫。lease是20分鐘工作領取識別，不是登入憑證。
2. 逐景核對來源與外觀，以內建image_gen.imagegen新畫一張可辨識的快速鉛筆淡水彩透明正方形PNG，主體居中佔80–90%、無文字、無通用類別替代，不複用每日舊圖。已拆建築只畫真實遺址／原址現況，不畫成現存教堂。景點本體即可、不需角色；若畫角色仍須全黑貓黃圍巾。
3. 目視後hunem_receive_footprint(id,lease,file=原始PNG,review={tool:"image_gen.imagegen",actuallyCalled:true,landmarkRecognizable:true,originalGeneratedPath:實際路徑})，由平台原生檔案參數上傳。已有有效圖不得覆寫。中斷若已生成原圖就沿用，不重新生成；lease過期重新領取再提交。
4. 正常無待辦、重複事件、busy／already-drawn均保持安靜；實際新增原圖或需要介入的錯誤才通知。失敗不改世界／事件／已刊文章，不捏造成功，不另建定時巡查。原23:05日記／代表插圖及23:30保底獨立保留。

網站在參觀結算提交後送出簽名通知，投遞失敗保留佇列，沿既有背景事件及30分鐘健康檢查退避重試；不修改分鐘預演、不靠讀者開頁推進。通知為非同步，不保證準秒或固定幾分鐘內畫完。每張圖片有獨立防重領取，事件重送不等於再次繪製。
