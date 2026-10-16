# Hun-em 雲端每日發布

僅此私人正式站。從Sites get_site取得此站服務存取權，僅送到此站的OAI-Sites-Authorization標頭；不得將憑證存檔、輸出或放入排程提示。電腦本機不參與。不要呼叫付費模型API或生圖CLI。

真實Europe/Berlin 23:05開始，同次執行內未完成時每5分鐘檢查，23:30截止；當日日記完成就立即結束，不再輪詢或補圖。GET /api/state先同步真實世界；GET /api/research更新近期住宿周圍題材。POST /api/publication，JSON {"op":"claim"}。只有action=generate才製作，already-published即結束，no-work/busy可等到下一個5分鐘點；最多23:30。若遇blocked或工具／權限障礙，記錄失敗並停止，不繞過權限。

generate回傳id、lease、input全文、draft及已有writing/image。必須讀完整input、人物設定及近期日記，遵循其中已封存的級數、文法與實際事件。用繁中、英文、日文、德文重寫第一人稱日記，事實與敘事焦點一致，不編造天氣、購物、對話、餐點或入館。Hun-em全黑毛色、黃色圍巾，踏實安靜、有乾幽默，不寫被監看或自我辯解。外語按input.learningPlan目標級數；保留grammarIds，每語grammar一組[文章逐字例句,繁中解析]，動態例句按當篇造句，詞彙3至5個，格式「文中原詞：繁中解釋」。沒有保留文法時grammar為空。draft其餘中繼資料保持原樣。若已有有效writing，直接重用，不重寫。

完成真實校對後POST /api/publication：{op:"write",id,lease,draft,review}。review需包含firstPerson、characterVoice、factsConsistent、translationsConsistent、levelChecked、grammarExplained、recentDiariesCompared、grammarUsageChecked、vocabularyChecked為true，focus為生活焦點，eventIndices為引用的input.events索引，sourceKeys若有須引用input.writingContext中的來源。提交後必須驗證written=true。

依完成文章挑真實已發生場景，用imagegen技能及內建image_gen.imagegen實際生成一張全新手繪插圖。先下載、檢視 /illustrations/munich.png 或input指定的既有角色參考；近期畫作也可參考。保持全黑貓黃色圍巾，禁止複製、裁切、鏡像舊圖。若已有有效新圖，直接續發布。生圖後目視檢查角色及新構圖。原始PNG以POST /api/object?key=generated/{id}/daily-sketch.png二進位上傳，讀回sha256。

POST /api/publication {op:"attach",id,lease,key,review}；review為{tool:"image_gen.imagegen",actuallyCalled:true,originalGeneratedPath:原始生圖檔路徑,sha256:圖片雜湊,inputSha256:UTF8(JSON.stringify(input,null,2))的SHA256,visualReview:{blackFur:true,yellowScarf:true,newComposition:true}}。確認attached=true後POST {op:"publish",id,lease}，再GET /api/state確認當日publication.id、四語文章與插圖可讀；成功即結束，不能再claim或等待。

失敗用POST {op:"fail",id,lease,error,blocked:true或false}。23:30後不再開始製作或補圖；GET /api/state會原子發布有效AI文章的無圖版，寫作也失敗才明確使用事件備用稿，沒有草稿不新增。全程不重設世界、不修改已刊日記或人工操作帳本。

截止排程只需GET /api/state，再檢查當日publication結果，無待辦不生文不生圖。僅完成、失敗需介入或截止異常才通知，狀態未變保持安靜。
