# LoL Friends Tracker

A leaderboard for your friend group: Solo/Duo rank, LP gained or lost this week, win rate, and an
**OP.GG-style 0–10 performance score** for every ranked game. It also gives a detailed breakdown of
every game where two or more of you played on the same team. You can share it to WhatsApp as an image.

It runs as a website on GitHub Pages and updates itself every 30 minutes, or locally on your PC.
No dependencies. You only need Node.js 18+.

## The website (GitHub Pages)

The GitHub Action in `.github/workflows/update.yml` runs every 30 minutes. It pulls fresh data from
the Riot API, saves LP history and games together back to the repo, and publishes the site.

- **API key:** stored as the repository secret `RIOT_API_KEY` (Settings → Secrets and variables →
  Actions). When it expires, update it there or run
  `gh secret set RIOT_API_KEY` and paste the new key.
- **Update now:** anyone can press **⟳ Update now** on the site. It goes through a small Cloudflare
  Worker (`worker/`) that holds a GitHub token allowed only to run this repo's Actions. It starts the
  update unless one ran in the last 5 minutes, and the page reloads by itself when the new data is live
  (about 1–2 minutes). You can also use Actions tab → *Update leaderboard* → *Run workflow*.
  - Worker URL: set as `updateUrl` in `config.json`. Redeploy after editing `worker/`:
    `cd worker && npx wrangler deploy`.
  - If the GitHub token expires, create a new fine-grained token (this repo only, *Actions: Read and
    write*) and run `npx wrangler secret put GITHUB_TOKEN` in `worker/`.
- **Add or remove friends:** edit `config.json` and push. Pushing also triggers an update.
- If the key expires, the site keeps showing the last data, and GitHub emails you that the run failed.

## Running locally (5 minutes)

1. **Get a Riot API key.** Log in at https://developer.riotgames.com and copy the *Development API Key*.
   - Dev keys **expire every 24 hours**. For something permanent, register a *Personal API Key* on the same
     site (free, approved in a few days) and paste that in instead.
   - Put it in `secrets.json` as `{ "apiKey": "RGAPI-..." }`. That file is git-ignored. If you paste the key
     into `config.json` instead, it's moved to `secrets.json` automatically, so it never gets committed.
2. **Edit `config.json`.** It's created on first run, or copy `config.example.json` yourself:
   ```json
   {
     "platform": "la1",
     "groupName": "La Grieta de los Pibes",
     "matchesPerPlayer": 15,
     "friends": [
       { "riotId": "Nacho#LAN", "name": "Nacho" },
       "Santi#1234"
     ]
   }
   ```
   - `platform`: `la1` (LAN), `la2` (LAS), `na1`, `br1`, `euw1`, `kr`, etc.
   - Each friend is either `"Name#TAG"` or `{ "riotId": "Name#TAG", "name": "Nickname" }`.
   - Instead of putting the key in the file, you can set the `RIOT_API_KEY` env var.
3. **Run it:** double-click `start.bat`, or run `npm start`, then open http://localhost:3000.

The first refresh takes a few minutes. Dev keys only allow 100 requests every 2 minutes, and each
friend needs about `matchesPerPlayer + 4` requests. After that, matches are cached in `data/matches/`,
so later refreshes are fast. The app refreshes itself every `autoRefreshMinutes` (default 30).

Want to see it without a key? Run `npm run demo`.

## Sharing to the group chat

From the dashboard:

| Button | What it does |
|---|---|
| **📲 Send image to WhatsApp** | Copies the leaderboard image and opens WhatsApp Desktop. Open the group, press **Ctrl+V**, then send. |
| **Share…** | Opens the system share menu with the image attached, where WhatsApp is an option. |
| **Download image** | Saves the PNG. |
| **Copy text** | Copies the leaderboard as a formatted WhatsApp message instead of an image. |

The image follows whichever sort tab is active (Rank / Avg score / Win rate / LP this week). Open
`/#card` to preview it full size. Each image you send or download is also saved in `data/cards/`.

WhatsApp doesn't let apps post into a normal group by themselves, so the final paste-and-send is done by hand.

## WhatsApp bot (optional, off by default)

A WhatsApp account can sit in your group and answer commands, so everyone can check the leaderboard:

| Command | Reply |
|---|---|
| `!tabla` | Leaderboard image, sorted by rank |
| `!score` / `!semana` | Image sorted by average score / LP gained this week |
| `!apodos` | This week's nicknames and why |
| `!stats panda` | One player's rank, score, last 5 games and mains (partial names work) |
| `!actualizar` | Looks for new games, then sends the image (at most once every 5 min) |
| `!ayuda` | List of commands |

