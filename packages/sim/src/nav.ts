/**
 * Pathfinding over a zone's navigation graph.
 *
 * A* with a binary heap, operating on integer node indices and preallocated
 * typed arrays. No allocation happens per search beyond the returned path, which
 * matters because ambient NPCs repath continuously and a phone's garbage
 * collector shows up as a stutter in the middle of a duel.
 *
 * Determinism is a hard requirement here, not a nicety: the server validates
 * player movement against the same graph, and NPC positions are derived rather
 * than synchronised. Ties in the open set are therefore broken by node index, so
 * two runs of the same search return byte-identical paths on every machine.
 */

import type { NavGraph, Vec2 } from '@arcanum/shared';

/** Reusable scratch space, sized to the largest graph seen so far. */
interface Scratch {
  gScore: Float64Array;
  fScore: Float64Array;
  cameFrom: Int32Array;
  state: Uint8Array;
  heapNodes: Int32Array;
  heapKeys: Float64Array;
}

const OPEN = 1;
const CLOSED = 2;

function makeScratch(size: number): Scratch {
  return {
    gScore: new Float64Array(size),
    fScore: new Float64Array(size),
    cameFrom: new Int32Array(size),
    state: new Uint8Array(size),
    heapNodes: new Int32Array(size + 1),
    heapKeys: new Float64Array(size + 1),
  };
}

/**
 * A pathfinder bound to one graph. Holding the scratch buffers on the instance
 * rather than in module scope keeps concurrent searches over different zones
 * from corrupting each other, which matters on the server.
 */
export class Pathfinder {
  private readonly scratch: Scratch;

  constructor(private readonly graph: NavGraph) {
    this.scratch = makeScratch(graph.nodes.length);
  }

  /**
   * Finds the cheapest route between two node indices.
   *
   * @returns the node indices from `start` to `goal` inclusive, or an empty
   *          array when no route exists. A start equal to the goal returns a
   *          single-element path, which callers read as "already there".
   */
  find(start: number, goal: number): number[] {
    const { graph, scratch } = this;
    const size = graph.nodes.length;
    if (start < 0 || goal < 0 || start >= size || goal >= size) return [];
    if (start === goal) return [start];

    const { gScore, fScore, cameFrom, state, heapNodes, heapKeys } = scratch;
    state.fill(0);
    cameFrom.fill(-1);
    gScore.fill(Number.POSITIVE_INFINITY);
    fScore.fill(Number.POSITIVE_INFINITY);

    let heapSize = 0;
    const push = (node: number, key: number): void => {
      heapSize += 1;
      let i = heapSize;
      heapNodes[i] = node;
      heapKeys[i] = key;
      while (i > 1) {
        const parent = i >> 1;
        if (compare(heapKeys[parent]!, heapNodes[parent]!, heapKeys[i]!, heapNodes[i]!) <= 0) break;
        swap(heapNodes, heapKeys, i, parent);
        i = parent;
      }
    };
    const pop = (): number => {
      const top = heapNodes[1]!;
      heapNodes[1] = heapNodes[heapSize]!;
      heapKeys[1] = heapKeys[heapSize]!;
      heapSize -= 1;
      let i = 1;
      for (;;) {
        const left = i << 1;
        const right = left + 1;
        let smallest = i;
        if (
          left <= heapSize &&
          compare(heapKeys[left]!, heapNodes[left]!, heapKeys[smallest]!, heapNodes[smallest]!) < 0
        ) {
          smallest = left;
        }
        if (
          right <= heapSize &&
          compare(heapKeys[right]!, heapNodes[right]!, heapKeys[smallest]!, heapNodes[smallest]!) <
            0
        ) {
          smallest = right;
        }
        if (smallest === i) break;
        swap(heapNodes, heapKeys, i, smallest);
        i = smallest;
      }
      return top;
    };

    const goalPosition = graph.nodes[goal]!.position;
    gScore[start] = 0;
    fScore[start] = heuristic(graph.nodes[start]!.position, goalPosition);
    state[start] = OPEN;
    push(start, fScore[start]!);

    while (heapSize > 0) {
      const current = pop();
      if (state[current] === CLOSED) continue;
      if (current === goal) return reconstruct(cameFrom, goal);
      state[current] = CLOSED;

      const from = graph.neighbourOffsets[current]!;
      const to = graph.neighbourOffsets[current + 1]!;
      for (let edge = from; edge < to; edge += 1) {
        const neighbour = graph.neighbourIndices[edge]!;
        if (state[neighbour] === CLOSED) continue;
        const tentative = gScore[current]! + graph.neighbourCosts[edge]!;
        if (tentative >= gScore[neighbour]!) continue;
        cameFrom[neighbour] = current;
        gScore[neighbour] = tentative;
        const estimate = tentative + heuristic(graph.nodes[neighbour]!.position, goalPosition);
        fScore[neighbour] = estimate;
        state[neighbour] = OPEN;
        push(neighbour, estimate);
      }
    }

    return [];
  }

  /** Converts a node-index path into world positions for a mover to follow. */
  positions(path: readonly number[]): Vec2[] {
    return path.map((index) => this.graph.nodes[index]!.position);
  }

  /** Convenience: path between two arbitrary points, snapped to the graph. */
  between(from: Vec2, to: Vec2): Vec2[] {
    const path = this.find(this.graph.nearest(from), this.graph.nearest(to));
    return this.positions(path);
  }
}

/** Straight-line distance. Admissible because edge costs are true distances. */
function heuristic(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Orders by key, then by node index so equal-cost routes resolve identically. */
function compare(keyA: number, nodeA: number, keyB: number, nodeB: number): number {
  if (keyA < keyB) return -1;
  if (keyA > keyB) return 1;
  return nodeA - nodeB;
}

function swap(nodes: Int32Array, keys: Float64Array, a: number, b: number): void {
  const node = nodes[a]!;
  const key = keys[a]!;
  nodes[a] = nodes[b]!;
  keys[a] = keys[b]!;
  nodes[b] = node;
  keys[b] = key;
}

function reconstruct(cameFrom: Int32Array, goal: number): number[] {
  const path: number[] = [goal];
  let current = goal;
  while (cameFrom[current] !== -1) {
    current = cameFrom[current]!;
    path.push(current);
  }
  path.reverse();
  return path;
}
