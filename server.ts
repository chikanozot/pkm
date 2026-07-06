/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
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
  const { userId } = req.query;
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "userId is required" });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const appUrl = getAppUrl(req);

  if (!clientId) {
    return res.status(400).json({
      error: "Google Client ID not configured. Set GOOGLE_CLIENT_ID in secrets.",
    });
  }

  const authUrl = getGoogleAuthUrl(userId, appUrl, clientId);
  res.json({ url: authUrl });
});

// 2. Google OAuth Callback
app.get(["/auth/google/callback", "/auth/google/callback/"], async (req, res) => {
  const { code, state: userId, error } = req.query;

  if (error) {
    console.error("Google OAuth error on callback:", error);
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
    return res.status(400).send("Invalid callback arguments");
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    const appUrl = getAppUrl(req);

    if (!clientId || !clientSecret) {
      throw new Error("Google Client ID or Client Secret is not configured.");
    }

    const tokens = await exchangeCodeForTokens(code, appUrl, clientId, clientSecret);
    const expiryDate = Date.now() + tokens.expires_in * 1000;

    const supabase = getSupabase();
    if (supabase) {
      // Real database persistence
      const connectionData = {
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: expiryDate,
        lembretes_minutos: 30, // Default 30 min reminder
      };

      // Check if user already has a connection
      const { data: existing } = await supabase
        .from("google_connections")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("google_connections")
          .update(connectionData)
          .eq("user_id", userId);
      } else {
        await supabase
          .from("google_connections")
          .insert([connectionData]);
      }
    } else {
      // Demo state fallback
      demoGoogleConnections.set(userId, {
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: expiryDate,
        lembretes_minutos: 30,
      });
    }

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
  if (process.env.NODE_ENV !== "production") {
    // Development mode
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
