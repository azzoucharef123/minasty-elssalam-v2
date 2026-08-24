const test = require("node:test");
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
        if (commissions.has(data.referredParentPhone)) return { count: 0 };
        const commission = { id: `${commissions.size + 1}`, ...data };
        commissions.set(data.referredParentPhone, commission);
        return { count: 1 };
      },
      findUnique: async ({ where }) => commissions.get(where.referredParentPhone) || null,
    },
    commissions,
  };
}

test("awards 100 DZD once for a single-subject upgrade", async () => {
  const tx = createFakeTransaction();
  const first = await awardReferralCommission(tx, {
    referredParentPhone: "0660000000",
    subscriptionType: "MATH",
  });
  const retry = await awardReferralCommission(tx, {
    referredParentPhone: "0660000000",
    subscriptionType: "PHYSICS",
  });

  assert.equal(first.amountDzd, 100);
  assert.equal(first.upgradeType, "MATH");
  assert.deepEqual(retry, first);
  assert.equal(tx.commissions.size, 1);
});

test("awards 250 DZD for the first two-subject upgrade", async () => {
  const tx = createFakeTransaction();
  const commission = await awardReferralCommission(tx, {
    referredParentPhone: "0660000000",
    subscriptionType: "BOTH",
  });

  assert.equal(commission.amountDzd, 250);
  assert.equal(tx.commissions.size, 1);
});
