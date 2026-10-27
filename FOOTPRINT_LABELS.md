# 景點名稱與所在地

2026-10-27：使用者要求景點卡片第一行只顯示景點名，第二行城鎮-地區-國家，每頁四張。桌面／手機均兩欄、每頁四張（不足四筆依實際數量），點單一地圖圖釘仍只開該筆。12筆API批次、快取、歷次參觀紀錄、鍵盤／滑動翻頁及固定底部導覽保留。

新增bridge/footprint-labels.mjs唯讀投影，輸出displayName、locationLabel、locality；原name、id、topicId、cityId、p、visits、圖片及原始事件不改。只有確認括號為該城鎮時移到第二行，保留其他有意義括號。不在圖片加文字或重畫。Google／Leaflet群組及102取消散開行為保留。

來源：bridge/footprint-localities.mjs含23筆現存景點的來源網址及顯示用所在地，另從591城市目錄建立名稱／地區／國家表。資料由根scripts/build-footprint-localities.mjs生成，少數目錄英文區域名轉為當地名，國家採當地稱呼。Flensburg使用Schleswig-Holstein，不使用NRW。條目引用各自原source，需名稱及source匹配；原始來源網址作追溯。Guxhagen、Harrislee、Oeversee、Großenwiehe、Wallsbüll、Bruckhäusl、Wörgl、Angath及Pertosa／Trentinara採景點所在地，不把原行程de-kassel／de-flensburg／at-kufstein／it-potenza誤當實際城鎮。這是顯示資料補充，不是歷史行程或座標校正。

後續新景點：已知目錄城鎮的括號地名或同topic／source的既有研究cityEvidence可提供顯示名稱；不能因只有行程cityId就推定景點所在地，無資料顯示「城鎮待確認-地區待確認-國家待確認」，保留原題名。未增加網路研究、state補算、Cron、AI喚起或跨來源自動地理一致性校驗。

測試34項涵蓋23現存景點、原資料不變、錯誤行程城市不沿用、括號拆分、未知資料及來源守衛、兩行文字節點、桌面／手機四張、12筆批次與最後不足頁、Google／Leaflet群組及座標校正。tsc及build另驗。隔離fixture採真實舊圖片及讀回metadata，只供版面測試，不新增正式事件或圖片；390px iframe與翻頁目視完成，證據在根data/footprint-labels-20261027/。
