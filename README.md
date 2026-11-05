# La Grieta de los Pibes

An esports-grade competitive dashboard and tracker for your League of Legends friend group: Solo/Duo rank, LP gained or lost this week, win rates, **OP.GG-style performance scores (0–10)**, continuous LP spline evolution charts, Hall of Fame records, 1v1 duel rivalry, a group meta tier list with 83+ champions, live active match tracking with 5v5 rosters, and recommended item build guides.

Runs smoothly as an automated site on **GitHub Pages** (refreshed every 30 minutes via GitHub Actions) or as a local server on your machine. Zero production runtime dependencies — only Node.js 18+ required.

---

## 🌟 Key Features

### 🔴 1. Live Game Tracker & 5v5 Lineups (`Spectator v5`)
- **Real-Time Detection:** Automatically scans when any friend enters a match, turning the status dot red (`🔴 1 en partida`).
- **5v5 Team Rosters:** Full Blue vs Red team breakdown displaying champion icons, summoner spells (*Flash, Smite, Ignite, TP*), bans, and match timer.
- **Friend Highlighting & Civil War:** Tracked friends are spotlighted with a gold `★ Amigo` badge, and games where friends face each other are labeled as `⚔️ ¡Guerra Civil!`.
- **Anti-Ghosting Safe:** Adheres to Riot's official 3-minute spectator buffer for competitive queues.

### 🎒 2. Recommended Builds & Item Guides
- **Tailored Builds for 80+ Champions:** Core legendaries, starter items, boot recommendations, situational counter items, and tactical gameplay tips.
- **Data Dragon Item Sprites:** High-resolution icons directly from Riot Games for every item.
- **One-Click Access:** Open builds from the Live Game banner, the 5v5 lineup, or anywhere in the Champion Pool armory. Also reachable directly via URL hash (e.g. `/#build:JarvanIV`, `/#build:Malzahar`).
- **REST Endpoint:** `GET /api/build/:champion`.

### 🛡️ 3. Group Meta & Champion Pool Tier List
- **Picks de Oro (Tier S+):** Group champions with devastating win rates (e.g., LeBlanc 100%, Thresh 100%, Vi 80%, Mordekaiser 75%).
- **Campeones Malditos (Prohibido):** LP drainers with sub-35% win rates to shame players into benching them.
- **Lane Specialists:** Identifies who commands Top, Jungle, Mid, ADC, and Support along with pick counts and win rates.
- **The Armory (83+ Champions):** Searchable and filterable grid (by lane) with average KDA, win rates, and the group's "Main" player for each champion.

### 🎖️ 4. Hall of Fame & Group Records
- **12 Historic Record Cards:** Most kills in a game, highest champion damage, best CS/min, gold records, longest win streak, highest seasonal win rate, longest game, and fastest victory.
- **Aggregated Totals Banner:** Total group games, cumulative damage dealt, total kills, and collective time invested on the Rift.

### 📈 5. LP Evolution & Elo Curve
- **Continuous SVG Spline Chart:** Displays each summoner's journey over time with division guidelines (Emerald IV, III, II), date milestones, and peak LP crowns (`👑 Pico Máximo`).
- **Trend Indicators:** Dynamic trajectory sparks showing recent momentum.

### ⚔️ 6. 1v1 Duels & Synergy Arena
- **Cara a Cara:** Select any two summoners to compare win rates, average OP scores, head-to-head records when matched against each other, and duo synergy when playing together.

### 🃏 7. Gamer Card Generator
- **Esports Player Cards:** High-definition 1200×675 canvas card generator displaying summoner rank, win rate, weekly LP, favorite champions, and active roast nickname, ready to download or share.

### 💬 8. Discord & WhatsApp Integration
- **Discord Webhook:** Formats rich Discord embeds with weekly leaderboards and match announcements (`/api/discord`).
- **WhatsApp Formatter & Bot:** Generates clean text summaries and includes an optional headless WhatsApp bot (`!tabla`, `!score`, `!apodos`, `!stats`).

---

## Contributing (pull requests)

`main` only accepts changes through a **pull request**, and a pull request can only be merged once the
tests pass. Nobody can push straight to `main`, force-push over it or delete it.

```bash
git switch -c my-change          # work on a branch
# ...edit, then run npm test and npm run test:e2e locally...
git push -u origin my-change
gh pr create --fill              # or open the PR on github.com
```

GitHub runs the tests on the PR. When the **test** check is green, press **Merge**; the site updates
right after. If it's red, open the check to see what broke, fix it on the same branch and push again.

The bot's saved data (LP history, games together, account ids) lives on the separate **`data`**
branch, which the Action reads before each update and writes after it.

## Tests

Every push and pull request runs two test suites on GitHub **before** anything is published. If a
test fails, the site is not updated: it keeps showing the last version that passed, and the failing
check on GitHub says what broke.

- `npm test`: unit tests for scoring, nicknames, roasts, weekly/season LP, champion names, lane
  opponents, the Riot client, builds, meta, records and more.
- `npm run test:e2e`: builds the site from demo data (no Riot key needed), serves it like GitHub
  Pages and clicks through it in a real browser. It checks every menu page, the Jugadores grid and
  profiles, champion matchups, the roasts on Apodos, that the Update button reaches the Worker, and
  that player pages fit a phone screen.

