/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  getUserGoogleConnection,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from "./src/server/google.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Middleware to normalize req.url in Vercel Serverless environment.
// When Vercel rewrites a path (e.g. /auth/google/callback or /api/auth/google/url) to our serverless entrypoint /api,
// Vercel changes req.url to /api. We can restore the original requested path from the "x-matched-path" header
// so that Express's routing system matches the correct endpoint perfectly.
app.use((req, res, next) => {
  const matchedPath = req.headers["x-matched-path"];
  if (matchedPath && typeof matchedPath === "string") {
    try {
      const url = new URL(req.url, "http://localhost");
      url.pathname = matchedPath;
      req.url = url.pathname + url.search;
    } catch (e) {
      console.error("Error normalizing req.url for Vercel:", e);
    }
  }
  next();
});

// Helper to initialize Supabase server-side client
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!url || !key) {
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction) {
      throw new Error("Supabase environment variables (SUPABASE_URL / SUPABASE_ANON_KEY) are missing in production!");
    }
    return null;
  }
  return createClient(url, key);
}

// Helper to resolve app URL dynamically based on visited host to support production (Vercel) automatically
function getAppUrl(req: express.Request) {
  let appUrl = process.env.APP_URL || "";
  if (!appUrl) {
    const host = req.headers.host || "";
    if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
      const protocol = req.headers["x-forwarded-proto"] || "https";
      appUrl = `${protocol}://${host}`;
    } else {
      appUrl = `http://localhost:${PORT}`;
    }
  }
  return appUrl;
}

// Temporary in-memory session for OAuth if Supabase is not configured yet (Demo Fallback)
const demoGoogleConnections = new Map<string, any>();

// ==========================================
// Google OAuth & Calendar Endpoints
// ==========================================

// 1. Get Google OAuth URL
app.get("/api/auth/google/url", (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId || typeof userId !== "string") {
      const errMsg = "userId parameter is missing or invalid in query";
      console.error(`[Google OAuth Error Server] ${errMsg}`);
      return res.status(400).json({ error: errMsg });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const appUrl = getAppUrl(req);

    if (!clientId) {
      const errMsg = "Google Client ID is not configured on the server. Please check your environment variables/secrets (GOOGLE_CLIENT_ID).";
      console.error(`[Google OAuth Error Server] ${errMsg}`);
      return res.status(400).json({
        error: errMsg,
        hint: "Make sure process.env.GOOGLE_CLIENT_ID is set correctly on Vercel/environment."
      });
    }

    const authUrl = getGoogleAuthUrl(userId, appUrl, clientId);
    res.json({ url: authUrl });
  } catch (err: any) {
    console.error("[Google OAuth Error Server] Failed to generate authentication URL:", err);
    res.status(500).json({
      error: "Internal server error occurred while generating Google auth URL",
      message: err?.message || String(err),
      stack: err?.stack || ""
    });
  }
});

