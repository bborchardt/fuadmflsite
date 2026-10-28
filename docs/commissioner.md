# Commissioner's guide

What the commissioner does, on MFL and GitHub, to run the league site from this repo. How the code
works is in `README.md` and `docs/`.

## Pasting into MFL

The site reaches members through MFL home page messages. Their text lives in `mfl/`:

| File | MFL message | Used by |
|---|---|---|
| `message-header.html` | The header: a message set to appear on all league pages. It loads the site's code. | v1 and v2 |
| `message-contracts.html` | The Contracts tab's message | v1 only |
| `message-commish.html` | The Commish tab's message | v1 only |
| `message-links.html` | The Links tab's message | v1 only |

v2 draws everything from the header and ignores the three tabs. They stay while v1 is in use: anyone
outside the beta, or falling back from it, gets v1. Once v1 is retired, the three tab messages can be
deleted from MFL.

MFL copies the messages forward when the league renews, so a message needs pasting only when a pull
request changes its file in `mfl/`, and that PR says which.

To paste one:
1. Open the file on GitHub, on `master`, and copy all of it.
2. In MFL, League › Setup › Messages Setup: open that message, replace its text with what you copied,
   and save.
3. For the header: the beta offer line (see Betas and versions) is only in MFL's copy, not the repo's.
   Copy it from the live header before replacing, and put it back on the line the comment
   `<!-- a beta offer, if any, goes here -->` marks; leaving it out ends the beta.
4. When more than one file changed, paste the tab messages first and the header last. The header
   loads code that looks for the tabs' messages, so the tabs need to be in place before it.
5. Reload the league's home page and check that the site loads and the changed tab looks right.
