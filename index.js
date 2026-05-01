const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const cheerio = require("cheerio");
const fetch = require("node-fetch");

// ============================================================
// CONFIG
// ============================================================
const BASE_URL = (
  process.env.XOILACZ_BASE_URL || "https://egyptwatch.net"
).replace(/\/+$/, "");

const PORT = parseInt(process.env.PORT || "7000", 10);
const CACHE_TTL = 5 * 60 * 1000;

// ============================================================
// LEAGUE DEFINITIONS
// ============================================================
// League ID mapping (from imgts.sportpulseapiz.com URLs)
const LEAGUE_IDS = {
  jednm9whz0ryox8: { id: "epl", name: "Premier League", priority: 1 },
  vl7oqdehlyr510j: { id: "laliga", name: "La Liga", priority: 2 },
  z8yomo4h7wq0j6l: { id: "ucl", name: "Champions League", priority: 3 },
  yl5ergphnzr8k0o: { id: "ligue1", name: "Ligue 1", priority: 4 },
  "4zp5rzghp5q82w1": { id: "seriea", name: "Serie A", priority: 5 },
  kn54qllhg2qvy9d: { id: "mls", name: "MLS", priority: 6 },
};

// ============================================================
// CACHE
// ============================================================
let cachedMatches = null;
let cacheTimestamp = 0;
let cachedBaseUrl = null;

