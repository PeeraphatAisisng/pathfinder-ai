/**
 * PathFinder AI — ส่วนติดต่อผู้ใช้ (หน้าจอ, การวาดแผนที่, แอนิเมชัน)
 * ตรรกะการค้นหาทั้งหมดอยู่ใน js/algorithms.js
 */
(() => {
  'use strict';

  const A = window.PathAlgorithms;
  const ROWS = 23;
  const COLS = 51;
  const DEFAULT_START = [11, 10];
  const DEFAULT_GOAL = [11, 40];

  // ความเร็วแอนิเมชัน: จำนวนช่องที่แสดงต่อเฟรม (60 เฟรม/วินาที)
  const SPEEDS = [0.15, 0.3, 0.6, 1, 2, 3, 5, 9, 18, Infinity];
  const SPEED_LABELS = ['ช้ามาก', 'ช้ามาก', 'ช้า', 'ช้า', 'ปานกลาง', 'ปานกลาง', 'เร็ว', 'เร็ว', 'เร็วมาก', 'ทันที'];

  const $ = (sel) => document.querySelector(sel);
  const els = {
    grid: $('#grid'),
    algo: $('#algo'),
    heuristic: $('#heuristic'),
    speed: $('#speed'),
    speedLabel: $('#speedLabel'),
    run: $('#runBtn'),
    compare: $('#compareBtn'),
    maze: $('#mazeBtn'),
    random: $('#randomBtn'),
    clearPath: $('#clearPathBtn'),
    clearAll: $('#clearAllBtn'),
    status: $('#status'),
    statExpanded: $('#statExpanded'),
    statSteps: $('#statSteps'),
    statCost: $('#statCost'),
    statTime: $('#statTime'),
    info: $('#info'),
    compareSection: $('#compareSection'),
    compareBody: $('#compareBody'),
    compareSummary: $('#compareSummary'),
  };

  const state = {
    grid: A.emptyGrid(ROWS, COLS),
    start: DEFAULT_START.slice(),
    goal: DEFAULT_GOAL.slice(),
    tool: 'wall',
    drag: null,        // { type: 'start' | 'goal' } หรือ { type: 'paint', value }
    animToken: 0,      // ใช้ยกเลิกแอนิเมชันเก่าเมื่อเริ่มใหม่
    shownAlgo: null,   // อัลกอริทึมที่ผลกำลังแสดงอยู่ (ใช้คำนวณใหม่อัตโนมัติเมื่อแก้แผนที่)
    marked: [],        // เซลล์ที่ถูกระบายสีผลค้นหา (เพื่อล้างได้เร็ว)
  };

  const cells = [];

  /* ================= สร้างหน้าจอ ================= */

  function init() {
    for (const id of A.ALGORITHM_ORDER) {
      els.algo.add(new Option(A.ALGORITHMS[id].name, id));
    }
    els.algo.value = 'astar';
    for (const [id, h] of Object.entries(A.HEURISTICS)) {
      els.heuristic.add(new Option(h.name, id));
    }

    buildGrid();
    bindEvents();
    updateSpeedLabel();
    updateInfo();
    sizeCells();
  }

  function buildGrid() {
    els.grid.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
    const frag = document.createDocumentFragment();
    for (let r = 0; r < ROWS; r++) {
      cells.push([]);
      for (let c = 0; c < COLS; c++) {
        const div = document.createElement('div');
        div.className = 'cell';
        div.dataset.r = r;
        div.dataset.c = c;
        frag.appendChild(div);
        cells[r].push(div);
      }
    }
    els.grid.appendChild(frag);
    renderAll();
  }

  function sizeCells() {
    const w = cells[0][0].getBoundingClientRect().width;
    els.grid.style.setProperty('--cell-size', w + 'px');
  }

  const isAt = (p, r, c) => p[0] === r && p[1] === c;

  function renderCell(r, c) {
    const el = cells[r][c];
    const v = state.grid[r][c];
    el.classList.toggle('wall', v === A.WALL);
    el.classList.toggle('weight', v === A.WEIGHT);
    el.classList.toggle('start', isAt(state.start, r, c));
    el.classList.toggle('goal', isAt(state.goal, r, c));
  }

  function renderAll() {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) renderCell(r, c);
  }

  /* ================= การวาดแผนที่ด้วยเมาส์/นิ้ว ================= */

  function cellFromPoint(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || !el.classList.contains('cell')) return null;
    return [Number(el.dataset.r), Number(el.dataset.c)];
  }

  function toolValue() {
    return state.tool === 'wall' ? A.WALL : state.tool === 'weight' ? A.WEIGHT : A.EMPTY;
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const p = cellFromPoint(e);
    if (!p) return;
    e.preventDefault();
    const [r, c] = p;
    if (isAt(state.start, r, c)) { state.drag = { type: 'start' }; return; }
    if (isAt(state.goal, r, c)) { state.drag = { type: 'goal' }; return; }
    const target = toolValue();
    // คลิกซ้ำบนช่องชนิดเดียวกัน = ลบออก
    const value = state.grid[r][c] === target && target !== A.EMPTY ? A.EMPTY : target;
    state.drag = { type: 'paint', value };
    paint(r, c, value);
  }

  function onPointerMove(e) {
    if (!state.drag) return;
    const p = cellFromPoint(e);
    if (!p) return;
    if (state.drag.type === 'paint') paint(p[0], p[1], state.drag.value);
    else moveEndpoint(state.drag.type, p[0], p[1]);
  }

  function paint(r, c, value) {
    if (isAt(state.start, r, c) || isAt(state.goal, r, c)) return;
    if (state.grid[r][c] === value) return;
    state.grid[r][c] = value;
    renderCell(r, c);
    onGridChanged();
  }

  function moveEndpoint(type, r, c) {
    const other = type === 'start' ? state.goal : state.start;
    if (isAt(other, r, c) || isAt(state[type], r, c)) return;
    const old = state[type];
    state[type] = [r, c];
    state.grid[r][c] = A.EMPTY;
    renderCell(old[0], old[1]);
    renderCell(r, c);
    onGridChanged();
  }

  // เมื่อแผนที่เปลี่ยน: ถ้ามีผลแสดงอยู่ คำนวณใหม่ทันที (ไม่มีแอนิเมชัน) ให้เห็นผลแบบสด ๆ
  function onGridChanged() {
    if (state.shownAlgo) showInstant(state.shownAlgo);
    if (!els.compareSection.hidden) compareAll(false);
  }

  /* ================= การแสดงผลค้นหา ================= */

  function cancelAnimation() {
    state.animToken++;
    els.grid.classList.remove('busy');
  }

  function clearMarks() {
    for (const el of state.marked) el.classList.remove('visited', 'path');
    state.marked = [];
  }

  function mark(p, cls) {
    const el = cells[p[0]][p[1]];
    el.classList.add(cls);
    state.marked.push(el);
  }

  function runSearch(algo) {
    return A.search(algo, state.grid, state.start, state.goal, { heuristic: els.heuristic.value });
  }

  function showInstant(algo) {
    cancelAnimation();
    clearMarks();
    els.grid.classList.add('instant');
    const res = runSearch(algo);
    for (const p of res.visitedOrder) mark(p, 'visited');
    for (const p of res.path) mark(p, 'path');
    updateStats(res, res.expanded);
    setStatus(res);
    // เปิดแอนิเมชันกลับหลังจากเบราว์เซอร์วาดเสร็จ
    requestAnimationFrame(() => requestAnimationFrame(() => els.grid.classList.remove('instant')));
  }

  function runAnimated(algo) {
    cancelAnimation();
    clearMarks();
    els.grid.classList.remove('instant');
    const res = runSearch(algo);
    state.shownAlgo = algo;
    const speed = SPEEDS[Number(els.speed.value) - 1];

    if (speed === Infinity) { showInstant(algo); return; }

    const token = state.animToken;
    const order = res.visitedOrder;
    let i = 0;
    let acc = 0;
    els.status.className = 'status busy';
    els.status.textContent = `กำลังค้นหาด้วย ${A.ALGORITHMS[algo].short} …`;
    updateStats(null);

    const exploreFrame = () => {
      if (token !== state.animToken) return;
      acc += speed;
      while (acc >= 1 && i < order.length) {
        mark(order[i++], 'visited');
        acc -= 1;
      }
      els.statExpanded.textContent = i.toLocaleString();
      if (i < order.length) requestAnimationFrame(exploreFrame);
      else { let j = 0; pathFrame(j); }
    };

    const pathFrame = (j) => {
      if (token !== state.animToken) return;
      const end = Math.min(j + 2, res.path.length);
      for (; j < end; j++) mark(res.path[j], 'path');
      if (j < res.path.length) requestAnimationFrame(() => pathFrame(j));
      else { updateStats(res, res.expanded); setStatus(res); }
    };

    requestAnimationFrame(exploreFrame);
  }

  function setStatus(res) {
    const name = A.ALGORITHMS[res.algorithm].short;
    if (res.found) {
      els.status.className = 'status ok';
      els.status.textContent = `✓ ${name} พบเส้นทางแล้ว`;
    } else {
      els.status.className = 'status fail';
      els.status.textContent = `✕ ${name} ไม่พบเส้นทาง (ถูกกำแพงปิดล้อม)`;
    }
  }

  function updateStats(res, expanded) {
    if (!res) {
      els.statExpanded.textContent = '0';
      els.statSteps.textContent = '–';
      els.statCost.textContent = '–';
      els.statTime.textContent = '–';
      return;
    }
    els.statExpanded.textContent = expanded.toLocaleString();
    els.statSteps.textContent = res.found ? res.steps : '–';
    els.statCost.textContent = res.found ? res.cost : '–';
    els.statTime.textContent = res.timeMs.toFixed(2);
  }

  function resetResult(message = 'พร้อมค้นหา') {
    cancelAnimation();
    clearMarks();
    state.shownAlgo = null;
    els.status.className = 'status';
    els.status.textContent = message;
    els.statExpanded.textContent = '–';
    els.statSteps.textContent = '–';
    els.statCost.textContent = '–';
    els.statTime.textContent = '–';
  }

  /* ================= เปรียบเทียบทุกอัลกอริทึม ================= */

  function compareAll(scroll = true) {
    const results = A.ALGORITHM_ORDER.map((id) => runSearch(id));
    const ucs = results.find((r) => r.algorithm === 'ucs');
    const maxExpanded = Math.max(1, ...results.map((r) => r.expanded));
    const optimal = (r) => r.found && ucs.found && Math.abs(r.cost - ucs.cost) < 1e-9;
    const optimalOnes = results.filter(optimal);
    const fewest = optimalOnes.length ? Math.min(...optimalOnes.map((r) => r.expanded)) : -1;

    els.compareBody.innerHTML = '';
    for (const r of results) {
      const tr = document.createElement('tr');
      const isWinner = optimal(r) && r.expanded === fewest;
      if (isWinner) tr.className = 'winner';
      const pct = (r.expanded / maxExpanded) * 100;
      const badge = !r.found
        ? '<span class="badge none">ไม่พบทาง</span>'
        : optimal(r) ? '<span class="badge yes">ใช่</span>' : '<span class="badge no">ไม่ใช่</span>';
      tr.innerHTML = `
        <td>${A.ALGORITHMS[r.algorithm].short}</td>
        <td class="num"><div class="bar-cell"><div class="bar ${isWinner ? 'best' : ''}" style="width:${Math.max(2, pct)}%"></div>${r.expanded.toLocaleString()}</div></td>
        <td class="num">${r.found ? r.steps : '–'}</td>
        <td class="num">${r.found ? r.cost : '–'}</td>
        <td class="num">${r.timeMs.toFixed(2)}</td>
        <td>${badge}</td>
        <td><button class="btn small" data-show="${r.algorithm}">ดูแอนิเมชัน</button></td>`;
      els.compareBody.appendChild(tr);
    }

    const astar = results.find((r) => r.algorithm === 'astar');
    if (!ucs.found) {
      els.compareSummary.textContent = 'ไม่มีอัลกอริทึมใดหาทางได้ เพราะเป้าหมายถูกกำแพงปิดล้อม';
    } else if (astar.expanded < ucs.expanded) {
      const saved = Math.round((1 - astar.expanded / ucs.expanded) * 100);
      els.compareSummary.textContent = `A* ได้ทางที่ดีที่สุดเหมือน UCS แต่สำรวจน้อยกว่า ${saved}% เพราะมีฮิวริสติกช่วยชี้ทิศ`;
    } else {
      els.compareSummary.textContent = 'บนแผนที่นี้ A* และ UCS สำรวจจำนวนช่องใกล้เคียงกัน (ทางบังคับ เช่น เขาวงกตทางเดียว)';
    }

    els.compareSection.hidden = false;
    if (scroll) els.compareSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ================= แผงคำอธิบายอัลกอริทึม ================= */

  function updateInfo() {
    const a = A.ALGORITHMS[els.algo.value];
    els.heuristic.disabled = !a.usesHeuristic;
    els.info.innerHTML = `
      <h3>${a.name}</h3>
      <p>${a.idea}</p>
      <dl>
        <dt>waiting_list</dt><dd>${a.structure}</dd>
        <dt>Complete</dt><dd>${a.complete}</dd>
        <dt>Optimal</dt><dd>${a.optimal}</dd>
        <dt>ใช้ h(n)</dt><dd>${a.usesHeuristic ? 'ใช่' : 'ไม่ใช้'}</dd>
      </dl>`;
  }

  function updateSpeedLabel() {
    els.speedLabel.textContent = `(${SPEED_LABELS[Number(els.speed.value) - 1]})`;
  }

  /* ================= ปุ่มต่าง ๆ ================= */

  function setBoard(grid, start, goal) {
    state.grid = grid;
    state.start = start;
    state.goal = goal;
    state.grid[start[0]][start[1]] = A.EMPTY;
    state.grid[goal[0]][goal[1]] = A.EMPTY;
    resetResult();
    renderAll();
    if (!els.compareSection.hidden) compareAll(false);
  }

  function bindEvents() {
    els.grid.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', () => { state.drag = null; });
    window.addEventListener('pointercancel', () => { state.drag = null; });
    window.addEventListener('resize', sizeCells);

    els.run.addEventListener('click', () => runAnimated(els.algo.value));
    els.compare.addEventListener('click', () => compareAll(true));

    els.algo.addEventListener('change', () => {
      updateInfo();
      if (state.shownAlgo) resetResult();
    });
    els.heuristic.addEventListener('change', () => {
      if (state.shownAlgo) showInstant(state.shownAlgo);
      if (!els.compareSection.hidden) compareAll(false);
    });
    els.speed.addEventListener('input', updateSpeedLabel);

    document.querySelectorAll('.tool').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.tool = btn.dataset.tool;
        document.querySelectorAll('.tool').forEach((b) => {
          const on = b === btn;
          b.classList.toggle('active', on);
          b.setAttribute('aria-checked', String(on));
        });
      });
    });

    els.maze.addEventListener('click', () => {
      setBoard(A.generateMaze(ROWS, COLS, { loops: 0.07 }), [1, 1], [ROWS - 2, COLS - 2]);
    });
    els.random.addEventListener('click', () => {
      setBoard(A.randomGrid(ROWS, COLS, { wall: 0.26, weight: 0.12 }), state.start, state.goal);
    });
    els.clearPath.addEventListener('click', () => resetResult());
    els.clearAll.addEventListener('click', () => {
      setBoard(A.emptyGrid(ROWS, COLS), DEFAULT_START.slice(), DEFAULT_GOAL.slice());
    });

    els.compareBody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-show]');
      if (!btn) return;
      els.algo.value = btn.dataset.show;
      updateInfo();
      els.grid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      runAnimated(btn.dataset.show);
    });

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !['SELECT', 'INPUT', 'BUTTON'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        runAnimated(els.algo.value);
      }
    });
  }

  init();
})();
