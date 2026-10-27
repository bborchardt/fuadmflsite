// Moves › Add: MFL's Add/Drop page with v2's controls over it. A move is picked through MFL's own
// picker rows and fields and MFL's form is posted in place, then read back from MFL (the pending
// claims, or the roster) before the page reloads to show it. Claims are reordered and removed with
// MFL's own links and edited through MFL's edit page; a copy is a new claim through the same form,
// so its comment line goes with it. An immediate add's length is posted to the board once MFL has
// made the add. MFL's form stays in the page underneath; anything v2 can't read leaves MFL's page.

import {exportUrl, fetchExport} from "../lib/mfl.js";
import {esc} from "./html.js";
import {waitLeft} from "./page-fetch.js";
import {placeholders} from "./panel.js";
import {openDialog, replaceEntry} from "./dialog.js";
import {
    Refused, WIDE, failedLine, freshPending, leaveFlash, limitsApply, loadData, movesPhase, refusal, rosterIds, send, takeFlash
} from "./moves.js";
import {contractTopic} from "./home-model.js";
import {watchList, whenPopupClosed} from "./watch.js";
import {
    addBlock, addsClosed, banner, bidsLeft, claimKey, commentLines, findClaim, firstLast, freeAgencyOver, fullNameLines, groupViews, isLengthLine,
    lengthLine, lineFor, maxBid, readPlayerLists, rewriteComment, surname, teamState, yearsIn
} from "./add-model.js";
import {
    bannerMarkup, controlSelector, deskHome, dialogMarkup, dropList, freeAgentList, loadingMarkup, moveChecks, phoneHome, phonePlayers, phoneTitle, reviewForm
} from "./add-view.js";

const FLASH_KEY = "fuad.addFlash";
// the board topic a length post starts when the league has none with "contract" in its name
const NEW_TOPIC = "Contract lengths";

// ---- MFL's page ----

// MFL opens the form between a table's rows, so its fields belong to it without being inside it
function addForm(doc = document) {
    const add = doc.getElementById("add_pid_field_id");
    const drop = doc.getElementById("drop_pid_field_id");
    return add && drop && add.form && add.form === drop.form ? add.form : null;
}

const scriptText = (doc = document) => [...doc.querySelectorAll("script")].map((script) => script.textContent).join("\n");

// MFL's own links in its claims table, by what they do and the claim they name (ROUND_ADD_BID_DROP)
function claimLink(action, key) {
    return [...document.querySelectorAll("#waiver_request_list a[href]")].find((a) => {
        const value = new URL(a.href, window.location.href).searchParams.get(action);
        return value === key;
    }) || null;
}

// Picks a row of MFL's picker (or none) the way a click on it would; MFL's picker toggles a row
// that's already picked, so it's only called for a change
function pick(list, index) {
    // a member's saved filter on MFL's page could hide the row; picks need every row drawn
    if (window.picker_filter_pos && typeof window.update_picker === "function"
        && (window.picker_filter_pos[list] !== "ALL" || window.picker_filter_nfl[list] !== "ALL" || window.picker_filter_name[list])) {
        window.picker_filter_pos[list] = "ALL";
        window.picker_filter_nfl[list] = "ALL";
        window.picker_filter_name[list] = "";
        window.update_picker(list);
    }
    const current = window.picker_cur_sel ? window.picker_cur_sel[list] : -1;
    if (index === null) {
        if (current >= 0) {
            window.picker_select(list, current, 0);
        }
    } else if (current !== index) {
        window.picker_select(list, index, 0);
    }
}

const text = (id) => (document.getElementById(id) || {textContent: ""}).textContent.replace(/\s+/g, " ").trim();

