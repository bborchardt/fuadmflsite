// The offseason contract lengths chore.

import {formsEnd} from "./contract-years.mjs";
import {teamNameIn} from "./chore-context.mjs";

// a run setting more players to the default than this share of those rostered is likely misreading
// the season, and sets none
const MAX_DEFAULT_SHARE = 0.25;

// Lengths due before the season (bylaws 4.4, 12.4–12.6): every player at 0 years with a salary, but
// one added after the cut-down date, gets his from the team's form post. Before the cut-down date a missing one
// waits; after it the commissioner is told, for the $5 a day; from week 1's kickoff it's 1 year.
// `rfas`: the renewal's RFAs (rfa-salaries.mjs), who aren't due one.
export async function run(ctx, {built, rosters, playerNames, cutDown}, over, rfas) {
    const {lib, loggedIn, dryRun, now, host, leagueId, log, choreLog, needsAttention, wouldPrefix, fetchFrom, threadPosts, mflImport, contractsXml} = ctx;
    const {asArray, displayName} = lib.mfl;
    const {DEFAULT_YEARS, postText} = lib.contractYears;
    const {addedSince, formLengths, lengthTopics, lengthsDue} = lib.lengths;
    const applyContractYears = ctx.apply.contractYears;
    if (typeof built.started !== "boolean") {
        log("The season's start isn't known; offseason contract lengths skipped.");
        return;
    }
    const from = formsEnd(built, cutDown);
    if (!from) {
        log("Neither the cut-down date nor week 1's kickoff is known, so later adds can't be told apart; offseason contract lengths skipped.");
        return;
    }
    // one added since owes his within the hour (contractYears), even once traded on
    const later = (id) => addedSince(built, id, from);
    const teams = asArray(rosters.franchise).map((team) => ({id: team.id, due: lengthsDue(rosters, team.id).filter((id) => !later(id) && !rfas.has(id))}))
        .filter((team) => team.due.length);
    if (!teams.length) {
        log("No players are waiting for an offseason contract length.");
        return;
    }
    if (!loggedIn && dryRun) {
        choreLog(`Contract lengths: not checked for ${teams.length} team(s), as the run isn't logged in.`);
        return;
    }
    if (!loggedIn) {
        throw new Error(`${teams.length} team(s) have players waiting for contract lengths, but reading the board needs the commissioner login, so none were set.`);
    }
    const posts = await threadPosts(lengthTopics(await fetchFrom(host, "messageBoard", {L: leagueId, COUNT: 100})));
    const salaries = new Map(asArray(rosters.franchise).flatMap((team) => asArray(team.player)).map((entry) => [entry.id, entry.salary]));
    const name = (id) => displayName((playerNames.get(id) || {name: id}).name);
    const teamName = (id) => teamNameIn(built, id);
    const pastCut = Boolean(cutDown) && now.getTime() / 1000 >= cutDown;
    const contracts = [];
    for (const team of teams) {
        const {years, unread} = formLengths({posts, franchiseId: team.id, due: team.due, players: playerNames});
        const missing = team.due.filter((id) => !years.has(id));
        for (const post of unread) {
            const text = postText(post.body).replace(/\s+/g, " ").trim();
            needsAttention(`Contract lengths: ${teamName(team.id)} posted lengths without the form, which the job doesn't read: "${text.length > 120 ? `${text.slice(0, 120)}…` : text}". Set them by hand, or ask them to use the form.`);
        }
        const chosen = [...years].map(([id, count]) => ({playerId: id, years: count, source: "the form"}));
        if (built.started) {
            chosen.push(...missing.map((id) => ({playerId: id, years: DEFAULT_YEARS, source: "none by week 1: the default"})));
        } else if (pastCut && missing.length) {
            needsAttention(`Contract lengths: ${teamName(team.id)} has ${missing.length} player(s) without a length since the cut-down date: ${missing.map(name).join(", ")}. Charge the late penalty by hand (bylaw 12.6).`);
        }
        if (chosen.length && over.has(team.id)) {
            choreLog(`Contract lengths: ${teamName(team.id)} held, since the team is over the cap or the roster limit. Left for the commissioner.`);
            continue;
        }
        contracts.push(...chosen.map((contract) => ({...contract, salary: salaries.get(contract.playerId), team: team.id})));
    }
    if (!contracts.length) {
        return;
    }
    const defaults = contracts.filter((contract) => contract.years === DEFAULT_YEARS && contract.source !== "the form").length;
    const rostered = salaries.size;
    if (defaults > rostered * MAX_DEFAULT_SHARE) {
        throw new Error(`${defaults} of ${rostered} rostered players would get the default ${DEFAULT_YEARS} year, more than expected, so no lengths were set. Check the rosters and set them on MFL's Edit Player Salaries and Contracts page by hand.`);
    }
    const describe = (contract) => `${name(contract.playerId)} (${teamName(contract.team)}) to ${contract.years} year${contract.years === 1 ? "" : "s"} (${contract.source})`;
    if (!applyContractYears) {
        contracts.forEach((contract) => choreLog(`${wouldPrefix("CONTRACT_YEARS")} set ${describe(contract)}.`));
        return;
    }
    await mflImport("salaries", contractsXml(contracts), {APPEND: "1"});
    contracts.forEach((contract) => choreLog(`Set ${describe(contract)}.`));
}
