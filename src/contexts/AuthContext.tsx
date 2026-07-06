/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase.js";
import { UserSession } from "../types.js";

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  isDemo: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const generateUUID = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const ensureUserInSupabase = async (u: UserSession) => {
  if (!isSupabaseConfigured || !supabase || !u || !u.id) return;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(u.id)) return;

  try {
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .eq("id", u.id)
      .limit(1);
    
    if (error) {
      console.warn("Silent: could not query users table:", error);
      return;
    }

    if (!data || data.length === 0) {
      const { error: insertError } = await supabase.from("users").insert([{
        id: u.id,
        username: u.username || u.email?.split("@")[0] || "demo",
        nome: u.nome,
        role: u.role || "user",
        password_hash: "mock_password_hash"
      }]);
      if (insertError) {
        console.warn("Silent: could not insert user in users table:", insertError);
      }
    }
  } catch (err) {
    console.warn("Silent: error ensuring user exists in Supabase:", err);
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && isSupabaseConfigured) {
      ensureUserInSupabase(user);
    }
  }, [user]);

  useEffect(() => {
    const savedSession = localStorage.getItem("pkm_user_session");
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        setUser(parsed);
      } catch {
        setUser(null);
      }
    } else {
      setUser(null);
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      if (!username || !password) {
        throw new Error("Por favor, preencha todos os campos.");
      }

      const lowerUsername = username.trim().toLowerCase();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error("Erro: O banco de dados Supabase não está configurado. Por favor, adicione as variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas configurações do seu projeto.");
      }

      const { data, error: err } = await supabase.rpc("authenticate_user", {
        p_username: lowerUsername,
        p_password: password
      });

      if (err) {
        if (err.message?.includes("function") && err.message?.includes("authenticate_user")) {
          throw new Error("O script SQL do banco de dados ainda não foi executado no Supabase. Por favor, execute o script SQL no seu console SQL do Supabase.");
        }
        throw err;
      }
      
      if (data && data.length > 0) {
        const authUser = data[0];
        const sessionUser: UserSession = {
          id: authUser.id,
          username: authUser.username,
          nome: authUser.nome,
          role: authUser.role as "master" | "user",
          email: authUser.username + "@pkm.com"
        };
        setUser(sessionUser);
        localStorage.setItem("pkm_user_session", JSON.stringify(sessionUser));
        localStorage.removeItem("estetica_logged_out");
      } else {
        throw new Error("Usuário ou senha incorretos.");
      }
    } catch (err: any) {
      setError(err.message || "Erro ao realizar o login.");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (username: string, password: string, name: string) => {
    setError(null);
    setLoading(true);
    try {
      if (!username || !password || !name) {
        throw new Error("Por favor, preencha todos os campos.");
      }

      const lowerUsername = username.trim().toLowerCase();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error("Erro: O banco de dados Supabase não está configurado. Por favor, adicione as variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas configurações do seu projeto.");
      }

      const { data, error: err } = await supabase.rpc("create_system_user", {
        p_username: lowerUsername,
        p_password: password,
        p_nome: name.trim(),
        p_role: "user"
      });

      if (err) {
        if (err.message?.includes("unique_users_username") || err.message?.includes("users_username_key")) {
          throw new Error("Este nome de usuário já está em uso.");
        }
        throw err;
      }

      if (data && data.length > 0) {
        const authUser = data[0];
        const sessionUser: UserSession = {
          id: authUser.id,
          username: authUser.username,
          nome: authUser.nome,
          role: authUser.role as "master" | "user",
          email: authUser.username + "@pkm.com"
        };
        setUser(sessionUser);
        localStorage.setItem("pkm_user_session", JSON.stringify(sessionUser));
        localStorage.removeItem("estetica_logged_out");
      } else {
        throw new Error("Erro ao criar o usuário.");
      }
    } catch (err: any) {
      setError(err.message || "Erro ao realizar o cadastro.");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      setUser(null);
      localStorage.setItem("estetica_logged_out", "true");
      localStorage.removeItem("pkm_user_session");
      localStorage.removeItem("estetica_demo_session");
    } catch (err) {
      console.error("Logout error", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isDemo: false,
      login,
      signup,
      logout,
      error
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
