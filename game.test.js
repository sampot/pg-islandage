import { describe, expect, it } from "vitest";
import {
  BUILDINGS,
  BUILD_ORDER,
  DOMINATION,
  EXPAND_COST,
  FLEET_COST,
  MAP_H,
  MAP_W,
  MAX_TURNS,
  MODES,
  START_AP,
  actOnTile,
  applyAction,
  availableBuildings,
  buildOnTile,
  canAfford,
  canConquer,
  canDevelop,
  canExpand,
  canExplore,
  canRecruitFleet,
  checkOutcome,
  conquerTile,
  countOwned,
  createGame,
  dominationRatio,
  endTurn,
  expandTile,
  exploreTile,
  getLegalActions,
  getOutcome,
  recruitFleet,
  resolveBattle,
  runAiTurn,
  seeded,
  setMode,
  summarize,
  neighbors,
  totalIslands,
} from "./game.js";
import { EMPTY_PROGRESS, mergeProgress as mergePersist } from "./persist.js";

function rich(state, patch = {}) {
  return { ...structuredClone(state), ...patch };
}

describe("createGame", () => {
  it("starts with player and ai capitals on a foggy map", () => {
    const s = createGame({ seed: 42 });
    expect(s.tiles.some((t) => t.capital && t.owner === "player")).toBe(true);
    expect(s.tiles.some((t) => t.capital && t.owner === "ai")).toBe(true);
    expect(s.tiles.some((t) => t.fog)).toBe(true);
    expect(getOutcome(s)).toBe("playing");
  });

  it("is deterministic for the same seed", () => {
    expect(createGame({ seed: 9 })).toEqual(createGame({ seed: 9 }));
  });

  it("starts with action points and explore mode", () => {
    const s = createGame({ seed: 3 });
    expect(s.ap).toBe(START_AP);
    expect(s.mode).toBe("explore");
    expect(s.player.fleet).toBeGreaterThan(0);
  });
});

describe("map helpers", () => {
  it("counts owned islands and domination ratio", () => {
    const s = createGame({ seed: 1 });
    const owned = countOwned(s.tiles, "player");
    expect(owned).toBeGreaterThan(0);
    expect(dominationRatio(s.tiles, "player")).toBeGreaterThan(0);
    expect(totalIslands(s.tiles)).toBeGreaterThan(2);
  });

  it("uses seeded rng consistently", () => {
    expect(seeded(5, 2, 3)).toBe(seeded(5, 2, 3));
    expect(seeded(5, 2, 3)).not.toBe(seeded(6, 2, 3));
  });
});

describe("4X explore", () => {
  it("reveals adjacent fog and spends action points", () => {
    const s = createGame({ seed: 11 });
    const fogIndex = s.tiles.findIndex((t, i) => t.fog && canExplore(s, i));
    expect(fogIndex).toBeGreaterThanOrEqual(0);
    const apBefore = s.ap;
    const next = exploreTile(s, fogIndex);
    expect(next.tiles[fogIndex].fog).toBe(false);
    expect(next.ap).toBe(apBefore - 1);
    expect(next.score).toBeGreaterThan(s.score);
  });

  it("rejects exploring non-adjacent fog", () => {
    const s = createGame({ seed: 12 });
    const farFog = s.tiles.findIndex((t, i) => t.fog && !canExplore(s, i));
    if (farFog < 0) return;
    const next = exploreTile(s, farFog);
    expect(next.tiles[farFog].fog).toBe(true);
    expect(next.ap).toBe(s.ap);
  });
});

describe("4X expand", () => {
  it("claims neutral islands next to player territory", () => {
    let s = rich(createGame({ seed: 20 }), {
      player: { food: 20, wood: 20, gold: 5, fleet: 2 },
      ap: 4,
    });
    const owned = s.tiles.findIndex((t) => t.owner === "player");
    const target = neighbors(owned)[0];
    s.tiles[target].kind = "island";
    s.tiles[target].fog = false;
    s.tiles[target].owner = null;
    s = expandTile(s, target);
    expect(s.tiles[target].owner).toBe("player");
    expect(s.tiles[target].building).toBe("camp");
  });

  it("requires expand resources", () => {
    let s = createGame({ seed: 21 });
    const owned = s.tiles.findIndex((t) => t.owner === "player");
    const target = neighbors(owned).find((i) => s.tiles[i].kind === "island" && !s.tiles[i].owner);
    if (target == null) return;
    s.tiles[target].fog = false;
    s.player.wood = 0;
    s.player.food = 0;
    const apBefore = s.ap;
    s = expandTile(s, target);
    expect(s.tiles[target].owner).toBeNull();
    expect(s.ap).toBe(apBefore);
  });
});

