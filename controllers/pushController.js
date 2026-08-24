const { configured, saveSubscription, removeSubscription } = require("../utils/push");

function recipientFromUser(user) {
  if (user?.role === "teacher") return { role: "teacher", id: "teacher" };
  if (user?.role === "parent" && user.phone) return { role: "parent", id: user.phone };
  throw new Error("حساب غير مدعوم لإشعارات Push.");
}

async function getPublicKey(_req, res) {
  if (!configured()) return res.status(503).json({ error: "إشعارات الهاتف غير مفعلة بعد. تحقق من إعداد VAPID_PUBLIC_KEY وVAPID_PRIVATE_KEY وVAPID_SUBJECT." });
  return res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
}

async function subscribe(req, res) {
  try {
    const recipient = recipientFromUser(req.user);
    await saveSubscription(recipient.role, recipient.id, req.body);
    return res.status(201).json({ status: "success", message: "تم تفعيل إشعارات الهاتف." });
  } catch (error) {
    return res.status(400).json({ error: error.message || "تعذر تفعيل الإشعارات." });
  }
}

async function unsubscribe(req, res) {
  try {
    if (!req.body?.endpoint) return res.status(400).json({ error: "عنوان الاشتراك غير موجود." });
    await removeSubscription(req.body.endpoint);
    return res.json({ status: "success" });
  } catch {
    return res.status(500).json({ error: "تعذر إلغاء إشعارات الهاتف." });
  }
}

module.exports = { getPublicKey, subscribe, unsubscribe };
