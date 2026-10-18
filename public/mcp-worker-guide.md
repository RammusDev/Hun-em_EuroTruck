# Hun-em 原生MCP發布（驗收通過後才切換每日排程）

不用Sites服務憑證，不寫連線程式，不使用HTTP／curl／生圖付費API。直接呼叫Hun-em外掛工具，平台處理認證。先hunem_prepare_publication，隔離驗收必須mode=pilot；每日正式工作才mode=live。只在action=generate時繼續，否則按原23:05／23:30流程處理，已刊立刻結束。sync-pending需再prepare追上時間。禁止平行製作；舊執行中斷才resume=true。session是伺服器工作識別，不是網站存取憑證，不可自行猜測。

input只完整讀一次，遵循完整角色、真實事件、背景來源、近期文章、級數與當次教材。四語同一事實與焦點；不捏造天氣、餐點、購物、對話或入館，不寫被監看／核對資料式自辯。角色全黑貓、黃色圍巾，維持原口吻及深度校對。

hunem_submit_writing：session、action=validate，draft僅title、zh與三語learning(text、grammar、grammarIds、words)，review需原九項真實自我校對、focus、eventIndices及sourceKeys。每語3至5個文中詞，繁中解析，指定文法與級數不變。valid=false只patch錯誤欄位；valid=true後action=write、同session，不需重傳整篇。確認written=true。hunem_publication_progress(includeContent=true)可取回候選／有效文章，避免重寫；完整程式檢查不能代替語言／事實校對。

先hunem_reference_art取得既有角色圖片；再依完成文章實際場景，以內建imagegen生成一張新構圖，參考前述圖片，必須全黑毛色黃色圍巾，沿用已確認hunem-reference-v2角色比例與圍巾末端藍白菱格盾及小金冠；不固定複製參考坐姿、背景，不強制加入汽水或手機。禁止舊圖複製／裁切／鏡像，不用付費API／CLI。生成後目視審查，再hunem_receive_illustration，使用工具原生file參數傳剛生成的原始PNG（由平台檔案適配器處理，不把base64送進提示、不自行編造download_url或file_id、不用HTTP替代）。review含tool="image_gen.imagegen"、actuallyCalled=true、originalGeneratedPath=實際工具輸出路徑，以及visualReview的blackFur、yellowScarf、newComposition均為真正檢查後的true。雜湊與原inputSha由伺服器處理。

attached=true後hunem_publish_journal，再hunem_publication_progress確認published、writingReady、imageReady及圖片雜湊。mode=pilot的成品只在隔離區，不能當作正式世界新增日記。重試要從已完成階段繼續，不能重寫有效文章或重畫已有有效圖片。

真實Europe/Berlin每天23:05，同次未完成才每5分鐘檢查到23:30；成功立即結束，不停用每日排程、不新增喚起。工具失敗呼叫hunem_record_publication_failure如實記錄；23:30不再製作，hunem_finish_without_image觸發原本無圖保底：有效AI稿優先、否則明示事件備用稿、無草稿不新增。整個AI環境額度中斷仍需下一次網站請求落實截止，此次未新增獨立伺服器排程。

沒有原生file參數或連線權限時必須如實回報，不能把手動Bearer上傳冒充純MCP成功。未完整驗收前保持原v2每日排程。
