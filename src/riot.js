import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const PLATFORM_TO_REGION = {
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe', me1: 'europe',
  kr: 'asia', jp1: 'asia',
  oc1: 'sea', sg2: 'sea', tw2: 'sea', vn2: 'sea',
};

// Development keys: 20 requests / 1 s and 100 requests / 2 min.
// Personal/production keys are higher; raise these via config.rateLimits if you have one.
const DEV_LIMITS = [
  { count: 20, perMs: 1_000 },
  { count: 100, perMs: 120_000 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class AuthError extends Error {}

const scopeOf = (puuid) => crypto.createHash('sha256').update(puuid).digest('hex').slice(0, 12);

async function atomicWriteFile(file, content) {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`);
  try {
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}

export function pruneMatch(m) {
  if (!m?.info?.participants) return m;
  return {
    metadata: { matchId: m.metadata?.matchId },
    info: {
      queueId: m.info.queueId,
      gameDuration: m.info.gameDuration,
      gameEndTimestamp: m.info.gameEndTimestamp,
      gameCreation: m.info.gameCreation,
      participants: m.info.participants.map((p) => ({
        puuid: p.puuid,
        teamId: p.teamId,
        teamPosition: p.teamPosition,
        championName: p.championName,
        win: p.win,
        gameEndedInEarlySurrender: p.gameEndedInEarlySurrender,
        kills: p.kills ?? 0,
        deaths: p.deaths ?? 0,
        assists: p.assists ?? 0,
        totalMinionsKilled: p.totalMinionsKilled ?? 0,
        neutralMinionsKilled: p.neutralMinionsKilled ?? 0,
        visionScore: p.visionScore ?? 0,
        totalDamageDealtToChampions: p.totalDamageDealtToChampions ?? 0,
        totalDamageTaken: p.totalDamageTaken ?? 0,
        damageSelfMitigated: p.damageSelfMitigated ?? 0,
        damageDealtToObjectives: p.damageDealtToObjectives ?? 0,
        damageDealtToBuildings: p.damageDealtToBuildings ?? p.damageDealtToTurrets ?? 0,
        damageDealtToTurrets: p.damageDealtToTurrets ?? 0,
        turretTakedowns: p.turretTakedowns ?? p.turretKills ?? 0,
        turretKills: p.turretKills ?? 0,
        goldEarned: p.goldEarned ?? 0,
        totalTimeSpentDead: p.totalTimeSpentDead ?? 0,
        totalHealsOnTeammates: p.totalHealsOnTeammates ?? 0,
        totalDamageShieldedOnTeammates: p.totalDamageShieldedOnTeammates ?? 0,
        dragonKills: p.dragonKills ?? 0,
        baronKills: p.baronKills ?? 0,
        challenges: {
          soloKills: p.challenges?.soloKills ?? 0,
          dragonTakedowns: p.challenges?.dragonTakedowns ?? 0,
          baronTakedowns: p.challenges?.baronTakedowns ?? 0,
          riftHeraldTakedowns: p.challenges?.riftHeraldTakedowns ?? 0,
          voidMonsterKill: p.challenges?.voidMonsterKill ?? 0,
        },
      })),
    },
  };
}

export class RateLimiter {
  constructor(limits) {
    this.limits = limits;
    this.stamps = [];
    this.chain = Promise.resolve();
    this.longest = Math.max(...limits.map((l) => l.perMs));
  }

  acquire() {
    const turn = this.chain.then(() => this.#waitForSlot());
    this.chain = turn.catch(() => {});
    return turn;
  }

  async #waitForSlot() {
    for (;;) {
      const now = Date.now();
      this.stamps = this.stamps.filter((t) => now - t < this.longest);
      let waitMs = 0;
      for (const { count, perMs } of this.limits) {
        const inWindow = this.stamps.filter((t) => now - t < perMs);
        if (inWindow.length >= count) {
          const oldestBlocking = inWindow[inWindow.length - count];
          waitMs = Math.max(waitMs, perMs - (now - oldestBlocking) + 50);
        }
      }
      if (waitMs === 0) {
        this.stamps.push(now);
        return;
      }
      await sleep(waitMs);
    }
  }
}

export class RiotClient {
  constructor({ apiKey, platform = 'la1', dataDir, rateLimits }) {
    if (!apiKey || apiKey.includes('xxxx')) {
      throw new AuthError('No Riot API key configured. Put it in config.json ("apiKey") or the RIOT_API_KEY env var.');
    }
    this.apiKey = apiKey;
    this.platform = platform.toLowerCase();
    this.region = PLATFORM_TO_REGION[this.platform];
    if (!this.region) throw new Error(`Unknown platform "${platform}". Use one of: ${Object.keys(PLATFORM_TO_REGION).join(', ')}`);
    this.limiter = new RateLimiter(rateLimits ?? DEV_LIMITS);
    this.matchRoot = path.join(dataDir, 'matches');
    this.accountsFile = path.join(dataDir, 'accounts.json');
    this.accounts = null;
    this.loading = null;
    this.scope = null;
    this.previous = {};
    this.puuidRemap = new Map();
  }

  get matchDir() {
    return path.join(this.matchRoot, this.scope ?? 'unscoped');
  }

  #loadAccounts() {
    this.loading ??= (async () => {
      const raw = JSON.parse(await fs.readFile(this.accountsFile, 'utf8').catch(() => '{}'));
      const legacy = !raw.accounts;
      const entries = legacy ? raw : raw.accounts;
      const first = Object.values(entries)[0];
      let valid = false;
      if (first) {
        try {
          valid = Boolean(await this.#get(this.region, `/riot/account/v1/accounts/by-puuid/${first.puuid}`));
        } catch (err) {
          if (err instanceof AuthError) throw err;
        }
      }
      if (valid) {
        this.accounts = entries;
        this.scope = raw.scope ?? scopeOf(first.puuid);
      } else {
        this.previous = entries;
        this.accounts = {};
        if (raw.scope) await fs.rm(path.join(this.matchRoot, raw.scope), { recursive: true, force: true });
      }
      const loose = (await fs.readdir(this.matchRoot).catch(() => [])).filter((f) => f.endsWith('.json'));
      for (const f of loose) await fs.rm(path.join(this.matchRoot, f), { force: true });
    })();
    return this.loading;
  }

  async #saveAccounts() {
    await atomicWriteFile(this.accountsFile, JSON.stringify({ scope: this.scope, accounts: this.accounts }, null, 2));
  }

  async #get(host, pathname, query = {}) {
    const url = new URL(`https://${host}.api.riotgames.com${pathname}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

    for (let attempt = 0; attempt < 5; attempt++) {
      await this.limiter.acquire();
      try {
        const res = await fetch(url, {
          headers: { 'X-Riot-Token': this.apiKey },
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) return await res.json();
        if (res.status === 404) return null;
        if (res.status === 401 || res.status === 403) {
          const reason = (await res.json().catch(() => null))?.status?.message ?? res.statusText;
          throw new AuthError(`Riot API key was rejected (${res.status}: ${reason}). Development keys expire every 24h; get a fresh one at https://developer.riotgames.com`);
        }
        if (res.status === 429 || res.status >= 500) {
          const retryAfter = Number(res.headers.get('retry-after'));
          await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
          continue;
        }
        throw new Error(`Riot API ${res.status} on ${url.pathname}`);
      } catch (err) {
        if (err instanceof AuthError) throw err;
        if (attempt < 4 && (err.name === 'TimeoutError' || err.name === 'AbortError' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Riot API kept failing on ${url.pathname}`);
  }

  async account(gameName, tagLine, region = this.region) {
    const key = `${gameName}#${tagLine}`.toLowerCase();
    await this.#loadAccounts();
    if (this.accounts[key]) return this.accounts[key];

    const acc = await this.#get(region, `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`);
    if (acc) {
      this.scope ??= scopeOf(acc.puuid);
      const old = this.previous[key]?.puuid;
      if (old && old !== acc.puuid) this.puuidRemap.set(old, acc.puuid);
      this.accounts[key] = acc;
      await this.#saveAccounts();
    }
    return acc;
  }

  summoner(puuid, platform = this.platform) {
    return this.#get(platform.toLowerCase(), `/lol/summoner/v4/summoners/by-puuid/${puuid}`);
  }

  activeGame(puuid, platform = this.platform) {
    return this.#get(platform.toLowerCase(), `/lol/spectator/v5/active-games/by-summoner/${puuid}`);
  }

  async leagueEntries(puuid, platform = this.platform) {
    return (await this.#get(platform.toLowerCase(), `/lol/league/v4/entries/by-puuid/${puuid}`)) ?? [];
  }

  async matchIds(puuid, count, filter = {}, region = this.region) {
    const query = { start: 0, count, ...filter };
    return (await this.#get(region, `/lol/match/v5/matches/by-puuid/${puuid}/ids`, query)) ?? [];
  }

  // Finished matches never change, so they are pruned and cached on disk forever.
  async match(matchId, region = this.region) {
    const file = path.join(this.matchDir, `${matchId}.json`);
    const cached = await fs.readFile(file, 'utf8').catch(() => null);
    if (cached) return JSON.parse(cached);

    const raw = await this.#get(region, `/lol/match/v5/matches/${matchId}`);
    if (raw) {
      const pruned = pruneMatch(raw);
      await atomicWriteFile(file, JSON.stringify(pruned));
      return pruned;
    }
    return raw;
  }
}
