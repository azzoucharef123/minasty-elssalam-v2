const test = require("node:test");
const assert = require("node:assert/strict");
const { createSocketNotificationSender, notificationRoom, notificationSessionRoom } = require("../utils/socketNotifications");

test("socket notification sender targets a parent room", () => {
  const calls = [];
  const io = {
    emit: (...args) => calls.push(["emit", ...args]),
    to: (target) => ({ emit: (...args) => calls.push(["to", target, ...args]) }),
  };
  const send = createSocketNotificationSender(io);
  const result = send({ role: "parent", recipientId: "0556960950", title: "تنبيه", body: "ابدأ الآن" });
  assert.equal(result.delivered, true);
  assert.equal(calls[0][0], "to");
  assert.equal(calls[0][1], notificationRoom("parent", "0556960950"));
  assert.equal(calls[0][2], "push_notification");
  assert.equal(calls[0][3].title, "تنبيه");
});

test("socket notification sender targets a previous session room", () => {
  const calls = [];
  const io = {
    emit: (...args) => calls.push(["emit", ...args]),
    to: (target) => ({ emit: (...args) => calls.push(["to", target, ...args]) }),
  };
  const send = createSocketNotificationSender(io);
  const result = send({ sessionId: "old-session-123", title: "تنبيه أمني", body: "تم تسجيل دخول جديد" });
  assert.equal(result.delivered, true);
  assert.equal(calls[0][1], notificationSessionRoom("old-session-123"));
  assert.equal(calls[0][2], "push_notification");
  assert.equal(calls[0][3].data.type, undefined);
});

test("socket notification sender can broadcast", () => {
  const calls = [];
  const io = {
    emit: (...args) => calls.push(args),
    to: () => ({ emit: () => {} }),
  };
  createSocketNotificationSender(io)({ broadcast: true, title: "عام", body: "رسالة للجميع" });
  assert.equal(calls[0][0], "push_notification");
  assert.equal(calls[0][1].body, "رسالة للجميع");
});