It also posts on its own:
- a **weekly recap** (image + nicknames), set by `weeklyRecap` (day in Spanish or English, hour 0–23)
- **promotion and demotion announcements** after each refresh ("🎉 Panda subió a Platinum I")

### Setup

1. Run `npm install` once.
2. In `config.json`, set `"whatsapp": { "enabled": true, "group": "<exact group name>" }`.
3. Run `start.bat`. The first time, a QR code appears in the terminal window. Scan it with the phone
   whose WhatsApp should be the bot: **WhatsApp > Settings > Linked devices > Link a device**.
4. Add that number to the group. The bot only answers in the group named in `"group"`.

The login is saved in `data/whatsapp-session/`, so you only scan once. The bot uses the Edge or
Chrome already on your PC. Set `whatsapp.browserPath` if it can't find one.

**Caveats:** this uses [whatsapp-web.js](https://wwebjs.dev), an unofficial library. WhatsApp
doesn't allow bots on normal accounts and can ban a number it flags, so a **spare number** (a cheap
prepaid SIM) is safest. Your own number also works: commands you type yourself are answered too.
The bot only runs while `start.bat` is open on your PC.

## Playing together

Each refresh also checks the last 20 matches of each friend in every Summoner's Rift queue and ARAM.
It looks for matches where 2+ friends were on the same team, and only downloads those. Each of those
games gets:

- the friends ranked by their 0–10 score, with 👑 *Carry del grupo* and 🎒 *Mochila del grupo*
- bars for damage to champions, kill participation, objective damage, tower damage and towers taken,
  epic monsters (dragons, barons, heralds, voidgrubs), vision, damage absorbed and gold. A full bar
  means the best of all 10 players in that game.

There are also totals across those games: each friend's record and average score when playing together,
and how each duo does. The last 60 games together are kept in `data/group-games.json`.
`groupLookback` in `config.json` changes how many recent matches are checked (default 20).

## LP this week

"LP this week" resets every **Monday at 00:00**. It compares current Solo/Duo LP with the last snapshot
taken before the week started. Promotions and demotions count as 100 LP per division. A friend added
mid-week counts from their first snapshot. The time zone and start day are set in `config.json`:
`"weekStart": { "day": "monday", "timeZone": "America/New_York" }` (any IANA zone, e.g.
`America/Argentina/Buenos_Aires`).

## Apodos (nicknames)

Each friend gets a Spanish nickname that roasts their worst habit in recent games: *El Feeder Oficial*,
*El Kamikaze*, *Donador de Oro* (gives gold to their lane rival), *Sparring del Rival*, *Manco Certificado*,
*Pecho Frío*, *El Ciego de la Grieta*, *El Vegano*, *El Granjero*, *Robakills*, *Main de Cartón*,
*Refugiado en Flex*, *Ludópata del Ranked*, *El Último Orejón del Tarro* and more (26 in total). Nobody shares
a nickname, and they change as people play. The rules, thresholds and jokes are in
[src/nicknames.js](src/nicknames.js).

From the terminal, `npm run refresh` pulls fresh data and prints the WhatsApp message. It also saves
the message to `data/whatsapp.txt`.

**Using it from your phone:** set `"host": "0.0.0.0"` in `config.json`, then open
`http://<your-PC's-IP>:3000` on your phone while it's on the same Wi-Fi. Phone browsers block
copying and sharing on plain `http://` addresses that aren't `localhost`, so there the buttons
download the image instead. Attach it in WhatsApp from your gallery.

## How the score works

OP.GG doesn't publish its OP Score formula, so this is an approximation built on the same idea. Each
player is rated **against the other 9 players in the same match**, using these stats:

- KDA (capped at 12), kill participation, share of the team's champion damage
- gold/min, CS/min, vision score/min
- share of the team's damage taken and mitigated (tanking), share of objective damage
- a small bonus for winning

The weights depend on role. Supports get no CS weight and heavy weight on vision and kill
participation. Junglers get extra credit for objectives. Top laners get extra credit for tanking.
The best player in the game scores 10. **MVP** is the top score on the winning team and **ACE** is the
top score on the losing team. Remakes are ignored.

To change the weights, edit `WEIGHTS` in [src/score.js](src/score.js).

## Files

- `server.js`: local web server and auto-refresh
- `report.js`: command-line WhatsApp report
- `src/riot.js`: Riot API client (rate limiter, retries, match cache)
- `src/score.js`: per-game score
- `src/tracker.js`: builds the leaderboard and tracks LP history in `data/history.json`
- `src/nicknames.js`: Spanish nicknames
- `src/whatsapp.js`: WhatsApp message formatter
- `src/group.js`: games-together breakdowns
- `build.js`: builds the static site for GitHub Pages
- `public/`: dashboard and share image
