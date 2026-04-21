import { useState } from "react";
import { useSession } from "../state/SessionContext";
import { exportUrl } from "../lib/api";

export function ExportButton() {
  const { sessionId } = useSession();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      const r = await fetch(exportUrl(sessionId));
      if (!r.ok) throw new Error(`export failed: ${r.status}`);
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.download = `twinmind-session-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Make sure the backend is running.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={!sessionId || busy}
      className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 ring-1 ring-white/10 transition hover:bg-white/10 disabled:opacity-50"
      title="Export transcript + suggestions + chat as JSON"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
        <path d="M5 20h14v-2H5v2zM12 4l-5 5h3v6h4V9h3l-5-5z" />
      </svg>
      {busy ? "Exporting…" : "Export"}
    </button>
  );
}
