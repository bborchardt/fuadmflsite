// v2's dialogs (site menu, team sheet, player popup) take focus, keep it until closed, close on Esc
// or a tap outside, and give it back to what opened them.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

let current = null;

// `layer` is the full-screen backdrop holding `panel`; `opener` gets focus back (Safari doesn't
// focus a tapped link, so a caller may know better than document.activeElement). Returns close().
export function openDialog(layer, {panel = layer.firstElementChild, opener = document.activeElement, onClose = () => {}} = {}) {
    if (current) {
        current.close({restore: false});
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
        if (event.target === layer || event.target.closest("[data-close]")) {
            close();
        }
    };
    function close({restore = true} = {}) {
        if (current !== handle) {
            return;
        }
        current = null;
        layer.hidden = true;
        document.documentElement.classList.remove("fuad-dialog-open");
        document.removeEventListener("keydown", onKey, true);
        layer.removeEventListener("click", onClick);
        onClose();
        if (restore && opener && opener.isConnected && typeof opener.focus === "function") {
            opener.focus();
        }
    }
    const handle = {close};
    current = handle;
    document.addEventListener("keydown", onKey, true);
    layer.addEventListener("click", onClick);
    (panel.querySelector("[autofocus]") || focusables()[0] || panel).focus();
    return close;
}
