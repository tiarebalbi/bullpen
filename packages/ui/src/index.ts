export { Button } from "./components/Button.js";
export type { ButtonProps, ButtonVariant } from "./components/Button.js";

export { Chip } from "./components/Chip.js";
export type { ChipProps, ChipTone } from "./components/Chip.js";

export { TickerBadge } from "./components/TickerBadge.js";
export type { TickerBadgeProps, TickerBadgeSize } from "./components/TickerBadge.js";

export { ConnectionIndicator } from "./components/ConnectionIndicator.js";
export type { ConnectionIndicatorProps, ConnectionStatus } from "./components/ConnectionIndicator.js";

export { PriceCell } from "./components/PriceCell.js";
export type { PriceCellProps, PriceCellStatus } from "./components/PriceCell.js";

export { Skeleton } from "./components/Skeleton.js";
export type { SkeletonProps } from "./components/Skeleton.js";

export { EmptyState } from "./components/EmptyState.js";
export type { EmptyStateProps } from "./components/EmptyState.js";

export { ErrorState } from "./components/ErrorState.js";
export type { ErrorStateProps } from "./components/ErrorState.js";

export { SeriesCard } from "./components/SeriesCard.js";
export type { SeriesCardProps, SeriesCardStatus } from "./components/SeriesCard.js";

export { MarketStrip } from "./components/MarketStrip.js";
export type { MarketStripProps, MarketStripQuote, MarketStripStatus } from "./components/MarketStrip.js";

export { ThemeToggle } from "./components/ThemeToggle.js";
export type { ThemeToggleProps } from "./components/ThemeToggle.js";

export { ArchitectureExplorer } from "./components/ArchitectureExplorer.js";
export type {
  ArchitectureExplorerProps,
  ArchNodeKind,
  ArchNodeData,
  ArchEdgeData,
  ArchGroupData,
  ArchPartData,
  ArchRequestStep,
  ArchRequestData,
} from "./components/ArchitectureExplorer.js";

export { useReducedMotion } from "./lib/useReducedMotion.js";
export { useNow } from "./lib/useNow.js";
export { MINUS, fmt, signed, mono, badgeBg, formatTime } from "./lib/format.js";

export { Analytics } from "./analytics/Analytics.js";
export type { AnalyticsProps } from "./analytics/Analytics.js";
export { ConsentBanner } from "./analytics/ConsentBanner.js";
export type { ConsentBannerProps } from "./analytics/ConsentBanner.js";
export { CookieSettingsButton } from "./analytics/CookieSettingsButton.js";
export { resolveAnalyticsConfig } from "./analytics/config.js";
export type { AnalyticsConfig, AnalyticsEnv } from "./analytics/config.js";
export { track } from "./analytics/track.js";
export type { AnalyticsEvents } from "./analytics/track.js";
