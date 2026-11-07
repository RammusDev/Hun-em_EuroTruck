# 參考照片：Sites保存與原生讀取

2026-11-07使用者指定的新流程，取代123／134「任務瀏覽、快取可選」的正常路徑。時序見SKETCH_LIFECYCLE.md，完整索引見SKETCH_WORK.md。

Sites server在正式選定後下載並保存照片，就緒才通知AI。hunem_sketch_reference(kind,id)只讀R2並核對格式／SHA，返回實際原生image blocks；不開來源網站、不要求本機下載器或瀏覽器。模型目視照片後直接交imagegen，缺照片回REFERENCE_UNAVAILABLE並停止。

三類每輪最多2項，沿原項目鎖及訂閱水位。照片失敗保存referencePending／安全錯誤碼並至少5分鐘起倍增退避（上限6小時，最多8次後停止並待人工處理），既有背景事件再嘗試；尚未通知AI，不新增Cron。queue／讀圖／讀者GET不下載或寫入。舊prepare相容入口可在伺服器準備照片，沒有照片回reference_pending。

景點使用精確Wikipedia文章與Wikimedia圖片；餐點使用Commons照片及已核對官方備援；汽水使用37款已核對品牌／口味圖鑑包裝。保留HTTPS主機白名單、manual redirects、1MiB及整輪8秒預算。汽水每輪最多3來源／單源6秒、已審SHA檢查；來源改動回REFERENCE_SOURCE_CHANGED，不繞過拒絕，不把圖鑑容器回填為實際購買容器。

R2 reference-photos/meal-v2、soda-v1及footprint-v1按主體ID保存照片bytes、來源／作者／權利與SHA。有效待繪照片保持重用，不因7天重抓；非待繪過期照片沿既有32件分頁清理。Webhook不嵌base64，只帶referenceRead及來源描述。

原PNG與縮圖實際讀回SHA／JPEG成功後才清除參考bytes，失敗保留供同圖存檔重試。reference-audit永久保留來源／權利／hash與清除原因，不留base64。既有擁有者匯入維修保留有效lease、來源及已審包裝SHA要求。已受理通知不自動重送AI，見COLLECTION_COMPLETION.md。
