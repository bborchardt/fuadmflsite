// MFL's import, the one way the daily job writes to MFL.

// MFL reports errors with HTTP 200, so anything but <status>OK</status> throws. `data` null: an
// import that takes its fields as parameters. A dry run throws before anything is sent.
export async function mflImport({type, data, params = {}}, {dryRun, url, leagueId, headers, fetchImpl}) {
    if (dryRun) {
        throw new Error(`A dry run reached MFL's ${type} import, which it must never send`);
    }
    let response, body;
    try {
        response = await fetchImpl(url, {
            method: "POST",
            headers: {...headers, "Content-Type": "application/x-www-form-urlencoded"},
            body: new URLSearchParams({TYPE: type, L: leagueId, ...(data === null ? {} : {DATA: data}), ...params})
        });
        body = await response.text();
    } catch (error) {
        throw new Error(`MFL's ${type} import failed: network error (${error.message})`);
    }
    const error = (/<error>([^<]*)<\/error>/.exec(body) || [])[1];
    if (error || !response.ok || !/<status\b[^>]*>\s*OK\s*<\/status>/i.test(body)) {
        throw new Error(`MFL's ${type} import failed: ${error || `HTTP ${response.status}, "${body.trim().slice(0, 200)}"`}`);
    }
}