// Fills MFL's form for a claim or an add, through its picker, and checks it holds what was chosen:
// the hidden ids, MFL's "To Add"/"To Drop" lines, and whether MFL takes it as a bid
function fillForm(form, lists, {add, drop, bid = null, round = null, comment = ""}) {
    const addEntry = lists.add.find((player) => player.id === add);
    const dropEntry = drop ? lists.drop.find((player) => player.id === drop) : null;
    if (!addEntry || (drop && !dropEntry)) {
        throw new Error("MFL's page doesn't list that player");
    }
    pick("add", addEntry.index);
    pick("drop", dropEntry ? dropEntry.index : null);
    const shows = (entry) => `${entry.rawName} ${entry.nfl} ${entry.pos}`;
    const submit = document.getElementById("add_drop_submit");
    const asBid = /request/i.test(submit ? submit.value : "");
    if (form.elements.add_pid.value !== add || form.elements.drop_pid.value !== (drop || "")
        || text("add_name_field_id") !== shows(addEntry) || text("drop_name_field_id") !== (dropEntry ? shows(dropEntry) : "")) {
        throw new Error("MFL's form didn't take the pick");
    }
    if (asBid !== (bid !== null)) {
        throw new Error(asBid ? "MFL would take it as a blind bid" : "MFL would make it at once");
    }
    if (form.elements.FORCE_WAIVER) {
        form.elements.FORCE_WAIVER.checked = false;
    }
    if (bid !== null) {
        if (![...form.elements.ROUND.options].some((option) => Number(option.value) === round)) {
            throw new Error(`MFL's page has no group ${round}`);
        }
        form.elements.BBID_AMT.value = String(bid);
        form.elements.ROUND.value = String(round);
        form.elements.COMMENTS.value = comment;
    }
    const fields = new URLSearchParams(new FormData(form));
    fields.set("SUBMIT", submit.value);
    return fields;
}

// ---- data ----

const hasClaim = (groups, round, claim) => groups.some((group) => group.round === round
    && group.claims.some((other) => other.add === claim.add && other.bid === claim.bid && (other.drop || null) === (claim.drop || null)));

const onRoster = async (context, franchiseId, playerId) => (await rosterIds(context, franchiseId)).includes(playerId);

// Posts the length to the board (messageBoard import): a reply in the contract topic, or a new one
async function postLength(context, line) {
    const {season, leagueId} = context;
    const board = await fetchExport(exportUrl(window.location.origin, season, "messageBoard", {L: leagueId, COUNT: 100}), "messageBoard", {init: {cache: "no-store"}});
    const topic = contractTopic(board);
    const fields = new URLSearchParams(topic ? {THREAD: topic.id, BODY: line} : {SUBJECT: NEW_TOPIC, BODY: line});
    const answer = await send(`${window.location.origin}/${season}/import?TYPE=messageBoard&L=${encodeURIComponent(leagueId)}`, {method: "POST", body: fields});
    if (/<error/i.test(answer) || !/OK/i.test(answer)) {
        throw new Error((answer.match(/<error[^>]*>([^<]*)/i) || [])[1] || "MFL didn't take the post");
    }
}

// MFL's edit page for a group, read and posted with one claim's bid and drop and the group's comment
async function saveGroup(context, franchiseId, round, change) {
    const {season, leagueId} = context;
    const url = `${window.location.origin}/${season}/options?L=${encodeURIComponent(leagueId)}&O=255&F=${encodeURIComponent(franchiseId)}&ROUND=${round}`;
    const doc = new DOMParser().parseFromString(await send(url, {cache: "no-store"}), "text/html");
    const form = doc.querySelector("form[name=editwr]");
    const comment = form && form.querySelector("textarea[name=comment]");
    if (!form || !comment) {
        throw new Error("MFL's edit page couldn't be read");
    }
    const fields = new URLSearchParams(new FormData(form));
    if (change.claim) {
        // the claims in MFL's order, each row headed with the player to add ("Fehoko, Simi ARI WR")
        const rows = [...form.querySelectorAll("tr[id^=row_amount_]")];
        const at = rows.findIndex((row) => row.cells[0] && `${row.cells[0].textContent.trim()} `.startsWith(`${change.claim.mflName} `)
            && Number((row.querySelector("input[name^=amount_]") || {}).value) === change.claim.bid);
        const drop = at >= 0 && form.querySelector(`select[name=drop_${at}]`);
        if (!drop || ![...drop.options].some((option) => option.value === (change.drop || "0000"))) {
            throw new Error("MFL's edit page doesn't list that claim");
        }
        fields.set(`amount_${at}`, String(change.bid));
        fields.set(`drop_${at}`, change.drop || "0000");
    }
    fields.set("comment", change.comment(comment.value));
    fields.set("SAVE", (form.querySelector("input[name=SAVE]") || {value: "Save Waiver Request"}).value);
    await send(new URL(form.getAttribute("action") || "options", url).href, {method: "POST", body: fields});
}

