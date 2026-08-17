/** 島鏈紀元 — 輕量 4X（探索／擴張／開發／征服；純邏輯，無 DOM）。 */

export const MAP_W = 7;
export const MAP_H = 5;
export const MAX_TURNS = 35;
export const DOMINATION = 0.55;
export const START_AP = 4;
export const FLEET_COST = { wood: 2, gold: 1 };
export const EXPAND_COST = { wood: 3, food: 2 };
export const MODES = ["explore", "expand", "develop", "conquer"];

export const BUILDINGS = {
  camp: {
    id: "camp",
    name: "營地",
    icon: "camp",
    cost: {},
    prod: { food: 1 },
    garrison: 0,
  },
  farm: {
    id: "farm",
    name: "農場",
    icon: "food",
    cost: { wood: 4 },
    prod: { food: 3 },
    garrison: 0,
  },
  port: {
    id: "port",
    name: "港口",
    icon: "port",
    cost: { wood: 6, food: 2 },
    prod: { gold: 2 },
    garrison: 0,
  },
  shipyard: {
    id: "shipyard",
    name: "船塢",
    icon: "fleet",
    cost: { wood: 8, gold: 2 },
    prod: {},
    garrison: 0,
  },
  fortress: {
    id: "fortress",
    name: "要塞",
    icon: "fortress",
    cost: { wood: 10, gold: 4 },
    prod: {},
    garrison: 2,
  },
};

export const BUILD_ORDER = ["farm", "port", "shipyard", "fortress"];

const clone = (v) => structuredClone(v);

export function seeded(seed, turn = 0, salt = 0) {
  let t = (Math.trunc(seed) + turn * 997 + salt * 7919 + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function idx(x, y) {
  return y * MAP_W + x;
}

export function coords(index) {
  return { x: index % MAP_W, y: Math.floor(index / MAP_W) };
}

export function inBounds(x, y) {
  return x >= 0 && x < MAP_W && y >= 0 && y < MAP_H;
}

export function neighbors(index) {
  const { x, y } = coords(index);
  const out = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    if (inBounds(nx, ny)) out.push(idx(nx, ny));
  }
  return out;
}

function revealAround(tiles, x, y, radius = 1) {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      tiles[idx(nx, ny)].fog = false;
    }
  }
}

function islandTiles(tiles) {
  return tiles.filter((t) => t.kind === "island");
}

export function countOwned(tiles, owner) {
  return islandTiles(tiles).filter((t) => t.owner === owner).length;
}

export function totalIslands(tiles) {
  return islandTiles(tiles).length;
}

export function dominationRatio(tiles, owner) {
  const total = totalIslands(tiles);
  if (!total) return 0;
  return countOwned(tiles, owner) / total;
}

export function canAfford(resources, cost) {
  return Object.entries(cost).every(([k, v]) => (resources[k] ?? 0) >= v);
}

export function spend(resources, cost) {
  for (const [k, v] of Object.entries(cost)) resources[k] -= v;
}

function makeResources(base = {}) {
  return { food: 0, wood: 0, gold: 0, fleet: 0, ...base };
}

function generateMap(seed) {
  const tiles = [];
  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      const r = seeded(seed, x, y * 13);
      tiles.push({
        kind: r < 0.44 ? "island" : "water",
        fog: true,
        owner: null,
        building: null,
        garrison: 0,
        capital: false,
      });
    }
  }

  const playerStart = idx(0, MAP_H - 1);
  const aiStart = idx(MAP_W - 1, 0);
  tiles[playerStart].kind = "island";
  tiles[aiStart].kind = "island";

  tiles[playerStart].fog = false;
  tiles[playerStart].owner = "player";
  tiles[playerStart].building = "camp";
  tiles[playerStart].garrison = 2;
  tiles[playerStart].capital = true;

  tiles[aiStart].fog = false;
  tiles[aiStart].owner = "ai";
  tiles[aiStart].building = "camp";
  tiles[aiStart].garrison = 2;
  tiles[aiStart].capital = true;

  revealAround(tiles, 0, MAP_H - 1, 1);
  revealAround(tiles, MAP_W - 1, 0, 1);
  return tiles;
}

