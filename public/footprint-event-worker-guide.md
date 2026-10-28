# 景點：抽選預繪、參觀完成公開

hunem.landmark_visited保留為既有訂閱相容名稱，現在通知的是正式已確定參觀目的地的繪圖工作；它與payload的visitedAt計畫時間都不代表已完成參觀。優先讀data.footprintId。若平台觸發文字缺ID，讀hunem_footprint_event_status最新sent收據與hunem_footprint_queue：僅當收據footprintId與唯一候選id相同、可用的名稱／時間對得上已記錄抽選，才恢復該ID；不要要求已有visit或以visitedAt當完成證明。多筆、不符或無法核對就如實回報，不猜歷史項目。作畫不處理日記、不改世界，也不自行發布圖片。

1. hunem_footprint_queue純讀已確定抽選及來源，再hunem_claim_footprint(id=footprintId)。只有action=generate才畫；busy／already-drawn結束。lease有效20分鐘，提交時原樣帶回，不輸出憑證或lease。
2. 核對實景現況並目視可靠照片，將可用照片以referenced_image_paths交內建image_gen.imagegen。畫一張可辨識地標的快速斷續鉛筆線與淡水彩、正方形透明PNG；保留建築輪廓、比例、窗位與塔頂，不鏡像或改造立面，不套用通用教堂、不複用日記圖。已拆建築只畫可靠遺址／原址現況，缺可靠參考則保留待繪。
3. 依地標選自然視角與主體尺寸，不固定三分之四視角、置中或80–90%佔幅；可取得近期作品時目視比較。無文字，不需角色；若有角色仍為全黑貓黃圍巾。生成後實查正方形、透明通道及地標辨識度。
4. hunem_receive_footprint(id,lease,file=原始PNG,review={tool:"image_gen.imagegen",actuallyCalled:true,landmarkRecognizable:true,originalGeneratedPath:實際路徑})原生保存；真實作畫與目視完成才填true。成品先私存，服務端核對真實參觀完成後才公開原圖及縮圖；任務不自行開放直連。

已有有效圖沿用，不自動覆寫；中斷後保留生成原圖，lease過期重新領取後重送同圖。正常重複、busy／already-drawn保持安靜；實際收圖或需介入錯誤才回報，不捏造成功。

抽選通知沿原簽名回呼、D1租約、穩定事件ID及既有背景／健康檢查退避；完成參觀只處理公開，不再建立新繪圖工作。完成仍缺圖沿原抽選重試，公開失敗只重試公開。訂閱以hunem_footprint_event_status及實際收圖核對，HTTP接收不是繪圖完成。擁有者人工重送沿既有requestId與每日上限，不新增參觀或排程。原23:05日記與23:30截止獨立保留。
