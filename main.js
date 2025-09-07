// Мини-стратегия: первая версия игры
// Карта 10x10, 2 фракции (красные/синие), юниты-воины.

(function () {
  "use strict";

  // --- Константы ---
  const SIZE = 10; // 10x10
  const INITIAL_UNITS = 6; // стартовое количество воинов у каждой стороны
  const MAX_LOG = 80; // лимит сообщений в логе

  // --- DOM ---
  const boardEl = document.getElementById("board");
  const logEl = document.getElementById("log");
  const startBtn = document.getElementById("startBtn");
  const stepBtn = document.getElementById("stepBtn");
  const resetBtn = document.getElementById("resetBtn");
  const speedRange = document.getElementById("speedRange");
  const turnInfo = document.getElementById("turnInfo");
  const redCountEl = document.getElementById("redCount");
  const blueCountEl = document.getElementById("blueCount");

  // --- Состояние игры ---
  let state = null; // текущее состояние
  let running = false;
  let timer = null;

  // Утилиты
  const id = (() => { let i = 1; return () => i++; })();
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  function log(msg, css = "") {
    const p = document.createElement("p");
    if (css) p.className = css;
    p.textContent = msg;
    logEl.appendChild(p);
    while (logEl.children.length > MAX_LOG) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }

  // --- Генерация начального состояния ---
  function newGame() {
    const red = {
      name: "Красные",
      key: "red",
      color: "red",
      capital: { x: 0, y: 0, alive: true },
      units: [],
    };
    const blue = {
      name: "Синие",
      key: "blue",
      color: "blue",
      capital: { x: SIZE - 1, y: SIZE - 1, alive: true },
      units: [],
    };

    const st = {
      size: SIZE,
      turn: 0,
      factions: { red, blue },
      ended: false,
      winner: null,
    };

    // Разместить начальных воинов возле столицы
    spawnInitialUnits(st, red);
    spawnInitialUnits(st, blue);

    return st;
  }

  function spawnInitialUnits(st, faction) {
    const { x: cx, y: cy } = faction.capital;
    const placed = new Set([`${cx},${cy}`]); // избегаем столицы

    for (let i = 0; i < INITIAL_UNITS; i++) {
      // пробуем несколько позиций в радиусе 2 клеток
      let tries = 0;
      let x, y;
      do {
        x = clamp(cx + rnd(-2, 2), 0, st.size - 1);
        y = clamp(cy + rnd(-2, 2), 0, st.size - 1);
        tries++;
        if (tries > 30) break; // fallback
      } while (placed.has(`${x},${y}`));
      placed.add(`${x},${y}`);
      faction.units.push(newWarrior(faction.key, x, y));
    }
  }

  function newWarrior(factionKey, x, y) {
    return {
      id: id(),
      faction: factionKey, // 'red' | 'blue'
      x, y,
      hp: 100,
      str: 10,
    };
  }

  // --- Симуляция одного хода ---
  function step(st) {
    if (st.ended) return st;
    st.turn++;

    const red = st.factions.red;
    const blue = st.factions.blue;

    // 1) Движение всех юнитов
    const allUnits = [...red.units, ...blue.units];
    // случайный порядок — меньше артефактов
    shuffle(allUnits);
    for (const u of allUnits) {
      const enemyFaction = u.faction === "red" ? blue : red;
      const { target, type } = chooseTarget(st, u, enemyFaction);
      if (!target) continue;

      // Если уже на цели (юнит)
      if (type === "unit" && u.x === target.x && u.y === target.y) {
        continue; // столкновение обработаем после движений
      }

      // Если цель — столица и мы на ней
      if (type === "capital" && u.x === target.x && u.y === target.y) {
        continue; // разрушение проверим отдельно после движений
      }

      // Сделать один шаг по Манхэттену
      const dx = Math.sign(target.x - u.x);
      const dy = Math.sign(target.y - u.y);
      // выбираем ось с большим расстоянием, при равенстве — случайно
      let stepAxis;
      const distX = Math.abs(target.x - u.x);
      const distY = Math.abs(target.y - u.y);
      if (distX > distY) stepAxis = "x";
      else if (distY > distX) stepAxis = "y";
      else stepAxis = Math.random() < 0.5 ? "x" : "y";

      if (stepAxis === "x") u.x = clamp(u.x + dx, 0, st.size - 1);
      else u.y = clamp(u.y + dy, 0, st.size - 1);
    }

    // 2) Проверка входа на вражескую столицу
    for (const u of allUnits) {
      const enemyFaction = u.faction === "red" ? blue : red;
      const cap = enemyFaction.capital;
      if (cap.alive && u.x === cap.x && u.y === cap.y) {
        cap.alive = false;
        log(`${fName(u.faction)} воин #${u.id} уничтожил столицу ${enemyFaction.name}!`, "win");
      }
    }

    // 3) Бои на клетках, где встретились стороны
    resolveCombats(st);

    // 4) Условие победы
    checkVictory(st);

    return st;
  }

  function fName(key) { return key === "red" ? "Красных" : "Синих"; }

  function chooseTarget(st, unit, enemyFaction) {
    // приоритет: ближайший вражеский юнит, иначе — столица, если жива
    let best = null;
    let bestDist = Infinity;
    for (const e of enemyFaction.units) {
      const d = manhattan(unit, e);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    if (best) return { target: { x: best.x, y: best.y }, type: "unit" };
    if (enemyFaction.capital.alive) {
      return { target: { x: enemyFaction.capital.x, y: enemyFaction.capital.y }, type: "capital" };
    }
    return { target: null, type: null };
  }

  function resolveCombats(st) {
    const map = new Map(); // key "x,y" -> { red: Unit[], blue: Unit[] }
    const push = (k, u) => {
      if (!map.has(k)) map.set(k, { red: [], blue: [] });
      map.get(k)[u.faction].push(u);
    };

    for (const u of st.factions.red.units) push(`${u.x},${u.y}`, u);
    for (const u of st.factions.blue.units) push(`${u.x},${u.y}`, u);

    const deadRed = new Set();
    const deadBlue = new Set();

    for (const [key, stack] of map.entries()) {
      if (stack.red.length && stack.blue.length) {
        shuffle(stack.red);
        shuffle(stack.blue);
        let i = 0;
        while (i < stack.red.length && i < stack.blue.length) {
          const r = stack.red[i];
          const b = stack.blue[i];
          if (deadRed.has(r.id) || deadBlue.has(b.id)) { i++; continue; }

          const rRoll = r.str + rnd(0, 20);
          const bRoll = b.str + rnd(0, 20);

          if (rRoll === bRoll) {
            // ничья — оба чуть устают
            r.hp = Math.max(1, r.hp - Math.floor(bRoll / 4));
            b.hp = Math.max(1, b.hp - Math.floor(rRoll / 4));
            log(`Ничья на (${key}) — #${r.id} и #${b.id} разошлись потрёпанными.`);
          } else if (rRoll > bRoll) {
            // красный победил, здоровье урезается в зависимости от силы противника
            r.hp = Math.max(1, r.hp - Math.floor(bRoll / 2));
            deadBlue.add(b.id);
            log(`Бой на (${key}): Красный #${r.id} победил Синего #${b.id}.`);
          } else {
            b.hp = Math.max(1, b.hp - Math.floor(rRoll / 2));
            deadRed.add(r.id);
            log(`Бой на (${key}): Синий #${b.id} победил Красного #${r.id}.`);
          }
          i++;
        }
      }
    }

    // удалить павших
    if (deadRed.size) {
      st.factions.red.units = st.factions.red.units.filter(u => !deadRed.has(u.id));
    }
    if (deadBlue.size) {
      st.factions.blue.units = st.factions.blue.units.filter(u => !deadBlue.has(u.id));
    }
  }

  function checkVictory(st) {
    const redAlive = st.factions.red.capital.alive;
    const blueAlive = st.factions.blue.capital.alive;
    if (redAlive && blueAlive) return;
    st.ended = true;
    if (redAlive && !blueAlive) {
      st.winner = "Красные";
      log("Победа: Красные удержали свою столицу!", "win");
    } else if (!redAlive && blueAlive) {
      st.winner = "Синие";
      log("Победа: Синие удержали свою столицу!", "win");
    } else {
      st.winner = "Ничья";
      log("Обе столицы уничтожены. Ничья.", "win");
    }
    stopLoop();
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // --- Отрисовка ---
  function render(st) {
    // счетчики
    turnInfo.textContent = `Ход: ${st.turn}`;
    redCountEl.textContent = `Красные: ${st.factions.red.units.length}`;
    blueCountEl.textContent = `Синие: ${st.factions.blue.units.length}`;

    // поле
    boardEl.innerHTML = "";
    boardEl.style.setProperty("--size", st.size);

    // подготовим карту стека юнитов на клетке
    const stacks = new Map(); // "x,y" -> { red: count, blue: count }
    const bump = (k, f) => {
      if (!stacks.has(k)) stacks.set(k, { red: 0, blue: 0 });
      stacks.get(k)[f]++;
    };
    for (const u of st.factions.red.units) bump(`${u.x},${u.y}`, "red");
    for (const u of st.factions.blue.units) bump(`${u.x},${u.y}`, "blue");

    for (let y = 0; y < st.size; y++) {
      for (let x = 0; x < st.size; x++) {
        const cell = document.createElement("div");
        cell.className = "cell";

        // столицы
        const isRedCap = st.factions.red.capital.alive && st.factions.red.capital.x === x && st.factions.red.capital.y === y;
        const isBlueCap = st.factions.blue.capital.alive && st.factions.blue.capital.x === x && st.factions.blue.capital.y === y;
        if (isRedCap) {
          cell.classList.add("capital", "red");
          const m = document.createElement("div");
          m.className = "cap-mark";
          m.textContent = "★";
          cell.appendChild(m);
        } else if (isBlueCap) {
          cell.classList.add("capital", "blue");
          const m = document.createElement("div");
          m.className = "cap-mark";
          m.textContent = "★";
          cell.appendChild(m);
        }

        // юниты
        const stack = stacks.get(`${x},${y}`);
        if (stack) {
          // Если обе стороны, показываем две точки поменьше
          if (stack.red && stack.blue) {
            const dotR = document.createElement("div");
            dotR.className = "unit-dot red";
            dotR.style.transform = "translate(-90%, -50%)";
            const dotB = document.createElement("div");
            dotB.className = "unit-dot blue";
            dotB.style.transform = "translate(-10%, -50%)";
            cell.appendChild(dotR);
            cell.appendChild(dotB);

            const cntR = document.createElement("div");
            cntR.className = "stack-count red";
            cntR.textContent = stack.red;
            const cntB = document.createElement("div");
            cntB.className = "stack-count blue";
            cntB.style.right = "18px";
            cntB.textContent = stack.blue;
            cell.appendChild(cntR);
            cell.appendChild(cntB);
          } else if (stack.red) {
            const dot = document.createElement("div");
            dot.className = "unit-dot red";
            cell.appendChild(dot);
            if (stack.red > 1) {
              const cnt = document.createElement("div");
              cnt.className = "stack-count red";
              cnt.textContent = stack.red;
              cell.appendChild(cnt);
            }
          } else if (stack.blue) {
            const dot = document.createElement("div");
            dot.className = "unit-dot blue";
            cell.appendChild(dot);
            if (stack.blue > 1) {
              const cnt = document.createElement("div");
              cnt.className = "stack-count blue";
              cnt.textContent = stack.blue;
              cell.appendChild(cnt);
            }
          }
        }

        boardEl.appendChild(cell);
      }
    }
  }

  // --- Игровой цикл ---
  function startLoop() {
    if (running || state.ended) return;
    running = true;
    startBtn.textContent = "Пауза";
    tick();
  }

  function stopLoop() {
    running = false;
    startBtn.textContent = "Старт";
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function tick() {
    if (!running) return;
    state = step(state);
    render(state);
    const delay = Number(speedRange.value);
    timer = setTimeout(tick, delay);
  }

  function doStep() {
    stopLoop();
    state = step(state);
    render(state);
  }

  function reset() {
    stopLoop();
    logEl.innerHTML = "";
    log("Новая игра", "muted");
    state = newGame();
    render(state);
  }

  // --- События UI ---
  startBtn.addEventListener("click", () => {
    if (running) stopLoop(); else startLoop();
  });
  stepBtn.addEventListener("click", () => doStep());
  resetBtn.addEventListener("click", () => reset());
  speedRange.addEventListener("change", () => {
    if (running) { // моментально применить новый темп
      stopLoop();
      startLoop();
    }
  });

  // --- Инициализация ---
  state = newGame();
  render(state);
  log("Добро пожаловать! Нажмите Старт для симуляции.", "muted");
})();

