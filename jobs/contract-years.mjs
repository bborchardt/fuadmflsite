// more contracts than this in one run looks like a bug rather than a busy day, so none are set
export const MAX_CONTRACTS_PER_RUN = 15;

const xmlAttr = (value) => String(value)
    .replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// only send it with APPEND=1, or MFL replaces every salary
export function contractsXml(contracts) {
    return `<salaries><leagueUnit unit="LEAGUE">${contracts.map((contract) =>
        `<player id="${xmlAttr(contract.playerId)}" salary="${xmlAttr(contract.salary)}" contractYear="${contract.years}"/>`).join("")}`
        + `</leagueUnit></salaries>`;
}
