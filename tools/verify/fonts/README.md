Barlow and Barlow Condensed, as Google Fonts serves them (the latin and latin-ext subsets), for a
git ref from before `site/v2/fuad.css` took them from `site/v2/fonts/` rather than `@import`ing
Google's: the screen harness then still draws it in the font members saw rather than a machine's
fallback, which differs between a Mac and CI's Linux. Licensed under the SIL Open Font
License (OFL.txt). `barlow.css` is Google's stylesheet for them; the harness answers
fonts.googleapis.com with it and fonts.gstatic.com from these files.
