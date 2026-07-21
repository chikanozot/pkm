/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from "@supabase/supabase-js";

const rawUrl = 
  (import.meta as any).env?.VITE_SUPABASE_URL || 
  (typeof process !== "undefined" ? process.env?.SUPABASE_URL : "") || 
  (typeof process !== "undefined" ? process.env?.VITE_SUPABASE_URL : "") || 
  "";

const rawKey = 
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 
  (typeof process !== "undefined" ? process.env?.SUPABASE_ANON_KEY : "") || 
  (typeof process !== "undefined" ? process.env?.VITE_SUPABASE_ANON_KEY : "") || 
  "";

let cleanUrl = rawUrl && !rawUrl.includes("placeholder-please-set") ? rawUrl : "";
let cleanKey = rawKey && !rawKey.includes("placeholder-please-set") ? rawKey : "";

// Fallback to synchronous HTTP request on client-side to get config from server if missing
if (typeof window !== "undefined" && (!cleanUrl || !cleanKey)) {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/supabase-config", false);
    xhr.send();
    if (xhr.status === 200) {
      const config = JSON.parse(xhr.responseText);
      if (config.supabaseUrl && config.supabaseAnonKey) {
        cleanUrl = config.supabaseUrl;
        cleanKey = config.supabaseAnonKey;
      }
    }
  } catch (err) {
    console.warn("Failed to fetch Supabase config synchronously:", err);
  }
}

export const isProduction = (import.meta as any).env?.PROD || (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1");

// Initialize Supabase client
const defaultUrl = "https://placeholder-please-set-vite-supabase-url.supabase.co";
const defaultKey = "placeholder-please-set-vite-supabase-anon-key";

export const supabase = createClient(
  cleanUrl || defaultUrl,
  cleanKey || defaultKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    }
  }
);

export const isSupabaseConfigured = !!cleanUrl && !!cleanKey;
