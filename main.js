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
  };

  const MAX_LOG = 120;

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

  // --- Глобальное состояние ---
  let state = null;
  let running = false;
  let timer = null;

  // --- Утилиты ---
  const id = (() => { let i = 1; return () => i++; })();
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
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
      const j = Math.floor(Math.random() * (i + 1));
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
    };
    const layout = computePreset(conf);

    const red = { name: "Красные", key: "red", color: "red", capital: { x: layout.red.x, y: layout.red.y, alive: true }, units: [] };
    const blue = { name: "Синие", key: "blue", color: "blue", capital: { x: layout.blue.x, y: layout.blue.y, alive: true }, units: [] };

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
    return st;
  }

  function spawnInitialUnits(st, faction) {
    const { x: cx, y: cy } = faction.capital;
    const placed = new Set([`${cx},${cy}`]);
    for (let i = 0; i < st.config.initialUnits; i++) {
      let tries = 0, x, y;
      do {
        x = clamp(cx + rnd(-2, 2), 0, st.size - 1);
        y = clamp(cy + rnd(-2, 2), 0, st.size - 1);
        tries++;
        if (tries > 50) break;
      } while (placed.has(`${x},${y}`));
      placed.add(`${x},${y}`);
      faction.units.push(newWarrior(faction.key, x, y));
    }
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
      const { target, type } = chooseTarget(st, u, enemyFaction);
      if (!target) continue;

      // Уже на цели-юните — не двигаемся
      if (type === "unit" && u.x === target.x && u.y === target.y) continue;
      // Уже на клетке столицы — не двигаемся
      if (type === "capital" && u.x === target.x && u.y === target.y) continue;

      const dx = Math.sign(target.x - u.x);
      const dy = Math.sign(target.y - u.y);
      const distX = Math.abs(target.x - u.x);
      const distY = Math.abs(target.y - u.y);
      const stepAxis = distX > distY ? "x" : distY > distX ? "y" : (Math.random() < 0.5 ? "x" : "y");
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
    checkVictory(st, options);

    return st;
  }

  // --- Выбор цели (анти-беготня: при равной дистанции — цель с наименьшим HP) ---
  function chooseTarget(st, unit, enemyFaction) {
    let best = null;
    let bestDist = Infinity;
    for (const e of enemyFaction.units) {
      const d = manhattan(unit, e);
      if (d < bestDist) { best = e; bestDist = d; }
      else if (d === bestDist && best && e.hp < best.hp) { best = e; }
    }
    if (best) return { target: { x: best.x, y: best.y }, type: "unit" };
    if (enemyFaction.capital.alive) return { target: { x: enemyFaction.capital.x, y: enemyFaction.capital.y }, type: "capital" };
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
    if (st._capKillThisTurn.red && st._capKillThisTurn.blue) {
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
      }
      stopLoop();
    }
  }

  // --- Рендер ---
  function render(st) {
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

  // --- Инициализация ---
  // начальные значения подсказок
  if (unitsVal) unitsVal.textContent = unitsRange.value;
  if (rngVal) rngVal.textContent = rngRange.value;
  if (limitVal) limitVal.textContent = limitRange.value;

  state = newGame();
  render(state);
  log("Добро пожаловать! Нажмите Старт или делайте шаги.", "muted");
})();

