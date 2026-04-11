# Task Tree v3.0 総合仕様書

本ドキュメントは、レガシーな DOM 操作ベースのアーキテクチャから React + モダネコシステムへ完全移行された「Task Tree v3.0」のシステム仕様および技術要件をまとめた最新の仕様書です。

---

## 1. システム概要・アーキテクチャ

*   **フロントエンド基盤**: React 18, TypeScript, Vite
*   **キャンバス・レイアウトエンジン**: React Flow (v11)
*   **状態管理**: Zustand (Global Store) + Zundo (Undo/Redo History)
*   **永続化ストレージ**: IndexedDB (via `idb-keyval`)
*   **リッチテキストエンジン**: Tiptap (`@tiptap/react`, Headless アーキテクチャ)
*   **UI ポジショニング**: Floating UI (`@floating-ui/react`)
*   **テスト自動化**: Vitest (単体・ロジック), Playwright (E2E)
*   **オフライン対応 / PWA**: Vite PWA Plugin

---

## 2. ディレクトリ構成と関心事の分離 (Domain-Driven Design)

旧来の単一ファイル・密結合な実装から、関心事ごとにドメインが分離されています。

```text
src/
├── components/
│   ├── canvas/         # キャンバス・ノード関係 (UIの核)
│   │   ├── TaskCanvas.tsx # ReactFlow 全体を包むラッパー
│   │   ├── TaskNode.tsx   # Tiptapエディタを内包するノード要素
│   │   └── CustomEdge.tsx # 親子関係の描画（角丸ステップ）
│   └── ui/             # フローティング・絶対配置されるUI群
│       ├── FloatingMenu.tsx # アクティブノードに追従する設定用メニュー
│       └── SearchBar.tsx    # 全体検索バー (Ctrl+F)
├── engines/            # サイドエフェクトや非同期の独立した計算エンジン
│   └── TimerEngine.tsx # グローバルな時間監視・色伝播・期日計算
├── store/              # グローバルステート・永続化・履歴ロジック
│   └── useTaskStore.ts
├── utils/              # 画面を持たない純粋関数レイヤー
│   ├── layout.ts       # 衝突回避（Collision Resolution）などの数学的計算
│   └── clipboard.ts    # Markdownエクスポート/インポートパーサー
└── types/              # TypeScriptインターフェース
```

---

## 3. 主要機能と技術的実装

### 3.1 状態管理と永続化 (IndexedDB)
*   **データ構造**: すべてのノードメタデータ（サイズ、期日、Tiptap由来のHTML文字列など）は `TaskTreeState` 形式のオブジェクトツリーとして管理され、`useTaskStore` に集約されます。
*   **IndexedDB 換装**: LocalStorage の容量制限（5MB）を突破するため、非同期 `idb-keyval` を採用しています。なお、旧設定がある環境では初回起動時に自動でデータを IndexedDB に吸い上げ、LocalStorage をクリーンアップするマイグレーションフックが作動します。
*   **Undo/Redo (Zundo)**: `temporal` ミドルウェアによって 50 手先まで履歴を保持します。ただし、`TimerEngine` から毎秒実行されるような自動再計算は履歴を汚染しないよう `pause/resume` 制御によって除外されています。

### 3.2 Tiptap による Headless リッチテキスト編集
*   各 `TaskNode` 内部のテキスト領域は `contentEditable` の直接操作（および非推奨である `document.execCommand`）を廃止し、Tiptap の `useEditor` スコープで管理されています。
*   Markdown 記法の自動パース（`-` でリスト化など）機能がデフォルトで備わっており、テキスト入力として一貫した HTML フォーマッティング結果が出力されます。

### 3.3 キャンバス操作とレイアウトの最適化
*   **衝突回避 (Collision engine)**: 純粋関数 `resolveCollisions` により、ノードのボックスが重なった際は自動で再帰的にY軸下部へオフセット移動されます。これにより画面が崩れることを防ぎます。
*   **ドラッグ＆ドロップ判定**: Viewport や DOM 座標系の手動計算を排し、React Flow 本体の `getIntersectingNodes()` を活用して正確なノードの「重なり」を検出。上位・下位への落とし込み（兄弟ノード／子ノードへの挿入）を自然に判断します。

### 3.4 Floating UI による動的ツールバー
*   設定用オーバーレイメニュー（色変え、太字化機能等）は Floating UI と結合されています。
*   Flip や Shift ミドルウェアが設定されているため、対象のノードが画面の端などの見切れる位置にあっても、自動的にメニューが視界内に収まるよう反対側・内側にポップアップ先が追従します。また、メニューから Tiptap インスタンスを安全にリモート制御します。

### 3.5 React 18: Concurrent Rendering
*   検索機能 (`SearchBar`) への入力バインディングには `useDeferredValue` が使用されています。大量のノードがあるツリーをフィルタリングする際でも UI のメインスレッドをブロックせず、スムーズなタイピングと検索結果のハイライトを担保します。

---

## 4. 自動テストと品質保証
*   **Vitest**: DOM に依存しないロジック（例: 衝突回避機能の数学的推論など）は、高速な Node.js ランタイム上で Unit テストが走ります。
*   **Playwright (E2E)**: 実際のブラウザ環境でキャンバスを立ち上げ、「ダブルクリックによるノードの即時生成」をはじめとする各種 UI 挙動が正常に動作するか、自動でシミュレートして保証します。

---

## 5. PWA とオフラインアクセス
Vite の PWA 拡張プラグインにより自動生成された ServiceWorker マニフェストを通じ、インターネットの無い環境でも IndexedDB およびキャッシュされたモジュールを利用して即座に起動・操作が可能です。
