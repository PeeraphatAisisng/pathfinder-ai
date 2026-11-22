"""
PathFinder AI — เวอร์ชัน Python (ใช้รันบน Terminal / VS Code)

อัลกอริทึมเดียวกับในเว็บ (js/algorithms.js) เขียนให้อ่านง่ายตามรูปแบบในชั้นเรียน:
    waiting_list  = รายการช่องที่รอสำรวจ
    came_from     = จำว่าแต่ละช่องมาจากช่องไหน
    current       = ช่องที่กำลังสำรวจ

แผนที่: '.' ทางว่าง  '#' กำแพง  '~' โคลน (ต้นทุน 5)  'S' จุดเริ่ม  'G' เป้าหมาย

วิธีรัน:
    python search_algorithms.py
"""

import heapq
import time

WEIGHT_COST = 5
DIRECTIONS = [(-1, 0), (0, 1), (1, 0), (0, -1)]  # บน ขวา ล่าง ซ้าย


# ---------------------------------------------------------------- แผนที่
def parse_map(text):
    """แปลงแผนที่ข้อความเป็น grid พร้อมหาตำแหน่ง S และ G"""
    grid = [list(line) for line in text.strip().splitlines()]
    start = goal = None
    for r, row in enumerate(grid):
        for c, ch in enumerate(row):
            if ch == "S":
                start = (r, c)
            elif ch == "G":
                goal = (r, c)
    return grid, start, goal


def get_neighbors(grid, pos):
    r, c = pos
    result = []
    for dr, dc in DIRECTIONS:
        nr, nc = r + dr, c + dc
        if 0 <= nr < len(grid) and 0 <= nc < len(grid[0]) and grid[nr][nc] != "#":
            result.append((nr, nc))
    return result


def cell_cost(grid, pos):
    return WEIGHT_COST if grid[pos[0]][pos[1]] == "~" else 1


def manhattan(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def build_path(came_from, goal):
    """ย้อนรอยจาก G กลับไป S ด้วย came_from"""
    path = []
    node = goal
    while node is not None:
        path.append(node)
        node = came_from[node]
    path.reverse()
    return path


# ---------------------------------------------------------------- BFS
def bfs(grid, start, goal):
    waiting_list = [start]          # คิว: เข้าก่อน ออกก่อน
    came_from = {start: None}
    visited_order = []
    while waiting_list:
        current = waiting_list.pop(0)
        visited_order.append(current)
        if current == goal:
            return build_path(came_from, goal), visited_order
        for neighbor in get_neighbors(grid, current):
            if neighbor not in came_from:
                came_from[neighbor] = current
                waiting_list.append(neighbor)
    return None, visited_order


# ---------------------------------------------------------------- DFS
def dfs(grid, start, goal):
    waiting_list = [start]          # สแตก: เข้าทีหลัง ออกก่อน
    came_from = {start: None}
    visited = set()
    visited_order = []
    while waiting_list:
        current = waiting_list.pop()
        if current in visited:
            continue
        visited.add(current)
        visited_order.append(current)
        if current == goal:
            return build_path(came_from, goal), visited_order
        for neighbor in reversed(get_neighbors(grid, current)):
            if neighbor not in visited:
                came_from[neighbor] = current
                waiting_list.append(neighbor)
    return None, visited_order


# ---------------------------------------------------------------- UCS / Greedy / A*
def best_first(grid, start, goal, mode):
    """mode = 'ucs' (เรียงตาม g), 'greedy' (เรียงตาม h), 'astar' (เรียงตาม g + h)"""
    counter = 0
    waiting_list = [(0, 0, counter, start)]   # Priority Queue: (ค่าหลัก, ค่ารอง, ลำดับ, ช่อง)
    came_from = {start: None}
    cost_so_far = {start: 0}
    closed = set()
    visited_order = []

    while waiting_list:
        _, _, _, current = heapq.heappop(waiting_list)
        if current in closed:
            continue
        closed.add(current)
        visited_order.append(current)
        if current == goal:
            return build_path(came_from, goal), visited_order

        for neighbor in get_neighbors(grid, current):
            if neighbor in closed:
                continue
            new_cost = cost_so_far[current] + cell_cost(grid, neighbor)
            if mode == "greedy":
                if neighbor in cost_so_far:
                    continue
            elif neighbor in cost_so_far and new_cost >= cost_so_far[neighbor]:
                continue
            cost_so_far[neighbor] = new_cost
            came_from[neighbor] = current
            h = manhattan(neighbor, goal)
            if mode == "ucs":
                priority = (new_cost, 0)
            elif mode == "greedy":
                priority = (h, 0)
            else:  # A*: f = g + h
                priority = (new_cost + h, h)
            counter += 1
            heapq.heappush(waiting_list, (*priority, counter, neighbor))
    return None, visited_order


ALGORITHMS = {
    "BFS": bfs,
    "DFS": dfs,
    "UCS": lambda g, s, t: best_first(g, s, t, "ucs"),
    "Greedy": lambda g, s, t: best_first(g, s, t, "greedy"),
    "A*": lambda g, s, t: best_first(g, s, t, "astar"),
}


def path_cost(grid, path):
    return sum(cell_cost(grid, p) for p in path[1:]) if path else 0


def draw(grid, path):
    """พิมพ์แผนที่ พร้อมเส้นทางเป็น '*'"""
    rows = [row[:] for row in grid]
    for r, c in path or []:
        if rows[r][c] not in "SG":
            rows[r][c] = "*"
    return "\n".join("".join(row) for row in rows)


# ---------------------------------------------------------------- ทดลองรัน
DEMO_MAP = """
S.......~.........
........~.........
..####..~...####..
........~.........
........~.........
.....######.......
........~.........
........~........G
..................
"""

if __name__ == "__main__":
    grid, start, goal = parse_map(DEMO_MAP)
    print(f"{'อัลกอริทึม':<10}{'สำรวจ':>8}{'ก้าว':>8}{'ต้นทุน':>8}{'เวลา(ms)':>10}")
    print("-" * 44)
    for name, solver in ALGORITHMS.items():
        t0 = time.perf_counter()
        path, visited = solver(grid, start, goal)
        ms = (time.perf_counter() - t0) * 1000
        steps = len(path) - 1 if path else "-"
        print(f"{name:<10}{len(visited):>8}{steps:>8}{path_cost(grid, path):>8}{ms:>10.3f}")

    path, _ = ALGORITHMS["A*"](grid, start, goal)
    print("\nเส้นทางของ A* (*):")
    print(draw(grid, path))
