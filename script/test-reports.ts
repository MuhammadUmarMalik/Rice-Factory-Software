import { strict as assert } from "node:assert";
import {
  computeAgingBuckets,
  computeBalanceSheetValidation,
  computeInventoryRollForward,
  computeTrialBalanceTotals,
} from "../server/reports/calculations";

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

function run() {
  testInventoryRollForward();
  testTrialBalanceTotals();
  testBalanceSheetValidation();
  testAgingBuckets();
  console.log("Report calculation tests passed.");
}

run();
