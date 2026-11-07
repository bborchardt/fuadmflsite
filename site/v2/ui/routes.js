// MFL's pages v2 draws over or restyles, each under the section or view it belongs to (nav.js adds
// MFL's own pages under them). `on` hides MFL's page from the start, so it doesn't show while the
// screen's code loads; the commissioner's view stays MFL's. A screen whose `draw` gives false leaves
// MFL's page as it is (one v2 can't read). `members`: the commissioner keeps MFL's page whole.
//
// `draw` gets what `load` gave and {context, franchiseId, view, teamHref, page, location}:
// `view(section, name)` is a view's href, `teamHref(id)` a team's page, `page` the page as nav.js's
// pageOf reads it.

export const ROUTES = [
    // MFL's menu also reaches Submit Lineup as options?O=02
    {name: "Lineup", view: "Lineup", match: {paths: ["lineup"], options: ["02"]}, on: "fuad-lineup-on",
        load: () => import("./lineup.js"),
        draw: (screen, {context, franchiseId, view}) => screen.drawLineup({context, franchiseId, irHref: view("Moves", "IR"), addHref: view("Moves", "Add")})},
    {name: "Add", view: "Moves/Add", match: {paths: ["add_drop"]}, on: "fuad-add-on",
        load: () => import("./add.js"),
        draw: (screen, {context, franchiseId}) => screen.drawAdd({context, franchiseId})},
    {name: "Drop", view: "Moves/Drop", match: {options: ["257"]}, on: "fuad-drop-on",
        load: () => import("./drop.js"),
        draw: (screen, {context, franchiseId}) => screen.drawDrop({context, franchiseId})},
    {name: "IR", view: "Moves/IR", match: {options: ["18"]}, on: "fuad-ir-on",
        load: () => import("./ir.js"),
        draw: (screen, {context, franchiseId, view}) => screen.drawIR({context, franchiseId, dropHref: view("Moves", "Drop")})},
    // and its proposal page (`O=05&FRANCHISE=<mine>,<theirs>`)
    {name: "Trades", view: "Moves/Trades", match: {options: ["05"]}, on: "fuad-trades-on",
        load: () => import("./trades.js"),
        draw: (screen, {context, franchiseId, view, teamHref}) => screen.drawTrades({context, franchiseId, addHref: view("Moves", "Add"), teamHref})},
    // Home's All moves and All bids: MFL's Transactions and Processed Waivers pages
    {name: "All moves", view: "Home", match: {options: ["03"]}, on: "fuad-all-moves-on",
        load: () => import("./all-moves.js"),
        draw: (screen, {context, franchiseId, teamHref}) => screen.drawAllMoves({context, franchiseId, teamHref})},
    {name: "All bids", view: "Home", match: {paths: ["processed_waivers"], options: ["76"]}, on: "fuad-all-bids-on",
        load: () => import("./all-moves.js"),
        draw: (screen, {context, franchiseId, teamHref}) => screen.drawAllBids({context, franchiseId, teamHref})},
    // League Rules and League Settings: one Rules page over either
    {name: "Rules", view: "Home", match: {options: ["09", "26"]}, on: "fuad-rules-on", members: true,
        load: () => import("./rules.js"),
        draw: (screen, {context, page}) => screen.drawRules({context, option: page.option})},
    // MFL's forms under v2's heading and tabs; reached from the team sheet, not a section
    {name: "Franchise setup", view: null, match: {paths: ["csetup"]}, on: "fuad-setup-on",
        load: () => import("./setup.js"),
        draw: (screen, {context, franchiseId}) => screen.restyleSetup(document, {context, franchiseId})},
    // the message board's pages (`mb/…`), MFL's restyled
    {name: "the message board page", view: "Home", match: {paths: ["mb"]},
        load: () => import("./topic.js"),
        draw: (board, {context, franchiseId, location}) => {
            const boardPage = (location.pathname.match(/\/mb\/(\w+)\.pl$/) || [])[1];
            if (!boardPage) {
                return false;
            }
            const restyle = {board_show: board.restyleBoard, topic_show: board.restyleTopic, post_add: board.restyleReply, topic_add: board.restyleReply,
                post_edit: board.restyleReply, message_show: board.restyleMessage}[boardPage];
            return restyle ? restyle(document, {guest: !franchiseId}) : board.restyleSidePage(boardPage, `${location.origin}/${context.season}/options?L=${context.leagueId}&O=28`);
        }}
];

// the pages a section or view matches: those v2 draws for it, and `more`, MFL's own under it
export function routesMatch(view, more = {}) {
    const match = {...more};
    for (const route of ROUTES.filter((entry) => entry.view === view)) {
        for (const [key, list] of Object.entries(route.match)) {
            match[key] = [...(match[key] || []), ...list];
        }
    }
    return match;
}
