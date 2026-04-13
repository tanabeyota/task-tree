# Task Tree v3.0 総合仕様書

本ドキュメントは、レガシーな DOM 操作ベースのアーキテクチャから React + モダネコシステムへ完全移行された「Task Tree v3.0」のシステム仕様および技術要件をまとめた最新の仕様書です。

---

## 1. システム概要・アーキテクチャ

*   **フロントエンド基盤**: React 18, TypeScript, Vite
*   **キャンバス・レイアウトエンジン**: カスタム HTML5 Canvas (CanvasRenderer.ts / CanvasInteraction.ts)
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
│   │   ├── TaskCanvas.tsx # カスタムCanvas全体を包むReactラッパー
│   │   └── TaskNode.tsx   # Tiptapエディタを内包するノード要素
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
*   **状態更新の最適化（In-place Mutation）**: 超高速なドラッグ＆ドロップ体験を実現するため、React標準のイミュータブルな状態更新ではなく、ZustandのStore内でオブジェクトの座標を直接書き換える（In-place Mutation）手法を採用。これにより、毎フレーム発生する座標計算によるガベージコレクション（GC）を抑制し、フレームドロップ（カクつき）を極限まで排除している。
*   **データ構造**: すべてのノードメタデータ（サイズ、期日、Tiptap由来のHTML文字列など）は `TaskTreeState` 形式のオブジェクトツリーとして管理され、`useTaskStore` に集約されます。
*   **IndexedDB 換装**: LocalStorage の容量制限（5MB）を突破するため、非同期 `idb-keyval` を採用しています。なお、旧設定がある環境では初回起動時に自動でデータを IndexedDB に吸い上げ、LocalStorage をクリーンアップするマイグレーションフックが作動します。
*   **Undo/Redo (Zundo)**: `temporal` ミドルウェアによって 50 手先まで履歴を保持します。ただし、`TimerEngine` から毎秒実行されるような自動再計算は履歴を汚染しないよう `pause/resume` 制御によって除外されています。
    *   **【実装トラップ回避: In-place Mutationとの相性】**: ドラッグ中 (MouseMove) は In-place Mutation を行い Canvas だけを再描画するため、Zundo は `pause()` しておきます。ドラッグ完了 (MouseUp) で最終的な座標が確定した瞬間だけ、Zustand の正規の `set()` 関数を用いてイミュータブルに状態を更新し、同時に Zundo を `resume()` して履歴に保存するよう徹底します。

### 3.2 Tiptap による Headless リッチテキスト編集
*   各 `TaskNode` 内部のテキスト領域は `contentEditable` の直接操作（および非推奨である `document.execCommand`）を廃止し、Tiptap の `useEditor` スコープで管理されています。
*   Markdown 記法の自動パース（`-` でリスト化など）機能がデフォルトで備わっており、テキスト入力として一貫した HTML フォーマッティング結果が出力されます。

### 3.3 キャンバス操作とレイアウトの最適化
*   **衝突回避 (Collision engine)**: 純粋関数 `resolveCollisions` により、ノードのボックスが重なった際は自動で再帰的にY軸下部へオフセット移動されます。これにより画面が崩れることを防ぎます。
*   **ドラッグ＆ドロップ判定**: 空間ハッシュ（Spatial Hash）とカスタムHit-testエンジンを活用し、O(1) に近い速度で正確なノードの「重なり」を検出。上位・下位への落とし込みを自然に判断します。

### 3.4 ショートカット・ワークフロー

