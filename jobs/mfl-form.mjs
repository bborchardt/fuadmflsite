// A commissioner's form on MFL's pages, for what MFL's import can't do: a past week's lineup (the
// lineup import refuses one, the deadline passed) and Recalculate Standings. With mflImport, the
// only ways the daily job writes to MFL.

// MFL now and then answers the job's request for a league's page or form with its own public home
// page (docs/mfl.md): the error says so, as what the page is read for won't be there. Known by its
// title, as a league moved to another server may be sent on there and still be the page asked for.
// Null otherwise.
export function mflHomePage(body) {
    return /<title>\s*MyFantasyLeague Home Page\s*<\/title>/i.test(body)
        ? "MFL sent its own home page instead"
        : null;
}

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
        // the job's fetch says when MFL turned the post away or sent it somewhere odd (`fromMfl`)
        throw new Error(`MFL's ${what} form failed: ${error.fromMfl ? error.message : `network error (${error.message})`}`);
    }
    const homePage = response.ok && mflHomePage(body);
    if (homePage) {
        throw new Error(`MFL's ${what} form failed: ${homePage}`);
    }
    if (!response.ok || !ok(body)) {
        const said = body.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        const error = (/Error\(s\)[^.]*\.?[^.]*/i.exec(said) || [])[0];
        const title = ((/<title>([^<]*)<\/title>/i.exec(body) || [])[1] || "").replace(/&amp;/g, "&").trim();
        const page = `MFL's answer${title ? `, "${title}",` : ""} didn't confirm it`;
        throw new Error(`MFL's ${what} form failed: ${error || (response.ok ? page : `HTTP ${response.status}`)}`);
    }
    return body;
}
