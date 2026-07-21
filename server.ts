/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import {
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  getUserGoogleConnection,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  listGoogleCalendarEvents,
} from "./src/server/google.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));

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
  // Check for service_role key to safely bypass RLS for server-side operations (like calendar sync)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
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
    syncActive: connection?.sync_active ?? true,
    lastSyncAt: connection?.last_sync_at ?? null,
    syncStatus: connection?.sync_status ?? null,
    syncError: connection?.sync_error ?? null,
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

// 9. Update automatic sync settings
app.post("/api/auth/google/sync-settings", async (req, res) => {
  const { userId, syncActive } = req.body;
  if (!userId || syncActive === undefined) {
    return res.status(400).json({ error: "userId and syncActive are required" });
  }

  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase
      .from("google_connections")
      .update({ sync_active: syncActive })
      .eq("user_id", userId);

    if (error) {
      return res.status(500).json({ error: error.message });
    }
  } else {
    const connection = demoGoogleConnections.get(userId);
    if (connection) {
      connection.sync_active = syncActive;
      demoGoogleConnections.set(userId, connection);
    }
  }

  res.json({ success: true, syncActive });
});

// 9.5 GET Google Calendar External Events (Pendente & contains "ATENDIMENTO")
app.get("/api/calendar/external-events", async (req, res) => {
  const { userId } = req.query;
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "userId is required" });
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
      return res.json({ success: true, connected: false, events: [] });
    }

    // List events from 30 days ago to 90 days in the future
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - 30);

    let allEvents: any[] = [];
    let pageToken = undefined;

    while (true) {
      const responseData = await listGoogleCalendarEvents(connection.access_token, {
        timeMin: timeMin.toISOString(),
        pageToken,
      });

      if (responseData.items) {
        allEvents = allEvents.concat(responseData.items);
      }

      pageToken = responseData.nextPageToken;
      if (!pageToken) {
        break;
      }
    }

    // Filter events that are not cancelled and contain "ATENDIMENTO" in summary or description
    const filteredEvents = allEvents.filter((event: any) => {
      if (event.status === "cancelled") return false;
      const summary = event.summary || "";
      const description = event.description || "";
      return (
        summary.toUpperCase().includes("ATENDIMENTO") ||
        description.toUpperCase().includes("ATENDIMENTO")
      );
    });

    // Fetch existing appointment google_event_ids to exclude already finalized/imported ones
    let existingEventIds = new Set<string>();
    if (supabase) {
      const { data: appData, error: appError } = await supabase
        .from("atendimentos")
        .select("google_event_id")
        .eq("user_id", userId)
        .not("google_event_id", "is", null);

      if (!appError && appData) {
        appData.forEach((app: any) => {
          if (app.google_event_id) {
            existingEventIds.add(app.google_event_id);
          }
        });
      }
    }

    // Map and return events that are not yet in our database
    const pendingEvents = filteredEvents
      .filter((event: any) => !existingEventIds.has(event.id))
      .map((event: any) => {
        let eventDate = "";
        let eventTime = "08:00";
        let durationMinutes = 30;

        if (event.start?.dateTime) {
          const startDt = new Date(event.start.dateTime);
          const yyyy = startDt.getFullYear();
          const mm = String(startDt.getMonth() + 1).padStart(2, "0");
          const dd = String(startDt.getDate()).padStart(2, "0");
          eventDate = `${yyyy}-${mm}-${dd}`;

          const hh = String(startDt.getHours()).padStart(2, "0");
          const min = String(startDt.getMinutes()).padStart(2, "0");
          eventTime = `${hh}:${min}`;

          if (event.end?.dateTime) {
            const endDt = new Date(event.end.dateTime);
            durationMinutes = Math.round((endDt.getTime() - startDt.getTime()) / 60000);
            if (durationMinutes <= 0) durationMinutes = 30;
          }
        } else if (event.start?.date) {
          eventDate = event.start.date;
          eventTime = "08:00";
          durationMinutes = 60;
        }

        return {
          id: event.id,
          summary: event.summary || "",
          description: event.description || "",
          data: eventDate,
          hora: eventTime,
          duracao: durationMinutes,
          status: "Pendente",
        };
      });

    res.json({ success: true, connected: true, events: pendingEvents });
  } catch (err: any) {
    console.error("Error fetching external Google Calendar events:", err);
    res.status(500).json({ error: err.message || err });
  }
});

