const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { logAudit } = require("../utils/audit");

const SOFIZPAY_BASE_URL = String(process.env.SOFIZPAY_BASE_URL || "https://sofizpay.com").replace(/\/$/, "");
const SOFIZPAY_ACCOUNT = process.env.SOFIZPAY_ACCOUNT || "GBYAJX2VUMCKQQMTQRKIHFL7GWKPXQGAQNNCJOIV232S3Q73NNYK6JF4";
const SOFIZPAY_CREATE_URL = `${SOFIZPAY_BASE_URL}/make-cib-transaction/`;
const SOFIZPAY_CHECK_URL = `${SOFIZPAY_BASE_URL}/cib-transaction-check/`;
const SOFIZPAY_OPERATION_DETAILS_URL = `${SOFIZPAY_BASE_URL}/operation-details/`;
const SOFIZPAY_ENCRYPTED_SECRET_KEY = String(process.env.SOFIZPAY_ENCRYPTED_SECRET_KEY || "").trim();
const PUBLIC_SITE_URL = String(process.env.APP_BASE_URL || process.env.PUBLIC_SITE_URL || "https://dr.africacold.fr").replace(/\/$/, "");
const SOFIZPAY_WEBHOOK_URL = `${PUBLIC_SITE_URL}/api/payments/sofizpay/webhook`;
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

