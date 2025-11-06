import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");

  const appRoot = (typeof window !== "undefined")
    ? window.location.origin.replace(/\/$/, "") + (import.meta.env.BASE_URL || "/")
    : "/";

  // Parse tokens from query or hash and set session so updateUser works
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access_token = search.get("access_token") || hash.get("access_token") || search.get("token") || hash.get("token");
    const refresh_token = search.get("refresh_token") || hash.get("refresh_token") || null;

    (async () => {
      if (access_token) {
        setLoading(true);
        try {
          // setSession accepts access_token + refresh_token
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) {
            console.warn("setSession error:", error);
            setMessage("The reset link is invalid or has expired.");
          } else {
            setMessage("Provide a new password below.");
          }
        } catch (e) {
          console.warn("setSession exception:", e);
          setMessage("Error occurred while processing the reset link.");
        } finally {
          setLoading(false);
        }
      } else {
        setMessage("Click to the reset link in your email to set a new password.");
      }
      setReady(true);
    })();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password || password.length < 6) {
      setMessage("Password must be at least 6 characters long.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) {
        console.warn("updateUser error:", error);
        setMessage(error.message || "Password update failed.");
      } else {
        setMessage("Password updated successfully! Redirecting to home...");
        setTimeout(() => (window.location.href = appRoot), 1500);
      }
    } catch (e) {
      console.warn("updateUser exception:", e);
      setMessage("Error occurred while updating the password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-sky-50 p-4">
      <div className="bg-white rounded-2xl shadow w-full max-w-md p-6">
        <h2 className="font-semibold text-lg mb-2">Reset password</h2>
        <p className="text-sm text-slate-600 mb-4">{message}</p>

        {!ready ? (
          <div className="text-sm text-slate-500">Processing...</div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-3">
            <input
              type="password"
              className="rounded-lg border p-2 text-sm"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-1 rounded-lg border" onClick={() => (window.location.href = appRoot)}>
                Mégse
              </button>
              <button type="submit" className="px-3 py-1 rounded-lg bg-blue-600 text-white" disabled={loading}>
                {loading ? "Saving..." : "Save new password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}