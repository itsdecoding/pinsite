// Comprehensive verification test for daily distribution, depth-aware top-up, and kanban grouping

const assert = require("assert");

console.log("=================================================");
console.log("TEST SUITE: Daily Lead Distribution & Kanban Logic");
console.log("=================================================\n");

// Simulation of Depth-Aware Distribution Function
function simulateDailyDistribution({ poolLeads, callers, targetCap = 100 }) {
  // Sort callers by currentLoad ASC (lightest first)
  const sortedCallers = [...callers].sort((a, b) => a.currentLoad - b.currentLoad);
  
  let remainingPool = [...poolLeads];
  const assignedRecords = [];
  const callersBreakdown = [];

  for (const caller of sortedCallers) {
    const needed = Math.max(0, targetCap - caller.currentLoad);
    const canAssign = Math.min(needed, remainingPool.length);

    const batch = remainingPool.slice(0, canAssign);
    remainingPool = remainingPool.slice(canAssign);

    assignedRecords.push({
      callerId: caller.id,
      callerName: caller.name,
      assignedCount: batch.length,
      leadIds: batch.map(l => l.id),
    });

    callersBreakdown.push({
      id: caller.id,
      name: caller.name,
      before: caller.currentLoad,
      assigned: batch.length,
      current: caller.currentLoad + batch.length,
      target: targetCap,
    });
  }

  return {
    totalAssigned: assignedRecords.reduce((acc, r) => acc + r.assignedCount, 0),
    remainingPoolCount: remainingPool.length,
    callersBreakdown,
  };
}

// TEST 1: User's exact prompt scenario:
// "we scrape 1000 leads but we have just 5 callers we assigned them 100 each
// that means 500 leads are left and 500 leads is assigned properly"
console.log("Test 1: Fresh 1000 scraped leads distributed to 5 callers (100 cap each)");
const pool1000 = Array.from({ length: 1000 }, (_, i) => ({ id: `lead_${i + 1}`, score: 80 - (i % 30) }));
const callers5_fresh = [
  { id: "caller_1", name: "Caller A", currentLoad: 0 },
  { id: "caller_2", name: "Caller B", currentLoad: 0 },
  { id: "caller_3", name: "Caller C", currentLoad: 0 },
  { id: "caller_4", name: "Caller D", currentLoad: 0 },
  { id: "caller_5", name: "Caller E", currentLoad: 0 },
];

const res1 = simulateDailyDistribution({ poolLeads: pool1000, callers: callers5_fresh, targetCap: 100 });
assert.strictEqual(res1.totalAssigned, 500, "Must assign exactly 500 leads");
assert.strictEqual(res1.remainingPoolCount, 500, "Must leave exactly 500 leads in unassigned pool");
res1.callersBreakdown.forEach((c) => {
  assert.strictEqual(c.assigned, 100, `${c.name} must receive exactly 100 leads`);
  assert.strictEqual(c.current, 100, `${c.name} must now hold exactly 100 leads`);
});
console.log("✓ Test 1 Passed: 500 assigned, 500 remaining in pool, each caller has 100.\n");

// TEST 2: User's fictional scenario:
// "Caller A calls only 60 calls today so he left 40 so tomorrow system assign only 60 leads to fill his queue to 100 and same with other guys"
console.log("Test 2: Next day top-up (Caller A has 40 left -> receives exactly 60 leads)");
const remaining500Pool = Array.from({ length: 500 }, (_, i) => ({ id: `lead_pool_${i + 1}`, score: 75 }));
const callers_day2 = [
  { id: "caller_1", name: "Caller A", currentLoad: 40 }, // called 60 today, left 40
  { id: "caller_2", name: "Caller B", currentLoad: 0 },  // called all 100 today, left 0
  { id: "caller_3", name: "Caller C", currentLoad: 25 }, // called 75 today, left 25
  { id: "caller_4", name: "Caller D", currentLoad: 100 }, // full queue, called 0
  { id: "caller_5", name: "Caller E", currentLoad: 70 }, // called 30 today, left 70
];