describe("4X develop", () => {
  it("builds farms when resources allow", () => {
    let s = rich(createGame({ seed: 30 }), {
      player: { food: 20, wood: 20, gold: 10, fleet: 2 },
      ap: 4,
    });
    const owned = s.tiles.findIndex((t) => t.owner === "player");
    s = buildOnTile(s, owned, "farm");
    expect(s.tiles[owned].building).toBe("farm");
    expect(s.player.wood).toBeLessThan(20);
  });

  it("lists available upgrades for owned tiles", () => {
    const s = rich(createGame({ seed: 31 }), {
      player: { food: 20, wood: 20, gold: 10, fleet: 2 },
    });
    const owned = s.tiles.findIndex((t) => t.owner === "player");
    expect(availableBuildings(s, owned)).toContain("farm");
  });

  it("recruits fleet from shipyards", () => {
    let s = rich(createGame({ seed: 32 }), {
      player: { food: 20, wood: 30, gold: 10, fleet: 1 },
      ap: 8,
    });
    const owned = s.tiles.findIndex((t) => t.owner === "player");
    s = buildOnTile(s, owned, "farm");
    s = buildOnTile(s, owned, "port");
    s = buildOnTile(s, owned, "shipyard");
    expect(s.tiles[owned].building).toBe("shipyard");
    const fleetBefore = s.player.fleet;
    s = recruitFleet(s, owned);
    expect(s.player.fleet).toBe(fleetBefore + 1);
  });
});

describe("4X conquer", () => {
  it("resolves battles with rng and fleet", () => {
    const win = resolveBattle(5, 1, "camp", () => 0.9);
    const loss = resolveBattle(1, 5, "fortress", () => 0.1);
    expect(win.win).toBe(true);
    expect(loss.win).toBe(false);
  });

  it("can attack adjacent enemy islands when fleet exists", () => {
    let s = createGame({ seed: 40 });
    const owned = s.tiles.findIndex((t) => t.owner === "player");
    const target = neighbors(owned)[0];
    s.tiles[target].kind = "island";
    s.tiles[target].fog = false;
    s.tiles[target].owner = "ai";
    s.tiles[target].building = "camp";
    s.tiles[target].garrison = 0;
    s.player.fleet = 6;
    s.ap = 4;
    const next = conquerTile(s, target);
    expect(next.ap).toBe(2);
    expect(["player", "ai"]).toContain(next.tiles[target].owner);
  });
});

describe("economy and turns", () => {
  it("produces resources when ending turn", () => {
    let s = rich(createGame({ seed: 50 }), {
      player: { food: 0, wood: 0, gold: 0, fleet: 2 },
    });
    const owned = s.tiles.findIndex((t) => t.owner === "player");
    s = buildOnTile(s, owned, "farm");
    s.ap = 0;
    const foodBefore = s.player.food;
    s = endTurn(s);
    expect(s.turn).toBe(2);
    expect(s.ap).toBe(START_AP);
    expect(s.player.food).toBeGreaterThan(foodBefore);
  });

  it("runs ai turn after player ends turn", () => {
    let s = createGame({ seed: 51 });
    const aiBefore = countOwned(s.tiles, "ai");
    s = endTurn(s);
    expect(s.aiScore).toBeGreaterThan(0);
    expect(countOwned(s.tiles, "ai")).toBeGreaterThanOrEqual(aiBefore);
  });
});

