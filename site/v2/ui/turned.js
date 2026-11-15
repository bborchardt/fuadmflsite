// Safari keeps a grid's rows at their old heights when the width changes (a phone turned and back), so
// a row whose text wraps differently the other way up is left too short or too tall: the grids
// `selector` names under `root` are laid out afresh then, the page kept where it was scrolled to.
export function relayoutWhenTurned(root, selector) {
    let width = window.innerWidth;
    window.addEventListener("resize", () => {
        if (window.innerWidth === width) {
            return;
        }
        width = window.innerWidth;
        const scrolled = window.scrollY;
        root.querySelectorAll(selector).forEach((grid) => {
            grid.style.display = "none";
            grid.getBoundingClientRect();
            grid.style.display = "";
        });
        if (window.scrollY !== scrolled) {
            window.scrollTo(window.scrollX, scrolled);
        }
    });
}
