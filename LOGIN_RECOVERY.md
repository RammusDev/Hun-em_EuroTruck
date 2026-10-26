# 手機登入流程恢復（2026-10-26）

新登入頁在Google按鈕出現前，以同源POST prepare建立五分鐘流程，check確認HttpOnly Cookie能讀回。每個nonce使用各自的 `__Host-probe_flow_<UUID>` Cookie，避免另一分頁載入或成功登入清掉此頁流程。伺服器仍要求正確Origin、HMAC、期限、Cookie與Google簽章nonce精確綁定、D1一次性消耗；沒有接受Cookie缺少時只靠body token登入。已開啟的舊版本頁面沿舊Cookie路徑驗證，期限不延長。

前端一次只送一個callback，成功後忽略後續回呼。失效後最多自動重新準備一次，再由使用者重新選Google帳號；Cookie仍不可用則停在明確提示與重新登入按鈕，不做無限重載。新session內加入隨機loginId；verify與status各返回同一標記，前端確認讀回的是剛建立的新session才導航，不能讓既有舊session掩蓋新Cookie寫入失敗。標記不是session ID或登入票證，不參與授權。

失敗回應與結構日誌含flow_missing／flow_invalid／flow_expired／flow_used／verification_failed／login_unavailable及每次請求隨機requestId，不記錄Cookie、nonce、Google token、email或session ID。Cookie未回傳時只知缺少，不能推斷瀏覽器刪除或真逾時；D1 flow_used也包括不存在及DB期限到期，避免聲稱歷史原因已能完全還原。

回歸 `test/login-flow.test.mjs` 使用實際route、Cookie HMAC、SQLite與本機RS256簽章，涵蓋雙分頁、偽造／錯nonce、過期／缺Cookie、重複消耗／callback、Cookie封鎖前置阻擋、失效恢復及新session存取讀回。Google按鈕在VM測試中模擬，不等同真人Safari無痕登入驗收。重置nonce時依Google官方文件重設GIS設定：https://developers.google.com/identity/gsi/web/reference/js-reference#google.accounts.id.initialize 。

本改動不改讀者七天期限、管理者三十分鐘新鮮度、申請核准權限、世界資料或排程；沒有資料庫schema變更。
