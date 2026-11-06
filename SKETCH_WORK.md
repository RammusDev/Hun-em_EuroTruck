# 三類事件作畫資料包

2026-11-06。本機實作；部署與雲端任務同步狀態以 HANDOFF 及 data/sketch-work-20261106/REPORT.md 為準。

## 正常流程

事件原有 ID → hunem_prepare_sketch(kind,id) → 程式核對已提交主體／既有圖片、取得原 D1 作畫 lease → 回傳精簡 subject、drawingPrompt、save 契約與可用原生參考圖 → AI 目視參考／構圖／imagegen／目視成品 → receive 原圖 → 程式檢查與保存 → 真實活動完成才公開。

`hunem_prepare_sketch` 合併原先模型端 queue、status、claim 的往返。主體依既有 committed 世界及 sketch-selection 持久資料投影，不另建第二份世界事實表。圖片／lease／投遞仍由現有 D1 表處理。缺 ID 時 SQL 取該類 sent 投遞，與已提交且未有圖的 selection 交集；恰一項才恢復，否則 identity_required，絕不取最新一項猜選。這個備援不是任意歷史補畫入口；明確 ID 的呼叫保留原 owner 工具的人工維修能力。

取得 lease 沿用現有條件 UPDATE；busy／already-drawn 不讀參考、不生圖。保存再核 lease 並以 INSERT OR IGNORE 防覆寫。AI 不接收全日事件、occurrences 歷史或其他候選。快取只讀且可選，失效不阻擋作畫；不恢復123前的強制下載／快取／回讀要求。

## 責任界線

- 程式：事件 ID／主體核對、租約、既有圖防重、汽水已審核 illustrationPackage、各類固定畫風模板、PNG解碼／正方形／透明及可見像素、原圖SHA／縮圖讀回、活動完成公開、監控與通知。
- AI：主體照片是否正確、缺少可用照片時的可靠原生參考取得、構圖、生圖、成品視覺辨識。receive review 的 true 僅能反映真實生成與目視。
- 平台環境：網站沒有可查 OpenAI executor 是否可用的介面，也無法替雲端任務啟動環境；本次不宣稱已實作平台環境預檢或修復平台事故。

保存步驟原已有格式驗證，本次移除三個任務提示內重複 shell 驗尺寸／透明度要求，沒有削弱服務端門檻。任務只需目視後原生提交，不要求先用 shell 開圖；是否能目視仍由平台工具能力決定。

## 失敗與相容性

不自動重送已受理通知、不新增Cron、不改23:05／23:30或GET純讀。失敗記錄沿原工具；保存失敗只續傳同張原圖。跨任務原圖持久續傳尚未實作，檔案若未交入網站且平台遺失，不能聲稱可自動恢復。舊 queue／claim／receive 工具保留相容，三個雲端任務需改用新 prepare 提示才會減少往返。

仍需自然事件驗收參考取得與端到端作畫；隔離測試不算正式生圖。字元／步驟減少不代表平台額度可同比量測。
