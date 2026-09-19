import type { FplEventRef, FplTeamRef, ManagerPressItem, ManagerWordsSource } from "./types";
import { gameweekForDate } from "./gameweek-mapper";
import {
  looksLikeManagerContent,
  looksLikePressConferencePage,
  looksLikePressRssItem,
  parseManagerFromText,
  shouldSkipHeadline,
  stableItemId,
} from "./parse-quotes";
import { bbcTeamRssUrl } from "./team-slugs";

const USER_AGENT = "fpl-formula-manager-words/0.1";
const BBC_PL_RSS = "https://feeds.bbci.co.uk/sport/football/premier-league/rss.xml";
const BBC_PL_PAGE = "https://www.bbc.co.uk/sport/football/premier-league";

type RssItem = {
  title: string;
  description: string;
  link: string;
  pubDate: string;
};

type LiveBlogUpdate = {
  headline: string;
  articleBody: string;
  datePublished: string;
  url: string;
};

export type BbcFetchStats = {
  rssArticles: number;
  livePages: number;
  liveUpdates: number;
};

function decodeCdata(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function stripHtml(value: string): string {
  return decodeCdata(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  for (const block of itemBlocks) {
    const title = stripHtml(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const description = stripHtml(block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "");
    const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "").trim();

    if (title && link) {
      items.push({ title, description, link, pubDate });
    }
  }

  return items;
}

function parsePubDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeLiveUrl(link: string): string | null {
  const match = link.match(/sport\/football\/live\/([a-z0-9]+)/i);
  if (!match) return null;
  return `https://www.bbc.co.uk/sport/football/live/${match[1]}`;
}

function discoverLiveUrls(html: string): string[] {
  const urls = new Set<string>();
  const pattern = /\/sport\/football\/live\/([a-z0-9]+)/gi;
  for (const match of html.matchAll(pattern)) {
    urls.add(`https://www.bbc.co.uk/sport/football/live/${match[1]}`);
  }
  return [...urls];
}

function parseLiveBlogUpdates(html: string, pageUrl: string): LiveBlogUpdate[] {
  const scriptMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!scriptMatch) return [];

  try {
    const payload = JSON.parse(scriptMatch[1]) as {
      "@graph"?: Array<Record<string, unknown>>;
      liveBlogUpdate?: Array<Record<string, unknown>>;
    };

    const graph = payload["@graph"] ?? [payload];
    const liveBlog = graph.find((node) => node["@type"] === "LiveBlogPosting");
    const updates = (liveBlog?.liveBlogUpdate ?? payload.liveBlogUpdate ?? []) as Array<Record<string, unknown>>;

    return updates
      .map((update) => ({
        headline: String(update.headline ?? ""),
        articleBody: String(update.articleBody ?? ""),
        datePublished: String(update.datePublished ?? ""),
        url: String(update["@id"] ?? pageUrl),
      }))
      .filter((update) => update.headline);
  } catch {
    return [];
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} while fetching ${url}`);
  }

  return response.text();
}

function normalizeSourceUrl(url: string): string {
  return url.replace(/&amp;/g, "&").split("?")[0] ?? url;
}

function buildItem(params: {
  season: string;
  fetchedAt: string;
  teams: FplTeamRef[];
  events: FplEventRef[];
  headline: string;
  quote: string;
  source: ManagerWordsSource;
  sourceUrl: string;
  publishedAt: Date;
  teamHint?: FplTeamRef | null;
}): ManagerPressItem | null {
  const { headline, quote } = params;
  if (!quote.trim() || shouldSkipHeadline(headline)) return null;
  if (!looksLikeManagerContent(`${headline} ${quote}`)) return null;

  const parsed = parseManagerFromText(quote, params.teams);
  const parsedTeam = params.teams.find((entry) => entry.name === parsed.teamName) ?? null;
  const team = parsedTeam ?? params.teamHint ?? null;

  if (!team?.id || !parsed.managerName) return null;

  const canonicalUrl = normalizeSourceUrl(params.sourceUrl);

  return {
    id: stableItemId([canonicalUrl, headline, quote.slice(0, 120)]),
    season: params.season,
    gameweek: gameweekForDate(params.publishedAt, params.events),
    teamId: team?.id ?? null,
    teamName: team?.name ?? parsed.teamName,
    managerName: parsed.managerName,
    headline,
    quote: quote.trim(),
    source: params.source,
    sourceUrl: canonicalUrl,
    publishedAt: params.publishedAt.toISOString(),
    fetchedAt: params.fetchedAt,
  };
}

function upsertItem(items: Map<string, ManagerPressItem>, item: ManagerPressItem | null) {
  if (!item) return;
  items.set(item.id, item);
}

export async function fetchBbcManagerWords(params: {
  season: string;
  teams: FplTeamRef[];
  events: FplEventRef[];
  fetchedAt?: string;
}): Promise<{ items: ManagerPressItem[]; stats: BbcFetchStats }> {
  const fetchedAt = params.fetchedAt ?? new Date().toISOString();
  const items = new Map<string, ManagerPressItem>();
  const stats: BbcFetchStats = { rssArticles: 0, livePages: 0, liveUpdates: 0 };

  const rssFeeds: Array<{ url: string; source: ManagerWordsSource; teamHint?: FplTeamRef }> = [
    { url: BBC_PL_RSS, source: "bbc_rss" },
    ...params.teams.flatMap((team) => {
      const url = bbcTeamRssUrl(team);
      return url ? [{ url, source: "bbc_team_rss" as const, teamHint: team }] : [];
    }),
  ];

  const liveCandidateUrls = new Set<string>();

  for (const feed of rssFeeds) {
    try {
      const xml = await fetchText(feed.url);
      for (const entry of parseRssItems(xml)) {
        const liveUrl = normalizeLiveUrl(entry.link);
        if (liveUrl) {
          liveCandidateUrls.add(liveUrl);
        }

        if (!looksLikePressRssItem(entry.title, entry.description)) continue;

        const publishedAt = parsePubDate(entry.pubDate) ?? new Date(fetchedAt);
        upsertItem(
          items,
          buildItem({
            season: params.season,
            fetchedAt,
            teams: params.teams,
            events: params.events,
            headline: entry.title,
            quote: entry.description || entry.title,
            source: feed.source,
            sourceUrl: entry.link,
            publishedAt,
            teamHint: feed.teamHint,
          }),
        );
        stats.rssArticles += 1;
      }
    } catch (error) {
      console.warn(`Skipping RSS feed ${feed.url}:`, error);
    }
  }

  try {
    const plPage = await fetchText(BBC_PL_PAGE);
    for (const url of discoverLiveUrls(plPage)) {
      liveCandidateUrls.add(url);
    }
  } catch (error) {
    console.warn("Skipping BBC Premier League page discovery:", error);
  }

  for (const liveUrl of liveCandidateUrls) {
    try {
      const html = await fetchText(liveUrl);
      const pageHeadline =
        html.match(/"headline":"([^"]+)"/)?.[1] ??
        html.match(/<title>([^<]+)<\/title>/)?.[1] ??
        "";

      if (!looksLikePressConferencePage(pageHeadline)) continue;

      stats.livePages += 1;
      const updates = parseLiveBlogUpdates(html, liveUrl);

      for (const update of updates) {
        const publishedAt = parsePubDate(update.datePublished) ?? new Date(fetchedAt);
        upsertItem(
          items,
          buildItem({
            season: params.season,
            fetchedAt,
            teams: params.teams,
            events: params.events,
            headline: update.headline,
            quote: update.articleBody || update.headline,
            source: "bbc_live",
            sourceUrl: update.url,
            publishedAt,
          }),
        );
        stats.liveUpdates += 1;
      }
    } catch (error) {
      console.warn(`Skipping live page ${liveUrl}:`, error);
    }
  }

  return {
    items: [...items.values()].sort(
      (left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime(),
    ),
    stats,
  };
}