// 2. Google OAuth Callback
app.get(["/auth/google/callback", "/auth/google/callback/"], async (req, res) => {
  const { code, state: userId, error } = req.query;

  console.log("[Google OAuth Callback Server] >>> STAGE 1: Arrived at callback route.");
  console.log(`[Google OAuth Callback Server] - Code present: ${!!code}`);
  console.log(`[Google OAuth Callback Server] - State/userId: ${userId}`);
  console.log(`[Google OAuth Callback Server] - Error: ${error || "None"}`);

  if (error) {
    console.error("[Google OAuth Callback Server] Google OAuth error on callback:", error);
    return res.status(400).send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background-color: #f9fafb;">
          <h2 style="color: #ef4444;">Erro de Autenticação</h2>
          <p>${error}</p>
          <button onclick="window.close()" style="padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">Fechar Janela</button>
        </body>
      </html>
    `);
  }

  if (!code || !userId || typeof code !== "string" || typeof userId !== "string") {
    console.warn("[Google OAuth Callback Server] Invalid callback arguments:", { code: !!code, userId });
    return res.status(400).send("Invalid callback arguments");
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    const appUrl = getAppUrl(req);

    console.log(`[Google OAuth Callback Server] >>> STAGE 2: Settings check:`);
    console.log(`- GOOGLE_CLIENT_ID configured: ${!!clientId}`);
    console.log(`- GOOGLE_CLIENT_SECRET configured: ${!!clientSecret}`);
    console.log(`- appUrl: ${appUrl}`);

    if (!clientId || !clientSecret) {
      throw new Error("Google Client ID or Client Secret is not configured on the server environment variables.");
    }

    console.log("[Google OAuth Callback Server] >>> STAGE 3: Swapping code for tokens with Google...");
    const tokens = await exchangeCodeForTokens(code, appUrl, clientId, clientSecret);
    const expiryDate = Date.now() + tokens.expires_in * 1000;

    console.log("[Google OAuth Callback Server] Tokens successfully received from Google:");
    console.log(`- access_token: ${tokens.access_token ? tokens.access_token.substring(0, 15) + "..." : "missing"}`);
    console.log(`- refresh_token: ${tokens.refresh_token ? tokens.refresh_token.substring(0, 15) + "..." : "missing"}`);
    console.log(`- expires_in: ${tokens.expires_in} seconds`);
    console.log(`- expiry_date (timestamp): ${expiryDate}`);

    const supabase = getSupabase();
    console.log(`[Google OAuth Callback Server] >>> STAGE 4: Database check. Supabase initialized: ${!!supabase}`);

    if (supabase) {
      // Real database persistence
      const connectionData = {
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: expiryDate,
        lembretes_minutos: 30, // Default 30 min reminder
      };

      console.log("[Google OAuth Callback Server] Preparing to insert/upsert in public.google_connections with payload:", {
        user_id: connectionData.user_id,
        expiry_date: connectionData.expiry_date,
        lembretes_minutos: connectionData.lembretes_minutos,
        access_token_prefix: connectionData.access_token.substring(0, 10) + "...",
        refresh_token_prefix: connectionData.refresh_token ? connectionData.refresh_token.substring(0, 10) + "..." : "null"
      });

      // Check if user already has a connection
      console.log(`[Google OAuth Callback Server] Querying existing connection in DB for user_id: ${userId}`);
      const { data: existing, error: selectError } = await supabase
        .from("google_connections")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (selectError) {
        console.error("[Google OAuth Callback Server] Supabase SELECT error:", selectError);
      } else {
        console.log(`[Google OAuth Callback Server] SELECT complete. Existing record found:`, existing);
      }

      if (existing) {
        console.log(`[Google OAuth Callback Server] Record exists. Executing UPDATE for user_id: ${userId}`);
        const { error: updateError } = await supabase
          .from("google_connections")
          .update(connectionData)
          .eq("user_id", userId);

        if (updateError) {
          console.error("[Google OAuth Callback Server] Supabase UPDATE failed with error:", updateError);
          throw new Error(`Supabase UPDATE error: ${updateError.message || JSON.stringify(updateError)}`);
        } else {
          console.log("[Google OAuth Callback Server] Supabase UPDATE succeeded! Connection updated.");
        }
      } else {
        console.log(`[Google OAuth Callback Server] No existing record. Executing INSERT for user_id: ${userId}`);
        const { error: insertError } = await supabase
          .from("google_connections")
          .insert([connectionData]);

        if (insertError) {
          console.error("[Google OAuth Callback Server] Supabase INSERT failed with error:", insertError);
          throw new Error(`Supabase INSERT error: ${insertError.message || JSON.stringify(insertError)}`);
        } else {
          console.log("[Google OAuth Callback Server] Supabase INSERT succeeded! Connection saved.");
        }
      }
    } else {
      console.log("[Google OAuth Callback Server] Supabase client is not initialized. Using fallback demo session storage.");
      // Demo state fallback
      demoGoogleConnections.set(userId, {
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: expiryDate,
        lembretes_minutos: 30,
      });
    }

    console.log("[Google OAuth Callback Server] >>> STAGE 5: Sending successful authentication response to popup.");

    // Auth Success Page inside popup
    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background-color: #f9fafb;">
          <div style="max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <svg style="width: 64px; height: 64px; color: #10b981; margin: 0 auto 16px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 style="color: #111827; margin-bottom: 8px;">Conectado com Sucesso!</h2>
            <p style="color: #4b5563; font-size: 14px; margin-bottom: 24px;">Sua conta Google foi sincronizada com a Gestão da Clínica de Estética.</p>
            <p style="color: #9ca3af; font-size: 12px; margin-bottom: 16px;">Esta janela será fechada automaticamente em instantes.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: "OAUTH_AUTH_SUCCESS" }, "*");
              setTimeout(() => {
                window.close();
              }, 1500);
            } else {
              window.location.href = "/";
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error("Callback error exchanging code:", err);
    res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background-color: #f9fafb;">
          <h2 style="color: #ef4444;">Erro de Sincronização</h2>
          <p>Não foi possível conectar com o Google Calendar. Detalhes: ${err.message || err}</p>
          <button onclick="window.close()" style="margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">Fechar Janela</button>
        </body>
      </html>
    `);
  }
});

