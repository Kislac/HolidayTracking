import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, GeoJSON } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { v4 as uuidv4 } from "uuid";

// Alap Leaflet ikon javítás (különben nem látszik a marker)
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
const DefaultIcon = L.icon({ iconUrl, shadowUrl: iconShadow, iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

// ---- Típusok ----
/** @typedef {"visited"|"wishlist"} PlaceStatus */

// ---- Segédfüggvények ----
const STORAGE_KEY = "travel-tracker-places-v1";
const saveToStorage = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
const loadFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// ---- Minta adatok ----
const seedPlaces = [
  {
    id: uuidv4(),
    name: "Bledi-tó",
    country: "Szlovénia",
    countryCode: "SI",
    city: "Bled",
    lat: 46.3625,
    lng: 14.0936,
    status: "visited",
    dateVisited: "2025-10-23",
    rating: 5,
    notes: "Csónak, sziget, remek kilátás.",
    tags: ["tó", "kirándulás"]
  },
  {
    id: uuidv4(),
    name: "Prága óváros",
    country: "Csehország",
    countryCode: "CZ",
    city: "Prága",
    lat: 50.087,
    lng: 14.406,
    status: "wishlist",
    dateVisited: "",
    rating: 0,
    notes: "Híd, óváros, sörök.",
    tags: ["városnézés"]
  },
];

// ---- Komponens: Kattintás a térképen koordináta kiválasztáshoz ----
function MapClickCapture({ onSelect }) {
  useMapEvents({
    click(e) {
      onSelect([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

// ---- Fő alkalmazás ----
export default function App() {
  const [places, setPlaces] = useState(() => loadFromStorage() ?? seedPlaces);
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [newCoords, setNewCoords] = useState([47.4979, 19.0402]); // Budapest default

  // --- Új: countries GeoJSON és mapping ---
  const [countriesGeo, setCountriesGeo] = useState(null);
  useEffect(() => {
    fetch("https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson")
      .then(r => r.json())
      .then(j => setCountriesGeo(j))
      .catch(e => console.warn("Nem sikerült betölteni a countries.geo.json", e));
  }, []);

  const countryNameToAlpha2 = useMemo(() => {
    if (!countriesGeo?.features) return new Map();
    const m = new Map();
    countriesGeo.features.forEach(f => {
      const props = f.properties || {};
      const alpha2 = String(props["ISO3166-1-Alpha-2"] || props["ISO_A2"] || props["iso_a2"] || props["ISO2"] || "").toUpperCase();
      const name = String(props.name || props.NAME || "").toLowerCase();
      if (name && alpha2) m.set(name, alpha2);
      if (alpha2) m.set(alpha2.toLowerCase(), alpha2);
    });
    return m;
  }, [countriesGeo]);

  function getAlpha2ForPlace(p) {
    if (!p) return null;
    if (p.countryCode) return String(p.countryCode).toUpperCase();
    const key = String(p.country || "").trim().toLowerCase();
    return countryNameToAlpha2.get(key) || null;
  }

  useEffect(() => saveToStorage(places), [places]);

  const selected = useMemo(() => places.find(p => p.id === selectedId) || null, [places, selectedId]);

  const filtered = useMemo(() => {
    return places.filter(p => {
      const t = (p.name + " " + p.country + " " + p.city + " " + (p.tags||[]).join(" ")).toLowerCase();
      const textOk = t.includes(filterText.toLowerCase());
      const statusOk = filterStatus === "all" ? true : p.status === filterStatus;
      return textOk && statusOk;
    });
  }, [places, filterText, filterStatus]);

  const stats = useMemo(() => {
    const visited = places.filter(p => p.status === "visited");
    const wishlist = places.filter(p => p.status === "wishlist");

    let countries;
    if (countryNameToAlpha2 && countryNameToAlpha2.size > 0) {
      countries = new Set(visited.map(p => getAlpha2ForPlace(p)).filter(Boolean));
    } else {
      countries = new Set(visited.map(p => (p.country || "").trim()).filter(Boolean));
    }

    return { visitedCount: visited.length, wishlistCount: wishlist.length, countriesCount: countries.size };
  }, [places, countryNameToAlpha2]);

  const visitedCountrySetIso2 = useMemo(() => {
    const s = new Set();
    places.forEach(p => {
      if (p.status === "visited") {
        const c = getAlpha2ForPlace(p);
        if (c) s.add(c);
      }
    });
    return s;
  }, [places, countryNameToAlpha2]);

  function countryStyle(feature) {
    const props = feature.properties || {};
    const alpha2 = String(props["ISO3166-1-Alpha-2"] || props["ISO_A2"] || props["iso_a2"] || props["ISO2"] || "").toUpperCase();
    const visited = alpha2 && visitedCountrySetIso2.has(alpha2);
    return {
      fillColor: visited ? "#f87171" : "#ffffff",
      fillOpacity: visited ? 0.6 : 0.05,
      color: "#999",
      weight: 1,
    };
  }

  function addPlaceFromForm(formEl) {
    const f = new FormData(formEl);
    const name = f.get("name").toString().trim();
    if (!name) return;
    const country = f.get("country").toString().trim();
    const countryCode = String(f.get("countryCode") || "").trim().toUpperCase() || undefined;
    const city = f.get("city").toString().trim();
    const status = /** @type {PlaceStatus} */ (f.get("status").toString());
    const dateVisited = f.get("dateVisited").toString();
    const rating = Number(f.get("rating")) || 0;
    const notes = f.get("notes").toString();
    const tags = f.get("tags").toString().split(",").map(s=>s.trim()).filter(Boolean);
    let lat = Number(f.get("lat"));
    let lng = Number(f.get("lng"));
    if (!isFinite(lat)) lat = newCoords?.[0] ?? 0;
    if (!isFinite(lng)) lng = newCoords?.[1] ?? 0;

    const newPlace = { id: uuidv4(), name, country, countryCode, city, lat, lng, status, dateVisited, rating, notes, tags };
    setPlaces(prev => [newPlace, ...prev]);
    formEl.reset();
  }

  function updateSelected(field, value) {
    setPlaces(prev => prev.map(p => p.id === selectedId ? { ...p, [field]: value } : p));
  }

  function removePlace(id) {
    setPlaces(prev => prev.filter(p => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(places, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "utazasok.json";
    a.click();
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(String(reader.result));
        if (Array.isArray(arr)) {
          const normalized = arr.map((p) => ({
            id: p.id ?? uuidv4(),
            name: String(p.name||"").trim(),
            country: String(p.country||"").trim(),
            countryCode: String(p.countryCode||p.countryCode||"").trim().toUpperCase() || undefined,
            city: String(p.city||"").trim(),
            lat: Number(p.lat) || 0,
            lng: Number(p.lng) || 0,
            status: (p.status === "visited" ? "visited" : "wishlist"),
            dateVisited: String(p.dateVisited||""),
            rating: Number(p.rating||0),
            notes: String(p.notes||""),
            tags: Array.isArray(p.tags) ? p.tags.map(String) : []
          }));
          setPlaces(normalized);
        }
      } catch (e) {
        alert("Hibás JSON fájl");
      }
    };
    reader.readAsText(file);
  }

  const fileRef = useRef();

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 bg-gray-50">
      {/* Bal oldali panel – Lista és szűrők */}
      <section className="lg:col-span-1 space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Utazás napló
          </h1>
          <div className="text-sm text-gray-600">Látogatott országok: <b>{stats.countriesCount}</b> • Helyek: <b>{stats.visitedCount}</b> ✓ / <b>{stats.wishlistCount}</b> kívánság</div>
        </header>

        {/* Kereső és státusz szűrő */}
        <div className="flex gap-2">
          <input
            className="w-full rounded-xl border p-2"
            placeholder="Keresés (név, ország, város, címke)"
            value={filterText}
            onChange={(e)=>setFilterText(e.target.value)}
          />
          <select className="rounded-xl border p-2" value={filterStatus} onChange={(e)=>setFilterStatus(e.target.value)}>
            <option value="all">Mind</option>
            <option value="visited">Meglátogatott</option>
            <option value="wishlist">Kívánságlista</option>
          </select>
        </div>

        {/* Helyek lista */}
        <div className="bg-white rounded-2xl shadow p-2 max-h-[45vh] overflow-auto">
          {filtered.length === 0 && (
            <div className="text-center text-gray-500 py-8">Nincs találat.</div>
          )}
          <ul className="divide-y">
            {filtered.map(p => (
              <li key={p.id} className={`p-2 hover:bg-gray-50 rounded-xl flex items-center gap-2 ${selectedId===p.id?"ring-2 ring-blue-200": ""}`}>
                <button className="text-left flex-1" onClick={()=>setSelectedId(p.id)}>
                  <div className="font-semibold flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${p.status==="visited"?"bg-green-500":"bg-blue-500"}`}></span>
                    {p.name}
                  </div>
                  <div className="text-xs text-gray-500">{p.city || ""}{p.city && p.country ? ", " : ""}{p.country || ""}</div>
                </button>
                <button className="text-xs px-2 py-1 rounded-lg border" onClick={()=>updateSelected("status", p.status==="visited"?"wishlist":"visited") || setSelectedId(p.id)}>
                  {p.status === "visited" ? "→ kívánság" : "✓ meglátogatott"}
                </button>
                <button className="text-xs px-2 py-1 rounded-lg border text-red-600" onClick={()=>removePlace(p.id)}>Töröl</button>
              </li>
            ))}
          </ul>
        </div>

        {/* Export/Import */}
        <div className="flex gap-2">
          <button className="flex-1 rounded-xl border p-2" onClick={exportJson}>Export JSON</button>
          <input type="file" accept="application/json" ref={fileRef} className="hidden" onChange={(e)=> e.target.files?.[0] && importJson(e.target.files[0])} />
          <button className="flex-1 rounded-xl border p-2" onClick={()=>fileRef.current?.click()}>Import JSON</button>
        </div>
      </section>

      {/* Középső – Térkép */}
      <section className="lg:col-span-2 grid grid-rows-[1fr_auto] gap-4">
        <div className="rounded-2xl overflow-hidden shadow">
          <MapContainer center={[47.5, 19.04]} zoom={6} style={{ height: "60vh", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> közreműködők'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickCapture onSelect={(coords)=>setNewCoords(coords)} />

            {/* GeoJSON országhatárok (ha betöltődött) */}
            {countriesGeo && (
              <GeoJSON data={countriesGeo} style={countryStyle} />
            )}

            {places.map(p => (
              <Marker key={p.id} position={[p.lat, p.lng]} eventHandlers={{ click: () => setSelectedId(p.id) }}>
                <Popup>
                  <div className="space-y-1">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-gray-600">{p.city}{p.city && p.country ? ", " : ""}{p.country}</div>
                    {p.status === "visited" ? (
                      <div className="text-xs">✅ Meglátogatva {p.dateVisited || "–"} • ⭐ {p.rating || 0}/5</div>
                    ) : (
                      <div className="text-xs">📝 Kívánságlista</div>
                    )}
                    {p.notes && <div className="text-xs text-gray-700">{p.notes}</div>}
                    <button className="mt-1 text-xs underline" onClick={()=>setSelectedId(p.id)}>Megnyitás</button>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Új hely ideiglenes marker */}
            {newCoords && (
              <Marker position={newCoords}>
                <Popup>Új hely kijelölve: {newCoords[0].toFixed(4)}, {newCoords[1].toFixed(4)}</Popup>
              </Marker>
            )}
          </MapContainer>
        </div>

        {/* Új hely hozzáadása űrlap */}
        <div className="bg-white rounded-2xl shadow p-4">
          <h2 className="font-semibold mb-2">Új hely hozzáadása</h2>
          <form className="grid md:grid-cols-3 gap-3 items-start" onSubmit={(e)=>{e.preventDefault(); addPlaceFromForm(e.currentTarget);}}>
              <input name="name" className="rounded-xl border p-2" placeholder="Hely neve (pl. Bledi-tó)" required />
              <input name="country" className="rounded-xl border p-2" placeholder="Ország (név)" />
              <input name="countryCode" className="rounded-xl border p-2" placeholder="Ország ISO-kód (pl. HU)" />
              <input name="city" className="rounded-xl border p-2" placeholder="Város/Régió" />
            <div className="flex gap-2">
              <input name="lat" type="number" step="any" className="rounded-xl border p-2 w-full" placeholder="Szélesség (lat)"
                value={newCoords?.[0] ?? ''} onChange={(e)=>setNewCoords([Number(e.target.value), newCoords?.[1] ?? 0])} />
              <input name="lng" type="number" step="any" className="rounded-xl border p-2 w-full" placeholder="Hosszúság (lng)"
                value={newCoords?.[1] ?? ''} onChange={(e)=>setNewCoords([newCoords?.[0] ?? 0, Number(e.target.value)])} />
            </div>
            <select name="status" className="rounded-xl border p-2">
              <option value="visited">Meglátogatott</option>
              <option value="wishlist">Kívánságlista</option>
            </select>
            <input name="dateVisited" type="date" className="rounded-xl border p-2" />
            <input name="rating" type="number" min={0} max={5} className="rounded-xl border p-2" placeholder="Értékelés (0–5)" />
            <input name="tags" className="rounded-xl border p-2" placeholder="Címkék (vesszővel)" />
            <textarea name="notes" className="rounded-xl border p-2 md:col-span-2" placeholder="Jegyzetek" />
            <button className="rounded-xl border p-2 md:col-span-1">Hozzáadás</button>
          </form>
          <p className="text-xs text-gray-500 mt-2">Tipp: a térképen kattintva felül beáll a koordináta (lat/lng).</p>
        </div>
      </section>

      {/* Jobb oldali – Részletek / szerkesztés */}
      <aside className="lg:col-span-3 xl:col-span-1 xl:col-start-3"></aside>
      {selected && (
        <div className="lg:col-span-3 bg-white rounded-2xl shadow p-4">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h2 className="font-semibold text-lg">Hely részletei</h2>
              <div className="grid md:grid-cols-3 gap-3 mt-2">
                <label className="text-sm">Név
                  <input className="w-full rounded-xl border p-2" value={selected.name} onChange={(e)=>updateSelected("name", e.target.value)} />
                </label>
                <label className="text-sm">Ország
                  <input className="w-full rounded-xl border p-2" value={selected.country} onChange={(e)=>updateSelected("country", e.target.value)} />
                </label>
                <label className="text-sm">Ország ISO
                  <input className="w-full rounded-xl border p-2" value={selected.countryCode || ""} onChange={(e)=>updateSelected("countryCode", e.target.value.toUpperCase())} />
                </label>
                <label className="text-sm">Város
                  <input className="w-full rounded-xl border p-2" value={selected.city} onChange={(e)=>updateSelected("city", e.target.value)} />
                </label>
                <label className="text-sm">Állapot
                  <select className="w-full rounded-xl border p-2" value={selected.status} onChange={(e)=>updateSelected("status", e.target.value)}>
                    <option value="visited">Meglátogatott</option>
                    <option value="wishlist">Kívánságlista</option>
                  </select>
                </label>
                <label className="text-sm">Dátum
                  <input type="date" className="w-full rounded-xl border p-2" value={selected.dateVisited} onChange={(e)=>updateSelected("dateVisited", e.target.value)} />
                </label>
                <label className="text-sm">Értékelés (0–5)
                  <input type="number" min={0} max={5} className="w-full rounded-xl border p-2" value={selected.rating} onChange={(e)=>updateSelected("rating", Number(e.target.value))} />
                </label>
                <label className="text-sm md:col-span-3">Címkék (vesszővel)
                  <input className="w-full rounded-xl border p-2" value={(selected.tags||[]).join(", ")} onChange={(e)=>updateSelected("tags", e.target.value.split(",").map(s=>s.trim()).filter(Boolean))} />
                </label>
                <label className="text-sm md:col-span-3">Jegyzetek
                  <textarea className="w-full rounded-xl border p-2" value={selected.notes} onChange={(e)=>updateSelected("notes", e.target.value)} />
                </label>
              </div>
            </div>
            <div className="w-64 shrink-0 space-y-2">
              <div className="text-sm text-gray-600">Koordináták</div>
              <div className="grid grid-cols-2 gap-2">
                <input className="rounded-xl border p-2" value={selected.lat} onChange={(e)=>updateSelected("lat", Number(e.target.value))} />
                <input className="rounded-xl border p-2" value={selected.lng} onChange={(e)=>updateSelected("lng", Number(e.target.value))} />
              </div>
              <button className="w-full rounded-xl border p-2" onClick={()=>setSelectedId(null)}>Bezárás</button>
            </div>
          </div>
        </div>
      )}

      <footer className="lg:col-span-3 text-center text-xs text-gray-500 py-2">
        Adatok a böngészőben (localStorage) tárolva. Export/Import gombokkal viheted át másik gépre. Forrás: OpenStreetMap csempék.
      </footer>
    </div>
  );
}