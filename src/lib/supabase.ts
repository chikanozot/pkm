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

const cleanUrl = rawUrl && !rawUrl.includes("placeholder-please-set") ? rawUrl : "";
const cleanKey = rawKey && !rawKey.includes("placeholder-please-set") ? rawKey : "";

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
