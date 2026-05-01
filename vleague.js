const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const fetch = require("node-fetch");

// ============================================================
// CONFIG
// ============================================================
const MONPLAY_BASE = "https://sm.manucn.dpdns.org";
const PORT = parseInt(process.env.VLEAGUE_PORT || "7001", 10);
const CACHE_TTL = 5 * 60 * 1000;

// ============================================================
// V-LEAGUE FILTER
// ============================================================
const VN_TEAMS = [
  "nam định", "nam dinh",
  "hồ chí minh", "ho chi minh", "hcm",
  "hà nội", "ha noi", "hanoi",
  "hải phòng", "hai phong",
  "bình định", "binh dinh",
  "nghệ an", "nghe an",
  "thanh hóa", "thanh hoa",
  "quảng nam", "quang nam",
  "đà nẵng", "da nang",
  "khánh hòa", "khanh hoa",
  "bình dương", "binh duong",
  "đồng tháp", "dong thap",
  "long an",
  "tây ninh", "tay ninh",
  "vĩnh long", "vinh long",
  "cần thơ", "can tho",
  "sóc trăng", "soc trang",
  "an giang",
  "bến tre", "ben tre",
  "hồng linh", "hong linh",
  "văn hiến", "van hien",
  "bắc ninh", "bac ninh",
  "công an hà nội", "cong an ha noi", "công an", "cong an",
  "thể công", "the cong",
  "sông lam", "song lam",
  "đông á", "dong a",
  "huế", "hue",
  "phú thọ", "phu tho",
  "bình thuận", "binh thuan",
  "viettel",
  "hagl", "hoàng anh gia lai",
  "becamex",
  "v-league", "v league",
];

const EXCLUDE_KEYWORDS = [
  "u17 ", "u19 ", "u20 ", "u21 ", "u22 ", "u23 ",
  "nữ ", "nu ",
  "praha", "moscow", "dynamo bude", "slovacko", "pardubice",
  "tallinna", "estonia", "italy", "cagliari", "lecce",
  "indonesi", "brazil", "argentin", "australia",
  "kazan", "ural", "fakel", "konoplev",
];

function isVLeague(item) {
  const name = (item.name || "").toLowerCase();
  const matched = VN_TEAMS.some((kw) => name.includes(kw));
  if (!matched) return false;

  const isExcluded = EXCLUDE_KEYWORDS.some((ex) => name.includes(ex));
  const isExplicitVN =
    name.includes("v-league") ||
    name.includes("việt nam") ||
    name.includes("viet nam");

  if (isExcluded && !isExplicitVN) return false;
  return true;
}

// ============================================================
// CACHE
// ============================================================
let cachedMetas = null;
let cacheTimestamp = 0;

async function fetchVLeagueMatches() {
  const now = Date.now();
  if (cachedMetas && now - cacheTimestamp < CACHE_TTL) {
    return cachedMetas;
  }

  try {
    const res = await fetch(`${MONPLAY_BASE}/catalog/thethao/all.json`, {
      headers: { "User-Agent": "VLeagueAddon/1.0" },
      timeout: 15000,
    });
    const data = await res.json();
    const all = data.metas || [];
    const vleague = all.filter(isVLeague);

    const metas = vleague.map((m) => ({
      id: `vleague:${m.id}`,
      type: "thethao",
      name: m.name,
      poster: m.poster || "https://cdn-icons-png.flaticon.com/512/8841/8841316.png",
      posterShape: "landscape",
      description: `⚽ V-League\n🕐 ${extractTime(m.name)}`,
      genres: ["V-League"],
      releaseInfo: extractTime(m.name),
      behaviorHints: {
        defaultVideoId: `vleague:${m.id}`,
      },
    }));

    console.log(`[vleague] ${all.length} total → ${metas.length} V-League`);

    if (metas.length > 0) {
      cachedMetas = metas;
      cacheTimestamp = now;
    }

    return metas;
  } catch (err) {
    console.error("[vleague] Fetch error:", err.message);
    return cachedMetas || [];
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
      headers: { "User-Agent": "VLeagueAddon/1.0" },
      timeout: 10000,
    });
    return await res.json();
  } catch (err) {
    console.error("[vleague] Meta error:", err.message);
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
      {
        headers: { "User-Agent": "VLeagueAddon/1.0" },
        timeout: 10000,
      }
    );
    const data = await res.json();
    return data.streams || {};
  } catch (err) {
    console.error("[vleague] Stream error:", err.message);
    return {};
  }
}

