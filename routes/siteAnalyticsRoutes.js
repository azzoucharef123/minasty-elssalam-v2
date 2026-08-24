const express = require("express");
const { recordSiteVisit } = require("../controllers/siteAnalyticsController");
const { createRateLimiter } = require("../middleware/rateLimit");

const router = express.Router();

// Prevent accidental refresh loops or abusive clients from inflating the counter.
const siteVisitRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: "تم تسجيل زيارات كثيرة خلال وقت قصير.",
});

router.get("/visits", siteVisitRateLimit, recordSiteVisit);

module.exports = router;
