import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, GeoJSON } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "./supabaseClient";
import Toastify from "toastify-js";
import "toastify-js/src/toastify.css";

// Alap Leaflet ikon javítás (különben nem látszik a marker)
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
const DefaultIcon = L.icon({ iconUrl, shadowUrl: iconShadow, iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

import { createPortal } from "react-dom";
import ResetPassword from "./ResetPassword";

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

function showToast(text, type="info") {
  Toastify({
    text,
    duration: 3500,
    gravity: "top",
    position: "center",
    close: true,
    style: {
      background: type==="success"
        ? "linear-gradient(to right,#16a34a,#15803d)"
        : type==="error"
        ? "linear-gradient(to right,#dc2626,#b91c1c)"
        : "linear-gradient(to right,#334155,#1e293b)",
      borderRadius: "0.75rem",
      fontSize: "13px"
    }
  }).showToast();
}

// ---- Komponens: Kattintás a térképen koordináta kiválasztáshoz ----
function MapClickCapture({ onSelect }) {
  useMapEvents({
    click(e) {
      onSelect([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}



function mapDbRowToPlace(row) {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    countryCode: row.country_code || row.countryCode || undefined,
    city: row.city,
    lat: Number(row.lat) || 0,
    lng: Number(row.lng) || 0,
    status: row.status,
    dateVisited: row.date_visited ? String(row.date_visited).split("T")[0] : "",
    rating: row.rating || 0,
    notes: row.notes || "",
    tags: Array.isArray(row.tags) ? row.tags : (row.tags ? JSON.parse(row.tags) : []),
  };
}

// ---- Fő alkalmazás ----
export default function App() {
  // If the app was opened via the reset-password redirect, render the reset page only
  if (typeof window !== "undefined" && window.location.pathname.endsWith("/reset-password")) {
  return <ResetPassword />;
  }

  const [places, setPlaces] = useState(() => loadFromStorage() ?? seedPlaces);
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [newCoords, setNewCoords] = useState([47.4979, 19.0402]); // Budapest default

  //Register section
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);

  // Supabase / auth state
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const fileRef = useRef();

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editPlace, setEditPlace] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  //Login modal
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Forgot password state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");

 // GitHub commit info
  const [lastCommit, setLastCommit] = useState(null);
  useEffect(() => {
    // get latest commit on main
    fetch("https://api.github.com/repos/Kislac/HolidayTracking/commits")
      .then((r) => r.json())
      .then((arr) => {
        if (Array.isArray(arr) && arr[0]) {
          const c = arr[0];
          setLastCommit({ sha: c.sha, message: c.commit?.message || "", url: c.html_url, date: c.commit?.author?.date });
        }
      })
      .catch(() => {});
  }, []);
  
  // Fullscreen map state and ref
  const mapRef = useRef(null);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);

  useEffect(() => {
    if (!mapRef.current) return;
    // give Leaflet time to resize after CSS changes
    setTimeout(() => {
      try { mapRef.current.invalidateSize(); } catch {}
    }, 200);
  }, [isMapFullscreen]);

  // exit fullscreen with ESC
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape" && isMapFullscreen) setIsMapFullscreen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMapFullscreen]);

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


  function isValidEmailFormat(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  async function signUp(email, password) {
    if (registerLoading) return;
    setRegisterLoading(true);
     try {
       const { data, error } = await supabase.auth.signUp({ email, password });
       console.log("signUp result:", { data, error });
      if (error) {
        const raw = error.message || "Registration failed.";
        setRegisterError(raw);
        showToast(raw, "error");
        return;
      }

      // Ha van user, de nincs session => megerősítő email lett kiküldve (vagy user már létezett és újraküldve)
      if (data?.user && !data?.session) {
        setRegisterError("");
        if (data.user.confirmation_sent_at) {
          showToast("Registration email sent. Check your inbox (or spam).", "success");
        } else {
          showToast("Registration successful. Check your email.", "success");
        }
      } else if (data?.session) {
        showToast("Registered and signed in.", "success");
      } else {
        showToast("Registration successful.", "success");
      }

      // reset modal/state
      setShowRegisterModal(false);
      setRegisterEmail("");
      setRegisterPassword("");
      setRegisterError("");
    } catch (e) {
      const msg = e.message || "Registration failed.";
      setRegisterError(msg);
      showToast(msg, "error");
    } finally {
      setRegisterLoading(false);
    }
  }

  // Try to detect existing user by email (client-side). May return null if check not allowed.
  async function checkUserExists(email) {
    try {
      const { data, error } = await supabase.rpc("email_exists", { p_email: email });
      if (error) {
        console.warn("checkUserExists rpc error:", error.message || error);
        return null; // can't reliably check
      }
      // RPC returns boolean true/false
      console.log("checkUserExists rpc:", { email, exists: data });
      return Boolean(data);
    } catch (e) {
      console.warn("checkUserExists exception:", e);
      return null;
    }
  }

  function handleRegisterSubmit(e) {
    e.preventDefault();
    const email = registerEmail.trim();
    const pwd = registerPassword;
    if (!email || !pwd) {
      setRegisterError("Email and password are required.");
      showToast("Missing email or password.", "error");
      return;
    }
    if (!isValidEmailFormat(email)) {
      setRegisterError("Invalid email format.");
      showToast("Invalid email format.", "error");
      return;
    }
    (async () => {
      // client-side pre-check (may return null if not permitted)
      const exists = await checkUserExists(email);
      if (exists === true) {
        const msg = "This email is already registered. Check your inbox for confirmation.";
        setRegisterError(msg);
        showToast(msg, "error");
        return;
      }
      // if exists === null (can't check), still attempt signUp and rely on Supabase response
      signUp(email, pwd);
    })();
  }

  function getAlpha2ForPlace(p) {
    if (!p) return null;
    if (p.countryCode) return String(p.countryCode).toUpperCase();
    const key = String(p.country || "").trim().toLowerCase();
    return countryNameToAlpha2.get(key) || null;
  }

  // Supabase auth listener
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user ?? null));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Load places from DB when user logs in
  useEffect(() => {
    if (!user) {
      // no user: keep local storage
      setPlaces(prev => loadFromStorage() ?? prev ?? seedPlaces);
      return;
    }
    loadPlacesFromDb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    // local backup
    if (!user) saveToStorage(places);
  }, [places, user]);

  async function loadPlacesFromDb() {
    try {
      const { data, error } = await supabase
        .from("places")
        .select("*")
        .eq("owner", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (Array.isArray(data)) {
        setPlaces(data.map(mapDbRowToPlace));
      }
    } catch (e) {
      console.error("Hiba DB betöltéskor:", e);
    }
  }

  async function insertPlaceToDb(place) {
    if (!user) return;
    const row = {
      name: place.name,
      country: place.country,
      country_code: place.countryCode,
      city: place.city,
      lat: place.lat,
      lng: place.lng,
      status: place.status,
      date_visited: place.dateVisited || null,
      rating: place.rating || 0,
      notes: place.notes || "",
      tags: place.tags || [],
      owner: user.id,
    };
    try {
      const { data, error } = await supabase.from("places").insert(row).select().single();
      if (error) throw error;
      // replace temp local id with DB id
      setPlaces(prev => prev.map(p => (p.id === place.id ? mapDbRowToPlace(data) : p)));
    } catch (e) {
      console.error("Insert hiba:", e);
    }
  }

  async function updatePlaceInDb(id, updates) {
    if (!user) return;
    const dbUpdates = {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.country !== undefined && { country: updates.country }),
      ...(updates.countryCode !== undefined && { country_code: updates.countryCode }),
      ...(updates.city !== undefined && { city: updates.city }),
      ...(updates.lat !== undefined && { lat: updates.lat }),
      ...(updates.lng !== undefined && { lng: updates.lng }),
      ...(updates.status !== undefined && { status: updates.status }),
      ...(updates.dateVisited !== undefined && { date_visited: updates.dateVisited || null }),
      ...(updates.rating !== undefined && { rating: updates.rating }),
      ...(updates.notes !== undefined && { notes: updates.notes }),
      ...(updates.tags !== undefined && { tags: updates.tags || [] }),
      owner: user.id
    };
    try {
      const { data, error } = await supabase.from("places").update(dbUpdates).eq("id", id).select().single();
      if (error) throw error;
      setPlaces(prev => prev.map(p => (p.id === id ? mapDbRowToPlace(data) : p)));
    } catch (e) {
      console.error("Update hiba:", e);
    }
  }

  async function deletePlaceFromDb(id) {
    if (!user) return;
    try {
      const { error } = await supabase.from("places").delete().eq("id", id);
      if (error) throw error;
      setPlaces(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      console.error("Delete hiba:", e);
    }
  }

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

  async function addPlaceFromForm(formEl) {
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

    // if logged in, insert to DB and replace temp id with DB id
    if (user) {
      await insertPlaceToDb(newPlace);
    } else {
      saveToStorage([newPlace, ...places]);
    }

    formEl.reset();
  }



  function removePlace(id) {
    if (user) {
      deletePlaceFromDb(id);
    } else {
      setPlaces(prev => prev.filter(p => p.id !== id));
      saveToStorage(places.filter(p => p.id !== id));
      if (selectedId === id) setSelectedId(null);
    }
  }

  async function signIn() {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
      if (error) throw error;
      setAuthPassword("");
       showToast("Signed in successfully.", "success");
    } catch (e) {
      showToast("Sign in failed." + e.message, "error");
      //alert("Sign in hiba: " + e.message);
    }
  }
  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setPlaces(loadFromStorage() ?? seedPlaces);
    showToast("Signed out.", "info");
  }

  async function sendResetEmail(email) {
  try {
    if (!email || !isValidEmailFormat(email)) {
      setForgotMessage("Please provide a valid email.");
      return;
    }
    setForgotLoading(true);
    // használd a Vite base URL-t, ha be van állítva (GitHub Pages esetén pl. "/HolidayTracking/")
    const base = import.meta.env.BASE_URL || "/";
    const redirectTo = `${window.location.origin}${base}reset-password`;
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      console.warn("resetPasswordForEmail error", error);
      setForgotMessage(error.message || "Unable to send reset email.");
      showToast(error.message || "Unable to send reset email.", "error");
      return;
    }
    setForgotMessage("Password reset email sent. Check your inbox (or spam).");
    showToast("Password reset email sent. Check your inbox.", "success");
  } catch (e) {
    console.warn("sendResetEmail exception", e);
    setForgotMessage("Unable to send reset email.");
    showToast("Unable to send reset email.", "error");
  } finally {
    setForgotLoading(false);
  }
}


  // Add new place modal handler
  function handleAddPlace(e) {
    e.preventDefault();
    addPlaceFromForm(e.target);
    setShowAddModal(false);
  }

  // Edit modal handler
  function handleEditPlace(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const updates = {
      name: f.get("name"),
      country: f.get("country"),
      countryCode: f.get("countryCode"),
      city: f.get("city"),
      lat: Number(f.get("lat")),
      lng: Number(f.get("lng")),
      status: f.get("status"),
      dateVisited: f.get("dateVisited"),
      rating: Number(f.get("rating")),
      notes: f.get("notes"),
      tags: f.get("tags").split(",").map(s=>s.trim()).filter(Boolean),
    };
    updatePlaceInDb(editPlace.id, updates);
    setEditPlace(null);
  }

  // Delete confirmation
  function confirmDelete(id) {
    setDeleteId(id);
  }
  function handleDeleteConfirmed() {
    removePlace(deleteId);
    setDeleteId(null);
  }
  return (
    <div className={`min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-sky-50 to-slate-100 text-slate-800 ${showAddModal || editPlace || deleteId ? 'overflow-hidden' : ''}`}>

    {/* Header */}
    <header className="flex items-center justify-between px-4 py-3 bg-white/90 backdrop-blur border-b border-slate-200 shadow-sm">
      <h1 className="text-2xl font-bold tracking-tight text-blue-700">Holiday Tracking</h1>
      <div className="text-sm">
        {user ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600">{user.email}</span>
            <button className="px-3 py-1 text-xs font-medium rounded-lg border border-slate-300 hover:bg-slate-100 transition-colors" onClick={signOut}>
              Log out
            </button>
          </div>
        ) : (
          <>
            {/* Desktop: inline inputs */}
            <div className="hidden md:flex items-center gap-2">
              <input className="rounded-lg border border-slate-300 p-1 text-xs w-40 focus:outline-none focus:ring focus:ring-blue-200" placeholder="email" value={authEmail} onChange={(e)=>setAuthEmail(e.target.value)} />
              <input type="password" className="rounded-lg border border-slate-300 p-1 text-xs w-40 focus:outline-none focus:ring focus:ring-blue-200" placeholder="password" value={authPassword} onChange={(e)=>setAuthPassword(e.target.value)} />
              <button className="px-3 py-1 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors" onClick={signIn}>
                Login
              </button>
              <button className="px-3 py-1 text-xs font-medium rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors" onClick={()=>setShowRegisterModal(true)}>
                Registera
              </button>
            </div>

            {/* Mobile: compact buttons open modals */}
            <div className="flex md:hidden items-center gap-2">
              <button className="px-3 py-1 text-xs font-medium rounded-md bg-blue-600 text-white" onClick={()=>setShowLoginModal(true)}>Login</button>
              <button className="px-3 py-1 text-xs font-medium rounded-md bg-emerald-600 text-white" onClick={()=>setShowRegisterModal(true)}>Registera</button>
            </div>
          </>
        )}
      </div>
    </header>

    {/* Login Modal */}
    {showLoginModal && (
      <div className="fixed inset-0 z-[1100] bg-black/40 flex items-start md:items-center justify-center overflow-y-auto p-4">
        <div className="bg-white rounded-2xl shadow w-full max-w-sm p-6">
          <h2 className="font-semibold mb-2 text-lg">Login</h2>
          <form className="grid gap-3" onSubmit={(e)=>{ e.preventDefault(); signIn(); setShowLoginModal(false); }}>
            <input type="email" className="rounded-lg border p-2 text-sm w-full" placeholder="Email" value={authEmail} onChange={(e)=>setAuthEmail(e.target.value)} required />
            <input type="password" className="rounded-lg border p-2 text-sm w-full" placeholder="Password" value={authPassword} onChange={(e)=>setAuthPassword(e.target.value)} required />
            <div className="flex gap-2 justify-end mt-2">
              <button type="button" className="px-3 py-1 text-sm rounded-lg border hover:bg-slate-100" onClick={() => setShowLoginModal(false)}>Cancel</button>
              <button type="submit" className="px-3 py-1 text-sm rounded-lg bg-blue-600 text-white">Login</button>
            </div>
          </form>
        </div>
      </div>
    )}

      {/* Main content */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        {/* Left: Place list */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-600">
              Látogatott országok: <b>{stats.countriesCount}</b> • Helyek: <b>{stats.visitedCount}</b> ✓ / <b>{stats.wishlistCount}</b> kívánság
            </div>
            <button className="px-3 py-1 rounded-xl bg-blue-500 text-white text-xs" onClick={()=>setShowAddModal(true)}>
              Add new place
            </button>
          </div>
          <div className="flex gap-2 mb-2">
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
          <div className="bg-white rounded-2xl shadow p-2 max-h-[60vh] overflow-auto">
            {filtered.length === 0 && (
              <div className="text-center text-gray-500 py-8">Nincs találat.</div>
            )}
            <ul className="divide-y">
              {filtered.map(p => (
                <li key={p.id} className="p-2 hover:bg-gray-50 rounded-xl flex items-center gap-2">
                  <button className="text-left flex-1" onClick={()=>setSelectedId(p.id)}>
                    <div className="font-semibold flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${p.status==="visited"?"bg-green-500":"bg-blue-500"}`}></span>
                      {p.name}
                    </div>
                    <div className="text-xs text-gray-500">{p.city || ""}{p.city && p.country ? ", " : ""}{p.country || ""}</div>
                  </button>
                  <button className="text-xs px-2 py-1 rounded-lg border" onClick={()=>setEditPlace(p)}>Módosítás</button>
                  <button className="text-xs px-2 py-1 rounded-lg border text-red-600" onClick={()=>confirmDelete(p.id)}>Törlés</button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Right: Map */}
        <section>
          {!isMapFullscreen && (
            <div className="rounded-2xl overflow-hidden shadow relative">
              <button
                className="absolute top-3 right-3 z-[10000] bg-white rounded-full p-2 shadow hover:bg-slate-100 text-xs pointer-events-auto"
                style={{ WebkitTapHighlightColor: "transparent" }}
                onClick={() => setIsMapFullscreen(true)}
              >
                Fullscreen
              </button>
              <MapContainer
                center={[47.5, 19.04]}
                zoom={6}
                whenCreated={(m) => (mapRef.current = m)}
                style={{ height: "60vh", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapClickCapture onSelect={(coords)=>setNewCoords(coords)} />
                {countriesGeo && <GeoJSON data={countriesGeo} style={countryStyle} />}
                {places.map(p => (
                  <Marker key={p.id} position={[p.lat, p.lng]} eventHandlers={{ click: () => setSelectedId(p.id) }}>
                    <Popup>
                      {/* ...popup content... */}
                    </Popup>
                  </Marker>
                ))}
                {newCoords && <Marker position={newCoords}><Popup>Új hely kijelölve</Popup></Marker>}
              </MapContainer>
            </div>
          )}
        </section>

        {isMapFullscreen && createPortal(
          <div className="fixed inset-0 z-[10000] bg-white">
            <button
              className="absolute top-3 right-3 z-[10001] bg-white rounded-full p-2 shadow hover:bg-slate-100 text-xs pointer-events-auto"
              onClick={() => setIsMapFullscreen(false)}
            >
              Exit
            </button>
            <div className="w-screen h-screen">
              <MapContainer
                center={[47.5, 19.04]}
                zoom={6}
                whenCreated={(m) => { mapRef.current = m; setTimeout(()=>m.invalidateSize(), 200); }}
                style={{ height: "100vh", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapClickCapture onSelect={(coords)=>setNewCoords(coords)} />
                {countriesGeo && <GeoJSON data={countriesGeo} style={countryStyle} />}
                {places.map(p => (
                  <Marker key={p.id} position={[p.lat, p.lng]} eventHandlers={{ click: () => setSelectedId(p.id) }}>
                    <Popup>
                      {/* ...popup content... */}
                    </Popup>
                  </Marker>
                ))}
                {newCoords && <Marker position={newCoords}><Popup>Új hely kijelölve</Popup></Marker>}
              </MapContainer>
            </div>
          </div>,
          document.body
        )}
      </main>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-start md:items-center justify-center overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="font-semibold mb-2">Új hely hozzáadása</h2>
              <form className="grid gap-3" onSubmit={handleAddPlace}>
              <input name="name" className="rounded-xl border p-2" placeholder="Hely neve" required />
              <input name="country" className="rounded-xl border p-2" placeholder="Ország (név)" />
              <input name="countryCode" className="rounded-xl border p-2" placeholder="Ország ISO-kód (pl. HU)" />
              <input name="city" className="rounded-xl border p-2" placeholder="Város/Régió" />
              <div className="flex gap-2">
                <input name="lat" type="number" step="any" className="rounded-xl border p-2 w-full" placeholder="Szélesség (lat)" defaultValue={newCoords?.[0] ?? ''} />
                <input name="lng" type="number" step="any" className="rounded-xl border p-2 w-full" placeholder="Hosszúság (lng)" defaultValue={newCoords?.[1] ?? ''} />
              </div>
              <select name="status" className="rounded-xl border p-2">
                <option value="visited">Meglátogatott</option>
                <option value="wishlist">Kívánságlista</option>
              </select>
              <input name="dateVisited" type="date" className="rounded-xl border p-2" />
              <input name="rating" type="number" min={0} max={5} className="rounded-xl border p-2" placeholder="Értékelés (0–5)" />
              <input name="tags" className="rounded-xl border p-2" placeholder="Címkék (vesszővel)" />
              <textarea name="notes" className="rounded-xl border p-2" placeholder="Jegyzetek" />
              <div className="flex gap-2">
                <button type="submit" className="rounded-xl border p-2 bg-blue-500 text-white">Add Place</button>
                <button type="button" className="rounded-xl border p-2" onClick={()=>setShowAddModal(false)}>Cancell</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
        {editPlace && (
          <div className="fixed inset-0 z-[1000] bg-black/40 flex items-start md:items-center justify-center overflow-y-auto p-4">
            <div className="bg-white rounded-2xl shadow w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
          <h2 className="font-semibold mb-2">Edit Place</h2>
          <form className="grid gap-3" onSubmit={handleEditPlace}>
            <input name="name" className="rounded-xl border p-2" placeholder="Place name" defaultValue={editPlace.name} required />
            <input name="country" className="rounded-xl border p-2" placeholder="Country (name)" defaultValue={editPlace.country} />
            <input name="countryCode" className="rounded-xl border p-2" placeholder="Country ISO code (e.g. HU)" defaultValue={editPlace.countryCode} />
            <input name="city" className="rounded-xl border p-2" placeholder="City/Region" defaultValue={editPlace.city} />
            <div className="flex gap-2">
              <input name="lat" type="number" step="any" className="rounded-xl border p-2 w-full" placeholder="Latitude (lat)" defaultValue={editPlace.lat} />
              <input name="lng" type="number" step="any" className="rounded-xl border p-2 w-full" placeholder="Longitude (lng)" defaultValue={editPlace.lng} />
            </div>
            <select name="status" className="rounded-xl border p-2" defaultValue={editPlace.status}>
              <option value="visited">Visited</option>
              <option value="wishlist">Wishlist</option>
            </select>
            <input name="dateVisited" type="date" className="rounded-xl border p-2" defaultValue={editPlace.dateVisited} />
            <input name="rating" type="number" min={0} max={5} className="rounded-xl border p-2" placeholder="Rating (0–5)" defaultValue={editPlace.rating} />
            <input name="tags" className="rounded-xl border p-2" placeholder="Tags (comma separated)" defaultValue={editPlace.tags?.join(", ")} />
            <textarea name="notes" className="rounded-xl border p-2" placeholder="Notes" defaultValue={editPlace.notes} />
            <div className="flex gap-2">
              <button type="submit" className="rounded-xl border p-2 bg-blue-500 text-white">Save</button>
              <button type="button" className="rounded-xl border p-2" onClick={()=>setEditPlace(null)}>Cancel</button>
            </div>
          </form>
            </div>
          </div>
        )}

        {/* Delete confirmation */}
        {deleteId && (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-start md:items-center justify-center overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow w-full max-w-sm p-6 text-center max-h-[80vh] overflow-y-auto">
            <h2 className="font-semibold mb-2">Are you sure to to be delete it?</h2>
            <div className="mb-4 text-gray-700">Thic action cannot be reverted</div>
            <div className="flex gap-2 justify-center">
              <button className="rounded-xl border p-2 bg-red-500 text-white" onClick={handleDeleteConfirmed}>Törlés</button>
              <button className="rounded-xl border p-2" onClick={()=>setDeleteId(null)}>Mégse</button>
            </div>
          </div>
        </div>
        )}

      {/* Register Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-[1100] bg-black/40 flex items-start md:items-center justify-center overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow w-full max-w-sm p-6">
            <h2 className="font-semibold mb-2 text-lg">Create Account</h2>
            <p className="text-xs text-slate-500 mb-4">
              Password should be at least 6 characters. Provide a valid email.
            </p>
            {registerError && (
              <div className="mb-3 text-xs text-red-600">{registerError}</div>
            )}
            <form className="grid gap-3" onSubmit={handleRegisterSubmit}>
              <input
                type="email"
                className="rounded-lg border p-2 text-sm"
                placeholder="Email"
                value={registerEmail}
                onChange={(e)=>setRegisterEmail(e.target.value)}
                onInvalid={(e)=>e.target.setCustomValidity("Please enter a valid email address")}
                onInput={(e)=>e.target.setCustomValidity("")}
              />
              <input
                type="password"
                className="rounded-lg border p-2 text-sm"
                placeholder="Password"
                value={registerPassword}
                onChange={(e)=>setRegisterPassword(e.target.value)}
                required
                onInvalid={(e)=>e.target.setCustomValidity("Password is required")}
                onInput={(e)=>e.target.setCustomValidity("")}
              />
              <div className="mt-2 text-right">
                <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => { setShowLoginModal(false); setShowForgotModal(true); setForgotEmail(authEmail || ""); }}>
                  Forgot password?
                </button>
              </div>
              <div className="flex gap-2 justify-end mt-2">
                <button
                  type="button"
                  className="px-3 py-1 text-sm rounded-lg border hover:bg-slate-100"
                  onClick={() => {
                    setShowRegisterModal(false);
                    setRegisterError("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={registerLoading}
                >
                  {registerLoading ? "Registering…" : "Register"}
                </button>
              </div>
            </form>
          </div>
        </div>
        
      )}
      {/* Forgot password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-[1100] bg-black/40 flex items-start md:items-center justify-center overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow w-full max-w-sm p-6">
            <h2 className="font-semibold mb-2 text-lg">Reset password</h2>
            <p className="text-xs text-slate-500 mb-4">Enter your email and we'll send a password reset link.</p>
            {forgotMessage && <div className="mb-3 text-xs text-gray-700">{forgotMessage}</div>}
            <form className="grid gap-3" onSubmit={(e)=>{ e.preventDefault(); sendResetEmail(forgotEmail); }}>
              <input
                type="email"
                className="rounded-lg border p-2 text-sm"
                placeholder="Email"
                value={forgotEmail}
                onChange={(e)=>setForgotEmail(e.target.value)}
                required
              />
              <div className="flex gap-2 justify-end mt-2">
                <button type="button" className="px-3 py-1 text-sm rounded-lg border hover:bg-slate-100" onClick={() => { setShowForgotModal(false); setForgotMessage(""); }}>
                  Cancel
                </button>
                <button type="submit" className="px-3 py-1 text-sm rounded-lg bg-amber-600 hover:bg-amber-700 text-white" disabled={forgotLoading}>
                  {forgotLoading ? "Sending…" : "Send reset email"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Footer */}
      <footer className="bg-white mt-4 shadow">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between p-3">
          <div className="text-xs text-gray-500">
            If you are not logged in, your data is stored in your browser (localStorage). Source: OpenStreetMap tiles.
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com/Kislac/HolidayTracking" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-gray-700 hover:underline">
              {/* GitHub icon */}
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="inline-block">
                <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.35-1.3-1.71-1.3-1.71-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.78 2.72 1.27 3.38.97.11-.76.41-1.27.75-1.56-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11.06 11.06 0 0 1 2.9-.39c.98.01 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.67.42.36.79 1.08.79 2.18 0 1.58-.01 2.86-.01 3.25 0 .31.21.68.8.56C20.71 21.39 24 17.08 24 12 24 5.73 18.27.5 12 .5z"/>
              </svg>
              <span>HolidayTracking</span>
            </a>
            {lastCommit && (
              <a href={lastCommit.url} target="_blank" rel="noreferrer" className="text-xs text-gray-500">
                Last Commit: {lastCommit.date ? String(new Date(lastCommit.date).toISOString().slice(0,10)).replace(/-/g, ".") : lastCommit.sha.slice(0,7)}
              </a>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}