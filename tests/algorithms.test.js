// รันด้วย: npm test  (หรือ node --test tests/)
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/algorithms.js');

const ALL = A.ALGORITHM_ORDER;

// ตัวสุ่มแบบกำหนด seed ได้ เพื่อให้เทสต์ได้ผลเหมือนเดิมทุกครั้ง
function seeded(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fromText(text) {
  const lines = text.trim().split('\n').map((l) => l.trim());
  let start, goal;
  const grid = lines.map((line, r) => [...line].map((ch, c) => {
    if (ch === 'S') start = [r, c];
    if (ch === 'G') goal = [r, c];
    return ch === '#' ? A.WALL : ch === '~' ? A.WEIGHT : A.EMPTY;
  }));
  return { grid, start, goal };
}

// ตรวจว่าเส้นทางถูกต้อง: เริ่มที่ S จบที่ G เดินทีละช่อง ไม่ทะลุกำแพง
function assertValidPath(grid, start, goal, path) {
  assert.deepEqual(path[0], start);
  assert.deepEqual(path[path.length - 1], goal);
  for (let i = 1; i < path.length; i++) {
    const [r1, c1] = path[i - 1];
    const [r2, c2] = path[i];
    assert.equal(Math.abs(r1 - r2) + Math.abs(c1 - c2), 1, 'ต้องเดินทีละช่อง');
    assert.notEqual(grid[r2][c2], A.WALL, 'ห้ามเดินทะลุกำแพง');
  }
}

test('แผนที่โล่ง: ทุกอัลกอริทึมหาทางเจอ และ BFS/UCS/A* ได้ระยะสั้นสุด', () => {
  const grid = A.emptyGrid(5, 5);
  for (const algo of ALL) {
    const res = A.search(algo, grid, [0, 0], [4, 4]);
    assert.ok(res.found, algo);
    assertValidPath(grid, [0, 0], [4, 4], res.path);
    if (['bfs', 'ucs', 'astar'].includes(algo)) assert.equal(res.cost, 8, algo);
  }
});

test('เป้าหมายถูกกำแพงล้อม: ไม่มีอัลกอริทึมใดหาทางเจอ', () => {
  const { grid, start, goal } = fromText(`
    S....
    ...#.
    ..#G#
    ...#.
  `);
  for (const algo of ALL) {
    const res = A.search(algo, grid, start, goal);
    assert.equal(res.found, false, algo);
    assert.deepEqual(res.path, []);
  }
});

test('พื้นโคลน: UCS และ A* อ้อมหลบโคลน ส่วน BFS เดินฝ่าเพราะนับแค่จำนวนก้าว', () => {
  const { grid, start, goal } = fromText(`
    .....
    S~~~G
  `);
  const bfs = A.search('bfs', grid, start, goal);
  const ucs = A.search('ucs', grid, start, goal);
  const astar = A.search('astar', grid, start, goal);
  assert.equal(bfs.steps, 4);
  assert.equal(bfs.cost, 3 * A.WEIGHT_COST + 1); // 16
  assert.equal(ucs.cost, 6);
  assert.equal(astar.cost, 6);
  assertValidPath(grid, start, goal, astar.path);
});

test('A* สำรวจน้อยกว่าหรือเท่ากับ UCS แต่ได้ต้นทุนเท่ากัน (สุ่ม 30 แผนที่)', () => {
  const rand = seeded(42);
  let tested = 0;
  for (let i = 0; i < 30; i++) {
    const grid = A.randomGrid(21, 31, { wall: 0.25, weight: 0.1, random: rand });
    const start = [0, 0], goal = [20, 30];
    grid[0][0] = A.EMPTY; grid[20][30] = A.EMPTY;
    const ucs = A.search('ucs', grid, start, goal);
    for (const h of Object.keys(A.HEURISTICS)) {
      const astar = A.search('astar', grid, start, goal, { heuristic: h });
      assert.equal(astar.found, ucs.found);
      if (ucs.found) {
        assert.ok(Math.abs(astar.cost - ucs.cost) < 1e-9, `A* (${h}) ต้องได้ต้นทุนต่ำสุดเท่า UCS`);
        assert.ok(astar.expanded <= ucs.expanded, `A* (${h}) ไม่ควรสำรวจมากกว่า UCS`);
      }
    }
    if (ucs.found) tested++;
    // ทุกอัลกอริทึมต้องให้ผล found ตรงกัน และเส้นทางถูกต้อง
    for (const algo of ALL) {
      const res = A.search(algo, grid, start, goal);
      assert.equal(res.found, ucs.found, algo);
      if (res.found) {
        assertValidPath(grid, start, goal, res.path);
        assert.ok(res.cost >= ucs.cost, `${algo} ไม่ควรได้ต้นทุนต่ำกว่า UCS`);
      }
    }
  }
  assert.ok(tested > 5, 'ควรมีแผนที่ที่หาทางได้พอสมควร');
});

test('เขาวงกต: สร้างแล้วเดินจากมุมซ้ายบนถึงมุมขวาล่างได้เสมอ', () => {
  const rand = seeded(7);
  for (let i = 0; i < 10; i++) {
    const grid = A.generateMaze(23, 51, { random: rand });
    const res = A.search('bfs', grid, [1, 1], [21, 49]);
    assert.ok(res.found);
    // เขาวงกตทางเดียว ทุกช่องต้นทุนเท่ากัน → ทุกตัวที่ optimal ต้องได้ทางเดียวกัน
    const astar = A.search('astar', grid, [1, 1], [21, 49]);
    assert.equal(astar.cost, res.cost);
  }
});

test('Priority Queue ดึงค่าน้อยสุดออกก่อน และค่าที่เท่ากันออกตามลำดับที่ใส่', () => {
  const pq = new A.PriorityQueue();
  [[5, 'e'], [1, 'a'], [3, 'c'], [1, 'b'], [4, 'd']].forEach(([p, v]) => pq.push(v, [p]));
  const out = [];
  while (pq.length) out.push(pq.pop());
  assert.deepEqual(out, ['a', 'b', 'c', 'd', 'e']);
});
