# 島鏈紀元 (`pg-islandage`)

輕量 4X 小品：探索迷霧海域、殖民中立島嶼、建造農場／港口／船塢／要塞，並以艦隊征服敵港。

## 玩法

- **探索**：點相鄰迷霧格偵察（1 行動點）
- **擴張**：殖民相鄰中立島（2 行動點＋木材／糧食）
- **開發**：在己方島嶼建造設施或募船（1 行動點＋資源）
- **征服**：對相鄰敵港發動海戰（2 行動點＋艦隊）
- **結束回合**：各島生產資源，敵國 AI 行動

## 勝敗

- 掌控 **55%** 島嶼、擊陷敵都、或 **35** 回合內分數領先 → 勝
- 王都淪陷、敵國稱霸、或回合上限落後 → 敗

## 開發

```bash
npx vitest run
```

靜態檔可直接掛進 Playgrounds 畫布；進度走 `PG.kv`（鍵 `islandage:progress`）。

Agent 開發請讀 Playgrounds 宿主 [`docs/PG-GAME-AGENT-GUIDE.md`](https://github.com/sampot/playgrounds/blob/main/docs/PG-GAME-AGENT-GUIDE.md)。