export function createGame({ seed = 1 } = {}) {
  const tiles = generateMap(Number(seed) || 1);
  return {
    seed: Number(seed) || 1,
    turn: 1,
    ap: START_AP,
    apMax: START_AP,
    mode: "explore",
    outcome: "playing",
    reason: null,
    message: "選模式後點地圖：探索迷霧、殖民島嶼、建造設施、或出動艦隊征服敵港。",
    score: 0,
    aiScore: 0,
    selected: null,
    player: makeResources({ food: 10, wood: 8, gold: 3, fleet: 2 }),
    ai: makeResources({ food: 8, wood: 8, gold: 3, fleet: 2 }),
    tiles,
    log: [],
  };
}

export function getOutcome(state) {
  return state.outcome;
}

export function summarize(state) {
  return {
    turn: state.turn,
    score: state.score,
    aiScore: state.aiScore,
    outcome: state.outcome,
    ap: state.ap,
    mode: state.mode,
    playerIslands: countOwned(state.tiles, "player"),
    aiIslands: countOwned(state.tiles, "ai"),
    resources: { ...state.player },
  };
}

export function setMode(state, mode) {
  const s = clone(state);
  if (s.outcome !== "playing" || !MODES.includes(mode)) return s;
  s.mode = mode;
  s.selected = null;
  s.message = {
    explore: "探索：點相鄰迷霧格以偵察海域。",
    expand: "擴張：點相鄰中立島嶼建立殖民地。",
    develop: "開發：點己方島嶼建造或募船。",
    conquer: "征服：點相鄰敵港發動海戰。",
  }[mode];
  return s;
}

export function selectTile(state, index) {
  const s = clone(state);
  if (s.outcome !== "playing") return s;
  if (index < 0 || index >= s.tiles.length) return s;
  s.selected = index;
  return s;
}

function adjacentToOwner(tiles, index, owner) {
  return neighbors(index).some((n) => tiles[n].owner === owner);
}

function hasVisibleFrontier(tiles, index) {
  const tile = tiles[index];
  if (tile.fog) return false;
  return neighbors(index).some((n) => tiles[n].fog);
}

export function canExplore(state, index) {
  if (state.outcome !== "playing" || state.ap < 1) return false;
  const tile = state.tiles[index];
  if (!tile.fog) return false;
  return neighbors(index).some((n) => {
    const neighbor = state.tiles[n];
    return !neighbor.fog && (neighbor.owner === "player" || neighbor.kind === "water");
  });
}

export function canExpand(state, index, owner = "player") {
  if (state.outcome !== "playing" || state.ap < 2) return false;
  const tile = state.tiles[index];
  if (tile.fog || tile.kind !== "island" || tile.owner) return false;
  if (!adjacentToOwner(state.tiles, index, owner)) return false;
  const purse = owner === "ai" ? state.ai : state.player;
  return canAfford(purse, EXPAND_COST);
}

export function canDevelop(state, index, buildingId) {
  if (state.outcome !== "playing" || state.ap < 1) return false;
  const tile = state.tiles[index];
  if (tile.owner !== "player" || tile.fog || tile.kind !== "island") return false;
  const spec = BUILDINGS[buildingId];
  if (!spec) return false;
  if (tile.building === buildingId) return false;
  if (buildingId !== "camp" && !tile.building) return false;
  return canAfford(state.player, spec.cost);
}

export function canRecruitFleet(state, index) {
  if (state.outcome !== "playing" || state.ap < 1) return false;
  const tile = state.tiles[index];
  if (tile.owner !== "player" || tile.building !== "shipyard") return false;
  return canAfford(state.player, FLEET_COST);
}

export function canConquer(state, index) {
  if (state.outcome !== "playing" || state.ap < 2) return false;
  const tile = state.tiles[index];
  if (tile.fog || tile.owner !== "ai" || tile.kind !== "island") return false;
  if (!adjacentToOwner(state.tiles, index, "player")) return false;
  return state.player.fleet > 0;
}

export function exploreTile(state, index) {
  const s = clone(state);
  if (!canExplore(s, index)) {
    s.message = "無法探索：需要相鄰已偵察海域，且剩餘行動點。";
    return s;
  }
  s.tiles[index].fog = false;
  s.ap -= 1;
  s.score += 2;
  s.message = s.tiles[index].kind === "island" ? "發現新島嶼！" : "海域已標記。";
  s.log.unshift(`第 ${s.turn} 回合 · 探索 ${tileLabel(index)}`);
  checkOutcome(s);
  return s;
}

