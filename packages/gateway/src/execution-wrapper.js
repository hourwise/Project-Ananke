export async function executeTool(toolName, args, executor) {
    const start = performance.now();
    try {
        const data = await executor(args);
        const durationMs = Math.round(performance.now() - start);
        return { success: true, data, durationMs };
    }
    catch (err) {
        const durationMs = Math.round(performance.now() - start);
        const message = err instanceof Error ? err.message : String(err);
        const errorCode = classifyError(err);
        return { success: false, error: message, errorCode, durationMs };
    }
}
function classifyError(err) {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out'))
        return 'DOWNSTREAM_TIMEOUT';
    if (msg.includes('auth') || msg.includes('unauthorized') || msg.includes('401'))
        return 'AUTH_EXPIRED';
    if (msg.includes('permission') || msg.includes('forbidden') || msg.includes('403'))
        return 'PERMISSION_DENIED';
    if (msg.includes('rate') || msg.includes('429'))
        return 'RATE_LIMITED';
    if (msg.includes('validation') || msg.includes('invalid'))
        return 'VALIDATION_ERROR';
    if (msg.includes('stale') || msg.includes('version'))
        return 'STALE_STATE';
    if (msg.includes('conflict') || msg.includes('409'))
        return 'CONFLICT';
    return 'UNKNOWN_FAILURE';
}
//# sourceMappingURL=execution-wrapper.js.map