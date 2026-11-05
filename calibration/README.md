# OP Score calibration

These scripts fit the site's score (`src/opscore.js`) to OP.GG's real OP Score. More games make it more accurate.

## 1. Save OP.GG match history

1. In Chrome or Brave, open a player's op.gg page, for example `https://op.gg/lol/summoners/lan/Panda-JK23`.
2. Press **F12**, open **Network**, and tick **Keep log** (also called "Preserve log").
3. Reload the page (**F5**), then click **Show more** at the bottom of the match history until enough games are loaded (each click adds 20).
4. Click the **⬇ Export HAR** icon in the Network toolbar and save the file into `opgg/` (any name ending in `.har`).

Several players' pages can be saved; games that appear twice are counted once. The `opgg/` folder is ignored by git, because HAR files can contain personal data.

## 2. Run the steps

```
node calibration/extract-opgg.js                      # OP.GG scores out of the HAR files
node calibration/download-riot.js "Panda#JK23"        # same games from Riot, Riot IDs whose pages you saved
node calibration/make-fixture.js                      # sets aside 10 games for the tests
node calibration/train.js                             # fits the model, writes src/opscore-model.json
npm test
```

`download-riot.js` uses the API key in `secrets.json` and keeps to a personal key's rate limit: about 2.5 seconds per game, because each game needs its match and its per-minute timeline. Downloads go to `calibration/data/` (ignored by git) and are reused on the next run.

`train.js` prints the error on games held out of training, the number to compare between runs. Commit `src/opscore-model.json` and `test/fixtures/opgg-games.json` through a pull request.

## How the model works

OP.GG re-rates every player each minute, starting from about 5.0; the final score is the last rating. Riot's match timeline has the same one-minute steps, so the model learns from every minute of every game, not only the final scores.

For each player it looks at K/D/A, kill participation, gold, experience, CS, damage dealt and taken, wards, turrets, plates and objectives. These are measured against the player's team, their lane opponent and the lobby, plus how far ahead the team is and, at the end, who won. An average of 5 small neural networks (one hidden layer of 32) turns those into the score.

The site only downloads end-of-game summaries. The final inputs are therefore computed from the summary (`summaryState`), and the timeline (`timeline.js`) is used only for training.
