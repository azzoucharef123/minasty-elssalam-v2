const webpush = require("web-push");
const prisma = require("../lib/prisma");

function configured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

function configure() {
  if (configured()) webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
}

async function saveSubscription(recipientRole, recipientId, subscription) {
  if (!configured()) throw new Error("إشعارات الهاتف غير مفعلة بعد. تحقق من إعدادات VAPID.");
  configure();
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) throw new Error("اشتراك Push غير صالح.");
  return prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: { endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, recipientRole, recipientId },
    update: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, recipientRole, recipientId },
  });
}

async function removeSubscription(endpoint) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

async function sendPushToRecipient(recipientRole, recipientId, payload) {
  if (!configured()) return { sent: 0, configured: false };
  configure();
  const subscriptions = await prisma.pushSubscription.findMany({ where: { recipientRole, recipientId } });
  let sent = 0;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(payload));
      sent += 1;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) await removeSubscription(subscription.endpoint);
    }
  }
  return { sent, configured: true };
}

module.exports = { configured, saveSubscription, removeSubscription, sendPushToRecipient };
