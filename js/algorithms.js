/**
 * PathFinder AI — อัลกอริทึมค้นหาเส้นทาง (AI Search)
 *
 * ไฟล์นี้เป็น "สมอง" ของโปรแกรม ไม่ยุ่งกับหน้าจอเลย จึงใช้ได้ทั้งในเบราว์เซอร์และ Node.js (สำหรับเทสต์)
 * ชื่อตัวแปรหลักตั้งให้ตรงกับโค้ดในชั้นเรียน:
 *   waitingList  = waiting_list  (รายการช่องที่รอสำรวจ / frontier)
 *   cameFrom     = came_from     (จำว่าแต่ละช่องมาจากช่องไหน เพื่อย้อนหาเส้นทาง)
 *   current      = current       (ช่องที่กำลังสำรวจอยู่)
 *
 * แผนที่ (grid) เป็นอาร์เรย์ 2 มิติ: 0 = ทางว่าง, 1 = กำแพง, 2 = พื้นโคลน (เดินผ่านได้แต่ต้นทุนสูง)
 * เดินได้ 4 ทิศ: บน ขวา ล่าง ซ้าย
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PathAlgorithms = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EMPTY = 0;
  const WALL = 1;
  const WEIGHT = 2;
  const WEIGHT_COST = 5; // ต้นทุนการเดินเข้าช่องโคลน (ช่องปกติ = 1)
  const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // บน ขวา ล่าง ซ้าย

  /* ---------- ข้อมูลอธิบายแต่ละอัลกอริทึม (ใช้แสดงบนหน้าจอ) ---------- */
  const ALGORITHMS = {
    bfs: {
      name: 'Breadth-First Search (BFS)',
      short: 'BFS',
      structure: 'Queue (คิว) — เข้าก่อน ออกก่อน',
      complete: 'ใช่',
      optimal: 'ใช่ เมื่อทุกช่องมีต้นทุนเท่ากัน (ไม่สนใจโคลน)',
      usesHeuristic: false,
      idea: 'สำรวจกระจายออกเป็นวงทีละชั้น ช่องที่ใกล้จุดเริ่มต้น (นับจำนวนก้าว) จะถูกสำรวจก่อนเสมอ',
    },
    dfs: {
      name: 'Depth-First Search (DFS)',
      short: 'DFS',
      structure: 'Stack (สแตก) — เข้าทีหลัง ออกก่อน',
      complete: 'ใช่ (บนแผนที่ขนาดจำกัด และจำช่องที่เคยไปแล้ว)',
      optimal: 'ไม่ใช่ — มักได้เส้นทางที่อ้อมมาก',
      usesHeuristic: false,
      idea: 'มุ่งลึกไปทางเดียวจนสุดทางก่อน แล้วจึงย้อนกลับมาลองทางอื่น',
    },
    ucs: {
      name: "Uniform-Cost Search (UCS / Dijkstra)",
      short: 'UCS',
      structure: 'Priority Queue เรียงตาม g(n) = ต้นทุนสะสมจากจุดเริ่มต้น',
      complete: 'ใช่',
      optimal: 'ใช่ — ได้เส้นทางต้นทุนต่ำสุดเสมอ (คิดต้นทุนโคลนด้วย)',
      usesHeuristic: false,
      idea: 'เลือกสำรวจช่องที่ “เดินมาถึงได้ถูกที่สุด” ก่อน จึงรู้จักหลบพื้นโคลน แต่ไม่รู้ว่าเป้าหมายอยู่ทางไหน',
    },
    greedy: {
      name: 'Greedy Best-First Search',
      short: 'Greedy',
      structure: 'Priority Queue เรียงตาม h(n) = ระยะประมาณถึงเป้าหมาย',
      complete: 'ใช่ (บนแผนที่ขนาดจำกัด และจำช่องที่เคยไปแล้ว)',
      optimal: 'ไม่ใช่ — เร็วแต่อาจได้ทางที่ไม่ดีที่สุด',
      usesHeuristic: true,
      idea: 'พุ่งเข้าหาเป้าหมายโดยดูแค่ฮิวริสติก ไม่สนว่าเดินมาไกลแค่ไหนแล้ว',
    },
    astar: {
      name: 'A* Search',
      short: 'A*',
      structure: 'Priority Queue เรียงตาม f(n) = g(n) + h(n)',
      complete: 'ใช่',
      optimal: 'ใช่ เมื่อฮิวริสติกไม่ประเมินเกินจริง (admissible)',
      usesHeuristic: true,
      idea: 'รวมข้อดีของ UCS (ต้นทุนจริง g) กับ Greedy (ทิศทางจาก h) จึงได้ทางที่ดีที่สุดโดยสำรวจน้อยช่องกว่า UCS',
    },
  };
  const ALGORITHM_ORDER = ['bfs', 'dfs', 'ucs', 'greedy', 'astar'];

  /* ---------- ฮิวริสติก h(n): ประมาณระยะจากช่องปัจจุบันถึงเป้าหมาย ---------- */
  const HEURISTICS = {
    manhattan: { name: 'Manhattan |dx| + |dy|', fn: (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) },
    euclidean: { name: 'Euclidean (เส้นตรง)', fn: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) },
  };

  /* ---------- Priority Queue (Min-Heap) ---------- */
  // ลำดับความสำคัญเป็นอาร์เรย์ เทียบทีละตัว เช่น [f, h, ลำดับที่ใส่] เพื่อให้ผลลัพธ์คงที่ทุกครั้ง
  function lessThan(a, b) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  }

  class PriorityQueue {
    constructor() { this.heap = []; this.counter = 0; }
    get length() { return this.heap.length; }
    push(item, priority) {
      const h = this.heap;
      h.push({ item, priority: priority.concat(this.counter++) });
      let i = h.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!lessThan(h[i].priority, h[p].priority)) break;
        [h[i], h[p]] = [h[p], h[i]];
        i = p;
      }
    }
    pop() {
      const h = this.heap;
      const top = h[0];
      const last = h.pop();
      if (h.length > 0) {
        h[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < h.length && lessThan(h[l].priority, h[m].priority)) m = l;
          if (r < h.length && lessThan(h[r].priority, h[m].priority)) m = r;
          if (m === i) break;
          [h[i], h[m]] = [h[m], h[i]];
          i = m;
        }
      }
      return top.item;
    }
  }

  /* ---------- ฟังก์ชันช่วย ---------- */
  function cellCost(grid, r, c) {
    return grid[r][c] === WEIGHT ? WEIGHT_COST : 1;
  }

  function neighbors(grid, r, c) {
    const out = [];
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < grid.length && nc >= 0 && nc < grid[0].length && grid[nr][nc] !== WALL) {
        out.push([nr, nc]);
      }
    }
    return out;
  }

  /* ---------- BFS: waiting_list เป็นคิว ---------- */
  function bfs(grid, start, goal, ctx) {
    const { key, cameFrom, visitedOrder } = ctx;
    const waitingList = [start];
    let head = 0; // ใช้ index แทน pop(0) เพื่อความเร็ว (ผลเหมือนกัน)
    cameFrom.set(key(start), null);
    while (head < waitingList.length) {
      const current = waitingList[head++]; // = waiting_list.pop(0)
      visitedOrder.push(current);
      if (current[0] === goal[0] && current[1] === goal[1]) return true;
      for (const next of neighbors(grid, current[0], current[1])) {
        if (!cameFrom.has(key(next))) {
          cameFrom.set(key(next), current);
          waitingList.push(next);
        }
      }
    }
    return false;
  }

  /* ---------- DFS: waiting_list เป็นสแตก ---------- */
  function dfs(grid, start, goal, ctx) {
    const { key, cameFrom, visitedOrder } = ctx;
    const visited = new Set();
    const waitingList = [start];
    cameFrom.set(key(start), null);
    while (waitingList.length > 0) {
      const current = waitingList.pop(); // หยิบตัวท้าย = ตัวที่ใส่ล่าสุด
      const k = key(current);
      if (visited.has(k)) continue;
      visited.add(k);
      visitedOrder.push(current);
      if (current[0] === goal[0] && current[1] === goal[1]) return true;
      const list = neighbors(grid, current[0], current[1]);
      // ใส่กลับด้าน เพื่อให้ตอนหยิบออกได้ลำดับ บน ขวา ล่าง ซ้าย
      for (let i = list.length - 1; i >= 0; i--) {
        const next = list[i];
        if (!visited.has(key(next))) {
          cameFrom.set(key(next), current); // ตัวที่ใส่ล่าสุดจะถูกหยิบก่อน จึงเป็นพ่อที่ถูกต้อง
          waitingList.push(next);
        }
      }
    }
    return false;
  }

  /* ---------- UCS / Greedy / A*: waiting_list เป็น Priority Queue ---------- */
  function bestFirst(mode, grid, start, goal, ctx) {
    const { key, cameFrom, visitedOrder, h } = ctx;
    const costSoFar = new Map(); // g(n)
    const closed = new Set();
    const waitingList = new PriorityQueue();

    const priority = (g, node) => {
      const hv = h(node, goal);
      if (mode === 'ucs') return [g];
      if (mode === 'greedy') return [hv];
      return [g + hv, hv]; // A*: ถ้า f เท่ากัน เลือกตัวที่ใกล้เป้าหมายกว่าก่อน
    };

    costSoFar.set(key(start), 0);
    cameFrom.set(key(start), null);
    waitingList.push(start, priority(0, start));

    while (waitingList.length > 0) {
      const current = waitingList.pop();
      const k = key(current);
      if (closed.has(k)) continue; // เคยสำรวจด้วยต้นทุนที่ดีกว่าแล้ว
      closed.add(k);
      visitedOrder.push(current);
      if (current[0] === goal[0] && current[1] === goal[1]) return true;

      for (const next of neighbors(grid, current[0], current[1])) {
        const nk = key(next);
        if (closed.has(nk)) continue;
        const newCost = costSoFar.get(k) + cellCost(grid, next[0], next[1]);
        if (mode === 'greedy') {
          if (!costSoFar.has(nk)) { // Greedy ไม่สนต้นทุน ใส่ครั้งแรกที่เจอพอ
            costSoFar.set(nk, newCost);
            cameFrom.set(nk, current);
            waitingList.push(next, priority(newCost, next));
          }
        } else if (!costSoFar.has(nk) || newCost < costSoFar.get(nk)) {
          costSoFar.set(nk, newCost);
          cameFrom.set(nk, current);
          waitingList.push(next, priority(newCost, next));
        }
      }
    }
    return false;
  }

  const SOLVERS = {
    bfs: (g, s, t, ctx) => bfs(g, s, t, ctx),
    dfs: (g, s, t, ctx) => dfs(g, s, t, ctx),
    ucs: (g, s, t, ctx) => bestFirst('ucs', g, s, t, ctx),
    greedy: (g, s, t, ctx) => bestFirst('greedy', g, s, t, ctx),
    astar: (g, s, t, ctx) => bestFirst('astar', g, s, t, ctx),
  };

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  /**
   * ค้นหาเส้นทาง
   * @param {string} algorithm  'bfs' | 'dfs' | 'ucs' | 'greedy' | 'astar'
   * @param {number[][]} grid
   * @param {[number, number]} start  [แถว, คอลัมน์]
   * @param {[number, number]} goal
   * @param {{heuristic?: 'manhattan'|'euclidean'}} options
   * @returns {{algorithm, found, path, visitedOrder, expanded, steps, cost, timeMs}}
   */
  function search(algorithm, grid, start, goal, options = {}) {
    const solver = SOLVERS[algorithm];
    if (!solver) throw new Error('ไม่รู้จักอัลกอริทึม: ' + algorithm);
    const cols = grid[0].length;
    const heuristic = HEURISTICS[options.heuristic || 'manhattan'];
    const ctx = {
      key: (p) => p[0] * cols + p[1],
      cameFrom: new Map(),
      visitedOrder: [],
      h: heuristic.fn,
    };

    const t0 = now();
    const found = solver(grid, start, goal, ctx);
    const timeMs = now() - t0;

    // ย้อนรอยจากเป้าหมายกลับไปจุดเริ่มต้นด้วย came_from
    const path = [];
    let cost = 0;
    if (found) {
      let node = goal;
      while (node) {
        path.push(node);
        node = ctx.cameFrom.get(ctx.key(node));
      }
      path.reverse();
      for (let i = 1; i < path.length; i++) cost += cellCost(grid, path[i][0], path[i][1]);
    }

    return {
      algorithm,
      found,
      path,
      visitedOrder: ctx.visitedOrder,
      expanded: ctx.visitedOrder.length,
      steps: found ? path.length - 1 : 0,
      cost: found ? cost : 0,
      timeMs,
    };
  }

  /* ---------- สร้างแผนที่ ---------- */
  function emptyGrid(rows, cols) {
    return Array.from({ length: rows }, () => new Array(cols).fill(EMPTY));
  }

  /**
   * สร้างเขาวงกตด้วย Randomized DFS (Recursive Backtracker)
   * rows, cols ควรเป็นเลขคี่  ทางเดินอยู่ที่พิกัดคี่
   * loops = โอกาสเจาะกำแพงเพิ่ม เพื่อให้มีหลายเส้นทาง (0 = เขาวงกตทางเดียว)
   */
  function generateMaze(rows, cols, options = {}) {
    const rand = options.random || Math.random;
    const loops = options.loops || 0;
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(WALL));
    const stack = [[1, 1]];
    grid[1][1] = EMPTY;
    while (stack.length > 0) {
      const [r, c] = stack[stack.length - 1];
      const choices = [];
      for (const [dr, dc] of DIRS) {
        const nr = r + 2 * dr, nc = c + 2 * dc;
        if (nr > 0 && nr < rows - 1 && nc > 0 && nc < cols - 1 && grid[nr][nc] === WALL) {
          choices.push([nr, nc, dr, dc]);
        }
      }
      if (choices.length === 0) { stack.pop(); continue; }
      const [nr, nc, dr, dc] = choices[Math.floor(rand() * choices.length)];
      grid[r + dr][c + dc] = EMPTY;
      grid[nr][nc] = EMPTY;
      stack.push([nr, nc]);
    }
    if (loops > 0) {
      for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
          const connector = (r % 2 === 1 && c % 2 === 0) || (r % 2 === 0 && c % 2 === 1);
          if (grid[r][c] === WALL && connector && rand() < loops) grid[r][c] = EMPTY;
        }
      }
    }
    return grid;
  }

  /** สุ่มกำแพงและพื้นโคลน */
  function randomGrid(rows, cols, options = {}) {
    const rand = options.random || Math.random;
    const wall = options.wall ?? 0.28;
    const weight = options.weight ?? 0;
    const grid = emptyGrid(rows, cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = rand();
        if (x < wall) grid[r][c] = WALL;
        else if (x < wall + weight) grid[r][c] = WEIGHT;
      }
    }
    return grid;
  }

  return {
    EMPTY, WALL, WEIGHT, WEIGHT_COST,
    ALGORITHMS, ALGORITHM_ORDER, HEURISTICS,
    PriorityQueue, neighbors, cellCost,
    search, emptyGrid, generateMaze, randomGrid,
  };
});
