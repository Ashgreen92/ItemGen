import { useState, useEffect, useCallback, useRef } from "react";
import { Camera, Image as ImageIcon, X, Loader2, Trash2, Pencil, ChevronLeft, Check, RefreshCw, AlertCircle, Tag, Copy, Download } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const SHOT_LABELS = ["Front", "Back", "Label / model", "Condition detail", "Extra"];

// ---------- image helpers ----------

function compressImage(file, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) {
          h = Math.round(h * (maxWidth / w));
          w = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function resizeDataUrl(dataUrl, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxWidth) {
        h = Math.round(h * (maxWidth / w));
        w = maxWidth;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Could not resize image"));
    img.src = dataUrl;
  });
}

function estimateBytes(dataUrl) {
  return Math.round(dataUrl.length * 0.75);
}

async function ensureUnderSizeLimit(photos, maxTotalBytes = 3200000) {
  let current = photos;
  let quality = 0.5;
  let width = 700;
  for (let attempt = 0; attempt < 7; attempt++) {
    const totalBytes = current.reduce((sum, p) => sum + estimateBytes(p), 0);
    if (totalBytes <= maxTotalBytes) return current;
    current = await Promise.all(
      current.map((p) => resizeDataUrl(p, width, quality))
    );
    quality = Math.max(0.25, quality - 0.05);
    width = Math.max(250, Math.round(width * 0.8));
  }
  const finalBytes = current.reduce((sum, p) => sum + estimateBytes(p), 0);
  if (finalBytes > maxTotalBytes) {
    throw new Error(
      `Photos still ${(finalBytes / 1000000).toFixed(1)}MB after compression (${current.length} photos, limit ${(maxTotalBytes / 1000000).toFixed(1)}MB)`
    );
  }
  return current;
}

async function analyzeItem(photos, mode, confirmedFields) {
  const bodyStr = JSON.stringify({ photos, mode, confirmedFields });
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyStr,
  });
  if (!res.ok) {
    let detail = "AI request failed";
    try {
      const body = await res.json();
      detail = body.error || detail;
    } catch {}
    const sentMB = (bodyStr.length / 1000000).toFixed(2);
    throw new Error(`${detail} (HTTP ${res.status}, sent ${sentMB}MB, ${photos.length} photos)`);
  }
  return res.json();
}

// ---------- UI bits ----------

function SunflowerIcon({ size = 16, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      {Array.from({ length: 8 }).map((_, i) => (
        <ellipse key={i} cx="12" cy="5.2" rx="2.1" ry="4.4" fill="currentColor" opacity="0.88" transform={`rotate(${i * 45} 12 12)`} />
      ))}
      <circle cx="12" cy="12" r="3.1" fill="#5C3A1E" />
    </svg>
  );
}