// 3. Get Google Calendar status
app.get("/api/auth/google/status", async (req, res) => {
  const { userId } = req.query;
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "userId is required" });
  }

  const supabase = getSupabase();
  let connection = null;

  if (supabase) {
    connection = await getUserGoogleConnection(userId);
  } else {
    connection = demoGoogleConnections.get(userId) || null;
  }

  res.json({
    connected: !!connection,
    remindersMinutes: connection?.lembretes_minutos ?? 30,
  });
});

// 4. Update reminder setting
app.post("/api/auth/google/reminders", async (req, res) => {
  const { userId, minutes } = req.body;
  if (!userId || minutes === undefined) {
    return res.status(400).json({ error: "userId and minutes are required" });
  }

  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase
      .from("google_connections")
      .update({ lembretes_minutos: minutes })
      .eq("user_id", userId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }
  } else {
    const connection = demoGoogleConnections.get(userId);
    if (connection) {
      connection.lembretes_minutos = minutes;
      demoGoogleConnections.set(userId, connection);
    }
  }

  res.json({ success: true, remindersMinutes: minutes });
});

// 5. Disconnect Google Calendar
app.post("/api/auth/google/disconnect", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase
      .from("google_connections")
      .delete()
      .eq("user_id", userId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }
  } else {
    demoGoogleConnections.delete(userId);
  }

  res.json({ success: true });
});

// 6. Create Google Calendar Event manually or automatically
app.post("/api/calendar/event/create", async (req, res) => {
  const { userId, summary, description, startDateTime, endDateTime } = req.body;

  if (!userId || !summary || !startDateTime || !endDateTime) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    const supabase = getSupabase();
    let connection = null;

    if (supabase) {
      connection = await getUserGoogleConnection(userId);
    } else {
      connection = demoGoogleConnections.get(userId);
    }

    if (!connection) {
      return res.json({ connected: false, message: "Google Calendar not connected" });
    }

    const eventId = await createGoogleCalendarEvent(connection.access_token, {
      summary,
      description: description || "",
      startDateTime,
      endDateTime,
      remindersMinutes: connection.lembretes_minutos,
    });

    res.json({ success: true, eventId });
  } catch (err: any) {
    console.error("Error creating Google Calendar event:", err);
    res.status(500).json({ error: err.message || err });
  }
});

// 7. Update Google Calendar Event
app.post("/api/calendar/event/update", async (req, res) => {
  const { userId, eventId, summary, description, startDateTime, endDateTime } = req.body;

  if (!userId || !eventId || !summary || !startDateTime || !endDateTime) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    const supabase = getSupabase();
    let connection = null;

    if (supabase) {
      connection = await getUserGoogleConnection(userId);
    } else {
      connection = demoGoogleConnections.get(userId);
    }

    if (!connection) {
      return res.json({ connected: false, message: "Google Calendar not connected" });
    }

    await updateGoogleCalendarEvent(connection.access_token, eventId, {
      summary,
      description: description || "",
      startDateTime,
      endDateTime,
      remindersMinutes: connection.lembretes_minutos,
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Error updating Google Calendar event:", err);
    res.status(500).json({ error: err.message || err });
  }
});

// 8. Delete Google Calendar Event
app.post("/api/calendar/event/delete", async (req, res) => {
  const { userId, eventId } = req.body;

  if (!userId || !eventId) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    const supabase = getSupabase();
    let connection = null;

    if (supabase) {
      connection = await getUserGoogleConnection(userId);
    } else {
      connection = demoGoogleConnections.get(userId);
    }

    if (!connection) {
      return res.json({ connected: false, message: "Google Calendar not connected" });
    }

    await deleteGoogleCalendarEvent(connection.access_token, eventId);
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error deleting Google Calendar event:", err);
    res.status(500).json({ error: err.message || err });
  }
});

// ==========================================
// Vite Integration & Production Server Setup
// ==========================================

async function startServer() {
  if (process.env.VERCEL) {
    console.log("Running on Vercel Serverless environment. Bypass express server listener.");
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    // Development mode
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production mode
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

export default app;
