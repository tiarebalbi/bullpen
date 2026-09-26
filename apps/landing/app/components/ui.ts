"use client";

// @bullpen/ui's barrel (`packages/ui/src/index.ts`) re-exports both plain
// components and a hook (`useReducedMotion`) with no "use client" directive
// of its own — each component file carries the directive, but the barrel
// doesn't. Importing the barrel straight from a Server Component (this
// app's `page.tsx` and section components are all Server Components) makes
// Next's RSC analysis walk into `useReducedMotion.ts`'s `useState`/
// `useEffect` calls and fail the build ("You're importing a module that
// depends on useEffect into a React Server Component module").
//
// Re-exporting through this one "use client" file instead draws the
// client/server boundary here, so everything downstream — including the
// hook — is understood as client-graph code. Section components import
// from "./ui" (this file), never "@bullpen/ui" directly.
export {
  Button,
  Chip,
  TickerBadge,
  ConnectionIndicator,
  PriceCell,
  Skeleton,
  EmptyState,
  ErrorState,
  SeriesCard,
  MarketStrip,
  ThemeToggle,
} from "@bullpen/ui";
export type {
  ButtonProps,
  ButtonVariant,
  ChipProps,
  ChipTone,
  TickerBadgeProps,
  TickerBadgeSize,
  ConnectionIndicatorProps,
  ConnectionStatus,
  PriceCellProps,
  PriceCellStatus,
  SkeletonProps,
  EmptyStateProps,
  ErrorStateProps,
  SeriesCardProps,
  SeriesCardStatus,
  MarketStripProps,
  MarketStripQuote,
  MarketStripStatus,
  ThemeToggleProps,
} from "@bullpen/ui";
