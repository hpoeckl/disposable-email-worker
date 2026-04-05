interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();
let lastCleanup = 0;

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();

  // Evict expired entries periodically
  if (now - lastCleanup > 60_000) {
    for (const [k, b] of buckets) {
      if (now - b.windowStart > windowMs) buckets.delete(k);
    }
    lastCleanup = now;
  }

  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > windowMs) {
    bucket = { count: 0, windowStart: now };
    buckets.set(key, bucket);
  }

  bucket.count++;
  const remaining = Math.max(0, limit - bucket.count);
  const resetAt = bucket.windowStart + windowMs;

  return { allowed: bucket.count <= limit, remaining, resetAt };
}
