// Cloudflare Worker behind the site's "Update now" button.
// Holds a GitHub token (secret GITHUB_TOKEN, only allowed to run Actions on this repo) and starts
// the update workflow. Cooldown comes from GitHub's own run history, so no storage is needed.
//
//   GET  /  -> status of the latest update run
//   POST /  -> start an update (unless one is running or ran in the last COOLDOWN_MIN minutes)

const WORKFLOW = 'update.yml';
const COOLDOWN_MIN = 5;
const ACTIVE = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending']);

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    const gh = (path, init = {}) =>
      fetch(`https://api.github.com/repos/${env.REPO}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'lol-friends-ladder-update-button',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

    const res = await gh(`/actions/workflows/${WORKFLOW}/runs?per_page=1`);
    if (!res.ok) return json({ error: `GitHub said ${res.status}` }, 502);
    const last = (await res.json()).workflow_runs?.[0];
    const lastInfo = last && {
      status: last.status,
      conclusion: last.conclusion,
      createdAt: last.created_at,
      updatedAt: last.updated_at,
    };

    if (req.method === 'GET') return json({ last: lastInfo });
    if (req.method !== 'POST') return json({ error: 'Use GET or POST' }, 405);

    if (last && ACTIVE.has(last.status)) return json({ result: 'running', last: lastInfo });
    const ageMs = last ? Date.now() - Date.parse(last.created_at) : Infinity;
    if (ageMs < COOLDOWN_MIN * 60_000) {
      return json({ result: 'cooldown', retryInSec: Math.ceil((COOLDOWN_MIN * 60_000 - ageMs) / 1000), last: lastInfo });
    }

    const started = await gh(`/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ ref: 'main' }),
    });
    if (started.status !== 204) return json({ error: `Could not start the update (GitHub said ${started.status})` }, 502);
    return json({ result: 'started', startedAt: new Date().toISOString() });
  },
};
