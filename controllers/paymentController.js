const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { logAudit } = require("../utils/audit");

const SOFIZPAY_ACCOUNT = process.env.SOFIZPAY_ACCOUNT || "GBYAJX2VUMCKQQMTQRKIHFL7GWKPXQGAQNNCJOIV232S3Q73NNYK6JF4";
const SOFIZPAY_CREATE_URL = "https://sofizpay.com/make-cib-transaction/";
const SOFIZPAY_CHECK_URL = "https://sofizpay.com/cib-transaction-check/";
const PUBLIC_SITE_URL = String(process.env.PUBLIC_SITE_URL || "https://dr.africacold.fr").replace(/\/$/, "");
const CONTACT_EMAIL = process.env.SOFIZPAY_CONTACT_EMAIL || "no-reply@dr.africacold.fr";
const VALID_SUBSCRIPTIONS = new Map([
  ["BOTH", { amount: 2030, mathEnrollment: true, physicsEnrollment: true, label: "الرياضيات والفيزياء" }],
  ["MATH", { amount: 1030, mathEnrollment: true, physicsEnrollment: false, label: "الرياضيات فقط" }],
  ["PHYSICS", { amount: 1030, mathEnrollment: false, physicsEnrollment: true, label: "الفيزياء فقط" }],
]);

function text(value, max = 180) {
  return String(value ?? "").trim().slice(0, max);
}

function isParent(req) {
  return req.user?.role === "parent" && Boolean(req.user.phone);
}

