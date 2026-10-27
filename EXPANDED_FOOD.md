# 十九國汽水與料理涵蓋修正

2026-10-27，以正式105 source ba7fefea9c89ac374bc2f4474ed15da5add36d35為基準。

汽水bundle更新至v3／37款／19國，原26款保留；新增9國11款，含義大利3款。產品／市場證據與原產國區分見根目錄`data/soda-food-20261027/soda-sources.json`。

料理增加英／當地語區域來源、義文A tavola等章節、Basilicate→Basilicata及其他義大利區域頁名。改善破折號列表、括號別名與直接描述；排除酒類子章節、餐館／購物中心／城市／國籍／泛稱及句子片段。已知其他城市的redirect不當作本城料理。

城市／區域合格菜不足才用同國country來源供午晚餐選擇；country菜cityId=null且依國家收藏去重，新封存寫作規則保留國家層級。LI官方Ribel食譜為明列來源的參照補充。一般早餐、30公里範圍、渡輪／搭機不冒用停車城市、付款防重與完成後才進入日記維持。

scanVersion4／policy food-v7讓既有研究事件自然更新舊負快取；不從GET補算、不強制重建已定eventPlan、不改過去餐次／汽水／角色／日記／圖片／訂閱／唯一23:05排程。bundle清單載入不受hydrate舊持久v2覆蓋，編譯core隔離測試已確認。

`scripts/patch-expanded-food-core.mjs`只替換已審閱的food-research／local-meals／dish-identity／local-topics／topic-research／publication-queue及兩個虛擬資產；其他部署模組逐塊保持原樣，避免根目錄整包重建覆蓋現行引擎。

驗證包含根目錄完整回歸、編譯core與收藏、餐次防重、權限純讀、TypeScript及正式build；實際唯讀來源驗證義大利兩地及其餘新增8國各一城。詳細結果及既有未修改測試限制記於交接。完整證據保留根`data/soda-food-20261027/`，不在部署包保存世界快照、憑證或外部HTML查詢快取。
