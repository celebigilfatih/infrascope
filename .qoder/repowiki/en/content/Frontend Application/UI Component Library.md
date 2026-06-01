# UI Component Library

<cite>
**Referenced Files in This Document**
- [button.tsx](file://components/ui/button.tsx)
- [input.tsx](file://components/ui/input.tsx)
- [card.tsx](file://components/ui/card.tsx)
- [dialog.tsx](file://components/ui/dialog.tsx)
- [select.tsx](file://components/ui/select.tsx)
- [badge.tsx](file://components/ui/badge.tsx)
- [switch.tsx](file://components/ui/switch.tsx)
- [table.tsx](file://components/ui/table.tsx)
- [tabs.tsx](file://components/ui/tabs.tsx)
- [label.tsx](file://components/ui/label.tsx)
- [alert-dialog.tsx](file://components/ui/alert-dialog.tsx)
- [progress.tsx](file://components/ui/progress.tsx)
- [loading-bar.tsx](file://components/ui/loading-bar.tsx)
- [navigation-progress.tsx](file://components/ui/navigation-progress.tsx)
- [toast.tsx](file://components/ui/toast.tsx)
- [toaster.tsx](file://components/ui/toaster.tsx)
- [use-toast.ts](file://components/ui/use-toast.ts)
- [layout.tsx](file://app/layout.tsx)
- [globals.css](file://app/globals.css)
- [tailwind.config.js](file://tailwind.config.js)
- [components.json](file://components.json)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document describes the InfraScope UI component library, a set of reusable React components built with Radix UI primitives and styled with Tailwind CSS. It focuses on component composition patterns, prop interfaces, variants and sizes, state management integration, accessibility, styling approaches, responsive design, cross-browser compatibility, and extension guidelines. The goal is to help developers understand how to use, customize, and extend the components effectively.

## Project Structure
The UI components live under components/ui and are organized by function and primitive. They integrate with:
- Radix UI for accessible, unstyled base primitives
- Tailwind CSS for styling and theme tokens
- Utility helpers for class merging and theme-aware tokens

```mermaid
graph TB
subgraph "App Shell"
L["app/layout.tsx"]
G["app/globals.css"]
end
subgraph "Tailwind & Theme"
T["tailwind.config.js"]
C["components.json"]
end
subgraph "UI Components"
BTN["button.tsx"]
INP["input.tsx"]
CARD["card.tsx"]
DLG["dialog.tsx"]
SEL["select.tsx"]
BADGE["badge.tsx"]
SW["switch.tsx"]
TABS["tabs.tsx"]
TBL["table.tsx"]
LAB["label.tsx"]
ADLG["alert-dialog.tsx"]
PROG["progress.tsx"]
LBAR["loading-bar.tsx"]
NP["navigation-progress.tsx"]
TS["toast.tsx"]
TSTR["toaster.tsx"]
UT["use-toast.ts"]
end
L --> G
G --> T
T --> BTN
T --> INP
T --> CARD
T --> DLG
T --> SEL
T --> BADGE
T --> SW
T --> TABS
T --> TBL
T --> LAB
T --> ADLG
T --> PROG
T --> LBAR
T --> NP
T --> TS
T --> TSTR
T --> UT
```

**Diagram sources**
- [layout.tsx](file://app/layout.tsx)
- [globals.css](file://app/globals.css)
- [tailwind.config.js](file://tailwind.config.js)
- [components.json](file://components.json)
- [button.tsx](file://components/ui/button.tsx)
- [input.tsx](file://components/ui/input.tsx)
- [card.tsx](file://components/ui/card.tsx)
- [dialog.tsx](file://components/ui/dialog.tsx)
- [select.tsx](file://components/ui/select.tsx)
- [badge.tsx](file://components/ui/badge.tsx)
- [switch.tsx](file://components/ui/switch.tsx)
- [table.tsx](file://components/ui/table.tsx)
- [tabs.tsx](file://components/ui/tabs.tsx)
- [label.tsx](file://components/ui/label.tsx)
- [alert-dialog.tsx](file://components/ui/alert-dialog.tsx)
- [progress.tsx](file://components/ui/progress.tsx)
- [loading-bar.tsx](file://components/ui/loading-bar.tsx)
- [navigation-progress.tsx](file://components/ui/navigation-progress.tsx)
- [toast.tsx](file://components/ui/toast.tsx)
- [toaster.tsx](file://components/ui/toaster.tsx)
- [use-toast.ts](file://components/ui/use-toast.ts)

**Section sources**
- [layout.tsx](file://app/layout.tsx)
- [globals.css](file://app/globals.css)
- [tailwind.config.js](file://tailwind.config.js)
- [components.json](file://components.json)

## Core Components
This section summarizes the primary UI components, their purpose, and key props. Variants and sizes are defined per component and documented in later sections.

- Button: Base action with variants (default, destructive, outline, secondary, ghost, link) and sizes (default, sm, lg, icon). Supports asChild composition via Radix Slot.
- Input: Text input with focus-visible ring and disabled states.
- Card: Layout container with header, footer, title, description, and content slots.
- Dialog: Modal overlay and content with portal rendering, close button, and header/footer/title/description slots.
- Select: Composite dropdown with trigger, content, viewport, items, separators, and scroll buttons.
- Badge: Tag-like indicator with variants (default, secondary, destructive, outline, success, warning).
- Switch: Toggle control with Radix primitives and data-state classes.
- Table: Scrollable table wrapper and semantic parts (table, thead, tbody, tfoot, tr, th, td, caption).
- Tabs: Tab list, triggers, and content areas with active state styling.
- Label: Accessible label for form controls with disabled support.
- Alert Dialog: Confirmation dialog built on Radix primitives with action and cancel buttons.
- Progress: Determinate progress indicator using Radix primitives.
- Loading Bar: Global slim progress bar at the top during navigation.
- Navigation Progress: Top progress bar and optional overlay during navigation.
- Toast: Notification system with provider, viewport, toast, title, description, action, and close.
- Toaster: Toast consumer component.
- use-toast: Hook to enqueue toasts.

**Section sources**
- [button.tsx](file://components/ui/button.tsx)
- [input.tsx](file://components/ui/input.tsx)
- [card.tsx](file://components/ui/card.tsx)
- [dialog.tsx](file://components/ui/dialog.tsx)
- [select.tsx](file://components/ui/select.tsx)
- [badge.tsx](file://components/ui/badge.tsx)
- [switch.tsx](file://components/ui/switch.tsx)
- [table.tsx](file://components/ui/table.tsx)
- [tabs.tsx](file://components/ui/tabs.tsx)
- [label.tsx](file://components/ui/label.tsx)
- [alert-dialog.tsx](file://components/ui/alert-dialog.tsx)
- [progress.tsx](file://components/ui/progress.tsx)
- [loading-bar.tsx](file://components/ui/loading-bar.tsx)
- [navigation-progress.tsx](file://components/ui/navigation-progress.tsx)
- [toast.tsx](file://components/ui/toast.tsx)
- [toaster.tsx](file://components/ui/toaster.tsx)
- [use-toast.ts](file://components/ui/use-toast.ts)

## Architecture Overview
The UI library follows a consistent pattern:
- Each component composes Radix UI primitives for accessibility and keyboard interaction.
- Tailwind utilities define base styles and responsive behavior.
- Variants and sizes are centralized via class-variance-authority (CVA) for predictable styling.
- Composition is achieved through forwardRef, className merging, and asChild patterns.
- Stateful components integrate with React hooks and Next.js router hooks for navigation indicators.

```mermaid
graph LR
subgraph "Radix Primitives"
RP1["Dialog Root/Overlay/Content/Trigger/Close"]
RP2["Select Root/Trigger/Content/Item"]
RP3["Tabs Root/List/Trigger/Content"]
RP4["Toast Provider/Viewport/Root"]
RP5["Alert Dialog Root/Overlay/Content"]
RP6["Progress Root/Indicator"]
RP7["Switch Root/Thumb"]
RP8["Label Root"]
end
subgraph "Theme & Utilities"
TW["Tailwind Classes"]
CN["cn() merge"]
CVA["CVA Variants"]
end
BTN["Button"] --> RP1
DLG["Dialog"] --> RP1
SEL["Select"] --> RP2
TABS["Tabs"] --> RP3
TS["Toast"] --> RP4
ADLG["Alert Dialog"] --> RP5
PROG["Progress"] --> RP6
SW["Switch"] --> RP7
LAB["Label"] --> RP8
BTN --- CVA
BTN --- TW
DLG --- TW
SEL --- TW
TABS --- TW
TS --- TW
ADLG --- TW
PROG --- TW
SW --- TW
LAB --- TW
CN --- TW
```

**Diagram sources**
- [button.tsx](file://components/ui/button.tsx)
- [dialog.tsx](file://components/ui/dialog.tsx)
- [select.tsx](file://components/ui/select.tsx)
- [tabs.tsx](file://components/ui/tabs.tsx)
- [toast.tsx](file://components/ui/toast.tsx)
- [alert-dialog.tsx](file://components/ui/alert-dialog.tsx)
- [progress.tsx](file://components/ui/progress.tsx)
- [switch.tsx](file://components/ui/switch.tsx)
- [label.tsx](file://components/ui/label.tsx)

## Detailed Component Analysis

### Button
- Purpose: Primary action with consistent focus, hover, and disabled states.
- Props:
  - Inherits standard button attributes.
  - variant: default | destructive | outline | secondary | ghost | link
  - size: default | sm | lg | icon
  - asChild: wrap children in a Radix Slot for composition
- Variants and sizes: Defined via CVA with Tailwind tokens.
- Accessibility: Focus-visible ring, disabled pointer-events and reduced opacity.
- Composition: asChild enables semantic wrappers (e.g., Link) while preserving styling.

```mermaid
classDiagram
class Button {
+variant : "default"|"destructive"|"outline"|"secondary"|"ghost"|"link"
+size : "default"|"sm"|"lg"|"icon"
+asChild : boolean
+className : string
}
class buttonVariants {
+apply(variant,size,className) string
}
Button --> buttonVariants : "uses"
```

**Diagram sources**
- [button.tsx](file://components/ui/button.tsx)

**Section sources**
- [button.tsx](file://components/ui/button.tsx)

### Input
- Purpose: Text input with focus ring, disabled state, and placeholder styling.
- Props: Inherits standard input attributes.
- Accessibility: Focus-visible ring and disabled cursor.
- Styling: Tailwind utilities for padding, border, and ring tokens.

```mermaid
classDiagram
class Input {
+type : string
+className : string
}
```

**Diagram sources**
- [input.tsx](file://components/ui/input.tsx)

**Section sources**
- [input.tsx](file://components/ui/input.tsx)

### Card
- Purpose: Container for content with header, title, description, content, and footer.
- Slots: Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter.
- Styling: Uses card and foreground tokens; spacing via padding and flex utilities.

```mermaid
classDiagram
class Card {
+className : string
}
class CardHeader {
+className : string
}
class CardTitle {
+className : string
}
class CardDescription {
+className : string
}
class CardContent {
+className : string
}
class CardFooter {
+className : string
}
Card <.. CardHeader
Card <.. CardTitle
Card <.. CardDescription
Card <.. CardContent
Card <.. CardFooter
```

**Diagram sources**
- [card.tsx](file://components/ui/card.tsx)

**Section sources**
- [card.tsx](file://components/ui/card.tsx)

### Dialog
- Purpose: Modal overlay with animated entrance/exit and close button.
- Parts: Root, Trigger, Portal, Overlay, Content, Header, Footer, Title, Description.
- Behavior: Overlay animates in/out; Content centers with portal rendering.
- Accessibility: Focus trapping and escape handling via Radix.

```mermaid
sequenceDiagram
participant U as "User"
participant D as "Dialog"
participant O as "Overlay"
participant C as "Content"
participant CL as "Close"
U->>D : Open via Trigger
D->>O : Render overlay
D->>C : Render content centered
U->>CL : Click close
CL->>D : Close
D->>O : Fade out
D->>C : Slide out
```

**Diagram sources**
- [dialog.tsx](file://components/ui/dialog.tsx)

**Section sources**
- [dialog.tsx](file://components/ui/dialog.tsx)

### Select
- Purpose: Dropdown selection with scrollable viewport and item indicators.
- Parts: Root, Group, Value, Trigger, Content, Label, Item, Separator, ScrollUp/Down buttons.
- Positioning: Popper offset classes applied conditionally.
- Accessibility: Keyboard navigation and focus management via Radix.

```mermaid
flowchart TD
Start(["Open Select"]) --> Viewport["Render Viewport"]
Viewport --> Items["Render Items with Indicators"]
Items --> SelectItem{"Select Item?"}
SelectItem --> |Yes| SetValue["Set Value"]
SelectItem --> |No| Scroll["Scroll Up/Down Buttons"]
Scroll --> Viewport
SetValue --> Close(["Close"])
```

**Diagram sources**
- [select.tsx](file://components/ui/select.tsx)

**Section sources**
- [select.tsx](file://components/ui/select.tsx)

### Badge
- Purpose: Lightweight tag or status indicator.
- Props: variant: default | secondary | destructive | outline | success | warning
- Styling: CVA with border, color, and hover tokens.

```mermaid
classDiagram
class Badge {
+variant : "default"|"secondary"|"destructive"|"outline"|"success"|"warning"
+className : string
}
class badgeVariants {
+apply(variant,className) string
}
Badge --> badgeVariants : "uses"
```

**Diagram sources**
- [badge.tsx](file://components/ui/badge.tsx)

**Section sources**
- [badge.tsx](file://components/ui/badge.tsx)

### Switch
- Purpose: Boolean toggle with thumb animation.
- Props: Inherits Switch root attributes; styled via data-state classes.
- Accessibility: Focus-visible ring and disabled state.

```mermaid
classDiagram
class Switch {
+className : string
}
```

**Diagram sources**
- [switch.tsx](file://components/ui/switch.tsx)

**Section sources**
- [switch.tsx](file://components/ui/switch.tsx)

### Table
- Purpose: Scrollable table with semantic parts and hover/selected states.
- Parts: Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption.
- Responsiveness: Wrapper ensures horizontal scrolling on small screens.

```mermaid
classDiagram
class Table {
+className : string
}
class TableHeader {
+className : string
}
class TableBody {
+className : string
}
class TableFooter {
+className : string
}
class TableRow {
+className : string
}
class TableHead {
+className : string
}
class TableCell {
+className : string
}
class TableCaption {
+className : string
}
Table <.. TableHeader
Table <.. TableBody
Table <.. TableFooter
Table <.. TableRow
Table <.. TableHead
Table <.. TableCell
Table <.. TableCaption
```

**Diagram sources**
- [table.tsx](file://components/ui/table.tsx)

**Section sources**
- [table.tsx](file://components/ui/table.tsx)

### Tabs
- Purpose: Tabbed interface with active state styling.
- Parts: Root, List, Trigger, Content.
- Accessibility: Active state via data-state attributes.

```mermaid
sequenceDiagram
participant U as "User"
participant T as "Tabs"
participant TR as "Trigger"
participant CT as "Content"
U->>TR : Click tab
TR->>T : Activate
T->>CT : Show associated content
```

**Diagram sources**
- [tabs.tsx](file://components/ui/tabs.tsx)

**Section sources**
- [tabs.tsx](file://components/ui/tabs.tsx)

### Label
- Purpose: Accessible label for form controls.
- Props: Inherits Label root attributes; variant via CVA.
- Accessibility: Peer-disabled cursor and opacity.

```mermaid
classDiagram
class Label {
+className : string
}
class labelVariants {
+apply() string
}
Label --> labelVariants : "uses"
```

**Diagram sources**
- [label.tsx](file://components/ui/label.tsx)

**Section sources**
- [label.tsx](file://components/ui/label.tsx)

### Alert Dialog
- Purpose: Confirmation dialog with action and cancel buttons.
- Parts: Root, Portal, Overlay, Content, Header, Footer, Title, Description, Action, Cancel.
- Styling: Reuses Button variants for Action and Cancel.

```mermaid
sequenceDiagram
participant U as "User"
participant AD as "Alert Dialog"
participant ACT as "Action"
participant CAN as "Cancel"
U->>AD : Open
AD-->>U : Show message
U->>ACT : Confirm
ACT->>AD : Close
U->>CAN : Cancel
CAN->>AD : Close
```

**Diagram sources**
- [alert-dialog.tsx](file://components/ui/alert-dialog.tsx)
- [button.tsx](file://components/ui/button.tsx)

**Section sources**
- [alert-dialog.tsx](file://components/ui/alert-dialog.tsx)
- [button.tsx](file://components/ui/button.tsx)

### Progress
- Purpose: Determinate progress indicator.
- Props: value number; indicator transforms based on percentage.
- Accessibility: No interactive state; relies on value semantics.

```mermaid
flowchart TD
Start(["Render Progress"]) --> Calc["Compute width from value"]
Calc --> Apply["Apply transform to indicator"]
Apply --> End(["Visible progress"])
```

**Diagram sources**
- [progress.tsx](file://components/ui/progress.tsx)

**Section sources**
- [progress.tsx](file://components/ui/progress.tsx)

### Loading Bar
- Purpose: Global slim progress bar during navigation.
- State: Tracks loading and progress; resets on route change.
- Effects: Simulates progress with intervals; fades out after route completion.

```mermaid
flowchart TD
Start(["Mount"]) --> Listen["Listen for navigation start"]
Listen --> OnStart["Set loading=true, progress=10"]
OnStart --> Loop["Interval updates progress"]
Loop --> RouteChange{"Route changed?"}
RouteChange --> |Yes| Reset["Reset loading=false, progress=0"]
RouteChange --> |No| Loop
Reset --> End(["Unmount or hidden"])
```

**Diagram sources**
- [loading-bar.tsx](file://components/ui/loading-bar.tsx)

**Section sources**
- [loading-bar.tsx](file://components/ui/loading-bar.tsx)

### Navigation Progress
- Purpose: Top progress bar and optional overlay during navigation.
- State: Manages navigating flag and progress; intercepts internal link clicks.
- Effects: Smooth width transitions; fades out after completion.

```mermaid
sequenceDiagram
participant DOC as "Document"
participant NP as "NavigationProgress"
participant WIN as "Window"
DOC->>NP : Click anchor
NP->>WIN : Check internal link
WIN-->>NP : Internal navigation detected
NP->>NP : Set navigating=true, progress=10
NP->>NP : Simulate progress
NP->>NP : On route change : progress=100, then reset
```

**Diagram sources**
- [navigation-progress.tsx](file://components/ui/navigation-progress.tsx)

**Section sources**
- [navigation-progress.tsx](file://components/ui/navigation-progress.tsx)

### Toast System
- Provider: Manages toast queue and viewport.
- Components: Toast, Title, Description, Action, Close.
- Variants: default | destructive.
- Interactions: Swipe-to-dismiss, hover opacity, close button.

```mermaid
sequenceDiagram
participant APP as "App"
participant UT as "use-toast"
participant TP as "Toast Provider"
participant TV as "Toast Viewport"
participant T as "Toast"
APP->>UT : enqueue({title, description, action})
UT->>TP : Add to queue
TP->>TV : Render toast
TV->>T : Show with animations
T-->>APP : Dismiss or auto-hide
```

**Diagram sources**
- [toast.tsx](file://components/ui/toast.tsx)
- [use-toast.ts](file://components/ui/use-toast.ts)
- [toaster.tsx](file://components/ui/toaster.tsx)

**Section sources**
- [toast.tsx](file://components/ui/toast.tsx)
- [use-toast.ts](file://components/ui/use-toast.ts)
- [toaster.tsx](file://components/ui/toaster.tsx)

## Dependency Analysis
- Radix UI: Used across Dialog, Select, Tabs, Toast, Alert Dialog, Progress, Switch, and Label to ensure accessible behavior.
- Tailwind CSS: Applied via cn() merges and CVA variants; theme tokens drive colors and spacing.
- Next.js Navigation: Loading bars use usePathname and useSearchParams for route-aware behavior.
- Composition: asChild enables wrapping components (e.g., Button inside Link) while preserving styles.

```mermaid
graph TB
BTN["Button"] --> RADIX["Radix UI"]
DLG["Dialog"] --> RADIX
SEL["Select"] --> RADIX
TABS["Tabs"] --> RADIX
TS["Toast"] --> RADIX
ADLG["Alert Dialog"] --> RADIX
PROG["Progress"] --> RADIX
SW["Switch"] --> RADIX
LAB["Label"] --> RADIX
BTN --> TWT["Tailwind Tokens"]
DLG --> TWT
SEL --> TWT
TABS --> TWT
TS --> TWT
ADLG --> TWT
PROG --> TWT
SW --> TWT
LAB --> TWT
LBAR["Loading Bar"] --> NEXT["Next.js Router Hooks"]
NP["Navigation Progress"] --> NEXT
```

**Diagram sources**
- [button.tsx](file://components/ui/button.tsx)
- [dialog.tsx](file://components/ui/dialog.tsx)
- [select.tsx](file://components/ui/select.tsx)
- [tabs.tsx](file://components/ui/tabs.tsx)
- [toast.tsx](file://components/ui/toast.tsx)
- [alert-dialog.tsx](file://components/ui/alert-dialog.tsx)
- [progress.tsx](file://components/ui/progress.tsx)
- [switch.tsx](file://components/ui/switch.tsx)
- [label.tsx](file://components/ui/label.tsx)
- [loading-bar.tsx](file://components/ui/loading-bar.tsx)
- [navigation-progress.tsx](file://components/ui/navigation-progress.tsx)

**Section sources**
- [button.tsx](file://components/ui/button.tsx)
- [dialog.tsx](file://components/ui/dialog.tsx)
- [select.tsx](file://components/ui/select.tsx)
- [tabs.tsx](file://components/ui/tabs.tsx)
- [toast.tsx](file://components/ui/toast.tsx)
- [alert-dialog.tsx](file://components/ui/alert-dialog.tsx)
- [progress.tsx](file://components/ui/progress.tsx)
- [switch.tsx](file://components/ui/switch.tsx)
- [label.tsx](file://components/ui/label.tsx)
- [loading-bar.tsx](file://components/ui/loading-bar.tsx)
- [navigation-progress.tsx](file://components/ui/navigation-progress.tsx)

## Performance Considerations
- Prefer CVA variants for consistent, cache-friendly class generation.
- Use minimal re-renders by passing stable refs and avoiding unnecessary prop churn.
- For navigation indicators, throttle progress updates to reduce layout thrash.
- Keep portal-rendered overlays scoped to z-index ranges to avoid stacking conflicts.
- Avoid heavy inline styles; rely on Tailwind utilities and theme tokens.

## Troubleshooting Guide
- Dialog/Select/Alert Dialog not closing:
  - Ensure Close or Cancel triggers are present and reachable via keyboard.
  - Verify Portal rendering and overlay click handlers.
- Select items not selectable:
  - Confirm Item is within Viewport and not disabled.
  - Check data-state classes and item indicators.
- Button styles not applying:
  - Verify variant and size combinations match CVA definitions.
  - Ensure className merging does not override critical tokens.
- Toast not visible:
  - Confirm Provider wraps the app and Viewport is rendered.
  - Check z-index and viewport positioning.
- Navigation progress not appearing:
  - Ensure NavigationProgress is mounted and internal link detection conditions match.
  - Verify route change effects are firing.

**Section sources**
- [dialog.tsx](file://components/ui/dialog.tsx)
- [select.tsx](file://components/ui/select.tsx)
- [alert-dialog.tsx](file://components/ui/alert-dialog.tsx)
- [button.tsx](file://components/ui/button.tsx)
- [toast.tsx](file://components/ui/toast.tsx)
- [navigation-progress.tsx](file://components/ui/navigation-progress.tsx)

## Conclusion
InfraScope’s UI component library emphasizes accessibility, composability, and consistent styling through Radix UI and Tailwind CSS. By leveraging CVA variants, portal rendering, and theme tokens, components remain flexible, maintainable, and easy to extend. Following the patterns outlined here ensures predictable behavior across the application.

## Appendices

### Styling Approach and Theme Tokens
- Tailwind configuration and component registry:
  - Tailwind configuration defines theme tokens and plugin behavior.
  - Components.json registers local component sets for tooling.
- Theme tokens:
  - Primary, secondary, muted, destructive, border, input, ring, and foreground tokens are used across components.
- Utility merging:
  - cn() consolidates default classes with overrides safely.

**Section sources**
- [tailwind.config.js](file://tailwind.config.js)
- [components.json](file://components.json)
- [globals.css](file://app/globals.css)

### Responsive Design Principles
- Mobile-first utilities: Use responsive prefixes to scale padding, margin, and typography.
- Scrollable containers: Wrap wide tables and modals to prevent overflow.
- Overlay placement: Centered content with translate and max-width constraints.

**Section sources**
- [table.tsx](file://components/ui/table.tsx)
- [dialog.tsx](file://components/ui/dialog.tsx)
- [select.tsx](file://components/ui/select.tsx)

### Cross-Browser Compatibility
- Radix primitives provide cross-browser keyboard and focus behavior.
- Tailwind utilities are transpiled via PostCSS; ensure browserlist targets are configured.
- Avoid vendor-prefixed CSS; rely on Tailwind utilities and Radix animations.

**Section sources**
- [button.tsx](file://components/ui/button.tsx)
- [tabs.tsx](file://components/ui/tabs.tsx)
- [toast.tsx](file://components/ui/toast.tsx)

### Extending Components and Creating New Components
- Follow the CVA pattern for variants and sizes.
- Compose Radix primitives for accessibility and state.
- Use cn() to merge defaults with overrides.
- Export a forwardRef component with displayName for debugging.
- Add tests for interaction states and keyboard navigation.

**Section sources**
- [button.tsx](file://components/ui/button.tsx)
- [card.tsx](file://components/ui/card.tsx)
- [tabs.tsx](file://components/ui/tabs.tsx)

### Best Practices for Component Testing and Documentation
- Test accessibility: keyboard navigation, focus order, ARIA roles.
- Test variants and sizes: render each combination and assert class presence.
- Test interactions: open/close dialogs, select items, toggle switches, navigate tabs.
- Document props: include union types and default values.
- Document variants: list all options and describe visual differences.
- Document composition: explain asChild usage and Slot wrapping.

**Section sources**
- [dialog.tsx](file://components/ui/dialog.tsx)
- [select.tsx](file://components/ui/select.tsx)
- [tabs.tsx](file://components/ui/tabs.tsx)
- [badge.tsx](file://components/ui/badge.tsx)
- [switch.tsx](file://components/ui/switch.tsx)
- [table.tsx](file://components/ui/table.tsx)
- [label.tsx](file://components/ui/label.tsx)
- [alert-dialog.tsx](file://components/ui/alert-dialog.tsx)
- [progress.tsx](file://components/ui/progress.tsx)
- [loading-bar.tsx](file://components/ui/loading-bar.tsx)
- [navigation-progress.tsx](file://components/ui/navigation-progress.tsx)
- [toast.tsx](file://components/ui/toast.tsx)
- [toaster.tsx](file://components/ui/toaster.tsx)
- [use-toast.ts](file://components/ui/use-toast.ts)