function buildInternalOrderId() {
  return `MINA-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function buildMemo(orderId) {
  return `M${orderId.replace(/[^A-Z0-9]/gi, "").slice(-22)}`.slice(0, 28);
}

function amountAsNumber(value) {
  const amount = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(amount) ? amount : null;
}

function extractProviderOrderNumber(payload) {
  return text(
    payload?.cib_transaction_id ||
    payload?.data?.cib_transaction_id ||
    payload?.cib_response?.orderId ||
    payload?.data?.cib_response?.orderId ||
    payload?.order_number ||
    payload?.orderNumber,
    120
  ) || null;
}

function extractProviderTransactionId(payload) {
  return text(payload?.transaction_id || payload?.data?.transaction_id, 120) || null;
}

function extractPaymentUrl(payload) {
  return text(payload?.payment_url || payload?.url || payload?.data?.payment_url || payload?.data?.url, 2000) || null;
}

function safeJson(value) {
  try {
    return JSON.stringify(value).slice(0, 20000);
  } catch {
    return null;
  }
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, headers: { Accept: "application/json", ...(options.headers || {}) } });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}

function studentBelongsToParent(student, req) {
  return Boolean(student && isParent(req) && student.parentPhone === req.user.phone);
}

async function getOwnedStudent(req, studentId) {
  if (!isParent(req)) return null;
  return prisma.student.findFirst({
    where: { id: text(studentId, 80), parentPhone: req.user.phone },
    select: {
      id: true,
      studentName: true,
      parentPhone: true,
      level: true,
      paymentStage: true,
      paymentStatus: true,
      mathEnrollment: true,
      physicsEnrollment: true,
    },
  });
}

function providerPaymentAccepted(payload, transaction) {
  const orderStatus = Number(payload?.orderStatus ?? payload?.data?.orderStatus);
  const responseCode = text(payload?.respCode ?? payload?.data?.respCode, 10);
  const accepted = orderStatus === 2 || responseCode === "00";
  if (!accepted) return false;

  const returnedAmount = amountAsNumber(payload?.Amount ?? payload?.amount ?? payload?.data?.Amount ?? payload?.data?.amount);
  if (returnedAmount !== null && Math.round(returnedAmount) !== transaction.amount) return false;

  const destination = text(payload?.destination_account ?? payload?.data?.destination_account, 120);
  if (destination && destination !== SOFIZPAY_ACCOUNT) return false;
  return true;
}

async function activatePaidTransaction(transaction, providerPayload) {
  if (transaction.status === "PAID") return transaction;

  const subscription = VALID_SUBSCRIPTIONS.get(transaction.subscriptionType);
  if (!subscription) throw new Error("نوع الاشتراك غير صالح.");

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const fresh = await tx.paymentTransaction.findUnique({ where: { id: transaction.id } });
    if (!fresh) throw new Error("طلب الدفع غير موجود.");
    if (fresh.status === "PAID") return fresh;

    const student = await tx.student.findUnique({ where: { id: fresh.studentId }, select: { id: true, level: true } });
    if (!student) throw new Error("التلميذ غير موجود.");

    const paidStudent = await tx.student.update({
      where: { id: fresh.studentId },
      data: {
        paymentStatus: true,
        paymentStage: "PAID",
        amountDue: fresh.amount,
        mathEnrollment: subscription.mathEnrollment,
        physicsEnrollment: subscription.physicsEnrollment,
        liveAccessEnabled: true,
        paymentReceiptPending: false,
      },
    });

    await tx.paymentTransaction.update({
      where: { id: fresh.id },
      data: {
        status: "PAID",
        providerPayload: safeJson(providerPayload),
        verifiedAt: now,
        paidAt: now,
      },
    });

    await tx.paymentEvent.create({
      data: {
        studentId: fresh.studentId,
        stage: "PAID",
        amount: fresh.amount,
        actorRole: "SOFIZPAY",
        actorId: fresh.providerOrderNumber || fresh.internalOrderId,
        note: `تم تأكيد الدفع الإلكتروني: ${subscription.label}`,
      },
    });

    return { ...fresh, status: "PAID", student: paidStudent };
  });

  void logAudit({ user: { role: "system", sessionId: "sofizpay" }, ip: "sofizpay" }, {
    action: "SOFIZPAY_PAYMENT_VERIFIED",
    entityType: "PaymentTransaction",
    entityId: updated.id,
    studentId: updated.studentId,
    metadata: { internalOrderId: updated.internalOrderId, providerOrderNumber: updated.providerOrderNumber, amount: updated.amount, subscriptionType: updated.subscriptionType },
  }).catch(() => {});

  return updated;
}

async function verifyTransaction(transaction) {
  if (!transaction?.providerOrderNumber) return { transaction, verified: false, pending: true };
  const checkUrl = new URL(SOFIZPAY_CHECK_URL);
  checkUrl.searchParams.set("order_number", transaction.providerOrderNumber);
  const { response, payload } = await fetchJson(checkUrl.toString());

  if (!response.ok || payload?.error) {
    return { transaction, verified: false, pending: true, providerPayload: payload };
  }

  if (!providerPaymentAccepted(payload, transaction)) {
    return { transaction, verified: false, pending: false, failed: true, providerPayload: payload };
  }

  const updated = await activatePaidTransaction(transaction, payload);
  return { transaction: updated, verified: true, pending: false, providerPayload: payload };
}

async function startSofizPayPayment(req, res) {
  try {
    if (!isParent(req)) return res.status(403).json({ error: "هذه العملية متاحة للولي فقط." });
    const subscriptionType = text(req.body?.subscriptionType, 20).toUpperCase();
    const subscription = VALID_SUBSCRIPTIONS.get(subscriptionType);
    if (!subscription) return res.status(400).json({ error: "اختر الرياضيات أو الفيزياء أو المادتين معًا." });

    const student = await getOwnedStudent(req, req.body?.studentId);
    if (!student || !studentBelongsToParent(student, req)) return res.status(403).json({ error: "لا تملك صلاحية الدفع لهذا التلميذ." });
    if (student.level === "طالب جامعي") return res.status(400).json({ error: "الدفع الإلكتروني بهذه الخطة متاح لتلاميذ التعليم المتوسط فقط حاليًا." });
    if (student.paymentStage === "PAID" || student.paymentStatus) return res.status(400).json({ error: "هذا الحساب لديه اشتراك مدفوع بالفعل." });

    const recent = await prisma.paymentTransaction.findFirst({
      where: { studentId: student.id, subscriptionType, status: "PENDING", createdAt: { gt: new Date(Date.now() - 15 * 60 * 1000) } },
      orderBy: { createdAt: "desc" },
    });
    if (recent?.paymentUrl) {
      return res.json({ status: "success", data: { paymentUrl: recent.paymentUrl, internalOrderId: recent.internalOrderId, amount: recent.amount, subscriptionType, reused: true } });
    }

    const internalOrderId = buildInternalOrderId();
    const memo = buildMemo(internalOrderId);
    const returnUrl = `${PUBLIC_SITE_URL}/parent-dashboard.html?payment=sofizpay&order_id=${encodeURIComponent(internalOrderId)}`;
    const webhookUrl = `${PUBLIC_SITE_URL}/api/payments/sofizpay/webhook`;
    const params = new URLSearchParams({
      account: SOFIZPAY_ACCOUNT,
      amount: String(subscription.amount),
      full_name: student.studentName,
      phone: student.parentPhone,
      email: CONTACT_EMAIL,
      return_url: returnUrl,
      webhook_url: webhookUrl,
      invoice_id: internalOrderId,
      memo,
      redirect: "yes",
      keep_return_url: "True",
      language: "ar",
    });

    const { response, payload } = await fetchJson(`${SOFIZPAY_CREATE_URL}?${params.toString()}`);
    if (!response.ok || payload?.success === false || payload?.error) {
      console.error("SofizPay payment creation rejected:", response.status, payload?.error || payload?.message || "unknown");
      return res.status(502).json({ error: "تعذر إنشاء رابط الدفع الإلكتروني من SofizPay حاليًا. حاول مرة أخرى." });
    }

    const paymentUrl = extractPaymentUrl(payload);
    const providerOrderNumber = extractProviderOrderNumber(payload);
    const providerTransactionId = extractProviderTransactionId(payload);
    if (!paymentUrl || !providerOrderNumber) {
      console.error("SofizPay response missing payment URL or order number:", payload);
      return res.status(502).json({ error: "أعاد مزود الدفع ردًا غير مكتمل. لم يتم إنشاء طلب قابل للدفع." });
    }

    const transaction = await prisma.paymentTransaction.create({
      data: {
        studentId: student.id,
        internalOrderId,
        providerOrderNumber,
        providerTransactionId,
        subscriptionType,
        amount: subscription.amount,
        paymentUrl,
        returnUrl,
        memo,
        providerPayload: safeJson(payload),
      },
    });

    return res.json({ status: "success", data: { paymentUrl: transaction.paymentUrl, internalOrderId, amount: transaction.amount, subscriptionType } });
  } catch (error) {
    console.error("SofizPay payment start failed:", error);
    return res.status(500).json({ error: "تعذر بدء عملية الدفع الإلكتروني حاليًا." });
  }
}

async function getSofizPayPaymentStatus(req, res) {
  try {
    if (!isParent(req)) return res.status(403).json({ error: "هذه العملية متاحة للولي فقط." });
    const internalOrderId = text(req.query?.order_id, 120);
    if (!internalOrderId) return res.status(400).json({ error: "رقم طلب الدفع غير موجود." });
    const transaction = await prisma.paymentTransaction.findUnique({ where: { internalOrderId } });
    if (!transaction) return res.status(404).json({ error: "طلب الدفع غير موجود." });
    const student = await getOwnedStudent(req, transaction.studentId);
    if (!student) return res.status(403).json({ error: "لا تملك صلاحية هذا الطلب." });

    const result = transaction.status === "PAID" ? { transaction, verified: true, pending: false } : await verifyTransaction(transaction);
    const subscription = VALID_SUBSCRIPTIONS.get(transaction.subscriptionType);
    return res.json({ status: "success", data: { paymentStatus: result.verified ? "PAID" : result.failed ? "FAILED" : "PENDING", subscriptionType: transaction.subscriptionType, subscriptionLabel: subscription?.label, amount: transaction.amount, internalOrderId, studentId: transaction.studentId, message: result.verified ? `مبروك، تم تسجيلك في ${subscription?.label}.` : result.failed ? "لم يتم تأكيد عملية الدفع." : "عملية الدفع قيد التحقق من SofizPay." } });
  } catch (error) {
    console.error("SofizPay payment status failed:", error);
    return res.status(500).json({ error: "تعذر التحقق من حالة الدفع حاليًا." });
  }
}

async function receiveSofizPayWebhook(req, res) {
  try {
    const providerOrderNumber = extractProviderOrderNumber(req.body || req.query || {});
    if (!providerOrderNumber) return res.status(400).json({ error: "رقم معاملة SofizPay غير موجود." });
    const transaction = await prisma.paymentTransaction.findUnique({ where: { providerOrderNumber } });
    if (!transaction) return res.status(404).json({ error: "المعاملة غير معروفة." });
    const result = await verifyTransaction(transaction);
    return res.json({ status: result.verified ? "paid" : result.pending ? "pending" : "failed" });
  } catch (error) {
    console.error("SofizPay webhook failed:", error);
    return res.status(500).json({ error: "تعذر معالجة إشعار SofizPay." });
  }
}

module.exports = { startSofizPayPayment, getSofizPayPaymentStatus, receiveSofizPayWebhook };
