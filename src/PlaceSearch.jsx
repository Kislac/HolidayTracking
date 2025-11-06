import React, { useEffect, useRef, useState } from "react";

/**
 * Simple place / city search using Nominatim (OpenStreetMap).
 * onSelect receives: { name, country, countryCode, city, lat, lng }
 */
export default function PlaceSearch({ onSelect, placeholder = "Search place or city..." }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!q) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, {
          headers: { "Accept-Language": "en" } // results in english fields
        });
        const data = await res.json();
        setItems(data || []);
      } catch (e) {
        console.warn("PlaceSearch fetch error", e);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeoutRef.current);
  }, [q]);

  function toPlace(item) {
    const addr = item.address || {};
    const city = addr.city || addr.town || addr.village || addr.hamlet || addr.state || "";
    return {
      name: (addr.name || item.display_name || "").split(",")[0] || item.display_name,
      country: addr.country || "",
      countryCode: (addr.country_code || "").toUpperCase(),
      city,
      lat: Number(item.lat),
      lng: Number(item.lon),
      raw: item
    };
  }

  return (
    <div className="relative w-full max-w-md">
      <input
        type="search"
        className="w-full rounded-xl border p-2"
        placeholder={placeholder}
        value={q}
        onChange={(e)=>setQ(e.target.value)}
      />
      { (items.length>0 || loading) && (
        <div className="absolute left-0 right-0 mt-1 bg-white rounded-lg shadow z-50 max-h-64 overflow-auto">
          {loading && <div className="p-2 text-sm text-slate-500">Searching…</div>}
          {items.map((it, idx) => {
            const p = toPlace(it);
            return (
              <button
                key={idx}
                className="text-left w-full p-2 hover:bg-slate-100 text-sm"
                onClick={() => { onSelect(p); setQ(""); setItems([]); }}
              >
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-slate-500">{it.display_name}</div>
              </button>
            );
          })}
          {!loading && items.length === 0 && <div className="p-2 text-sm text-slate-500">No results</div>}
        </div>
      )}
    </div>
  );
}