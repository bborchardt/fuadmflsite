// The renewal's RFAs: players the commissioner's rollover took from 1 contract year to 0 go to $0.01,
// as MFL won't take $0 (docs/commissioner.md, Each season).

export const RFA_SALARY = "0.01";

// [{playerId, franchiseId}] rostered now at 0 years and at 1 at the end of last season, whatever team
// they ended it on (a trade since); a rookie or an offseason add is at 0 too, but wasn't rostered at 1
export function rfaSalaries({lastRosters, rosters, asArray}) {
    const entries = (export_) => asArray((export_ || {}).franchise)
        .flatMap((team) => asArray(team.player).map((player) => ({...player, franchiseId: team.id})));
    const atOne = new Set(entries(lastRosters).filter((player) => Number(player.contractYear) === 1).map((player) => player.id));
    return entries(rosters)
        .filter((player) => Number(player.contractYear) === 0 && atOne.has(player.id) && Number(player.salary) !== Number(RFA_SALARY))
        .map((player) => ({playerId: player.id, franchiseId: player.franchiseId}));
}

// more than this share of rostered players looks like a misread, not a rollover
export const MAX_RFA_SHARE = 0.5;
