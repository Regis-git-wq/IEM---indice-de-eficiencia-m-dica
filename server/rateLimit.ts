/**
 * Limitador simples em memória (janela fixa). Suficiente para um único servidor;
 * com várias instâncias seria preciso guardar os contadores em um lugar compartilhado.
 */
export function createRateLimiter(maxHits: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return {
    /** Registra uma tentativa; retorna os segundos de espera se o limite estourou, ou 0. */
    hit(key: string): number {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return 0;
      }
      entry.count++;
      return entry.count > maxHits ? Math.ceil((entry.resetAt - now) / 1000) : 0;
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}
