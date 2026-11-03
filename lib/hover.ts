/**
 * The hover preview's memory in the browser. An answer from GET /api/outline says where else a click would get
 * the same outline, usually its whole province (decisions.md entry 33), so moving inside that asks nothing.
 */
import type { HoverOutline } from "./db/area.ts";
import { bboxOf, pointInGeometry, type AreaGeometry, type Position } from "./geo/geometry.ts";
import type { YearRange } from "./time/index.ts";

type Held = { answer: HoverOutline; shape: AreaGeometry; box: [number, number, number, number] };

export class HoverCache {
  private range = "";
  private held = new Map<string, Held>();
  private readonly size: number;

  constructor(size = 300) {
    this.size = size;
  }

  /** Answers belong to one range. Using another empties the cache. */
  private use(r: YearRange) {
    const key = `${r.from} ${r.to}`;
    if (key === this.range) return;
    this.range = key;
    this.held.clear();
  }

  /** An answer that holds only at its own point is not kept. */
  add(r: YearRange, answer: HoverOutline) {
    this.use(r);
    if (!answer.holds) return;
    const { id, shape } = answer.holds;
    this.held.delete(id);
    if (this.held.size >= this.size) this.held.delete(this.held.keys().next().value!);
    this.held.set(id, { answer, shape, box: bboxOf(shape) });
  }

  find(r: YearRange, [lon, lat]: Position): HoverOutline | undefined {
    this.use(r);
    for (const { answer, shape, box: [w, s, e, n] } of this.held.values()) {
      if (lon >= w && lon <= e && lat >= s && lat <= n && pointInGeometry(lon, lat, shape)) return answer;
    }
    return undefined;
  }
}
