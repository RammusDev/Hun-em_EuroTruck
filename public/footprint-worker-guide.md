# 永久足跡速寫

此功能是獨立於每日相簿的景點原圖紀錄。造訪以原世界及封存的 visit 事件完成時間為準，不把未來計畫當成已參觀。同景點永久保留一張專屬圖，每次重訪的精確時間另存；不在午夜或08:00清除。

景點速寫優先由參觀完成事件觸發，詳/footprint-event-worker-guide.md；不重啟本機或舊五時段。原23:05仍只負責日記及代表插圖。日記完成後先hunem_footprint_event_status：activeSubscriptions>0時結束，不在晚間批次作圖；若為0，保留原23:30前最多8張的補位流程直到事件訂閱接通，避免未啟用就失去原有作圖能力。事件接口上線不代表已啟用，必須確認訂閱、投遞及雲端實際回應。足跡失敗不能改寫日記或延遲其截止。

呼叫 hunem_footprint_queue（純讀、不推進世界），只畫回傳的真實已訪景點；同次最多讀取一次佇列。逐項核對來源與實際建築／地標照片，用內建 image_gen.imagegen 每景點生成一張獨立原始PNG，不用付費API/CLI、不拼貼／裁切舊日記圖、不用一張通用教堂替代所有教堂。素描鉛筆與淡水彩、1:1正方形透明背景、主體居中填滿約80–90%畫面、少細節但有該景點特徵，無文字，不需畫角色。若畫角色仍須全黑貓黃圍巾。

每張在生成前必須hunem_claim_footprint(id)，只有action=generate才畫，busy／already-drawn即略過。目視核對原圖後呼叫 hunem_receive_footprint(id,lease=領取返回值,file=工具輸出原始PNG,review={tool:"image_gen.imagegen",actuallyCalled:true,landmarkRecognizable:true,originalGeneratedPath:實際路徑})。file為原生平台檔案參數，不輸出base64、不編造download_url/file_id。系統存原圖與128px地圖JPEG縮圖；同雜湊重送重用，不同內容不得覆寫已有圖。新圖只屬於足跡，不改日記或相簿。未完成項保持待繪製，隔日接續；不得憑空補造參觀事件。僅完成或需介入錯誤通知，無變化保持安靜。
