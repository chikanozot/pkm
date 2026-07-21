/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient } from "@supabase/supabase-js";

// Helper to initialize Supabase server-side client
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
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

// 1. Construct Google OAuth Authorization URL
export function getGoogleAuthUrl(userId: string, appUrl: string, clientId: string): string {
  const redirectUri = `${appUrl}/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar",
    access_type: "offline",
    prompt: "consent",
    state: userId, // Pass the professional's user ID so we can store the token under their account
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// 2. Exchange Authorization Code for Access & Refresh Tokens
export async function exchangeCodeForTokens(
  code: string,
  appUrl: string,
  clientId: string,
  clientSecret: string
) {
  const redirectUri = `${appUrl}/auth/google/callback`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to exchange code: ${errText}`);
  }

  return response.json(); // { access_token, refresh_token, expires_in, token_type }
}

// 3. Refresh Access Token using Refresh Token
export async function refreshGoogleAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to refresh token: ${errText}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
  };
}

// 4. Retrieve or Refresh User's Google Credentials from Supabase
export async function getUserGoogleConnection(userId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  // Retrieve connections for this user
  const { data, error } = await supabase
    .from("google_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const now = Date.now();
  // If token is expired or expires in the next 2 minutes, refresh it
  if (data.expiry_date && now >= Number(data.expiry_date) - 120000) {
    try {
      const clientId = process.env.GOOGLE_CLIENT_ID || "";
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
      if (!clientId || !clientSecret) return null;

      const refreshData = await refreshGoogleAccessToken(data.refresh_token, clientId, clientSecret);
      const newExpiry = Date.now() + refreshData.expires_in * 1000;

      // Update in Supabase
      const { error: updateError } = await supabase
        .from("google_connections")
        .update({
          access_token: refreshData.access_token,
          expiry_date: newExpiry,
        })
        .eq("user_id", userId);

      if (updateError) {
        console.error("Error updating refreshed token in Supabase:", updateError);
      }

      return {
        ...data,
        access_token: refreshData.access_token,
        expiry_date: newExpiry,
      };
    } catch (err: any) {
      console.error("Failed to refresh Google token:", err);
      // If it is a terminal OAuth error (e.g. invalid_client or invalid_grant),
      // we should delete the connection in Supabase so the user can re-authenticate.
      const errMsg = err?.message || String(err);
      if (
        errMsg.includes("invalid_client") ||
        errMsg.includes("invalid_grant") ||
        errMsg.includes("unauthorized_client")
      ) {
        console.warn(`Terminal OAuth error detected. Deleting connection for user ${userId} so they can reconnect.`);
        await supabase
          .from("google_connections")
          .delete()
          .eq("user_id", userId);
      }
      return null;
    }
  }

  return data;
}

// 5. Create Google Calendar Event
export async function createGoogleCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description: string;
    startDateTime: string; // ISO String
    endDateTime: string;   // ISO String
    remindersMinutes?: number;
    calendarId?: string;
  }
) {
  const eventData = {
    summary: event.summary,
    description: event.description,
    start: {
      dateTime: event.startDateTime,
      timeZone: "America/Sao_Paulo",
    },
    end: {
      dateTime: event.endDateTime,
      timeZone: "America/Sao_Paulo",
    },
    reminders: {
      useDefault: event.remindersMinutes === undefined,
      overrides: event.remindersMinutes !== undefined ? [
        { method: "popup", minutes: event.remindersMinutes },
        { method: "email", minutes: event.remindersMinutes },
      ] : [],
    },
  };

  const calId = event.calendarId || "primary";
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(eventData),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Calendar Create Event error: ${errText}`);
  }

  const data = await response.json();
  return data.id; // Returns Google Event ID
}

// 6. Update Google Calendar Event
export async function updateGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
  event: {
    summary: string;
    description: string;
    startDateTime: string;
    endDateTime: string;
    remindersMinutes?: number;
    calendarId?: string;
  }
) {
  const eventData = {
    summary: event.summary,
    description: event.description,
    start: {
      dateTime: event.startDateTime,
      timeZone: "America/Sao_Paulo",
    },
    end: {
      dateTime: event.endDateTime,
      timeZone: "America/Sao_Paulo",
    },
    reminders: {
      useDefault: event.remindersMinutes === undefined,
      overrides: event.remindersMinutes !== undefined ? [
        { method: "popup", minutes: event.remindersMinutes },
        { method: "email", minutes: event.remindersMinutes },
      ] : [],
    },
  };

  const calId = event.calendarId || "primary";
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${eventId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventData),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Calendar Update Event error: ${errText}`);
  }

  return response.json();
}

// 7. Delete Google Calendar Event
export async function deleteGoogleCalendarEvent(accessToken: string, eventId: string, calendarId?: string) {
  const calId = calendarId || "primary";
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${eventId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    const errText = await response.text();
    throw new Error(`Google Calendar Delete Event error: ${errText}`);
  }

  return true;
}

// 8. Fetch Google Calendar events (supports list, paging, timeMin, and syncToken)
export async function listGoogleCalendarEvents(
  accessToken: string,
  options: {
    calendarId?: string;
    syncToken?: string;
    timeMin?: string;
    pageToken?: string;
  } = {}
) {
  const calendarId = options.calendarId || "primary";
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  
  if (options.syncToken) {
    url.searchParams.set("syncToken", options.syncToken);
  } else {
    if (options.timeMin) {
      url.searchParams.set("timeMin", options.timeMin);
    }
    url.searchParams.set("singleEvents", "true");
  }
  
  if (options.pageToken) {
    url.searchParams.set("pageToken", options.pageToken);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 410) {
    throw new Error("SYNC_TOKEN_EXPIRED");
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Calendar List Events error: ${errText}`);
  }

  return response.json();
}

// 9. Find calendar by name in user's calendar list
export async function findCalendarByName(accessToken: string, name: string): Promise<string | null> {
  const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Calendar List Calendars error: ${errText}`);
  }

  const data = await response.json();
  const calendars = data.items || [];
  
  // Look for a calendar whose summary matches the name (case-insensitive, trimmed)
  const targetName = name.trim().toUpperCase();
  const matched = calendars.find(
    (cal: any) => cal.summary && cal.summary.trim().toUpperCase() === targetName
  );
  
  return matched ? matched.id : null;
}

