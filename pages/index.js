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
    processing: { label: "Processing", cls: "bg-[#A9822E]/15 text-[#A9822E] border-[#A9822E]/30" },
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

function ListedToggles({ item, onToggle }) {
  const platforms = [
    { field: "ebay_listed", label: "eBay" },
    { field: "vinted_listed", label: "Vinted" },
    { field: "depop_listed", label: "Depop" },
  ];
  return (
    <div className="mb-5">
      <span className="text-xs text-[#8A7F63] uppercase tracking-wide block mb-1.5">Listed on</span>
      <div className="flex gap-2">
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
          </button>
        ))}
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
        <span className="text-xs text-[#8A7F63]">Photos — tap to download</span>
        <span className="text-xs font-mono text-[#A9822E]/80">Stock #{sku}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(item.photos || []).map((p, i) => (
          <a
            key={i}
            href={p}
            download={`ItemGen/${sku}/${sku}-${titleSlug}-${i + 1}.jpg`}
            className="relative shrink-0"
          >
            <img src={p} alt="" className="w-24 h-24 rounded-sm object-cover border border-[#C9BFA3]" />
            <div className="absolute bottom-1 right-1 bg-[#EDE6D6]/80 rounded-md p-1">
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
    <div className="min-h-screen bg-[#EDE6D6] text-[#2B2620] flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-xs flex flex-col gap-3">
        <div className="flex items-center gap-2 justify-center mb-2">
          <div className="w-8 h-8 rounded-md bg-[#A9822E] flex items-center justify-center">
            <Lock size={16} className="text-[#2B2620]" />
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

  const [view, setView] = useState("capture");
  const [items, setItems] = useState([]);
  const [stockFilter, setStockFilter] = useState("active");
  const [loadedItems, setLoadedItems] = useState(false);
  const [currentPhotos, setCurrentPhotos] = useState([]);
  const [capturing, setCapturing] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
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
      const thumbnail = await resizeDataUrl(currentPhotos[0], 600, 0.65).catch(() => currentPhotos[0]);
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
    setEditing(false);
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
    await supabase.from("items").update({ [field]: newVal }).eq("id", item.id);
    const updated = { ...item, [field]: newVal };
    setSelectedItem(updated);
    setEditDraft((d) => (d ? { ...d, [field]: newVal } : d));
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
          <div className="w-8 h-8 border-2 border-[#2B2620] flex items-center justify-center -rotate-3 bg-[#F7F3E8] shrink-0">
            <span className="font-mono text-[10px] font-bold tracking-tighter">IG</span>
          </div>
          <span className="font-serif text-xl tracking-tight">ItemGen</span>
        </div>
        <div className="flex bg-[#F7F3E8] rounded-sm p-0.5 border border-[#C9BFA3]">
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

      {view === "capture" && (
        <div className="flex-1 flex flex-col p-4 sm:p-8 max-w-xl w-full mx-auto">
          <p className="text-[#6B6250] text-sm mb-4">
            Photograph one item from a few angles, then press <span className="text-[#2B2620] font-medium">Next item</span>. It processes in the background — check Stock on either phone or laptop for the finished ad.
          </p>

          <div className="grid grid-cols-5 gap-2 mb-4">
            {Array.from({ length: 5 }).map((_, i) => (
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
                  <span className="text-[#A79B7C] text-xs">{i + 1}</span>
                )}
              </div>
            ))}
          </div>

          <div
            className={`relative w-full py-4 rounded bg-[#F7F3E8] border border-[#C9BFA3] flex items-center justify-center gap-2 font-medium text-[#2B2620] mb-3 ${
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

          {(() => {
            const filteredItems = items.filter((e) =>
              stockFilter === "all" ? true : stockFilter === "sold" ? e.status === "sold" : e.status !== "sold"
            );
            const soldItems = items.filter((e) => e.status === "sold");
            const revenue = soldItems.reduce((s, e) => s + (Number(e.sale_price) || 0), 0);
            const cost = soldItems.reduce((s, e) => s + (Number(e.cost_price) || 0), 0);

            return (
              <>
                {stockFilter === "sold" && soldItems.length > 0 && (
                  <div className="flex flex-wrap gap-x-8 gap-y-2 mb-5 px-1 font-mono text-sm">
                    <div>
                      <span className="text-[#8A7F63] uppercase text-xs tracking-wide block">Sold</span>
                      <span className="text-lg">{soldItems.length}</span>
                    </div>
                    <div>
                      <span className="text-[#8A7F63] uppercase text-xs tracking-wide block">Revenue</span>
                      <span className="text-lg">£{revenue.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[#8A7F63] uppercase text-xs tracking-wide block">Cost</span>
                      <span className="text-lg">£{cost.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-[#8A7F63] uppercase text-xs tracking-wide block">Profit</span>
                      <span className="text-lg text-[#3F5E42] font-bold">£{(revenue - cost).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {!loadedItems ? (
                  <div className="flex items-center justify-center py-20 text-[#8A7F63]">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="text-center py-20 text-[#8A7F63]">
                    <Package size={28} className="mx-auto mb-3 opacity-40" />
                    <p className="text-sm">
                      {stockFilter === "sold" ? "No sold items yet." : "No stock yet. Capture your first item."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredItems.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => openItem(e)}
                        className="text-left bg-[#F7F3E8] border border-[#C9BFA3] rounded overflow-hidden active:scale-[0.99] transition"
                      >
                        <div className="aspect-square bg-[#DCD4BC] relative overflow-hidden">
                          {(e.photos?.[0] || e.thumbnail) && (
                            <img src={e.photos?.[0] || e.thumbnail} alt="" className="w-full h-full object-cover" />
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
                        <div className="p-3">
                          <div className="font-medium text-sm truncate">{e.title}</div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <StatusBadge status={e.status} />
                            {e.status === "sold" && e.sale_price != null ? (
                              <span className="text-[#3F5E42] font-mono font-semibold text-sm">Sold £{e.sale_price}</span>
                            ) : (
                              e.status === "ready" && <PriceTag low={e.price_low} high={e.price_high} />
                            )}
                          </div>
                          <span className="text-xs font-mono text-[#8A7F63] block mt-1">#{stockNumber(e)}</span>
                          {(e.ebay_listed || e.vinted_listed || e.depop_listed) && (
                            <span className="text-xs text-[#3F5E42] block mt-0.5">
                              {[e.ebay_listed && "eBay", e.vinted_listed && "Vinted", e.depop_listed && "Depop"].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </div>
                      </button>
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
            <DownloadablePhotos item={selectedItem} />

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

            {selectedItem.status === "ready" && editDraft && (
              <>
                <ListingHelper item={selectedItem} />

                <ListedToggles item={selectedItem} onToggle={togglePlatform} />

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
                        className="flex-1 py-3 rounded bg-[#A9822E] text-[#2B2620] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition"
                      >
                        <Pencil size={15} />
                        Save changes
                      </button>
                    </div>
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
