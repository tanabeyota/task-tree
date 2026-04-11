# Task Tree v3.0 Architecture Implementation Plan

This plan completely maps out the migration from the newly stabilized v2.0 (DOM-based editor and LocalStorage) to the robust, scalable v3.0 architecture (IndexedDB, Tiptap, Floating UI, React 18 Concurrent features).

## User Review Required

> [!WARNING]
> This is a massive architectural refactor. It will introduce several external libraries (Tiptap, Floating UI, UX libraries) and completely alter how storage operates (migrating from `localStorage` to `IndexedDB`).
> Please review the planned phases below and confirm if you approve.

## Proposed Changes

### [Phase 1: Dependencies & Directory Reorganization]
*Installing core v3.0 packages and aligning files to the new domain-driven layout.*

#### [MODIFY] [Package Management]
- **Run**: `npm install @tiptap/react @tiptap/starter-kit @floating-ui/react idb-keyval uuid vite-plugin-pwa`
- **Run**: `npm install -D vitest @playwright/test`
- Reorganize directories into `src/components/canvas`, `src/components/ui`, `src/engines`, and `src/utils`.

---

### [Phase 2: IndexedDB, UUID, and Zundo Filtering]
*Enhancing the Single Source of Truth architecture.*

#### [MODIFY] [src/store/useTaskStore.ts](file:///c:/Users/y-tanabe/Desktop/task-tree/task-tree/src/store/useTaskStore.ts)
- Replace `localStorage` in the `persist` middleware with an asynchronous `idb-keyval` custom storage adapter.
- Swap sequential ID generation (`node_1`) for `uuidv4()`.
- Configure `zundo`'s `partialize` or `filter` options to completely ignore state changes triggered by the automated Timer/Color updates.

---

### [Phase 3: Tiptap Headless Editor Migration]
*Eliminating deprecated DOM APIs in favor of a robust Rich Text engine.*

#### [MODIFY] [src/components/canvas/TaskNode.tsx]
- Remove the raw contentEditable `div` and `document.execCommand`.
- Mount Tiptap's `useEditor()` utilizing the `StarterKit`.
- Migrate `・` list conversions to native Tiptap schema sanitization.
- Hook React keyboard events (`Tab`, `Ctrl+Enter`) wrapping the Editor.

---

### [Phase 4: Floating UI & Native React Flow Intersection]
*Refining spatial logic without hacky `requestAnimationFrame` and DOM checks.*

#### [MODIFY] [src/components/ui/FloatingMenu.tsx]
- Implement `@floating-ui/react` (`useFloating`, `shift`, `flip`, `offset`) bound to the virtual element coordinates of the active node.

#### [MODIFY] [src/components/canvas/TaskCanvas.tsx] (formerly App.tsx)
- Refactor `onNodeDragStop`. Instead of parsing `document.elementsFromPoint`, utilize `useReactFlow().getIntersectingNodes()` for immaculate circular/hierarchy drop detection.

---

### [Phase 5: Concurrent Features & PWA]
*Polishing UX responsiveness and offline capabilities.*

#### [MODIFY] [src/components/ui/SearchBar.tsx]
- Wrap the search query bindings using React 18's `useDeferredValue` to unblock typing during massive tree filtering.

#### [MODIFY] [vite.config.ts]
- Inject `VitePWA` specifying manifest details and offline caching strategies.

---

### [Phase 6: Automated Testing Harness]
*Establishing the testing bed for future regression safety.*

#### [NEW] [tests/engines/layout.test.ts]
- Implement baseline unit tests operating perfectly detached from DOM via Vitest.

## Open Questions

> [!IMPORTANT]
> The current `taskTreeData` residing in `localStorage` needs to migrate cleanly into IndexedDB on the user's first load. Should the storage engine automatically read from `localStorage`, move it to IndexedDB, and then delete the `localStorage` payload to complete the offline migration seamlessly?

## Verification Plan

### Automated Tests
- Run `npx vitest run` to ensure Pure Functions (`resolveCollisions`, `colorCascade`) pass deterministic testing.

### Manual Verification
- Test PWA installation prompt in Chrome.
- Input heavy markdown into Tiptap to verify CSS leakages.
