# Hun-em｜作品集與履歷文案

依目前已實作及驗證的功能整理，適合全端、後端或AI應用開發職務。專案期間與個人資歷請依實際情況填寫。

## 履歷精簡版

**Hun-em 歐洲公路日記｜個人AI協作專案**  
TypeScript／JavaScript、React、Cloudflare Workers／Durable Objects／D1／R2、MCP

- 規劃並以AI協作開發持續運作的角色旅行網站，整合配送模擬、地圖足跡、四語日記、插圖與收藏，目的地資料涵蓋19國591城市。
- 設計持久事件排程與狀態結算流程，透過事件版本、租約與提交收據處理重送，並將網站讀取與世界推進分離。
- 串接MCP事件與生成式圖文工作流，實作圖片私下保存、驗證及活動完成後公開的兩階段流程，降低重複生成與提前曝光風險。
- 建立回歸與發布檢查流程；正式139發布前通過202項站內、191項共用與3項工具測試，並完成型別檢查及建置。

履歷版面有限時可保留前三點，將驗證細節放入作品集。

## 英文履歷版

**Hun-em — European Road Diary | Personal project developed with AI assistance**  
TypeScript, JavaScript, React, Cloudflare Workers, Durable Objects, D1, R2, MCP

- Designed and developed, with AI assistance, a persistent character travel application combining delivery simulation, map-based travel history, multilingual diaries, and illustrated collections across a destination catalog of 591 cities in 19 countries.
- Designed durable event scheduling and state settlement using version checks, leases, and commit receipts to handle retries, while keeping reader requests free of simulation writes.
- Integrated MCP-triggered content workflows with separate image preparation and publication stages, releasing collection artwork only after the corresponding activity was completed.
- Established regression and release checks; the documented production release passed 202 site tests, 191 shared tests, three tooling tests, type checking, and the application build.

## 作品集介紹

Hun-em是一個以角色日常為入口的持續運作網站。披著黃色圍巾的全黑貓在歐洲開卡車、休息與旅行，讀者可以透過地圖、四語日記和手帳收藏追蹤他的生活。

專案的核心挑戰是時間與資料一致性：沒有人開啟網站時，行程仍須接續；事件重送不能重複扣款或刊登；AI圖片即使提早完成，也必須等角色真正完成活動後才能公開。我以AI協作方式逐步建構事件排程、持久化、內容工作流與管理介面，並透過隔離測試和正式事件紀錄核對行為。

系統以Cloudflare Workers承接應用請求，Durable Objects保存事件投遞與鬧鐘，D1與R2保存狀態、收據及媒體。AI創作透過MCP工具與事件訂閱接入，依已封存事實生成繁中、英、日、德日記與插圖。世界模擬與內容生成各自有明確的提交、驗證及失敗處理流程。

這個專案讓我累積了從產品規則、狀態模型到故障診斷與發布驗證的實作經驗。例如，追查提交已成功但回應被清理工作阻擋的事件卡住問題、以實際請求比較定位Wikimedia 403，以及改善手機頁面更新與圖片傳輸負擔。

## 個人工作與AI協作揭露

請依實際參與情況採用以下描述：

> 我負責產品方向、角色與行為規則、需求取捨及驗收決策，並使用Codex／ChatGPT協作進行架構討論、程式實作、測試、除錯與文件整理。日記與插圖也使用生成式AI。面試時會以實際問題、設計選擇和驗證證據說明專案，而不將所有程式碼描述為獨立手寫。

## 60秒面試介紹

我做了一個叫Hun-em的角色旅行網站，一隻黑貓會在歐洲配送、旅行，累積四語日記和插圖收藏。我使用AI協作開發，主要關心的是讓整個產品能持續運作。

最有挑戰的是，行程不能依賴有人開網頁才推進，而且網路重送不能重複結算。我把讀取和世界寫入分開，用持久事件排程、版本檢查與提交收據接續行程。圖片則分成私下準備和活動完成後公開，避免把未來計畫當作已發生。

我也處理過正式環境事件卡住、圖片來源403和手機更新負擔，並建立測試與發布檢查。這個專案仍在持續維護，AI生成偶爾需要人工修復，也是我後續改善的重點。

## 展示準備與主張界線

- 網站有登入及人工核准限制；投遞前先確認面試官的展示方式，不描述成可匿名體驗的公開Demo。
- GitHub目前為私人倉庫，作品集連結本身不會授予招聘者存取權；分享方式需另行安排。
- 測試數字標明版本與日期；沒有使用者規模、營收、可用率或完整效能量測時，不加入這些主張。
- 591城市是目的地目錄；單張預覽縮小60%不能換寫成全站效能提升60%。
- 不宣稱完全自主、無需人工介入、跨服務原子交易或已完成災難復原演練。
