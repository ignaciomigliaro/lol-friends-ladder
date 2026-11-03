// League of Legends Season 14/15 Recommended Builds Engine
// Provides high-tier competitive item builds, skill orders, and runes for LoL champions.

export const BUILDS_CATALOG = {
  JarvanIV: {
    champion: 'Jarvan IV',
    role: 'JUNGLE',
    runes: { primary: 'Conquistador', secondary: 'Inspiración' },
    skillOrder: 'Q > E > W',
    starter: [
      { id: 1102, name: 'Cachorro Garramusgo' },
      { id: 2003, name: 'Poción de Vida' },
    ],
    core: [
      { id: 6692, name: 'Eclipse' },
      { id: 6610, name: 'Cielo Desgarrado' },
      { id: 3161, name: 'Lanza de Shojin' },
    ],
    boots: [
      { id: 3047, name: 'Punteras de Acero' },
      { id: 3111, name: 'Botas de Mercurio' },
    ],
    situational: [
      { id: 3053, name: 'Calibrador de Sterak' },
      { id: 3075, name: 'Malla de Espinas' },
      { id: 3156, name: 'Fauces de Malmortius' },
      { id: 6665, name: "Jak'Sho el Proteico" },
    ],
    tips: 'Inicia los ganks con combo E+Q para derribar y aplicar daño de armadura reducida. Atrapa a los carries con Cataclismo (R).',
  },
  Warwick: {
    champion: 'Warwick',
    role: 'JUNGLE',
    runes: { primary: 'Compás Letal', secondary: 'Valor' },
    skillOrder: 'W > Q > E',
    starter: [
      { id: 1101, name: 'Cría de Brincamontes' },
      { id: 2003, name: 'Poción de Vida' },
    ],
    core: [
      { id: 3748, name: 'Hidra Titánica' },
      { id: 3153, name: 'Espada del Rey Arruinado' },
      { id: 6665, name: "Jak'Sho el Proteico" },
    ],
    boots: [
      { id: 3047, name: 'Punteras de Acero' },
      { id: 3111, name: 'Botas de Mercurio' },
    ],
    situational: [
      { id: 3075, name: 'Malla de Espinas' },
      { id: 6664, name: 'Torreón de Kaenic' },
      { id: 3068, name: 'Égida de Fuego Solar' },
      { id: 3053, name: 'Calibrador de Sterak' },
    ],
    tips: 'Aprovecha el rastro de sangre de la W para gankear líneas bajas de vida. Mantén presionada la Q para colocarte a la espalda del rival.',
  },
  Malzahar: {
    champion: 'Malzahar',
    role: 'MID',
    runes: { primary: 'Cometa Arcano', secondary: 'Inspiración' },
    skillOrder: 'E > Q > W',
    starter: [
      { id: 1056, name: "Anillo de Doran" },
      { id: 2003, name: 'Poción de Vida' },
    ],
    core: [
      { id: 3118, name: 'Malignidad' },
      { id: 3116, name: 'Cetro de Cristal de Rylai' },
      { id: 6653, name: 'Tormento de Liandry' },
    ],
    boots: [
      { id: 3020, name: 'Zapatos del Hechicero' },
      { id: 3158, name: 'Botas Jonias de Lucidez' },
    ],
    situational: [
      { id: 3135, name: 'Báculo del Vacío' },
      { id: 3157, name: "Reloj de Arena de Zhonya" },
      { id: 3089, name: 'Sombrero Mortal de Rabadon' },
      { id: 3102, name: 'Velo del Hada de la Muerte' },
    ],
    tips: 'Empuja oleadas sin cesar con E + W. En peleas grupales, guarda tu R (Agarre Abisal) para anular al asesino enemigo o al carry con más ventaja.',
  },
  LeBlanc: {
    champion: 'LeBlanc',
    role: 'MID',
    runes: { primary: 'Electrocutar', secondary: 'Brujería' },
    skillOrder: 'W > Q > E',
    starter: [
      { id: 1056, name: "Anillo de Doran" },
      { id: 2003, name: 'Poción de Vida' },
    ],
    core: [
      { id: 6655, name: "Compañero de Luden" },
      { id: 4645, name: 'Llama Sombría' },
      { id: 3089, name: 'Sombrero Mortal de Rabadon' },
    ],
    boots: [
      { id: 3020, name: 'Zapatos del Hechicero' },
    ],
    situational: [
      { id: 3157, name: "Reloj de Arena de Zhonya" },
      { id: 3135, name: 'Báculo del Vacío' },
      { id: 4629, name: 'Impulso Cósmico' },
    ],
    tips: 'Aprovecha las ventanas de trade con Q + W + Autoataque para detonar Electrocutar. Salta muros con W para emboscar desde la niebla de guerra.',
  },
  Vi: {
    champion: 'Vi',
    role: 'JUNGLE',
    runes: { primary: 'Conquistador', secondary: 'Inspiración' },
    skillOrder: 'Q > E > W',
    starter: [
      { id: 1102, name: 'Cachorro Garramusgo' },
      { id: 2003, name: 'Poción de Vida' },
    ],
    core: [
      { id: 6610, name: 'Cielo Desgarrado' },
      { id: 3078, name: 'Fuerza de la Trinidad' },
      { id: 3053, name: 'Calibrador de Sterak' },
    ],
    boots: [
      { id: 3047, name: 'Punteras de Acero' },
      { id: 3111, name: 'Botas de Mercurio' },
    ],
    situational: [
      { id: 3071, name: 'Cuchilla Oscura' },
      { id: 6333, name: 'Baile de la Muerte' },
      { id: 3156, name: 'Fauces de Malmortius' },
      { id: 6665, name: "Jak'Sho el Proteico" },
    ],
    tips: 'Carga la Q fuera de visión enemiga para un engage certero. Usa tu R directamente contra el tirador o mago enemigo sin posibilidad de escape.',
  },
  Mordekaiser: {
    champion: 'Mordekaiser',
    role: 'TOP',
    runes: { primary: 'Conquistador', secondary: 'Valor' },
    skillOrder: 'Q > E > W',
    starter: [
      { id: 1054, name: "Escudo de Doran" },
      { id: 2003, name: 'Poción de Vida' },
    ],
    core: [
      { id: 3116, name: 'Cetro de Cristal de Rylai' },
      { id: 4633, name: 'Creagrietas' },
      { id: 6653, name: 'Tormento de Liandry' },
    ],
    boots: [
      { id: 3047, name: 'Punteras de Acero' },
      { id: 3111, name: 'Botas de Mercurio' },
    ],
    situational: [
      { id: 6665, name: "Jak'Sho el Proteico" },
      { id: 3075, name: 'Malla de Espinas' },
      { id: 6664, name: 'Torreón de Kaenic' },
      { id: 3157, name: "Reloj de Arena de Zhonya" },
    ],
    tips: 'Rylai garantiza que nadie escape de tu pasiva Vórtice de Oscuridad. En peleas, aísla al jungla rival con R para asegurar Dragones o Barón.',
  },
  Caitlyn: {
    champion: 'Caitlyn',
    role: 'BOTTOM',
    runes: { primary: 'Cadencia Letal', secondary: 'Dominación' },
    skillOrder: 'Q > W > E',
    starter: [
      { id: 1055, name: "Espada de Doran" },
      { id: 2003, name: 'Poción de Vida' },
    ],
    core: [
      { id: 6676, name: 'El Coleccionista' },
      { id: 3031, name: 'Filo del Infinito' },
      { id: 3094, name: 'Cañón de Fuego Rápido' },
    ],
    boots: [
      { id: 3006, name: 'Grebas de Berserker' },
    ],
    situational: [
      { id: 3036, name: 'Recuerdos de Lord Dominik' },
      { id: 3072, name: 'Sanguinaria' },
      { id: 3026, name: 'Ángel Guardián' },
    ],
    tips: 'Coloca trampas (W) en los cuellos de botella de la jungla y debajo de torres enemigas bajo asedio. Guarda la red (E) para escapar de engages.',
  },
  Tristana: {
    champion: 'Tristana',
    role: 'BOTTOM',
    runes: { primary: 'Lluvia de Espadas', secondary: 'Precisión' },
    skillOrder: 'E > Q > W',
    starter: [
      { id: 1055, name: "Espada de Doran" },
      { id: 2003, name: 'Poción de Vida' },
    ],
    core: [
      { id: 6672, name: 'Verdugo de Krakens' },
      { id: 3046, name: 'Bailarín Espectral' },
      { id: 3031, name: 'Filo del Infinito' },
    ],
    boots: [
      { id: 3006, name: 'Grebas de Berserker' },
    ],
    situational: [
      { id: 3036, name: 'Recuerdos de Lord Dominik' },
      { id: 3072, name: 'Sanguinaria' },
      { id: 3026, name: 'Ángel Guardián' },
    ],
    tips: 'Detona las 4 cargas de la E para reiniciar el enfriamiento del salto (W) y poder reposicionarte o rematar a los rivales.',
  },
  Thresh: {
    champion: 'Thresh',
    role: 'UTILITY',
    runes: { primary: 'Reverberacción', secondary: 'Inspiración' },
    skillOrder: 'Q > W > E',
    starter: [
      { id: 3865, name: 'Atlas Mundial' },
      { id: 2003, name: 'Poción de Vida' },
    ],
    core: [
      { id: 3876, name: 'Oposición Celestial' },
      { id: 3190, name: 'Relicario de los Solari' },
      { id: 3109, name: 'Voto del Caballero' },
    ],
    boots: [
      { id: 3009, name: 'Botas de Rapidez' },
      { id: 3047, name: 'Punteras de Acero' },
    ],
    situational: [
      { id: 3075, name: 'Malla de Espinas' },
      { id: 3110, name: 'Corazón de Hielo' },
      { id: 3107, name: 'Redención' },
    ],
    tips: 'Lanza la linterna (W) para rescatar a tu tirador o para permitir que tu jungla entre al gank desde larga distancia.',
  },
  Leona: {
    champion: 'Leona',
    role: 'UTILITY',
    runes: { primary: 'Reverberacción', secondary: 'Inspiración' },
    skillOrder: 'W > E > Q',
    starter: [
      { id: 3865, name: 'Atlas Mundial' },
      { id: 2003, name: 'Poción de Vida' },
    ],
    core: [
      { id: 3869, name: 'Trineo del Solsticio' },
      { id: 3190, name: 'Relicario de los Solari' },
      { id: 3109, name: 'Voto del Caballero' },
    ],
    boots: [
      { id: 3047, name: 'Punteras de Acero' },
      { id: 3111, name: 'Botas de Mercurio' },
    ],
    situational: [
      { id: 3075, name: 'Malla de Espinas' },
      { id: 6665, name: "Jak'Sho el Proteico" },
      { id: 3110, name: 'Corazón de Hielo' },
    ],
    tips: 'Activa Eclipse (W) antes de conectar con Espada del Cénit (E) para mitigar el contraataque y aturdir con Q.',
  },
};