// ============================================================
// RESOLVE DOMAIN (xoilacz.vip redirects to changing domains)
// ============================================================
async function resolveBaseUrl() {
  try {
    const res = await fetch("http://xoilacz.vip/", {
      redirect: "follow",
      timeout: 8000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    const finalUrl = new URL(res.url);
    cachedBaseUrl = finalUrl.origin;
    console.log(`[resolveBaseUrl] Resolved to: ${cachedBaseUrl}`);
    return cachedBaseUrl;
  } catch {
    return cachedBaseUrl || BASE_URL;
  }
}

// ============================================================
// SCRAPE MATCHES từ trang chủ
// ============================================================
async function scrapeMatches(baseUrl) {
  try {
    const res = await fetch(baseUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 15000,
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    const targetMatches = [];
    const allFootballMatches = [];

    $(".grid-matches__item-match").each((_, el) => {
      const $el = $(el);

      // Chỉ lấy bóng đá, bỏ basketball/tennis/esports
      const sportType = $el.attr("data-sport") || "";
      if (sportType !== "football") return;

      const leagueRaw = $el.find(".grid-match__league").text().trim();
      const homeTeam = $el.find(".grid-match__team--home-name").text().trim();
      const awayTeam = $el.find(".grid-match__team--away-name").text().trim();
      if (!homeTeam || !awayTeam) return;

      // Lấy link
      const linkEl = $el.find("a[href*='/truc-tiep/']").first();
      let matchUrl = linkEl.attr("href") || "";
      if (matchUrl && !matchUrl.startsWith("http")) {
        matchUrl = baseUrl + matchUrl;
      }
      if (!matchUrl) return;

      // Lấy thời gian / trạng thái
      const timeEl = $el.find(".grid-match__time text.t_time");
      const timeText = timeEl.text().trim() || $el.find(".grid-match__date").text().trim();
      const score = $el.find(".grid-match__vs").text().trim().replace(/\s+/g, " ");

      // Lấy data-random-streams để biết có bao nhiêu link stream
      const randomStreams = linkEl.attr("data-random-streams") || "";
      const streamCount = randomStreams
        ? randomStreams.split(",").filter(Boolean).length
        : 1;

      // Xác định giải đấu bằng league image URL (chính xác hơn text matching)
      const leagueImg = $el.find(".grid-match__league img").attr("src") || "";
      const leagueIdMatch = leagueImg.match(/competition\/([^/]+)\/image/);
      const leagueIdFromImg = leagueIdMatch ? leagueIdMatch[1] : null;
      const matchedLeague = leagueIdFromImg ? LEAGUE_IDS[leagueIdFromImg] : null;

      const match = {
        league: matchedLeague,
        leagueRaw,
        homeTeam: homeTeam.trim(),
        awayTeam: awayTeam.trim(),
        time: timeText,
        score,
        matchUrl,
        streamCount,
        randomStreams,
      };

      allFootballMatches.push(match);
      if (matchedLeague) targetMatches.push(match);
    });

    // Sắp xếp target matches theo priority
    targetMatches.sort((a, b) => a.league.priority - b.league.priority);

    return { targetMatches, allFootballMatches };
  } catch (err) {
    console.error("[scrapeMatches] Error:", err.message);
    return { targetMatches: [], allFootballMatches: [] };
  }
}

function leagueLow(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Get all target league names for display
const TARGET_LEAGUE_NAMES = Object.values(LEAGUE_IDS).map(l => l.name);

// ============================================================
// LẤY STREAM URL
// Bước 1: Lấy list_stream từ trang /link/N → stream page URL
// Bước 2: Fetch stream page → extract FLV URL
// Bước 3: Convert FLV → m3u8 (HLS) cho Stremio
// ============================================================
async function getStreamUrl(matchUrl) {
  try {
    // Bước 1: Lấy stream page URL từ list_stream
    let streamPageUrl = null;
    for (const linkNum of [0, 1, 2]) {
      const linkUrl = matchUrl.replace(/\/$/, "") + `/link/${linkNum}`;
      const res = await fetch(linkUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        redirect: "follow",
        timeout: 12000,
      });
      const html = await res.text();

      const listMatch = html.match(/var\s+list_stream\s*=\s*(\[[\s\S]*?\]);/);
      if (listMatch) {
        try {
          const listStream = JSON.parse(listMatch[1]);
          if (listStream[0] && listStream[0][0]) {
            streamPageUrl = listStream[0][0].replace(/\\\//g, "/");
            break;
          }
        } catch {}
      }
    }

    if (!streamPageUrl) {
      return [{ title: "🌐 Mở trên XoilacZ", url: matchUrl, isFallback: true }];
    }

    // Bước 2: Fetch stream page → extract FLV URL
    const streamRes = await fetch(streamPageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 10000,
    });
    const streamHtml = await streamRes.text();

    // Tìm FLV URL: https://live1.pro2cdnlive.com/live/channel15.flv?...
    const flvMatch = streamHtml.match(
      /(https?:\/\/[^\s"']+\.flv[^\s"']*)/i
    );

    if (flvMatch) {
      // Bước 3: Convert FLV → m3u8
      const flvUrl = flvMatch[1];
      const m3u8Url = flvUrl.replace(/\.flv(\?.*)?$/i, ".m3u8$1");
      return [
        {
          title: "📺 XoilacZ Stream (HLS)",
          url: m3u8Url,
        },
        {
          title: "📺 XoilacZ Stream (FLV - Backup)",
          url: flvUrl,
        },
        {
          title: "🌐 Mở trang trận đấu",
          url: matchUrl,
        },
      ];
    }

    // Fallback: trả về stream page URL
    return [
      { title: "📺 XoilacZ Player", url: streamPageUrl },
      { title: "🌐 Mở trang trận đấu", url: matchUrl },
    ];
  } catch (err) {
    console.error("[getStreamUrl] Error:", err.message);
    return [{ title: "🌐 Mở trên XoilacZ", url: matchUrl, isFallback: true }];
  }
}

// ============================================================
// FETCH MATCHES với cache
// ============================================================
async function getMatches() {
  const now = Date.now();
  if (cachedMatches && now - cacheTimestamp < CACHE_TTL) {
    return cachedMatches;
  }

  const baseUrl = await resolveBaseUrl();
  const { targetMatches, allFootballMatches } = await scrapeMatches(baseUrl);

  // Nếu có trận mục tiêu → dùng targetMatches
  // Nếu không → dùng allFootballMatches (giới hạn 30 trận)
  const matches =
    targetMatches.length > 0
      ? targetMatches
      : allFootballMatches.slice(0, 30);

  const result = {
    matches,
    isFallback: targetMatches.length === 0,
    baseUrl,
    targetCount: targetMatches.length,
    totalCount: allFootballMatches.length,
  };

  if (matches.length > 0) {
    cachedMatches = result;
    cacheTimestamp = now;
  }

  console.log(
    `[getMatches] Found ${targetMatches.length} target / ${allFootballMatches.length} total. Using ${matches.length}.`
  );

  return result;
}

// ============================================================
// STREMIO MANIFEST
// ============================================================
const manifest = {
  id: "community.xoilacz-bongda",
  version: "1.1.0",
  name: "XoilacZ Bóng Đá ⚽",
  description:
    "Xem trực tiếp bóng đá từ XoilacZ. Premier League, La Liga, Champions League, Ligue 1, Serie A, MLS. Tự động tìm domain mới.",
  logo: "https://cdn-icons-png.flaticon.com/512/8841/8841316.png",
  background: "https://cdn-icons-png.flaticon.com/512/8841/8841316.png",
  catalogs: [
    {
      type: "tv",
      id: "xoilacz-live",
      name: "⚽ XoilacZ Trực Tiếp",
      extra: [{ name: "search", isRequired: false }],
    },
    {
      type: "tv",
      id: "xoilacz-hot",
      name: "🔥 XoilacZ Trận Hot",
      extra: [{ name: "search", isRequired: false }],
    },
  ],
  resources: ["catalog", "stream"],
  types: ["tv"],
  idPrefixes: ["xoilacz:"],
};

const builder = new addonBuilder(manifest);

// ============================================================
// CATALOG HANDLER
// ============================================================
builder.defineCatalogHandler(async ({ type, id }) => {
  console.log(`[catalog] type=${type} id=${id}`);

  const { matches, isFallback } = await getMatches();

  const metas = matches.map((m) => {
    const metaId = `xoilacz:${Buffer.from(m.matchUrl).toString("base64url")}`;
    const leagueName = m.league ? m.league.name : m.leagueRaw;

    return {
      id: metaId,
      type: "tv",
      name: `${m.homeTeam} vs ${m.awayTeam}`,
      poster: m.league
        ? `https://imgts.sportpulseapiz.com/football/competition/${getLeagueImgId(m.league.id)}/image/small`
        : "https://cdn-icons-png.flaticon.com/512/8841/8841316.png",
      posterShape: "landscape",
      description: `⚽ ${leagueName}\n🕐 ${m.time || "Sắp diễn ra"}\n📺 ${m.score || "vs"}${m.streamCount > 1 ? `\n🔗 ${m.streamCount} link stream` : ""}`,
      genres: [leagueName],
      releaseInfo: m.time || "",
      behaviorHints: {
        defaultVideoId: metaId,
      },
    };
  });

  return { metas };
});

// ============================================================
// STREAM HANDLER
// ============================================================
builder.defineStreamHandler(async ({ type, id }) => {
  console.log(`[stream] type=${type} id=${id}`);

  if (!id || !id.startsWith("xoilacz:")) return { streams: [] };

  try {
    const matchUrl = Buffer.from(
      id.replace("xoilacz:", ""),
      "base64url"
    ).toString();

    const streams = await getStreamUrl(matchUrl);

    const stremioStreams = streams.map((s) => {
      const isHls = s.url && (s.url.includes(".m3u8") || s.url.includes("mpegurl"));
      return {
        title: s.title,
        url: s.url,
        ...(isHls ? {} : { behaviorHints: { notWebReady: true } }),
      };
    });

    return { streams: stremioStreams };
  } catch (err) {
    console.error("[stream] Error:", err.message);
    return { streams: [] };
  }
});

// ============================================================
// HELPER
// ============================================================
function getLeagueImgId(leagueId) {
  const map = {
    epl: "jednm9whz0ryox8",
    laliga: "vl7oqdehlyr510j",
    ucl: "z8yomo4h7wq0j6l",
    ligue1: "yl5ergphnzr8k0o",
    seriea: "4zp5rzghp5q82w1",
    mls: "kn54qllhg2qvy9d",
  };
  return map[leagueId] || "jednm9whz0ryox8";
}

// ============================================================
// START
// ============================================================
const addonInterface = builder.getInterface();

serveHTTP(addonInterface, { port: PORT }).then((srv) => {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`⚽  XoilacZ Bóng Đá - Stremio Addon v1.1`);
  console.log(`${"=".repeat(50)}`);
  console.log(`🔗  Server: http://localhost:${PORT}`);
  console.log(`📱  Install: http://localhost:${PORT}/manifest.json`);
  console.log(`\n📋  Giải đấu mục tiêu:`);
  Object.values(LEAGUE_IDS)
    .sort((a, b) => a.priority - b.priority)
    .forEach((l) => console.log(`    ${l.priority}. ${l.name}`));
  console.log(`\n🌐  Source: ${BASE_URL}`);
  console.log(`💡  Env: XOILACZ_BASE_URL=domain moi`);
  console.log(`💡  Env: PORT=port moi`);
  console.log(`${"=".repeat(50)}\n`);
});
