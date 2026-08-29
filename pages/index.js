import { useState, useEffect, useCallback, useRef } from "react";
import { Camera, X, Loader2, Trash2, Pencil, ChevronLeft, Package, Check, RefreshCw, AlertCircle, Tag, Lock, Copy, Download } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

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

async function analyzeItem(photos) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photos }),
  });
  if (!res.ok) throw new Error("AI request failed");
  return res.json();
}

// ---------- UI bits ----------

function StatusBadge({ status }) {
  const map = {
    processing: { label: "Processing", cls: "bg-amber-400/15 text-amber-300 border-amber-400/30" },
    ready: { label: "Ready", cls: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30" },
    error: { label: "Failed", cls: "bg-red-400/15 text-red-300 border-red-400/30" },
  };
  const s = map[status] || map.processing;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${s.cls}`}>
      {status === "processing" && <Loader2 size={11} className="animate-spin" />}
      {s.label}
    </span>
  );
}

function PriceTag({ low, high }) {
  if (low == null || high == null) return null;
  return (
    <div className="inline-flex items-center gap-1 text-amber-300 font-semibold tabular-nums">
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
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-neutral-500">{label}</span>
        <div className="flex items-center gap-2">
          {charLimit && (
            <span className={`text-xs tabular-nums ${(value || "").length > charLimit ? "text-red-400" : "text-neutral-600"}`}>
              {(value || "").length}/{charLimit}
            </span>
          )}
          <button
            onClick={copy}
            className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition ${
              copied ? "bg-emerald-400/20 text-emerald-300" : "bg-neutral-800 text-neutral-300"
            }`}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <p className="text-sm text-neutral-100 whitespace-pre-wrap">{value || "—"}</p>
    </div>
  );
}