export function expandTile(state, index) {
  const s = clone(state);
  if (!canExpand(s, index)) {
    s.message = "無法殖民：需相鄰己方領地，並消耗木材與糧食。";
    return s;
  }
  spend(s.player, EXPAND_COST);
  s.tiles[index].owner = "player";
  s.tiles[index].building = "camp";
  s.tiles[index].garrison = 1;
  s.ap -= 2;
  s.score += 12;
  s.message = "殖民地建立！可再開發設施。";
  s.log.unshift(`第 ${s.turn} 回合 · 殖民 ${tileLabel(index)}`);
  checkOutcome(s);
  return s;
}

export function buildOnTile(state, index, buildingId) {
  const s = clone(state);
  if (!canDevelop(s, index, buildingId)) {
    s.message = "無法建造：資源不足、設施未解鎖或行動點不足。";
    return s;
  }
  const spec = BUILDINGS[buildingId];
  spend(s.player, spec.cost);
  const tile = s.tiles[index];
  tile.building = buildingId;
  tile.garrison += spec.garrison ?? 0;
  s.ap -= 1;
  s.score += 8;
  s.message = `完成 ${spec.name}。`;
  s.log.unshift(`第 ${s.turn} 回合 · 建造 ${spec.name}`);
  checkOutcome(s);
  return s;
}

export function recruitFleet(state, index) {
  const s = clone(state);
  if (!canRecruitFleet(s, index)) {
    s.message = "需在船塢募船，並支付木材與金幣。";
    return s;
  }
  spend(s.player, FLEET_COST);
  s.player.fleet += 1;
  s.ap -= 1;
  s.score += 4;
  s.message = "艦隊 +1。";
  s.log.unshift(`第 ${s.turn} 回合 · 募船`);
  return s;
}

function combatPower(fleet, garrison, building) {
  const bonus = building === "fortress" ? 3 : building === "camp" ? 1 : 0;
  return fleet + garrison + bonus;
}

export function resolveBattle(attackerFleet, defenderGarrison, defenderBuilding, rng) {
  const atk = combatPower(attackerFleet, 0, null) + Math.floor(rng() * 4);
  const def = combatPower(0, defenderGarrison, defenderBuilding) + Math.floor(rng() * 4);
  return { win: atk > def, atk, def };
}

export function conquerTile(state, index) {
  const s = clone(state);
  if (!canConquer(s, index)) {
    s.message = "無法出擊：需相鄰敵港且有可用艦隊。";
    return s;
  }
  const tile = s.tiles[index];
  const rng = () => seeded(s.seed, s.turn, index * 17 + s.player.fleet);
  const battle = resolveBattle(s.player.fleet, tile.garrison, tile.building, rng);
  s.ap -= 2;
  if (battle.win) {
    const wasCapital = tile.capital;
    tile.owner = "player";
    tile.garrison = Math.max(1, Math.floor(s.player.fleet / 2));
    tile.building = tile.building === "fortress" ? "camp" : tile.building ?? "camp";
    tile.capital = false;
    s.player.fleet = Math.max(0, s.player.fleet - 1);
    s.score += wasCapital ? 40 : 18;
    s.message = wasCapital ? "敵都淪陷！島鏈動搖。" : "海戰告捷，島嶼易手。";
    s.log.unshift(`第 ${s.turn} 回合 · 征服 ${tileLabel(index)}`);
  } else {
    s.player.fleet = Math.max(0, s.player.fleet - 2);
    s.message = "海戰失利，艦隊後撤。";
    s.log.unshift(`第 ${s.turn} 回合 · 海戰失利`);
  }
  checkOutcome(s);
  return s;
}

export function actOnTile(state, index) {
  if (state.outcome !== "playing") return state;
  switch (state.mode) {
    case "explore":
      return exploreTile(state, index);
    case "expand":
      return expandTile(state, index);
    case "develop":
      return selectTile(state, index);
    case "conquer":
      return conquerTile(state, index);
    default:
      return state;
  }
}

