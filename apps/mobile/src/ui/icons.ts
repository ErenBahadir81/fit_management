/**
 * The semantic icon layer.
 *
 * Screens name a *concept* (`goal`, `weighIn`, `rest`), never a glyph. That is what keeps the set
 * coherent: one place decides that a streak is a flame and a rest day is a bed, so the same idea
 * never shows up as two different pictures on two different screens.
 *
 * One visual weight, enforced by `__tests__/ui/icons.test.tsx`: every glyph is an Ionicons
 * **outline**, and the filled twin is reserved for a single job — the tab you are standing on.
 */
// The family file, not the package index: the index pulls every glyph map (~15 families) into the bundle.
import type Ionicons from "@expo/vector-icons/Ionicons";

/** A raw Ionicons glyph. Prefer an `AppIcon` concept. */
export type IconName = keyof typeof Ionicons.glyphMap;

export interface IconSpec {
  /** Outline glyph. The default everywhere. */
  name: IconName;
  /** Filled twin. Only the active tab is allowed to use it. */
  active: IconName;
}

/** `flag-outline` → `{ name: "flag-outline", active: "flag" }`. */
function outline(name: IconName & `${string}-outline`): IconSpec {
  return { name, active: name.slice(0, -"-outline".length) as IconName };
}

export const APP_ICONS = {
  /* --- the five tabs ------------------------------------------------------ */
  home: outline("home-outline"),
  program: outline("barbell-outline"),
  nutrition: outline("nutrition-outline"),
  body: outline("body-outline"),
  profile: outline("person-outline"),

  /* --- the goal ----------------------------------------------------------- */
  goal: outline("flag-outline"),
  roadmap: outline("map-outline"),
  milestone: outline("location-outline"),
  pace: outline("speedometer-outline"),
  /** Intent: shed fat. */
  lose: outline("trending-down-outline"),
  /** Intent: hold the line. */
  maintain: outline("swap-horizontal-outline"),
  /** Intent: build. */
  gain: outline("trending-up-outline"),
  eta: outline("hourglass-outline"),
  progress: outline("analytics-outline"),

  /* --- the body ----------------------------------------------------------- */
  weighIn: outline("scale-outline"),
  measure: outline("resize-outline"),
  height: outline("resize-outline"),
  gender: outline("male-female-outline"),
  birthday: outline("calendar-number-outline"),
  activity: outline("walk-outline"),
  trend: outline("pulse-outline"),

  /* --- food --------------------------------------------------------------- */
  meal: outline("restaurant-outline"),
  calories: outline("flame-outline"),
  protein: outline("egg-outline"),
  carbs: outline("leaf-outline"),
  fat: outline("water-outline"),
  energy: outline("calculator-outline"),
  deficit: outline("trending-down-outline"),
  scan: outline("scan-outline"),
  /** An AI/estimated number rather than a measured one. */
  estimate: outline("flask-outline"),
  /** Result that came from the online food database. */
  online: outline("globe-outline"),
  barcode: outline("barcode-outline"),
  photo: outline("images-outline"),
  camera: outline("camera-outline"),

  /* --- training ----------------------------------------------------------- */
  workout: outline("barbell-outline"),
  rest: outline("bed-outline"),
  streak: outline("bonfire-outline"),
  recovery: outline("fitness-outline"),
  skip: outline("play-skip-forward-outline"),
  start: outline("play-outline"),
  duration: outline("time-outline"),
  volume: outline("layers-outline"),
  /** One logged set. Same picture as volume — a set *is* the unit volume is counted in. */
  sets: outline("layers-outline"),
  /** The list of movements in a day. */
  exercises: outline("list-outline"),
  /** Day kinds, so a Push day and a swim day never swap pictures between screens. */
  strength: outline("barbell-outline"),
  run: outline("walk-outline"),
  swim: outline("water-outline"),
  stretch: outline("body-outline"),
  /** Kilometres covered. */
  distance: outline("navigate-outline"),
  /** Free-text the user wrote about a session. */
  notes: outline("reader-outline"),
  /** Drag-to-reorder affordance. */
  reorder: outline("swap-vertical-outline"),

  /* --- account ------------------------------------------------------------ */
  username: outline("person-outline"),
  password: outline("lock-closed-outline"),
  displayName: outline("person-circle-outline"),
  email: outline("mail-outline"),
  logout: outline("log-out-outline"),
  theme: outline("contrast-outline"),
  mascot: outline("happy-outline"),
  settings: outline("options-outline"),
  demo: outline("sparkles-outline"),

  /* --- reporting ---------------------------------------------------------- */
  report: outline("newspaper-outline"),
  chart: outline("bar-chart-outline"),
  calendar: outline("calendar-outline"),
  today: outline("today-outline"),
  recent: outline("time-outline"),
  award: outline("trophy-outline"),

  /* --- plumbing ----------------------------------------------------------- */
  add: outline("add-outline"),
  minus: outline("remove-outline"),
  edit: outline("create-outline"),
  delete: outline("trash-outline"),
  close: outline("close-outline"),
  back: outline("chevron-back-outline"),
  forward: outline("chevron-forward-outline"),
  expand: outline("chevron-down-outline"),
  next: outline("arrow-forward-outline"),
  previous: outline("arrow-back-outline"),
  undo: outline("arrow-undo-outline"),
  more: outline("ellipsis-horizontal-outline"),
  refresh: outline("refresh-outline"),
  search: outline("search-outline"),
  check: outline("checkmark-outline"),
  done: outline("checkmark-circle-outline"),
  warning: outline("alert-circle-outline"),
  info: outline("information-circle-outline"),
  tip: outline("bulb-outline"),
  privacy: outline("shield-checkmark-outline"),
} as const satisfies Record<string, IconSpec>;

export type AppIcon = keyof typeof APP_ICONS;

/** Every concept name, for exhaustiveness checks. */
export const APP_ICON_NAMES = Object.keys(APP_ICONS) as AppIcon[];

/** The glyph for a concept. `active` gives the filled twin — the tab bar is its only caller. */
export function glyphFor(icon: AppIcon, active = false): IconName {
  const spec = APP_ICONS[icon];
  return active ? spec.active : spec.name;
}

/**
 * What the composite primitives (`Button`, `Chip`, `ListRow`, …) accept for their `icon` prop:
 * a concept, or a raw glyph for the rare thing the vocabulary has no word for yet.
 */
export type IconGlyph = AppIcon | IconName;

const isAppIcon = (v: IconGlyph): v is AppIcon => v in APP_ICONS;

/** Concept first, raw glyph as the fallback. */
export function resolveGlyph(icon: IconGlyph, active = false): IconName {
  return isAppIcon(icon) ? glyphFor(icon, active) : icon;
}
