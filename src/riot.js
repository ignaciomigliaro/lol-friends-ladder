import fs from 'node:fs/promises';
import path from 'node:path';

const PLATFORM_TO_REGION = {
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

class RateLimiter {
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
  constructor({ apiKey, platform, dataDir, rateLimits }) {
    if (!apiKey || apiKey.includes('xxxx')) {
      throw new AuthError('No Riot API key configured. Put it in config.json ("apiKey") or the RIOT_API_KEY env var.');
    }
    this.apiKey = apiKey;
    this.platform = platform.toLowerCase();
    this.region = PLATFORM_TO_REGION[this.platform];
    if (!this.region) throw new Error(`Unknown platform "${platform}". Use one of: ${Object.keys(PLATFORM_TO_REGION).join(', ')}`);
    this.limiter = new RateLimiter(rateLimits ?? DEV_LIMITS);
    this.matchDir = path.join(dataDir, 'matches');
    this.accountsFile = path.join(dataDir, 'accounts.json');
    this.accounts = null;
  }

  async #get(host, pathname, query = {}) {
    const url = new URL(`https://${host}.api.riotgames.com${pathname}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

    for (let attempt = 0; attempt < 5; attempt++) {
      await this.limiter.acquire();
      const res = await fetch(url, { headers: { 'X-Riot-Token': this.apiKey } });
      if (res.ok) return res.json();
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
    }
    throw new Error(`Riot API kept failing on ${url.pathname}`);
  }

  async account(gameName, tagLine) {
    const key = `${gameName}#${tagLine}`.toLowerCase();
    if (!this.accounts) {
      this.accounts = JSON.parse(await fs.readFile(this.accountsFile, 'utf8').catch(() => '{}'));
    }
    if (this.accounts[key]) return this.accounts[key];

    const acc = await this.#get(this.region, `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`);
    if (acc) {
      this.accounts[key] = acc;
      await fs.mkdir(path.dirname(this.accountsFile), { recursive: true });
      await fs.writeFile(this.accountsFile, JSON.stringify(this.accounts, null, 2));
    }
    return acc;
  }

  summoner(puuid) {
    return this.#get(this.platform, `/lol/summoner/v4/summoners/by-puuid/${puuid}`);
  }

  async leagueEntries(puuid) {
    return (await this.#get(this.platform, `/lol/league/v4/entries/by-puuid/${puuid}`)) ?? [];
  }

  // type: 'ranked', 'normal', etc.; omit for every queue.
  async matchIds(puuid, count, type) {
    const query = { start: 0, count, ...(type && { type }) };
    return (await this.#get(this.region, `/lol/match/v5/matches/by-puuid/${puuid}/ids`, query)) ?? [];
  }

  // Finished matches never change, so they're cached on disk forever.
  async match(matchId) {
    const file = path.join(this.matchDir, `${matchId}.json`);
    const cached = await fs.readFile(file, 'utf8').catch(() => null);
    if (cached) return JSON.parse(cached);

    const match = await this.#get(this.region, `/lol/match/v5/matches/${matchId}`);
    if (match) {
      await fs.mkdir(this.matchDir, { recursive: true });
      await fs.writeFile(file, JSON.stringify(match));
    }
    return match;
  }
}