function productionFor(owner, tiles) {
  const totals = makeResources();
  for (const tile of tiles) {
    if (tile.owner !== owner || tile.fog || tile.kind !== "island") continue;
    const spec = BUILDINGS[tile.building];
    if (!spec?.prod) continue;
    for (const [k, v] of Object.entries(spec.prod)) totals[k] += v;
  }
  return totals;
}

function applyProduction(state) {
  const playerProd = productionFor("player", state.tiles);
  const aiProd = productionFor("ai", state.tiles);
  for (const [k, v] of Object.entries(playerProd)) state.player[k] += v;
  for (const [k, v] of Object.entries(aiProd)) state.ai[k] += v;
  state.score += playerProd.food + playerProd.wood * 2 + playerProd.gold * 3;
  state.aiScore += aiProd.food + aiProd.wood * 2 + aiProd.gold * 3;
}

function aiCanAfford(ai, cost) {
  return canAfford(ai, cost);
}

function aiExpand(state) {
  const candidates = state.tiles
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile, index }) => canExpand({ ...state, ap: 2 }, index, "ai") && tile.owner === null);
  if (!candidates.length) return false;
  const pick = candidates[Math.floor(seeded(state.seed, state.turn, 31) * candidates.length)];
  spend(state.ai, EXPAND_COST);
  pick.tile.owner = "ai";
  pick.tile.building = "camp";
  pick.tile.garrison = 1;
  state.aiScore += 10;
  state.log.unshift(`第 ${state.turn} 回合 · 敵方殖民 ${tileLabel(pick.index)}`);
  return true;
}

function aiBuild(state) {
  const owned = state.tiles
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile }) => tile.owner === "ai" && tile.kind === "island");
  for (const { tile, index } of owned) {
    for (const buildingId of BUILD_ORDER) {
      const spec = BUILDINGS[buildingId];
      if (tile.building === buildingId) break;
      if (buildingId !== "camp" && !tile.building) continue;
      if (!aiCanAfford(state.ai, spec.cost)) continue;
      spend(state.ai, spec.cost);
      tile.building = buildingId;
      tile.garrison += spec.garrison ?? 0;
      state.aiScore += 6;
      state.log.unshift(`第 ${state.turn} 回合 · 敵方建造 ${spec.name}`);
      return true;
    }
    if (tile.building === "shipyard" && aiCanAfford(state.ai, FLEET_COST)) {
      spend(state.ai, FLEET_COST);
      state.ai.fleet += 1;
      state.log.unshift(`第 ${state.turn} 回合 · 敵方募船`);
      return true;
    }
  }
  return false;
}

function aiAttack(state) {
  const targets = state.tiles
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile, index }) => tile.owner === "player" && adjacentToOwner(state.tiles, index, "ai"));
  if (!targets.length || state.ai.fleet <= 0) return false;
  const target = targets.sort((a, b) => {
    const score = (t) => (t.tile.capital ? 100 : 0) + t.tile.garrison + (t.tile.building === "fortress" ? 5 : 0);
    return score(a) - score(b);
  })[0];
  const rng = () => seeded(state.seed, state.turn, target.index * 23 + state.ai.fleet);
  const battle = resolveBattle(state.ai.fleet, target.tile.garrison, target.tile.building, rng);
  if (battle.win) {
    const wasCapital = target.tile.capital;
    target.tile.owner = "ai";
    target.tile.garrison = Math.max(1, Math.floor(state.ai.fleet / 2));
    target.tile.capital = false;
    target.tile.building = target.tile.building === "fortress" ? "camp" : target.tile.building ?? "camp";
    state.ai.fleet = Math.max(0, state.ai.fleet - 1);
    state.aiScore += wasCapital ? 35 : 15;
    state.log.unshift(`第 ${state.turn} 回合 · 敵方攻陷 ${tileLabel(target.index)}`);
    return true;
  }
  state.ai.fleet = Math.max(0, state.ai.fleet - 2);
  return false;
}

function aiExplore(state) {
  const fogTiles = state.tiles
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile, index }) => tile.fog && neighbors(index).some((n) => !state.tiles[n].fog));
  if (!fogTiles.length) return false;
  const pick = fogTiles[Math.floor(seeded(state.seed, state.turn, 41) * fogTiles.length)];
  pick.tile.fog = false;
  state.aiScore += 1;
  return true;
}

