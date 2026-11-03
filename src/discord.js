// Lightweight Discord integration via native webhooks (no external dependencies, no risk of bans).
const MEDALS = ['🥇', '🥈', '🥉'];
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

export function formatDiscordLeaderboard(board) {
  if (!board?.players?.length) return { content: 'No hay datos de leaderboard todavía.' };

  const fields = board.players.map((p, i) => {
    const medal = MEDALS[i] ?? `**#${i + 1}**`;
    const nick = p.nickname ? ` _"${p.nickname.title}"_ ${p.nickname.emoji}` : '';
    const d = p.lpDelta?.week;
    const week = d ? (d > 0 ? ` (+${d} LP sem)` : ` (${d} LP sem)`) : '';
    const stats = p.stats
      ? `\nScore: **${p.stats.avgScore.toFixed(1)}** · WR: **${p.stats.winrate}%** (${p.stats.games}g) · KDA: **${p.stats.kda}**`
      : '';
    return {
      name: `${medal} ${p.name}${nick}`,
      value: `**${p.solo?.label ?? 'Unranked'}**${week}${stats}`,
      inline: false,
    };
  });

  const description = [
    `🏆 **${board.groupName}**`,
    `Actualizado: <t:${Math.floor(board.updatedAt / 1000)}:R>`,
  ].join('\n');

  return {
    embeds: [
      {
        title: `🏆 Tabla de Clasificación — Solo/Duo`,
        description,
        color: 0xc8aa6e,
        fields: fields.slice(0, 25),
        footer: {
          text: 'La Grieta de los Pibes · 0-10 OP.GG Score',
        },
      },
    ],
  };
}

export async function sendDiscordWebhook(webhookUrl, payload) {
  if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
    return false;
  }
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  return res.ok;
}
