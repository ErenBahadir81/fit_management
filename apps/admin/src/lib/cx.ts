/** Tiny class joiner — avoids pulling clsx into the bundle for one function. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
