import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyANSCUFmTaY8xMwnrsPiSjv2nb4IgokW3Q",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "task-tree-8eef9.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://task-tree-8eef9-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "task-tree-8eef9",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "task-tree-8eef9.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "131113983003",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:131113983003:web:2ad21ef36a50796b3d6cbe"
};

const app = initializeApp(firebaseConfig);

// Initialize Firestore with explicitly enabled IndexedDB offline caching
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// Initialize Realtime Database (for presence and locking)
const rtdb = getDatabase(app);

// Initialize Authentication
const auth = getAuth(app);

export { app, db, rtdb, auth };
