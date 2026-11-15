Barlow and Barlow Condensed, as Google Fonts serves them for `site/v2/fuad.css`'s `@import` (the
latin and latin-ext subsets), so the screen harness draws v2 in the font members see rather than a
machine's fallback, which differs between a Mac and CI's Linux. Licensed under the SIL Open Font
License (OFL.txt). `barlow.css` is Google's stylesheet for them; the harness answers
fonts.googleapis.com with it and fonts.gstatic.com from these files.
