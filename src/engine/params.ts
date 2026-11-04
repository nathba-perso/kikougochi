// Constantes du jeu. Copie fidèle de PARAMS dans kikougochi/regles/simulation.py :
// toute modification doit être faite des deux côtés (voir scripts/simulate.ts).
export const P = {
  dtMin: 5,                 // pas de simulation (minutes)
  // Satiété S
  S_decay_awake: 2.8, S_decay_sleep: 1.2,
  S_meal: 35, S_snack: 20, S_full: 85, S_snack_limit: 60,
  // Énergie E
  E_decay_awake: 6.0, E_gain_sleep: 9.0, E_collapse: 15,
  night: [23.0, 7.0] as [number, number], nap: [11.0, 13.0] as [number, number], jitter_min: 20,
  // Bonheur B
  B_rest: 40, B_tau: 24.0, B_pen_hungry: 4, B_pen_tired: 3, B_pen_angry: 4,
  // Agacement A
  A_decay_awake: 3.0, A_decay_sleep: 6.0, A_hungry: 6.0, A_tired: 5.0,
  A_wake: 12, A_spam: 6, A_refuse: 5,
  // Croissance
  g0: 2.75, G_sleep_bonus: 1.2, G_needs_penalty: 0.3,
  stages: [0, 200, 600, 1100, 1600], G_win: 2100,
  // Départ
  S_zero_hours: 24, A_max_hours: 2, A_max: 95,
  // Rancune R
  R_angry: 70, R_up: 1.0, R_down: 0.5, R_max: 72,
  // Bruit
  daily_noise: 0.10,
  // Rêve
  dream_B: 70, dream_p: 0.4,
  // Caca : 2 à 4 h après chaque repas (seulement réveillé), au plus 3 par terre
  poop_delay_min: 2, poop_delay_max: 4, poop_max: 3,
  B_pen_poop: 1, A_poop: 1, // par caca et par heure
  B_clean: 4,
  // Excitation X : le pip excite, le câlin calme ; trop excité, il ne s'endort pas et s'agace
  X_rest: 20, X_tau: 1.5, X_decay_sleep: 30,
  X_nosleep: 65, X_over: 85, A_over: 4,
  X_pip: 22, X_calin: -25, X_bisou: 5,
  E_pip: 1,
  // Bisou : il pardonne un peu (baisse la rancune)
  R_bisou: 3,
};

export const MEAL_WINDOWS: [number, number][] = [[7.5, 9.5], [19.5, 21.5]];
export const ACTIONS = ['nourrir', 'pip', 'calin', 'bisou', 'nettoyer'] as const;
export type Action = typeof ACTIONS[number];
