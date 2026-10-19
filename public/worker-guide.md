# Hun-em 雲端每日發布 v2

> 每日正式發布沿用原生 MCP prepare／submit／receive image／publish／progress，由本站固定平台擁有者身分驗證；既有唯一排程不變，無須 REST 票證。以下 worker-client 僅為維護通道：需先由原生 hunem_service_ticket 取得限本站5分鐘票證，並以隱藏 stdin 同時傳入 token 與 serviceTicket。票證只送 Cookie __Host-hunem_service；不得保存或輸出。

## 認證與固定工具
只操作本私人正式站，不依賴本機，不使用付費模型API或生圖CLI。Sites get_site的siwc_bypass_bearer_token只送本站的 OAI-Sites-Authorization: Bearer <token>；禁止Authorization、匿名試探、轉址或把憑證放檔案／參數／輸出。遇401/403最多重新get_site一次，仍失敗停止，不猜測。

用同一正確標頭下載本站 /worker-client.mjs 保存本次環境，再用 node worker-client.mjs、tty:true啟動。它關閉stdin回顯。先經隱藏stdin送 {"token":"當次憑證"}，ready:true後才逐個送JSON命令並等待結果。不要自行重寫curl／連線程式。Ctrl-C或{"cmd":"stop"}關閉。

## 同步與領取
{"cmd":"sync"}只回摘要。syncPending=true時繼續sync追上世界，不讀完整/api/state或/api/export。再{"cmd":"claim"}。generate時完整必要素材存hunem-work/input.json，僅印路徑。只完整讀一次此檔；原封存完整保留，AI輸入僅含完整角色、事件、景點背景、當次教材及近期四語參考。不要重複印全文或道路座標。
已刊立即結束；no-work/busy才等下一個5分鐘點。僅確認舊客戶端已中斷時用{"cmd":"claim","resume":true}續領，禁止平行製作。writingFile存在代表有效AI文章，讀它後直接生圖；imageReady=true則直接發布；candidateFile則讀取未完成候選並局部修正。原始封存雜湊由工具帶入attach，不可對精簡input重算。

## 寫作及驗證
遵循input.character、events、writingContext、recentDiaries、learningPlan及writingPolicy。四語自述日記維持同一天事實與焦點，級數依learningPlan（目前英文A2、日文N3、德語A1）；角色全黑貓黃圍巾、踏實安靜乾幽默。不捏造天氣、購物、對話、餐點或入館；背景不冒充參訪，不寫資料核對或自我辯解。保留深度校對，不為省token犧牲品質。

保存candidate.json：
{"draft":{"title":"…","zh":"…","learning":{"en":{"text":"…","grammar":[["文章逐字例句","繁中解析"]],"grammarIds":["指定ID"],"words":["文中原詞：繁中解釋"]},"de":{},"ja":{}}},"review":{}}
三語都需完整text、grammar、grammarIds及3至5個文中詞彙；無指定文法時grammar空。只提交這些內容欄位，不重建備用稿及中繼資料。真正自我校對後review含firstPerson、characterVoice、factsConsistent、translationsConsistent、levelChecked、grammarExplained、recentDiariesCompared、grammarUsageChecked、vocabularyChecked為true，focus為生活焦點，eventIndices為input.events原索引，sourceKeys為writingContext頂層鍵。

{"cmd":"validate","file":"candidate.json"}。valid:false只依errors／fields修正，保存如{"patch":{"learning":{"de":{"words":["…"]}}},"review":{}}至patch.json，再{"cmd":"patch","file":"patch.json"}。伺服器保留其他欄位，不重傳整篇。valid:true後建立內容{}的empty.json，用{"cmd":"write","file":"empty.json"}正式完成；必須written:true，validate不是write。程式檢查不能取代語言、事實、級數校對。

## 圖片與發布
完成文章後才依實際場景用imagegen技能與內建image_gen.imagegen生一張全新手繪。先{"cmd":"download","path":"/illustrations/munich.png","file":"reference.png"}並目視參考角色及必要近期畫作。全黑毛色黃色圍巾、不加白斑，禁止複製裁切鏡像舊圖。目視新圖後{"cmd":"upload","file":"實際原始PNG路徑"}，不重新編碼。
image-review.json含tool:"image_gen.imagegen",actuallyCalled:true,originalGeneratedPath:實際路徑,sha256:upload雜湊,visualReview:{blackFur:true,yellowScarf:true,newComposition:true}。
{"cmd":"attach","file":"image-review.json"}成功後{"cmd":"publish"}，再{"cmd":"verify"}核對當天published、id、四語languages及新圖路徑；必要時下載已刊PNG確認可讀，不印完整世界與全文。成功立刻stop，不等待、不再claim或重畫。不改已刊文章，不重設世界、不人工改帳本。

## 截止、失敗與度量
真實Europe/Berlin 23:05開始，同次未完成才每5分鐘檢查至23:30，不另設23:30喚起。GET有限重試；寫入逾時先查狀態、續領，不盲目重做。{"cmd":"fail","error":"遮罩原因","blocked":true或false}記錄障礙，不繞過權限；站仍可連時同次等23:30送sync觸發無圖保底，有效AI稿優先，寫作失敗才明示事件備用稿，無草稿不新增，當日不補圖。整次AI額度中斷仍需下次網站請求觸發截止。
verify附metrics（位元組、請求／驗證失敗數、階段時間、總耗時）；每次工具另回clientElapsedMs，不代表精確token帳單。僅完成、失敗需介入或截止異常才通知，狀態未變保持安靜。
