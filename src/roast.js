// A full roast for each player, built from the facts of their worst recent ranked game.
// Lines are picked by how bad each stat was, and the wording is chosen from the match id,
// so the roast stays the same between refreshes instead of reshuffling every 30 minutes.

const DAY = 24 * 60 * 60 * 1000;
const ROLE_ES = { TOP: 'top', JUNGLE: 'jungla', MIDDLE: 'mid', BOTTOM: 'ADC', UTILITY: 'support' };
const fmt = (n, d = 1) => Number(n.toFixed(d)).toString();
const miles = (n) => (n >= 1000 ? `${fmt(n / 1000)}k` : `${Math.round(n)}`);

// Small deterministic hash so the same game always gets the same wording.
function seedOf(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
// Starts at a seeded phrasing and skips any line another player's roast already used.
// With strict, returns null once every phrasing is taken so the caller can move on.
function pick(list, seed, salt, used, norm = (x) => x, strict = false) {
  const start = (seed + salt * 7919) % list.length;
  for (let i = 0; i < list.length; i++) {
    const line = list[(start + i) % list.length];
    if (!used?.has(norm(line))) {
      used?.add(norm(line));
      return line;
    }
  }
  return strict ? null : list[start];
}

// Worst = lowest score in the last 30 days of ranked; ties go to whoever died more.
export function worstGame(p, now = Date.now()) {
  const pool = (p.games ?? []).filter((g) => now - g.endTs < 30 * DAY);
  const games = pool.length >= 3 ? pool : p.games ?? [];
  return [...games].sort((a, b) => a.score - b.score || b.deaths - a.deaths)[0] ?? null;
}

export function buildRoast(p, now = Date.now(), used = new Set()) {
  const g = worstGame(p, now);
  if (!g) return null;
  const seed = seedOf(g.matchId);
  const date = new Date(g.endTs).toLocaleDateString('es', { day: 'numeric', month: 'long' });
  const role = ROLE_ES[g.position];
  const opp = g.opp;
  // Compare phrasings, not numbers or champion names, when avoiding repeats.
  const norm = (line) => line.split(g.champion).join('@').split(opp?.champion || '@').join('@').replace(/[0-9]+([.,][0-9]+)?k?/g, '#').replace(/ de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/g, '');

  // Every fact that applies, with how much it hurts (higher = said first).
  const facts = [];
  const add = (weight, lines) => facts.push({ weight, lines });

  if (g.deaths >= 8) {
    add(g.deaths, [
      `Se murió ${g.deaths} veces. El temporizador de reaparición ya lo saluda por el nombre.`,
      `${g.deaths} muertes. Pasó más tiempo mirando la pantalla gris que jugando.`,
      `Lo mataron ${g.deaths} veces: el equipo rival lo farmeaba como a un súbdito más.`,
      `${g.deaths} muertes. Si morir diera LP, ya estaría en Challenger.`,
      `Murió ${g.deaths} veces. Su respawn tenía más minutos de juego que él.`,
    ]);
  }
  if (opp && opp.gold - (g.gold ?? 0) >= 1500) {
    const diff = opp.gold - g.gold;
    add(diff / 400, [
      `${opp.champion} le sacó ${miles(diff)} de oro de ventaja. Prácticamente le pagó el ítem.`,
      `Le regaló ${miles(diff)} de oro a ${opp.champion}. Eso no es una línea, es una obra de caridad.`,
      `${opp.champion} terminó con ${miles(diff)} más de oro. Ni el banco presta tan fácil.`,
      `${miles(diff)} de oro de diferencia con ${opp.champion}. Lo patrocinó toda la partida.`,
      `Le dio ${miles(diff)} de oro de ventaja a ${opp.champion}. Más generoso que un aguinaldo.`,
      `${opp.champion} se compró dos ítems con los ${miles(diff)} de oro que le regaló.`,
      `${miles(diff)} de oro abajo de ${opp.champion}. Jugó la línea en modo donación.`,
      `${opp.champion} le sacó ${miles(diff)} de oro. A esta altura ya le debería mandar factura.`,
    ]);
  }
  if (opp && opp.cs - g.cs >= 40 && g.position !== 'UTILITY') {
    const diff = opp.cs - g.cs;
    add(diff / 15, [
      `Farmeó ${diff} súbditos menos que su rival. Los dejaba pasar por lástima.`,
      `${diff} de CS abajo de ${opp.champion}. Los súbditos llegaban a su torre y él los saludaba.`,
      `${diff} súbditos menos que ${opp.champion}. Vegetariano estricto: no toca ni un minion.`,
    ]);
  }
  if (opp && opp.score != null && opp.score - g.score >= 3) {
    add((opp.score - g.score) * 1.2, [
      `${opp.champion} hizo ${fmt(opp.score)} de score y él ${fmt(g.score)}. No fue una línea, fue una clase particular.`,
      `Su rival terminó con ${fmt(opp.score)} de score contra su ${fmt(g.score)}. ${opp.champion} debería cobrarle la clase.`,
      `${fmt(opp.score)} contra ${fmt(g.score)} de score. ${opp.champion} jugó contra un bot y ni se enteró.`,
      `${opp.champion} lo usó de escalón: ${fmt(opp.score)} de score contra ${fmt(g.score)}.`,
      `${fmt(opp.score)} de score para ${opp.champion}, ${fmt(g.score)} para él. Una paliza con nombre y apellido.`,
      `${opp.champion} sacó ${fmt(opp.score)} de score; él, ${fmt(g.score)}. Se notaba quién vino a jugar.`,
      `Entre ${opp.champion} (${fmt(opp.score)}) y él (${fmt(g.score)}) hubo más distancia que entre las dos bases.`,
    ]);
  }
  if (g.place >= 8) {
    add(g.place - 4, [
      `Terminó ${g.place}° de 10 jugadores. Hubo gente con peor internet que jugó mejor.`,
      `Puesto ${g.place} de 10 en su propia partida. El podio lo vio con binoculares.`,
      `${g.place}° de 10. Ni el que se fue AFK en el minuto 5 de otra partida lo hubiera hecho peor.`,
      `Terminó ${g.place}° de 10. Si hubiera un puesto 11, también se lo disputaba.`,
    ]);
  }
  if (g.dmgShare != null && g.dmgShare < 0.15 && g.position !== 'UTILITY') {
    add((0.2 - g.dmgShare) * 40, [
      `Hizo el ${Math.round(100 * g.dmgShare)}% del daño de su equipo. Pegaba con una pluma.`,
      `Con ${miles(g.damage ?? 0)} de daño en ${g.minutes} minutos, el support le hacía la competencia.`,
      `${Math.round(100 * g.dmgShare)}% del daño del equipo. Los enemigos ni se dieron cuenta de que estaba.`,
    ]);
  }
  if (g.kp != null && g.kp < 0.35) {
    add((0.45 - g.kp) * 20, [
      `Estuvo en el ${Math.round(100 * g.kp)}% de las kills del equipo. El resto del tiempo, de turismo.`,
      `Participó en el ${Math.round(100 * g.kp)}% de las peleas. Las demás las miró desde la base.`,
      `${Math.round(100 * g.kp)}% de participación en kills. El equipo peleaba 4 contra 5 y él farmeaba recuerdos.`,
    ]);
  }
  if (g.vision != null && g.vision / Math.max(1, g.minutes) < 0.5) {
    add(2, [
      `${g.vision} de visión en ${g.minutes} minutos. Jugó toda la partida con los ojos cerrados.`,
      `Puso tan pocos wards que el mapa para él era una pantalla negra.`,
      `${g.vision} de visión en ${g.minutes} minutos. Los wards los guardaba para una ocasión especial.`,
    ]);
  }
  if (g.kills + g.assists <= 3 && g.deaths >= 5) {
    add(4, [
      `${g.kills}/${g.deaths}/${g.assists}: más muertes que todo lo demás junto.`,
      `Un ${g.kills}/${g.deaths}/${g.assists} que no se olvida fácil.`,
      `${g.kills}/${g.deaths}/${g.assists}. Ese KDA se lee mejor de atrás para adelante.`,
    ]);
  }

  facts.sort((a, b) => b.weight - a.weight);
  // The three worst facts; if a fact's phrasings are all taken by other roasts, use the next fact.
  const body = [];
  for (const [i, f] of facts.entries()) {
    if (body.length === 3) break;
    const line = pick(f.lines, seed, i + 1, used, norm, true);
    if (line) body.push(line);
  }
  if (!body.length) {
    body.push(`Score de ${fmt(g.score)}: ni para el highlight ni para el reporte. Una partida que no le importó a nadie.`);
  }

  const intro = pick([
    `El ${date} agarró ${g.champion}${role ? ` de ${role}` : ''}${opp ? ` contra ${opp.champion}` : ''} y pasó lo que tenía que pasar.`,
    `Hay que hablar del ${date}. ${g.champion}${opp ? ` contra ${opp.champion}` : ''}${role ? `, en ${role}` : ''}. Siéntense.`,
    `${g.champion}${opp ? ` vs ${opp.champion}` : ''}, ${date}. La partida que el replay quisiera borrar.`,
    `Volvamos al ${date}: ${g.champion}${opp ? ` contra ${opp.champion}` : ''}. Pongan música triste.`,
    `${date}. ${g.champion}${role ? ` ${role}` : ''}${opp ? ` vs ${opp.champion}` : ''}. Lo que sigue es difícil de leer.`,
    `Capítulo del ${date}: ${g.champion}${opp ? ` contra ${opp.champion}` : ''}. Spoiler: sale mal.`,
    `Que alguien guarde el replay del ${date}. ${g.champion}${opp ? ` vs ${opp.champion}` : ''}, evidencia A.`,
  ], seed, 0, used, norm);

  const ending = g.win
    ? pick([
        'Y lo peor: ganaron igual. El equipo lo cargó como a un trofeo de participación.',
        'Ganaron, sí. Los otros cuatro todavía esperan que les agradezca.',
        'Ganaron igual. Fue el pasajero más caro de la historia de LAN.',
      ], seed, 7, used, norm)
    : pick([
        `Derrota en ${g.minutes} minutos. La Grieta no olvida.`,
        `Perdieron en ${g.minutes} minutos y nadie se sorprendió.`,
        'Derrota. Se recomienda desinstalar, tomar agua y pensar en lo que hizo.',
        `Derrota en ${g.minutes} minutos. Riot ya está usando el replay como tutorial de qué no hacer.`,
        'Derrota. El reporte de la partida debería venir con un pésame.',
        `Perdieron en ${g.minutes} minutos. Los compañeros todavía están en terapia.`,
      ], seed, 7, used, norm);

  return {
    matchId: g.matchId,
    champion: g.champion,
    opponent: opp?.champion ?? null,
    kda: `${g.kills}/${g.deaths}/${g.assists}`,
    score: g.score,
    place: g.place,
    win: g.win,
    minutes: g.minutes,
    endTs: g.endTs,
    text: [intro, ...body, ending].join(' '),
  };
}