export async function drawAdd({context, franchiseId, loginHref}) {
    const body = document.querySelector(".pagebody");
    if (!body) {
        return;
    }
    const mount = document.createElement("div");
    mount.id = "fuad-add";
    const show = () => {
        body.prepend(mount);
        document.documentElement.classList.add("fuad-add-on");
    };
    const standAside = () => {
        mount.remove();
        document.documentElement.classList.remove("fuad-add-on");
    };
    if (!franchiseId) {
        mount.innerHTML = `<section class="fuad-panel fuad-add-note"><span>Log in to make moves</span><a class="fuad-button" href="${esc(loginHref)}">Log in</a></section>`;
        show();
        return;
    }
    // the commissioner's view stays MFL's
    if (franchiseId === "0000") {
        return;
    }
    const form = addForm();
    const lists = readPlayerLists(scriptText());
    // not the page v2 knows (MFL changed it): MFL's own page, restyled
    if (!form || !lists.add.length || typeof window.picker_select !== "function" || !form.elements.ROUND || !form.elements.COMMENTS) {
        standAside();
        return;
    }
    mount.innerHTML = `<section class="fuad-panel">${placeholders(8)}</section>`;
    show();

    const wide = window.matchMedia(WIDE);
    const flash = takeFlash(FLASH_KEY);

    const state = {
        data: null, failed: false, screen: "home", compose: null, q: "", pos: "ALL", watching: false, sort: "proj",
        open: null, flash: flash.highlight, done: flash.done, error: flash.error || "", busy: false
    };
    const layer = document.createElement("div");
    layer.className = "fuad-layer fuad-add-layer";
    layer.hidden = true;
    document.body.append(layer);
    let closeDialog = null;
    // the member's watch list (watch.js), for the Watching chip; a star in the player popup changes it
    let watched = null;
    watchList(context).then((list) => {
        watched = list;
        if (state.data) {
            render();
        }
    }, (error) => console.warn("[fuad] couldn't load the watch list:", error));
    window.addEventListener("fuad-watch", () => {
        if (state.watching && state.data) {
            whenPopupClosed(render);
        }
    });

    // ---- what's drawn: the state, and what add-view.js reads with it ----

    const now = () => Date.now() / 1000;
    const team = () => teamState(state.data.league, franchiseId, state.data.groups);
    // adds close with free agency, though the season runs to week 17's end
    const phase = () => {
        const season = movesPhase(state.data.facts);
        return freeAgencyOver({phase: season, calendar: state.data.calendar, now: now()}) ? "over" : season;
    };
    // whether a bid placed now still has a run to process it
    const runsLeft = () => bidsLeft(movesPhase(state.data.facts), state.data.calendar, now());
    // the checks' phase: in season once the roster limits hold, from the cut-down date (2.5)
    const checks = () => (limitsApply(state.data) ? "season" : phase());
    const names = (id) => {
        const listed = lists.add.find((player) => player.id === id) || lists.drop.find((player) => player.id === id);
        const mflName = state.data.mflNames.get(id) || (listed && listed.mflName) || id;
        return {mflName, name: firstLast(mflName)};
    };
    const views = () => groupViews(team(), state.data.pending, names);
    const rounds = () => state.data.groups.map((group) => group.round);
    const nextRound = () => Math.max(0, ...rounds()) + 1;
    // a new bid's group: a new one; with one group allowed, that one
    const newBidRound = () => (state.data.maxGroups === 1 && rounds().length ? 1 : nextRound());
    const theBanner = () => banner({phase: phase(), freeAgents: lists.add, calendar: state.data.calendar, now: now()});
    const freeAgent = (id) => lists.add.find((player) => player.id === id);
    const claimOf = (key) => findClaim(views(), key);

    function view() {
        return {
            state, team: team(), phase: checks(), banner: theBanner(), groups: views(), rounds: rounds(), nextRound: nextRound(), maxGroups: state.data.maxGroups, positions: state.data.positions, lists, names,
            wide: wide.matches, watched, runsLeft: runsLeft(), now: now(), franchiseId, canMove: (action, key) => Boolean(claimLink(action, key))
        };
    }

    // ---- render ----

    let opened = false;
    let keepCompose = false;

    function render() {
        // a field being typed in keeps its focus and caret
        const active = document.activeElement;
        const ours = active && (mount.contains(active) || layer.contains(active)) && active.dataset;
        const focus = ours && active.dataset.focus ? {key: active.dataset.focus, start: active.selectionStart, end: active.selectionEnd} : null;
        const acted = ours && active.dataset.act ? controlSelector(active.dataset) : null;
        if (!state.data) {
            mount.innerHTML = loadingMarkup(state);
            return;
        }
        if (addsClosed(phase())) {
            mount.innerHTML = bannerMarkup(theBanner());
            return;
        }
        const v = view();
        if (wide.matches) {
            if (window.fuadDetour) {
                window.fuadDetour(null);
            }
            mount.innerHTML = deskHome(v);
            if (state.compose) {
                // the dialog's section stays, so the focus trap keeps working across redraws
                if (!layer.firstElementChild) {
                    layer.innerHTML = '<section class="fuad-add-dialog" role="dialog" aria-modal="true" aria-labelledby="fuad-add-dialog-title"></section>';
                }
                layer.firstElementChild.innerHTML = dialogMarkup(v);
                if (layer.hidden) {
                    // the control that opened it is drawn again behind the dialog: focus goes back to
                    // its new copy on close
                    const opener = acted;
                    opened = true;
                    closeDialog = openDialog(layer, {panel: layer.firstElementChild, opener: null, onClose: () => {
                        closeDialog = null;
                        if (state.compose && !state.busy && !keepCompose) {
                            state.compose = null;
                            state.error = "";
                            render();
                        }
                        const again = opener && mount.querySelector(opener);
                        if (again && !keepCompose) {
                            again.focus();
                        }
                    }});
                }
            } else if (closeDialog) {
                closeDialog();
            }
        } else {
            if (closeDialog) {
                closeDialog({restore: false});
            }
            const screen = state.compose || state.screen === "players" ? state.screen : "home";
            const c = state.compose;
            if (window.fuadDetour) {
                window.fuadDetour(screen === "home" ? null : {
                    title: phoneTitle(v, screen),
                    onTitle: screen === "drops" && c ? (opener) => window.fuadOpenPlayer && window.fuadOpenPlayer(c.add, {opener}) : null
                });
            }
            mount.innerHTML = screen === "players" ? phonePlayers(v) : screen === "drops" ? dropList(v) : screen === "review" ? reviewForm(v, {withPicks: true}) : phoneHome(v);
            mount.dataset.screen = screen;
        }
        const root = wide.matches && state.compose ? layer : mount;
        // a dialog just opened has its own focus; nothing behind it takes it back
        if (opened) {
            opened = false;
        } else if (focus) {
            const field = root.querySelector(`[data-focus="${focus.key}"]`) || mount.querySelector(`[data-focus="${focus.key}"]`);
            if (field) {
                field.focus();
                try {
                    field.setSelectionRange(focus.start, focus.end);
                } catch (error) {
                    // a field type without a caret
                }
            }
        } else if (acted) {
            const again = root.querySelector(acted);
            if (again && !again.disabled) {
                again.focus();
            }
        }
    }

    // ---- moving between the phone's screens: each a history entry, so Back returns ----

    let depth = 0;
    // `replace`: Rosters' Add lands on the drop step, so Back returns to Rosters
    function go(screen, {replace = false} = {}) {
        if (wide.matches) {
            render();
            return;
        }
        if (screen === state.screen) {
            render();
            return;
        }
        state.screen = screen;
        if (replace) {
            window.history.replaceState({fuadAdd: screen, depth}, "", `#${screen}`);
        } else {
            depth++;
            window.history.pushState({fuadAdd: screen, depth}, "", `#${screen}`);
        }
        render();
        window.scrollTo(0, 0);
    }

    window.addEventListener("popstate", (event) => {
        const entry = event.state && event.state.fuadAdd ? event.state : null;
        // Back that only closed a dialog over this screen
        if ((entry ? entry.depth : 0) === depth && (entry ? entry.fuadAdd : "home") === state.screen) {
            return;
        }
        depth = entry ? entry.depth : 0;
        state.screen = entry ? entry.fuadAdd : "home";
        if (state.screen === "home" || state.screen === "players") {
            if (!state.busy) {
                state.compose = state.screen === "players" ? state.compose : null;
            }
        }
        state.error = "";
        render();
    });

    // a reload on one of the phone's screens starts over at Add
    if (/^#(players|drops|review)$/.test(window.location.hash)) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    // Shows the result after MFL's page reloads: back to Add's own entry first, so Back from it
    // leaves the page rather than landing on a finished move's screens
    function reloadWith(next) {
        leaveFlash(FLASH_KEY, next);
        const url = `${window.location.origin}/${context.season}/add_drop?L=${encodeURIComponent(context.leagueId)}`;
        replaceEntry(url, wide.matches ? 0 : depth);
    }

    // ---- composing ----

    function startCompose(add, {round = null, replace = false} = {}) {
        const fa = freeAgent(add);
        if (!fa) {
            return;
        }
        const kind = fa.mark || theBanner().kind === "bids" ? "bid" : "add";
        state.compose = {add, drop: undefined, round: kind === "bid" ? round || newBidRound() : null, bid: "1", years: 1, editing: null, kind};
        state.error = "";
        state.done = null;
        go("drops", {replace});
    }

    // `what` names the move for its failure line: "place your bid on Higbee"
    async function run(what, task) {
        state.busy = true;
        state.error = "";
        render();
        try {
            await task();
        } catch (error) {
            console.warn("[fuad] couldn't make the move:", error);
            // MFL may have made something anyway (a bid where an add was asked, a move whose answer
            // failed): then the page reloads to show what it holds
            if (await mflChanged().catch(() => false)) {
                reloadWith({error: failedLine(what, error, {changed: true})});
                return;
            }
            state.error = failedLine(what, error);
            state.busy = false;
            if (state.screen === "home" && !wide.matches) {
                state.compose = null;
            }
            render();
        }
    }

    async function mflChanged() {
        const [fresh, ids] = await Promise.all([freshPending(context), rosterIds(context, franchiseId)]);
        const mine = [...state.data.league.players.values()].filter((player) => player.franchise && player.franchise.franchiseId === franchiseId)
            .map((player) => player.playerId).sort();
        return JSON.stringify(fresh.groups) !== JSON.stringify(state.data.groups) || JSON.stringify(ids) !== JSON.stringify(mine);
    }

    // A group's one comment after a claim joins it: the lines it had and the claim's own, checked
    // once MFL has the claim and written through the edit page if MFL didn't keep them all (it may
    // add the new comment as a line, or let it replace the group's). Resolves to whether it holds.
    // `line` may be empty (a copied claim with no line): the group's own lines still have to survive.
    async function ensureLine(round, mflName, line, otherNames) {
        const group = state.data.pending.find((entry) => entry.round === round);
        const before = fullNameLines(commentLines(group ? group.comment : ""), mflName, otherNames).join("\n");
        const expected = commentLines(line ? rewriteComment(before, mflName, line, otherNames) : before);
        const holds = (comment) => expected.every((entry) => commentLines(comment).includes(entry));
        if (!expected.length || holds((await freshPending(context)).comments.get(round))) {
            return true;
        }
        await saveGroup(context, franchiseId, round, {comment: () => expected.join("\n")});
        return holds((await freshPending(context)).comments.get(round));
    }

    async function submit() {
        const c = state.compose;
        const checks = moveChecks(view());
        if (!checks.fits || c.drop === undefined) {
            return;
        }
        // free agency may have closed, or the last bid run passed, while the move was being made
        if (addsClosed(phase()) || (c.kind === "bid" && !runsLeft())) {
            state.error = addsClosed(phase()) ? "Free agency has closed for the season." : "No blind bid runs are left this season.";
            render();
            return;
        }
        const fa = freeAgent(c.add) || {mflName: names(c.add).mflName};
        const who = surname(fa.mflName);
        await run(c.editing ? `change your bid on ${who}` : c.kind === "bid" ? `place your bid on ${who}` : `add ${who}`, async () => {
            if (c.editing) {
                const found = claimOf(c.editing);
                const others = found.group.claims.filter((claim) => claim.key !== c.editing).map((claim) => claim.addMfl);
                const line = c.years ? lengthLine(fa.mflName, c.years, others) : null;
                await saveGroup(context, franchiseId, c.round, {
                    claim: {mflName: fa.mflName, bid: found.claim.bid}, bid: checks.bid, drop: c.drop || null,
                    comment: (comment) => (line ? rewriteComment(comment, fa.mflName, line, others) : comment)
                });
                const claim = {add: c.add, bid: checks.bid, drop: c.drop || null};
                const fresh = await freshPending(context);
                if (!hasClaim(fresh.groups, c.round, claim) || (line && lineFor(commentLines(fresh.comments.get(c.round)), fa.mflName, others) !== line)) {
                    throw new Refused("MFL kept only part of it");
                }
                reloadWith({highlight: claimKey(c.round, claim)});
                return;
            }
            if (c.kind === "bid") {
                const view = views().find((group) => group.round === c.round);
                const others = view ? view.claims.map((claim) => claim.addMfl) : [];
                const line = lengthLine(fa.mflName, c.years, others);
                const claim = {add: c.add, bid: checks.bid, drop: c.drop || null};
                const answer = await send(form.action, {method: "POST", body: fillForm(form, lists, {...claim, round: c.round, comment: line})});
                if (!hasClaim((await freshPending(context)).groups, c.round, claim)) {
                    throw new Refused(refusal(answer));
                }
                const kept = await ensureLine(c.round, fa.mflName, line, others).catch(() => false);
                reloadWith({highlight: claimKey(c.round, claim), done: kept ? null : {text: `Bid made, but MFL didn’t keep group ${c.round}’s comment as it was: check its lengths with Edit.`, failed: true}});
                return;
            }
            const answer = await send(form.action, {method: "POST", body: fillForm(form, lists, {add: c.add, drop: c.drop || null})});
            if (!(await onRoster(context, franchiseId, c.add))) {
                throw new Refused(refusal(answer));
            }
            const line = lengthLine(fa.mflName, c.years);
            const dropped = c.drop ? surname(names(c.drop).mflName) : null;
            const made = `${surname(fa.mflName)} added${dropped ? `, ${dropped} dropped.` : "."}`;
            let done;
            try {
                await postLength(context, line);
                done = {text: `${made} Posted “${line}”.`};
            } catch (error) {
                console.warn("[fuad] couldn't post the length:", error);
                done = {text: `${made} Couldn’t post the length “${line}”; it’s due within the hour.`, failed: true, line};
            }
            reloadWith({done});
        });
    }

    async function claimAction(act, key, round) {
        const found = claimOf(key);
        if (!found) {
            return;
        }
        const {group, claim} = found;
        const who = surname(claim.addMfl);
        // a copied or moved bid would wait for a run that won't come; removing one is always fine
        if (act !== "remove" && !runsLeft()) {
            state.error = "No blind bid runs are left this season.";
            render();
            return;
        }
        await run(act === "remove" ? `remove your bid on ${who}` : act === "copy" ? `copy your bid on ${who} to group ${round}` : `move your bid on ${who}`, async () => {
            if (act === "up" || act === "down") {
                const link = claimLink(act === "up" ? "MOVE_UP" : "MOVE_DOWN", key);
                if (!link) {
                    throw new Error("MFL's page has no link for that");
                }
                await send(link.href, {cache: "no-store"});
                reloadWith({highlight: key});
            } else if (act === "remove") {
                const link = claimLink("DELETE", key);
                if (!link) {
                    throw new Error("MFL's page has no link for that");
                }
                await send(link.href, {cache: "no-store"});
                const rest = group.claims.filter((other) => other.key !== key);
                // the group's one comment keeps a line per claim: the removed one's goes, unless another
                // claim in the group goes by the same name
                if (rest.length && isLengthLine(claim.line) && !rest.some((other) => surname(other.addMfl).toLowerCase() === surname(claim.addMfl).toLowerCase())) {
                    await saveGroup(context, franchiseId, group.round, {comment: (comment) => rewriteComment(comment, claim.addMfl, null)})
                        .catch((error) => console.warn("[fuad] couldn't tidy the group's comment:", error));
                }
                reloadWith({});
            } else if (act === "copy") {
                const target = views().find((other) => other.round === round);
                const others = target ? target.claims.map((other) => other.addMfl) : [];
                const years = yearsIn(claim.line);
                const line = years ? lengthLine(claim.addMfl, years, others) : claim.line || "";
                const copy = {add: claim.add, bid: claim.bid, drop: claim.drop || null};
                const answer = await send(form.action, {method: "POST", body: fillForm(form, lists, {...copy, round, comment: line})});
                if (!hasClaim((await freshPending(context)).groups, round, copy)) {
                    throw new Refused(refusal(answer));
                }
                const kept = await ensureLine(round, claim.addMfl, line, others).catch(() => false);
                reloadWith({highlight: claimKey(round, copy), done: kept ? null : {text: `Copied, but MFL didn’t keep group ${round}’s comment as it was: check its lengths with Edit.`, failed: true}});
            }
        });
    }

    // ---- events ----

    async function postNow() {
        const line = state.done && state.done.line;
        if (!line || state.busy) {
            return;
        }
        state.busy = true;
        render();
        try {
            await postLength(context, line);
            state.done = {text: `Posted “${line}”.`};
        } catch (error) {
            console.warn("[fuad] couldn't post the length:", error);
            state.done = {...state.done, text: `Couldn’t post the length “${line}”; it’s due within the hour.`};
        }
        state.busy = false;
        render();
    }

    // what each control does (its data-act), given the control and the move being composed
    const always = {
        retry: () => load(),
        mfl: () => {
            standAside();
            layer.remove();
        },
        popup: (target) => {
            if (window.fuadOpenPlayer && !(wide.matches && state.compose)) {
                window.fuadOpenPlayer(target.dataset.id, {opener: target});
            }
        },
        "post-now": () => postNow()
    };
    // these wait for the data, and for a move in flight
    const actions = {
        start: (target) => {
            state.done = null;
            state.error = "";
            state.pendingRound = target.dataset.round ? Number(target.dataset.round) : null;
            state.compose = null;
            go("players");
        },
        "pick-fa": (target, c) => {
            const id = target.dataset.id;
            if (c && c.changing === "add") {
                const fa = freeAgent(id);
                const kind = fa && (fa.mark || theBanner().kind === "bids") ? "bid" : "add";
                state.compose = {...c, add: id, kind, changing: null, round: kind === "bid" ? c.round || state.pendingRound || newBidRound() : null};
                window.history.back();
                return;
            }
            startCompose(id, {round: state.pendingRound || null});
        },
        "pick-drop": (target, c) => {
            const back = c.changing === "drop";
            state.compose = {...c, drop: target.dataset.id || null, changing: null};
            if (wide.matches) {
                render();
            } else if (back) {
                window.history.back();
            } else {
                go("review");
            }
        },
        "change-add": (target, c) => {
            state.compose = {...c, changing: "add"};
            go("players");
        },
        "change-drop": (target, c) => {
            state.compose = {...c, changing: "drop"};
            go("drops");
        },
        group: (target, c) => {
            state.compose = {...c, round: Number(target.dataset.round)};
            render();
        },
        year: (target, c) => {
            state.compose = {...c, years: Number(target.dataset.n)};
            render();
        },
        "bid-minus": (target, c) => stepBid(c, -1),
        "bid-plus": (target, c) => stepBid(c, 1),
        submit: () => submit(),
        pos: (target) => {
            state.pos = target.dataset.pos;
            render();
        },
        watching: () => {
            state.watching = !state.watching;
            render();
        },
        sort: (target) => {
            state.sort = target.dataset.sort;
            render();
        },
        toggle: (target) => {
            state.open = state.open === target.dataset.key ? null : target.dataset.key;
            state.flash = null;
            render();
        },
        edit: (target) => {
            const found = claimOf(target.dataset.key);
            if (found) {
                state.done = null;
                state.compose = {add: found.claim.add, drop: found.claim.drop || null, round: found.group.round, bid: String(found.claim.bid),
                    years: yearsIn(found.claim.line), editing: found.claim.key, kind: "bid"};
                state.open = null;
                go("review");
            }
        },
        up: (target) => claimAction("up", target.dataset.key),
        down: (target) => claimAction("down", target.dataset.key),
        remove: (target) => claimAction("remove", target.dataset.key),
        copy: (target) => claimAction("copy", target.dataset.key, Number(target.dataset.round))
    };

    // the stepper keeps a bid between $1 and its max
    function stepBid(c, by) {
        const bid = Math.max(0, parseInt(c.bid, 10) || 0);
        const max = maxBid(team(), {round: c.round, drop: c.drop || null, without: c.editing});
        state.compose = {...c, bid: String(by < 0 ? Math.max(1, bid - 1) : Math.min(Math.max(1, max), bid + 1))};
        render();
    }

    function onClick(event) {
        const target = event.target.closest("[data-act]");
        if (!target || target.disabled || (!mount.contains(target) && !layer.contains(target))) {
            return;
        }
        const act = target.dataset.act;
        if (always[act]) {
            always[act](target);
        } else if (actions[act] && !state.busy && state.data) {
            actions[act](target, state.compose);
        }
    }

    function onInput(event) {
        const field = event.target;
        if (!field.dataset || !field.dataset.focus) {
            return;
        }
        if (field.dataset.focus === "q") {
            state.q = field.value;
        } else if (field.dataset.focus === "bid" && state.compose) {
            state.compose = {...state.compose, bid: field.value.replace(/[^0-9]/g, "")};
        }
        render();
    }

    mount.addEventListener("click", onClick);
    layer.addEventListener("click", onClick);
    mount.addEventListener("input", onInput);
    layer.addEventListener("input", onInput);
    wide.addEventListener("change", () => {
        if (!wide.matches && state.compose && state.screen === "home") {
            // a history entry, so Back returns to Add rather than leaving it
            depth++;
            state.screen = "review";
            window.history.pushState({fuadAdd: "review", depth}, "", "#review");
        }
        // the dialog closes for the phone's screens without dropping the move
        keepCompose = true;
        render();
        keepCompose = false;
    });

    async function load() {
        state.failed = false;
        render();
        try {
            state.data = await loadData(context, franchiseId);
            if (!state.data.league.franchises.get(franchiseId)) {
                throw new Error("your team isn't in the rosters");
            }
        } catch (error) {
            console.warn("[fuad] couldn't load Add:", error);
            state.data = null;
            state.failed = error && error.status === 429 ? "busy" : true;
            // Retry comes back on when MFL's wait is over
            if (state.failed === "busy" && waitLeft()) {
                setTimeout(render, waitLeft());
            }
        }
        render();
        // Rosters' Add opens with its player chosen (`#player-<id>`)
        const asked = (window.location.hash.match(/^#player-(\d+)$/) || [])[1];
        if (asked && state.data && !addsClosed(phase())) {
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
            if (freeAgent(asked) && !freeAgentList(view()).find((row) => row.player.id === asked).off && !addBlock(team(), {phase: checks()})) {
                startCompose(asked, {replace: true});
            }
        }
    }
    load();
    return {standAside};
}