// 10. Manual Calendar Sync trigger
app.post("/api/calendar/sync", async (req, res) => {
  const { userId, forceFull } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  console.log(`[Manual Sync API] Requested calendar sync for user ${userId}. Force Full: ${forceFull === true}`);
  const result = await syncUserCalendar(userId, forceFull === true);
  res.json(result);
});

// ==========================================
// Google Calendar Bidirectional Sync Engine
// ==========================================

async function updateConnectionSyncStatus(
  userId: string,
  status: "success" | "error",
  errorMsg: string | null,
  nextSyncToken: string | null
) {
  const supabase = getSupabase();
  const updateData: any = {
    last_sync_at: new Date().toISOString(),
    sync_status: status,
    sync_error: errorMsg,
  };
  if (nextSyncToken) {
    updateData.next_sync_token = nextSyncToken;
  }

  if (supabase) {
    await supabase
      .from("google_connections")
      .update(updateData)
      .eq("user_id", userId);
  } else {
    const connection = demoGoogleConnections.get(userId);
    if (connection) {
      demoGoogleConnections.set(userId, {
        ...connection,
        ...updateData,
      });
    }
  }
}

async function syncUserCalendar(userId: string, forceFull = false) {
  console.log(`[Google Calendar Sync] Starting sync for user: ${userId}`);
  const supabase = getSupabase();
  let connection = null;

  if (supabase) {
    connection = await getUserGoogleConnection(userId);
  } else {
    connection = demoGoogleConnections.get(userId);
  }

  if (!connection) {
    console.warn(`[Google Calendar Sync] No connection found for user ${userId}`);
    return { success: false, error: "No connection" };
  }

  const isSyncActive = connection.sync_active !== false;
  if (!isSyncActive) {
    console.log(`[Google Calendar Sync] Sync is disabled for user ${userId}`);
    return { success: true, message: "Sync is disabled" };
  }

  try {
    let syncToken = forceFull ? undefined : connection.next_sync_token;
    let timeMin = undefined;
    
    // Initial / Full sync: retrieve last 90 days
    if (!syncToken) {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      timeMin = ninetyDaysAgo.toISOString();
      console.log(`[Google Calendar Sync] First or full sync. Fetching events starting from ${timeMin}`);
    } else {
      console.log(`[Google Calendar Sync] Incremental sync using token: ${syncToken}`);
    }

    let pageToken = undefined;
    let allEvents: any[] = [];
    let nextSyncToken = undefined;

    while (true) {
      try {
        const responseData = await listGoogleCalendarEvents(connection.access_token, {
          syncToken,
          timeMin,
          pageToken,
        });

        if (responseData.items) {
          allEvents = allEvents.concat(responseData.items);
        }

        nextSyncToken = responseData.nextSyncToken;
        pageToken = responseData.nextPageToken;

        if (!pageToken) {
          break;
        }
      } catch (err: any) {
        if (err.message === "SYNC_TOKEN_EXPIRED") {
          console.warn(`[Google Calendar Sync] Sync token expired for user ${userId}. Retrying with full sync...`);
          if (supabase) {
            await supabase.from("google_connections").update({ next_sync_token: null }).eq("user_id", userId);
          } else {
            connection.next_sync_token = null;
          }
          return syncUserCalendar(userId, true);
        } else {
          throw err;
        }
      }
    }

    console.log(`[Google Calendar Sync] Fetched ${allEvents.length} events/changes from Google Calendar.`);

    if (allEvents.length === 0 && nextSyncToken) {
      await updateConnectionSyncStatus(userId, "success", null, nextSyncToken);
      return { success: true, imported: 0, updated: 0, cancelled: 0 };
    }

    let importedCount = 0;
    let updatedCount = 0;
    let cancelledCount = 0;
    let conflictCount = 0;

    let clients: any[] = [];
    let services: any[] = [];

    if (supabase) {
      const { data: clientsData } = await supabase.from("clientes").select("*").eq("user_id", userId);
      const { data: servicesData } = await supabase.from("servicos").select("*").eq("user_id", userId);
      clients = clientsData || [];
      services = servicesData || [];
    }

    for (const event of allEvents) {
      const googleEventId = event.id;
      if (!googleEventId) continue;

      console.log(`[Google Calendar Sync] Processing event: ${googleEventId} - "${event.summary || "(No Title)"}" (Status: ${event.status})`);

      let appointment: any = null;
      if (supabase) {
        const { data: appData, error: appError } = await supabase
          .from("atendimentos")
          .select("*")
          .eq("google_event_id", googleEventId)
          .maybeSingle();
        if (!appError) {
          appointment = appData;
        }
      }

      if (event.status === "cancelled") {
        if (appointment) {
          if (appointment.status !== "Cancelado") {
            console.log(`[Google Calendar Sync] Event ${googleEventId} cancelled on Google. Cancelling appointment: ${appointment.id}`);
            if (supabase) {
              await supabase
                .from("atendimentos")
                .update({ 
                  status: "Cancelado", 
                  google_last_sync: new Date().toISOString(),
                  google_sync_status: "synced"
                })
                .eq("id", appointment.id);
            }
            cancelledCount++;
          }
        }
        continue;
      }

      let eventDate = "";
      let eventTime = "08:00";
      let durationMinutes = 30;

      if (event.start?.dateTime) {
        const startDt = new Date(event.start.dateTime);
        const yyyy = startDt.getFullYear();
        const mm = String(startDt.getMonth() + 1).padStart(2, '0');
        const dd = String(startDt.getDate()).padStart(2, '0');
        eventDate = `${yyyy}-${mm}-${dd}`;
        
        const hh = String(startDt.getHours()).padStart(2, '0');
        const min = String(startDt.getMinutes()).padStart(2, '0');
        eventTime = `${hh}:${min}`;

        if (event.end?.dateTime) {
          const endDt = new Date(event.end.dateTime);
          durationMinutes = Math.round((endDt.getTime() - startDt.getTime()) / 60000);
          if (durationMinutes <= 0) durationMinutes = 30;
        }
      } else if (event.start?.date) {
        eventDate = event.start.date;
        eventTime = "08:00";
        durationMinutes = 60;
      } else {
        continue;
      }

      const eventSummary = event.summary || "";
      const eventDescription = event.description || "";
      const googleUpdatedTime = event.updated ? new Date(event.updated).getTime() : 0;

      if (appointment) {
        const lastSyncTime = appointment.google_last_sync ? new Date(appointment.google_last_sync).getTime() : 0;
        
        if (lastSyncTime > googleUpdatedTime) {
          console.log(`[Google Calendar Sync] Conflict: System has newer changes for appointment ${appointment.id}. Skipping.`);
          conflictCount++;
          continue;
        }
        
        console.log(`[Google Calendar Sync] Updating existing appointment ${appointment.id}`);
        const updatedFields: any = {
          data: eventDate,
          hora: eventTime,
          duracao: durationMinutes,
          observacoes: eventDescription,
          google_last_sync: new Date().toISOString(),
          google_sync_status: "synced"
        };

        if (supabase) {
          const { error: updateErr } = await supabase
            .from("atendimentos")
            .update(updatedFields)
            .eq("id", appointment.id);
          
          if (updateErr) {
            console.error(`[Google Calendar Sync] Error updating appointment ${appointment.id}:`, updateErr);
          } else {
            updatedCount++;
          }
        }
      } else {
        // Under the new requirement, we do NOT auto-create clients, services, or appointments upon discovery.
        // Instead, they are fetched dynamically via /api/calendar/external-events and shown in the UI.
        console.log(`[Google Calendar Sync] Discovered new external event ${googleEventId}, skipping auto-import.`);
      }
    }

    console.log(`[Google Calendar Sync] Sync finished for ${userId}. Imported: ${importedCount}, Updated: ${updatedCount}, Cancelled: ${cancelledCount}`);
    await updateConnectionSyncStatus(userId, "success", null, nextSyncToken);

    return {
      success: true,
      imported: importedCount,
      updated: updatedCount,
      cancelled: cancelledCount,
      conflicts: conflictCount,
    };
  } catch (err: any) {
    console.error(`[Google Calendar Sync] Exception for ${userId}:`, err);
    await updateConnectionSyncStatus(userId, "error", err.message || String(err), null);
    return { success: false, error: err.message || String(err) };
  }
}

