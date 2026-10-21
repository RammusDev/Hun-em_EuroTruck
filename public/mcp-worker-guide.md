# Hun-em 原生MCP每日發布（compact-v3-direct-write）

生圖構圖規範（2026-10-21）：reference_art會一併提供最近兩幅已刊插圖，作為目視比較，不是姿勢模板。固定身份（全黑毛／黃圍巾／五官／身形），依文章重新設計動作與身體朝向、鏡頭、大小和位置，與近期畫作至少兩項明顯不同，包含姿勢／朝向或鏡頭；不能只換背景或鏡像。不要反覆使用抬頭三分之四正面、單前腳抬起、尾巴上翹的走姿。生成後實際並排比較，確認後review.visualReview除了blackFur、yellowScarf、newComposition，必須含recentArtCompared=true、poseViewVaried=true；未檢查或仍相似須重畫，不能直接填true。維持1:1滿版，不靠裁切或留白。

不用Sites服務憑證，不寫連線程式，不使用HTTP／curl／生圖付費API。直接呼叫Hun-em外掛工具，平台處理認證。先hunem_prepare_publication，隔離驗收必須mode=pilot；每日正式工作才mode=live。只在action=generate時繼續，否則按原23:05／23:30流程處理，已刊立刻結束。sync-pending需再prepare追上時間。禁止平行製作；舊執行中斷才resume=true。session是伺服器工作識別，不是網站存取憑證，不可自行猜測。

input只完整讀一次，遵循完整角色、真實事件、背景來源、近期文章、級數與當次教材。四語同一事實與焦點；不捏造天氣、餐點、購物、對話或入館，不寫被監看／核對資料式自辯。角色全黑貓、黃色圍巾，維持原口吻及深度校對。

自我校對後直接hunem_submit_writing(session、action=write)，不需先validate：write本身會完整驗證並保存。draft僅title、zh與三語learning(text、grammar、grammarIds、words)，review需九項真實校對、focus、eventIndices與sourceKeys。每語3至5個文中詞，一律用「word：繁中意思」（例如「truck：卡車」），禁止以|或｜分隔。文法ID與級數不變。valid=false只patch錯誤欄位後再次write，written=true才繼續。中斷才用progress(includeContent=true)取回文章，不重寫；程式驗證不代替語言與事實校對。

先hunem_reference_art取得既有角色圖片；再依完成文章實際場景，以內建imagegen生成一張新構圖，參考前述圖片，必須全黑毛色黃色圍巾，沿用已確認hunem-reference-v2角色比例與圍巾末端藍白菱格盾及小金冠；不固定複製參考坐姿、背景，不強制加入汽水或手機。禁止舊圖複製／裁切／鏡像，不用付費API／CLI。相簿尺寸基準為第一幅2026-10-18旅行速寫（1254×1254）：新圖固定1:1正方形PNG；解析度可依imagegen原生輸出，但寬高必須相同。採滿版場景，背景延伸至四邊，不加白色邊框、信箱式留白、額外紙張邊界或把小幅畫置於大畫布。角色仍依hunem-reference-v2；尺寸基準不代表複製第一幅的姿勢或場景。生成後目視審查，再hunem_receive_illustration，使用工具原生file參數傳剛生成的原始PNG（由平台檔案適配器處理，不把base64送進提示、不自行編造download_url或file_id、不用HTTP替代）。review含tool="image_gen.imagegen"、actuallyCalled=true、originalGeneratedPath=實際工具輸出路徑，以及visualReview的blackFur、yellowScarf、newComposition均為真正檢查後的true。雜湊與原inputSha由伺服器處理。

attached=true後hunem_publish_journal，再hunem_publication_progress確認published、writingReady、imageReady及圖片雜湊。mode=pilot的成品只在隔離區，不能當作正式世界新增日記。重試要從已完成階段繼續，不能重寫有效文章或重畫已有有效圖片。

真實Europe/Berlin每天23:05，同次未完成才每5分鐘檢查到23:30；成功立即結束，不停用每日排程、不新增喚起。工具失敗呼叫hunem_record_publication_failure如實記錄；23:30不再製作，hunem_finish_without_image觸發原本無圖保底：有效AI稿優先、否則明示事件備用稿、無草稿不新增。整個AI環境額度中斷仍需下一次網站請求落實截止，此次未新增獨立伺服器排程。

沒有原生file參數或連線權限時必須如實回報，不能把手動Bearer上傳冒充純MCP成功。圖片結果只顯示圖片或小型路徑摘要，禁止將image_url/base64放入text輸出。

input v3僅省去角色檔內操作／模板段落與近期外語／舊教材；所有創作角色內容、原序事件、來源與當日教材仍完整，原始封存不變。工具端自動保存階段耗時、資料量、失敗及修正次數；平台未提供的token欄位為null／unavailable，不是0，不以字數冒充。模型不需為計量增加呼叫、報表或重查紀錄。成功仍依原流程publish後progress確認即止。
