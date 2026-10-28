# Hun-em 景點事件速寫

僅處理既有「Hun-em 景點事件速寫」本次事件的一個 footprintId。維持原事件訂閱、啟用狀態、續訂與通知政策，不新增或重建排程。

唯一正常流程：目的地抽選確定時觸發私下繪圖，真實參觀完成後才由服務端公開。hunem.landmark_visited 是既有相容事件名稱，現在代表已確定目的地的繪圖通知；事件名稱及 payload.visitedAt 計畫時間都不是參觀完成證明。任務只存圖片，不自行發布、不改世界或日記。

1. 優先讀觸發事件、批次事件及 data.footprintId。若平台文字缺 ID，讀 hunem_footprint_event_status 最新 sent 收據及 hunem_footprint_queue：僅當收據 footprintId 與唯一候選 id 相同，且可用名稱／時間對得上已記錄抽選，才恢復 ID。不要求已有真實 visit、不以 visitedAt 當完成證明；多筆、不符或無法核對就如實回報，不猜歷史項目。先 hunem_footprint_queue 純讀對應工作與來源，再 hunem_claim_footprint(id=footprintId)，只有 action=generate 才畫；busy／already-drawn 安靜結束。保存20分鐘 lease，提交原樣帶回，不輸出 lease 或憑證。

2. 用hunem_footprint_queue(id=footprintId)讀取已保存的參考照片。參考照片交接規則（2026-10-28修正）：抽選後立即處理，不要求活動先完成。先讀該ID的queue；未領取才claim，已有有效lease直接沿用，僅action=generate繼續；busy／already-drawn安靜結束。取得20分鐘lease後先目視queue的原生參考圖片。有合格快取就沿用，不重新下載。沒有快取（含雲端403）時，不因準備器失敗直接結束：使用原生搜尋／瀏覽器取得並目視這個確切主體的可靠實物照片，將照片原始PNG／JPEG／WebP（最多1MiB，超限可另找合格小圖；不可改造包裝）用hunem_cache_sketch_reference(kind,id,lease,file,source={sourcePage,sourceImage,credit,license,visuallyMatched:true})原生file保存。只有實際目視一致才填true。工具若已有照片會保留既有圖；保存後重新讀該ID queue，使用返回的原生照片生圖。公開照片下載可用一般下載工具，但不能以HTTP／CLI代替本站原生認證、claim、存參考或收圖。找不到可靠參考才保留待繪並回報明確錯誤。不用參考照片冒充成品，不在完成時另畫。
kind固定footprint；參考必須對應該景點實際現況，保留輪廓、比例、窗位與塔頂，不鏡像或改造建築。已拆建築畫可靠現存遺址，不以舊照重建已不存在部分。

3. 每個景點一張快速現場鉛筆淡水彩、簡潔斷續線條、少量透明色塊、大量留白，正方形透明 PNG、無文字。避免逐片屋瓦、過細描繪及精密建築效果圖。依地標選自然視角、構圖重心與主體尺寸，不固定三分之四側面、置中或80–90%佔幅；可取得近期作品時目視比較，但不為求變化改造建築。不需角色；若有角色仍為全黑貓、黃色圍巾。

4. 實查原始 PNG 寬高相等、透明通道，目視現況與地標辨識度後，以 hunem_receive_footprint(id,lease,file=實際生成原始PNG絕對路徑,review={tool:"image_gen.imagegen",actuallyCalled:true,landmarkRecognizable:true,originalGeneratedPath:實際原圖絕對路徑}) 原生 file 保存；真正作畫與目視完成才填 true。成品先私存，服務端核對真實參觀完成後才公開原圖與縮圖，任務不自行開放直連。

已有有效圖沿用，不自動覆寫。中斷保留生成原圖，lease 過期重新領取後重送同圖，不重新生圖。參觀完成只觸發公開，不再建立第二份繪圖工作；完成仍缺圖沿原抽選工作重試，公開失敗只重試公開。沿既有簽名回呼、D1租約、穩定事件ID及有界退避防重；HTTP200 不是繪圖完成，以 hunem_footprint_event_status 及實際收圖核對。人工重送沿既有 requestId 與每日上限，不新增參觀或排程。禁止付費API或CLI替代內建生圖；本站操作只走原生工具，公開參考照片下載及本地檔案檢查可用。不改23:05日記或23:30截止，不新增輪詢。成功、重複、busy／already-drawn 安靜，失敗或需使用者介入才回報；不捏造成功，不輸出 callback、secret、ticket、權杖或 lease。
