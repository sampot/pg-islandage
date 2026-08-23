# 島鏈紀元（`pg-islandage`）— 遊戲規劃文檔

> **用途：** 本 repo 的遊戲權威規格——coding agent 改動前必讀：這個遊戲是什麼、規則、設計限制、優化方向。
> **整理方式：** 從本 repo 實作反向整理（2026-08-23）。**改玩法先改此檔再改碼**；本檔與程式碼衝突時，以「規則（§3）」描述的設計意圖為準回報差異。
> **上游契約：** [PG-GAME-AGENT-GUIDE.md](https://github.com/sampot/playgrounds/blob/main/docs/PG-GAME-AGENT-GUIDE.md)（唯一必讀；本檔不重複其全文）· 型錄條目 `playgrounds/catalog/entries/pg-islandage.yaml`

## 1. 一句話

7×5 迷霧群島上的輕量 4X：探索／擴張／開發／征服四模式輪轉，行動點與糧木金艦四資源的經濟取捨，35 回合內稱霸 55% 島嶼或擊陷敵都。

## 2. 定案速覽（待上架驗收）

| 項 | 值 |
| --- | --- |
| catalog id / kind / series | `pg-islandage` / `game` / `策略` |
| status | `unlisted`（型錄未上架） |
| 模式 | 單人 vs AI（型錄標榜多小時一局的長線對局）；seed 決定地圖，無中途續局 |
| 地圖 | 7×5＝35 格；島嶼生成機率 0.44；玩家左下角 vs AI 右上角，各帶王都 |
| 勝負 | 稱霸 55% 島嶼／敵都淪陷／35 回合分數領先；王都淪陷或落後即敗（平分判敗） |
| 行動經濟 | 每回合 AP 4；探索 1／殖民 2／建造 1／募船 1／出征 2 |
| 素材 | Kenney 圖示與音效＋BLIPPY BITS 循環樂（CC0 為主）；HTML 格子按鈕非 canvas |
| 交付形 | 純 HTML＋CSS＋ESM JS；無 build；`npx vitest run` 測試 |

## 3. 完整規則（現行實作）

### 3.1 資源、成本與建築鏈

- 起始資源：玩家 糧10/木8/金3/艦2；AI 糧8/木8/金3/艦2。回合結束按建築產出結算。
- 殖民消耗 木3+糧2；募船 木2+金1。建築鏈 `BUILD_ORDER`＝農場→港口→船塢→要塞，**島上須已有建築才能升級**（新殖民地先給營地），同種不可重複蓋（後蓋直接取代前一棟）：

| 建築 | 成本 | 產出 | 其他 |
| --- | --- | --- | --- |
| 營地 camp | — | 糧 +1 | 初始／殖民地預設 |
| 農場 farm | 木4 | 糧 +3 | — |
| 港口 port | 木6 糧2 | 金 +2 | — |
| 船塢 shipyard | 木8 金2 | — | 解鎖募船 |
| 要塞 fortress | 木10 金4 | — | 駐軍 +2 |

### 3.2 四模式規則

- **探索**（1AP，+2 分）：目標霧格須緊鄰「已偵察且屬玩家或海域」的格子；揭開後若為島即可成為後續目標。
- **擴張**（2AP，+12 分）：已偵察的中立島、相鄰己方領土、付木3糧2；落地為營地＋駐軍1。
- **開發**（1AP，+8 分）：己方島嶼選單列出 `availableBuildings`（付得起且合法者）；募船需該島有船塢（+4 分）。
- **征服**（2AP）：目標 AI 島、相鄰己方相鄰己方領土、艦隊 >0。戰力＝攻方艦數 vs 守方駐軍＋建築加成（要塞 3／營地 1），各加 0–3 隨機；**嚴格大於才勝**。勝：島易手、駐軍＝`floor(艦隊/2)` 至少 1、艦 −1、要塞降級塞降級營地、佔敵都 +40 分否則 +18（王都旗同時拔除）。敗：艦 −2。
- 回合結束順序：雙方生產入庫並計分（玩家分 += 糧+木×2+金×3）→ AI 行動一次 → 回合 +1、AP 重置 → 勝負判定。

### 3.3 勝負判定（優先序）

王都淪陷即敗 → 敵都淪陷即勝（+60 分）→ 任一方掌控 ≥55% 島嶼（勝 +40）→ 第 35 回合比分；**平分視為落敗**。

### 3.4 AI 行為（每回合恰一個動作）

優先序：**出征**（有艦且有相鄰可打的我方島；目標取「弱者優先」——王都 +100、駐軍、要塞 +5 計分後升冪取最小）→ 未達稱霸線則**殖民**（候選隨機 seeded 抽一）→ **建造**（第一座己島依 BUILD_ORDER 蓋第一個買得起的；有船塢則改募船）→ 都不行才**探索**（邊界霧格隨機）。AI 的探索/殖民隨機皆走 `seeded(seed, turn, salt)` 純雜湊，同一 seed 全程可重放。

### 3.5 已知實作怪癖（改動前必讀）

- `conquerTile`／`aiAttack` 的 rng 是純雜湊閉包，攻守兩次呼叫取得**同一個** 0–3 加值——運氣互相抵消，實質只剩「平手偏防守方」。修正時須同步測試。
- 敵方 AI 不受 AP 限制概念（每回合一動作）、不探索迷霧以外的資訊差；玩家看得到 AI 島駐軍但看不到 AI 資源與艦數。
- 平局判敗是有意設計（鼓勵進攻），文案已明示。

## 4. 操作與畫面

| 輸入 | 動作 |
| --- | --- |
| 模式列 探索/擴張/開發/征服 | 切換當下行動（aria-pressed 高亮） |
| 點地圖格 | 執行當前模式動作；開發模式下改為選中島嶼 |
| 開發面板 | 列出可建築（含成本）與募船按鈕 |
| 結束回合 | 生產＋AI 行動＋換手 |
| 再開一局 | 結算覆蓋層重開（新 seed）；非破壞性免確認 |

- HUD：回合 x/35、AP、雙方分數、我方島數、稱霸門檻。資源列以 Kenney 圖示顯示糧木金艦。地圖為 CSS grid 按鈕：霧=雲、水=波紋、島依陣營配色，建築圖示、都字章、駐軍數直接疊在格子上。
- 訊息以 toast／msg 行呈現非法操作原因（如資源不足）；KV 寫入失敗也用 toast 告知但遊戲可繼續。禁 `alert`／`confirm`／`prompt`。Mobile-first 單欄；頁面隱藏時暫停音訊。

## 5. 持久化（KV 權威）

| key | 內容 | 讀寫時機 |
| --- | --- | --- |
| `islandage:progress`（`PG.kv`） | `{ best, wins, plays, updatedAt, last:{score,outcome,turn} }` | 啟動等 `PG.ready` 後讀；終局 render 時 `mergeProgress` 後 PUT |

- 合併規則：best 取最大；wins 只在 won +1；plays 在任何終局 +1；last 記最近一局。失敗回呼觸發 toast，不阻斷遊玩。
- **沒有局內存檔**：重載即棄局，只留跨局戰績。localStorage 完全未用。

## 6. 美術／音效／署名

- 圖示 `assets/icons/*.png`（food/wood/gold/fleet/camp/port/fortress）＝Kenney Board Game Icons（CC0）。`assets/images/`（hero/rival/emblem/die）打包於 manifest，程式碼未引用（保留備用）。
- 音效 click/turn/win/lose 出自 Kenney Interface Sounds；explore/build/battle/hit 等出自 Kenney RPG Audio（CC0）。背景循環 `music.ogg`＝Dylann Taylor《BLIPPY BITS (Dew)》（授權見 pack License.txt，itch 發佈）。
- 音訊由共用 `audio.js`（GameAudio）管理：SFX 預載 decode、音樂 loop gain 0.2、頁面 hidden 自動 suspend/resume。逐項來源見 `ATTRIBUTION.md` 與 `assets/licenses/`；新增素材同步 manifest。

## 7. 測試（`npx vitest run`）

現有覆蓋（`game.test.js` 32 例）：createGame 同 seed 決定性、王都佈局、起始資源；島數/稱霸比例計算、seeded RNG 一致性；探索成功扣 AP 加分、不相鄰霧格拒絕；殖民成功與資源不足拒絕；農場建造、availableBuildings、船塢募船；resolveBattle 攻守強弱判定、鄰接+艦隊的征服流程；回合生產、endTurn 換手與 AP 重置、AI 行動後 aiScore 增長；五種勝負分支（稱霸/王都淪陷/敵都陷落/限時領先/限時落後）；模式切換不可變性、applyAction 路由與非法 action 安全忽略、getLegalActions；summarize；常數（35 格/門檻/建築表）；persist merge 的 best/wins/plays 累計。

改動規則/AI/合併契約必補對應邊界測試；`app.js` DOM 不在測試範圍。

## 8. 硬約束（不可違反）

1. 僅 HTML＋CSS＋JS（ESM）；**無 build**、不入庫 `node_modules`、不安套件；工具一律 `npx <pkg>` 臨時執行。
2. 禁瀏覽器原生 `alert`／`confirm`／`prompt`；提示一律 msg/toast/覆蓋層。
3. Mobile-first：CSS grid 地圖單欄自適應；主操作不可 hover-only。
4. 戰績唯一權威是 `PG.kv`（key 見 §5）；禁止裸 localStorage 當權威。
5. 不自行載入 `sdk.js`；boot 等 `window.PG.ready` 再存 `PG.kv`（app.js 現行模式）。
6. `game.js` 保持無 DOM 純邏輯、structuredClone 不可變更新；所有隨機走 `seeded()` 保持同 seed 可重放。
7. 改動可執行邏輯前先寫失敗測試（TDD）。
8. 檔案清單變動須同步 `sam-manifest.json`；新增素材附 `ATTRIBUTION.md` 與授權檔。

## 9. 優化建議（可玩性與樂趣）

依優先級；實作前先在此登記並補測試。原則：強化 4X 的情報決策與局勢感，不改變「四模式輪轉的小品 4X」核心認同。

**高優先**

1. **局內續戰**：35 回合一局卻無中途存檔，誤關即棄。仿 deepcatacomb 把全量 state 塞 `progress.run`（PG.kv 同一 key 內），啟動提供「續戰第 N 回合」，成本極低收益大。
2. **戰鬥骰運修正＋戰力預覽**：修掉攻守同值的假隨機（序列式 roll 各抽各的），征服前顯示「我方艦 X vs 駐軍 Y＋加成 Z」與勝率估算——讓出征從賭博變決策。
3. **敵情透明化**：AI 資源/艦隊完全隱藏使後期像黑箱。偵察過的敵島顯示駐軍外另給「估計艦隊規模」區間，支撐「先築壘還是先爆艦」的博弈。

**中優先**

4. **AI 多步回合**：現行一回合僅一動作且短路式優先序，後期被動挨打。讓 AI 依剩餘資源連續行動（如殖民＋建造），或給它類似玩家的 4AP，補齊對抗強度。
5. **難度與地圖變體**：單一 7×5 尺寸與單一 AI 強度。提供小圖速攻／大圖持久與 AI 強度二段（弱化 AI 收入或放寬其行動數），拉長重玩壽命。
6. **分數透明化**：score 公式散落各處。HUD 加本回合分差與稱霸進度條（x/N 島），把「限時分數戰」從隱性變顯性。
7. **首局導引**：setMode 文案已有但只出現一次；首次進入各模式時高亮合法格（explore 模式的 dim-action 已有基礎），並在 AP 歸零時提示結束回合。

**低優先**

8. **海戰演出**：勝敗目前共用 battle.ogg；分開音色＋目標格閃光，強化征服瞬間的回饋。
