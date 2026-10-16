import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  Home,
  Vault,
  Settings,
  BarChart2,
  PlusCircle,
  List,
} from "lucide-react";

import { type Command } from "@/components/CommandPalette";

/**
 * Wires up the global ⌘K / Ctrl+K keyboard shortcut and builds the default
 * command list for the CommandPalette.
 *
 * Usage:
 * ```tsx
 * const { isOpen, open, close, commands } = useCommandPalette();
 * return <CommandPalette commands={commands} isOpen={isOpen} onClose={close} />;
 * ```
 *
 * Resolves #680 — Implement command palette.
 */
export function useCommandPalette(extraCommands: Command[] = []) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Register ⌘K / Ctrl+K globally
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  /** Built-in navigation & action commands. */
  const builtinCommands: Command[] = useMemo(
    () => [
      {
        id: "nav-home",
        label: "Go to Home",
        description: "Contract resource analyser dashboard",
        category: "navigation",
        icon: <Home size={14} />,
        keywords: ["dashboard", "main", "index"],
        onSelect: () => router.push("/"),
      },
      {
        id: "nav-vaults",
        label: "Go to Vaults",
        description: "Browse all vaults",
        category: "navigation",
        icon: <Vault size={14} />,
        keywords: ["list", "browse", "all vaults"],
        onSelect: () => router.push("/vaults"),
      },
      {
        id: "nav-portfolio",
        label: "Go to Portfolio Overview",
        description: "View your portfolio breakdown",
        category: "navigation",
        icon: <BarChart2 size={14} />,
        keywords: ["assets", "balance", "holdings", "overview"],
        onSelect: () => router.push("/portfolio"),
      },
      {
        id: "nav-managers",
        label: "Manage Managers",
        description: "Admin — vault manager list",
        category: "navigation",
        icon: <List size={14} />,
        keywords: ["admin", "managers", "onboarding"],
        onSelect: () => router.push("/admin/managers"),
      },
      {
        id: "action-create-vault",
        label: "Create Vault",
        description: "Start the vault creation flow",
        category: "action",
        icon: <PlusCircle size={14} />,
        keywords: ["new", "add", "create"],
        onSelect: () => router.push("/vaults/new"),
      },
      {
        id: "nav-settings",
        label: "Settings",
        description: "App preferences and configuration",
        category: "settings",
        icon: <Settings size={14} />,
        keywords: ["preferences", "config", "options"],
        onSelect: () => router.push("/settings"),
      },
    ],
    [router],
  );

  const commands = useMemo(
    () => [...builtinCommands, ...extraCommands],
    [builtinCommands, extraCommands],
  );

  return { isOpen, open, close, commands };
}
