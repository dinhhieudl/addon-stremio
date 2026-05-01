const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const fetch = require("node-fetch");

// ============================================================
// CONFIG
// ============================================================
const MONPLAY_BASE = "https://sm.manucn.dpdns.org";
const PORT = parseInt(process.env.PORT || "7000", 10);
const CACHE_TTL = 5 * 60 * 1000;

// ============================================================
// LEAGUE FILTER RULES
// ============================================================
const LEAGUES = [
  {
    id: "epl",
    name: "Premier League",
    priority: 1,
    keywords: [
      "arsenal", "chelsea", "liverpool", "manchester", "man city", "man utd",
      "tottenham", "spurs", "newcastle", "aston villa", "west ham",
      "brighton", "brentford", "crystal palace", "fulham", "wolves",
      "nottingham forest", "bournemouth", "everton", "burnley",
      "sheffield", "luton", "ipswich", "leicester",
      "ngoại hạng anh", "ngoai hang anh", "premier league", "epl",
      "english premier",
    ],
    exclude: [],
  },
  {
    id: "laliga",
    name: "La Liga",
    priority: 2,
    keywords: [
      "barcelona", "real madrid", "atletico", "athletic bilbao",
      "real sociedad", "real betis", "villarreal", "sevilla", "valencia",
      "celta vigo", "getafe", "osasuna", "mallorca", "las palmas",
      "girona", "alaves", "rayo vallecano", "cadiz", "almeria",
      "granada", "leganes", "valladolid", "espanyol",
      "la liga", "laliga", "liga espanola",
    ],
    exclude: [],
  },
  {
    id: "ucl",
    name: "Champions League",
    priority: 3,
    keywords: [
      "champions league", "ucl", "cúp c1", "cup c1",
      "european cup", "champions",
    ],
    exclude: ["europa league", "conference league"],
  },
  {
    id: "mls",
    name: "MLS",
    priority: 4,
    keywords: [
      "inter miami", "la galaxy", "la fc", "los angeles",
      "new york", "nycfc", "ny red bulls", "atlanta united",
      "seattle sounders", "portland timbers", "austin fc",
      "nashville sc", "charlotte fc", "st louis", "columbus crew",
      "fc cincinnati", "orlando city", "chicago fire", "dc united",
      "philadelphia union", "new england revolution", "toronto fc",
      "cf montreal", "vancouver whitecaps", "minnesota united",
      "real salt lake", "colorado rapids", "san jose earthquakes",
      "houston dynamo", "fc dallas", "sporting kansas city",
      "san diego fc",
      "mls", "major league soccer",
    ],
    exclude: [],
  },
];

// ============================================================
// CACHE
// ============================================================
let cachedCatalog = null;
let cacheTimestamp = 0;

// ============================================================
// FETCH & FILTER từ MonPlay
// ============================================================
async function fetchMatches() {
  const now = Date.now();
  if (cachedCatalog && now - cacheTimestamp < CACHE_TTL) {
    return cachedCatalog;
  }

  try {
    const res = await fetch(`${MONPLAY_BASE}/catalog/thethao/all.json`, {
      headers: { "User-Agent": "BongDaAddon/2.0" },
      timeout: 15000,
    });
    const data = await res.json();
    const all = data.metas || [];

    // Phân loại trận đấu theo giải
    const matched = [];

    for (const item of all) {
      const name = (item.name || "").toLowerCase();
      const id = (item.id || "").toLowerCase();
      const text = `${name} ${id}`;

      for (const league of LEAGUES) {
        // Check exclude trước
        const excluded = league.exclude.some((ex) => text.includes(ex));
        if (excluded) continue;

        // Check keywords
        const hit = league.keywords.some((kw) => text.includes(kw));
        if (hit) {
          matched.push({ ...item, _league: league });
          break; // chỉ match 1 giải
        }
      }
    }

    // Sắp xếp theo priority giải đấu, rồi theo thời gian
    matched.sort((a, b) => {
      if (a._league.priority !== b._league.priority)
        return a._league.priority - b._league.priority;
      return extractTime(a.name).localeCompare(extractTime(b.name));
    });

    console.log(
      `[fetchMatches] ${all.length} total → ${matched.length} matched (${LEAGUES.map((l) => {
        const count = matched.filter((m) => m._league.id === l.id).length;
        return `${l.name}:${count}`;
      }).join(", ")})`
    );

    if (matched.length > 0) {
      cachedCatalog = matched;
      cacheTimestamp = now;
    }

    return matched;
  } catch (err) {
    console.error("[fetchMatches] Error:", err.message);
    return cachedCatalog || [];
  }
}

function extractTime(name) {
  const match = name.match(/lúc\s+(\d{1,2}:\d{2})/i);
  return match ? match[1] : "";
}

