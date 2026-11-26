# Student Pain Point Survey

A standalone, anonymous survey. Students consent, answer two questions (subject area, have they tried a project) and then rank their pain points by moving options from left to right. It's free to run: the site is static on GitHub Pages and answers are saved to a Google Sheet through Apps Script.

- `index.html`, `style.css`, `app.js`: the survey
- `config.js`: the Apps Script web app URL goes here
- `apps-script/Code.gs`: paste this into the Google Sheet's Apps Script (setup steps are at the top of the file)

Share links carry `?s=<source>` (qr, text, whatsapp...) so results can be compared by channel.
