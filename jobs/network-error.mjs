// A failed request's message with the code Node gives under it, which "fetch failed" alone doesn't
// say: a connect timeout, a reset, a DNS failure. v2's lib/mfl.js has its own for export reads, as
// the job's modules take no lib of their own.

// "fetch failed: UND_ERR_CONNECT_TIMEOUT"; the message alone when there's no code under it
export function withCause(error) {
    const cause = error && error.cause;
    const code = cause && (cause.code || (Array.isArray(cause.errors) && cause.errors.map((each) => each && each.code).find(Boolean)));
    return `${error && error.message}${code ? `: ${code}` : ""}`;
}

// "network error (fetch failed: UND_ERR_CONNECT_TIMEOUT)"
export const networkError = (error) => `network error (${withCause(error)})`;