// ============================================================
// FETCH META từ MonPlay
// ============================================================
async function fetchMeta(monplayId) {
  try {
    const res = await fetch(`${MONPLAY_BASE}/meta/thethao/${monplayId}.json`, {
      headers: { "User-Agent": "BongDaAddon/2.0" },
      timeout: 10000,
    });
    return await res.json();
  } catch (err) {
    console.error("[fetchMeta] Error:", err.message);
    return null;
  }
}

// ============================================================
// FETCH STREAMS từ MonPlay
// ============================================================
async function fetchStreams(monplayId) {
  try {
    const res = await fetch(
      `${MONPLAY_BASE}/stream/thethao/${monplayId}.json`,
      { headers: { "User-Agent": "BongDaAddon/2.0" }, timeout: 10000 }
    );
    const data = await res.json();
    return data.streams || {};
  } catch (err) {
    console.error("[fetchStreams] Error:", err.message);
    return {};
  }
}

// ============================================================
// STREMIO MANIFEST
// ============================================================
const manifest = {
  id: "community.bongda-intl",
  version: "2.0.0",
  name: "Bóng Đá Quốc Tế ⚽",
  description:
    "Xem trực tiếp bóng đá: Premier League, La Liga, Champions League, MLS. Nguồn dữ liệu từ MonPlay.",
  logo: "https://cdn-icons-png.flaticon.com/512/8841/8841316.png",
  background: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=1200",
  catalogs: LEAGUES.map((l) => ({
    type: "thethao",
    id: l.id,
    name: `⚽ ${l.name}`,
    extra: [{ name: "skip" }],
  })),
  resources: ["catalog", "meta", "stream"],
  types: ["thethao"],
  idPrefixes: ["bongda:"],
};

const builder = new addonBuilder(manifest);

// ============================================================
// CATALOG HANDLER
// ============================================================
builder.defineCatalogHandler(async ({ type, id }) => {
  console.log(`[catalog] type=${type} id=${id}`);

  if (type !== "thethao") return { metas: [] };

  const allMatches = await fetchMatches();

  // Lọc theo catalog id (league)
  const leagueMatches = allMatches.filter((m) => m._league.id === id);

  const metas = leagueMatches.map((m) => ({
    id: `bongda:${m.id}`,
    type: "thethao",
    name: m.name,
    poster:
      m.poster ||
      "https://cdn-icons-png.flaticon.com/512/8841/8841316.png",
    posterShape: "landscape",
    description: `⚽ ${m._league.name}\n🕐 ${extractTime(m.name) || "Sắp diễn ra"}`,
    genres: [m._league.name],
    releaseInfo: extractTime(m.name) || "",
    behaviorHints: {
      defaultVideoId: `bongda:${m.id}`,
    },
  }));

  return { metas };
});

// ============================================================
// META HANDLER
// ============================================================
builder.defineMetaHandler(async ({ type, id }) => {
  console.log(`[meta] type=${type} id=${id}`);

  if (!id || !id.startsWith("bongda:")) return { meta: {} };

  const monplayId = id.replace("bongda:", "");
  const data = await fetchMeta(monplayId);

  if (!data || !data.meta) return { meta: {} };

  return {
    meta: {
      id: id,
      type: "thethao",
      name: data.meta.name,
      poster: data.meta.poster,
      posterShape: "landscape",
      description: data.meta.description || data.meta.name,
      videos: (data.meta.videos || []).map((v) => ({
        id: `bongda:${monplayId}:${v.id}`,
        title: v.name || v.description || "Stream",
        thumbnail: v.thumbnail,
        episode: v.episode || 1,
        released: new Date().toISOString(),
      })),
    },
  };
});

// ============================================================
// STREAM HANDLER
// ============================================================
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`[stream] type=${type} id=${id}`);

  if (!id || !id.startsWith("bongda:")) return { streams: [] };

  const parts = id.replace("bongda:", "").split(":");
  const monplayId = parts[0];

  const streams = await fetchStreams(monplayId);

  if (streams && Object.keys(streams).length > 0) {
    return {
      streams: Object.entries(streams).map(([key, url]) => ({
        title: `📺 ${key}`,
        url: url,
      })),
    };
  }

  return {
    streams: [
      {
        title: "⏰ Stream sẽ có khi trận bắt đầu",
        url: `${MONPLAY_BASE}/stream/thethao/${monplayId}.json`,
      },
    ],
  };
});

// ============================================================
// START
// ============================================================
const addonInterface = builder.getInterface();

serveHTTP(addonInterface, { port: PORT }).then(() => {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`⚽  Bóng Đá Quốc Tế - Stremio Addon v2.0`);
  console.log(`${"=".repeat(50)}`);
  console.log(`🔗  Server: http://localhost:${PORT}`);
  console.log(`📱  Install: http://localhost:${PORT}/manifest.json`);
  console.log(`\n📋  Giải đấu:`);
  LEAGUES.forEach((l) => console.log(`    ${l.priority}. ${l.name}`));
  console.log(`\n🌐  Source: MonPlay (${MONPLAY_BASE})`);
  console.log(`${"=".repeat(50)}\n`);
});