// Automatic Polling Loop for Active Sync Users
setInterval(async () => {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    const { data: connections, error } = await supabase
      .from("google_connections")
      .select("user_id")
      .eq("sync_active", true);

    if (error) {
      console.error("[Google Calendar Background Poller] Error fetching active connections:", error);
      return;
    }

    if (connections && connections.length > 0) {
      console.log(`[Google Calendar Background Poller] Syncing ${connections.length} active connection(s)`);
      for (const conn of connections) {
        try {
          await syncUserCalendar(conn.user_id);
        } catch (e) {
          console.error(`[Google Calendar Background Poller] Failed to sync ${conn.user_id}:`, e);
        }
      }
    }
  } catch (err) {
    console.error("[Google Calendar Background Poller] Unexpected exception:", err);
  }
}, 60000); // Poll once every 60 seconds


// ==========================================
// Admin/Master SaaS API Endpoints
// ==========================================

// Helper function to verify master administrator role server-side
async function verifyMasterAdmin(supabaseClient: any, adminId: string): Promise<boolean> {
  if (!adminId) return false;
  
  // If the server doesn't have the service_role key configured, it uses the anon key.
  // With the anon key, RLS will block reading other users' profiles, making verification impossible server-side.
  // In this case, we return false quietly and let the frontend fall back to direct Supabase client calls.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.info(`[Admin Auth] Supabase service role key not configured. Bypassing server-side verification quietly.`);
    return false;
  }

  try {
    const { data, error } = await supabaseClient
      .from("users")
      .select("role")
      .eq("id", adminId)
      .maybeSingle();

    if (error || !data) {
      console.warn(`[Admin Auth] Failed to verify user ${adminId}:`, error);
      return false;
    }
    return data.role === "master";
  } catch (err) {
    console.error("[Admin Auth] Exception verifying master admin:", err);
    return false;
  }
}

