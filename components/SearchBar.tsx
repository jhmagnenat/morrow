"use client";

import { useMemo, useState } from "react";
import type { Notion } from "@/lib/types";

interface SearchBarProps {
  notions: Notion[];
  query: string;
  onQueryChange: (query: string) => void;
  onPickNotion: (id: string) => void;
}

export default function SearchBar({
  notions,
  query,
  onQueryChange,
  onPickNotion,
}: SearchBarProps) {
  const [focused, setFocused] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return notions.filter((n) => n.label.toLowerCase().includes(q)).slice(0, 8);
  }, [notions, query]);

  return (
    <div className="relative w-44">
      <input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 100)}
        placeholder="Search a notion..."
        className="w-full rounded-md border border-[#423e42] bg-[#28262a] px-3 py-1.5 text-sm text-[#D4C6A6] placeholder:text-[#696A61] focus:border-accent-400/60 focus:outline-none focus:ring-1 focus:ring-accent-400/30"
      />
      {focused && matches.length > 0 && (
        <ul
          style={{ zIndex: 9999 }}
          className="absolute mt-1 w-full overflow-hidden rounded-md border border-[#423e42] bg-[#28262a] shadow-xl"
        >
          {matches.map((notion) => (
            <li key={notion.id}>
              <button
                onClick={() => {
                  onPickNotion(notion.id);
                  onQueryChange("");
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-[#8F8978] hover:bg-[#322f33]"
              >
                {notion.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
