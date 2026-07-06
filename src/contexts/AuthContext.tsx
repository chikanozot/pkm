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
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      // 1. Get initial session
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email || "",
            nome: session.user.user_metadata?.nome || session.user.email?.split("@")[0] || "Profissional"
          });
        }
        setLoading(false);
      });

      // 2. Listen to changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          setUser({
            id: session.user.id,
            email: session.user.email || "",
            nome: session.user.user_metadata?.nome || session.user.email?.split("@")[0] || "Profissional"
          });
        } else {
          setUser(null);
        }
        setLoading(false);
      });

      return () => {
        subscription.unsubscribe();
      };
    } else {
      // Offline/Demo Fallback authentication
      const savedSession = localStorage.getItem("estetica_demo_session");
      if (savedSession) {
        try {
          setUser(JSON.parse(savedSession));
        } catch {
          setUser(null);
        }
      } else {
        // Automatically sign in to the demo-user for rapid preview testing!
        const defaultDemo = { id: "demo-user", email: "profissional@estetica.com", nome: "Dra. Carol Silveira" };
        setUser(defaultDemo);
        localStorage.setItem("estetica_demo_session", JSON.stringify(defaultDemo));
      }
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (err) throw err;
        if (data.user) {
          setUser({
            id: data.user.id,
            email: data.user.email || "",
            nome: data.user.user_metadata?.nome || data.user.email?.split("@")[0] || "Profissional"
          });
        }
      } else {
        // Mock Login
        if (!email || !password) throw new Error("Preencha todos os campos.");
        if (password.length < 6) throw new Error("A senha deve conter no mínimo 6 caracteres.");
        
        const demoSession = {
          id: "demo-user",
          email,
          nome: email.split("@")[0].toUpperCase()
        };
        setUser(demoSession);
        localStorage.setItem("estetica_demo_session", JSON.stringify(demoSession));
      }
    } catch (err: any) {
      setError(err.message || "Erro ao realizar o login.");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (email: string, password: string, name: string) => {
    setError(null);
    setLoading(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { nome: name }
          }
        });
        if (err) throw err;
        if (data.user) {
          setUser({
            id: data.user.id,
            email: data.user.email || "",
            nome: name
          });
        }
      } else {
        // Mock Sign up
        if (!email || !password || !name) throw new Error("Preencha todos os campos.");
        const demoSession = {
          id: "demo-user",
          email,
          nome: name
        };
        setUser(demoSession);
        localStorage.setItem("estetica_demo_session", JSON.stringify(demoSession));
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
      if (isSupabaseConfigured && supabase) {
        await supabase.auth.signOut();
      }
      setUser(null);
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