// ==========================================
// User Authentication & Profile Endpoints (Bypasses RLS recursion)
// ==========================================

// Get Single User Profile (Securely verified via Supabase User Token)
app.get("/api/user/profile", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "userId is required" });
    }

    const supabaseClient = getSupabase();
    if (!supabaseClient) {
      return res.status(500).json({ error: "Supabase client not initialized on server" });
    }

    // Secure verification using the client's bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Nenhum token de autenticação fornecido." });
    }
    const token = authHeader.split(" ")[1];

    const { data: { user: authUser }, error: authErr } = await supabaseClient.auth.getUser(token);
    if (authErr || !authUser || authUser.id !== userId) {
      console.warn(`[User API] Unauthorized access attempt for user ${userId}`);
      return res.status(403).json({ error: "Acesso não autorizado ao perfil." });
    }

    // Fetch the profile bypassing RLS
    const { data: profile, error: dbErr } = await supabaseClient
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (dbErr) {
      console.error(`[User API] Error fetching profile for ${userId}:`, dbErr);
      throw dbErr;
    }

    return res.json({ profile });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// Public endpoint to safely get Supabase client connection parameters (URL and Anon Key)
app.get("/api/supabase-config", (req, res) => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  return res.json({
    supabaseUrl: url && !url.includes("placeholder-please-set") ? url : "",
    supabaseAnonKey: anonKey && !anonKey.includes("placeholder-please-set") ? anonKey : ""
  });
});

