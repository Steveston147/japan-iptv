const SOURCE_URL =
  "https://raw.githubusercontent.com/tareq236/JapanIPTV/main/jp_tv_channels.json";

const CHECK_TIMEOUT_MS = 4500;
const CONCURRENCY = 20;

const ALLOWED_CATEGORIES = new Set(["terrestrial", "bs", "cs"]);

// 実際の視聴テストで比較的安定していた公開配信基盤だけを採用する。
// 不安定な地上波中継、個人プロキシ、短時間の待機映像は対象外。
const TRUSTED_STREAM_HOST_SUFFIXES = [
  "tsv2.amagi.tv",
  "livetv.fastv.jp",
  "akamaized.net",
];

const EXCLUDED_NAME_PATTERNS = [
  /代替/i,
  /アダルト/i,
  /成人/i,
  /年齢制限/i,
  /セクシー/i,
  /グラビア/i,
  /歓楽街/i,
  /pigoo/i,
  /v[ _-]?paradise/i,
  /刺激ストロング/i,
  /パチンコ/i,
  /パチスロ/i,
  /スロット/i,
  /競輪/i,
  /オートレース/i,
  /競艇/i,
  /ボートレース/i,
  /ショップ/i,
  /ショッピング/i,
  /通販/i,
  /shop channel/i,
  /shopch/i,
  /qvc/i,
  /ジャパネット/i,
];

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

function isTrustedStreamUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return TRUSTED_STREAM_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

function escapeAttribute(value) {
  return clean(value)
    .replaceAll("\\", "\\\\")
    .replaceAll('"', "\\\"")
    .replace(/[\r\n]+/g, " ");
}

function escapeName(value) {
  return clean(value).replace(/[\r\n]+/g, " ");
}

async function isReachable(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, */*",
        Range: "bytes=0-2047",
        "User-Agent": "Mozilla/5.0 (compatible; JapanIPTVChecker/1.0)",
      },
    });

    if (response.status < 200 || response.status >= 400) return false;

    // HTTP 200のHTMLエラーや静的な案内ページを除き、
    // 実際のHLSプレイリストが返ることを確認する。
    const sample = (await response.text()).slice(0, 8192);
    return sample.includes("#EXTM3U");
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

function isGeneralBroadcastChannel(channel) {
  const name = clean(channel?.name);
  const category = clean(channel?.category).toLowerCase();

  if (!ALLOWED_CATEGORIES.has(category)) return false;
  if (name.length < 2) return false;
  return !EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

function collectCandidates(channels, mode) {
  const seen = new Set();
  const candidates = [];

  for (const channel of channels) {
    if (!isGeneralBroadcastChannel(channel)) continue;

    for (const field of ["url", "url_free_tv"]) {
      const url = clean(channel?.[field]);
      if (
        !validHttpUrl(url) ||
        (mode === "stable" && !isTrustedStreamUrl(url)) ||
        seen.has(url)
      ) {
        continue;
      }
      seen.add(url);

      candidates.push({
        name: clean(channel?.name) || "名称不明",
        category: clean(channel?.category) || "その他",
        logo: validHttpUrl(clean(channel?.channel_logo))
          ? clean(channel?.channel_logo)
          : "",
        url,
      });
    }
  }

  return candidates;
}

function toM3u(channels) {
  const lines = ["#EXTM3U"];

  for (const channel of channels) {
    const attributes = [
      `tvg-name="${escapeAttribute(channel.name)}"`,
      `group-title="${escapeAttribute(channel.category)}"`,
    ];

    if (channel.logo) {
      attributes.push(`tvg-logo="${escapeAttribute(channel.logo)}"`);
    }

    lines.push(
      `#EXTINF:-1 ${attributes.join(" ")},${escapeName(channel.name)}`,
      channel.url,
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
        Accept: "application/json",
        "User-Agent": "JapanIPTV-Vercel/1.0",
      },
      cache: "no-store",
    });

    if (!sourceResponse.ok) {
      throw new Error(`Source returned HTTP ${sourceResponse.status}`);
    }

    const source = await sourceResponse.json();
    if (!Array.isArray(source)) {
      throw new Error("Source JSON is not an array");
    }

    const mode = request.query?.mode === "full" ? "full" : "stable";
    const candidates = collectCandidates(source, mode);

    // Full版は昨日のテスト版に近づけるため、形式が正しいURLを広く収録する。
    // Stable版だけは配信元とHLSの実応答を厳格に確認する。
    const active =
      mode === "full"
        ? candidates
        : (
            await mapLimit(candidates, CONCURRENCY, async (channel) => ({
              channel,
              reachable: await isReachable(channel.url),
            }))
          )
            .filter((result) => result.reachable)
            .map((result) => result.channel);

    response.setHeader(
      "Cache-Control",
      "public, s-maxage=900, stale-while-revalidate=86400",
    );
    response.setHeader("Content-Type", "audio/x-mpegurl; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `inline; filename="japan-${mode}.m3u"`,
    );
    response.setHeader("X-Playlist-Mode", mode);
    response.setHeader("X-Source-Channels", String(source.length));
    response.setHeader("X-Candidate-Streams", String(candidates.length));
    response.setHeader("X-Active-Streams", String(active.length));

    return response.status(200).send(toM3u(active));
  } catch (error) {
    console.error(error);
    response.setHeader("Cache-Control", "no-store");
    return response
      .status(502)
      .send(`#EXTM3U\n# Playlist generation failed: ${error.message}\n`);
  }
}
