// Builds a message that renders nicely in WhatsApp (*bold*, _italic_, emojis).

const MEDALS = ['🥇', '🥈', '🥉'];

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

function lpTag(p) {
  const d = p.lpDelta?.week;
  const s = p.lpDelta?.season;
  const week = d ? (d > 0 ? ` 📈${signed(d)} sem` : ` 📉${signed(d)} sem`) : '';
  const season = s ? ` · ${signed(s)} temp` : '';
  return week + season;
}

export function whatsappMessage(board) {
  if (!board?.players?.length) return 'No data yet. Hit refresh first!';
  const date = new Date(board.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const lines = [`🏆 *${board.groupName} — Ranked Leaderboard*`, `_${date}_`, ''];

  board.players.forEach((p, i) => {
    const pos = MEDALS[i] ?? `${i + 1}.`;
    const nick = p.nickname ? ` _"${p.nickname.title}"_ ${p.nickname.emoji}` : '';
    lines.push(`${pos} *${p.name}*${nick} — ${p.solo?.label ?? 'Unranked'}${lpTag(p)}`);
    if (p.stats) {
      const s = p.stats;
      const streak = s.streak >= 3 ? ` · 🔥${s.streak}W` : s.streak <= -3 ? ` · 🧊${-s.streak}L` : '';
      lines.push(`      Score *${s.avgScore.toFixed(1)}* · ${s.winrate}% WR (${s.games}g) · KDA ${s.kda}${s.mvp ? ` · ${s.mvp}× MVP` : ''}${streak}`);
    }
  });

  const withStats = board.players.filter((p) => p.stats);
  const withDelta = board.players.filter((p) => p.lpDelta?.week);
  const awards = [];
  if (withStats.length > 1) {
    const best = [...withStats].sort((a, b) => b.stats.avgScore - a.stats.avgScore)[0];
    awards.push(`⭐ Best avg score: *${best.name}* (${best.stats.avgScore.toFixed(1)})`);
    const mvp = [...withStats].sort((a, b) => b.stats.mvp - a.stats.mvp)[0];
    if (mvp.stats.mvp > 0) awards.push(`👑 Most MVPs: *${mvp.name}* (${mvp.stats.mvp})`);
  }
  if (withDelta.length) {
    const sorted = [...withDelta].sort((a, b) => b.lpDelta.week - a.lpDelta.week);
    if (sorted[0].lpDelta.week > 0) awards.push(`🚀 Climber of the week: *${sorted[0].name}* (${signed(sorted[0].lpDelta.week)} LP)`);
    const worst = sorted.at(-1);
    if (worst.lpDelta.week < 0) awards.push(`🪦 Rough week: *${worst.name}* (${signed(worst.lpDelta.week)} LP)`);
  }
  if (awards.length) lines.push('', ...awards);

  const nicknamed = board.players.filter((p) => p.nickname);
  if (nicknamed.length) {
    lines.push('', '🎭 *Apodos de la semana*');
    for (const p of nicknamed) lines.push(`${p.nickname.emoji} *${p.name}*: "${p.nickname.title}" (${p.nickname.reason})`);
  }

  lines.push('', '_Score = OP.GG-style 0–10 rating, avg of recent ranked games · sem = LP desde el lunes · temp = LP en la temporada_');
  return lines.join('\n');
}
