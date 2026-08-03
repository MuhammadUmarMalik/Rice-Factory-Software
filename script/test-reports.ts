import { strict as assert } from "node:assert";
import {
  computeAgingBuckets,
  computeBalanceSheetValidation,
  computeInventoryRollForward,
  computeTrialBalanceTotals,
  computeWeightedAverageCost,
} from "../server/services/reports/calculations";

function testInventoryRollForward() {
  const roll = computeInventoryRollForward({
    openingQty: 10,
    openingValue: 100,
    inQty: 5,
    inValue: 75,
    outQty: 8,
    outValue: 80,
  });
  assert.equal(roll.closingQty, 7);
  assert.equal(roll.closingValue, 95);
  assert.equal(Math.round(roll.avgCost * 100) / 100, 11.67);
}

function testTrialBalanceTotals() {
  const summary = computeTrialBalanceTotals([
    { debit: "100", credit: "0" },
    { debit: "0", credit: "100" },
  ]);
  assert.equal(summary.balanced, true);
  assert.equal(summary.difference, "0.00");
}

function testBalanceSheetValidation() {
  const validation = computeBalanceSheetValidation("1000", "1000");
  assert.equal(validation.balanced, true);
  assert.equal(validation.difference, "0.00");
}

function testAgingBuckets() {
  const aging = computeAgingBuckets("500", 45);
  assert.equal(aging.bucket, "31-60");
  assert.equal(aging.buckets["31-60"], 500);
  assert.equal(aging.buckets["0-30"], 0);
}

function testWeightedAverageCost() {
  // Outflows are valued at the period weighted average of opening + inflows,
  // not at whatever the product's live average happens to be.
  const avg = computeWeightedAverageCost({
    openingQty: 100,
    openingValue: 4000, // 40/kg
    inQty: 100,
    inValue: 6000, // 60/kg
  });
  assert.equal(avg, 50);

  const roll = computeInventoryRollForward({
    openingQty: 100,
    openingValue: 4000,
    inQty: 100,
    inValue: 6000,
    outQty: 50,
    outValue: 50 * avg,
  });
  assert.equal(roll.closingQty, 150);
  assert.equal(roll.closingValue, 7500);
  assert.equal(roll.avgCost, 50);
  assert.equal(roll.closingValue / roll.closingQty, roll.avgCost);

  // No movement at all falls back to the supplied cost rather than zero.
  assert.equal(
    computeWeightedAverageCost({ openingQty: 0, openingValue: 0, inQty: 0, inValue: 0, fallbackCost: 12 }),
    12,
  );
}

function run() {
  testInventoryRollForward();
  testWeightedAverageCost();
  testTrialBalanceTotals();
  testBalanceSheetValidation();
  testAgingBuckets();
  console.log("Report calculation tests passed.");
}

run();
