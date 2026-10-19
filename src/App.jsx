// Written by Wayne Bai with Claude Sonnet 5.5 (Medium)
import { useEffect, useRef, useState } from "react";
import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

const DEFAULT_FILENAME = "whiteboard.autosave.excalidraw";
const SAVE_DELAY_MS = 1500;

/* ---------- tiny IndexedDB key-value helper ---------- */
const DB_NAME = "excalidraw-local";
const STORE = "kv";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* e.g. whiteboard-2026-10-19_14-30-05.excalidraw (local time) */
function makeFilename() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return (
    `whiteboard-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.excalidraw`
  );
}

export default function App() {
  const apiRef = useRef(null);
  const folderRef = useRef(null);
  const filenameRef = useRef(DEFAULT_FILENAME);
  const timerRef = useRef(null);
  const latestRef = useRef(null);
  const lastKeyRef = useRef(null);
  const pendingRef = useRef(false);
  const queueRef = useRef(Promise.resolve());

  const [ready, setReady] = useState(false);
  const [initialData, setInitialData] = useState(null);
  const [folderName, setFolderName] = useState("");
  const [filename, setFilename] = useState(DEFAULT_FILENAME);
  const [folderState, setFolderState] = useState("none"); // none | needs-permission | ready
  const [status, setStatus] = useState("Choose a backup folder.");

  /* ---------- startup: restore folder, filename, last scene ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [handle, savedScene, savedName] = await Promise.all([
          idbGet("folder"),
          idbGet("scene"),
          idbGet("filename"),
        ]);

        if (savedName) {
          filenameRef.current = savedName;
          setFilename(savedName);
        }

        if (handle) {
          folderRef.current = handle;
          setFolderName(handle.name);
          const perm = await handle.queryPermission({ mode: "readwrite" });
          setFolderState(perm === "granted" ? "ready" : "needs-permission");
          setStatus(
            perm === "granted"
              ? "Backup folder restored."
              : "Click Reconnect to allow writing to the backup folder."
          );
        }

        const json = savedScene ?? localStorage.getItem("whiteboard");
        if (json) {
          const data = JSON.parse(json);
          setInitialData({
            elements: data.elements ?? [],
            appState: { ...data.appState, collaborators: new Map() },
            files: data.files ?? {},
          });
        }
      } catch (error) {
        console.error("Startup restore failed:", error);
        setStatus("Could not restore previous session.");
      }
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- persistence ---------- */
  async function writeToFolder(json, name) {
    const folder = folderRef.current;
    if (!folder) return;

    const perm = await folder.queryPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      setFolderState("needs-permission");
      setStatus("Folder permission needed. Click Reconnect.");
      return;
    }

    const fileHandle = await folder.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();
    setFolderState("ready");
    setStatus(`Saved ${new Date().toLocaleTimeString()}`);
  }

  function persist(snapshot) {
    if (!snapshot) return;
    pendingRef.current = false;

    // Capture the target file now, so a later "New file" can't redirect this write.
    const name = filenameRef.current;

    queueRef.current = queueRef.current.then(async () => {
      try {
        const json = serializeAsJSON(
          snapshot.elements,
          snapshot.appState,
          snapshot.files,
          "local"
        );
        await idbSet("scene", json);
        await writeToFolder(json, name);
      } catch (error) {
        console.error("Backup failed:", error);
        setStatus("Backup failed. Check the browser Console.");
      }
    });
    return queueRef.current;
  }

  function handleChange(elements, appState, files) {
    latestRef.current = { elements, appState, files };

    const key =
      elements.length +
      ":" +
      elements.reduce((sum, el) => sum + el.versionNonce, 0) +
      ":" +
      Object.keys(files || {}).length;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    pendingRef.current = true;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      () => persist(latestRef.current),
      SAVE_DELAY_MS
    );
  }

  useEffect(() => {
    const flush = () => {
      if (pendingRef.current) {
        clearTimeout(timerRef.current);
        persist(latestRef.current);
      }
    };
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      clearTimeout(timerRef.current);
    };
  }, []);

  /* ---------- actions (need user clicks) ---------- */
  async function chooseFolder() {
    try {
      if (!window.showDirectoryPicker) {
        setStatus("Your browser does not support folder access. Use Edge or Chrome.");
        return;
      }
      const folder = await window.showDirectoryPicker({
        id: "excalidraw-backup",
        mode: "readwrite",
      });
      folderRef.current = folder;
      await idbSet("folder", folder);
      setFolderName(folder.name);
      setFolderState("ready");
      setStatus("Backup folder selected.");
      await persist(latestRef.current);
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error(error);
        setStatus("Could not select the folder.");
      }
    }
  }

  async function reconnectFolder() {
    try {
      const perm = await folderRef.current.requestPermission({
        mode: "readwrite",
      });
      if (perm === "granted") {
        setFolderState("ready");
        await persist(latestRef.current);
      } else {
        setStatus("Permission denied.");
      }
    } catch (error) {
      console.error(error);
      setStatus("Could not reconnect to the folder.");
    }
  }

  async function startFile(clearBoard) {
    if (folderState !== "ready") {
      setStatus("Select (or reconnect) a backup folder before starting a new file.");
      return;
    }
    try {
      // 1. Finish saving the current drawing to the current file.
      clearTimeout(timerRef.current);
      if (latestRef.current) await persist(latestRef.current);

      // 2. Switch to a new file and remember it across refreshes.
      const name = makeFilename();
      filenameRef.current = name;
      setFilename(name);
      await idbSet("filename", name);

      // 3. Either blank the board, or keep it as is.
      const api = apiRef.current;
      if (clearBoard) {
        api.resetScene();
        lastKeyRef.current = null;
      }

      // 4. Create the new file right away with whatever is on the board now.
      await persist({
        elements: clearBoard ? [] : api.getSceneElements(),
        appState: api.getAppState(),
        files: clearBoard ? {} : api.getFiles(),
      });
    } catch (error) {
      console.error(error);
      setStatus("Could not start a new file.");
    }
  }

  const newFile = () => startFile(true);
  const branchFile = () => startFile(false);

  /* ---------- UI ---------- */
  const needsAttention = ready && folderState !== "ready";

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <style>{`
        @keyframes attention {
          0%, 100% { background: #ff3b30; color: #fff; }
          50%      { background: #fff;    color: #ff3b30; }
        }
        .flash {
          animation: attention 0.8s steps(1, end) infinite;
          border: 2px solid #ff3b30;
          border-radius: 4px;
          padding: 2px 8px;
          font-weight: bold;
        }
      `}</style>

      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 12px",
          fontFamily: "sans-serif",
          fontSize: 13,
          borderBottom: "1px solid #ddd",
        }}
      >
        <button
          onClick={chooseFolder}
          className={needsAttention && folderState === "none" ? "flash" : ""}
        >
          {folderName ? "Change backup folder" : "Choose backup folder"}
        </button>

        {folderState === "needs-permission" && (
          <button onClick={reconnectFolder} className={needsAttention ? "flash" : ""}>
            Reconnect
          </button>
        )}

        <button onClick={newFile}>New file</button>
        <button onClick={branchFile}>Branch</button>

        <span className={needsAttention ? "flash" : ""}>
          {folderName ? `Folder: ${folderName}` : "No backup folder selected!"}
        </span>
        <span>File: {filename}</span>
        <span>{status}</span>
      </div>

      <div style={{ height: "calc(100% - 44px)" }}>
        {ready && (
          <Excalidraw
            excalidrawAPI={(api) => {
              apiRef.current = api;
            }}
            initialData={initialData}
            onChange={handleChange}
          />
        )}
      </div>
    </div>
  );
}