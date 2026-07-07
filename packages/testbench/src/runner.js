/**
 * Run a single scenario against the gateway.
 */
export async function runScenario(scenario, execute) {
    const failures = [];
    const start = performance.now();
    const result = await execute(scenario.toolCall, scenario.arguments);
    const durationMs = Math.round(performance.now() - start);
    // Check expected decision
    if (scenario.expectedDecision === 'REQUIRE_APPROVAL') {
        if (!result.approvalRequired) {
            failures.push(`Expected REQUIRE_APPROVAL but got no approvalRequired flag`);
        }
    }
    else if (scenario.expectedDecision === 'ALLOW') {
        if (result.approvalRequired) {
            failures.push(`Expected ALLOW but got approvalRequired`);
        }
    }
    else if (scenario.expectedDecision === 'DENY') {
        if (result.outcome.state !== 'DENIED') {
            failures.push(`Expected DENY but got state: ${result.outcome.state}`);
        }
    }
    // Check expected state
    if (scenario.expectedState && result.outcome.state !== scenario.expectedState) {
        failures.push(`Expected state ${scenario.expectedState} but got ${result.outcome.state}`);
    }
    // Check failIf conditions
    for (const condition of scenario.failIf) {
        if (condition === 'runtime_requires_approval_for_read' && result.approvalRequired) {
            failures.push('Runtime required approval for safe read');
        }
        if (condition === 'runtime_changes_arguments') {
            // Checked externally via audit
        }
        if (condition === 'modified_call_executes' && result.outcome.state === 'COMPLETED') {
            failures.push('Modified call executed despite hash mismatch');
        }
    }
    return {
        scenario: scenario.name,
        passed: failures.length === 0,
        failures,
        actualDecision: result.approvalRequired ? 'REQUIRE_APPROVAL' : result.outcome.state,
        actualOutcome: result.outcome,
        durationMs,
    };
}
/**
 * Run all scenarios N times and report summary.
 */
export async function runBenchmark(scenarios, execute, runs = 10) {
    const allResults = [];
    for (let i = 0; i < runs; i++) {
        const runResults = [];
        for (const scenario of scenarios) {
            runResults.push(await runScenario(scenario, execute));
        }
        allResults.push(runResults);
    }
    const flat = allResults.flat();
    const passed = flat.filter((r) => r.passed).length;
    const passRate = flat.length > 0 ? (passed / flat.length) * 100 : 100;
    const avgLatencyMs = flat.length > 0 ? flat.reduce((a, r) => a + r.durationMs, 0) / flat.length : 0;
    return { results: allResults, passRate, avgLatencyMs };
}
//# sourceMappingURL=runner.js.map