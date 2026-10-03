// Which franchise salaries a season's site shows, and the snapshot file format.
// Shared by the page and the daily job.

/**
 * The phase of a season's franchise salaries at a given moment:
 *   "previous": before the first kickoff of week 1, last season's snapshot applies
 *   "live":     until the trade deadline, a projection from current salaries
 *   "final":    after the deadline, this season's snapshot applies
 * A season whose week 1 kickoff isn't known yet (MFL hasn't published the schedule)
 * hasn't started, so it's "previous".
 */
export function franchisePhase(now, seasonStartKickoff, deadlineKickoff) {
    if (!seasonStartKickoff || now < seasonStartKickoff) {
        return "previous";
    }
    if (deadlineKickoff && now >= deadlineKickoff) {
        return "final";
    }
    return "live";
}

/**
 * The NFL season that started most recently: this year from September on, last year
 * before that. The daily job uses it, so the offseason keeps pointing at the season
 * that just finished rather than one MFL hasn't scheduled yet.
 */
export function latestSeason(now) {
    const year = now.getUTCFullYear();
    return now.getUTCMonth() >= 8 ? year : year - 1;
}

/** Name of the snapshot taken at a season's trade deadline. */
export function snapshotFileName(season) {
    return `franchise-${season}.json`;
}

/** A snapshot file's contents. */
export function makeSnapshot(season, topSalaries, {takenAt, source}) {
    return {season: Number(season), takenAt, source, positions: topSalaries};
}

/** Check a snapshot read from a file; returns its positions or throws. */
export function readSnapshot(snapshot, season) {
    if (!snapshot || Number(snapshot.season) !== Number(season) || typeof snapshot.positions !== "object") {
        throw new Error(`the ${season} franchise snapshot is malformed`);
    }
    return snapshot.positions;
}
