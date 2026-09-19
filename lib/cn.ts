/** Winziger Ersatz fuer `clsx`/`classnames`, um keine zusaetzliche Dependency einzufuehren. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
