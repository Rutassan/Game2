// Авто-битва v1.0 — наблюдай и смотри
(function () {
  "use strict";

  // --- Константы по умолчанию (меняются слайдерами/пресетами)
  const DEFAULTS = {
    size: 10,
    preset: "basic", // basic | blitz | long
    initialUnits: 6,
    rngSpread: 20, // 0..X
    turnLimit: 200,
    // Patch 2
    formation: "cluster", // cluster | line | wedge
    reinforceEvery: 20, // 0 = off
    armyCap: 12,
  };

  const MAX_LOG = 120;

  // Patch 3: Dynasty & Traits
  const TRAITS = ["brave", "cautious", "greedy"]; // codes
  const TRAIT_LABEL = {
    brave: "Храбрый",
    cautious: "Осторожный",
    greedy: "Жадный",
  };
  const NAME_POOL = [
    "Ragnvald", "Olaf", "Yaropolk", "Sviatopolk", "Ingvar", "Ivar", "Boris",
    "Harald", "Gleb", "Mstislav", "Vladimir", "Oleg", "Igor", "Rurik", "Sven",
    "Eirik", "Yaroslav", "Dobrynya", "Rostislav", "Gorm", "Tryggve"
  ];
  function randomName() { return NAME_POOL[Math.floor(rand() * NAME_POOL.length)]; }
  function randomTrait() { return TRAITS[Math.floor(rand() * TRAITS.length)]; }
  function traitLabel(code) { return TRAIT_LABEL[code] || code; }
  function facLabel(key) { return key === 'red' ? 'Красные' : 'Синие'; }

  // --- DOM ---
  const boardEl = document.getElementById("board");
  const logEl = document.getElementById("log");
  const startBtn = document.getElementById("startBtn");
  const stepBtn = document.getElementById("stepBtn");
  const resetBtn = document.getElementById("resetBtn");
  const seriesBtn = document.getElementById("seriesBtn");
  const speedRange = document.getElementById("speedRange");
  const presetSelect = document.getElementById("presetSelect");
  const unitsRange = document.getElementById("unitsRange");
  const unitsVal = document.getElementById("unitsVal");
  const rngRange = document.getElementById("rngRange");
  const rngVal = document.getElementById("rngVal");
  const limitRange = document.getElementById("limitRange");
  const limitVal = document.getElementById("limitVal");
  const turnInfo = document.getElementById("turnInfo");
  const redCountEl = document.getElementById("redCount");
  const blueCountEl = document.getElementById("blueCount");
  const combatInfo = document.getElementById("combatInfo");

  // Patch 2: dynamic controls for formation, reinforcements, army cap, seed/replay
  const controlsWrap = document.querySelector('.controls');
  let formationSelect = null;
  let reinforceSelect = null;
  let armyCapRange = null;
  let armyCapVal = null;
  let seedInfo = null;
  let replayBtn = null;

  function ensureExtraControls() {
    if (!controlsWrap) return;
    // Formation select
    if (!formationSelect) {
      const span = document.createElement('span'); span.className = 'group';
      const label = document.createElement('label'); label.htmlFor = 'formationSelect'; label.textContent = 'Построение:';
      formationSelect = document.createElement('select'); formationSelect.id = 'formationSelect';
      formationSelect.innerHTML = '<option value="cluster">Куча</option><option value="line">Линия</option><option value="wedge">Клин</option>';
      span.appendChild(label); span.appendChild(formationSelect); controlsWrap.appendChild(span);
    }
    // Reinforcements select
    if (!reinforceSelect) {
      const span = document.createElement('span'); span.className = 'group';
      const label = document.createElement('label'); label.htmlFor = 'reinforceSelect'; label.textContent = 'Подкрепления:';
      reinforceSelect = document.createElement('select'); reinforceSelect.id = 'reinforceSelect';
      reinforceSelect.innerHTML = '<option value="0">Выкл</option><option value="20" selected>20</option><option value="30">30</option>';
      span.appendChild(label); span.appendChild(reinforceSelect); controlsWrap.appendChild(span);
    }
    // Army cap range
    if (!armyCapRange) {
      const span = document.createElement('span'); span.className = 'group';
      const label = document.createElement('label'); label.htmlFor = 'armyCapRange'; label.textContent = 'Лимит армии:';
      armyCapRange = document.createElement('input'); armyCapRange.type = 'range'; armyCapRange.min = '8'; armyCapRange.max = '20'; armyCapRange.step = '1'; armyCapRange.value = '12'; armyCapRange.id = 'armyCapRange';
      armyCapVal = document.createElement('span'); armyCapVal.id = 'armyCapVal'; armyCapVal.textContent = '12';
      span.appendChild(label); span.appendChild(armyCapRange); span.appendChild(armyCapVal); controlsWrap.appendChild(span);
    }
    // Seed + Replay controls
    if (!seedInfo || !replayBtn) {
      const span = document.createElement('span'); span.className = 'group';
      const label = document.createElement('label'); label.textContent = 'Seed:';
      seedInfo = document.createElement('span'); seedInfo.id = 'seedInfo'; seedInfo.textContent = '—';
      replayBtn = document.createElement('button'); replayBtn.id = 'replayBtn'; replayBtn.title = 'Повторить матч с тем же сидом'; replayBtn.textContent = 'Повторить'; replayBtn.style.display = 'none';
      span.appendChild(label); span.appendChild(seedInfo); span.appendChild(replayBtn); controlsWrap.appendChild(span);
    }
  }

  // --- Глобальное состояние ---
  let state = null;
  let running = false;
  let timer = null;

  // --- Утилиты ---
  const id = (() => { let i = 1; return () => i++; })();
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  // Seeded RNG (Mulberry32)
  let _rng = null;
  function _mulberry32(a) {
    return function() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function setSeed(seed) { _rng = _mulberry32((seed >>> 0) || 1); }
  function rand() { return _rng ? _rng() : Math.random(); }
  const rnd = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
  const factionMark = (f) => (f === "red" ? "R" : "B");

  function log(msg, css = "") {
    const p = document.createElement("p");
    if (css) p.className = css;
    p.textContent = msg;
    logEl.appendChild(p);
    while (logEl.children.length > MAX_LOG) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // --- Пресеты старта ---
  function computePreset(conf) {
    const preset = conf.preset;
    if (preset === "blitz") {
      return { size: 10, red: { x: 2, y: 2 }, blue: { x: 7, y: 7 } };
    }
    if (preset === "long") {
      return { size: 14, red: { x: 0, y: 0 }, blue: { x: 13, y: 13 } };
    }
    // basic
    return { size: 10, red: { x: 0, y: 0 }, blue: { x: 9, y: 9 } };
  }

  // --- Создание матча ---
  function newGame() {
    const conf = {
      preset: presetSelect?.value || DEFAULTS.preset,
      initialUnits: Number(unitsRange?.value ?? DEFAULTS.initialUnits),
      rngSpread: Number(rngRange?.value ?? DEFAULTS.rngSpread),
      turnLimit: Number(limitRange?.value ?? DEFAULTS.turnLimit),
      formation: (typeof formationSelect !== 'undefined' && formationSelect?.value) ? formationSelect.value : DEFAULTS.formation,
      reinforceEvery: (typeof reinforceSelect !== 'undefined' && reinforceSelect?.value != null) ? Number(reinforceSelect.value) : DEFAULTS.reinforceEvery,
      armyCap: (typeof armyCapRange !== 'undefined' && armyCapRange?.value != null) ? Number(armyCapRange.value) : DEFAULTS.armyCap,
      seed: null,
    };
    // Seed for determinism and replay
    if (window._nextSeed != null) { conf.seed = Number(window._nextSeed) >>> 0; window._nextSeed = null; }
    else { conf.seed = Math.floor(Math.random() * 0xFFFFFFFF) >>> 0; }
    setSeed(conf.seed);
    const layout = computePreset(conf);

    const red = { name: "Красные", key: "red", color: "red", capital: { x: layout.red.x, y: layout.red.y, alive: true }, units: [] };
    const blue = { name: "Синие", key: "blue", color: "blue", capital: { x: layout.blue.x, y: layout.blue.y, alive: true }, units: [] };
    // Patch 3: initial leaders per faction
    const redLeader = { name: randomName(), trait: randomTrait() };
    const blueLeader = { name: randomName(), trait: randomTrait() };
    red.leader = redLeader; red.leaders = [redLeader]; red.hadHeir = false;
    blue.leader = blueLeader; blue.leaders = [blueLeader]; blue.hadHeir = false;

    const st = {
      size: layout.size,
      turn: 0,
      factions: { red, blue },
      ended: false,
      winner: null, // "Красные" | "Синие" | "Ничья"
      config: conf,
      stats: {
        kills: { red: 0, blue: 0 },
        losses: { red: 0, blue: 0 },
        noFightStreak: 0,
        fightStreak: 0,
        lastFightCell: null,
      },
      highlights: [], // {x,y,ttl}
      _capKillThisTurn: { red: false, blue: false },
    };

    spawnInitialUnits(st, red);
    spawnInitialUnits(st, blue);
    // Patch 3: announce leaders
    log(`У ${facLabel('red')} появился Лидер: ${red.leader.name} ${traitLabel(red.leader.trait)}`);
    log(`У ${facLabel('blue')} появился Лидер: ${blue.leader.name} ${traitLabel(blue.leader.trait)}`);
    return st;
  }

  function spawnInitialUnits(st, faction) {
    const { x: cx, y: cy } = faction.capital;
    const placed = new Set([`${cx},${cy}`]);
    const candidates = generateFormationCandidates(st, faction, st.config.formation || 'cluster');
    let placedCount = 0;
    for (const p of candidates) {
      if (placedCount >= st.config.initialUnits) break;
      if (p.x < 0 || p.y < 0 || p.x >= st.size || p.y >= st.size) continue;
      if (placed.has(`${p.x},${p.y}`)) continue;
      const rc = st.factions.red.capital, bc = st.factions.blue.capital;
      if ((p.x === rc.x && p.y === rc.y) || (p.x === bc.x && p.y === bc.y)) continue;
      placed.add(`${p.x},${p.y}`);
      faction.units.push(newWarrior(faction.key, p.x, p.y));
      placedCount++;
    }
    // Fallback random fill near capital if needed
    let tries = 0;
    while (placedCount < st.config.initialUnits && tries < 200) {
      const x = clamp(cx + rnd(-2, 2), 0, st.size - 1);
      const y = clamp(cy + rnd(-2, 2), 0, st.size - 1);
      tries++;
      if (placed.has(`${x},${y}`)) continue;
      placed.add(`${x},${y}`);
      faction.units.push(newWarrior(faction.key, x, y));
      placedCount++;
    }
  }

  function generateFormationCandidates(st, faction, formation) {
    const { x: cx, y: cy } = faction.capital;
    const enemy = faction.key === 'red' ? st.factions.blue.capital : st.factions.red.capital;
    const dx = Math.sign(enemy.x - cx);
    const dy = Math.sign(enemy.y - cy);
    const primary = (Math.abs(enemy.x - cx) >= Math.abs(enemy.y - cy)) ? 'x' : 'y';
    const sx = primary === 'x' ? (dx || 1) : 0;
    const sy = primary === 'y' ? (dy || 1) : 0;
    const list = [];

    if (formation === 'line') {
      for (let d = 1; d <= st.size; d++) list.push({ x: cx + sx * d, y: cy + sy * d });
      return list;
    }
    if (formation === 'wedge') {
      const rows = Math.max(4, Math.ceil(st.config.initialUnits / 2));
      for (let r = 1; r <= rows; r++) {
        const width = r;
        for (let k = -Math.floor((width - 1) / 2); k <= Math.floor(width / 2); k++) {
          if (primary === 'x') list.push({ x: cx + sx * r, y: cy + k });
          else list.push({ x: cx + k, y: cy + sy * r });
        }
      }
      return list;
    }
    // cluster default: random-ish near capital (radius 2)
    const seen = new Set();
    let attempts = 0;
    while (list.length < st.config.initialUnits * 3 && attempts < 200) {
      attempts++;
      const px = clamp(cx + rnd(-2, 2), 0, st.size - 1);
      const py = clamp(cy + rnd(-2, 2), 0, st.size - 1);
      const key = `${px},${py}`;
      if (!seen.has(key) && !(px === cx && py === cy)) { list.push({ x: px, y: py }); seen.add(key); }
    }
    return list;
  }

  function newWarrior(factionKey, x, y) {
    return { id: id(), faction: factionKey, x, y, hp: 100, str: 10 };
  }

  // --- Логика хода ---
  function step(st, options = { silent: false }) {
    if (st.ended) return st;
    st.turn++;

    const red = st.factions.red;
    const blue = st.factions.blue;

    // 1) Движение
    const allUnits = [...red.units, ...blue.units];
    shuffle(allUnits);
    for (const u of allUnits) {
      const enemyFaction = u.faction === "red" ? blue : red;
      const ownFaction = u.faction === "red" ? red : blue;
      const { target, type } = chooseTarget(st, u, ownFaction, enemyFaction);
      if (!target) continue;

      // Уже на цели-юните — не двигаемся
      if (type === "unit" && u.x === target.x && u.y === target.y) continue;
      // Уже на клетке столицы — не двигаемся
      if (type === "capital" && u.x === target.x && u.y === target.y) continue;

      const dx = Math.sign(target.x - u.x);
      const dy = Math.sign(target.y - u.y);
      const distX = Math.abs(target.x - u.x);
      const distY = Math.abs(target.y - u.y);
      const stepAxis = distX > distY ? "x" : distY > distX ? "y" : (rand() < 0.5 ? "x" : "y");
      if (stepAxis === "x") u.x = clamp(u.x + dx, 0, st.size - 1);
      else u.y = clamp(u.y + dy, 0, st.size - 1);
    }

    // 2) Бои (и статистика)
    const fightSummary = resolveCombats(st, options);

    // Обновить подсветки (1–2 хода)
    decayHighlights(st);
    for (const cell of fightSummary.cells) {
      st.highlights.push({ x: cell.x, y: cell.y, ttl: 2 });
      st.stats.lastFightCell = { x: cell.x, y: cell.y };
    }

    // Стрики боёв/тишины
    if (fightSummary.cells.length > 0) {
      st.stats.fightStreak += 1;
      st.stats.noFightStreak = 0;
    } else {
      st.stats.noFightStreak += 1;
      st.stats.fightStreak = 0;
    }

    // 3) Осада столицы (после боёв): столица падает, если на её клетке выжил вражеский юнит
    st._capKillThisTurn = { red: false, blue: false };
    const redCap = red.capital, blueCap = blue.capital;
    if (blueCap.alive && red.units.some(u => u.x === blueCap.x && u.y === blueCap.y)) st._capKillThisTurn.blue = true;
    if (redCap.alive && blue.units.some(u => u.x === redCap.x && u.y === redCap.y)) st._capKillThisTurn.red = true;

    let capEvents = [];
    if (st._capKillThisTurn.red) { redCap.alive = false; capEvents.push("RED"); }
    if (st._capKillThisTurn.blue) { blueCap.alive = false; capEvents.push("BLUE"); }
    if (!options.silent && capEvents.length) {
      if (capEvents.length === 2) log("Оба центра пали в один ход — ничья", "win");
      else if (capEvents[0] === "RED") log("Синие взяли столицу Красных", "win");
      else log("Красные взяли столицу Синих", "win");
    }

    // 4) Победа/ничья (включая двойной снос и лимит ходов)
    // Patch 3: heirs after capitals fall
    handleHeirs(st, options);
    applyReinforcements(st, options);
    checkVictory(st, options);

    return st;
  }

  // --- Выбор цели (анти-беготня: при равной дистанции — цель с наименьшим HP) ---
  function chooseTarget(st, unit, ownFaction, enemyFaction) {
    // Base targeting: nearest enemy unit, otherwise enemy capital
    const trait = ownFaction.leader?.trait || null;
    let best = null;
    let bestDist = Infinity;
    for (const e of enemyFaction.units) {
      const d = manhattan(unit, e);
      if (d < bestDist) { best = e; bestDist = d; }
      else if (d === bestDist && best && e.hp < best.hp) { best = e; }
    }

    // Trait modifiers
    const distToOwnCap = manhattan(unit, ownFaction.capital);
    const capAlive = enemyFaction.capital.alive;
    const armyCap = Number(st.config?.armyCap ?? Infinity);
    const ownArmy = ownFaction.units.length;

    // Cautious: stay closer to own capital
    if (trait === 'cautious') {
      if (distToOwnCap > 3) {
        return { target: { x: ownFaction.capital.x, y: ownFaction.capital.y }, type: 'home' };
      }
    }

    // Greedy: avoid attacking until near cap; gather at capital
    if (trait === 'greedy' && ownArmy < Math.max(2, armyCap - 2)) {
      return { target: { x: ownFaction.capital.x, y: ownFaction.capital.y }, type: 'home' };
    }

    // Brave: prefer enemy capital when alive
    if (trait === 'brave' && capAlive) {
      if (rand() < 0.7) {
        return { target: { x: enemyFaction.capital.x, y: enemyFaction.capital.y }, type: 'capital' };
      }
    }

    if (best) return { target: { x: best.x, y: best.y }, type: "unit" };
    if (capAlive) return { target: { x: enemyFaction.capital.x, y: enemyFaction.capital.y }, type: "capital" };
    return { target: null, type: null };
  }

  // --- Разрешение боёв ---
  function resolveCombats(st, options = { silent: false }) {
    const rngMax = st.config.rngSpread;
    const map = new Map(); // key "x,y" -> { red: Unit[], blue: Unit[] }
    const push = (k, u) => { if (!map.has(k)) map.set(k, { red: [], blue: [] }); map.get(k)[u.faction].push(u); };
    for (const u of st.factions.red.units) push(`${u.x},${u.y}`, u);
    for (const u of st.factions.blue.units) push(`${u.x},${u.y}`, u);

    const deadRed = new Set();
    const deadBlue = new Set();
    const fightCells = [];

    for (const [key, stack] of map.entries()) {
      if (stack.red.length && stack.blue.length) {
        fightCells.push({ x: Number(key.split(",")[0]), y: Number(key.split(",")[1]) });
        shuffle(stack.red);
        shuffle(stack.blue);
        let i = 0;
        while (i < stack.red.length && i < stack.blue.length) {
          const r = stack.red[i];
          const b = stack.blue[i];
          if (deadRed.has(r.id) || deadBlue.has(b.id)) { i++; continue; }

          const rRoll = r.str + rnd(0, rngMax);
          const bRoll = b.str + rnd(0, rngMax);

          if (rRoll === bRoll) {
            r.hp = Math.max(1, r.hp - Math.floor(bRoll / 4));
            b.hp = Math.max(1, b.hp - Math.floor(rRoll / 4));
            if (!options.silent) log(`${factionMark(r.faction)}${r.id} ~ ${factionMark(b.faction)}${b.id} (R=${r.hp}, B=${b.hp})`);
          } else if (rRoll > bRoll) {
            r.hp = Math.max(1, r.hp - Math.floor(bRoll / 2));
            deadBlue.add(b.id);
            st.stats.kills.red++; st.stats.losses.blue++;
            if (!options.silent) log(`${factionMark(r.faction)}${r.id} добил ${factionMark(b.faction)}${b.id} (HP=${r.hp})`);
          } else {
            b.hp = Math.max(1, b.hp - Math.floor(rRoll / 2));
            deadRed.add(r.id);
            st.stats.kills.blue++; st.stats.losses.red++;
            if (!options.silent) log(`${factionMark(b.faction)}${b.id} добил ${factionMark(r.faction)}${r.id} (HP=${b.hp})`);
          }
          i++;
        }
      }
    }

    if (deadRed.size) st.factions.red.units = st.factions.red.units.filter(u => !deadRed.has(u.id));
    if (deadBlue.size) st.factions.blue.units = st.factions.blue.units.filter(u => !deadBlue.has(u.id));

    return { cells: fightCells };
  }

  // Patch 2: drip reinforcements
  function applyReinforcements(st, options = { silent: false }) {
    const K = Number(st.config?.reinforceEvery || 0);
    if (!K) return;
    if (st.turn === 0) return; // no reinforcements at turn 0
    if (st.turn % K !== 0) return;

    const occ = new Set();
    for (const u of st.factions.red.units) occ.add(`${u.x},${u.y}`);
    for (const u of st.factions.blue.units) occ.add(`${u.x},${u.y}`);

    for (const key of ["red", "blue"]) {
      const fac = st.factions[key];
      if (!fac.capital.alive) continue;
      const cap = fac.capital;
      const capOther = key === 'red' ? st.factions.blue.capital : st.factions.red.capital;
      // Army size cap
      const capLimit = Number(st.config?.armyCap ?? Infinity);
      if (fac.units.length >= capLimit) continue;
      const neigh = [
        { x: cap.x + 1, y: cap.y },
        { x: cap.x - 1, y: cap.y },
        { x: cap.x, y: cap.y + 1 },
        { x: cap.x, y: cap.y - 1 },
      ].filter(p => p.x >= 0 && p.y >= 0 && p.x < st.size && p.y < st.size);
      const free = neigh.filter(p => !occ.has(`${p.x},${p.y}`) && !(p.x === capOther.x && p.y === capOther.y));
      if (!free.length) continue; // skip silently
      const pick = free[Math.floor(rand() * free.length)];
      fac.units.push(newWarrior(key, pick.x, pick.y));
      occ.add(`${pick.x},${pick.y}`);
      if (!options.silent) log(`${factionMark(key)}+ подкрепление @ ${pick.x},${pick.y}`);

      // Patch 3: Greedy accumulates faster — try a second reinforcement if space
      if (fac.leader?.trait === 'greedy' && fac.units.length < capLimit) {
        const free2 = neigh.filter(p => !occ.has(`${p.x},${p.y}`) && !(p.x === capOther.x && p.y === capOther.y));
        if (free2.length) {
          const pick2 = free2[Math.floor(rand() * free2.length)];
          fac.units.push(newWarrior(key, pick2.x, pick2.y));
          occ.add(`${pick2.x},${pick2.y}`);
          if (!options.silent) log(`${factionMark(key)}+ доп. набор (Жадный) @ ${pick2.x},${pick2.y}`);
        }
      }
    }
  }

  // Patch 3: Dynasty handling — heirs and logging
  function handleHeirs(st, options = { silent: false }) {
    for (const key of ["red", "blue"]) {
      const fac = st.factions[key];
      if (fac.capital.alive) continue;

      const unitsAlive = fac.units && fac.units.length > 0;
      if (unitsAlive && !fac.hadHeir) {
        // Spawn heir capital near a random unit
        const heir = { name: randomName(), trait: randomTrait() };
        const u = fac.units[Math.floor(rand() * fac.units.length)];
        const spots = [];
        for (let r = 1; r <= 2; r++) {
          spots.push({ x: u.x + r, y: u.y });
          spots.push({ x: u.x - r, y: u.y });
          spots.push({ x: u.x, y: u.y + r });
          spots.push({ x: u.x, y: u.y - r });
        }
        const valid = spots
          .map(p => ({ x: clamp(p.x, 0, st.size - 1), y: clamp(p.y, 0, st.size - 1) }))
          .filter(p => {
            const occupied = st.factions.red.units.some(x => x.x === p.x && x.y === p.y)
              || st.factions.blue.units.some(x => x.x === p.x && x.y === p.y);
            const other = key === 'red' ? st.factions.blue.capital : st.factions.red.capital;
            const otherCapHere = other.alive && other.x === p.x && other.y === p.y;
            return !occupied && !otherCapHere;
          });
        const place = valid.length ? valid[Math.floor(rand() * valid.length)] : { x: u.x, y: u.y };
        fac.capital = { x: place.x, y: place.y, alive: true };
        fac.hadHeir = true;
        fac.leader = heir;
        fac.leaders.push(heir);
        if (!options.silent) log(`${facLabel(key)} потеряли столицу, новый лидер: ${heir.name} ${traitLabel(heir.trait)}`);
        // Visual feedback
        st.highlights.push({ x: place.x, y: place.y, ttl: 3 });
      }
    }
  }

  function decayHighlights(st) {
    const next = [];
    for (const h of st.highlights) {
      const left = (h.ttl || 0) - 1;
      if (left > 0) next.push({ x: h.x, y: h.y, ttl: left });
    }
    st.highlights = next;
  }

  // --- Условия завершения ---
  function checkVictory(st, options = { silent: false }) {
    const redAlive = st.factions.red.capital.alive;
    const blueAlive = st.factions.blue.capital.alive;
    const bothAlive = redAlive && blueAlive;

    // Лимит ходов
    if (bothAlive && st.turn >= st.config.turnLimit) {
      st.ended = true; st.winner = "Ничья";
      if (!options.silent) log(`Ничья по лимиту ходов (${st.config.turnLimit})`, "win");
      stopLoop();
      return;
    }

    // Оба упали в один ход
    // Patch 3: disabled simultaneous-capitals auto-draw (heirs may spawn)
    if (false) {
      st.ended = true; st.winner = "Ничья";
      if (!options.silent) log("Ничья: двойной снос столиц в один ход", "win");
      stopLoop();
      return;
    }

    if (!bothAlive) {
      st.ended = true;
      if (redAlive && !blueAlive) st.winner = "Красные";
      else if (!redAlive && blueAlive) st.winner = "Синие";
      else st.winner = "Ничья";

      if (!options.silent) {
        const turns = st.turn;
        const lf = st.stats.lastFightCell;
        const summary = [
          `Итог: ${st.winner} (${turns} ходов)`,
          `Размены — R: +${st.stats.kills.red}/-${st.stats.losses.red}, B: +${st.stats.kills.blue}/-${st.stats.losses.blue}`,
          lf ? `Ключевая схватка @ (${lf.x},${lf.y})` : null,
        ].filter(Boolean);
        for (const s of summary) log(s, "win");
        // Patch 3: dynasty summary
        log(`Победившая династия: ${st.winner}`, "win");
        const redList = st.factions.red.leaders.map(l => `${l.name} ${traitLabel(l.trait)}`).join(" → ");
        const blueList = st.factions.blue.leaders.map(l => `${l.name} ${traitLabel(l.trait)}`).join(" → ");
        log(`Лидеры Красных: ${redList || '—'}`, "win");
        log(`Лидеры Синих: ${blueList || '—'}`, "win");
      }
      stopLoop();
    }
  }

  // --- Рендер ---
  function render(st) {
    // Patch 2: show seed and replay toggle
    if (seedInfo) seedInfo.textContent = (st && st.config && st.config.seed != null) ? String(st.config.seed) : '—';
    if (replayBtn) replayBtn.style.display = (st && st.ended) ? '' : 'none';
    turnInfo.textContent = `Ходы: ${st.turn}`;
    redCountEl.textContent = `Красные: ${st.factions.red.units.length}`;
    blueCountEl.textContent = `Синие: ${st.factions.blue.units.length}`;
    combatInfo.textContent = (st.stats.fightStreak > 0)
      ? `В бою: ${st.stats.fightStreak}`
      : `Без боёв: ${st.stats.noFightStreak}`;

    boardEl.innerHTML = "";
    boardEl.style.setProperty("--size", st.size);

    const stacks = new Map(); // "x,y" -> { red: count, blue: count }
    const bump = (k, f) => { if (!stacks.has(k)) stacks.set(k, { red: 0, blue: 0 }); stacks.get(k)[f]++; };
    for (const u of st.factions.red.units) bump(`${u.x},${u.y}`, "red");
    for (const u of st.factions.blue.units) bump(`${u.x},${u.y}`, "blue");

    for (let y = 0; y < st.size; y++) {
      for (let x = 0; x < st.size; x++) {
        const cell = document.createElement("div");
        cell.className = "cell";

        // Подсветка последнего боя
        if (st.highlights.some(h => h.x === x && h.y === y)) cell.classList.add("fight");

        // Столицы
        const isRedCap = st.factions.red.capital.alive && st.factions.red.capital.x === x && st.factions.red.capital.y === y;
        const isBlueCap = st.factions.blue.capital.alive && st.factions.blue.capital.x === x && st.factions.blue.capital.y === y;
        if (isRedCap) {
          cell.classList.add("capital", "red");
          const m = document.createElement("div"); m.className = "cap-mark"; m.textContent = "C:"; cell.appendChild(m);
        } else if (isBlueCap) {
          cell.classList.add("capital", "blue");
          const m = document.createElement("div"); m.className = "cap-mark"; m.textContent = "C:"; cell.appendChild(m);
        }

        // Юниты (стэки)
        const stack = stacks.get(`${x},${y}`);
        if (stack) {
          if (stack.red && stack.blue) {
            const dotR = document.createElement("div"); dotR.className = "unit-dot red"; dotR.style.transform = "translate(-90%, -50%)";
            const dotB = document.createElement("div"); dotB.className = "unit-dot blue"; dotB.style.transform = "translate(-10%, -50%)";
            cell.appendChild(dotR); cell.appendChild(dotB);
            const cntR = document.createElement("div"); cntR.className = "stack-count red"; cntR.textContent = stack.red; cell.appendChild(cntR);
            const cntB = document.createElement("div"); cntB.className = "stack-count blue"; cntB.style.right = "18px"; cntB.textContent = stack.blue; cell.appendChild(cntB);
          } else if (stack.red) {
            const dot = document.createElement("div"); dot.className = "unit-dot red"; cell.appendChild(dot);
            if (stack.red > 1) { const cnt = document.createElement("div"); cnt.className = "stack-count red"; cnt.textContent = stack.red; cell.appendChild(cnt); }
          } else if (stack.blue) {
            const dot = document.createElement("div"); dot.className = "unit-dot blue"; cell.appendChild(dot);
            if (stack.blue > 1) { const cnt = document.createElement("div"); cnt.className = "stack-count blue"; cnt.textContent = stack.blue; cell.appendChild(cnt); }
          }
        }

        boardEl.appendChild(cell);
      }
    }
  }

  // --- Игровой цикл ---
  function startLoop() {
    if (running || state.ended) return;
    running = true; startBtn.textContent = "Стоп"; tick();
  }
  function stopLoop() {
    running = false; startBtn.textContent = "Старт"; if (timer) { clearTimeout(timer); timer = null; }
  }
  function tick() {
    if (!running) return;
    state = step(state);
    render(state);
    const delay = Number(speedRange.value);
    timer = setTimeout(tick, delay);
  }
  function doStep() { stopLoop(); state = step(state); render(state); }
  function reset() {
    stopLoop();
    logEl.innerHTML = "";
    log("Новая партия", "muted");
    state = newGame();
    render(state);
  }

  // --- Серия Best of 5 ---
  function runSeries(n = 5) {
    stopLoop();
    const conf = { preset: presetSelect.value, initialUnits: Number(unitsRange.value), rngSpread: Number(rngRange.value), turnLimit: Number(limitRange.value) };
    let wins = { red: 0, blue: 0, draw: 0 };
    log(`Серия BO${n} — старт`, "muted");
    for (let i = 1; i <= n; i++) {
      // новая игра
      state = newGame();
      // быстрая симуляция без рендера/подробного лога
      while (!state.ended && state.turn < state.config.turnLimit) {
        state = step(state, { silent: true });
      }
      // Итог матча
      if (state.winner === "Красные") wins.red++; else if (state.winner === "Синие") wins.blue++; else wins.draw++;
      log(`Матч ${i}: ${state.winner} (${state.turn} ходов)`, "muted");
    }
    const totalPlayed = wins.red + wins.blue + wins.draw;
    const redPct = Math.round((wins.red / totalPlayed) * 100);
    const bluePct = Math.round((wins.blue / totalPlayed) * 100);
    log(`Итог серии — R:${wins.red} B:${wins.blue} D:${wins.draw} | R=${redPct}% B=${bluePct}%`, "win");
    // показать последнее состояние
    render(state);
  }

  // --- Привязка UI ---
  startBtn.addEventListener("click", () => { if (running) stopLoop(); else startLoop(); });
  stepBtn.addEventListener("click", () => doStep());
  resetBtn.addEventListener("click", () => reset());
  seriesBtn?.addEventListener("click", () => runSeries(5));

  speedRange.addEventListener("change", () => { if (running) { stopLoop(); startLoop(); } });
  presetSelect.addEventListener("change", () => reset());
  unitsRange.addEventListener("input", () => { unitsVal.textContent = unitsRange.value; });
  unitsRange.addEventListener("change", () => reset());
  rngRange.addEventListener("input", () => { rngVal.textContent = rngRange.value; });
  rngRange.addEventListener("change", () => reset());
  limitRange.addEventListener("input", () => { limitVal.textContent = limitRange.value; });
  limitRange.addEventListener("change", () => reset());

  // Patch 2: init extra controls and events
  ensureExtraControls();
  if (formationSelect) formationSelect.addEventListener('change', () => reset());
  if (reinforceSelect) reinforceSelect.addEventListener('change', () => reset());
  if (armyCapRange) {
    armyCapRange.addEventListener('input', () => { if (armyCapVal) armyCapVal.textContent = armyCapRange.value; });
    armyCapRange.addEventListener('change', () => reset());
  }
  if (replayBtn) replayBtn.addEventListener('click', () => { if (state && state.config && state.config.seed != null) { window._nextSeed = state.config.seed; reset(); } });

  // --- Инициализация ---
  // начальные значения подсказок
  if (unitsVal) unitsVal.textContent = unitsRange.value;
  if (rngVal) rngVal.textContent = rngRange.value;
  if (limitVal) limitVal.textContent = limitRange.value;
  if (armyCapVal && armyCapRange) armyCapVal.textContent = armyCapRange.value;

  state = newGame();
  render(state);
  log("Добро пожаловать! Нажмите Старт или делайте шаги.", "muted");
})();