// ============================================================
// STREMIO MANIFEST
// ============================================================
const manifest = {
  id: "org.vn.vleague",
  version: "1.0.0",
  name: "V-League ⚽",
  description:
    "Giải bóng đá V-League Việt Nam trực tiếp. Trích xuất từ MonPlay.",
  logo: "https://upload.wikimedia.org/wikipedia/vi/thumb/2/21/V.League_1_logo.svg/200px-V.League_1_logo.svg.png",
  background: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=1200",
  catalogs: [
    {
      type: "thethao",
      id: "vleague",
      name: "⚽ V-League",
      extra: [{ name: "skip" }],
    },
  ],
  resources: ["catalog", "meta", "stream"],
  types: ["thethao"],
  idPrefixes: ["vleague:"],
};

const builder = new addonBuilder(manifest);

// ============================================================
// CATALOG HANDLER
// ============================================================
builder.defineCatalogHandler(async ({ type, id }) => {
  console.log(`[catalog] type=${type} id=${id}`);

  if (type !== "thethao" || id !== "vleague") {
    return { metas: [] };
  }

  const metas = await fetchVLeagueMatches();
  return { metas };
});

// ============================================================
// META HANDLER
// ============================================================
builder.defineMetaHandler(async ({ type, id }) => {
  console.log(`[meta] type=${type} id=${id}`);

  if (!id || !id.startsWith("vleague:")) return { meta: {} };

  const monplayId = id.replace("vleague:", "");
  const data = await fetchMeta(monplayId);

  if (!data || !data.meta) return { meta: {} };

  // Trả về meta từ MonPlay, giữ nguyên videos (BLV options)
  return {
    meta: {
      id: id,
      type: "thethao",
      name: data.meta.name,
      poster: data.meta.poster,
      posterShape: "landscape",
      description: data.meta.description || data.meta.name,
      videos: (data.meta.videos || []).map((v) => ({
        id: `${id}:${v.id}`,
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

  if (!id || !id.startsWith("vleague:")) return { streams: [] };

  // Format: vleague:monplay-id hoặc vleague:monplay-id:video-id
  const parts = id.replace("vleague:", "").split(":");
  const monplayId = parts[0];
  const videoId = parts[1] || null;

  // Nếu có videoId (BLV cụ thể) → dùng trực tiếp
  if (videoId) {
    // Video ID từ MonPlay là base64 encoded, cần decode để lấy stream URL
    // Nhưng Stremio cần URL trực tiếp → proxy qua MonPlay stream endpoint
    const streams = await fetchStreams(monplayId);

    if (streams && Object.keys(streams).length > 0) {
      return {
        streams: Object.entries(streams).map(([key, url]) => ({
          title: `📺 ${key}`,
          url: url,
        })),
      };
    }

    // Fallback: trả về video ID để client xử lý
    return {
      streams: [
        {
          title: "📺 V-League Stream",
          url: `https://sm.manucn.dpdns.org/stream/thethao/${monplayId}.json`,
        },
      ],
    };
  }

  // Không có videoId → lấy tất cả streams
  const streams = await fetchStreams(monplayId);

  if (streams && Object.keys(streams).length > 0) {
    return {
      streams: Object.entries(streams).map(([key, url]) => ({
        title: `📺 ${key}`,
        url: url,
      })),
    };
  }

  // Stream chưa sẵn sàng (trận chưa bắt đầu)
  return {
    streams: [
      {
        title: "⏰ Stream sẽ có khi trận bắt đầu",
        url: `https://sm.manucn.dpdns.org/stream/thethao/${monplayId}.json`,
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
  console.log(`⚽  V-League Addon - Stremio`);
  console.log(`${"=".repeat(50)}`);
  console.log(`🔗  Server: http://localhost:${PORT}`);
  console.log(`📱  Install: http://localhost:${PORT}/manifest.json`);
  console.log(`\n📋  Nguồn dữ liệu: MonPlay`);
  console.log(`🔍  Lọc: V-League (đội bóng Việt Nam)`);
  console.log(`${"=".repeat(50)}\n`);
});
