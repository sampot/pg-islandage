import {
  BUILDINGS,
  DOMINATION,
  MAP_H,
  MAP_W,
  MAX_TURNS,
  MODES,
  availableBuildings,
  actOnTile,
  buildOnTile,
  canRecruitFleet,
  createGame,
  endTurn,
  getOutcome,
  recruitFleet,
  setMode,
  summarize,
} from "./game.js";
import { GameAudio } from "./audio.js";
import { loadProgress, mergeProgress, saveProgress } from "./persist.js";

const $ = (q) => document.querySelector(q);
const audio = new GameAudio();

const ICONS = {
  food: "./assets/icons/food.png",
  wood: "./assets/icons/wood.png",
  gold: "./assets/icons/gold.png",
  fleet: "./assets/icons/fleet.png",
  camp: "./assets/icons/camp.png",
  port: "./assets/icons/port.png",
  fortress: "./assets/icons/fortress.png",
};

const MODE_LABELS = {
  explore: "探索",
  expand: "擴張",
  develop: "開發",
  conquer: "征服",
};

let state = createGame({ seed: Date.now() % 99991 });
let progress = { best: 0, wins: 0, plays: 0 };
let toastTimer = null;
let dragging = false;

function showToast(text) {
  const el = $("#toast");
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || "";
  clearTimeout(toastTimer);
  if (text) toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
}

function tileClass(tile, index) {
  const parts = ["tile"];
  if (tile.fog) parts.push("fog");
  else parts.push(tile.kind);
  if (tile.owner) parts.push(`owner-${tile.owner}`);
  if (tile.capital) parts.push("capital");
  if (state.selected === index) parts.push("selected");
  if (state.mode === "explore" && !tile.fog) parts.push("dim-action");
  return parts.join(" ");
}

function tileContent(tile) {
  if (tile.fog) return '<span class="glyph">☁</span>';
  if (tile.kind === "water") return '<span class="glyph">≋</span>';
  const owner = tile.owner === "player" ? "🏴" : tile.owner === "ai" ? "🏴‍☠️" : "🏝";
  const building = tile.building ? `<img src="${ICONS[BUILDINGS[tile.building]?.icon] ?? ICONS.camp}" width="22" height="22" alt="" />` : "";
  const cap = tile.capital ? '<span class="cap">都</span>' : "";
  const guard = tile.garrison ? `<small>${tile.garrison}</small>` : "";
  return `${owner}${building}${cap}${guard}`;
}

function renderMap() {
  return `<div class="map" style="--cols:${MAP_W};--rows:${MAP_H}">${state.tiles
    .map(
      (tile, index) =>
        `<button type="button" class="${tileClass(tile, index)}" data-index="${index}" aria-label="格 ${index + 1}">${tileContent(tile)}</button>`,
    )
    .join("")}</div>`;
}

function renderResources() {
  const r = state.player;
  return [
    ["food", "糧"],
    ["wood", "木"],
    ["gold", "金"],
    ["fleet", "艦"],
  ]
    .map(
      ([key, label]) =>
        `<span><img src="${ICONS[key === "food" ? "food" : key === "wood" ? "wood" : key === "gold" ? "gold" : "fleet"]}" width="20" height="20" alt="" />${label} ${r[key] ?? 0}</span>`,
    )
    .join("");
}

function renderModes() {
  return MODES.map(
    (mode) =>
      `<button type="button" class="mode${state.mode === mode ? " active" : ""}" data-mode="${mode}" aria-pressed="${state.mode === mode}">${MODE_LABELS[mode]}</button>`,
  ).join("");
}

function renderDevelopPanel() {
  if (state.mode !== "develop" || state.selected == null || state.outcome !== "playing") {
    return "";
  }
  const index = state.selected;
  const tile = state.tiles[index];
  if (tile.owner !== "player") return "";
  const builds = availableBuildings(state, index)
    .map((id) => {
      const spec = BUILDINGS[id];
      const cost = Object.entries(spec.cost)
        .map(([k, v]) => `${k === "wood" ? "木" : k === "food" ? "糧" : "金"}${v}`)
        .join(" ");
      return `<button type="button" class="build" data-build="${id}">${spec.name}${cost ? ` · ${cost}` : ""}</button>`;
    })
    .join("");
  const recruit = canRecruitFleet(state, index)
    ? '<button type="button" class="build" data-recruit="1">募船 · 木2 金1</button>'
    : "";
  return `<div class="develop-panel"><strong>${tile.building ? BUILDINGS[tile.building].name : "新島"}</strong>${builds}${recruit}</div>`;
}

