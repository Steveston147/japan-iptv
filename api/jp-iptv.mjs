const SOURCE_URL =
  "https://raw.githubusercontent.com/MrKagesan/JP-IPTV/main/JP.m3u";

const CHECK_TIMEOUT_MS = 5000;
const CONCURRENCY = 18;

export const config = {
  maxDuration: 60,
};

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseM3u(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const channels = [];
  let pendingInfo = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      pendingInfo = line;
      continue;
    }

    if (line.startsWith("#")) continue;

    if (pendingInfo && validHttpUrl(line)) {
      channels.push({ info: pendingInfo, url: line });
      pendingInfo = "";
    }
  }

  return channels;
}

async function isPlayable(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept:
          "application/vnd.apple.mpegurl, application/x-mpegURL, application/dash+xml, */*",
        Range: "bytes=0-8191",
        "User-Agent": "Mozilla/5.0 (compatible; JapanIPTVChecker/2.0)",
      },
    });

    if (response.status < 200 || response.status >= 400) return false;

    const contentType = clean(response.headers.get("content-type")).toLowerCase();
    const sample = (await response.text()).slice(0, 16384);

    return (
      sample.includes("#EXTM3U") ||
      sample.includes("<MPD") ||
      contentType.includes("mpegurl") ||
      contentType.includes("dash+xml")
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}

function deduplicate(channels) {
  const seen = new Set();
  return channels.filter((channel) => {
    if (seen.has(channel.url)) return false;
    seen.add(channel.url);
    return true;
  });
}

function toM3u(channels) {
  // 取得不能だったEPGホストを引き継がず、再生可能チャンネルだけを返す。
  const lines = ["#EXTM3U"];

  for (const channel of channels) {
    lines.push(channel.info, channel.url);
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
      cache: "no-store",
      headers: {
        Accept: "audio/x-mpegurl, application/vnd.apple.mpegurl, text/plain, */*",
        "User-Agent": "JapanIPTV-Vercel/2.0",
      },
    });

    if (!sourceResponse.ok) {
      throw new Error(`Source returned HTTP ${sourceResponse.status}`);
    }

    const sourceText = await sourceResponse.text();
    const candidates = deduplicate(parseM3u(sourceText));

    const checked = await mapLimit(candidates, CONCURRENCY, async (channel) => ({
      channel,
      playable: await isPlayable(channel.url),
    }));

    const active = checked
      .filter((result) => result.playable)
      .map((result) => result.channel);

    response.setHeader(
      "Cache-Control",
      "public, s-maxage=900, stale-while-revalidate=21600",
    );
    response.setHeader("Content-Type", "audio/x-mpegurl; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      'inline; filename="japan-jp-iptv-checked.m3u"',
    );
    response.setHeader("X-Source-Streams", String(candidates.length));
    response.setHeader("X-Active-Streams", String(active.length));
    response.setHeader("X-Removed-Streams", String(candidates.length - active.length));

    return response.status(200).send(toM3u(active));
  } catch (error) {
    console.error(error);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "audio/x-mpegurl; charset=utf-8");
    return response
      .status(502)
      .send(`#EXTM3U\n# Playlist generation failed: ${error.message}\n`);
  }
}
