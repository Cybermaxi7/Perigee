"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/router";
import { Search, X, ArrowRight, Clock, Zap } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommandCategory =
  | "navigation"
  | "vault"
  | "action"
  | "settings";

export interface Command {
  id: string;
  label: string;
  description?: string;
  category: CommandCategory;
  icon?: React.ReactNode;
  shortcut?: string[];
  /** Called when the user selects this command. */
  onSelect: () => void;
  /** Keywords used in fuzzy matching in addition to `label`. */
  keywords?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABEL: Record<CommandCategory, string> = {
  navigation: "Navigation",
  vault: "Vaults",
  action: "Actions",
  settings: "Settings",
};

const CATEGORY_ORDER: CommandCategory[] = [
  "navigation",
  "vault",
  "action",
  "settings",
];

/** Simple fuzzy match — true when every character in `query` appears in
 *  `target` in order (case-insensitive). */
function fuzzyMatch(target: string, query: string): boolean {
  if (!query) return true;
  const t = target.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    ti = t.indexOf(q[qi], ti);
    if (ti === -1) return false;
    ti++;
  }
  return true;
}

function matchesCommand(cmd: Command, query: string): boolean {
  if (!query) return true;
  const haystack = [cmd.label, cmd.description ?? "", ...(cmd.keywords ?? [])].join(
    " ",
  );
  return fuzzyMatch(haystack, query);
}

const RECENT_COMMANDS_KEY = "perigee:command-palette:recent";
const MAX_RECENT = 5;

function loadRecentIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_COMMANDS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecentId(id: string) {
  try {
    const existing = loadRecentIds().filter((r) => r !== id);
    localStorage.setItem(
      RECENT_COMMANDS_KEY,
      JSON.stringify([id, ...existing].slice(0, MAX_RECENT)),
    );
  } catch {
    // localStorage unavailable — swallow silently
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KbdShortcut({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-0.5">
      {keys.map((k) => (
        <kbd
          key={k}
          className="
            rounded
            border
            border-slate-600
            bg-slate-800
            px-1.5
            py-0.5
            font-mono
            text-[10px]
            text-slate-400
          "
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

interface CommandItemProps {
  command: Command;
  isActive: boolean;
  onSelect: (cmd: Command) => void;
  onMouseEnter: () => void;
}

function CommandItem({
  command,
  isActive,
  onSelect,
  onMouseEnter,
}: CommandItemProps) {
  return (
    <div
      id={`cmd-item-${command.id}`}
      role="option"
      aria-selected={isActive}
      onMouseEnter={onMouseEnter}
      onClick={() => onSelect(command)}
      className={`
        flex
        cursor-pointer
        items-center
        gap-3
        rounded-lg
        px-3
        py-2.5
        transition-colors
        ${isActive ? "bg-sky-500/20 text-sky-300" : "text-slate-300 hover:bg-slate-800"}
      `}
    >
      {/* Icon */}
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-slate-800 text-slate-400">
        {command.icon ?? <ArrowRight size={14} />}
      </span>

      {/* Label + description */}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {command.label}
        </span>
        {command.description && (
          <span className="block truncate text-xs text-slate-500">
            {command.description}
          </span>
        )}
      </span>

      {/* Keyboard shortcut */}
      {command.shortcut && <KbdShortcut keys={command.shortcut} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface CommandPaletteProps {
  /** All available commands. Build this list in the parent with useMemo. */
  commands: Command[];
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Global command palette — activated with ⌘K / Ctrl+K.
 *
 * Features:
 * - Fuzzy search across label, description, and keywords
 * - Keyboard navigation (↑↓ to move, Enter to select, Esc to close)
 * - Categorised results with section headings
 * - Recent commands surfaced when query is empty
 * - Persists recent selections to localStorage
 *
 * Resolves #680 — Implement command palette.
 */
export function CommandPalette({
  commands,
  isOpen,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load recent commands on open
  useEffect(() => {
    if (isOpen) {
      setRecentIds(loadRecentIds());
      setQuery("");
      setActiveIndex(0);
      // Autofocus the input
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Close on Escape, navigate with arrows, select with Enter
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (flatResults[activeIndex]) handleSelect(flatResults[activeIndex]);
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeIndex]);

  // Scroll active item into view
  useEffect(() => {
    const el = document.getElementById(`cmd-item-${flatResults[activeIndex]?.id}`);
    el?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const filtered = useMemo(() => {
    if (!query) {
      // Show recent commands first when no query
      const recentCmds = recentIds
        .map((id) => commands.find((c) => c.id === id))
        .filter(Boolean) as Command[];
      return recentCmds.length > 0 ? recentCmds : commands;
    }
    return commands.filter((c) => matchesCommand(c, query));
  }, [query, commands, recentIds]);

  // Group by category, respecting CATEGORY_ORDER
  const grouped = useMemo(() => {
    const map = new Map<CommandCategory, Command[]>();
    for (const cmd of filtered) {
      const list = map.get(cmd.category) ?? [];
      list.push(cmd);
      map.set(cmd.category, list);
    }
    return CATEGORY_ORDER.filter((cat) => map.has(cat)).map((cat) => ({
      category: cat,
      items: map.get(cat)!,
    }));
  }, [filtered]);

  // Flat list for keyboard navigation
  const flatResults = useMemo(
    () => grouped.flatMap((g) => g.items),
    [grouped],
  );

  const handleSelect = useCallback(
    (cmd: Command) => {
      saveRecentId(cmd.id);
      setRecentIds(loadRecentIds());
      cmd.onSelect();
      onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;

  const showingRecent = !query && recentIds.length > 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="
          fixed
          left-1/2
          top-[20vh]
          z-50
          w-full
          max-w-xl
          -translate-x-1/2
          overflow-hidden
          rounded-2xl
          border
          border-slate-700/60
          bg-slate-900
          shadow-2xl
          shadow-black/60
        "
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-slate-700/60 px-4 py-3">
          <Search size={16} className="flex-shrink-0 text-slate-500" />
          <input
            ref={inputRef}
            id="command-palette-input"
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls="command-palette-list"
            aria-autocomplete="list"
            placeholder="Search commands, vaults, settings…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            className="
              flex-1
              bg-transparent
              text-sm
              text-slate-100
              placeholder-slate-500
              outline-none
            "
          />
          {query && (
            <button
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="text-slate-500 hover:text-slate-300"
            >
              <X size={14} />
            </button>
          )}
          <KbdShortcut keys={["Esc"]} />
        </div>

        {/* Results */}
        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Commands"
          className="max-h-[60vh] overflow-y-auto px-2 py-2"
        >
          {flatResults.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <>
              {showingRecent && (
                <div className="mb-1 flex items-center gap-1.5 px-2 py-1">
                  <Clock size={11} className="text-slate-500" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Recent
                  </span>
                </div>
              )}

              {grouped.map(({ category, items }) => (
                <div key={category} className="mb-2">
                  {/* Section heading — hide when showing recent (single group) */}
                  {!showingRecent && (
                    <div className="mb-1 flex items-center gap-1.5 px-2 py-1">
                      <Zap size={11} className="text-slate-500" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {CATEGORY_LABEL[category]}
                      </span>
                    </div>
                  )}

                  {items.map((cmd) => {
                    const globalIndex = flatResults.indexOf(cmd);
                    return (
                      <CommandItem
                        key={cmd.id}
                        command={cmd}
                        isActive={globalIndex === activeIndex}
                        onSelect={handleSelect}
                        onMouseEnter={() => setActiveIndex(globalIndex)}
                      />
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 border-t border-slate-700/60 px-4 py-2 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <KbdShortcut keys={["↑", "↓"]} />
            <span>Navigate</span>
          </span>
          <span className="flex items-center gap-1">
            <KbdShortcut keys={["↵"]} />
            <span>Select</span>
          </span>
          <span className="flex items-center gap-1">
            <KbdShortcut keys={["Esc"]} />
            <span>Close</span>
          </span>
        </div>
      </div>
    </>
  );
}