describe("outcomes", () => {
  it("wins when player dominates the island chain", () => {
    const s = createGame({ seed: 60 });
    for (const tile of s.tiles) {
      if (tile.kind === "island") tile.owner = "player";
    }
    checkOutcome(s);
    expect(getOutcome(s)).toBe("won");
  });

  it("loses when player capital is gone", () => {
    const s = createGame({ seed: 61 });
    for (const tile of s.tiles) {
      if (tile.capital && tile.owner === "player") {
        tile.owner = "ai";
        tile.capital = false;
      }
    }
    checkOutcome(s);
    expect(getOutcome(s)).toBe("lost");
  });

  it("wins when ai capital falls", () => {
    const s = createGame({ seed: 62 });
    for (const tile of s.tiles) {
      if (tile.capital && tile.owner === "ai") {
        tile.owner = "player";
        tile.capital = false;
      }
    }
    checkOutcome(s);
    expect(getOutcome(s)).toBe("won");
  });

  it("resolves timed victory by score at max turns", () => {
    const s = rich(createGame({ seed: 63 }), {
      turn: MAX_TURNS,
      score: 200,
      aiScore: 50,
    });
    checkOutcome(s);
    expect(getOutcome(s)).toBe("won");
  });

  it("resolves timed defeat when behind on score", () => {
    const s = rich(createGame({ seed: 64 }), {
      turn: MAX_TURNS,
      score: 20,
      aiScore: 200,
    });
    checkOutcome(s);
    expect(getOutcome(s)).toBe("lost");
  });
});

describe("modes and actions", () => {
  it("switches 4X modes immutably", () => {
    const before = createGame({ seed: 70 });
    const next = setMode(before, "conquer");
    expect(before.mode).toBe("explore");
    expect(next.mode).toBe("conquer");
  });

  it("routes applyAction for modes and end turn", () => {
    let s = applyAction(createGame({ seed: 71 }), "expand");
    expect(s.mode).toBe("expand");
    s = applyAction(s, "endTurn");
    expect(s.turn).toBe(2);
  });

  it("exposes legal actions while playing", () => {
    const actions = getLegalActions(createGame({ seed: 72 }));
    expect(actions).toContain("endTurn");
    expect(MODES.every((m) => actions.includes(`mode:${m}`))).toBe(true);
  });

  it("ignores invalid actions safely", () => {
    const s = createGame({ seed: 73 });
    expect(applyAction(s, "nope")).toEqual(s);
  });

  it("summarize reports islands and resources", () => {
    const summary = summarize(createGame({ seed: 74 }));
    expect(summary.playerIslands).toBeGreaterThan(0);
    expect(summary.resources.fleet).toBeGreaterThan(0);
  });
});

describe("ai behavior", () => {
  it("ai turn keeps game playing or ends with outcome", () => {
    const s = runAiTurn(createGame({ seed: 80 }));
    expect(["playing", "won", "lost"]).toContain(getOutcome(s));
  });
});

describe("constants and costs", () => {
  it("defines map dimensions and domination threshold", () => {
    expect(MAP_W * MAP_H).toBe(35);
    expect(DOMINATION).toBeGreaterThan(0.5);
    expect(MAX_TURNS).toBeGreaterThan(20);
  });

  it("defines building chain and expand cost", () => {
    expect(BUILD_ORDER).toContain("fortress");
    expect(canAfford({ wood: 3, food: 2 }, EXPAND_COST)).toBe(true);
    expect(canAfford({ wood: 1, food: 1 }, FLEET_COST)).toBe(false);
  });

  it("defines all building specs", () => {
    expect(Object.keys(BUILDINGS)).toEqual(expect.arrayContaining(["camp", "farm", "port", "shipyard", "fortress"]));
  });
});

describe("persist merge", () => {
  it("tracks best score and wins", () => {
    const merged = mergePersist(EMPTY_PROGRESS, { score: 120, outcome: "won", turn: 10 });
    expect(merged.best).toBe(120);
    expect(merged.wins).toBe(1);
    expect(merged.plays).toBe(1);
  });

  it("keeps previous best when lower", () => {
    const merged = mergePersist({ best: 300, wins: 2, plays: 4 }, { score: 40, outcome: "lost", turn: 8 });
    expect(merged.best).toBe(300);
    expect(merged.plays).toBe(5);
  });
});
