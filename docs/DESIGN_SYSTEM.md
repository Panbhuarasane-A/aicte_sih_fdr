# Design System

This system records the visual values already used by the portal and provides shared tokens for incremental reuse. It preserves the current Noto Sans/system font stack, dark navy surfaces, blue interactions, and restrained saffron/green accents.

## Color tokens

| Token | Value | Intended use |
| --- | --- | --- |
| `--navy-900` | `#0a192f` | Sidebar |
| `--navy-800` | `#0f2b48` | Existing portal header/profile accents |
| `--navy-700` | `#173653` | Content headings and secondary navy |
| `--blue-600` | `#1d4ed8` | Primary actions and selected navigation |
| `--blue-50` | `#eff6ff` | Informational surfaces |
| `--green-600` / `--green-50` | `#0b6b1e` / `#eaf6ec` | Positive status |
| `--amber-600` / `--amber-50` | `#8a4b00` / `#fff4e5` | Warning status |
| `--orange-600` / `--orange-50` | `#c2410c` / `#ffedd5` | Attention status |
| `--red-600` / `--red-50` | `#a31d14` / `#fdecea` | Errors and destructive status |
| `--purple-600` / `--purple-50` | `#7e22ce` / `#f3e8ff` | Secondary category status |
| `--slate-50`–`--slate-900` | `#f8fafc`–`#1a1a1a` | Canvas, borders, and text |
| `--saffron-500` | `#ff9933` | Indian tricolour accent only |
| `--india-green-600` | `#138808` | Indian tricolour accent only |

Legacy variables (`--primary`, `--surface`, `--line`, spacing aliases, and others) are retained as aliases so existing styles remain visually stable during migration. Existing page CSS still contains local color literals; converting every page to tokens is ongoing.

## Layout and interaction tokens

- Radii: `--radius-sm` (8px), `--radius-md` (12px), `--radius-lg` (16px).
- Shadows: `--shadow-sm`, `--shadow-md`.
- Spacing: `--space-1` (4px), `--space-2` (8px), `--space-3` (12px), `--space-4` (16px), `--space-6` (24px), `--space-8` (32px).
- Stacking: `--z-content`, `--z-header`, `--z-sidebar`, `--z-overlay`, `--z-dialog`.
- Focus: a 2px blue outline with a 2px offset; keyboard focus remains visible.
- Typography: Noto Sans when installed, followed by system UI fonts. No new font dependency.

## Shared components and helpers

- `StatusBadge` uses a centralized status map and includes a text label, state mark, and meaning in its accessible name/tooltip.
- `DateRangePicker` provides Today, 7 days, 30 days, This month, custom dates, and a clear action. Date-only inputs are confined to its custom-range popover and date-entry forms.
- `PortalSidebar` is shared by portal pages, has a 240px desktop width, a 72px compact rail at tablet widths, and an off-canvas mobile navigation.
- `formatINR`, `formatPercent`, and `formatDate` centralize common presentation formats; Transaction Verification uses the shared formatters.
- `Badge`, `PageHead`, and `DataTable` remain the existing shared primitives; broader component-library work is in later UI phases.

## Remaining work

- Route pages still render separate page-specific header markup; a single shared AppShell and its global search/notification/user controls have not yet replaced those headers.
- Page CSS contains legacy literals and needs a gradual token migration with visual regression checks.
- The broader library (drawer, evidence comparison, timeline, file dropzone, and toast) and remaining page-specific redesigns are still pending.

## Tooling note

The repository uses Vite and plain CSS and does not include Tailwind. No Tailwind config or new CSS framework was introduced for this phase.