Run them locally before pushing: `npm install`, then `npm test` and `npm run test:e2e`.
On Windows, point the browser test at Edge or Chrome first:
`set PUPPETEER_EXECUTABLE_PATH=C:Program Files (x86)MicrosoftEdgeApplicationmsedge.exe`.

When you add a feature, add a check for it, so the next change can't silently remove it.

## 🌐 The Website (GitHub Pages Deployment)

The GitHub Actions workflow in [`.github/workflows/update.yml`](.github/workflows/update.yml) runs every 30 minutes:
1. Fetches recent match data from the Riot API.
2. Recalculates leaderboards, MVP scores, records, and champion pools.
3. Automatically updates `data/history.json`, `data/group-games.json`, and `data/accounts.json`.
4. Builds the static site in `site/` and deploys it to GitHub Pages.

- **API Key Configuration:** Stored as repository secret `RIOT_API_KEY` (Settings → Secrets and variables → Actions).
- **On-Demand Updates:** Clicking **⟳ Actualizar** on the dashboard triggers the workflow via Cloudflare Worker (`worker/`).

---

## 💻 Running Locally (5 Minutes)

1. **Obtain a Riot API Key:**
   - Log into [Riot Developer Portal](https://developer.riotgames.com) and copy your *Development API Key* (or apply for a *Personal API Key*).
   - Put it in `secrets.json` as `{ "apiKey": "RGAPI-..." }` (this file is git-ignored).

2. **Configure Your Friend Group:**
   - Copy `config.example.json` to `config.json`:
     ```json
     {
       "platform": "la1",
       "groupName": "La Grieta de los Pibes",
       "matchesPerPlayer": 15,
       "friends": [
         { "riotId": "Panda#JK23", "name": "Panda" },
         { "riotId": "ChubbyKop#LAN" },
         { "riotId": "Ryômen Sukuna#JK23" },
         { "riotId": "Yúta Okkotsu#JK23" },
         { "riotId": "Satoru Gojo#JK23" },
         { "riotId": "Toji Fushiguro#JK23" }
       ]
     }
     ```
   - `platform`: `la1` (LAN), `la2` (LAS), `na1`, `euw1`, `br1`, `kr`, etc.

3. **Start the Dashboard:**
   ```bash
   npm start
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser. Matches are cached in `data/matches/` so subsequent reloads are instantaneous.

4. **Run Tests:**
   ```bash
   npm test
   ```
   Runs the full native Node.js test suite across all subsystems in < 500ms.

---

## 🧮 How the Performance Score Works

The score (0.0–10.0) is fitted to **OP.GG's own OP Score**. OP.GG doesn't publish its formula, so a small neural network was trained on 185 ranked games where OP.GG's real score is known for all 10 players, minute by minute ([calibration/](calibration/README.md)).

- **Inputs:** each player's K/D/A, kill participation, gold, experience, CS, damage dealt and taken, wards, turrets, plates and objectives, measured against their team, their lane opponent and the lobby, plus how far ahead their team is and who won.
- **Accuracy on games it never saw:** off by 0.34 on average; 60% of players within 0.3 and 80% within 0.5 of OP.GG. A 0.1 match on every game isn't reachable: OP.GG's score comes from its own model and depends on how the game unfolded minute by minute.
- **Accolades:** **MVP** is the highest score on the winning team; **ACE** the highest on the losing team; **Mochila** the weakest player of each team.
- **Recalibrating:** save more OP.GG match history and rerun the steps in [calibration/README.md](calibration/README.md). `npm test` checks the model against 10 games it was never trained on.

---

## 📂 Architecture & Files

```
├── .github/workflows/
│   └── update.yml         # Automated GitHub Actions updater & Pages publisher
├── public/                # Frontend application
│   ├── index.html         # High-contrast eSports dashboard and modal dialogs
│   ├── style.css          # Dark eSports theme, animations, and responsive layouts
│   ├── app.js             # Client SPA routing, live polling, SVG charts, gamer cards
│   └── assets/            # Official team logos and icons
├── src/                   # Backend modules
│   ├── builds.js          # Season 14/15 item builds and archetype recommendations
│   ├── live.js            # Spectator v5 live game tracker and 5v5 roster builder
│   ├── meta.js            # Champion pool analyzer (God Tier, Cursed, Specialists)
│   ├── records.js         # Hall of Fame and historical group totals
│   ├── riot.js            # Rate-limited Riot API client with persistent disk caching
│   ├── score.js           # 0-10 match score, places, MVP / ACE / Mochila
│   ├── opscore.js         # OP Score model fitted to OP.GG (weights in opscore-model.json)
│   ├── tracker.js         # Leaderboard computation and atomic data writes
│   ├── ranks.js           # LP normalizer across tiers and divisions
│   ├── nicknames.js       # Spanish roasting nicknames based on match habits
│   ├── discord.js         # Discord webhook embed formatting
│   └── group.js           # Multi-friend shared matches and synergy detection
├── test/                  # Test suite (Node.js native runner)
│   ├── builds.test.js     # Tests for build recommendations
│   ├── live.test.js       # Tests for champion mapping and live spectator
│   ├── meta.test.js       # Tests for group meta and tier list
│   └── records.test.js    # Tests for Hall of Fame records
├── server.js              # Standalone local HTTP server and REST endpoints
└── build.js               # Static site builder for GitHub Pages
```

---

## 📜 License

MIT License. Designed with passion for competitive friend groups in League of Legends.
