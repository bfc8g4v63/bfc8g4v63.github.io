function separateTaiwanAddress(query: string) {
  return query
    .replace(/[，,]/g, " ")
    .replace(/([縣市])(?=[^\s]*(?:區|鄉|鎮|市))/g, "$1 ")
    .replace(/([區鄉鎮里村路街段巷弄號])(?=[^\s])/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

function withoutMunicipality(query: string) {
  return query.replace(/^(?:臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|高雄市)\s*/, "");
}

export function locationSearchQueries(query: string) {
  const normalized = query.normalize("NFKC").replaceAll("巿", "市").replace(/\s+/g, " ").trim();
  const separated = separateTaiwanAddress(normalized);
  const isAddress = /[路街段巷弄號]/.test(normalized);
  const candidates = isAddress
    ? [separated, withoutMunicipality(separated), normalized]
    : [normalized, withoutMunicipality(normalized), separated];
  return [...new Set(candidates.filter((candidate) => candidate.length >= 2))];
}
