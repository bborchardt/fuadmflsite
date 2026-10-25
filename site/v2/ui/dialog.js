// v2's dialogs (site menu, team sheet, player popup) take focus, keep it until closed, close on Esc
// or a tap outside, and give it back to what opened them. With `history`, a dialog is also a history
// entry, so the browser's Back (Android's Back, an iPhone's edge swipe) closes it rather than
// leaving the page under it.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

let current = null;

const ownsEntry = () => Boolean(window.history.state && window.history.state.fuadDialog);

// a # change leaves the screen the dialog was over: close it, focus going to the new view rather
// than the opener
window.addEventListener("hashchange", () => {
    if (current) {
        current.close({restore: false, keepEntry: true});
    }
});

window.addEventListener("popstate", () => {
    if (current && current.history && !ownsEntry()) {
        current.close({popped: true});
    }
});

// Leaves for `url` in its own entry's place: back past the screen's `steps` (Add's and Trades' phone
// steps) and an open dialog's entry first, so Back from `url` leaves the page
export function replaceEntry(url, steps = 0) {
    const back = steps + (ownsEntry() ? 1 : 0);
    if (back > 0) {
        window.addEventListener("popstate", () => window.location.replace(url), {once: true});
        window.history.go(-back);
    } else {
        window.location.replace(url);
    }
}

// a reload with a dialog's entry current: nothing is open over it
if (ownsEntry()) {
    const rest = {...window.history.state};
    delete rest.fuadDialog;
    window.history.replaceState(Object.keys(rest).length ? rest : null, "");
}

// `layer` is the full-screen backdrop holding `panel`; `opener` gets focus back (Safari doesn't
// focus a tapped link, so a caller may know better than document.activeElement). Returns close().
export function openDialog(layer, {panel = layer.firstElementChild, opener = document.activeElement, onClose = () => {}, history = false} = {}) {
    // one dialog after another (the menu, then a player) shares one entry
    const inherited = Boolean(current && current.history && history);
    // whether this dialog has an entry of its own to leave when it closes
    let entry = inherited && current.entry;
    if (current) {
        current.close({restore: false, keepEntry: inherited});
    }
    if (history && !inherited) {
        // the screen's own entry (Add's and Trades' phone steps) is kept, so Back lands on it as it was
        try {
            window.history.pushState({...(window.history.state || {}), fuadDialog: true}, "");
            entry = true;
        } catch (error) {
            // Safari throws past ~100 a short while: Back just leaves the page, as without it
        }
    }
    layer.hidden = false;
    document.documentElement.classList.add("fuad-dialog-open");
    const focusables = () => [...panel.querySelectorAll(FOCUSABLE)].filter((node) => !node.closest("[hidden]") && node.getClientRects().length);
    const onKey = (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
        } else if (event.key === "Tab") {
            const list = focusables();
            if (!list.length) {
                event.preventDefault();
                return;
            }
            const first = list[0];
            const last = list[list.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    };
    const onClick = (event) => {
        // a link takes the dialog's entry, so Back from where it leads returns to the page under it
        const link = entry && event.target.closest("a[href]");
        if (link && /^https?:$/.test(link.protocol) && !link.target && !link.hasAttribute("download")
            && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
            event.preventDefault();
            // to the page it's over (the popup's Owner on that team's page): just close
            if (link.href === window.location.href) {
                close({restore: false});
            } else {
                close({restore: false, keepEntry: true});
                window.location.replace(link.href);
            }
            return;
        }
        if (event.target === layer || event.target.closest("[data-close]")) {
            close();
        }
    };
    // `popped`: Back already left the dialog's entry; `keepEntry`: it's left for a link or the next dialog
    function close({restore = true, popped = false, keepEntry = false} = {}) {
        if (current !== handle) {
            return;
        }
        current = null;
        if (entry && !popped && !keepEntry && ownsEntry()) {
            window.history.back();
        }
        layer.hidden = true;
        document.documentElement.classList.remove("fuad-dialog-open");
        document.removeEventListener("keydown", onKey, true);
        layer.removeEventListener("click", onClick);
        onClose();
        if (restore && opener && opener.isConnected && typeof opener.focus === "function") {
            opener.focus();
        }
    }
    const handle = {close, history, entry};
    current = handle;
    document.addEventListener("keydown", onKey, true);
    layer.addEventListener("click", onClick);
    (panel.querySelector("[autofocus]") || focusables()[0] || panel).focus();
    return close;
}