// Archetype generic builders for champions not explicitly mapped
export const ARCHETYPE_BUILDS = {
  FIGHTER: {
    role: 'TOP/JUNGLE',
    runes: { primary: 'Conquistador', secondary: 'Valor' },
    skillOrder: 'Q > E > W',
    starter: [
      { id: 1055, name: "Espada de Doran" },
      { id: 2003, name: 'Poción de Vida' },
    ],
    core: [
      { id: 3078, name: 'Fuerza de la Trinidad' },
      { id: 6610, name: 'Cielo Desgarrado' },
      { id: 3053, name: 'Calibrador de Sterak' },
    ],
    boots: [
      { id: 3047, name: 'Punteras de Acero' },
      { id: 3111, name: 'Botas de Mercurio' },
    ],
    situational: [
      { id: 3071, name: 'Cuchilla Oscura' },
      { id: 6333, name: 'Baile de la Muerte' },
      { id: 3156, name: 'Fauces de Malmortius' },
      { id: 6665, name: "Jak'Sho el Proteico" },
    ],
    tips: 'Prioriza trades cortos y extender peleas una vez que tus acumulaciones de Conquistador estén activas.',
  },
  MAGE: {
    role: 'MID',
    runes: { primary: 'Cometa Arcano', secondary: 'Inspiración' },
    skillOrder: 'Q > W > E',
    starter: [
      { id: 1056, name: "Anillo de Doran" },
      { id: 2003, name: 'Poción de Vida' },
    ],
    core: [
      { id: 6655, name: "Compañero de Luden" },
      { id: 4645, name: 'Llama Sombría' },
      { id: 3089, name: 'Sombrero Mortal de Rabadon' },
    ],
    boots: [
      { id: 3020, name: 'Zapatos del Hechicero' },
    ],
    situational: [
      { id: 3157, name: "Reloj de Arena de Zhonya" },
      { id: 3135, name: 'Báculo del Vacío' },
      { id: 6653, name: 'Tormento de Liandry' },
    ],
    tips: 'Mantén el rango defensivo y castiga con habilidades cada vez que el rival intente rematar súbditos.',
  },
  MARKSMAN: {
    role: 'BOTTOM',
    runes: { primary: 'Cadencia Letal', secondary: 'Inspiración' },
    skillOrder: 'Q > W > E',
    starter: [
      { id: 1055, name: "Espada de Doran" },
      { id: 2003, name: 'Poción de Vida' },
    ],
    core: [
      { id: 6672, name: 'Verdugo de Krakens' },
      { id: 3031, name: 'Filo del Infinito' },
      { id: 3046, name: 'Bailarín Espectral' },
    ],
    boots: [
      { id: 3006, name: 'Grebas de Berserker' },
    ],
    situational: [
      { id: 3036, name: 'Recuerdos de Lord Dominik' },
      { id: 3072, name: 'Sanguinaria' },
      { id: 3026, name: 'Ángel Guardián' },
    ],
    tips: 'Asegura oro con farmeo limpio y prioriza golpear al objetivo más cercano que no comprometa tu posición.',
  },
  TANK: {
    role: 'TOP/SUPPORT',
    runes: { primary: 'Garras del Inmortal', secondary: 'Inspiración' },
    skillOrder: 'Q > W > E',
    starter: [
      { id: 1054, name: "Escudo de Doran" },
      { id: 2003, name: 'Poción de Vida' },
    ],
    core: [
      { id: 3068, name: 'Égida de Fuego Solar' },
      { id: 3084, name: 'Corazón de Acero' },
      { id: 6665, name: "Jak'Sho el Proteico" },
    ],
    boots: [
      { id: 3047, name: 'Punteras de Acero' },
      { id: 3111, name: 'Botas de Mercurio' },
    ],
    situational: [
      { id: 3075, name: 'Malla de Espinas' },
      { id: 6664, name: 'Torreón de Kaenic' },
      { id: 3083, name: 'Armadura de Warmog' },
    ],
    tips: 'Absorbe daño en la línea frontal e interrumpe las habilidades canalizadas del equipo contrario.',
  },
  SUPPORT: {
    role: 'UTILITY',
    runes: { primary: 'Reverberacción', secondary: 'Inspiración' },
    skillOrder: 'Q > W > E',
    starter: [
      { id: 3865, name: 'Atlas Mundial' },
      { id: 2003, name: 'Poción de Vida' },
    ],
    core: [
      { id: 3190, name: 'Relicario de los Solari' },
      { id: 3109, name: 'Voto del Caballero' },
      { id: 3107, name: 'Redención' },
    ],
    boots: [
      { id: 3047, name: 'Punteras de Acero' },
      { id: 3158, name: 'Botas Jonias de Lucidez' },
    ],
    situational: [
      { id: 3075, name: 'Malla de Espinas' },
      { id: 3110, name: 'Corazón de Hielo' },
      { id: 6664, name: 'Torreón de Kaenic' },
    ],
    tips: 'Controla la visión de los objetivos neutros antes de que aparezcan (Dragón/Barón) con centinelas de control.',
  },
};