function StatusBadge({ status }) {
  const map = {
    processing: { label: "Processing", cls: "bg-[#A9822E]/15 text-[#A9822E] border-[#A9822E]/30" },
    needs_size: { label: "Needs size", cls: "bg-[#A63A2E]/15 text-[#A63A2E] border-[#A63A2E]/30" },
    ready: { label: "Ready", cls: "bg-[#3F5E42]/15 text-[#3F5E42] border-[#3F5E42]/30" },
    error: { label: "Failed", cls: "bg-[#A63A2E]/15 text-[#A63A2E] border-[#A63A2E]/30" },
    sold: { label: "Sold", cls: "bg-[#8A7F63]/15 text-[#6B6250] border-[#8A7F63]/30" },
  };
  const s = map[status] || map.processing;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wide px-2 py-0.5 rounded-sm border ${s.cls}`}>
      {status === "processing" && <Loader2 size={11} className="animate-spin" />}
      {s.label}
    </span>
  );
}

function PriceTag({ low, high }) {
  if (low == null || high == null) return null;
  return (
    <div className="inline-flex items-center gap-1 text-[#A9822E] font-semibold tabular-nums">
      <Tag size={13} className="shrink-0" />
      £{low}
      {high !== low ? `–£${high}` : ""}
    </div>
  );
}

function CopyField({ label, value, charLimit }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div className="bg-[#F7F3E8] border border-[#C9BFA3] rounded-sm p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#8A7F63]">{label}</span>
        <div className="flex items-center gap-2">
          {charLimit && (
            <span className={`text-xs tabular-nums ${(value || "").length > charLimit ? "text-[#A63A2E]" : "text-[#8A7F63]"}`}>
              {(value || "").length}/{charLimit}
            </span>
          )}
          <button
            onClick={copy}
            className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition ${
              copied ? "bg-[#3F5E42]/20 text-[#3F5E42]" : "bg-[#DCD4BC] text-[#2B2620]"
            }`}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <p className="text-sm text-[#2B2620] whitespace-pre-wrap">{value || "—"}</p>
    </div>
  );
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function ListedToggles({ item, onToggle }) {
  const platforms = [
    { field: "ebay_listed", label: "eBay" },
    { field: "vinted_listed", label: "Vinted" },
    { field: "depop_listed", label: "Depop" },
  ];
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-[#8A7F63] uppercase tracking-wide">Listed on</span>
        {item.created_at && (
          <span className="text-xs text-[#8A7F63]">Captured {fmtDate(item.created_at)}</span>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">
        {platforms.map((p) => (
          <button
            key={p.field}
            onClick={() => onToggle(item, p.field)}
            className={`px-3 py-1.5 rounded-sm text-sm font-medium border transition ${
              item[p.field]
                ? "bg-[#3F5E42]/15 border-[#3F5E42]/40 text-[#3F5E42]"
                : "bg-[#F7F3E8] border-[#C9BFA3] text-[#8A7F63]"
            }`}
          >
            {item[p.field] ? "✓ " : ""}{p.label}
            {item[p.field] && item[`${p.field}_at`] && (
              <span className="opacity-70"> · {fmtDate(item[`${p.field}_at`])}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
function StockCard({ item: e, onOpen }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const photos = e.photos?.length ? e.photos : e.thumbnail ? [e.thumbnail] : [];
  const isListed = e.ebay_listed || e.vinted_listed || e.depop_listed;

  const nextPhoto = (evt) => {
    evt.stopPropagation();
    setPhotoIndex((i) => (i + 1) % photos.length);
  };
  const prevPhoto = (evt) => {
    evt.stopPropagation();
    setPhotoIndex((i) => (i - 1 + photos.length) % photos.length);
  };

  return (
    <div
      onClick={() => onOpen(e)}
      className={`text-left rounded overflow-hidden active:scale-[0.99] transition border cursor-pointer ${
        isListed ? "bg-[#3F5E42]/10 border-[#3F5E42]/50" : "bg-[#F7F3E8] border-[#C9BFA3]"
      }`}
    >
      <div className="aspect-square bg-[#DCD4BC] relative overflow-hidden">
        {photos[photoIndex] && <img src={photos[photoIndex]} alt="" className="w-full h-full object-cover" />}

        {photos.length > 1 && (
          <>
            <button
              onClick={prevPhoto}
              className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#2B2620]/50 text-white flex items-center justify-center text-sm"
            >
              ‹
            </button>
            <button
              onClick={nextPhoto}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#2B2620]/50 text-white flex items-center justify-center text-sm"
            >
              ›
            </button>
            <div className="absolute bottom-1.5 left-0 right-0 flex justify-center gap-1">
              {photos.map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full ${i === photoIndex ? "bg-white" : "bg-white/40"}`}
                />
              ))}
            </div>
          </>
        )}

        {e.status === "sold" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className="text-[#A63A2E] border-4 border-[#A63A2E] px-3 py-1 -rotate-12 font-mono font-bold text-lg tracking-[0.2em] uppercase opacity-80"
              style={{ mixBlendMode: "multiply" }}
            >
              Sold
            </span>
          </div>
        )}
      </div>
      <div className="p-2.5">
        <div className="font-medium text-sm truncate mb-1">{e.title}</div>
        <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
          <StatusBadge status={e.status} />
          {e.status === "sold" && e.sale_price != null ? (
            <span className="text-[#3F5E42] font-mono font-semibold text-sm">£{e.sale_price}</span>
          ) : (
            e.status === "ready" && <PriceTag low={e.price_low} high={e.price_high} />
          )}
        </div>
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-mono text-[#8A7F63] truncate">
            #{stockNumber(e)}{e.batch ? ` · ${e.batch}` : ""}
          </span>
          {isListed && (
            <div className="flex gap-0.5 shrink-0">
              {e.ebay_listed && (
                <span className="w-4 h-4 rounded-sm bg-[#3F5E42]/15 text-[#3F5E42] text-[8px] font-bold flex items-center justify-center" title="eBay">EB</span>
              )}
              {e.vinted_listed && (
                <span className="w-4 h-4 rounded-sm bg-[#3F5E42]/15 text-[#3F5E42] text-[8px] font-bold flex items-center justify-center" title="Vinted">VI</span>
              )}
              {e.depop_listed && (
                <span className="w-4 h-4 rounded-sm bg-[#3F5E42]/15 text-[#3F5E42] text-[8px] font-bold flex items-center justify-center" title="Depop">DE</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ListingHelper({ item }) {
  const priceLabel =
    item.price_low === item.price_high || item.price_high == null
      ? `£${item.price_low ?? "—"}`
      : `£${item.price_low}–£${item.price_high}`;

  return (
    <div className="mb-5">
      <div className="flex flex-col gap-2">
        <CopyField label="Title" value={item.title} charLimit={80} />
        <CopyField label="Starting price (consider allowing offers up to the high end)" value={priceLabel} />
        {item.size_applicable && <CopyField label="Size" value={item.size} />}
        <CopyField label="Category" value={item.category} />
        <CopyField label="Condition" value={item.condition} />
        <CopyField label="Description" value={item.description} />
      </div>
    </div>
  );
}

function stockNumber(item) {
  return item?.id ? item.id.split("-")[0].toUpperCase() : "--------";
}

function DownloadablePhotos({ item, saveDirHandle, onChooseFolder }) {
  const sku = stockNumber(item);
  const titleSlug = (item.title || "item").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const supportsFolderSave = typeof window !== "undefined" && "showDirectoryPicker" in window;
  const photos = item.photos || [];

  const dataUrlToBlob = (dataUrl) => fetch(dataUrl).then((r) => r.blob());

  const saveToFolder = async () => {
    if (!saveDirHandle) return;
    setBusy(true);
    setSaved(false);
    try {
      const subDir = await saveDirHandle.getDirectoryHandle(`${titleSlug}-${sku}`, { create: true });
      for (let i = 0; i < (item.photos || []).length; i++) {
        const blob = await dataUrlToBlob(item.photos[i]);
        const fileHandle = await subDir.getFileHandle(`${titleSlug}-${i + 1}.jpg`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("Save to folder failed:", err);
      alert("Couldn't save photos to that folder: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const downloadZip = async () => {
    setBusy(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      (item.photos || []).forEach((dataUrl, i) => {
        const base64 = dataUrl.split(",")[1];
        zip.file(`${titleSlug}-${i + 1}.jpg`, base64, { base64: true });
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${titleSlug}-${sku}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Zip download failed:", err);
      alert("Couldn't build the zip file: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[#8A7F63]">Photos</span>
        <span className="text-xs font-mono text-[#A9822E]/80">Stock #{sku}</span>
      </div>

      {photos.length > 0 && (
        <div className="relative w-full aspect-square rounded-sm border border-[#C9BFA3] mb-2 overflow-hidden">
          <img src={photos[heroIndex]} alt="" className="w-full h-full object-cover" />
          {photos.length > 1 && (
            <>
              <button
                onClick={() => setHeroIndex((i) => (i - 1 + photos.length) % photos.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#2B2620]/50 text-white flex items-center justify-center text-lg"
              >
                ‹
              </button>
              <button
                onClick={() => setHeroIndex((i) => (i + 1) % photos.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#2B2620]/50 text-white flex items-center justify-center text-lg"
              >
                ›
              </button>
              <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                {photos.map((_, i) => (
                  <span key={i} className={`w-2 h-2 rounded-full ${i === heroIndex ? "bg-white" : "bg-white/40"}`} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {photos.map((p, i) => (
            <img
              key={i}
              src={p}
              alt=""
              onClick={() => setHeroIndex(i)}
              className={`w-16 h-16 rounded-sm object-cover border shrink-0 cursor-pointer ${
                i === heroIndex ? "border-[#A9822E] border-2" : "border-[#C9BFA3]"
              }`}
            />
          ))}
        </div>
      )}

      {supportsFolderSave ? (
        !saveDirHandle ? (
          <button
            onClick={onChooseFolder}
            className="w-full mt-2 py-2.5 rounded bg-[#F7F3E8] border border-[#C9BFA3] text-[#2B2620] font-medium flex items-center justify-center gap-2"
          >
            <Download size={15} />
            Choose download folder (one-time)
          </button>
        ) : (
          <button
            onClick={saveToFolder}
            disabled={busy || !(item.photos || []).length}
            className={`w-full mt-2 py-2.5 rounded border font-medium flex items-center justify-center gap-2 disabled:opacity-50 ${
              saved ? "bg-[#3F5E42]/15 border-[#3F5E42]/40 text-[#3F5E42]" : "bg-[#F7F3E8] border-[#C9BFA3] text-[#2B2620]"
            }`}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Download size={15} />}
            {busy ? "Saving…" : saved ? "Saved to folder" : `Save ${item.photos?.length || 0} photos to folder`}
          </button>
        )
      ) : (
        <button
          onClick={downloadZip}
          disabled={busy || !(item.photos || []).length}
          className="w-full mt-2 py-2.5 rounded bg-[#F7F3E8] border border-[#C9BFA3] text-[#2B2620] font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          {busy ? "Building zip…" : `Download all ${item.photos?.length || 0} photos (.zip)`}
        </button>
      )}
      {!supportsFolderSave && (
        <p className="text-xs text-[#8A7F63] mt-1">This browser can't save straight to a folder — using a zip file instead.</p>
      )}
    </div>
  );
}
function PasscodeGate({ onUnlock }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const expected = process.env.NEXT_PUBLIC_APP_PASSCODE;

  const submit = (e) => {
    e.preventDefault();
    if (!expected || value === expected) {
      localStorage.setItem("snapstock-unlocked", "1");
      onUnlock();
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#EDE6D6] text-[#2B2620] flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-xs flex flex-col gap-3">
        <div className="flex items-center gap-2 justify-center mb-2">
          <div className="w-8 h-8 flex items-center justify-center text-[#A9822E]">
            <SunflowerIcon size={26} />
          </div>
          <span className="font-serif text-lg">ItemGen</span>
        </div>
        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          placeholder="Enter passcode"
          className="w-full bg-[#F7F3E8] border border-[#C9BFA3] rounded-sm px-3 py-2.5 text-center"
          autoFocus
        />
        {error && <p className="text-[#A63A2E] text-sm text-center">Wrong passcode</p>}
        <button type="submit" className="w-full py-2.5 rounded-sm bg-[#A9822E] text-[#2B2620] font-bold">
          Unlock
        </button>
      </form>
    </div>
  );
}

// ---------- main app ----------

export default function Home() {
  const [unlocked, setUnlocked] = useState(!process.env.NEXT_PUBLIC_APP_PASSCODE);
  const [checkedLock, setCheckedLock] = useState(false);

  const [view, setView] = useState("dashboard");
  const [items, setItems] = useState([]);
  const [stockFilter, setStockFilter] = useState("active");
  const [loadedItems, setLoadedItems] = useState(false);
  const [currentPhotos, setCurrentPhotos] = useState([]);
  const [currentBatch, setCurrentBatch] = useState("");
  const [batchFilter, setBatchFilter] = useState("all");
  const [stockSearch, setStockSearch] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [saveDirHandle, setSaveDirHandle] = useState(null);

  const chooseSaveFolder = async () => {
    try {
      const handle = await window.showDirectoryPicker();
      setSaveDirHandle(handle);
    } catch (err) {
      if (err.name !== "AbortError") console.error("Folder pick failed:", err);
    }
  };
  const [editDraft, setEditDraft] = useState(null);
  const [editing, setEditing] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (!process.env.NEXT_PUBLIC_APP_PASSCODE || localStorage.getItem("snapstock-unlocked") === "1") {
        setUnlocked(true);
      }
      setCheckedLock(true);
    }
  }, []);

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase.from("items").select("*").order("created_at", { ascending: false });
    if (!error && data) setItems(data);
    setLoadedItems(true);
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    fetchItems();
  }, [unlocked, fetchItems]);

  // poll for updates while on the stock tab, so items processed on the other device show up
  useEffect(() => {
    if (view === "stock" && unlocked) {
      pollRef.current = setInterval(fetchItems, 4000);
      return () => clearInterval(pollRef.current);
    }
  }, [view, unlocked, fetchItems]);

  const handleAddPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapturing(true);
    try {
      const full = await compressImage(file, 800, 0.6);
      setCurrentPhotos((prev) => [...prev, full].slice(0, 5));
    } catch (err) {
      console.error(err);
    } finally {
      setCapturing(false);
      e.target.value = "";
    }
  };

  const runFullGeneration = useCallback(async (id, photos, confirmedFields) => {
    try {
      const safePhotos = await ensureUnderSizeLimit(photos);
      const result = await analyzeItem(safePhotos, "full", confirmedFields || null);
      await supabase
        .from("items")
        .update({
          title: result.title || "Untitled item",
          description: result.description || "",
          category: result.category || "",
          condition: result.condition || "",
          brand: result.brand || "",
          price_low: result.estimated_price_low ?? null,
          price_high: result.estimated_price_high ?? null,
          confidence: result.confidence || "medium",
          notes: result.notes || "",
          verify_before_listing: Array.isArray(result.verify_before_listing) ? result.verify_before_listing : [],
          status: "ready",
        })
        .eq("id", id);
    } catch (err) {
      console.error(err);
      await supabase.from("items").update({ status: "error", error_detail: err.message || String(err) }).eq("id", id);
    }
    fetchItems();
  }, [fetchItems]);

  const processItem = useCallback(async (id, photos) => {
    try {
      const safePhotos = await ensureUnderSizeLimit(photos);
      const quick = await analyzeItem(safePhotos, "quick");
      const sizeApplicable = quick.size_applicable === true;
      const size = quick.size || null;

      if (sizeApplicable && !size) {
        // Stop here - can't write an accurate listing without knowing the size.
        // The item page will show a required prompt; runFullGeneration only
        // fires once the user answers it (see confirmSizeGate).
        await supabase.from("items").update({ status: "needs_size", size_applicable: true, size: null }).eq("id", id);
        fetchItems();
        return;
      }

      await supabase.from("items").update({ size_applicable: sizeApplicable, size }).eq("id", id);
      await runFullGeneration(id, photos, sizeApplicable && size ? { size } : null);
    } catch (err) {
      console.error(err);
      await supabase.from("items").update({ status: "error", error_detail: err.message || String(err) }).eq("id", id);
      fetchItems();
    }
  }, [fetchItems]);

  const handleNextItem = async () => {
    if (currentPhotos.length === 0) return;
    try {
      const thumbnail = await resizeDataUrl(currentPhotos[0], 600, 0.65).catch(() => currentPhotos[0]);
      const { data, error } = await supabase
        .from("items")
        .insert({
          title: "Untitled item",
          status: "processing",
          photos: currentPhotos,
          thumbnail,
          batch: currentBatch.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;
      setCurrentPhotos([]);
      fetchItems();
      processItem(data.id, currentPhotos);
    } catch (err) {
      console.error("handleNextItem failed:", err);
      alert("Next item failed: " + (err.message || JSON.stringify(err)));
    }
  };

  const openItem = (item) => {
    setSelectedItem(item);
    setEditDraft(item);
    setEditing(false);
    setSizeGateInput("");
  };
  const closeItem = () => {
    setSelectedItem(null);
    setEditDraft(null);
    setEditing(false);
  };

  const saveEdits = async () => {
    if (!editDraft) return;
    await supabase
      .from("items")
      .update({
        title: editDraft.title,
        description: editDraft.description,
        category: editDraft.category,
        condition: editDraft.condition,
        price_low: editDraft.price_low,
        price_high: editDraft.price_high,
        size: editDraft.size,
        brand: editDraft.brand,
      })
      .eq("id", editDraft.id);
    setSelectedItem(editDraft);
    fetchItems();
  };

  const refreshWithAI = async () => {
    if (!editDraft) return;
    const confirmedFields = {};
    if (editDraft.size?.trim()) confirmedFields.size = editDraft.size.trim();
    if (editDraft.category?.trim()) confirmedFields.category = editDraft.category.trim();
    if (editDraft.condition?.trim()) confirmedFields.condition = editDraft.condition.trim();
    if (editDraft.brand?.trim()) confirmedFields.brand = editDraft.brand.trim();

    await supabase
      .from("items")
      .update({ category: editDraft.category, condition: editDraft.condition, status: "processing" })
      .eq("id", editDraft.id);
    setSelectedItem((s) => ({ ...s, status: "processing" }));
    setEditing(false);
    fetchItems();
    runFullGeneration(editDraft.id, editDraft.photos, Object.keys(confirmedFields).length ? confirmedFields : null);
  };

  const retryItem = async (item) => {
    await supabase.from("items").update({ status: "processing" }).eq("id", item.id);
    setSelectedItem({ ...item, status: "processing" });
    fetchItems();
    processItem(item.id, item.photos);
  };

  const [sizeGateInput, setSizeGateInput] = useState("");

  const confirmSizeGate = async (withValue) => {
    const size = withValue ? sizeGateInput.trim() : "Not specified";
    const item = selectedItem;
    await supabase.from("items").update({ size, status: "processing" }).eq("id", item.id);
    setSelectedItem((s) => ({ ...s, size, status: "processing" }));
    setSizeGateInput("");
    fetchItems();
    runFullGeneration(item.id, item.photos, size === "Not specified" ? null : { size });
  };

  const [soldFormFor, setSoldFormFor] = useState(null);
  const [soldPriceInput, setSoldPriceInput] = useState("");
  const [costPriceInput, setCostPriceInput] = useState("");

  const openSoldForm = (item) => {
    setSoldFormFor(item);
    setSoldPriceInput(item.price_low != null ? String(item.price_low) : "");
    setCostPriceInput("");
  };

  const confirmSold = async () => {
    if (!soldFormFor) return;
    const sale_price = soldPriceInput === "" ? null : Number(soldPriceInput);
    const cost_price = costPriceInput === "" ? null : Number(costPriceInput);
    await supabase.from("items").update({ status: "sold", sale_price, cost_price }).eq("id", soldFormFor.id);
    setSelectedItem({ ...soldFormFor, status: "sold", sale_price, cost_price });
    setSoldFormFor(null);
    fetchItems();
  };

  const unmarkSold = async (item) => {
    await supabase.from("items").update({ status: "ready" }).eq("id", item.id);
    setSelectedItem({ ...item, status: "ready" });
    setEditDraft((d) => (d ? { ...d, status: "ready" } : d));
    fetchItems();
  };

  const togglePlatform = async (item, field) => {
    const newVal = !item[field];
    const dateField = `${field}_at`;
    const newDate = newVal ? new Date().toISOString() : null;
    await supabase.from("items").update({ [field]: newVal, [dateField]: newDate }).eq("id", item.id);
    const updated = { ...item, [field]: newVal, [dateField]: newDate };
    setSelectedItem(updated);
    setEditDraft((d) => (d ? { ...d, [field]: newVal, [dateField]: newDate } : d));
    fetchItems();
  };

  const removeItem = async (id) => {
    await supabase.from("items").delete().eq("id", id);
    fetchItems();
    closeItem();
  };

  if (!checkedLock) return null;
  if (!unlocked) return <PasscodeGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="min-h-screen bg-[#EDE6D6] text-[#2B2620] flex flex-col">
      <div className="border-b-4 border-double border-[#8A7F63] px-4 sm:px-8 py-3 flex items-center justify-between sticky top-0 bg-[#EDE6D6]/95 backdrop-blur z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 flex items-center justify-center shrink-0 text-[#A9822E]">
            <SunflowerIcon size={28} />
          </div>
          <span className="font-serif text-xl tracking-tight">ItemGen</span>
        </div>
        <div className="flex bg-[#F7F3E8] rounded-sm p-0.5 border border-[#C9BFA3]">
          <button
            onClick={() => setView("dashboard")}
            className={`px-3 py-1.5 rounded-sm text-xs font-mono uppercase tracking-wide font-medium transition ${view === "dashboard" ? "bg-[#A9822E] text-[#2B2620]" : "text-[#6B6250]"}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setView("capture")}
            className={`px-3 py-1.5 rounded-sm text-xs font-mono uppercase tracking-wide font-medium transition ${view === "capture" ? "bg-[#A9822E] text-[#2B2620]" : "text-[#6B6250]"}`}
          >
            Capture
          </button>
          <button
            onClick={() => setView("stock")}
            className={`px-3 py-1.5 rounded-sm text-xs font-mono uppercase tracking-wide font-medium transition ${view === "stock" ? "bg-[#A9822E] text-[#2B2620]" : "text-[#6B6250]"}`}
          >
            Stock {items.length > 0 && `(${items.length})`}
          </button>
        </div>
      </div>

      {view === "dashboard" && (
        <div className="flex-1 p-4 sm:p-8 max-w-5xl w-full mx-auto">
          {(() => {
            const soldItems = items.filter((e) => e.status === "sold");
            const activeItems = items.filter((e) => e.status !== "sold");
            const revenue = soldItems.reduce((s, e) => s + (Number(e.sale_price) || 0), 0);
            const cost = soldItems.reduce((s, e) => s + (Number(e.cost_price) || 0), 0);
            const needsAttention = items.filter((e) => e.status === "needs_size" || e.status === "error");

            return (
              <>
                <p className="font-serif text-2xl mb-6">Dashboard</p>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
                  {[
                    { label: "Active stock", value: activeItems.length },
                    { label: "Sold", value: soldItems.length },
                    { label: "Revenue", value: `£${revenue.toFixed(2)}` },
                    { label: "Cost", value: `£${cost.toFixed(2)}` },
                    { label: "Profit", value: `£${(revenue - cost).toFixed(2)}`, highlight: true },
                  ].map((s) => (
                    <div key={s.label} className="bg-[#F7F3E8] border border-[#C9BFA3] rounded-sm p-3">
                      <span className="text-xs text-[#8A7F63] uppercase tracking-wide block mb-1">{s.label}</span>
                      <span className={`font-mono text-xl ${s.highlight ? "text-[#3F5E42] font-bold" : ""}`}>{s.value}</span>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mb-8">
                  <button
                    onClick={() => setView("capture")}
                    className="flex-1 py-3 rounded bg-[#A9822E] text-[#2B2620] font-bold flex items-center justify-center gap-2"
                  >
                    <Camera size={16} />
                    Capture new item
                  </button>
                  <button
                    onClick={() => {
                      setStockFilter("active");
                      setBatchFilter("all");
                      setStockSearch("");
                      setView("stock");
                    }}
                    className="flex-1 py-3 rounded bg-[#F7F3E8] border border-[#C9BFA3] text-[#2B2620] font-medium"
                  >
                    View all stock
                  </button>
                </div>

                {needsAttention.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[#A63A2E] uppercase tracking-wide mb-2">
                      Needs attention ({needsAttention.length})
                    </p>
                    <div className="flex flex-col gap-2">
                      {needsAttention.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => openItem(e)}
                          className="flex items-center gap-3 bg-[#F7F3E8] border border-[#C9BFA3] rounded-sm p-2.5 text-left"
                        >
                          <div className="w-10 h-10 rounded-sm overflow-hidden bg-[#DCD4BC] shrink-0">
                            {e.thumbnail && <img src={e.thumbnail} alt="" className="w-full h-full object-cover" />}
                          </div>
                          <span className="text-sm truncate flex-1">{e.title}</span>
                          <StatusBadge status={e.status} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {view === "capture" && (
        <div className="flex-1 flex flex-col p-4 sm:p-8 max-w-xl w-full mx-auto">
          <div className="mb-4">
            <label className="text-xs text-[#8A7F63] uppercase tracking-wide mb-1 block">
              Category / Folder (optional — e.g. "Jumpers")
            </label>
            <input
              list="batch-suggestions"
              value={currentBatch}
              onChange={(e) => setCurrentBatch(e.target.value)}
              placeholder="Leave blank for no batch"
              className="w-full bg-[#F7F3E8] border border-[#C9BFA3] rounded-sm px-3 py-2 text-sm"
            />
            <datalist id="batch-suggestions">
              {[...new Set(items.map((i) => i.batch).filter(Boolean))].map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
            {currentBatch && (
              <p className="text-xs text-[#8A7F63] mt-1">
                Every item you capture will be tagged "{currentBatch}" until you change or clear this.
              </p>
            )}
          </div>

          <p className="text-[#6B6250] text-sm mb-4">
            For best results, try to capture: <span className="font-bold text-[#2B2620]">front · back · label or markings · close-up of any damage · one extra angle</span>. Press <span className="text-[#2B2620] font-medium">Next item</span> to submit these photos for AI identification and pricing.
          </p>

          <div className="grid grid-cols-5 gap-2 mb-1">
            {SHOT_LABELS.map((label, i) => (
              <div key={i} className="aspect-square rounded-sm border border-[#C9BFA3] overflow-hidden flex items-center justify-center bg-[#F7F3E8] relative">
                {currentPhotos[i] ? (
                  <>
                    <img src={currentPhotos[i]} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setCurrentPhotos((p) => p.filter((_, idx) => idx !== i))}
                      className="absolute top-0.5 right-0.5 bg-[#EDE6D6]/80 rounded-full p-0.5"
                    >
                      <X size={11} />
                    </button>
                  </>
                ) : (
                  <Camera size={16} className="text-[#C9BFA3]" />
                )}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-2 mb-4">
            {SHOT_LABELS.map((label, i) => (
              <span key={i} className="text-[9px] text-center text-[#8A7F63] uppercase tracking-wide">
                {i + 1}{i < 2 ? " · req" : ""}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div
              className={`relative py-4 rounded bg-[#F7F3E8] border border-[#C9BFA3] flex items-center justify-center gap-2 font-medium text-[#2B2620] ${
                currentPhotos.length >= 5 || capturing ? "opacity-40" : ""
              }`}
            >
              {capturing ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
              {currentPhotos.length >= 5 ? "Full" : "Take photo"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleAddPhoto}
                disabled={currentPhotos.length >= 5 || capturing}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
              />
            </div>

            <div
              className={`relative py-4 rounded bg-[#F7F3E8] border border-[#C9BFA3] flex items-center justify-center gap-2 font-medium text-[#2B2620] ${
                currentPhotos.length >= 5 || capturing ? "opacity-40" : ""
              }`}
            >
              <ImageIcon size={18} />
              {currentPhotos.length >= 5 ? "Full" : "From gallery"}
              <input
                type="file"
                accept="image/*"
                onChange={handleAddPhoto}
                disabled={currentPhotos.length >= 5 || capturing}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
              />
            </div>
          </div>

          <button
            onClick={handleNextItem}
            disabled={currentPhotos.length === 0}
            className="w-full py-4 rounded bg-[#A9822E] text-[#2B2620] flex items-center justify-center gap-2 font-bold disabled:opacity-30 active:scale-[0.98] transition"
          >
            <Check size={18} />
            Next item
          </button>

          {items.some((e) => e.status === "processing") && (
            <p className="text-xs text-[#8A7F63] text-center mt-4 flex items-center justify-center gap-1.5">
              <Loader2 size={11} className="animate-spin" />
              {items.filter((e) => e.status === "processing").length} item(s) being written up
            </p>
          )}
        </div>
      )}

      {view === "stock" && (
        <div className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto">
          <div className="flex bg-[#F7F3E8] rounded-sm p-0.5 border border-[#C9BFA3] mb-3 w-fit">
            <button
              onClick={() => setStockFilter("active")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${stockFilter === "active" ? "bg-[#A9822E] text-[#2B2620]" : "text-[#6B6250]"}`}
            >
              Active
            </button>
            <button
              onClick={() => setStockFilter("sold")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${stockFilter === "sold" ? "bg-[#A9822E] text-[#2B2620]" : "text-[#6B6250]"}`}
            >
              Sold
            </button>
            <button
              onClick={() => setStockFilter("all")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${stockFilter === "all" ? "bg-[#A9822E] text-[#2B2620]" : "text-[#6B6250]"}`}
            >
              All
            </button>
          </div>

          <input
            value={stockSearch}
            onChange={(e) => setStockSearch(e.target.value)}
            placeholder="Search stock by title…"
            className="w-full bg-[#F7F3E8] border border-[#C9BFA3] rounded-sm px-3 py-2 text-sm mb-4"
          />

          {(() => {
            const batches = [...new Set(items.map((i) => i.batch).filter(Boolean))].sort();
            return batches.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setBatchFilter("all")}
                  className={`px-3 py-1.5 rounded-sm text-xs font-mono uppercase tracking-wide border transition ${
                    batchFilter === "all" ? "bg-[#A9822E] border-[#A9822E] text-[#2B2620]" : "bg-[#F7F3E8] border-[#C9BFA3] text-[#6B6250]"
                  }`}
                >
                  All batches
                </button>
                {batches.map((b) => (
                  <button
                    key={b}
                    onClick={() => setBatchFilter(b)}
                    className={`px-3 py-1.5 rounded-sm text-xs font-mono uppercase tracking-wide border transition ${
                      batchFilter === b ? "bg-[#A9822E] border-[#A9822E] text-[#2B2620]" : "bg-[#F7F3E8] border-[#C9BFA3] text-[#6B6250]"
                    }`}
                  >
                    {b} ({items.filter((i) => i.batch === b).length})
                  </button>
                ))}
              </div>
            ) : null;
          })()}

          {(() => {
            const filteredItems = items
              .filter((e) => (stockFilter === "all" ? true : stockFilter === "sold" ? e.status === "sold" : e.status !== "sold"))
              .filter((e) => (batchFilter === "all" ? true : e.batch === batchFilter))
              .filter((e) => (stockSearch.trim() ? (e.title || "").toLowerCase().includes(stockSearch.trim().toLowerCase()) : true));

            return (
              <>
                {!loadedItems ? (
                  <div className="flex items-center justify-center py-20 text-[#8A7F63]">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-20 text-[#8A7F63]">
                    <SunflowerIcon size={32} className="mx-auto mb-3 text-[#8A7F63] opacity-40" />
                    <p className="text-sm">
                      {stockFilter === "sold" ? "No sold items yet." : "No stock yet. Capture your first item."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredItems.map((e) => (
                      <StockCard key={e.id} item={e} onOpen={openItem} />
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {selectedItem && (
        <div className="fixed inset-0 bg-[#EDE6D6] z-20 flex flex-col">
          <div className="border-b border-[#C9BFA3] px-4 py-3 flex items-center justify-between sticky top-0 bg-[#EDE6D6] z-10">
            <button onClick={closeItem} className="flex items-center gap-1 text-[#6B6250] text-sm">
              <ChevronLeft size={18} />
              Back
            </button>
            <button onClick={() => removeItem(selectedItem.id)} className="text-[#A63A2E] flex items-center gap-1 text-sm">
              <Trash2 size={15} />
              Delete
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-2xl w-full mx-auto">
            <DownloadablePhotos item={selectedItem} saveDirHandle={saveDirHandle} onChooseFolder={chooseSaveFolder} />

            <div className="mb-3">
              <StatusBadge status={selectedItem.status} />
            </div>

            {selectedItem.status === "processing" && (
              <p className="text-sm text-[#6B6250] flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Writing the ad up now — check back in a moment.
              </p>
            )}

            {selectedItem.status === "error" && (
              <div className="bg-[#A63A2E]/10 border border-[#A63A2E]/30 rounded-sm p-3 mb-4 flex items-start gap-2">
                <AlertCircle size={16} className="text-[#A63A2E] shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-[#A63A2E] mb-2">Couldn't generate an ad for this item.</p>
                  {selectedItem.error_detail && (
                    <p className="text-xs text-[#A63A2E]/80 font-mono mb-2">{selectedItem.error_detail}</p>
                  )}
                  <button onClick={() => retryItem(selectedItem)} className="flex items-center gap-1.5 text-xs font-medium bg-[#A63A2E]/15 px-2.5 py-1.5 rounded-md">
                    <RefreshCw size={12} /> Retry
                  </button>
                </div>
              </div>
            )}

            {selectedItem.status === "sold" && (
              <div className="flex flex-col gap-4">
                <div className="bg-[#F7F3E8] border border-[#C9BFA3] rounded-sm p-4">
                  <p className="text-sm text-[#2B2620] font-medium mb-3">{selectedItem.title}</p>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-sm">
                    <div>
                      <span className="text-[#8A7F63] uppercase text-xs tracking-wide block">Sold for</span>
                      <span>£{selectedItem.sale_price ?? "—"}</span>
                    </div>
                    <div>
                      <span className="text-[#8A7F63] uppercase text-xs tracking-wide block">You paid</span>
                      <span>£{selectedItem.cost_price ?? "—"}</span>
                    </div>
                    {selectedItem.sale_price != null && selectedItem.cost_price != null && (
                      <div>
                        <span className="text-[#8A7F63] uppercase text-xs tracking-wide block">Profit</span>
                        <span className="text-[#3F5E42] font-bold">£{(selectedItem.sale_price - selectedItem.cost_price).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => unmarkSold(selectedItem)}
                  className="w-full py-2.5 rounded bg-[#DCD4BC] text-[#2B2620] font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition"
                >
                  <RefreshCw size={15} />
                  Mark as Active again
                </button>
              </div>
            )}

            {soldFormFor && (
              <div className="fixed inset-0 bg-[#2B2620]/60 z-30 flex items-end sm:items-center justify-center p-4">
                <div className="bg-[#F7F3E8] border border-[#C9BFA3] rounded-sm p-5 w-full max-w-sm">
                  <p className="font-serif text-lg mb-4">Mark "{soldFormFor.title}" as sold</p>
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="text-xs text-[#8A7F63] mb-1 block">Sold for (£)</label>
                      <input
                        type="number"
                        value={soldPriceInput}
                        onChange={(e) => setSoldPriceInput(e.target.value)}
                        className="w-full bg-[#EDE6D6] border border-[#C9BFA3] rounded-sm px-3 py-2 text-sm font-mono"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[#8A7F63] mb-1 block">You paid for it (£) — optional, for profit stats</label>
                      <input
                        type="number"
                        value={costPriceInput}
                        onChange={(e) => setCostPriceInput(e.target.value)}
                        className="w-full bg-[#EDE6D6] border border-[#C9BFA3] rounded-sm px-3 py-2 text-sm font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={() => setSoldFormFor(null)}
                      className="flex-1 py-2.5 rounded bg-[#DCD4BC] text-[#2B2620] font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmSold}
                      className="flex-1 py-2.5 rounded bg-[#A9822E] text-[#2B2620] font-bold"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            )}

            {selectedItem.status === "needs_size" && (
              <div className="bg-[#A9822E]/10 border border-[#A9822E]/40 rounded-sm p-4 mb-4">
                <p className="font-serif text-lg mb-1">What size is this?</p>
                <p className="text-xs text-[#8A7F63] mb-3">
                  The AI couldn't read a size from the photos, and can't write an accurate listing without it. Enter it to continue.
                </p>
                <input
                  value={sizeGateInput}
                  onChange={(e) => setSizeGateInput(e.target.value)}
                  placeholder="e.g. UK 10, Men's L, EU 42"
                  className="w-full bg-[#F7F3E8] border border-[#C9BFA3] rounded-sm px-3 py-2 text-sm mb-3"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => confirmSizeGate(false)}
                    className="flex-1 py-2.5 rounded bg-[#DCD4BC] text-[#2B2620] font-medium text-sm"
                  >
                    Not sure / skip
                  </button>
                  <button
                    onClick={() => confirmSizeGate(true)}
                    disabled={!sizeGateInput.trim()}
                    className="flex-1 py-2.5 rounded bg-[#A9822E] text-[#2B2620] font-bold disabled:opacity-40"
                  >
                    Confirm size
                  </button>
                </div>
              </div>
            )}

            {selectedItem.status === "ready" && editDraft && (
              <>
                <ListingHelper item={selectedItem} />

                <ListedToggles item={selectedItem} onToggle={togglePlatform} />

                {selectedItem.verify_before_listing?.length > 0 && (
                  <div className="bg-[#A63A2E]/10 border border-[#A63A2E]/30 rounded-sm p-3 mb-5">
                    <p className="text-xs font-semibold text-[#A63A2E] uppercase tracking-wide mb-2">
                      Check before listing — not confirmed from photos
                    </p>
                    <ul className="text-sm text-[#2B2620] flex flex-col gap-1">
                      {selectedItem.verify_before_listing.map((v, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-[#A63A2E]">·</span>
                          <span>{v}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!editing ? (
                  <button
                    onClick={() => setEditing(true)}
                    className="w-full py-2.5 mb-4 rounded bg-[#DCD4BC] text-[#2B2620] font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition"
                  >
                    <Pencil size={15} />
                    Edit details
                  </button>
                ) : (
                  <div className="flex flex-col gap-4 mb-4 border-t border-[#C9BFA3] pt-4">
                    <div>
                      <label className="text-xs text-[#8A7F63] mb-1 block">Title</label>
                      <input
                        value={editDraft.title || ""}
                        onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                        className="w-full bg-[#F7F3E8] border border-[#C9BFA3] rounded-sm px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-[#8A7F63] mb-1 block">Price low (£)</label>
                        <input
                          type="number"
                          value={editDraft.price_low ?? ""}
                          onChange={(e) => setEditDraft({ ...editDraft, price_low: e.target.value === "" ? null : Number(e.target.value) })}
                          className="w-full bg-[#F7F3E8] border border-[#C9BFA3] rounded-sm px-3 py-2 text-sm tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-[#8A7F63] mb-1 block">Price high (£)</label>
                        <input
                          type="number"
                          value={editDraft.price_high ?? ""}
                          onChange={(e) => setEditDraft({ ...editDraft, price_high: e.target.value === "" ? null : Number(e.target.value) })}
                          className="w-full bg-[#F7F3E8] border border-[#C9BFA3] rounded-sm px-3 py-2 text-sm tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-[#8A7F63] mb-1 block">Category</label>
                        <input
                          value={editDraft.category || ""}
                          onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })}
                          className="w-full bg-[#F7F3E8] border border-[#C9BFA3] rounded-sm px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-[#8A7F63] mb-1 block">Condition</label>
                        <input
                          value={editDraft.condition || ""}
                          onChange={(e) => setEditDraft({ ...editDraft, condition: e.target.value })}
                          className="w-full bg-[#F7F3E8] border border-[#C9BFA3] rounded-sm px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-[#8A7F63] mb-1 block">Size</label>
                        <input
                          value={editDraft.size || ""}
                          onChange={(e) => setEditDraft({ ...editDraft, size: e.target.value })}
                          placeholder="e.g. UK 10, Men's L"
                          className="w-full bg-[#F7F3E8] border border-[#C9BFA3] rounded-sm px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-[#8A7F63] mb-1 block">Brand</label>
                        <input
                          value={editDraft.brand || ""}
                          onChange={(e) => setEditDraft({ ...editDraft, brand: e.target.value })}
                          className="w-full bg-[#F7F3E8] border border-[#C9BFA3] rounded-sm px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-[#8A7F63] mb-1 block">Description</label>
                      <textarea
                        value={editDraft.description || ""}
                        onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                        rows={4}
                        className="w-full bg-[#F7F3E8] border border-[#C9BFA3] rounded-sm px-3 py-2 text-sm resize-none"
                      />
                    </div>

                    {editDraft.notes && (
                      <div className="bg-[#A9822E]/10 border border-[#A9822E]/20 rounded-sm p-3 text-xs text-[#A9822E]/90">
                        <span className="font-medium">AI note: </span>
                        {editDraft.notes}
                        {editDraft.confidence && <span className="text-[#A9822E]/60"> · confidence: {editDraft.confidence}</span>}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditDraft(selectedItem);
                          setEditing(false);
                        }}
                        className="flex-1 py-3 rounded bg-[#DCD4BC] text-[#2B2620] font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          saveEdits();
                          setEditing(false);
                        }}
                        className="flex-1 py-3 rounded bg-[#DCD4BC] text-[#2B2620] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition"
                      >
                        <Pencil size={15} />
                        Save only
                      </button>
                    </div>
                    <button
                      onClick={refreshWithAI}
                      className="w-full mt-2 py-3 rounded bg-[#A9822E] text-[#2B2620] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition"
                    >
                      <RefreshCw size={15} />
                      Save & refresh title/description with AI
                    </button>
                    <p className="text-xs text-[#8A7F63] mt-1.5">
                      Uses your corrections above (size, category, condition, brand) as confirmed fact and rewrites the title and description to match.
                    </p>
                  </div>
                )}

                <button
                  onClick={() => openSoldForm(selectedItem)}
                  className="w-full py-2.5 rounded bg-[#A9822E] text-[#2B2620] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition"
                >
                  <Check size={15} />
                  Mark as Sold
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