*   **[Tab]**: 子ノードを追加、または右方向の階層へ移動（※既に子が存在する場合は最初の子へ移動、存在しない場合は新規作成）。
*   **[Shift + Tab]**: 親ノードへ移動。
*   **[Ctrl + Enter] / [Cmd + Enter]**: 同列（兄弟）ノードを追加、または下方向へ移動（※既に次の兄弟が存在する場合は移動、存在しない場合は新規作成）。
*   **[Ctrl + Shift + Enter]**: 上の同列（兄弟）ノードへ移動。
*   **【実装トラップ回避: 履歴ハイジャックの防止】**: Tiptapエディタにフォーカスが当たっている（文字入力中）場合、Zundoによるグローバルの Undo/Redo 操作（Ctrl+Z / Cmd+Z）をバイパスし、ブラウザ（Tiptap）標準のテキスト Undo/Redo を優先して発火させます。これにより「文字を直そうとしたら、ノードの移動履歴まで一緒に戻ってしまった」というバグを未然に防ぎます。

### 3.5 Floating UI による動的ツールバー
*   設定用オーバーレイメニュー（色変え、太字化機能等）は Floating UI と結合されています。
*   Flip や Shift ミドルウェアが設定されているため、対象のノードが画面の端などの見切れる位置にあっても、自動的にメニューが視界内に収まるよう反対側・内側にポップアップ先が追従します。また、メニューから Tiptap インスタンスを安全にリモート制御します。
*   **【実装トラップ回避: オーバーレイの60fps追従】**: Canvasとオーバーレイ（Tiptap等）の座標を同期する際、ReactのStateを使用するとレンダリング遅延（ラグ）が発生します。そのため、DOMの `style.transform` を直接 `requestAnimationFrame` のループ内で書き換える手法を採用します。
    ```javascript
    // Reactの再レンダリングを待たずに、Canvasのカメラ更新と同時にDOMを直接動かす
    overlayDivRef.current.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;
    ```

### 3.6 React 18: Concurrent Rendering
*   検索機能 (`SearchBar`) への入力バインディングには `useDeferredValue` が使用されています。大量のノードがあるツリーをフィルタリングする際でも UI のメインスレッドをブロックせず、スムーズなタイピングと検索結果のハイライトを担保します。

---

## 4. データ構造 (Data Structure)

ノードのレイアウト管理において、手動でのリサイズ機能（`manualMaxWidth`等）は完全に撤廃し、CSSベースの「Auto Width（コンテンツ幅への自動追従）」システムに一本化しています。これにより、ユーザーの操作的認知負荷を下げるとともに、Storeおよびレンダラーの計算オーバーヘッドを削減しています。

```typescript
interface TaskNodeData {
  // 幅等のスタイル情報は持たせず、意味的なメタデータのみを定義します
  html: string;
  color: TaskColor;
  parentId: string | null;
  childrenIds: string[];
  // ...
}
```

---

## 5. 自動テストと品質保証
*   **Vitest**: DOM に依存しないロジック（例: 衝突回避機能の数学的推論など）は、高速な Node.js ランタイム上で Unit テストが走ります。
*   **Playwright (E2E)**: 実際のブラウザ環境でキャンバスを立ち上げ、「ダブルクリックによるノードの即時生成」をはじめとする各種 UI 挙動が正常に動作するか、自動でシミュレートして保証します。

---

## 6. セキュリティとエッジケース保護 (Security & Edge Cases)

*   **認証とアクセス制御**: Firebase Authenticationを用いてユーザーを識別し、Firestore/RTDB Security Rulesにより権限のないデータの読み書きをサーバーサイドで弾く。
*   **ツリーの競合削除保護**: 他のユーザーが編集中（ロック中）のノード、およびその親ノードを削除しようとした場合、操作をキャンセルし警告を表示する。
*   **オフライン対応**: Firestoreのオフラインキャッシュ（`enableIndexedDbPersistence`）を有効化し、ネットワーク切断時でもキャンバス操作を継続可能とする。再接続時にZustandのローカル状態とFirebaseを自動同期する。

---

## 7. PWA とオフラインアクセス
Vite の PWA 拡張プラグインにより自動生成された ServiceWorker マニフェストを通じ、インターネットの無い環境でも IndexedDB およびキャッシュされたモジュールを利用して即座に起動・操作が可能です。
