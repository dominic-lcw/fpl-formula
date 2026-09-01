"use client";

import { Search, Trophy } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  searchRankedPlayers,
  type RankedPlayerSuggestion,
} from "@/lib/mosaic-rankings";

type PlayerRankSearchProps = {
  onSelectRank: (rank: number | null) => void;
};

export function PlayerRankSearch({ onSelectRank }: PlayerRankSearchProps) {
  const listboxId = useId();
  const requestId = useRef(0);
  const skipNextSearch = useRef(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<RankedPlayerSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }

    const currentRequest = ++requestId.current;
    let cancelled = false;
    void searchRankedPlayers(trimmedQuery).then(
      (nextSuggestions) => {
        if (cancelled || currentRequest !== requestId.current) return;
        setSuggestions(nextSuggestions);
        setIsOpen(true);
      },
      () => {
        if (cancelled || currentRequest !== requestId.current) return;
        setSuggestions([]);
      },
    ).finally(() => {
      if (!cancelled && currentRequest === requestId.current) setIsSearching(false);
    });

    return () => {
      cancelled = true;
    };
  }, [query]);

  function selectSuggestion(suggestion: RankedPlayerSuggestion) {
    skipNextSearch.current = true;
    setQuery(suggestion.player);
    setIsOpen(false);
    onSelectRank(suggestion.rank);
  }

  const shouldShowSuggestions = isOpen && query.trim().length > 0;

  return (
    <div className="relative w-full sm:w-80">
      <label className="relative block">
        <span className="sr-only">Find player rank</span>
        <Search className="pointer-events-none absolute left-3 top-2.5 text-muted-foreground" size={16} />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            onSelectRank(null);
            if (nextQuery.trim()) {
              setIsSearching(true);
              setIsOpen(true);
            } else {
              requestId.current += 1;
              setSuggestions([]);
              setIsSearching(false);
              setIsOpen(false);
            }
          }}
          onFocus={() => {
            if (suggestions.length) setIsOpen(true);
          }}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={shouldShowSuggestions}
          role="combobox"
          placeholder="Find a player’s rank"
          className="h-9 w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      {shouldShowSuggestions ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Player rank suggestions"
          className="absolute z-10 mt-2 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          {isSearching ? <p className="px-3 py-2 text-sm text-muted-foreground">Searching rankings…</p> : null}
          {!isSearching && !suggestions.length ? <p className="px-3 py-2 text-sm text-muted-foreground">No ranked players found.</p> : null}
          {suggestions.map((suggestion) => (
            <button
              key={`${suggestion.rank}-${suggestion.player}`}
              type="button"
              role="option"
              aria-selected={false}
              aria-label={`${suggestion.player}, rank ${suggestion.rank}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSuggestion(suggestion)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{suggestion.player}</span>
                <span className="block text-xs text-muted-foreground">{suggestion.club} · {suggestion.position} · {suggestion.score.toFixed(1)} score</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                <Trophy size={12} /> #{suggestion.rank}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
