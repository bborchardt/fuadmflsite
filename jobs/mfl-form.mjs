// A commissioner's form on MFL's pages, for what MFL's import can't do: a past week's lineup (the
// lineup import refuses one, the deadline passed) and Recalculate Standings. With mflImport, the
// only ways the daily job writes to MFL.

// MFL answers a form with its page, HTTP 200 whatever happened: `ok(body)` says whether it worked. A
// dry run throws before anything is sent.
export async function mflForm({what, path, fields, ok}, {dryRun, host, headers, fetchImpl}) {
    if (dryRun) {
        throw new Error(`A dry run reached MFL's ${what} form, which it must never send`);
    }
    let response, body;
    try {
        response = await fetchImpl(`${host}${path}`, {
            method: "POST",
            headers: {...headers, "Content-Type": "application/x-www-form-urlencoded"},
            body: new URLSearchParams(fields)
        });
        body = await response.text();
    } catch (error) {
        throw new Error(`MFL's ${what} form failed: network error (${error.message})`);
    }
    if (!response.ok || !ok(body)) {
        const said = body.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        const error = (/Error\(s\)[^.]*\.?[^.]*/i.exec(said) || [])[0];
        throw new Error(`MFL's ${what} form failed: ${error || `HTTP ${response.status}`}`);
    }
    return body;
}