function normalizeProviderOrderNumber(value) {
  return text(value, 120).replace(/^REF\s*[:#-]?\s*/i, "").trim();
}

function buildInternalOrderId() {
  return `MINA-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function buildSofizPayReturnUrl(internalOrderId, subscriptionType) {
  const url = new URL(`${PUBLIC_SITE_URL}/parent-dashboard.html`);
  url.searchParams.set("payment", "sofizpay");
  url.searchParams.set("subscription", subscriptionType);
  url.searchParams.set("internal_order_id", internalOrderId);
  return url.toString();
}

function extractProviderTransactionId(payload) {
  return text(
    payload?.transaction_id ||
    payload?.data?.transaction_id ||
    payload?.operation_id ||
    payload?.operationId ||
    payload?.data?.operation_id ||
    payload?.data?.operationId ||
    payload?.id ||
    payload?.data?.id,
    120
  ) || null;
}

function findNestedField(payload, fieldNames, depth = 0) {
  if (!payload || depth > 6 || typeof payload !== "object") return null;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = findNestedField(item, fieldNames, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const fieldName of fieldNames) {
    if (payload[fieldName] !== undefined && payload[fieldName] !== null && String(payload[fieldName]).trim()) {
      return payload[fieldName];
    }
  }
  for (const value of Object.values(payload)) {
    const found = findNestedField(value, fieldNames, depth + 1);
    if (found) return found;
  }
  return null;
}

async function createSofizPayPayment({ student, subscriptionType, amount, internalOrderId }) {
  const phone = text(student.parentPhone, 40);
  const email = `${phone.replace(/[^0-9]/g, "") || "parent"}@dr.africacold.fr`;
  const params = new URLSearchParams({
    account: SOFIZPAY_ACCOUNT,
    amount: String(amount),
    full_name: text(student.studentName, 120) || "Student",
    phone,
    email,
    return_url: buildSofizPayReturnUrl(internalOrderId, subscriptionType),
    webhook_url: SOFIZPAY_WEBHOOK_URL,
    invoice_id: internalOrderId,
    language: "ar",
    memo: `${subscriptionType}-${amount}`,
    redirect: "yes",
    keep_return_url: "True",
  });
  const { response, payload } = await fetchJson(`${SOFIZPAY_CREATE_URL}?${params.toString()}`);
  const paymentUrl = text(payload?.payment_url || payload?.data?.payment_url || payload?.formUrl || payload?.cib_response?.formUrl, 4000);
  if (!response.ok || payload?.success === false || !paymentUrl) {
    throw new Error(payload?.message || payload?.error || "تعذر إنشاء رابط SofizPay مخصص.");
  }
  return {
    paymentUrl,
    providerOrderNumber: extractProviderOrderNumber(payload),
    providerTransactionId: extractProviderTransactionId(payload),
    providerPayload: payload,
  };
}

function amountAsNumber(value) {
  const amount = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(amount) ? amount : null;
}

function extractProviderOrderNumber(payload) {
  return normalizeProviderOrderNumber(text(
    payload?.cib_transaction_id ||
    payload?.data?.cib_transaction_id ||
    payload?.cib_response?.orderId ||
    payload?.data?.cib_response?.orderId ||
    payload?.order_number ||
    payload?.orderNumber ||
    payload?.order ||
    findNestedField(payload, ["cib_transaction_id", "cibTransactionId", "order_number", "orderNumber", "cibOrderNumber", "satimOrderNumber"]),
    120
  )) || null;
}

function extractInternalOrderId(payload) {
  return text(
    payload?.invoice_id ||
    payload?.data?.invoice_id ||
    payload?.internal_order_id ||
    payload?.data?.internal_order_id ||
    payload?.order_id ||
    payload?.data?.order_id,
    120
  ) || null;
}

function safeJson(value) {
  try {
    return JSON.stringify(value).slice(0, 20000);
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSofizPayOperationDetails(operationId) {
  if (!SOFIZPAY_ENCRYPTED_SECRET_KEY || !operationId) return null;
  const url = new URL(`${SOFIZPAY_OPERATION_DETAILS_URL}${encodeURIComponent(operationId)}/`);
  url.searchParams.set("encrypted_sk", SOFIZPAY_ENCRYPTED_SECRET_KEY);
  const { response, payload } = await fetchJson(url.toString());
  return response.ok && payload && !payload.error ? payload : null;
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

function providerPaymentSignals(payload) {
  const orderStatus = Number(payload?.orderStatus ?? payload?.data?.orderStatus ?? payload?.cib_response?.orderStatus);
  const responseCode = text(
    payload?.respCode ??
    payload?.responseCode ??
    payload?.data?.respCode ??
    payload?.data?.responseCode ??
    payload?.cib_response?.respCode ??
    payload?.cib_response?.responseCode,
    10
  );
  const status = text(payload?.status ?? payload?.data?.status, 60).toLowerCase();
  return { orderStatus, responseCode, status };
}

function providerPaymentAccepted(payload, transaction) {
  const { orderStatus, responseCode, status } = providerPaymentSignals(payload);
  const acceptedStatus = new Set(["paid", "completed", "complete", "success", "succeeded", "approved"]);
  const accepted = orderStatus === 2 || responseCode === "00" || acceptedStatus.has(status);
  if (!accepted) return false;

  const returnedAmount = amountAsNumber(payload?.Amount ?? payload?.amount ?? payload?.data?.Amount ?? payload?.data?.amount ?? payload?.transaction?.amount);
  if (returnedAmount !== null && Math.round(returnedAmount) !== transaction.amount) return false;

  const destination = text(payload?.destination_account ?? payload?.data?.destination_account ?? payload?.destination, 120);
  if (destination && destination !== SOFIZPAY_ACCOUNT) return false;
  return true;
}

function providerPaymentExplicitlyFailed(payload) {
  const { orderStatus, responseCode, status } = providerPaymentSignals(payload);
  const failedStatuses = new Set(["failed", "declined", "cancelled", "canceled", "rejected", "expired", "error", "refunded"]);
  const failedResponseCodes = new Set(["05", "51", "54", "55", "57", "58", "91", "96"]);
  return failedStatuses.has(status) || failedResponseCodes.has(responseCode) || (Number.isFinite(orderStatus) && orderStatus > 2);
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

    const student = await tx.student.findUnique({ where: { id: fresh.studentId }, select: { id: true } });
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
      data: { status: "PAID", providerPayload: safeJson(providerPayload), verifiedAt: now, paidAt: now },
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

  if (!response.ok || payload?.error) return { transaction, verified: false, pending: true, providerPayload: payload };
  if (!providerPaymentAccepted(payload, transaction)) {
    if (!providerPaymentExplicitlyFailed(payload)) {
      const pendingTransaction = await prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: { providerPayload: safeJson(payload) },
      });
      return { transaction: pendingTransaction, verified: false, pending: true, providerPayload: payload };
    }

    const failedTransaction = await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "FAILED",
        providerPayload: safeJson(payload),
        verifiedAt: new Date(),
      },
    });
    return { transaction: failedTransaction, verified: false, pending: false, failed: true, providerPayload: payload };
  }

  const updated = await activatePaidTransaction(transaction, payload);
  return { transaction: updated, verified: true, pending: false, providerPayload: payload };
}

async function reconcilePendingSofizPayPayments() {
  const transactions = await prisma.paymentTransaction.findMany({
    where: {
      provider: "SOFIZPAY",
      status: "PENDING",
      providerOrderNumber: { not: null },
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    orderBy: { updatedAt: "asc" },
    take: 25,
  });

  for (const transaction of transactions) {
    try {
      await verifyTransaction(transaction);
    } catch (error) {
      console.error("Automatic SofizPay verification failed:", transaction.id, error.message);
    }
  }
}

async function startSofizPayPayment(req, res) {
  try {
    if (!isParent(req)) return res.status(403).json({ error: "هذه العملية متاحة للولي فقط." });
    const subscriptionType = text(req.body?.subscriptionType, 20).toUpperCase();
    const subscription = VALID_SUBSCRIPTIONS.get(subscriptionType);
    if (!subscription) return res.status(400).json({ error: "اختر الرياضيات أو الفيزياء أو المادتين معًا." });

    const student = await getOwnedStudent(req, req.body?.studentId);
    if (!student || !studentBelongsToParent(student, req)) return res.status(403).json({ error: "لا تملك صلاحية الدفع لهذا التلميذ." });
    if (student.level === "طالب جامعي") return res.status(400).json({ error: "الدفع الإلكتروني بهذه الروابط متاح لتلاميذ التعليم المتوسط فقط حاليًا." });
    if (student.paymentStage === "PAID" || student.paymentStatus) return res.status(400).json({ error: "هذا الحساب لديه اشتراك مدفوع بالفعل." });

    const recent = await prisma.paymentTransaction.findFirst({
      where: { studentId: student.id, subscriptionType, status: "PENDING", createdAt: { gt: new Date(Date.now() - 15 * 60 * 1000) } },
      orderBy: { createdAt: "desc" },
    });
    if (recent?.paymentUrl) {
      if (recent.teacherDismissedAt) {
        await prisma.paymentTransaction.update({ where: { id: recent.id }, data: { teacherDismissedAt: null } });
      }
      return res.json({ status: "success", data: { paymentUrl: recent.paymentUrl, internalOrderId: recent.internalOrderId, amount: recent.amount, subscriptionType, reused: true } });
    }

    const internalOrderId = buildInternalOrderId();
    const transaction = await prisma.paymentTransaction.create({
      data: {
        studentId: student.id,
        internalOrderId,
        subscriptionType,
        amount: subscription.amount,
        returnUrl: buildSofizPayReturnUrl(internalOrderId, subscriptionType),
        memo: `${subscriptionType}-${subscription.amount}`,
      },
    });

    let providerPayment;
    try {
      providerPayment = await createSofizPayPayment({
        student,
        subscriptionType,
        amount: subscription.amount,
        internalOrderId,
      });
    } catch (error) {
      // Never send the parent to an untracked fixed link: it cannot guarantee
      // invoice_id/webhook correlation and would break automatic activation.
      await prisma.paymentTransaction.delete({ where: { id: transaction.id } }).catch(() => {});
      throw error;
    }

    const updatedTransaction = await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        paymentUrl: providerPayment.paymentUrl,
        providerOrderNumber: providerPayment.providerOrderNumber,
        providerTransactionId: providerPayment.providerTransactionId,
        providerPayload: safeJson(providerPayment.providerPayload),
      },
    });

    return res.json({ status: "success", data: { paymentUrl: updatedTransaction.paymentUrl, internalOrderId, amount: updatedTransaction.amount, subscriptionType, providerOrderNumber: updatedTransaction.providerOrderNumber } });
  } catch (error) {
    console.error("SofizPay fixed payment start failed:", error);
    return res.status(500).json({ error: "تعذر تجهيز رابط الدفع الإلكتروني حاليًا." });
  }
}

async function getSofizPayPaymentStatus(req, res) {
  try {
    if (!isParent(req)) return res.status(403).json({ error: "هذه العملية متاحة للولي فقط." });
    const internalOrderId = text(req.query?.internal_order_id || req.query?.order_id, 120);
    const providerOrderNumber = normalizeProviderOrderNumber(extractProviderOrderNumber(req.query || {}));
    if (!internalOrderId) return res.status(400).json({ error: "رقم طلب الموقع غير موجود." });

    let transaction = await prisma.paymentTransaction.findUnique({ where: { internalOrderId } });
    if (!transaction) return res.status(404).json({ error: "طلب الدفع غير موجود." });
    const student = await getOwnedStudent(req, transaction.studentId);
    if (!student) return res.status(403).json({ error: "لا تملك صلاحية هذا الطلب." });

    if (providerOrderNumber && transaction.providerOrderNumber && transaction.providerOrderNumber !== providerOrderNumber) {
      return res.status(409).json({ error: "رقم معاملة SofizPay لا يطابق طلب الموقع." });
    }
    if (providerOrderNumber && !transaction.providerOrderNumber) {
      const alreadyAssigned = await prisma.paymentTransaction.findFirst({ where: { providerOrderNumber, NOT: { id: transaction.id } }, select: { id: true } });
      if (alreadyAssigned) return res.status(409).json({ error: "رقم المعاملة مرتبط بطلب آخر." });
      transaction = await prisma.paymentTransaction.update({ where: { id: transaction.id }, data: { providerOrderNumber } });
    }

    if (!transaction.providerOrderNumber && transaction.providerTransactionId) {
      const operationDetails = await fetchSofizPayOperationDetails(transaction.providerTransactionId);
      const recoveredOrderNumber = extractProviderOrderNumber(operationDetails);
      if (recoveredOrderNumber) {
        const alreadyAssigned = await prisma.paymentTransaction.findFirst({ where: { providerOrderNumber: recoveredOrderNumber, NOT: { id: transaction.id } }, select: { id: true } });
        if (!alreadyAssigned) {
          transaction = await prisma.paymentTransaction.update({
            where: { id: transaction.id },
            data: { providerOrderNumber: recoveredOrderNumber, providerPayload: safeJson({ operationDetails }) },
          });
        }
      }
    }

    const result = transaction.status === "PAID" ? { transaction, verified: true, pending: false } : await verifyTransaction(transaction);
    const subscription = VALID_SUBSCRIPTIONS.get(transaction.subscriptionType);
    return res.json({ status: "success", data: { paymentStatus: result.verified ? "PAID" : result.failed ? "FAILED" : "PENDING", subscriptionType: transaction.subscriptionType, subscriptionLabel: subscription?.label, amount: transaction.amount, internalOrderId, studentId: transaction.studentId, message: result.verified ? `مبروك، تم تسجيلك في ${subscription?.label}.` : result.failed ? "لم يتم تأكيد عملية الدفع." : providerOrderNumber ? "عملية الدفع قيد التحقق من SofizPay." : "لم تصلنا بعد بيانات المعاملة من SofizPay." } });
  } catch (error) {
    console.error("SofizPay fixed payment status failed:", error);
    return res.status(500).json({ error: "تعذر التحقق من حالة الدفع حاليًا." });
  }
}

async function getTeacherElectronicPayments(req, res) {
  try {
    const level = text(req.query?.level, 80);
    if (!level) return res.status(400).json({ error: "المستوى الدراسي مطلوب." });

    const transactions = await prisma.paymentTransaction.findMany({
      where: {
        teacherDismissedAt: null,
        status: { in: ["PAID", "PENDING", "FAILED"] },
        student: { level },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        studentId: true,
        subscriptionType: true,
        amount: true,
        currency: true,
        status: true,
        providerOrderNumber: true,
        internalOrderId: true,
        paidAt: true,
        verifiedAt: true,
        createdAt: true,
        updatedAt: true,
        student: {
          select: {
            id: true,
            studentName: true,
            parentPhone: true,
            level: true,
            mathEnrollment: true,
            physicsEnrollment: true,
          },
        },
      },
    });

    const summary = {
      total: transactions.length,
      successful: transactions.filter((transaction) => transaction.status === "PAID").length,
      attempts: transactions.filter((transaction) => transaction.status !== "PAID").length,
    };
    return res.json({ status: "success", data: transactions, summary });
  } catch (error) {
    console.error("Teacher electronic payments lookup failed:", error);
    return res.status(500).json({ error: "تعذر تحميل الدفعات الإلكترونية حالياً." });
  }
}

async function reconcileParentSofizPayPayment(req, res) {
  try {
    if (!isParent(req)) return res.status(403).json({ error: "هذه العملية متاحة للولي فقط." });
    const providerOrderNumber = normalizeProviderOrderNumber(extractProviderOrderNumber(req.body || {}) || req.body?.providerOrderNumber);
    const subscriptionType = text(req.body?.subscriptionType, 20).toUpperCase();
    if (!providerOrderNumber) return res.status(400).json({ error: "أدخل رقم معاملة SofizPay للتحقق." });
    if (!VALID_SUBSCRIPTIONS.has(subscriptionType)) return res.status(400).json({ error: "اختر نوع الاشتراك أولاً." });

    const student = await getOwnedStudent(req, req.body?.studentId);
    if (!student || !studentBelongsToParent(student, req)) return res.status(403).json({ error: "لا تملك صلاحية هذا التلميذ." });

    const existingProviderTransaction = await prisma.paymentTransaction.findUnique({ where: { providerOrderNumber } });
    if (existingProviderTransaction && existingProviderTransaction.studentId !== student.id) {
      return res.status(409).json({ error: "رقم المعاملة مرتبط بحساب آخر." });
    }
    if (existingProviderTransaction && existingProviderTransaction.subscriptionType !== subscriptionType) {
      return res.status(409).json({ error: "رقم المعاملة مرتبط بنوع اشتراك مختلف." });
    }

    const transaction = existingProviderTransaction || await prisma.paymentTransaction.findFirst({
      where: { studentId: student.id, subscriptionType, status: { not: "PAID" } },
      orderBy: { createdAt: "desc" },
    });
    if (!transaction) return res.status(404).json({ error: "لم نجد طلب دفع مفتوحًا مطابقًا لهذا الاشتراك." });
    if (transaction.status === "PAID" && transaction.providerOrderNumber !== providerOrderNumber) {
      return res.status(409).json({ error: "لا يمكن تغيير رقم معاملة تم تأكيدها ودفعها." });
    }

    const numberChanged = transaction.providerOrderNumber !== providerOrderNumber;
    const linked = numberChanged
      ? await prisma.paymentTransaction.update({
          where: { id: transaction.id },
          data: {
            providerOrderNumber,
            status: "PENDING",
            providerPayload: null,
            verifiedAt: null,
            paidAt: null,
          },
        })
      : transaction;
    const result = await verifyTransaction(linked);
    return res.json({
      status: "success",
      data: {
        paymentStatus: result.verified ? "PAID" : result.failed ? "FAILED" : "PENDING",
        message: result.verified ? "تم التحقق من الدفع وتفعيل الاشتراك." : result.failed ? "لم يؤكد SofizPay نجاح العملية." : "العملية ما زالت قيد التحقق.",
      },
    });
  } catch (error) {
    console.error("Parent SofizPay reconciliation failed:", error);
    return res.status(500).json({ error: "تعذر التحقق من المعاملة حاليًا." });
  }
}

async function reconcileTeacherElectronicPayment(req, res) {
  try {
    const transactionId = text(req.params?.id, 80);
    const providerOrderNumber = normalizeProviderOrderNumber(extractProviderOrderNumber(req.body || {}) || req.body?.providerOrderNumber);
    if (!providerOrderNumber) return res.status(400).json({ error: "أدخل رقم معاملة SofizPay للتحقق." });

    const transaction = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } });
    if (!transaction) return res.status(404).json({ error: "المعاملة المحلية غير موجودة." });
    if (transaction.status === "PAID" && transaction.providerOrderNumber !== providerOrderNumber) {
      return res.status(409).json({ error: "لا يمكن تغيير رقم معاملة تم تأكيدها ودفعها." });
    }

    const duplicate = await prisma.paymentTransaction.findFirst({ where: { providerOrderNumber, NOT: { id: transaction.id } }, select: { id: true } });
    if (duplicate) return res.status(409).json({ error: "رقم SofizPay مرتبط بطلب آخر." });

    const numberChanged = transaction.providerOrderNumber !== providerOrderNumber;
    const linked = numberChanged
      ? await prisma.paymentTransaction.update({
          where: { id: transaction.id },
          data: {
            providerOrderNumber,
            status: "PENDING",
            providerPayload: null,
            verifiedAt: null,
            paidAt: null,
          },
        })
      : transaction;
    const result = await verifyTransaction(linked);
    return res.json({
      status: "success",
      data: {
        paymentStatus: result.verified ? "PAID" : result.failed ? "FAILED" : "PENDING",
        transaction: result.transaction,
        message: result.verified ? "تم التحقق من الدفع وتفعيل الاشتراك." : result.failed ? "رفض SofizPay المعاملة." : "المعاملة ما زالت قيد التحقق.",
      },
    });
  } catch (error) {
    console.error("Teacher SofizPay reconciliation failed:", error);
    return res.status(500).json({ error: "تعذر التحقق من المعاملة حاليًا." });
  }
}

async function dismissTeacherElectronicPayment(req, res) {
  try {
    const transactionId = text(req.params?.id, 80);
    const transaction = await prisma.paymentTransaction.findUnique({ where: { id: transactionId }, select: { id: true, status: true } });
    if (!transaction) return res.status(404).json({ error: "محاولة الدفع غير موجودة." });
    if (transaction.status === "PAID") return res.status(400).json({ error: "لا يمكن حذف إشعار دفعة ناجحة من السجل." });

    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: { teacherDismissedAt: new Date() },
    });
    return res.json({ status: "success", message: "تم حذف إشعار محاولة الدفع." });
  } catch (error) {
    console.error("Teacher electronic payment dismissal failed:", error);
    return res.status(500).json({ error: "تعذر حذف إشعار محاولة الدفع حالياً." });
  }
}

async function receiveSofizPayWebhook(req, res) {
  try {
    // SofizPay may deliver callbacks as JSON, form-urlencoded, or query data.
    // Merge all sources so the automatic path never depends on one content type.
    const payload = {
      ...(req.query && typeof req.query === "object" ? req.query : {}),
      ...(req.body && typeof req.body === "object" ? req.body : {}),
    };
    let providerOrderNumber = extractProviderOrderNumber(payload);
    const internalOrderId = extractInternalOrderId(payload);
    const providerTransactionId = extractProviderTransactionId(payload);
    if (!providerOrderNumber && !internalOrderId && !providerTransactionId) return res.status(400).json({ error: "رقم معاملة SofizPay أو رقم الطلب الداخلي غير موجود." });

    const transaction = await prisma.paymentTransaction.findFirst({
      where: {
        OR: [
          ...(providerOrderNumber ? [{ providerOrderNumber }] : []),
          ...(internalOrderId ? [{ internalOrderId }] : []),
          ...(providerTransactionId ? [{ providerTransactionId }] : []),
        ],
      },
    });
    if (!transaction) return res.status(404).json({ error: "المعاملة غير معروفة أو لم تعد مرتبطة بطلب مفتوح." });

    let operationDetails = null;
    if (!providerOrderNumber && providerTransactionId) {
      operationDetails = await fetchSofizPayOperationDetails(providerTransactionId);
      providerOrderNumber = extractProviderOrderNumber(operationDetails);
    }

    let linkedTransaction = transaction;
    if (providerOrderNumber && transaction.providerOrderNumber && transaction.providerOrderNumber !== providerOrderNumber) {
      const conflict = await prisma.paymentTransaction.findUnique({ where: { providerOrderNumber }, select: { id: true } });
      if (conflict && conflict.id !== transaction.id) return res.status(409).json({ error: "رقم الطلب مرتبط بمعاملة أخرى." });
    }
    if (providerOrderNumber || providerTransactionId || operationDetails) {
      linkedTransaction = await prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          ...(providerOrderNumber ? { providerOrderNumber } : {}),
          ...(providerTransactionId ? { providerTransactionId } : {}),
          providerPayload: safeJson({ webhook: payload, operationDetails }),
        },
      });
    }

    if (!linkedTransaction.providerOrderNumber) {
      return res.json({ status: "pending", message: "تم استلام إشعار SofizPay، وننتظر رقم الطلب للتحقق." });
    }
    const result = await verifyTransaction(linkedTransaction);
    return res.json({ status: result.verified ? "paid" : result.pending ? "pending" : "failed" });
  } catch (error) {
    console.error("SofizPay webhook failed:", error);
    return res.status(500).json({ error: "تعذر معالجة إشعار SofizPay." });
  }
}

module.exports = {
  startSofizPayPayment,
  reconcilePendingSofizPayPayments,
  reconcileParentSofizPayPayment,
  getSofizPayPaymentStatus,
  getTeacherElectronicPayments,
  dismissTeacherElectronicPayment,
  reconcileTeacherElectronicPayment,
  receiveSofizPayWebhook,
};
