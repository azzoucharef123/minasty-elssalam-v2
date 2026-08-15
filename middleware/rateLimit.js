const buckets = new Map();

function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 30, message = "تم تجاوز عدد المحاولات. حاول لاحقًا." } = {}) {
  return function rateLimiter(req, res, next) {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const key = `${req.path}:${forwarded || req.ip || "unknown"}`;
    const now = Date.now();
    const current = buckets.get(key);

    if (!current || now - current.startedAt >= windowMs) {
      buckets.set(key, { startedAt: now, count: 1 });
      return next();
    }

    current.count += 1;
    if (current.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((windowMs - (now - current.startedAt)) / 1000)));
      return res.status(429).json({ error: message });
    }
    return next();
  };
}

const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 12,
  message: "محاولات الدخول كثيرة. انتظر قليلًا ثم حاول مجددًا.",
});

const mutationRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: "تم تجاوز عدد العمليات المؤقت. حاول بعد دقيقة.",
});

setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [key, value] of buckets.entries()) {
    if (value.startedAt < cutoff) buckets.delete(key);
  }
}, 10 * 60 * 1000).unref();

module.exports = { createRateLimiter, authRateLimit, mutationRateLimit };
