/**
 * Food-101 label set (the classes the vision service's classifier emits) plus the Turkish display
 * names used everywhere in the UI, and the TurkishFoods-25 label set for the optional Turkish head.
 *
 * These are *labels*, not nutrition: the per-100 g values live in
 * `apps/api/src/modules/nutrition/seed/foods.food101.json`, joined on the label (which is also the
 * food's search alias, so mapping a detection to a food is a dictionary lookup).
 */

/** label → Turkish display name. Keys are the raw snake_case model labels, in Food-101 order. */
export const FOOD101_TR: Readonly<Record<string, string>> = {
  apple_pie: "Elmalı turta",
  baby_back_ribs: "Barbekü kaburga",
  baklava: "Baklava",
  beef_carpaccio: "Dana karpaçyo",
  beef_tartare: "Dana tartar",
  beet_salad: "Pancar salatası",
  beignets: "Beignet",
  bibimbap: "Bibimbap",
  bread_pudding: "Ekmek pudingi",
  breakfast_burrito: "Kahvaltı burrito",
  bruschetta: "Bruschetta",
  caesar_salad: "Sezar salata",
  cannoli: "Cannoli",
  caprese_salad: "Caprese salata",
  carrot_cake: "Havuçlu kek",
  ceviche: "Ceviche",
  cheesecake: "Cheesecake",
  cheese_plate: "Peynir tabağı",
  chicken_curry: "Köri soslu tavuk",
  chicken_quesadilla: "Tavuklu quesadilla",
  chicken_wings: "Tavuk kanadı",
  chocolate_cake: "Çikolatalı kek",
  chocolate_mousse: "Çikolatalı mus",
  churros: "Churros",
  clam_chowder: "Deniz tarağı çorbası",
  club_sandwich: "Club sandviç",
  crab_cakes: "Yengeç köftesi",
  creme_brulee: "Crème brûlée",
  croque_madame: "Croque madame",
  cup_cakes: "Cupcake",
  deviled_eggs: "Dolgulu yumurta",
  donuts: "Donut",
  dumplings: "Dumpling",
  edamame: "Edamame",
  eggs_benedict: "Benedict yumurta",
  escargots: "Salyangoz",
  falafel: "Falafel",
  filet_mignon: "Bonfile",
  fish_and_chips: "Balık ve patates kızartması",
  foie_gras: "Kaz ciğeri ezmesi",
  french_fries: "Patates kızartması",
  french_onion_soup: "Fransız soğan çorbası",
  french_toast: "Fransız tostu",
  fried_calamari: "Kalamar tava",
  fried_rice: "Kızarmış pilav",
  frozen_yogurt: "Donmuş yoğurt",
  garlic_bread: "Sarımsaklı ekmek",
  gnocchi: "Gnocchi",
  greek_salad: "Yunan salatası",
  grilled_cheese_sandwich: "Kaşarlı tost",
  grilled_salmon: "Izgara somon",
  guacamole: "Guacamole",
  gyoza: "Gyoza",
  hamburger: "Hamburger",
  hot_and_sour_soup: "Acı ekşi çorba",
  hot_dog: "Sosisli sandviç",
  huevos_rancheros: "Meksika usulü yumurta",
  hummus: "Humus",
  ice_cream: "Dondurma",
  lasagna: "Lazanya",
  lobster_bisque: "Istakoz çorbası",
  lobster_roll_sandwich: "Istakozlu sandviç",
  macaroni_and_cheese: "Peynirli makarna",
  macarons: "Makaron",
  miso_soup: "Miso çorbası",
  mussels: "Midye",
  nachos: "Nachos",
  omelette: "Omlet",
  onion_rings: "Soğan halkası",
  oysters: "İstiridye",
  pad_thai: "Pad thai",
  paella: "Paella",
  pancakes: "Pankek",
  panna_cotta: "Panna cotta",
  peking_duck: "Pekin ördeği",
  pho: "Pho",
  pizza: "Pizza",
  pork_chop: "Domuz pirzolası",
  poutine: "Poutine",
  prime_rib: "Kaburga rosto",
  pulled_pork_sandwich: "Didilmiş et sandviçi",
  ramen: "Ramen",
  ravioli: "Ravioli",
  red_velvet_cake: "Red velvet kek",
  risotto: "Risotto",
  samosa: "Samosa",
  sashimi: "Sashimi",
  scallops: "Deniz tarağı",
  seaweed_salad: "Deniz yosunu salatası",
  shrimp_and_grits: "Karidesli mısır lapası",
  spaghetti_bolognese: "Bolonez soslu spagetti",
  spaghetti_carbonara: "Karbonara spagetti",
  spring_rolls: "Bahar rulosu",
  steak: "Biftek",
  strawberry_shortcake: "Çilekli pasta",
  sushi: "Suşi",
  tacos: "Tako",
  takoyaki: "Takoyaki",
  tiramisu: "Tiramisu",
  tuna_tartare: "Ton balığı tartar",
  waffles: "Waffle",
};

/** The 101 raw labels, in the canonical Food-101 order. */
export const FOOD101_LABELS: readonly string[] = Object.freeze(Object.keys(FOOD101_TR));

/** TurkishFoods-25 labels (optional Turkish head) → Turkish display name. */
export const TURKISH25_TR: Readonly<Record<string, string>> = {
  adana_kebab: "Adana kebap",
  baklava: "Baklava",
  borek: "Börek",
  cig_kofte: "Çiğ köfte",
  doner: "Döner",
  gozleme: "Gözleme",
  hamsi: "Hamsi",
  imam_bayildi: "İmam bayıldı",
  iskender: "İskender",
  karniyarik: "Karnıyarık",
  kofte: "Köfte",
  kumpir: "Kumpir",
  kuru_fasulye: "Kuru fasulye",
  lahmacun: "Lahmacun",
  lokum: "Lokum",
  manti: "Mantı",
  menemen: "Menemen",
  mercimek_corbasi: "Mercimek çorbası",
  pide: "Pide",
  pilav: "Pilav",
  simit: "Simit",
  sarma: "Sarma",
  sucuk: "Sucuk",
  tavuk_sis: "Tavuk şiş",
  yaprak_sarma: "Yaprak sarma",
};

export const TURKISH25_LABELS: readonly string[] = Object.freeze(Object.keys(TURKISH25_TR));

/** Turkish display name for any known vision label (Food-101 or TurkishFoods-25). */
export function labelTr(label: string): string | null {
  const key = String(label ?? "").trim().toLowerCase();
  return FOOD101_TR[key] ?? TURKISH25_TR[key] ?? null;
}

/** Human-readable fallback for an unknown label: `hot_and_sour_soup` → `Hot and sour soup`. */
export function labelToTitle(label: string): string {
  const words = String(label ?? "").replace(/_/g, " ").trim();
  return words === "" ? "" : words.charAt(0).toUpperCase() + words.slice(1);
}

export function isFood101Label(label: string): boolean {
  return Object.hasOwn(FOOD101_TR, String(label ?? "").toLowerCase());
}
