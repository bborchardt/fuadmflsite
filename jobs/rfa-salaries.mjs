// The renewal's RFAs: players the commissioner's rollover took from 1 contract year to 0 go to $0.01,
// as MFL won't take $0 (docs/commissioner.md, Each season).

export const RFA_SALARY = "0.01";

// [{playerId, franchiseId}] rostered now at 0 years, at 1 at the end of last season, and on the same
// salary, whatever team they ended it on (neither the rollover nor a trade changes a salary). `added`:
// the players whose latest move is an add to their team, waiting for contract years: one of last
// season's 1-year players dropped and won again is at 0 years too, at his new salary or perhaps the
// same, and a rookie wasn't rostered at all. A salary changed since (a re-signing) is left too.
export function rfaSalaries({lastRosters, rosters, asArray, added = new Set()}) {
    const entries = (export_) => asArray((export_ || {}).franchise)
        .flatMap((team) => asArray(team.player).map((player) => ({...player, franchiseId: team.id})));
    const atOne = new Map(entries(lastRosters).filter((player) => Number(player.contractYear) === 1)
        .map((player) => [player.id, Number(player.salary)]));
    return entries(rosters)
        .filter((player) => Number(player.contractYear) === 0 && atOne.get(player.id) === Number(player.salary)
            && Number(player.salary) !== Number(RFA_SALARY) && !added.has(player.id))
        .map((player) => ({playerId: player.id, franchiseId: player.franchiseId}));
}

// more than this share of rostered players looks like a misread, not a rollover
export const MAX_RFA_SHARE = 0.5;
