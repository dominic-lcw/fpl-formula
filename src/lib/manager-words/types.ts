export type ManagerWordsSource = "bbc_live" | "bbc_rss" | "bbc_team_rss";

export type ManagerPressItem = {
  id: string;
  season: string;
  gameweek: number | null;
  teamId: number | null;
  teamName: string | null;
  managerName: string | null;
  headline: string;
  quote: string;
  source: ManagerWordsSource;
  sourceUrl: string;
  publishedAt: string;
  fetchedAt: string;
};

export type FplTeamRef = {
  id: number;
  name: string;
  shortName: string;
};

export type FplEventRef = {
  id: number;
  name: string;
  deadlineTime: string;
  finished: boolean;
};

export type ManagerWordsFetchResult = {
  season: string;
  fetchedAt: string;
  items: ManagerPressItem[];
  sources: {
    rssArticles: number;
    livePages: number;
    liveUpdates: number;
  };
};
