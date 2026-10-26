# 手動景點定位修正

2026-10-26 使用者明確要求修正本次定位。San Nicola（Trentinara）的已保存 Wikipedia 座標誤指向 Pertosa 的 Santa Maria delle Grazie。正式讀回確認 topic `wikipedia:it:10527533`、footprint `3f02182d35594e7cc989c7b483ed4266`，原位置為經度15.448582／緯度40.543694。

依 Wikimedia Commons（San Nicola 類別的 Wikidata 定位）40°23′58.8″N、15°06′32.1″E，校正為經度15.108917／緯度40.399667；Trentinara 市政府確認教堂在該鎮 Piazza San Nicola。Pertosa 那筆保持原位。

- 定位來源：https://commons.wikimedia.org/wiki/Category:San_Nicola_(Trentinara)
- 身分／地址來源：https://www.comune.trentinara.sa.it/vivere_il_comune/luoghi/luogo_5.html
- 原錯值來源：https://it.wikipedia.org/wiki/Chiesa_di_San_Nicola_(Trentinara)

修正記錄在 `bridge/footprint-coordinate-corrections.mjs`。足跡讀取投影只有在 id、topicId、名稱、文章來源及原座標全部吻合時才套用；API 的 p 回正確位置，recordedP 與 coordinateCorrection 保留原值、來源及理由。列表、區域篩選、地圖分組與原生足跡讀取共用這個投影。若未來來源位置已變，守衛不覆寫；不是依名稱或空間近似套用。

歷史事件與封存、既有參觀時間、交通費、日記及圖片保持原樣，不補算這次旅程。這是針對已發生足跡的可追溯手動定位校正，不是整體地理資料校驗系統，也沒有修改未來旅程選點快取；未來來源驗證另行處理。無圖釘散開功能。