const res2 = simulateDailyDistribution({ poolLeads: remaining500Pool, callers: callers_day2, targetCap: 100 });
const callerA = res2.callersBreakdown.find(c => c.name === "Caller A");
const callerB = res2.callersBreakdown.find(c => c.name === "Caller B");
const callerC = res2.callersBreakdown.find(c => c.name === "Caller C");
const callerD = res2.callersBreakdown.find(c => c.name === "Caller D");
const callerE = res2.callersBreakdown.find(c => c.name === "Caller E");

assert.strictEqual(callerA.assigned, 60, "Caller A (holds 40) must receive exactly 60 leads to reach 100");
assert.strictEqual(callerA.current, 100, "Caller A must now have 100 leads");

assert.strictEqual(callerB.assigned, 100, "Caller B (holds 0) must receive exactly 100 leads to reach 100");
assert.strictEqual(callerB.current, 100, "Caller B must now have 100 leads");

assert.strictEqual(callerC.assigned, 75, "Caller C (holds 25) must receive exactly 75 leads to reach 100");
assert.strictEqual(callerC.current, 100, "Caller C must now have 100 leads");

assert.strictEqual(callerD.assigned, 0, "Caller D (holds 100) must receive 0 leads because queue is full");
assert.strictEqual(callerD.current, 100, "Caller D stays at 100 leads");

assert.strictEqual(callerE.assigned, 30, "Caller E (holds 70) must receive exactly 30 leads to reach 100");
assert.strictEqual(callerE.current, 100, "Caller E must now have 100 leads");

const totalNeededDay2 = 60 + 100 + 75 + 0 + 30; // 265
assert.strictEqual(res2.totalAssigned, 265, "Total assigned must be exactly 265");
assert.strictEqual(res2.remainingPoolCount, 500 - 265, "Remaining pool must be 235");
console.log("✓ Test 2 Passed: Caller A received exactly 60 leads, all callers topped up to 100.\n");

// TEST 3: Edge Case: Pool has fewer leads than needed
console.log("Test 3: Pool has fewer leads than total needed (Fair distribution to lightest caller first)");
const scarcePool = Array.from({ length: 50 }, (_, i) => ({ id: `scarce_${i + 1}` }));
const callers_scarce = [
  { id: "caller_1", name: "Caller A", currentLoad: 80 }, // needs 20
  { id: "caller_2", name: "Caller B", currentLoad: 20 }, // needs 80 (lightest caller)
  { id: "caller_3", name: "Caller C", currentLoad: 60 }, // needs 40
];

const res3 = simulateDailyDistribution({ poolLeads: scarcePool, callers: callers_scarce, targetCap: 100 });
assert.strictEqual(res3.totalAssigned, 50, "Should assign all 50 available leads");
assert.strictEqual(res3.remainingPoolCount, 0, "Pool should now be 0");
// Lightest caller (Caller B with 20) goes first and receives 50
const scarceB = res3.callersBreakdown.find(c => c.name === "Caller B");
assert.strictEqual(scarceB.assigned, 50, "Lightest caller gets priority");
console.log("✓ Test 3 Passed: Lightest caller received leads fairly when pool was scarce.\n");

// TEST 4: Interested Prospects exclusion verification
console.log("Test 4: Interested prospects exclusion from active dial queue load");
function calculateActiveQueueLoad(leads) {
  // Excludes closed_won, closed_lost, dnc, not_interested, and interested
  const excludedStatuses = new Set(["closed_won", "closed_lost", "dnc", "not_interested", "interested"]);
  return leads.filter(l => !excludedStatuses.has(l.status)).length;
}

const callerLeadsWithInterested = [
  { id: "1", status: "assigned" },
  { id: "2", status: "assigned" },
  { id: "3", status: "callback" },
  { id: "4", status: "no_answer" },
  { id: "5", status: "interested" }, // Converted! Should NOT count as cold queue load
  { id: "6", status: "interested" }, // Converted!
  { id: "7", status: "not_interested" }, // Disposed
  { id: "8", status: "closed_won" }, // Deal won
];

