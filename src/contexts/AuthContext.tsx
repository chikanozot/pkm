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
      setLoading(false);
    } else if (isSupabaseConfigured && supabase) {
      setLoading(false);
    } else {
      // Offline/Demo Fallback authentication
      const savedDemo = localStorage.getItem("estetica_demo_session");
      const loggedOut = localStorage.getItem("estetica_logged_out") === "true";

      if (savedDemo && !loggedOut) {
        try {
          setUser(JSON.parse(savedDemo));
        } catch {
          setUser(null);
        }
      } else if (!loggedOut) {
        // Automatically sign in to the demo-user for rapid preview testing!
        const defaultDemo: UserSession = { id: "00000000-0000-0000-0000-000000000002", username: "demo", nome: "Dra. Carol Silveira", role: "master" };
        setUser(defaultDemo);
        localStorage.setItem("estetica_demo_session", JSON.stringify(defaultDemo));
      } else {
        setUser(null);
      }
      setLoading(false);
    }
  }, []);

  const login = async (username: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      if (!username || !password) {
        throw new Error("Por favor, preencha todos os campos.");
      }

      const lowerUsername = username.trim().toLowerCase();

      if (isSupabaseConfigured && supabase) {
        try {
          const { data, error: err } = await supabase.rpc("authenticate_user", {
            p_username: lowerUsername,
            p_password: password
          });

          if (err) {
            if (err.message?.includes("function") && err.message?.includes("authenticate_user")) {
              throw new Error("O script SQL do banco de dados ainda não foi executado no Supabase. Por favor, copie e execute o script SQL disponível na aba 'Integrações' no seu painel do Supabase.");
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
        } catch (rpcErr: any) {
          if (rpcErr.message?.includes("script SQL") || rpcErr.message?.includes("Integrações")) {
            throw rpcErr;
          }
          // If RPC fails (e.g. function missing) and they typed the master credentials, let them log in as mockup
          if (lowerUsername === "zotgod" && password === "Caio1993") {
            const demoSession: UserSession = {
              id: "00000000-0000-0000-0000-000000000001",
              username: "zotgod",
              nome: "Administrador Master (Demo)",
              role: "master",
              email: "zotgod@pkm.com"
            };
            setUser(demoSession);
            localStorage.setItem("pkm_user_session", JSON.stringify(demoSession));
            localStorage.removeItem("estetica_logged_out");
            return;
          }
          throw rpcErr;
        }
      } else {
        // Mock Login
        if (password.length < 6) throw new Error("A senha deve conter no mínimo 6 caracteres.");
        
        // Se for o master administrativo no mockup
        const role = (lowerUsername === "zotgod") ? "master" as const : "user" as const;
        const nome = (lowerUsername === "zotgod") ? "Administrador Master" : username.toUpperCase();

        if (lowerUsername === "zotgod" && password !== "Caio1993") {
          throw new Error("Senha incorreta para o usuário master.");
        }

        const demoSession: UserSession = {
          id: lowerUsername === "zotgod" ? "00000000-0000-0000-0000-000000000001" : "00000000-0000-0000-0000-000000000002",
          username: lowerUsername,
          nome: nome,
          role: role,
          email: lowerUsername + "@pkm.com"
        };
        setUser(demoSession);
        localStorage.setItem("pkm_user_session", JSON.stringify(demoSession));
        localStorage.setItem("estetica_demo_session", JSON.stringify(demoSession));
        localStorage.removeItem("estetica_logged_out");
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

      if (isSupabaseConfigured && supabase) {
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
      } else {
        // Mock Sign up
        if (password.length < 6) throw new Error("A senha deve conter no mínimo 6 caracteres.");
        const demoSession: UserSession = {
          id: generateUUID(),
          username: lowerUsername,
          nome: name.trim(),
          role: "user" as const,
          email: lowerUsername + "@pkm.com"
        };
        setUser(demoSession);
        localStorage.setItem("pkm_user_session", JSON.stringify(demoSession));
        localStorage.setItem("estetica_demo_session", JSON.stringify(demoSession));
        localStorage.removeItem("estetica_logged_out");
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
      isDemo: !isSupabaseConfigured,
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
