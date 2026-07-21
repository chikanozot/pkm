/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase.js";
import { databaseService } from "../lib/databaseService.js";
import { UserSession } from "../types.js";

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  isDemo: boolean;
  login: (emailOrUsername: string, passwordOrToken: string, options?: { remember?: boolean }) => Promise<void>;
  signup: (email: string, passwordOrToken: string, name: string, celular: string, empresa?: string) => Promise<any>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<void>;
  updateProfile: (payload: { nome?: string; empresa?: string; celular?: string; foto_url?: string; password?: string; email?: string }) => Promise<void>;
  reloadProfile: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAndMergeProfile = async (supabaseUserId: string, authEmail?: string) => {
    try {
      let profile = await databaseService.getUserProfile(supabaseUserId);
      
      // Self-healing: If user is authenticated via Supabase but profile row is missing in public.users
      if (!profile && authEmail && isSupabaseConfigured && supabase) {
        try {
          console.warn(`Profile for user ${supabaseUserId} is missing. Recreating profile dynamically...`);
          const cleanEmail = authEmail.toLowerCase().trim();
          let baseUsername = cleanEmail.split("@")[0].replace(/[^a-z0-9]/g, "").toLowerCase();
          if (!baseUsername) {
            baseUsername = "user" + Math.floor(1000 + Math.random() * 9000);
          }
          
          // Ensure username is unique to avoid unique constraint violations
          let uniqueUsername = baseUsername;
          let suffix = 1;
          
          // Use the secure uniqueness endpoint instead of getSystemUsers which is restricted to Master admin
          try {
            let exists = true;
            while (exists) {
              const res = await fetch(`/api/auth/check-uniqueness?username=${encodeURIComponent(uniqueUsername)}`);
              if (res.ok) {
                const data = await res.json();
                if (data.usernameExists) {
                  uniqueUsername = `${baseUsername}${suffix}`;
                  suffix++;
                } else {
                  exists = false;
                }
              } else {
                exists = false;
              }
            }
          } catch (uniqErr) {
            console.error("Failed to check username uniqueness during self-healing:", uniqErr);
          }

          // Fetch metadata from Supabase user object if available
          let nome = "Usuário";
          let celular = "";
          let empresa = "";
          try {
            const { data: { user: authUser } } = await supabase.auth.getUser();
            if (authUser?.user_metadata) {
              nome = authUser.user_metadata.nome || authUser.user_metadata.name || nome;
              celular = authUser.user_metadata.celular || celular;
              empresa = authUser.user_metadata.empresa || empresa;
            }
          } catch (metaErr) {
            console.error("Could not fetch user metadata during self-healing, using defaults:", metaErr);
          }

          const fallbackProfile = {
            id: supabaseUserId,
            username: uniqueUsername,
            nome,
            role: "user" as const,
            email: cleanEmail,
            celular: celular || null,
            empresa: empresa || null,
            status: "Aguardando Assinatura",
            plano_atual: "Plano Bronze",
            plano_status: "Inativo",
            plano_valor: 49.90,
            ultimo_acesso: new Date().toISOString(),
            password_hash: "auth_managed"
          };

          const { error: insertErr } = await supabase
            .from("users")
            .insert([fallbackProfile]);

          if (insertErr) {
            if (insertErr.code === "23505" || insertErr.message?.includes("duplicate key") || insertErr.message?.includes("already exists")) {
              console.log("Profile already exists in database (duplicate key caught). Re-fetching profile...");
            } else {
              console.warn("Direct insert profile during self-healing failed. Falling back to helper...", insertErr);
              await databaseService.insertSystemUser(fallbackProfile as any).catch(e => {
                console.warn("Fallback helper insert failed too:", e);
              });
            }
          }

          profile = await databaseService.getUserProfile(supabaseUserId);
        } catch (healErr) {
          console.error("Error during self-healing profile creation:", healErr);
        }
      }

      if (profile) {
        const emailConfirmed = authEmail ? true : (profile.status !== "Aguardando Confirmação");
        const sessionUser: UserSession = {
          id: supabaseUserId,
          username: profile.username || authEmail?.split("@")[0] || "user",
          nome: profile.nome || "Usuário",
          role: profile.role || "user",
          email: profile.email || authEmail,
          empresa: profile.empresa || "",
          celular: profile.celular || "",
          foto_url: profile.foto_url || "",
          status: profile.status || "Aguardando Assinatura",
          plano_atual: profile.plano_atual || "Plano Bronze",
          plano_status: profile.plano_status || "Inativo",
          plano_valor: Number(profile.plano_valor) || 49.90,
          plano_data_contratacao: profile.plano_data_contratacao,
          plano_data_renovacao: profile.plano_data_renovacao,
          plano_data_vencimento: profile.plano_data_vencimento,
          plano_gateway: profile.plano_gateway || "Manual",
          plano_assinatura_id: profile.plano_assinatura_id,
          plano_ultimo_pagamento: profile.plano_ultimo_pagamento,
          plano_proximo_pagamento: profile.plano_proximo_pagamento,
          email_confirmado: emailConfirmed,
          created_by: profile.created_by || "self_registration",
          must_change_password: !!profile.must_change_password,
          observacoes_admin: profile.observacoes_admin || ""
        };
        return sessionUser;
      }
    } catch (e) {
      console.error("Error fetching user profile to merge:", e);
    }

    // In-memory fallback if the profile exists but is unreadable due to RLS policies
    if (supabaseUserId) {
      console.warn("Returning safety in-memory fallback profile to prevent login lockout.");
      const email = authEmail || "usuario@pkm.com";
      const sessionUser: UserSession = {
        id: supabaseUserId,
        username: email.split("@")[0] || "usuario",
        nome: "Usuário",
        role: "user",
        email: email,
        empresa: "",
        celular: "",
        foto_url: "",
        status: "Assinatura Ativa",
        plano_atual: "Plano Bronze",
        plano_status: "Ativo",
        plano_valor: 49.90,
        email_confirmado: true
      };
      return sessionUser;
    }

    return null;
  };

  const reloadProfile = async () => {
    if (!user?.id) return;
    const merged = await fetchAndMergeProfile(user.id, user.email);
    if (merged) {
      setUser(merged);
      localStorage.setItem("pkm_user_session", JSON.stringify(merged));
    }
  };

  useEffect(() => {
    // 1. Load from localStorage if present
    const savedSession = localStorage.getItem("pkm_user_session");
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        setUser(parsed);
      } catch {
        setUser(null);
      }
    }

    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    // 2. Refresh session dynamically via official Supabase Auth
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const merged = await fetchAndMergeProfile(session.user.id, session.user.email);
          if (merged) {
            // Also enforce email confirmation status
            merged.email_confirmado = !!session.user.email_confirmed_at;
            setUser(merged);
            localStorage.setItem("pkm_user_session", JSON.stringify(merged));
            
            // Log access time
            await databaseService.updateUserProfile(session.user.id, {
              ultimo_acesso: new Date().toISOString()
            });
          }
        }
      } catch (e) {
        console.error("Error restoring session:", e);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // 3. Listen to auth state updates (autoRefreshToken handles renewal, we update session here)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const merged = await fetchAndMergeProfile(session.user.id, session.user.email);
        if (merged) {
          merged.email_confirmado = !!session.user.email_confirmed_at;
          setUser(merged);
          localStorage.setItem("pkm_user_session", JSON.stringify(merged));
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        localStorage.removeItem("pkm_user_session");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (emailOrUsername: string, passwordOrToken: string, options?: { remember?: boolean }) => {
    setError(null);
    setLoading(true);
    try {
      if (!emailOrUsername || !passwordOrToken) {
        throw new Error("Por favor, preencha todos os campos.");
      }

      const input = emailOrUsername.trim();

      if (!isSupabaseConfigured || !supabase) {
        throw new Error("Erro: O banco de dados Supabase não está configurado.");
      }

      // 1. Detect if it is an email or username login
      const isEmail = input.includes("@");

      if (isEmail) {
        // Official Supabase Auth Email/Password login
        const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
          email: input.toLowerCase(),
          password: passwordOrToken
        });

        if (authErr) {
          throw authErr;
        }

        if (authData.user) {
          // Fetch database profile
          const merged = await fetchAndMergeProfile(authData.user.id, authData.user.email);
          if (merged) {
            merged.email_confirmado = !!authData.user.email_confirmed_at;
            setUser(merged);
            localStorage.setItem("pkm_user_session", JSON.stringify(merged));
            localStorage.removeItem("estetica_logged_out");
            
            // Log access
            await databaseService.updateUserProfile(authData.user.id, {
              ultimo_acesso: new Date().toISOString()
            });
          } else {
            // No profile? Create a basic one
            try {
              const fallbackProfile = {
                id: authData.user.id,
                username: authData.user.email?.split("@")[0] || "user",
                nome: authData.user.user_metadata?.nome || "Usuário",
                role: "user" as const,
                email: authData.user.email,
                status: "Aguardando Assinatura",
                plano_atual: "Plano Bronze",
                plano_status: "Inativo",
                ultimo_acesso: new Date().toISOString(),
                password_hash: "auth_managed"
              };
              await databaseService.insertSystemUser(fallbackProfile).catch(err => {
                console.warn("Failed to insert fallback profile row, proceeding anyway:", err);
              });
              
              const sessionUser = {
                ...fallbackProfile,
                email_confirmado: !!authData.user.email_confirmed_at
              };
              setUser(sessionUser);
              localStorage.setItem("pkm_user_session", JSON.stringify(sessionUser));
            } catch (fallbackErr) {
              console.error("Critical error in login profile fallback, proceeding with memory state:", fallbackErr);
              const sessionUser = {
                id: authData.user.id,
                username: authData.user.email?.split("@")[0] || "user",
                nome: "Usuário",
                role: "user" as const,
                email: authData.user.email,
                status: "Assinatura Ativa",
                plano_atual: "Plano Bronze",
                plano_status: "Ativo",
                email_confirmado: !!authData.user.email_confirmed_at
              };
              setUser(sessionUser as any);
              localStorage.setItem("pkm_user_session", JSON.stringify(sessionUser));
            }
          }
        }
      } else {
        // Legacy custom RPC user/password login (so pre-existing usernames don't break)
        const { data, error: err } = await supabase.rpc("authenticate_user", {
          p_username: input.toLowerCase(),
          p_password: passwordOrToken
        });

        if (err) {
          throw err;
        }

        if (data && data.length > 0) {
          const authUser = data[0];
          // Get additional details
          const fullProfile = await databaseService.getUserProfile(authUser.id);
          const sessionUser: UserSession = {
            id: authUser.id,
            username: authUser.username,
            nome: authUser.nome,
            role: authUser.role as "master" | "user" | "admin" | "cliente",
            email: fullProfile?.email || (authUser.username + "@pkm.com"),
            empresa: fullProfile?.empresa || "",
            celular: fullProfile?.celular || "",
            foto_url: fullProfile?.foto_url || "",
            status: fullProfile?.status || "Assinatura Ativa", // old accounts default to active
            plano_atual: fullProfile?.plano_atual || "Plano Ouro",
            plano_status: fullProfile?.plano_status || "Ativo",
            plano_valor: Number(fullProfile?.plano_valor) || 149.90,
            email_confirmado: true // Legacy accounts skip email verification
          };

          // Auto upgrade master profile status
          if (sessionUser.role === "master" && sessionUser.status !== "Assinatura Ativa") {
            sessionUser.status = "Assinatura Ativa";
            await databaseService.updateUserProfile(authUser.id, { status: "Assinatura Ativa" });
          }

          setUser(sessionUser);
          localStorage.setItem("pkm_user_session", JSON.stringify(sessionUser));
          localStorage.removeItem("estetica_logged_out");

          // Log access
          await databaseService.updateUserProfile(authUser.id, {
            ultimo_acesso: new Date().toISOString()
          });
        } else {
          throw new Error("Usuário ou senha incorretos.");
        }
      }
    } catch (err: any) {
      setError(err.message || "Erro ao realizar o login.");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (email: string, passwordOrToken: string, name: string, celular: string, empresa?: string) => {
    setError(null);
    setLoading(true);
    try {
      if (!email || !passwordOrToken || !name || !celular) {
        throw new Error("Por favor, preencha todos os campos obrigatórios.");
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanPhone = celular.trim();
      const cleanName = name.trim();
      let cleanUsername = cleanEmail.split("@")[0].replace(/[^a-z0-9]/g, "").toLowerCase();
      if (!cleanUsername) {
        cleanUsername = "user" + Math.floor(1000 + Math.random() * 9000);
      }

      // 1. Password validations
      if (passwordOrToken.length < 8) {
        throw new Error("A senha deve conter no mínimo 8 caracteres.");
      }
      if (!/[A-Z]/.test(passwordOrToken)) {
        throw new Error("A senha deve conter pelo menos uma letra maiúscula.");
      }
      if (!/[0-9]/.test(passwordOrToken)) {
        throw new Error("A senha deve conter pelo menos um número.");
      }

      // 2. Validate uniqueness of Email, Phone, and Username in public.users first (instant feedback)
      try {
        const checkRes = await fetch(`/api/auth/check-uniqueness?email=${encodeURIComponent(cleanEmail)}&username=${encodeURIComponent(cleanUsername)}&celular=${encodeURIComponent(cleanPhone)}`);
        if (checkRes.ok) {
          const check = await checkRes.json();
          if (check.emailExists) {
            throw new Error("Este e-mail já está em uso por outra conta.");
          }
          if (check.celularExists) {
            throw new Error("Este celular já está em uso por outra conta.");
          }
          if (check.usernameExists) {
            // Automatically append suffix instead of throwing error to ensure zero-friction registration!
            let uniqueUsername = cleanUsername;
            let suffix = 1;
            let exists = true;
            while (exists) {
              const uCheckRes = await fetch(`/api/auth/check-uniqueness?username=${encodeURIComponent(uniqueUsername + suffix)}`);
              if (uCheckRes.ok) {
                const innerCheck = await uCheckRes.json();
                if (!innerCheck.usernameExists) {
                  uniqueUsername = uniqueUsername + suffix;
                  exists = false;
                } else {
                  suffix++;
                }
              } else {
                uniqueUsername = uniqueUsername + suffix;
                exists = false;
              }
            }
            cleanUsername = uniqueUsername;
          }
        }
      } catch (checkErr: any) {
        if (checkErr.message?.includes("em uso")) {
          throw checkErr;
        }
        console.warn("Uniqueness check API failed, falling back to legacy check:", checkErr);
        const usersList = await databaseService.getSystemUsers().catch(() => []);
        if (usersList && usersList.length > 0) {
          const emailExists = usersList.some(u => u.email?.toLowerCase() === cleanEmail);
          if (emailExists) {
            throw new Error("Este e-mail já está em uso por outra conta.");
          }
          const phoneExists = usersList.some(u => u.celular === cleanPhone);
          if (phoneExists) {
            throw new Error("Este celular já está em uso por outra conta.");
          }
          const usernameExists = usersList.some(u => u.username?.toLowerCase() === cleanUsername);
          if (usernameExists) {
            throw new Error("Este nome de usuário já está em uso. Escolha outro.");
          }
        }
      }

      // 3. Register user with official Supabase Auth (with explicit redirect URLs for production)
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password: passwordOrToken,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            nome: cleanName,
            celular: cleanPhone,
            empresa: empresa?.trim() || ""
          }
        }
      });

      if (authErr) throw authErr;

      if (authData.user) {
        const userId = authData.user.id;
        const profilePayload = {
          id: userId,
          username: cleanUsername,
          nome: cleanName,
          role: "user" as const,
          email: cleanEmail,
          celular: cleanPhone,
          empresa: empresa?.trim() || null,
          status: "Aguardando Assinatura",
          plano_atual: "Plano Bronze",
          plano_status: "Inativo",
          plano_valor: 49.90,
          ultimo_acesso: new Date().toISOString()
        };

        // 4. Register profile row in public.users (Idempotent upsert logic to support partial signups)
        const { data: existingProfile } = await supabase
          .from("users")
          .select("*")
          .eq("id", userId)
          .maybeSingle();

        if (!existingProfile) {
          const { error: insertErr } = await supabase
            .from("users")
            .insert([profilePayload]);

          if (insertErr) {
            if (insertErr.code === "23505" || insertErr.message?.includes("duplicate key") || insertErr.message?.includes("already exists")) {
              console.log("Profile already exists in database during signup insert (duplicate key caught). Continuing...");
            } else {
              console.warn("Direct insert profile failed. Falling back to helper...", insertErr);
              await databaseService.insertSystemUser(profilePayload as any).catch(e => {
                console.warn("Helper insert failed during signup:", e);
              });
            }
          }
        } else {
          console.log("Profile already exists. Updating existing details...");
          const { error: updateErr } = await supabase
            .from("users")
            .update({
              nome: cleanName,
              celular: cleanPhone,
              empresa: empresa?.trim() || null,
              ultimo_acesso: new Date().toISOString()
            })
            .eq("id", userId);

          if (updateErr) {
            console.error("Failed to update profile during signup", updateErr);
          }
        }

        // Return user session
        const sessionUser: UserSession = {
          ...profilePayload,
          email_confirmado: !!authData.user.email_confirmed_at
        };

        setUser(sessionUser);
        localStorage.setItem("pkm_user_session", JSON.stringify(sessionUser));
        return authData.user;
      }
      throw new Error("Erro ao criar cadastro.");
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
      localStorage.setItem("estetica_logged_out", "true");
      localStorage.removeItem("pkm_user_session");
    } catch (err) {
      console.error("Logout error", err);
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    setError(null);
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Erro: Supabase não configurado.");
    }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/?reset=true"
    });
    if (err) throw err;
  };

  const resendConfirmationEmail = async (email: string) => {
    setError(null);
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("Erro: Supabase não configurado.");
    }
    const { error: err } = await supabase.auth.resend({
      type: "signup",
      email: email.trim()
    });
    if (err) throw err;
  };

  const updateProfile = async (payload: { nome?: string; empresa?: string; celular?: string; foto_url?: string; password?: string; email?: string }) => {
    setError(null);
    if (!user?.id) throw new Error("Usuário não autenticado.");

    // 1. Update Password or Email in Supabase Auth if provided
    if (payload.password || payload.email) {
      const authPayload: any = {};
      if (payload.password) authPayload.password = payload.password;
      if (payload.email) authPayload.email = payload.email;

      const { error: authErr } = await supabase.auth.updateUser(authPayload);
      if (authErr) throw authErr;
    }

    // 2. Update metadata in custom public.users profile table
    const profilePayload: any = {};
    if (payload.nome !== undefined) profilePayload.nome = payload.nome;
    if (payload.empresa !== undefined) profilePayload.empresa = payload.empresa;
    if (payload.celular !== undefined) profilePayload.celular = payload.celular;
    if (payload.foto_url !== undefined) profilePayload.foto_url = payload.foto_url;
    if (payload.email !== undefined) profilePayload.email = payload.email;
    if (payload.password !== undefined) profilePayload.must_change_password = false;

    if (Object.keys(profilePayload).length > 0 || payload.password !== undefined) {
      const updateData = { ...profilePayload };
      if (payload.password !== undefined) updateData.must_change_password = false;
      await databaseService.updateUserProfile(user.id, updateData);
    }

    // 3. Reload session state
    await reloadProfile();
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isDemo: false,
      login,
      signup,
      logout,
      resetPassword,
      resendConfirmationEmail,
      updateProfile,
      reloadProfile,
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
