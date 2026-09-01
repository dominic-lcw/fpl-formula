"use client";

import { Search, Trophy } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  searchRankedPlayers,
  type RankedPlayerSuggestion,
} from "@/lib/mosaic-rankings";

type PlayerRankSearchProps = {
  version: number;
  onSelectRank: (rank: number | null) => void;
};

export function PlayerRankSearch({ version, onSelectRank }: PlayerRankSearchProps) {
  const listboxId = useId();
  const requestId = useRef(0);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<RankedPlayerSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    requestId.current += 1;
    setQuery("");
    setSuggestions([]);
    setIsSearching(false);
    setIsOpen(false);
    onSelectRank(null);
  }, [version, onSelectRank]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      requestId.current += 1;
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    const currentRequest = ++requestId.current;
    setIsSearching(true);
    void searchRankedPlayers(trimmedQuery).then(
      (nextSuggestions) => {
        if (currentRequest !== requestId.current) return;
        setSuggestions(nextSuggestions);
        setIsOpen(true);
      },
      () => {
        if (currentRequest !== requestId.current) return;
        setSuggestions([]);
      },
    ).finally(() => {
      if (currentRequest === requestId.current) setIsSearching(false);
    });
  }, [query]);

  function selectSuggestion(suggestion: RankedPlayerSuggestion) {
    setQuery(suggestion.player);
    setIsOpen(false);
    onSelectRank(suggestion.rank);
  }

  const shouldShowSuggestions = isOpen && query.trim().length > 0;

  return (
    <div className="relative w-full sm:w-80">
      <label className="relative block">
        <span className="sr-only">Find player rank</span>
        <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-500" size={16} />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            onSelectRank(null);
          }}
          onFocus={() => {
            if (suggestions.length) setIsOpen(true);
          }}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={shouldShowSuggestions}
          placeholder="Find a player’s rank"
          className="w-full rounded-lg border border-white/10 bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-cyan-300"
        />
      </label>
      {shouldShowSuggestions ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Player rank suggestions"
          className="absolute z-10 mt-2 w-full overflow-hidden rounded-lg border border-white/10 bg-slate-900 shadow-xl shadow-slate-950/40"
        >
          {isSearching ? <p className="px-3 py-2 text-sm text-slate-400">Searching rankings…</p> : null}
          {!isSearching && !suggestions.length ? <p className="px-3 py-2 text-sm text-slate-400">No ranked players found.</p> : null}
          {suggestions.map((suggestion) => (
            <button
              key={`${suggestion.rank}-${suggestion.player}`}
              type="button"
              role="option"
              aria-label={`${suggestion.player}, rank ${suggestion.rank}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectSuggestion(suggestion)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-white/5 focus:bg-white/5 focus:outline-none"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-100">{suggestion.player}</span>
                <span className="block text-xs text-slate-400">{suggestion.club} · {suggestion.position} · {suggestion.score.toFixed(1)} score</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs font-semibold text-cyan-100">
                <Trophy size={12} /> #{suggestion.rank}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