function renderOutcome() {
  const outcome = getOutcome(state);
  if (outcome === "playing") return "";
  const won = outcome === "won";
  return `<div class="overlay ${won ? "won" : "lost"}">
    <h2>${won ? "稱霸島鏈" : "紀元終結"}</h2>
    <p>${state.reason ?? ""}</p>
    <p>分數 ${state.score} · 敵 ${state.aiScore}</p>
    <button type="button" id="restart" class="primary">再開一局</button>
  </div>`;
}

function render() {
  const outcome = getOutcome(state);
  const summary = summarize(state);
  $("#hud").innerHTML = `
    <span>回合 ${summary.turn}/${MAX_TURNS}</span>
    <span>行動 ${state.ap}/${state.apMax}</span>
    <span>分 ${summary.score}</span>
    <span>敵 ${summary.aiScore}</span>
    <span>島 ${summary.playerIslands}/${summary.playerIslands + summary.aiIslands}</span>
    <span>稱霸 ${Math.round(DOMINATION * 100)}%</span>
  `;
  $("#resources").innerHTML = renderResources();
  $("#modes").innerHTML = renderModes();
  $("#board").innerHTML = renderMap() + renderDevelopPanel() + renderOutcome();
  $("#msg").textContent = state.message;

  $("#board").querySelectorAll(".tile").forEach((btn) => {
    btn.addEventListener("click", onTileClick);
  });
  $("#board").querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", onModeClick);
  });
  $("#board").querySelectorAll("[data-build]").forEach((btn) => {
    btn.addEventListener("click", onBuildClick);
  });
  $("#board").querySelectorAll("[data-recruit]").forEach((btn) => {
    btn.addEventListener("click", onRecruitClick);
  });
  const restart = $("#restart");
  if (restart) restart.onclick = startNewGame;

  if (outcome !== "playing") {
    audio.play(outcome === "won" ? "win" : "lose");
    void persist();
  }
}

function onModeClick(event) {
  const mode = event.currentTarget.dataset.mode;
  audio.play("click");
  state = setMode(state, mode);
  render();
}

function onTileClick(event) {
  if (dragging) return;
  const index = Number(event.currentTarget.dataset.index);
  audio.play(state.mode === "conquer" ? "battle" : state.mode === "explore" ? "explore" : "click");
  if (state.mode === "develop") {
    state = actOnTile(state, index);
    render();
    return;
  }
  state = actOnTile(state, index);
  render();
}

function onBuildClick(event) {
  const id = event.currentTarget.dataset.build;
  audio.play("build");
  state = buildOnTile(state, state.selected, id);
  render();
}

function onRecruitClick() {
  audio.play("build");
  state = recruitFleet(state, state.selected);
  render();
}

async function persist() {
  progress = mergeProgress(progress, state);
  $("#best").textContent = String(progress.best);
  $("#wins").textContent = String(progress.wins);
  await saveProgress(progress, () => showToast("戰績同步失敗（仍可繼續玩）"));
}

function startNewGame() {
  state = createGame({ seed: Date.now() % 99991 });
  render();
}

function bindLifecycle() {
  const suspend = () => {
    dragging = false;
    audio.suspend();
  };
  const resume = () => {
    audio.resume();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") suspend();
    else resume();
  });
  window.addEventListener("pagehide", suspend);
  window.addEventListener("pointerup", () => { dragging = false; });
  window.addEventListener("pointercancel", () => { dragging = false; });
}

async function init() {
  bindLifecycle();
  progress = await loadProgress();
  $("#best").textContent = String(progress.best || 0);
  $("#wins").textContent = String(progress.wins || 0);

  $("#start").onclick = async () => {
    await audio.start();
    $("#lobby").hidden = true;
    $("#game").hidden = false;
    startNewGame();
  };

  $("#sound").onclick = async (event) => {
    const on = event.currentTarget.getAttribute("aria-pressed") !== "true";
    event.currentTarget.setAttribute("aria-pressed", on ? "true" : "false");
    event.currentTarget.textContent = on ? "♫ 音效" : "♫ 靜音";
    audio.setEnabled(on);
    if (on) await audio.start();
  };

  $("#end-turn").onclick = () => {
    if (getOutcome(state) !== "playing") return;
    audio.play("turn");
    state = endTurn(state);
    render();
  };

  $("#credits").onclick = (event) => {
    event.preventDefault();
    const panel = $("#credits-panel");
    panel.hidden = !panel.hidden;
  };
}

await init();
