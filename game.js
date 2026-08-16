/** pg-islandage — 島鏈紀元 (大戰略／輕 4X) */

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function mulberry32(a) {
  return function() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function deep(o) { return JSON.parse(JSON.stringify(o)); }


export function createGame({ seed = 1 } = {}) {
  return { seed, turn: 0, score: 0, level: 1, meter: 0, resources: 10, flags: {}, log: ["島鏈紀元：探索／擴張／開發／征服"], outcome: "playing", msg: "島鏈紀元：探索／擴張／開發／征服" };
}
export function getLegalActions(s) {
  if (s.outcome !== "playing") return [];
  return ["explore","expand","develop","conquer"];
}
export function applyAction(state, action) {
  const s = deep(state);
  if (s.outcome !== "playing") return s;
  const rnd = mulberry32(s.seed + s.turn * 19);
  s.turn++;
  
  if (action === "explore") { s.meter += 8 + rnd()*8; s.resources -= 1; s.msg = "發現新島礁"; }
  else if (action === "expand") { s.level = clamp(s.level + (rnd()<0.5?1:0), 1, 5); s.resources -= 2; s.meter += 10; s.msg = "建立據點"; }
  else if (action === "develop") { s.resources += 3; s.score += 15; s.msg = "開發產業"; }
  else { s.meter += 15; s.resources -= 2; s.score += 20; s.msg = "出兵征服"; if (rnd()<0.2) { s.resources -= 3; s.msg += "（苦戰）"; } }
  s.score += Math.floor(s.meter / 10);

  if (s.resources < 0) s.resources = 0;
  if (s.outcome === "playing" && s.level >= 5 && s.meter >= 100) {
    s.outcome = "won";
    s.msg = "目標達成！";
  }
  if (s.outcome === "playing" && (s.resources <= 0 && s.meter < 20 && s.turn > 8)) {
    s.outcome = "lost";
    s.msg = "資源崩盤";
  }
  return s;
}
export function summarize(s) {
  return { turn: s.turn, level: s.level, meter: s.meter, score: s.score, resources: s.resources, msg: s.msg, outcome: s.outcome, flags: s.flags };
}
export function getOutcome(s) { return s.outcome; }

