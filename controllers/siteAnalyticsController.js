const prisma = require("../lib/prisma");

const SITE_VISIT_EVENT = "SITE_VISIT";

async function recordSiteVisit(req, res) {
  try {
    await prisma.analyticsEvent.create({
      data: {
        eventType: SITE_VISIT_EVENT,
        valueJson: JSON.stringify({
          path: req.get("referer") || "/",
          userAgent: String(req.get("user-agent") || "").slice(0, 500),
        }),
      },
    });

    const totalVisits = await prisma.analyticsEvent.count({
      where: { eventType: SITE_VISIT_EVENT },
    });

    return res.status(200).json({
      status: "success",
      totalVisits,
    });
  } catch (error) {
    console.error("Site visit counter failed:", error);
    return res.status(503).json({
      status: "unavailable",
      error: "عداد الزيارات غير متاح مؤقتًا.",
    });
  }
}

module.exports = { recordSiteVisit };
