// Curated from the Ministry of Sports' "全國運動場館資訊" open dataset
// (dataset 22849, updated 2026-01-22; Government Open Data License v1.0).
// Keeping this small, official subset in the Worker avoids making visitors wait
// on a third-party geocoder for a well-known nationwide facility category.
export type NationalSportsCenter = { name: string; address: string };

const NATIONAL_SPORTS_CENTERS: NationalSportsCenter[] = [
  { name: "中壢國民運動中心", address: "桃園市中壢區三光路350號" },
  { name: "桃園國民運動中心", address: "桃園市桃園區中山東路233號" },
  { name: "平鎮國民運動中心", address: "桃園市平鎮區中庸路18號" },
  { name: "桃園市蘆竹國民運動中心", address: "桃園市蘆竹區仁愛路一段49號" },
  { name: "三重國民運動中心", address: "新北市三重區集美街55號" },
  { name: "三峽國民運動中心", address: "新北市三峽區文化路210巷12號" },
  { name: "土城國民運動中心", address: "新北市土城區金城路二段247-1號" },
  { name: "中和國民運動中心", address: "新北市中和區錦和路350-1、2號" },
  { name: "五股國民運動中心", address: "新北市五股區成泰路三段296號" },
  { name: "永和國民運動中心", address: "新北市永和區永利路250號" },
  { name: "汐止國民運動中心", address: "新北市汐止區汐科路321號" },
  { name: "板橋國民運動中心", address: "新北市板橋區智樂路6號" },
  { name: "林口國民運動中心", address: "新北市林口區文化二路二段299號" },
  { name: "泰山國民運動中心", address: "新北市泰山區全興路167號" },
  { name: "淡水國民運動中心", address: "新北市淡水區中山北路二段381巷2號" },
  { name: "新莊國民運動中心", address: "新北市新莊區公園路11號" },
  { name: "樹林國民運動中心", address: "新北市樹林區中正路188-6號" },
  { name: "蘆洲國民運動中心", address: "新北市蘆洲區長樂路235-1號" },
  { name: "鶯歌國民運動中心", address: "新北市鶯歌區館前路250號" },
  { name: "基隆市國民運動中心", address: "基隆市仁愛區獅球路8-1號" },
  { name: "宜蘭國民運動中心", address: "宜蘭縣宜蘭市公園路66號" },
  { name: "新竹市立竹光國民運動中心", address: "新竹市北區竹光路325號" },
  { name: "新竹市立新科國民運動中心", address: "新竹市東區光復路一段89巷90號" },
  { name: "新竹縣竹北國民運動中心", address: "新竹縣竹北市莊敬南路18號" },
  { name: "臺中市朝馬國民運動中心", address: "臺中市西屯區朝貴路199號" },
  { name: "臺中市北區國民運動中心", address: "臺中市北區崇德路一段55號" },
  { name: "臺中市南屯國民運動中心", address: "臺中市南屯區黎明路一段998號" },
  { name: "彰化縣彰北國民運動中心", address: "彰化縣彰化市建國東路2號" },
  { name: "前金國民運動中心", address: "高雄市前金區大同二路61號" },
  { name: "永華國民運動中心", address: "臺南市中西區中華西路二段30號" },
  { name: "屏東市國民運動中心", address: "屏東縣屏東市勝利東路48號" },
];

function compact(value: string) {
  return value.normalize("NFKC").replaceAll("臺", "台").replace(/\s+/g, "");
}

function matchesCenter(center: NationalSportsCenter, query: string) {
  const name = compact(center.name);
  const address = compact(center.address);
  if (name.includes(query) || address.includes(query)) return true;
  // Match omitted words such as 「桃園運動中心」 -> 「桃園國民運動中心」.
  if (query.endsWith("運動中心")) {
    const prefix = query.slice(0, -"運動中心".length);
    return Boolean(prefix) && name.includes(prefix) && name.includes("運動中心");
  }
  return false;
}

export function nationalSportsCentersFor(query: string, maximum = 10) {
  const normalized = compact(query);
  if (normalized.length < 2 || !normalized.includes("運動")) return [];
  return NATIONAL_SPORTS_CENTERS.filter((center) => matchesCenter(center, normalized)).slice(0, maximum);
}
