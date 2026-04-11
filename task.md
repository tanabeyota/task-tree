# Task Tree v3.0 Migration
## Phase 1: Dependencies & Directory Reorganization
- [ ] Install core dependencies (Tiptap, Floating UI, idb-keyval, UUID, vite-plugin-pwa)
- [ ] Install dev dependencies (vitest, playwright)
- [ ] Initialize domain-driven directory structure (`canvas`, `ui`, `engines`)
- [ ] Move existing files to new structural paths

## Phase 2: IndexedDB, UUID, and Zundo Filtering
- [x] Migrate `zustand/persist` to use `idb-keyval` async storage
- [x] Build seamless `localStorage` to `IndexedDB` auto-migration hook
- [x] Replace sequential `node_${cnt}` generator with `uuidv4()`
- [x] Exclude Timer actions from `zundo` undo history

## Phase 3: Tiptap Headless Editor Migration
- [x] Replace `contentEditable` with Tiptap `<EditorContent>` inside TaskNode
- [x] Define Tiptap StarterKit extensions and remove native `document.execCommand`
- [x] Map internal Tiptap React keyboard shortcuts back to Zustand interactions

## Phase 4: Floating UI & Native React Flow Intersection
- [x] Bind Toolbar to Floating UI `useFloating` hooked to active Z-index
- [x] Configure `App.tsx` (TaskCanvas) to use `getIntersectingNodes()` for exact drop detection
- [x] Remove manual bounding box drop math

## Phase 5: Concurrent Features & PWA
- [x] Apply `useDeferredValue` to Search Query state
- [x] Extend Vite config for offline PWA manifest generation

## Phase 6: Automated Testing Harness
- [x] Create `vitest` config and baseline `layout.test.ts`
- [x] Write first playwright test script
