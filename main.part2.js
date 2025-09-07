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