function ListingHelper({ item }) {
  const [platform, setPlatform] = useState("ebay");
  const priceLabel =
    item.price_low === item.price_high || item.price_high == null
      ? `£${item.price_low ?? "—"}`
      : `£${item.price_low}–£${item.price_high}`;

  return (
    <div className="mb-5">
      <div className="flex bg-neutral-900 rounded-lg p-0.5 border border-neutral-800 mb-3 w-fit">
        <button
          onClick={() => setPlatform("ebay")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${platform === "ebay" ? "bg-amber-400 text-neutral-950" : "text-neutral-400"}`}
        >
          eBay
        </button>
        <button
          onClick={() => setPlatform("vinted")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${platform === "vinted" ? "bg-amber-400 text-neutral-950" : "text-neutral-400"}`}
        >
          Vinted
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <CopyField label="Title" value={item.title} charLimit={platform === "ebay" ? 80 : 60} />
        <CopyField
          label={platform === "ebay" ? "Starting price (consider allowing offers up to the high end)" : "Price"}
          value={platform === "ebay" ? priceLabel : `£${item.price_low ?? "—"}`}
        />
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

function DownloadablePhotos({ item }) {
  const sku = stockNumber(item);
  const titleSlug = (item.title || "item").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-neutral-500">Photos — tap to download</span>
        <span className="text-xs font-mono text-amber-300/80">Stock #{sku}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(item.photos || []).map((p, i) => (
          <a
            key={i}
            href={p}
            download={`${sku}-${titleSlug}-${i + 1}.jpg`}
            className="relative shrink-0"
          >
            <img src={p} alt="" className="w-24 h-24 rounded-lg object-cover border border-neutral-800" />
            <div className="absolute bottom-1 right-1 bg-neutral-950/80 rounded-md p-1">
              <Download size={12} />
            </div>
          </a>
        ))}
      </div>
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
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-xs flex flex-col gap-3">
        <div className="flex items-center gap-2 justify-center mb-2">
          <div className="w-8 h-8 rounded-md bg-amber-400 flex items-center justify-center">
            <Lock size={16} className="text-neutral-950" />
          </div>
          <span className="font-bold text-lg">SnapStock</span>
        </div>
        <input
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          placeholder="Enter passcode"
          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-center"
          autoFocus
        />
        {error && <p className="text-red-400 text-sm text-center">Wrong passcode</p>}
        <button type="submit" className="w-full py-2.5 rounded-lg bg-amber-400 text-neutral-950 font-bold">
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

  const [view, setView] = useState("capture");
  const [items, setItems] = useState([]);
  const [loadedItems, setLoadedItems] = useState(false);
  const [currentPhotos, setCurrentPhotos] = useState([]);
  const [capturing, setCapturing] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
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
      const full = await compressImage(file, 900, 0.65);
      setCurrentPhotos((prev) => [...prev, full].slice(0, 5));
    } catch (err) {
      console.error(err);
    } finally {
      setCapturing(false);
      e.target.value = "";
    }
  };

  const processItem = useCallback(async (id, photos) => {
    try {
      const result = await analyzeItem(photos);
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
          status: "ready",
        })
        .eq("id", id);
    } catch (err) {
      console.error(err);
      await supabase.from("items").update({ status: "error" }).eq("id", id);
    }
    fetchItems();
  }, [fetchItems]);

  const handleNextItem = async () => {
    if (currentPhotos.length === 0) return;
    try {
      const thumbnail = await resizeDataUrl(currentPhotos[0], 160, 0.5).catch(() => currentPhotos[0]);
      const { data, error } = await supabase
        .from("items")
        .insert({
          title: "Untitled item",
          status: "processing",
          photos: currentPhotos,
          thumbnail,
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
  };
  const closeItem = () => {
    setSelectedItem(null);
    setEditDraft(null);
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
      })
      .eq("id", editDraft.id);
    setSelectedItem(editDraft);
    fetchItems();
  };

  const retryItem = async (item) => {
    await supabase.from("items").update({ status: "processing" }).eq("id", item.id);
    setSelectedItem({ ...item, status: "processing" });
    fetchItems();
    processItem(item.id, item.photos);
  };

  const removeItem = async (id) => {
    await supabase.from("items").delete().eq("id", id);
    fetchItems();
    closeItem();
  };

  if (!checkedLock) return null;
  if (!unlocked) return <PasscodeGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <div className="border-b border-neutral-800 px-4 py-3 flex items-center justify-between sticky top-0 bg-neutral-950/95 backdrop-blur z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-amber-400 flex items-center justify-center">
            <Tag size={15} className="text-neutral-950" />
          </div>
          <span className="font-bold tracking-tight text-lg">SnapStock</span>
        </div>
        <div className="flex bg-neutral-900 rounded-lg p-0.5 border border-neutral-800">
          <button
            onClick={() => setView("capture")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${view === "capture" ? "bg-amber-400 text-neutral-950" : "text-neutral-400"}`}
          >
            Capture
          </button>
          <button
            onClick={() => setView("stock")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${view === "stock" ? "bg-amber-400 text-neutral-950" : "text-neutral-400"}`}
          >
            Stock {items.length > 0 && `(${items.length})`}
          </button>
        </div>
      </div>

      {view === "capture" && (
        <div className="flex-1 flex flex-col p-4 max-w-lg w-full mx-auto">
          <p className="text-neutral-400 text-sm mb-4">
            Photograph one item from a few angles, then press <span className="text-neutral-200 font-medium">Next item</span>. It processes in the background — check Stock on either phone or laptop for the finished ad.
          </p>

          <div className="grid grid-cols-5 gap-2 mb-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-lg border border-neutral-800 overflow-hidden flex items-center justify-center bg-neutral-900 relative">
                {currentPhotos[i] ? (
                  <>
                    <img src={currentPhotos[i]} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setCurrentPhotos((p) => p.filter((_, idx) => idx !== i))}
                      className="absolute top-0.5 right-0.5 bg-neutral-950/80 rounded-full p-0.5"
                    >
                      <X size={11} />
                    </button>
                  </>
                ) : (
                  <span className="text-neutral-700 text-xs">{i + 1}</span>
                )}
              </div>
            ))}
          </div>

          <div
            className={`relative w-full py-4 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center gap-2 font-medium text-neutral-100 mb-3 ${
              currentPhotos.length >= 5 || capturing ? "opacity-40" : ""
            }`}
          >
            {capturing ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
            {currentPhotos.length === 0 ? "Take photo" : `Add photo (${currentPhotos.length}/5)`}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleAddPhoto}
              disabled={currentPhotos.length >= 5 || capturing}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
            />
          </div>

          <button
            onClick={handleNextItem}
            disabled={currentPhotos.length === 0}
            className="w-full py-4 rounded-xl bg-amber-400 text-neutral-950 flex items-center justify-center gap-2 font-bold disabled:opacity-30 active:scale-[0.98] transition"
          >
            <Check size={18} />
            Next item
          </button>

          {items.some((e) => e.status === "processing") && (
            <p className="text-xs text-neutral-500 text-center mt-4 flex items-center justify-center gap-1.5">
              <Loader2 size={11} className="animate-spin" />
              {items.filter((e) => e.status === "processing").length} item(s) being written up
            </p>
          )}
        </div>
      )}

      {view === "stock" && (
        <div className="flex-1 p-4 max-w-lg w-full mx-auto">
          {!loadedItems ? (
            <div className="flex items-center justify-center py-20 text-neutral-500">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-neutral-500">
              <Package size={28} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No stock yet. Capture your first item.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((e) => (
                <button
                  key={e.id}
                  onClick={() => openItem(e)}
                  className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-xl p-2.5 text-left active:scale-[0.99] transition"
                >
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-neutral-800 shrink-0">
                    {e.thumbnail && <img src={e.thumbnail} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{e.title}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <StatusBadge status={e.status} />
                      {e.status === "ready" && <PriceTag low={e.price_low} high={e.price_high} />}
                      <span className="text-xs font-mono text-neutral-600">#{stockNumber(e)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedItem && (
        <div className="fixed inset-0 bg-neutral-950 z-20 flex flex-col">
          <div className="border-b border-neutral-800 px-4 py-3 flex items-center justify-between sticky top-0 bg-neutral-950 z-10">
            <button onClick={closeItem} className="flex items-center gap-1 text-neutral-400 text-sm">
              <ChevronLeft size={18} />
              Back
            </button>
            <button onClick={() => removeItem(selectedItem.id)} className="text-red-400 flex items-center gap-1 text-sm">
              <Trash2 size={15} />
              Delete
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 max-w-lg w-full mx-auto">
            <DownloadablePhotos item={selectedItem} />

            <div className="mb-3">
              <StatusBadge status={selectedItem.status} />
            </div>

            {selectedItem.status === "processing" && (
              <p className="text-sm text-neutral-400 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Writing the ad up now — check back in a moment.
              </p>
            )}

            {selectedItem.status === "error" && (
              <div className="bg-red-400/10 border border-red-400/30 rounded-lg p-3 mb-4 flex items-start gap-2">
                <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-300 mb-2">Couldn't generate an ad for this item.</p>
                  <button onClick={() => retryItem(selectedItem)} className="flex items-center gap-1.5 text-xs font-medium bg-red-400/15 px-2.5 py-1.5 rounded-md">
                    <RefreshCw size={12} /> Retry
                  </button>
                </div>
              </div>
            )}

            {selectedItem.status === "ready" && editDraft && (
              <>
                <ListingHelper item={selectedItem} />

                <p className="text-xs text-neutral-500 mb-3 border-t border-neutral-800 pt-4">
                  Need to correct something? Edit below, then save — the copy fields above update too.
                </p>

                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs text-neutral-500 mb-1 block">Title</label>
                    <input
                    value={editDraft.title || ""}
                    onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-neutral-500 mb-1 block">Price low (£)</label>
                    <input
                      type="number"
                      value={editDraft.price_low ?? ""}
                      onChange={(e) => setEditDraft({ ...editDraft, price_low: e.target.value === "" ? null : Number(e.target.value) })}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500 mb-1 block">Price high (£)</label>
                    <input
                      type="number"
                      value={editDraft.price_high ?? ""}
                      onChange={(e) => setEditDraft({ ...editDraft, price_high: e.target.value === "" ? null : Number(e.target.value) })}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm tabular-nums"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-neutral-500 mb-1 block">Category</label>
                    <input
                      value={editDraft.category || ""}
                      onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500 mb-1 block">Condition</label>
                    <input
                      value={editDraft.condition || ""}
                      onChange={(e) => setEditDraft({ ...editDraft, condition: e.target.value })}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">Description</label>
                  <textarea
                    value={editDraft.description || ""}
                    onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                    rows={4}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm resize-none"
                  />
                </div>

                {editDraft.notes && (
                  <div className="bg-amber-400/10 border border-amber-400/20 rounded-lg p-3 text-xs text-amber-200/90">
                    <span className="font-medium">AI note: </span>
                    {editDraft.notes}
                    {editDraft.confidence && <span className="text-amber-200/60"> · confidence: {editDraft.confidence}</span>}
                  </div>
                )}

                <button
                  onClick={saveEdits}
                  className="w-full py-3 rounded-xl bg-amber-400 text-neutral-950 font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition"
                >
                  <Pencil size={15} />
                  Save changes
                </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
