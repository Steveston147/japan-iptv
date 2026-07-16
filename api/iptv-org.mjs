const SOURCE_URL =
  "https://raw.githubusercontent.com/iptv-org/iptv/master/streams/jp.m3u";

const BLOCKED_NAMES = [
  /\bQVC\b/i,
  /Shop Channel/i,
  /\bGSTV\b/i,
];

const NAME_RULES = [
  { test: /JOAX-?DTV|JOAXDTV/i, name: "日本テレビ", group: "地上波" },
  { test: /JOCX-?DTV|JOCXDTV/i, name: "フジテレビ", group: "地上波" },
  { test: /JOEX-?DTV|JOEXDTV/i, name: "テレビ朝日", group: "地上波" },
  { test: /JORX-?DTV|JORXDTV/i, name: "TBSテレビ", group: "地上波" },
  {
    test: /NHK\s*World|NHKWorldJapan/i,
    name: "NHK WORLD-JAPAN",
    group: "ニュース・天気",
  },
  {
    test: /Weathernews/i,
    name: "ウェザーニュース",
    group: "ニュース・天気",
  },
  { test: /CGNTVJapan|CGNTV Japan/i, name: "CGNTV Japan", group: "その他" },
  {
    test: /Gaki no Tsukai/i,
    name: "ガキの使い（英語字幕）",
    group: "バラエティ",
  },
];

function clean(value) {
  return typeof value === "string"
    ? value.trim().replace(/[\r\n]+/g, " ")
    : "";
}

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeAttribute(value) {
  return clean(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function parsePlaylist(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      const comma = line.indexOf(",");
      const attributes = comma >= 0 ? line.slice(0, comma) : line;
      const rawName = comma >= 0 ? line.slice(comma + 1).trim() : "名称不明";
      const tvgId = attributes.match(/tvg-id="([^"]*)"/i)?.[1] || "";
      current = { rawName, tvgId, options: [] };
      continue;
    }

    if (current && line.startsWith("#EXT")) {
      current.options.push(line);
      continue;
    }

    if (current && validHttpUrl(line)) {
      entries.push({ ...current, url: line });
      current = null;
    }
  }

  return entries;
}

function normaliseEntry(entry) {
  const searchText = `${entry.tvgId} ${entry.rawName}`;
  const rule = NAME_RULES.find((item) => item.test.test(searchText));

  return {
    ...entry,
    name: rule?.name || clean(entry.rawName),
    group: rule?.group || "その他",
  };
}

function curate(entries) {
  const seenUrls = new Set();
  let keptNhkWorld = false;
  const result = [];

  for (const sourceEntry of entries) {
    const entry = normaliseEntry(sourceEntry);
    if (BLOCKED_NAMES.some((pattern) => pattern.test(entry.name))) continue;
    if (seenUrls.has(entry.url)) continue;

    if (entry.name === "NHK WORLD-JAPAN") {
      if (keptNhkWorld) continue;
      keptNhkWorld = true;
    }

    seenUrls.add(entry.url);
    result.push(entry);
  }

  return result;
}

function toM3u(entries) {
  const lines = ["#EXTM3U"];

  for (const entry of entries) {
    lines.push(
      `#EXTINF:-1 tvg-id="${escapeAttribute(entry.tvgId)}" tvg-name="${escapeAttribute(entry.name)}" group-title="${escapeAttribute(entry.group)}",${entry.name}`,
      ...entry.options,
      entry.url,
    );
  }

  return `${lines.join("\n")}\n`;
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).send("Method Not Allowed");
  }

  try {
    const sourceResponse = await fetch(SOURCE_URL, {
      headers: {
        Accept: "audio/x-mpegurl, text/plain, */*",
        "User-Agent": "JapanIPTV-Vercel/1.0",
      },
      cache: "no-store",
    });

    if (!sourceResponse.ok) {
      throw new Error(`Source returned HTTP ${sourceResponse.status}`);
    }

    const sourceText = await sourceResponse.text();
    const curated = curate(parsePlaylist(sourceText));

    response.setHeader(
      "Cache-Control",
      "public, s-maxage=900, stale-while-revalidate=86400",
    );
    response.setHeader("Content-Type", "audio/x-mpegurl; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      'inline; filename="japan-iptv-org.m3u"',
    );
    response.setHeader("X-Curated-Streams", String(curated.length));

    return response.status(200).send(toM3u(curated));
  } catch (error) {
    console.error(error);
    response.setHeader("Cache-Control", "no-store");
    return response
      .status(502)
      .send(`#EXTM3U\n# Playlist generation failed: ${error.message}\n`);
  }
}
