/** Small in-memory TTL cache (edge functions also persist responses in `api_cache`). */
export class TtlCache<T> {
  private store = new Map<string, { v: T; exp: number }>();
  constructor(private ttlMs: number, private maxEntries = 500) {}
  get(k: string): T | undefined {
    const e = this.store.get(k);
    if (!e) return undefined;
    if (Date.now() > e.exp) { this.store.delete(k); return undefined; }
    return e.v;
  }
  set(k: string, v: T) {
    if (this.store.size >= this.maxEntries) this.store.delete(this.store.keys().next().value as string);
    this.store.set(k, { v, exp: Date.now() + this.ttlMs });
  }
}

/** Sliding-window limiter: at most `perMinute` acquisitions in any 60 s window. */
export class RateLimiter {
  private stamps: number[] = [];
  constructor(private perMinute: number, private now: () => number = Date.now, private sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) {}
  async acquire(): Promise<void> {
    for (;;) {
      const t = this.now();
      this.stamps = this.stamps.filter((s) => t - s < 60_000);
      if (this.stamps.length < this.perMinute) { this.stamps.push(t); return; }
      await this.sleep(60_000 - (t - this.stamps[0]!) + 5);
    }
  }
}
