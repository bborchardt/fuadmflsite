// The contract years chore: an add's length, from its owner's post or bid comment within the hour
// (bylaw 4.4); docs/commissioner.md has what it does.

// more contracts than this in one run looks like a bug rather than a busy day, so none are set
export const MAX_CONTRACTS_PER_RUN = 15;

// bid comments appear only on this page, not in the API
async function processedWaivers({session, season, leagueId, lib}, period) {
    const {readProcessedWaivers} = lib.contractYears;
    const html = await session.page(`/${season}/processed_waivers?LEAGUE_ID=${leagueId}&PERIOD=${period}`, `processed waivers for period ${period}`);
    // comments only show to a logged-in member; a logged-out page would look like bids without any
    if (!/>\s*Logout\s*</i.test(html)) {
        throw new Error(`MFL's processed waivers for period ${period} came back logged out, so bid comments couldn't be read`);
    }
    return readProcessedWaivers(html);
}

// teams over the cap or 30 players are held: the add may be reversed, and a dropped player with
// contract years would owe a penalty
export async function run(ctx, {built, rosters, transactions, playerNames, cutDown}, over) {
    const {lib, loggedIn, dryRun, now, host, leagueId, log, choreLog, needsAttention, wouldPrefix, fetchFrom, threadPosts, mflImport, contractsXml} = ctx;
    const {asArray, displayName} = lib.mfl;
    const {contractDeadline, pendingAdds, windowClosed} = lib.adds;
    const {decideYears, teamPlayers} = lib.contractYears;
    const applyContractYears = ctx.apply.contractYears;
    const pending = pendingAdds({rosters, transactions, players: playerNames});
    // an add before the cut-down date has until then, through the form (offseasonLengths)
    const from = formsEnd(built, cutDown);
    if (!from) {
        log(`Neither the cut-down date nor week 1's kickoff is known; ${built.started ? "every" : "no"} add is taken as owing its length within the hour.`);
    }
    const inSeason = (add) => from ? add.added >= from : built.started === true;
    const held = pending.filter((add) => inSeason(add) && over.has(add.franchiseId));
    for (const add of held) {
        choreLog(`Contract years: ${add.name} held, since the team is over the cap or the roster limit. Left for the commissioner.`);
    }
    const waiting = pending.filter((add) => inSeason(add) && !over.has(add.franchiseId));
    const adds = waiting.filter((add) => windowClosed(add, now.getTime() / 1000));
    if (waiting.length > adds.length) {
        log(`${waiting.length - adds.length} add(s) still in their posting window will be decided at the next run.`);
    }
    if (!adds.length) {
        log("No added players are waiting for contract years.");
        return;
    }
    if (!loggedIn && dryRun) {
        choreLog(`Contract years: not checked for ${adds.length} added player(s), as the run isn't logged in.`);
        return;
    }
    if (!loggedIn) {
        throw new Error(`${adds.length} added player(s) are waiting for contract years, but reading the bids `
            + "and the message board needs the commissioner login, so none were set.");
    }
    // owners post lengths in threads of any name
    const earliest = Math.min(...adds.map((add) => add.added));
    const board = await fetchFrom(host, "messageBoard", {L: leagueId, COUNT: 100});
    const threads = asArray(board.thread).filter((thread) => Number(thread.lastPostTime) >= earliest);
    const posts = await threadPosts(threads);
    const bidRequests = [];
    for (const period of new Set(adds.filter((add) => add.type === "BBID_WAIVER").map((add) => add.added))) {
        // each request tagged with its period, so a bid is only matched on its own week's page
        bidRequests.push(...(await processedWaivers(ctx, period)).map((request) => ({...request, period})));
    }
    const {contracts, flags} = decideYears({
        adds, pending, posts, bidRequests, teams: teamPlayers({rosters, players: playerNames}), contractDeadline
    });
    for (const flag of flags) {
        needsAttention(`Contract years: ${flag}. Left for the commissioner.`);
    }
    const describe = (contract) => {
        const name = displayName(contract.name);
        return `${name} to ${contract.years} year${contract.years === 1 ? "" : "s"} (${contract.source})`;
    };
    if (!contracts.length) {
        return;
    }
    if ((applyContractYears || dryRun) && contracts.length > MAX_CONTRACTS_PER_RUN) {
        throw new Error(`${contracts.length} added players are waiting for contract years, more than the `
            + `${MAX_CONTRACTS_PER_RUN} expected in a day, so none were set. Check the adds and set their years on MFL's Edit Player Salaries and Contracts page by hand.`);
    }
    if (!applyContractYears) {
        contracts.forEach((contract) => choreLog(`${wouldPrefix("CONTRACT_YEARS")} set ${describe(contract)}.`));
        return;
    }
    await mflImport("salaries", contractsXml(contracts), {APPEND: "1"});
    contracts.forEach((contract) => choreLog(`Set ${describe(contract)}.`));
}

// when the form's lengths give way to the hour's, in seconds: the cut-down date, or week 1's kickoff
// when the calendar has none (or the run isn't logged in to read it)
export const formsEnd = (built, cutDown) => cutDown || (built.week1Kickoff ? built.week1Kickoff.getTime() / 1000 : null);
