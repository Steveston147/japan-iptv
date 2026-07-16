const SOURCE_URL =
  "https://raw.githubusercontent.com/Mvb1122/jp-iptv-different-user/refs/heads/main/out/JP.m3u";

const BLOCKED_PATTERNS = [
  /adult|r-?18|18\+|xxx/i,
  /アダルト|成人向け|セクシー|グラビア/i,
  /pigoo|v[ _-]?paradise|刺激ストロング/i,
  /パチンコ|パチスロ|スロット/i,
  /競輪|オートレース|競艇|ボートレース/i,
  /qvc|shop\s*channel|shopch|gstv/i,
  /ショップ|ショッピング|通販|ジャパネット/i,
];

function clean(value) {
  return typeof value === "string"
    ? value.trim().replace(/[\r\n]+/g, " ")
    : "";
}

function isStreamUrl(value) {
  const baseUrl = clean(value).split("|", 1)[0];

  try {
    const url = new URL(baseUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parsePlaylist(text) {
  const lines = text.split(/\r?\n/);
  const header = lines.find((line) => line.trim().startsWith("#EXTM3U"))?.trim()
    || "#EXTM3U";
  const entries = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#EXTM3U")) continue;

    if (line.startsWith("#EXTINF:")) {
      if (current) current = null;
      const comma = line.indexOf(",");
      current = {
        extinf: line,
        name: comma >= 0 ? clean(line.slice(comma + 1)) : "",
        metadata: [],
      };
      continue;
    }

    if (!current) continue;

    if (isStreamUrl(line)) {
      entries.push({ ...current, url: line });
      current = null;
      continue;
    }

    if (line.startsWith("#")) current.metadata.push(line);
  }

  return { header, entries };
}

function isAllowed(entry) {
  const group =
    entry.extinf.match(/group-title="([^"]*)"/i)?.[1]
    || entry.metadata
      .find((line) => line.startsWith("#EXTGRP:"))
      ?.slice("#EXTGRP:".length)
    || "";

  const searchText = `${entry.name} ${group}`;
  return !BLOCKED_PATTERNS.some((pattern) => pattern.test(searchText));
}

function toM3u(header, entries) {
  const lines = [header];

  for (const entry of entries) {
    lines.push(entry.extinf, ...entry.metadata, entry.url);
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
    const { header, entries } = parsePlaylist(sourceText);
    const curated = entries.filter(isAllowed);

    response.setHeader(
      "Cache-Control",
      "public, s-maxage=900, stale-while-revalidate=86400",
    );
    response.setHeader("Content-Type", "audio/x-mpegurl; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      'inline; filename="japan-reaperc-clean.m3u"',
    );
    response.setHeader("X-Source-Streams", String(entries.length));
    response.setHeader("X-Curated-Streams", String(curated.length));

    return response.status(200).send(toM3u(header, curated));
  } catch (error) {
    console.error(error);
    response.setHeader("Cache-Control", "no-store");
    return response
      .status(502)
      .send(`#EXTM3U\n# Playlist generation failed: ${error.message}\n`);
  }
}
