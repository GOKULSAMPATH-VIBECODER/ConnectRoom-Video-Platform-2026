
const { PLAN_LIMITS, getPlanLimits } =
  require("./server/services/quota");

for (const [plan, limits] of Object.entries(PLAN_LIMITS)) {
  console.log(
    `${plan}: daily=${limits.dailyLimit}, monthly=${limits.monthlyLimit}`
  );
}

console.log("Gold plan test:", getPlanLimits("Gold"));

try {
  getPlanLimits("Platinum");
  console.error("FAIL: Invalid plan was accepted");
  process.exitCode = 1;
} catch {
  console.log("PASS: Invalid plan rejected");
}
