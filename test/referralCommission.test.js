const { test } = require("node:test");
const assert = require("node:assert/strict");
const { awardReferralCommission } = require("../utils/referral");

function createFakeTransaction() {
  const profiles = new Map([
    ["0660000000", { referredByPhone: "0550000000" }],
  ]);
  const commissions = new Map();
  return {
    referralProfile: {
      findUnique: async ({ where }) => profiles.get(where.parentPhone) || null,
    },
    referralCommission: {
      createMany: async ({ data }) => {
        const key = `${data.referredParentPhone}::${data.level}`;
        if (commissions.has(key)) return { count: 0 };
        const commission = { id: `${commissions.size + 1}`, ...data };
        commissions.set(key, commission);
        return { count: 1 };
      },
      findUnique: async ({ where }) => {
        const key = `${where.referredParentPhone_level.referredParentPhone}::${where.referredParentPhone_level.level}`;
        return commissions.get(key) || null;
      },
    },
    commissions,
  };
}

test("awards 100 DZD once for the same phone and level", async () => {
  const tx = createFakeTransaction();
  const first = await awardReferralCommission(tx, {
    referredParentPhone: "0660000000",
    subscriptionType: "MATH",
    level: "السنة الأولى متوسط",
  });
  const retry = await awardReferralCommission(tx, {
    referredParentPhone: "0660000000",
    subscriptionType: "PHYSICS",
    level: "السنة الأولى متوسط",
  });

  assert.equal(first.amountDzd, 100);
  assert.equal(first.level, "السنة الأولى متوسط");
  assert.deepEqual(retry, first);
  assert.equal(tx.commissions.size, 1);
});

test("awards a separate commission for a different level", async () => {
  const tx = createFakeTransaction();
  const first = await awardReferralCommission(tx, {
    referredParentPhone: "0660000000",
    subscriptionType: "MATH",
    level: "السنة الأولى متوسط",
  });
  const second = await awardReferralCommission(tx, {
    referredParentPhone: "0660000000",
    subscriptionType: "MATH",
    level: "السنة الثانية متوسط",
  });

  assert.equal(first.amountDzd, 100);
  assert.equal(second.amountDzd, 100);
  assert.equal(second.level, "السنة الثانية متوسط");
  assert.equal(tx.commissions.size, 2);
});

test("awards 250 DZD for the first two-subject upgrade at a level", async () => {
  const tx = createFakeTransaction();
  const commission = await awardReferralCommission(tx, {
    referredParentPhone: "0660000000",
    subscriptionType: "BOTH",
    level: "السنة الثالثة متوسط",
  });

  assert.equal(commission.amountDzd, 250);
  assert.equal(tx.commissions.size, 1);
});

test("does not award without a level", async () => {
  const tx = createFakeTransaction();
  const commission = await awardReferralCommission(tx, {
    referredParentPhone: "0660000000",
    subscriptionType: "MATH",
  });

  assert.equal(commission, null);
  assert.equal(tx.commissions.size, 0);
});

// Manual and electronic payment paths both call this helper only after payment
// is accepted/confirmed, so a pending or failed payment cannot create a row.
