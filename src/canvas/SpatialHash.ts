/**
 * SpatialHash.ts
 * 空間ハッシュによる O(1) に近いヒットテスト
 * ノードが何万個あっても、クリック座標周辺のセルのノードだけ検査する
 */

export class SpatialHash {
  private cellSize: number;
  private grid: Map<string, string[]>;

  constructor(cellSize = 256) {
    this.cellSize = cellSize;
    this.grid = new Map();
  }

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private worldToCell(worldCoord: number): number {
    return Math.floor(worldCoord / this.cellSize);
  }

  /** ハッシュを完全クリアして再構築 */
  rebuild(nodes: Array<{ id: string; x: number; y: number; w: number; h: number }>) {
    this.grid.clear();
    for (const node of nodes) {
      this.insert(node);
    }
  }

  /** ノードをハッシュに追加 */
  insert(node: { id: string; x: number; y: number; w: number; h: number }) {
    const minCX = this.worldToCell(node.x);
    const maxCX = this.worldToCell(node.x + node.w);
    const minCY = this.worldToCell(node.y);
    const maxCY = this.worldToCell(node.y + node.h);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const k = this.key(cx, cy);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k)!.push(node.id);
      }
    }
  }

  /** ワールド座標にあるノードのIDリストを返す（候補のみ、精密チェックは呼び出し側） */
  query(worldX: number, worldY: number): string[] {
    const cx = this.worldToCell(worldX);
    const cy = this.worldToCell(worldY);
    return this.grid.get(this.key(cx, cy)) ?? [];
  }

  /** 矩形範囲に交差するノードのIDリストを返す */
  queryRect(x: number, y: number, w: number, h: number): Set<string> {
    const result = new Set<string>();
    const minCX = this.worldToCell(x);
    const maxCX = this.worldToCell(x + w);
    const minCY = this.worldToCell(y);
    const maxCY = this.worldToCell(y + h);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const candidates = this.grid.get(this.key(cx, cy)) ?? [];
        for (const id of candidates) result.add(id);
      }
    }
    return result;
  }
}
