# 台灣慣用地名

2026-10-26：Google Maps JavaScript loader固定language=zh-TW、region=TW，不再依瀏覽器語言選擇。Google底圖名稱仍由Google管理，無法逐字覆寫；本站自訂城市名稱與寫作另使用共用主檔。

bridge/place-name-catalog.mjs由根assets/city-candidates.json生成，包含591城市／19國；以根scripts/update-taiwan-place-names.mjs重新同步，勿手改生成檔。原城市主檔已使用克羅埃西亞、拿坡里。browser-state依實體ID投影主檔中文名，不更動持久世界、座標、路線或既有日記。

bridge/taiwan-place-names.mjs共用名稱對照、當天相關地名寫作指引及已知異譯檢查。原生writingPacket加入規則，不修改原封存；國家全表與相關城市只作名稱對照，不能推定造訪。中文標題、正文、教材繁中解析／詞義採台灣慣稱；外語正文、例句、詞條保留該語言慣稱。未知景點保留原名，不自行音譯。

publication的validate/write針對尚未完成的寫作檢查已知中文異譯，回傳欄位及建議，不直接替換文章。已完成文章仍可重用，不改寫已刊日記。根publication-queue的新封存與publication-worker的新送稿亦接入；本次正式不重建引擎、不更新持久角色快照，避免混入其他引擎改動。正式規則來自閱讀包及送稿橋接。

已知異譯表是有限清單；主檔之外沒有可靠中文名的景點仍需寫作者查核，不宣稱能自動判定所有地名。Google底圖個別標籤仍待實際使用觀察。