// Public endpoint to check uniqueness of email, username, and celular during signup
app.get("/api/auth/check-uniqueness", async (req, res) => {
  try {
    const { email, username, celular } = req.query;

    const supabaseClient = getSupabase();
    if (!supabaseClient) {
      return res.status(500).json({ error: "Supabase client not initialized on server" });
    }

    let emailExists = false;
    let usernameExists = false;
    let celularExists = false;

    // Check email (case insensitive)
    if (email && typeof email === "string") {
      const { data, error } = await supabaseClient
        .from("users")
        .select("id")
        .ilike("email", email.trim())
        .maybeSingle();
      if (!error && data) emailExists = true;
    }

    // Check username (case insensitive)
    if (username && typeof username === "string") {
      const { data, error } = await supabaseClient
        .from("users")
        .select("id")
        .ilike("username", username.trim())
        .maybeSingle();
      if (!error && data) usernameExists = true;
    }

    // Check celular
    if (celular && typeof celular === "string") {
      const { data, error } = await supabaseClient
        .from("users")
        .select("id")
        .eq("celular", celular.trim())
        .maybeSingle();
      if (!error && data) celularExists = true;
    }

    return res.json({
      emailExists,
      usernameExists,
      celularExists
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// 1. Get All System Users (Bypasses RLS safely if server client has service_role key)
app.get("/api/admin/get-users", async (req, res) => {
  try {
    const { adminId } = req.query;
    if (!adminId || typeof adminId !== "string") {
      return res.status(400).json({ error: "adminId query parameter is required" });
    }

    const supabaseClient = getSupabase();
    if (!supabaseClient) {
      return res.status(500).json({ error: "Supabase client not initialized on server" });
    }

    const isMaster = await verifyMasterAdmin(supabaseClient, adminId);
    if (!isMaster) {
      return res.status(403).json({ error: "Acesso negado. Apenas usuários MASTER podem listar os usuários." });
    }

    const { data: users, error } = await supabaseClient
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Admin API] Error fetching users:", error);
      throw error;
    }

    return res.json({ users: users || [] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// 2. Create System User
app.post("/api/admin/create-user", async (req, res) => {
  try {
    const { adminId, payload } = req.body;
    if (!adminId || typeof adminId !== "string") {
      return res.status(400).json({ error: "adminId is required" });
    }
    if (!payload) {
      return res.status(400).json({ error: "payload is required" });
    }

    const supabaseClient = getSupabase();
    if (!supabaseClient) {
      return res.status(500).json({ error: "Supabase client not initialized on server" });
    }

    const isMaster = await verifyMasterAdmin(supabaseClient, adminId);
    if (!isMaster) {
      return res.status(403).json({ error: "Acesso negado. Apenas usuários MASTER podem criar usuários." });
    }

    // Prepare insert object with lowercase username
    const insertObj = {
      ...payload,
      username: payload.username?.toLowerCase()
    };

    const { data: user, error } = await supabaseClient
      .from("users")
      .insert([insertObj])
      .select()
      .single();

    if (error) {
      console.error("[Admin API] Error creating user:", error);
      throw error;
    }

    return res.json({ user });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// 3. Update System User
app.post("/api/admin/update-user", async (req, res) => {
  try {
    const { adminId, userId, payload } = req.body;
    if (!adminId || typeof adminId !== "string") {
      return res.status(400).json({ error: "adminId is required" });
    }
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "userId is required" });
    }
    if (!payload) {
      return res.status(400).json({ error: "payload is required" });
    }

    const supabaseClient = getSupabase();
    if (!supabaseClient) {
      return res.status(500).json({ error: "Supabase client not initialized on server" });
    }

    const isMaster = await verifyMasterAdmin(supabaseClient, adminId);
    if (!isMaster) {
      return res.status(403).json({ error: "Acesso negado. Apenas usuários MASTER podem editar usuários." });
    }

    const updateObj = {
      ...payload,
      username: payload.username?.toLowerCase()
    };

    const { data: user, error } = await supabaseClient
      .from("users")
      .update(updateObj)
      .eq("id", userId)
      .select()
      .maybeSingle();

    if (error) {
      console.error("[Admin API] Error updating user:", error);
      throw error;
    }

    return res.json({ user });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// 4. Delete System User
app.post("/api/admin/delete-user", async (req, res) => {
  try {
    const { adminId, userId } = req.body;
    if (!adminId || typeof adminId !== "string") {
      return res.status(400).json({ error: "adminId is required" });
    }
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "userId is required" });
    }

    const supabaseClient = getSupabase();
    if (!supabaseClient) {
      return res.status(500).json({ error: "Supabase client not initialized on server" });
    }

    const isMaster = await verifyMasterAdmin(supabaseClient, adminId);
    if (!isMaster) {
      return res.status(403).json({ error: "Acesso negado. Apenas usuários MASTER podem excluir usuários." });
    }

    // Try executing RPC first to clean dependencies, otherwise direct delete
    try {
      const { error: rpcErr } = await supabaseClient.rpc("delete_system_user", {
        p_user_id: userId
      });
      if (!rpcErr) {
        return res.json({ success: true });
      }
      console.warn("[Admin API] RPC delete failed, falling back to direct delete:", rpcErr);
    } catch (rpcEx) {
      console.warn("[Admin API] RPC delete threw exception, falling back to direct delete:", rpcEx);
    }

    const { error } = await supabaseClient
      .from("users")
      .delete()
      .eq("id", userId);

    if (error) {
      console.error("[Admin API] Error deleting user:", error);
      throw error;
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});


// ==========================================
// Stripe SaaS Integration (Webhook & Checkout)
// ==========================================

let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe | null {
  if (!stripeClient) {
    // Priority: environment variables
    const key = process.env.STRIPE_SECRET_KEY || "";
    if (key) {
      stripeClient = new Stripe(key, {
        apiVersion: "2025-01-27.acacia" as any,
      });
    } else {
      console.warn("[Stripe SDK] Warning: STRIPE_SECRET_KEY is not defined in process.env.");
    }
  }
  return stripeClient;
}

// Memory cache to prevent duplicate webhook processing
const processedWebhookEvents = new Set<string>();

function isDuplicateEvent(eventId: string): boolean {
  if (processedWebhookEvents.has(eventId)) {
    return true;
  }
  processedWebhookEvents.add(eventId);
  if (processedWebhookEvents.size > 2000) {
    // Clear half to avoid memory expansion
    const arr = Array.from(processedWebhookEvents);
    arr.slice(0, 1000).forEach(id => processedWebhookEvents.delete(id));
  }
  return false;
}

// Highly resilient user lookup (by Supabase ID, Stripe Subscription ID, or email)
async function findUserByStripeData(supabaseClient: any, data: { userId?: string; email?: string; subscriptionId?: string }) {
  if (data.userId) {
    const { data: user } = await supabaseClient
      .from("users")
      .select("*")
      .eq("id", data.userId)
      .maybeSingle();
    if (user) return user;
  }

  if (data.email) {
    const { data: user } = await supabaseClient
      .from("users")
      .select("*")
      .eq("email", data.email)
      .maybeSingle();
    if (user) return user;
  }

  if (data.subscriptionId) {
    const { data: user } = await supabaseClient
      .from("users")
      .select("*")
      .eq("plano_assinatura_id", data.subscriptionId)
      .maybeSingle();
    if (user) return user;
  }

  return null;
}

// Core Webhook Event Processor
async function processStripeEvent(event: any, supabaseClient: any) {
  const stripe = getStripeClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.client_reference_id || session.metadata?.userId;
      const email = session.customer_details?.email;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : undefined;

      const user = await findUserByStripeData(supabaseClient, { userId, email, subscriptionId });
      if (!user) {
        console.warn(`[Stripe Webhook] User not found for checkout.session.completed: email=${email}, userId=${userId}`);
        return;
      }

      const amount = session.amount_total ? session.amount_total / 100 : 28.90;
      let planName = session.metadata?.planId || user.plano_atual || "Plano Bronze";
      if (!session.metadata?.planId) {
        if (amount >= 120) planName = "Plano Ouro";
        else if (amount >= 70) planName = "Plano Prata";
        else planName = "Plano Bronze";
      }

      const now = new Date();
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const updates = {
        status: "Assinatura Ativa",
        situacao_pagamento: "Pago",
        plano_status: "Ativo",
        plano_atual: planName,
        plano_valor: amount,
        plano_gateway: "stripe",
        plano_assinatura_id: subscriptionId || user.plano_assinatura_id,
        plano_ultimo_pagamento: now.toISOString(),
        plano_proximo_pagamento: nextMonth.toISOString(),
        plano_data_contratacao: user.plano_data_contratacao || now.toISOString(),
        plano_data_renovacao: nextMonth.toISOString(),
        plano_data_vencimento: nextMonth.toISOString()
      };

      await supabaseClient.from("users").update(updates).eq("id", user.id);

      await supabaseClient.from("saas_logs").insert([{
        admin_id: null,
        admin_nome: "Stripe Webhook",
        acao: `Checkout concluído com sucesso no Stripe: ${planName} - R$ ${amount.toFixed(2)} (Assinatura Ativa)`,
        user_id: user.id,
        user_nome: user.nome
      }]);
      break;
    }

    case "customer.subscription.created": {
      const sub = event.data.object;
      const userId = sub.metadata?.userId;
      let email = undefined;

      if (stripe && typeof sub.customer === "string") {
        try {
          const customer: any = await stripe.customers.retrieve(sub.customer);
          if (customer && !customer.deleted) {
            email = customer.email;
          }
        } catch (err) {
          console.error("[Stripe Webhook] Error retrieving customer for subscription.created:", err);
        }
      }

      const user = await findUserByStripeData(supabaseClient, { userId, email, subscriptionId: sub.id });
      if (!user) {
        console.warn(`[Stripe Webhook] User not found for subscription.created: subId=${sub.id}`);
        return;
      }

      const planName = sub.metadata?.planId || user.plano_atual || "Plano Bronze";
      const startDate = new Date(sub.current_period_start * 1000).toISOString();
      const endDate = new Date(sub.current_period_end * 1000).toISOString();

      const isActive = sub.status === "active" || sub.status === "trialing";

      const updates = {
        status: isActive ? "Assinatura Ativa" : "Aguardando Assinatura",
        plano_status: isActive ? "Ativo" : "Inativo",
        plano_atual: planName,
        plano_gateway: "stripe",
        plano_assinatura_id: sub.id,
        plano_data_contratacao: startDate,
        plano_data_renovacao: endDate,
        plano_data_vencimento: endDate,
        plano_ultimo_pagamento: startDate,
        plano_proximo_pagamento: endDate
      };

      await supabaseClient.from("users").update(updates).eq("id", user.id);
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object;
      const userId = sub.metadata?.userId;
      let email = undefined;

      if (stripe && typeof sub.customer === "string") {
        try {
          const customer: any = await stripe.customers.retrieve(sub.customer);
          if (customer && !customer.deleted) {
            email = customer.email;
          }
        } catch (err) {}
      }

      const user = await findUserByStripeData(supabaseClient, { userId, email, subscriptionId: sub.id });
      if (!user) return;

      const planName = sub.metadata?.planId || user.plano_atual || "Plano Bronze";
      const startDate = new Date(sub.current_period_start * 1000).toISOString();
      const endDate = new Date(sub.current_period_end * 1000).toISOString();

      let userStatus = user.status;
      let planStatus = user.plano_status;
      let paymentSituation = user.situacao_pagamento;

      if (sub.status === "active" || sub.status === "trialing") {
        userStatus = "Assinatura Ativa";
        planStatus = "Ativo";
        paymentSituation = "Pago";
      } else if (sub.status === "past_due") {
        userStatus = "Inadimplente";
        planStatus = "Inativo";
        paymentSituation = "Pendente";
      } else if (sub.status === "unpaid") {
        userStatus = "Inadimplente";
        planStatus = "Inativo";
        paymentSituation = "Pendente";
      } else {
        userStatus = "Assinatura Cancelada";
        planStatus = "Inativo";
        paymentSituation = "Pendente";
      }

      const updates = {
        status: userStatus,
        plano_status: planStatus,
        situacao_pagamento: paymentSituation,
        plano_atual: planName,
        plano_data_renovacao: endDate,
        plano_data_vencimento: endDate,
        plano_ultimo_pagamento: startDate,
        plano_proximo_pagamento: endDate
      };

      await supabaseClient.from("users").update(updates).eq("id", user.id);

      await supabaseClient.from("saas_logs").insert([{
        admin_id: null,
        admin_nome: "Stripe Webhook",
        acao: `Assinatura atualizada: ${planName} - Status Stripe: ${sub.status} (Sistema: ${planStatus})`,
        user_id: user.id,
        user_nome: user.nome
      }]);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const user = await findUserByStripeData(supabaseClient, { subscriptionId: sub.id });
      if (!user) return;

      const updates = {
        status: "Assinatura Cancelada",
        plano_status: "Inativo",
        situacao_pagamento: "Pendente"
      };

      await supabaseClient.from("users").update(updates).eq("id", user.id);

      await supabaseClient.from("saas_logs").insert([{
        admin_id: null,
        admin_nome: "Stripe Webhook",
        acao: `Assinatura cancelada ou expirada no Stripe. Plano inativo.`,
        user_id: user.id,
        user_nome: user.nome
      }]);
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object;
      const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : undefined;
      const email = invoice.customer_email || undefined;

      const user = await findUserByStripeData(supabaseClient, { email, subscriptionId });
      if (!user) return;

      const amount = invoice.amount_paid ? invoice.amount_paid / 100 : user.plano_valor;
      const now = new Date();
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      const updates = {
        status: "Assinatura Ativa",
        plano_status: "Ativo",
        situacao_pagamento: "Pago",
        plano_ultimo_pagamento: now.toISOString(),
        plano_proximo_pagamento: nextMonth.toISOString(),
        plano_data_renovacao: nextMonth.toISOString(),
        plano_data_vencimento: nextMonth.toISOString()
      };

      await supabaseClient.from("users").update(updates).eq("id", user.id);

      await supabaseClient.from("saas_logs").insert([{
        admin_id: null,
        admin_nome: "Stripe Webhook",
        acao: `Fatura paga com sucesso: R$ ${amount.toFixed(2)} (Acesso Renovado/Ativo)`,
        user_id: user.id,
        user_nome: user.nome
      }]);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : undefined;
      const email = invoice.customer_email || undefined;

      const user = await findUserByStripeData(supabaseClient, { email, subscriptionId });
      if (!user) return;

      const updates = {
        status: "Inadimplente",
        plano_status: "Inativo",
        situacao_pagamento: "Falhou"
      };

      await supabaseClient.from("users").update(updates).eq("id", user.id);

      await supabaseClient.from("saas_logs").insert([{
        admin_id: null,
        admin_nome: "Stripe Webhook",
        acao: `Falha no pagamento da fatura recorrente do Stripe. Plano alterado para Inadimplente.`,
        user_id: user.id,
        user_nome: user.nome
      }]);
      break;
    }

    default: {
      console.log(`[Stripe Webhook] Evento ignorado: ${event.type}`);
    }
  }
}

// Webhook HTTP Endpoint
app.post("/api/webhooks/stripe", async (req: any, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

  const stripe = getStripeClient();
  if (!stripe) {
    return res.status(500).json({ error: "Stripe não está configurado no servidor." });
  }

  let event;

  if (endpointSecret && sig) {
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
    } catch (err: any) {
      console.error(`[Stripe Webhook] Falha de validação da assinatura:`, err.message);
      return res.status(400).send(`Erro de Validação: ${err.message}`);
    }
  } else {
    // Relaxed mode for developer postman/simulator test if secret is not set
    if (process.env.NODE_ENV !== "production" && !endpointSecret) {
      console.warn("[Stripe Webhook] STRIPE_WEBHOOK_SECRET não configurado. Processando payload não assinado em desenvolvimento.");
      event = req.body;
    } else {
      console.error("[Stripe Webhook] Rejeitado: assinatura ou segredo do webhook ausente.");
      return res.status(400).send("Assinatura ausente.");
    }
  }

  // Deduplicate events
  if (event && event.id && isDuplicateEvent(event.id)) {
    console.log(`[Stripe Webhook] Evento duplicado ignorado: ${event.id}`);
    return res.json({ received: true, duplicate: true });
  }

  try {
    const supabaseClient = getSupabase();
    if (!supabaseClient) {
      return res.status(500).send("Cliente do Supabase não foi inicializado.");
    }

    await processStripeEvent(event, supabaseClient);
    return res.json({ received: true });
  } catch (err: any) {
    console.error("[Stripe Webhook] Erro de processamento interno:", err);
    return res.status(500).send(`Erro interno: ${err.message}`);
  }
});

// Dynamic Checkout Session Creation Endpoint
app.post("/api/payments/create-checkout-session", async (req, res) => {
  try {
    const { planId, userId, email } = req.body;
    if (!planId || !userId) {
      return res.status(400).json({ error: "Parâmetros planId e userId são obrigatórios." });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(500).json({ error: "Gateway de pagamentos Stripe não configurado." });
    }

    let planPrice = 49.90;
    let planName = "Plano Bronze";

    if (planId === "Plano Prata") {
      planPrice = 99.90;
      planName = "Plano Prata";
    } else if (planId === "Plano Ouro") {
      planPrice = 149.90;
      planName = "Plano Ouro";
    } else {
      // Lumora Flow customized price requested by user: R$ 28.90
      planPrice = 28.90;
      planName = "Plano Bronze";
    }

    // Lookup Environment Price ID overrides
    let priceId = "";
    if (planName === "Plano Bronze" && process.env.STRIPE_PRICE_BRONZE) {
      priceId = process.env.STRIPE_PRICE_BRONZE;
    } else if (planName === "Plano Prata" && process.env.STRIPE_PRICE_PRATA) {
      priceId = process.env.STRIPE_PRICE_PRATA;
    } else if (planName === "Plano Ouro" && process.env.STRIPE_PRICE_OURO) {
      priceId = process.env.STRIPE_PRICE_OURO;
    }

    // If no custom Price ID is supplied, generate ad-hoc product & price in Stripe dynamically
    if (!priceId) {
      try {
        console.log(`[Stripe Checkout] Criando produto e preço dinâmico para: ${planName} (R$ ${planPrice})`);
        const product = await stripe.products.create({
          name: `${planName} - Lumora Flow`,
        });
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: Math.round(planPrice * 100),
          currency: "brl",
          recurring: { interval: "month" },
        });
        priceId = price.id;
      } catch (err: any) {
        console.error("[Stripe Checkout] Falha ao registrar produto dinâmico no Stripe:", err);
        return res.status(500).json({ error: "Erro de provisionamento no Stripe", message: err.message });
      }
    }

    const appUrl = getAppUrl(req);

    // Create session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      customer_email: email || undefined,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      client_reference_id: userId,
      subscription_data: {
        metadata: {
          userId,
          planId: planName,
        },
      },
      metadata: {
        userId,
        planId: planName,
      },
      success_url: `${appUrl}/?checkout_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/`,
    });

    return res.json({ url: session.url });
  } catch (err: any) {
    console.error("[Stripe Checkout] Falha ao iniciar checkout:", err);
    return res.status(500).json({ error: err.message || String(err) });
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
