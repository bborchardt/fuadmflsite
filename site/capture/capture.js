// The capture bookmarklet's work (index.html has the bookmark): on any page of an MFL league, reads
// each page v2 reads, draws or restyles afresh, as MFL serves it to whoever is logged in (before v2
// runs on it), and offers them as one zip. It only reads: no form is sent.

// MFL throttles a machine that asks too fast
const PAUSE = 1500;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function panel() {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;background:#fff;overflow:auto";
    document.body.appendChild(host);
    const root = host.attachShadow({mode: "open"});
    root.innerHTML = `<style>
        :host, div { font: 15px/1.4 -apple-system, system-ui, sans-serif; color: #111; }
        .wrap { max-width: 640px; margin: 0 auto; padding: 16px; }
        h1 { font-size: 18px; margin: 0 0 8px; }
        ol { padding-left: 20px; font-size: 13px; }
        .bad { color: #b00; }
        button { font: inherit; padding: 10px 16px; margin: 8px 8px 0 0; border-radius: 8px; border: 1px solid #888; background: #eee; }
    </style><div class="wrap"><h1></h1><p class="line"></p><div class="actions"></div><ol></ol></div>`;
    const close = document.createElement("button");
    close.textContent = "Close";
    let closed = false;
    close.addEventListener("click", () => {
        closed = true;
        host.remove();
    });
    root.querySelector(".actions").appendChild(close);
    return {
        closed: () => closed,
        title: (text) => {
            root.querySelector("h1").textContent = text;
        },
        line: (text) => {
            root.querySelector(".line").textContent = text;
        },
        item: (text, bad) => {
            const li = document.createElement("li");
            li.textContent = text;
            if (bad) {
                li.className = "bad";
            }
            root.querySelector("ol").appendChild(li);
        },
        button: (text, act) => {
            const button = document.createElement("button");
            button.textContent = text;
            button.addEventListener("click", act);
            root.querySelector(".actions").insertBefore(button, close);
        }
    };
}

async function capture() {
    // the bookmark asks for this file afresh; the model comes with the same query, so a deploy can't
    // pair this file with an older one from the cache
    const {PRIVATE_FIELDS, contextOf, fixedPages, ownersOf, playerPage, scrub, topicLinks, topicsOn, zip} = await import(`./capture-model.js${new URL(import.meta.url).search}`);
    const context = contextOf(window.location, window.franchise_id, window.league_id);
    const view = panel();
    if (!context) {
        view.title("Not a league page");
        view.line("Open any page of the league on MFL, then tap the bookmark again.");
        return;
    }
    const base = `${context.origin}/${context.season}/`;
    view.title(`Saving MFL's pages as the ${context.viewer} sees them`);
    // the owners' names, to take out of every page; a capture that can't read them stops, as its
    // pages would keep them
    let owners;
    try {
        const response = await fetch(`${base}export?TYPE=league&L=${encodeURIComponent(context.leagueId)}&JSON=1`, {credentials: "include", cache: "no-store"});
        owners = ownersOf(await response.json());
    } catch (error) {
        view.line(`Couldn't read the league's owners (${error}), so nothing was saved. Try again in a minute.`);
        return;
    }
    // a guest isn't shown the owners, nor their names on the pages; anyone logged in is
    if (!owners.length && context.viewer !== "guest") {
        view.line("MFL didn't give the league's owners, so nothing was saved. Try again in a minute.");
        return;
    }
    await wait(PAUSE);
    const files = {};
    const manifest = [];
    const htmls = {};
    const queue = Object.entries(fixedPages(context)).map(([name, path]) => ({name, url: base + path}));
    const seen = new Set();
    const prefix = `${context.viewer}/`;
    while (queue.length && !view.closed()) {
        const {name, url} = queue.shift();
        if (seen.has(name)) {
            continue;
        }
        seen.add(name);
        view.line(`${seen.size} read, ${queue.length} to go: ${name}`);
        try {
            const response = await fetch(url, {credentials: "include", cache: "no-store"});
            const html = await response.text();
            htmls[name] = html;
            files[`${prefix}${name}.html`] = scrub(html, owners, {fields: PRIVATE_FIELDS.has(name)});
            manifest.push({name, url, served: response.url, status: response.status});
            view.item(`${name} (${response.status}${response.url !== url ? `, from ${response.url.replace(context.origin, "")}` : ""})`, !response.ok);
        } catch (error) {
            manifest.push({name, url, error: String(error)});
            view.item(`${name}: ${error}`, true);
        }
        // pages found from links on the ones just read; relative links on the board's pages are under mb/
        const from = new URL(url);
        const found = name === "mb-board_show" ? topicsOn(htmls[name] || "")
            : name.startsWith("mb-topic_show") && !name.endsWith("page2") ? topicLinks(htmls[name] || "", name.slice("mb-topic_show".length))
                : name === "lineup" ? {"player": playerPage([htmls.lineup || "", htmls.home || ""], context.leagueId)}
                    : {};
        for (const [next, href] of Object.entries(found)) {
            const target = next === "player" ? base + href : new URL(href, from).href;
            if (new URL(target).origin === context.origin) {
                queue.push({name: next, url: target});
            }
        }
        await wait(PAUSE);
    }
    if (view.closed()) {
        return;
    }
    files[`${prefix}manifest.json`] = JSON.stringify({league: context.leagueId, season: context.season, viewer: context.viewer, franchise: context.franchiseId, at: new Date().toISOString(), pages: manifest}, null, 2);
    const filename = `mfl-pages-${context.viewer}-${context.leagueId}.zip`;
    const blob = new Blob([zip(files)], {type: "application/zip"});
    view.title(`Saved ${manifest.length} pages as the ${context.viewer} sees them`);
    view.line(`${filename}, ${Math.round(blob.size / 1024)} KB. Emails, phone numbers, owners' names and the apiKey are taken out.`);
    view.button("Save", () => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
    });
    const file = typeof File === "function" ? new File([blob], filename, {type: "application/zip"}) : null;
    if (file && navigator.canShare && navigator.canShare({files: [file]})) {
        view.button("Share", () => navigator.share({files: [file]}).catch(() => {}));
    }
}

// a second tap while one runs would ask MFL twice as fast
if (!window.fuadCapturing) {
    window.fuadCapturing = true;
    capture().catch((error) => console.error("[fuad capture]", error)).finally(() => {
        window.fuadCapturing = false;
    });
}
