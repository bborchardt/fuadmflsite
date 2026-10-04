// "previous" before week 1's kickoff (or while the schedule is unpublished), "live" until the
// trade deadline, "final" after it
export function franchisePhase(now, seasonStartKickoff, deadlineKickoff) {
    if (!seasonStartKickoff || now < seasonStartKickoff) {
        return "previous";
    }
    if (deadlineKickoff && now >= deadlineKickoff) {
        return "final";
    }
    return "live";
}

// so the offseason keeps pointing at the season that just finished, not one MFL hasn't scheduled
export function latestSeason(now) {
    const year = now.getUTCFullYear();
    return now.getUTCMonth() >= 8 ? year : year - 1;
}

export function snapshotFileName(season) {
    return `franchise-${season}.json`;
}

export function makeSnapshot(season, topSalaries, {takenAt, source}) {
    return {season: Number(season), takenAt, source, positions: topSalaries};
}

// a snapshot may have been edited by hand, so it's checked
export function readSnapshot(snapshot, season) {
    const positions = snapshot && snapshot.positions;
    const wellFormed = snapshot
        && Number(snapshot.season) === Number(season)
        && positions && typeof positions === "object" && !Array.isArray(positions)
        && Object.values(positions).every((players) => Array.isArray(players)
            && players.every((player) => player && typeof player.fullName === "string" && Number.isFinite(player.salary)));
    if (!wellFormed) {
        throw new Error(`the ${season} franchise snapshot is malformed`);
    }
    return positions;
}