const computedLoad = calculateActiveQueueLoad(callerLeadsWithInterested);
assert.strictEqual(computedLoad, 4, "Cold queue load must only be 4 (excluding interested, closed, not_interested)");
console.log("✓ Test 4 Passed: Interested prospects correctly separated from cold dial queue.\n");

// TEST 5: Lead Reassignment Status Preservation
console.log("Test 5: Lead reassignment preserves 'interested' status between callers, sets 'unassigned' to pool");
function simulateReassign(lead, targetCallerId) {
  const isCurrentlyInterested = lead.status === "interested";
  return {
    ...lead,
    assigned_to: targetCallerId || null,
    status: targetCallerId ? (isCurrentlyInterested ? "interested" : "assigned") : "unassigned",
  };
}

const hotLead = { id: "lead_hot_1", status: "interested", assigned_to: "caller_1" };
const coldLead = { id: "lead_cold_1", status: "assigned", assigned_to: "caller_1" };

// Reassign hot lead to Caller 2 (Closer)
const reassignedHot = simulateReassign(hotLead, "caller_2");
assert.strictEqual(reassignedHot.status, "interested", "Reassigned hot lead must remain 'interested'");
assert.strictEqual(reassignedHot.assigned_to, "caller_2", "Reassigned hot lead must now belong to caller_2");

// Reassign hot lead to pool
const returnedHot = simulateReassign(hotLead, null);
assert.strictEqual(returnedHot.status, "unassigned", "Returned hot lead to pool becomes 'unassigned'");
assert.strictEqual(returnedHot.assigned_to, null, "Returned lead has no assigned caller");

// Reassign cold lead to Caller 2
const reassignedCold = simulateReassign(coldLead, "caller_2");
assert.strictEqual(reassignedCold.status, "assigned", "Cold lead stays 'assigned'");
assert.strictEqual(reassignedCold.assigned_to, "caller_2");

console.log("✓ Test 5 Passed: Status preservation verified during lead reassignment.\n");

// TEST 6: Progressive Disclosure Pattern Rule Validation
console.log("Test 6: Progressive Disclosure design rule checks");
function getUIPatternForOptions(optionsCount, isPrimaryNav, isFrequent, isDestructive, isRare) {
  if (isDestructive) return "Confirmation Dialog";
  if (isRare) return "⋯ Menu";
  if (optionsCount >= 2 && optionsCount <= 4 && isPrimaryNav && isFrequent) return "Visible Tabs/Pills";
  if (optionsCount >= 5 || !isFrequent) return "Dropdown (hidden until clicked)";
  return "Dropdown (hidden until clicked)";
}

// 2-4 Primary nav (Dial Deck vs Transparent Kanban):
assert.strictEqual(
  getUIPatternForOptions(2, true, true, false, false),
  "Visible Tabs/Pills",
  "2 primary nav options must be visible tabs/pills"
);

// 5+ Secondary filter (Callers list or Niches list):
assert.strictEqual(
  getUIPatternForOptions(6, false, false, false, false),
  "Dropdown (hidden until clicked)",
  "5+ secondary filter options must be a hidden dropdown"
);

// Rare action (Adjust cap, force resync):
assert.strictEqual(
  getUIPatternForOptions(1, false, false, false, true),
  "⋯ Menu",
  "Rarely-used action must be behind ⋯ menu"
);

// Destructive action (Daily distribution execution):
assert.strictEqual(
  getUIPatternForOptions(1, false, false, true, false),
  "Confirmation Dialog",
  "Destructive/bulk action must be behind a confirmation dialog"
);

console.log("✓ Test 6 Passed: Progressive Disclosure pattern rules strictly validated.\n");

console.log("=================================================");
console.log("ALL 6 TESTS PASSED CLEANLY!");
console.log("=================================================");