// Resolves the best build for a champion
export function getChampionBuild(championName) {
  if (!championName) return null;
  const cleanName = championName.replace(/[^a-zA-Z0-9]/g, '');

  // Exact match in catalog
  for (const [key, build] of Object.entries(BUILDS_CATALOG)) {
    if (key.toLowerCase() === cleanName.toLowerCase()) {
      return build;
    }
  }

  // Guess archetype based on champion traits
  const tanks = ['Malphite', 'ChoGath', 'Sion', 'Ornn', 'Shen', 'Maokai', 'Sejuani', 'Zac', 'Rammus', 'TahmKench'];
  const mages = ['Syndra', 'Diana', 'Lux', 'Ahri', 'Orianna', 'Viktor', 'Vex', 'Veigar', 'Hwei', 'AurelionSol', 'Zoe', 'Xerath', 'Anivia'];
  const marksmen = ['Jinx', 'KogMaw', 'Lucian', 'KaiSa', 'Xayah', 'Ashe', 'Vayne', 'Jhin', 'Sivir', 'Ezreal', 'Draven', 'MissFortune', 'Smolder'];
  const supports = ['Braum', 'Nautilus', 'Pyke', 'Nami', 'Lulu', 'Janna', 'Soraka', 'Sona', 'Rell', 'Blitzcrank', 'Taric', 'Miliod'];

  let archetype = ARCHETYPE_BUILDS.FIGHTER;
  if (tanks.some((t) => t.toLowerCase() === cleanName.toLowerCase())) archetype = ARCHETYPE_BUILDS.TANK;
  else if (mages.some((m) => m.toLowerCase() === cleanName.toLowerCase())) archetype = ARCHETYPE_BUILDS.MAGE;
  else if (marksmen.some((m) => m.toLowerCase() === cleanName.toLowerCase())) archetype = ARCHETYPE_BUILDS.MARKSMAN;
  else if (supports.some((s) => s.toLowerCase() === cleanName.toLowerCase())) archetype = ARCHETYPE_BUILDS.SUPPORT;

  return {
    ...archetype,
    champion: championName,
  };
}
