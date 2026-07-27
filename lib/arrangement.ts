export function arrangementNameKey(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .toLocaleLowerCase("en-US");
}