export function runAiTurn(state) {
  const s = clone(state);
  if (s.outcome !== "playing") return s;
  if (aiAttack(s)) {
    checkOutcome(s);
    return s;
  }
  if (dominationRatio(s.tiles, "ai") < DOMINATION && aiExpand(s)) {
    checkOutcome(s);
    return s;
  }
  if (aiBuild(s)) {
    checkOutcome(s);
    return s;
  }
  aiExplore(s);
  checkOutcome(s);
  return s;
}

export function checkOutcome(state) {
  if (state.outcome !== "playing") return;
  const playerCapital = state.tiles.some((t) => t.capital && t.owner === "player");
  const aiCapital = state.tiles.some((t) => t.capital && t.owner === "ai");
  const playerDom = dominationRatio(state.tiles, "player");
  const aiDom = dominationRatio(state.tiles, "ai");

  if (!playerCapital) {
    state.outcome = "lost";
    state.reason = "王都淪陷，島鏈紀元結束。";
    return;
  }
  if (!aiCapital) {
    state.outcome = "won";
    state.reason = "敵都陷落，你統一了島鏈！";
    state.score += 60;
    return;
  }
  if (playerDom >= DOMINATION) {
    state.outcome = "won";
    state.reason = `掌控 ${Math.round(playerDom * 100)}% 島嶼，達成稱霸。`;
    state.score += 40;
    return;
  }
  if (aiDom >= DOMINATION) {
    state.outcome = "lost";
    state.reason = "敵國稱霸島鏈，你只能退守。";
    return;
  }
  if (state.turn >= MAX_TURNS) {
    if (state.score > state.aiScore) {
      state.outcome = "won";
      state.reason = `第 ${MAX_TURNS} 回合結束，分數領先。`;
    } else if (state.score < state.aiScore) {
      state.outcome = "lost";
      state.reason = `第 ${MAX_TURNS} 回合結束，敵國分數更高。`;
    } else {
      state.outcome = "lost";
      state.reason = `第 ${MAX_TURNS} 回合結束，平局視為落敗。`;
    }
  }
}

export function endTurn(state) {
  const s = clone(state);
  if (s.outcome !== "playing") return s;
  applyProduction(s);
  let next = runAiTurn(s);
  next.turn += 1;
  next.ap = next.apMax;
  next.selected = null;
  if (next.outcome === "playing") {
    next.message = `第 ${next.turn} 回合開始。剩餘 ${MAX_TURNS - next.turn + 1} 回合。`;
  }
  checkOutcome(next);
  return next;
}

export function getLegalActions(state) {
  if (state.outcome !== "playing") return [];
  const actions = ["endTurn", ...MODES.map((m) => `mode:${m}`)];
  if (state.selected != null && state.mode === "develop") {
    for (const id of BUILD_ORDER) actions.push(`build:${id}`);
    actions.push("recruit");
  }
  return actions;
}

export function applyAction(state, action) {
  if (action === "endTurn" || action === "nextTurn") return endTurn(state);
  if (action.startsWith("mode:")) return setMode(state, action.slice(5));
  if (action.startsWith("build:")) {
    const buildingId = action.slice(6);
    const index = state.selected ?? -1;
    return buildOnTile(state, index, buildingId);
  }
  if (action === "recruit") {
    const index = state.selected ?? -1;
    return recruitFleet(state, index);
  }
  if (action === "explore" || action === "expand" || action === "develop" || action === "conquer") {
    return setMode(state, action);
  }
  return state;
}

function tileLabel(index) {
  const { x, y } = coords(index);
  return `(${x + 1},${y + 1})`;
}

export function tileSummary(tile) {
  return {
    kind: tile.kind,
    fog: tile.fog,
    owner: tile.owner,
    building: tile.building,
    garrison: tile.garrison,
    capital: tile.capital,
  };
}

export function availableBuildings(state, index) {
  const tile = state.tiles[index];
  if (!tile || tile.owner !== "player") return [];
  return BUILD_ORDER.filter((id) => canDevelop(state, index, id));
}
