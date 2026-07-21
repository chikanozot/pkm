/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { databaseService } from "../lib/databaseService.js";
import { useAuth } from "../contexts/AuthContext.js";
import { createClient } from "@supabase/supabase-js";
import { 
  Users, UserCheck, ShieldAlert, Ban, Landmark, TrendingUp, Sparkles, 
  Search, Shield, SlidersHorizontal, Eye, Edit, Trash2, Key, Calendar, Mail, Phone, 
  Briefcase, CheckCircle, AlertTriangle, FileText, Settings, CreditCard, RefreshCw, X, Save,
  Link, Copy, Check, UserPlus
} from "lucide-react";

export const UsersManagementScreen: React.FC = () => {
  const { user: currentUser } = useAuth();
  
  // Tabs
  const [activeSubTab, setActiveSubTab] = useState<"stats" | "users" | "logs" | "settings">("stats");

  // Global database lists
  const [users, setUsers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPlan, setFilterPlan] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPayment, setFilterPayment] = useState("");
  const [filterGateway, setFilterGateway] = useState("");

  // SaaS Settings states
  const [settingsId, setSettingsId] = useState("");
  const [saasName, setSaasName] = useState("LUMORA Flow");
  const [logoUrl, setLogoUrl] = useState("");
  const [bronzePrice, setBronzePrice] = useState(49.90);
  const [prataPrice, setPrataPrice] = useState(99.90);
  const [ouroPrice, setOuroPrice] = useState(149.90);
  const [diasGarantia, setDiasGarantia] = useState(7);
  const [garantiaActiva, setGarantiaActiva] = useState(true);
  const [novosAtivos, setNovosAtivos] = useState(true);
  const [msgInicial, setMsgInicial] = useState("");
  const [stripePublicKey, setStripePublicKey] = useState("");
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [planoPrataAtivo, setPlanoPrataAtivo] = useState(true);
  const [planoOuroAtivo, setPlanoOuroAtivo] = useState(true);
  const [whatsappApi, setWhatsappApi] = useState("");
  const [googleId, setGoogleId] = useState("");
  const [googleSecret, setGoogleSecret] = useState("");

  // Selected User Modal / Action state
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [actionFormType, setActionFormType] = useState<"edit" | "password" | "plan" | "status" | "delete" | "manual_payment" | "stripe_link" | "none">("none");
  
  // Action Form fields
  const [editNome, setEditNome] = useState("");
  const [editEmpresa, setEditEmpresa] = useState("");
  const [editCelular, setEditCelular] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("user");
  const [newPass, setNewPass] = useState("");
  const [changePlanName, setChangePlanName] = useState("Plano Bronze");
  const [changePlanPrice, setChangePlanPrice] = useState(49.90);
  const [changeStatus, setChangeStatus] = useState("Aguardando Assinatura");

  // Manual payment state fields
  const [manualStartDate, setManualStartDate] = useState("");
  const [manualEndDate, setManualEndDate] = useState("");
  const [manualPlanName, setManualPlanName] = useState("Plano Bronze");
  const [manualPlanPrice, setManualPlanPrice] = useState(49.90);

  // Stripe checkout link state fields
  const [stripePlanName, setStripePlanName] = useState("Plano Bronze");
  const [generatedStripeLink, setGeneratedStripeLink] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  // Create User Manual state fields
  const [createNome, setCreateNome] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createCelular, setCreateCelular] = useState("");
  const [createSenha, setCreateSenha] = useState("");
  const [createPlano, setCreatePlano] = useState("Plano Bronze");
  const [createDataInicio, setCreateDataInicio] = useState(new Date().toISOString().split("T")[0]);
  const [createPeriodoAcesso, setCreatePeriodoAcesso] = useState(1); // months
  const [createDataVencimento, setCreateDataVencimento] = useState("");
  const [createMetodoPagamento, setCreateMetodoPagamento] = useState("Manual (Pix)");
  const [createObservacoes, setCreateObservacoes] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createdUserCredentials, setCreatedUserCredentials] = useState<any | null>(null);
  const [copiedCredentials, setCopiedCredentials] = useState(false);

  // Auto-calculate manual due date when start date or period changes
  useEffect(() => {
    if (!createDataInicio) return;
    try {
      const start = new Date(createDataInicio + "T12:00:00");
      const end = new Date(start);
      end.setMonth(end.getMonth() + Number(createPeriodoAcesso));
      setCreateDataVencimento(end.toISOString().split("T")[0]);
    } catch (e) {
      console.error("Error computing vencimento date", e);
    }
  }, [createDataInicio, createPeriodoAcesso]);

  const generateTemporaryPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    let pwd = "";
    const uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lowers = "abcdefghijkmnopqrstuvwxyz";
    const numbers = "23456789";
    pwd += uppers.charAt(Math.floor(Math.random() * uppers.length));
    pwd += lowers.charAt(Math.floor(Math.random() * lowers.length));
    pwd += numbers.charAt(Math.floor(Math.random() * numbers.length));
    
    for (let i = 0; i < 7; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    pwd = pwd.split('').sort(() => 0.5 - Math.random()).join('');
    setCreateSenha(pwd);
  };

  useEffect(() => {
    loadData();
  }, [currentUser?.id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Users
      const fetchedUsers = await databaseService.getSystemUsers(currentUser?.id);
      setUsers(fetchedUsers || []);

      // 2. Fetch Logs
      const fetchedLogs = await databaseService.getSaaSLogs();
      setLogs(fetchedLogs || []);

      // 3. Fetch SaaS Settings
      const saasSettings = await databaseService.getSaaSSettings();
      if (saasSettings) {
        setSettingsId(saasSettings.id);
        setSaasName(saasSettings.saas_name || "LUMORA Flow");
        setLogoUrl(saasSettings.logo_url || "");
        setBronzePrice(Number(saasSettings.plano_bronze_valor) || 49.90);
        setPrataPrice(Number(saasSettings.plano_prata_valor) || 99.90);
        setOuroPrice(Number(saasSettings.plano_ouro_valor) || 149.90);
        setDiasGarantia(saasSettings.dias_garantia || 7);
        setGarantiaActiva(saasSettings.garantia_ativa ?? true);
        setNovosAtivos(saasSettings.novos_cadastros_ativos ?? true);
        setMsgInicial(saasSettings.mensagem_inicial || "");
        setStripePublicKey(saasSettings.mercado_pago_public_key || "");
        setStripeSecretKey(saasSettings.mercado_pago_access_token || "");
        const configGerais = saasSettings.configuracoes_gerais || {};
        setPlanoPrataAtivo(configGerais.plano_prata_ativo !== false);
        setPlanoOuroAtivo(configGerais.plano_ouro_ativo !== false);
        setWhatsappApi(saasSettings.whatsapp_api_key || "");
        setGoogleId(saasSettings.google_calendar_client_id || "");
        setGoogleSecret(saasSettings.google_calendar_client_secret || "");
      }
    } catch (err: any) {
      setError("Erro ao carregar os dados administrativos. Verifique se a migração SQL foi aplicada.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSystemUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!createNome.trim()) throw new Error("O nome completo da cliente é obrigatório.");
      if (!createEmail.trim()) throw new Error("O e-mail da cliente é obrigatório.");
      if (!createSenha.trim() || createSenha.length < 8) {
        throw new Error("A senha temporária deve conter no mínimo 8 caracteres.");
      }

      // Check for duplicate emails
      const emailExists = users.some(u => u.email?.toLowerCase() === createEmail.trim().toLowerCase());
      if (emailExists) {
        throw new Error("Este endereço de e-mail já está cadastrado no sistema.");
      }

      const rawUrl = (import.meta as any).env?.VITE_SUPABASE_URL || "";
      const rawKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "";
      
      if (!rawUrl || !rawKey) {
        throw new Error("Configurações do Supabase não encontradas. Verifique as variáveis de ambiente.");
      }

      // Create temporary client to sign up the user securely
      const tempSupabase = createClient(rawUrl, rawKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });

      const { data: authData, error: authErr } = await tempSupabase.auth.signUp({
        email: createEmail.trim().toLowerCase(),
        password: createSenha,
        options: {
          data: {
            nome: createNome.trim(),
            celular: createCelular.trim() || ""
          }
        }
      });

      if (authErr) throw authErr;
      if (!authData.user) {
        throw new Error("Não foi possível criar o registro de autenticação do usuário.");
      }

      const startIso = new Date(createDataInicio + "T12:00:00").toISOString();
      const endIso = new Date(createDataVencimento + "T12:00:00").toISOString();
      const planPrice = createPlano === "Plano Bronze" ? bronzePrice : createPlano === "Plano Prata" ? prataPrice : ouroPrice;

      const userPayload = {
        id: authData.user.id,
        username: createEmail.trim().toLowerCase().split("@")[0] + Math.random().toString(36).substring(2, 6),
        password_hash: "auth_managed",
        nome: createNome.trim(),
        role: "user" as const,
        email: createEmail.trim().toLowerCase(),
        celular: createCelular.trim() || null,
        status: "Assinatura Ativa",
        created_by: "admin",
        must_change_password: true,
        observacoes_admin: createObservacoes.trim() || null,
        plano_atual: createPlano,
        plano_status: "Ativo",
        plano_valor: planPrice,
        plano_data_contratacao: startIso,
        plano_data_renovacao: endIso,
        plano_data_vencimento: endIso,
        plano_gateway: "manual",
        plano_ultimo_pagamento: startIso,
        plano_proximo_pagamento: endIso,
        situacao_pagamento: "Pago"
      };

      await databaseService.insertSystemUser(userPayload, currentUser?.id);

      // Register activity log
      await databaseService.logSaaSAction({
        admin_id: currentUser?.id,
        admin_nome: currentUser?.nome || "Administrador Master",
        acao: `Criou usuário manualmente: ${createNome.trim()} (${createEmail.trim().toLowerCase()}) | Plano: ${createPlano} | Início: ${createDataInicio} | Vencimento: ${createDataVencimento} | Pagamento: ${createMetodoPagamento} | Observações: ${createObservacoes.trim() || "Nenhuma"}`,
        user_id: authData.user.id,
        user_nome: createNome.trim()
      });

      // Save credentials for the screen display
      setCreatedUserCredentials({
        nome: createNome.trim(),
        email: createEmail.trim().toLowerCase(),
        senha: createSenha,
        plano: createPlano,
        dataInicio: createDataInicio,
        dataVencimento: createDataVencimento,
        metodoPagamento: createMetodoPagamento
      });

      setSuccess("Nova conta de cliente criada com sucesso!");
      
      // Clear forms
      setCreateNome("");
      setCreateEmail("");
      setCreateCelular("");
      setCreateSenha("");
      setCreatePlano("Plano Bronze");
      setCreateObservacoes("");
      setCreateMetodoPagamento("Manual (Pix)");

      // Reload
      await loadData();

    } catch (err: any) {
      setError(err.message || "Erro ao criar conta de usuário.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSaaSSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const existingSettings = await databaseService.getSaaSSettings();
      const existingConfig = existingSettings?.configuracoes_gerais || {};

      const payload = {
        saas_name: saasName,
        logo_url: logoUrl,
        plano_bronze_valor: Number(bronzePrice),
        plano_prata_valor: Number(prataPrice),
        plano_ouro_valor: Number(ouroPrice),
        dias_garantia: Number(diasGarantia),
        garantia_ativa: garantiaActiva,
        novos_cadastros_ativos: novosAtivos,
        mensagem_inicial: msgInicial,
        mercado_pago_public_key: stripePublicKey,
        mercado_pago_access_token: stripeSecretKey,
        whatsapp_api_key: whatsappApi,
        google_calendar_client_id: googleId,
        google_calendar_client_secret: googleSecret,
        configuracoes_gerais: {
          ...existingConfig,
          plano_prata_ativo: planoPrataAtivo,
          plano_ouro_ativo: planoOuroAtivo
        }
      };

      await databaseService.updateSaaSSettings(settingsId, payload);
      
      // Log setting update
      await databaseService.logSaaSAction({
        admin_id: currentUser?.id,
        admin_nome: currentUser?.nome,
        acao: "Atualizou as configurações globais do SaaS"
      });

      setSuccess("Configurações do SaaS salvas com sucesso!");
      loadData();
    } catch (err) {
      setError("Erro ao salvar configurações do SaaS.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenUserActions = (user: any) => {
    setSelectedUser(user);
    setEditNome(user.nome || "");
    setEditEmpresa(user.empresa || "");
    setEditCelular(user.celular || "");
    setEditEmail(user.email || "");
    setEditRole(user.role || "user");
    setChangePlanName(user.plano_atual || "Plano Bronze");
    setChangePlanPrice(Number(user.plano_valor) || 49.90);
    setChangeStatus(user.status || "Aguardando Assinatura");
    
    // Default manual payment values
    setManualPlanName(user.plano_atual || "Plano Bronze");
    setManualPlanPrice(Number(user.plano_valor) || 49.90);
    const todayStr = new Date().toISOString().split("T")[0];
    setManualStartDate(todayStr);
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    setManualEndDate(nextMonth.toISOString().split("T")[0]);

    setActionFormType("none");
    setIsActionModalOpen(true);
  };

  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setLoading(true);
    setError(null);
    try {
      const payload = {
        nome: editNome.trim(),
        empresa: editEmpresa.trim() || null,
        celular: editCelular.trim() || null,
        email: editEmail.trim() || null,
        role: editRole,
        username: selectedUser.username // Keep existing
      };

      await databaseService.updateSystemUser(selectedUser.id, payload);

      // Log action
      await databaseService.logSaaSAction({
        admin_id: currentUser?.id,
        admin_nome: currentUser?.nome,
        acao: `Editou os dados de perfil do usuário`,
        user_id: selectedUser.id,
        user_nome: editNome
      });

      setSuccess("Perfil de usuário atualizado com sucesso!");
      setIsActionModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message || "Erro ao atualizar usuário.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !newPass) return;
    setLoading(true);
    setError(null);
    try {
      await databaseService.updateSystemUser(selectedUser.id, {
        username: selectedUser.username,
        nome: selectedUser.nome,
        role: selectedUser.role,
        password_hash: newPass
      });

      // Log
      await databaseService.logSaaSAction({
        admin_id: currentUser?.id,
        admin_nome: currentUser?.nome,
        acao: "Alterou a senha do usuário administrativamente",
        user_id: selectedUser.id,
        user_nome: selectedUser.nome
      });

      setSuccess("Senha redefinida com sucesso!");
      setIsActionModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message || "Erro ao redefinir senha.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUserPlan = async () => {
    if (!selectedUser) return;
    setLoading(true);
    try {
      const updates = {
        username: selectedUser.username,
        nome: selectedUser.nome,
        role: selectedUser.role,
        plano_atual: changePlanName,
        plano_valor: Number(changePlanPrice)
      };

      await databaseService.updateSystemUser(selectedUser.id, updates, currentUser?.id);

      // Log
      await databaseService.logSaaSAction({
        admin_id: currentUser?.id,
        admin_nome: currentUser?.nome,
        acao: `Alterou o plano do usuário para ${changePlanName} (R$ ${Number(changePlanPrice).toFixed(2)})`,
        user_id: selectedUser.id,
        user_nome: selectedUser.nome
      });

      setSuccess("Plano de assinatura do usuário atualizado!");
      setIsActionModalOpen(false);
      loadData();
    } catch (err) {
      setError("Erro ao atualizar o plano.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUserStatus = async (status: string) => {
    if (!selectedUser) return;
    setLoading(true);
    try {
      const now = new Date();
      const updates: any = {
        username: selectedUser.username,
        nome: selectedUser.nome,
        role: selectedUser.role,
        status: status
      };

      // If active, renew plan dates automatically
      if (status === "Assinatura Ativa") {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        updates.plano_status = "Ativo";
        updates.plano_data_renovacao = nextMonth.toISOString();
        updates.plano_data_vencimento = nextMonth.toISOString();
        updates.situacao_pagamento = "Pago";
      } else if (status === "Assinatura Vencida" || status === "Assinatura Cancelada" || status === "Inadimplente") {
        updates.plano_status = "Inativo";
        updates.situacao_pagamento = "Pendente";
      }

      await databaseService.updateSystemUser(selectedUser.id, updates, currentUser?.id);

      // Log
      await databaseService.logSaaSAction({
        admin_id: currentUser?.id,
        admin_nome: currentUser?.nome,
        acao: `Alterou o status da conta para: ${status}`,
        user_id: selectedUser.id,
        user_nome: selectedUser.nome
      });

      setSuccess(`Status da conta alterado para ${status}!`);
      setIsActionModalOpen(false);
      loadData();
    } catch (err) {
      setError("Erro ao atualizar o status da conta.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    if (selectedUser.role === "master") {
      setError("Não é permitido excluir usuários com nível de acesso Administrador MASTER.");
      return;
    }
    setLoading(true);
    try {
      await databaseService.deleteSystemUser(selectedUser.id, currentUser?.id);

      // Log
      await databaseService.logSaaSAction({
        admin_id: currentUser?.id,
        admin_nome: currentUser?.nome,
        acao: `Excluiu permanentemente a conta do usuário do banco de dados`,
        user_id: selectedUser.id,
        user_nome: selectedUser.nome
      });

      setSuccess("Usuário excluído com sucesso!");
      setIsActionModalOpen(false);
      loadData();
    } catch (err) {
      setError("Erro ao deletar o usuário.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualStartDateChange = (val: string) => {
    setManualStartDate(val);
    if (val) {
      const start = new Date(val + "T12:00:00");
      const end = new Date(start);
      end.setDate(end.getDate() + 30);
      setManualEndDate(end.toISOString().split("T")[0]);
    }
  };

  const handleSaveManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (currentUser?.role !== "master") {
      setError("Apenas administradores master autorizados possuem permissão para realizar ativações manuais.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const startIso = new Date(manualStartDate + "T00:00:00").toISOString();
      const endIso = new Date(manualEndDate + "T23:59:59").toISOString();

      const isRenewal = selectedUser.plano_gateway === "manual" && selectedUser.plano_status === "Ativo";

      const updates = {
        status: "Assinatura Ativa",
        plano_atual: manualPlanName,
        plano_status: "Ativo",
        plano_valor: Number(manualPlanPrice),
        plano_data_contratacao: startIso,
        plano_data_vencimento: endIso,
        plano_data_renovacao: endIso,
        plano_gateway: "manual",
        plano_ultimo_pagamento: new Date().toISOString(),
        plano_proximo_pagamento: endIso,
        situacao_pagamento: "Pago"
      };

      await databaseService.updateUserProfile(selectedUser.id, updates, currentUser?.id);

      // Audit logs in saas_logs
      const actionDesc = isRenewal 
        ? `Renovou manualmente o plano para ${manualPlanName} (Início: ${manualStartDate}, Término: ${manualEndDate})`
        : `Ativou manualmente o plano para ${manualPlanName} (Início: ${manualStartDate}, Término: ${manualEndDate})`;

      await databaseService.logSaaSAction({
        admin_id: currentUser?.id,
        admin_nome: currentUser?.nome,
        acao: actionDesc,
        user_id: selectedUser.id,
        user_nome: selectedUser.nome
      });

      setSuccess(isRenewal ? "Renovação manual processada com sucesso!" : "Ativação manual processada com sucesso!");
      setIsActionModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message || "Erro ao processar ativação manual.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateStripeLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (currentUser?.role !== "master") {
      setError("Apenas administradores master autorizados possuem permissão para gerar links Stripe.");
      return;
    }
    const link = `${window.location.origin}/?checkout_stripe=true&plan=${encodeURIComponent(stripePlanName)}&userId=${selectedUser.id}`;
    setGeneratedStripeLink(link);
    setLinkCopied(false);
  };

  // Computation of dynamic stats metrics
  const totalUsersCount = users.length;
  const activeUsersCount = users.filter(u => u.status === "Assinatura Ativa").length;
  const blockedUsersCount = users.filter(u => u.status === "Conta Bloqueada" || u.status === "Conta Suspensa").length;
  const waitingUsersCount = users.filter(u => u.status === "Aguardando Assinatura" || !u.status).length;
  const delinquentUsersCount = users.filter(u => u.status === "Inadimplente" || u.status === "Assinatura Vencida").length;
  const cancelledUsersCount = users.filter(u => u.status === "Assinatura Cancelada").length;

  const monthlyRevenueEst = users
    .filter(u => u.status === "Assinatura Ativa")
    .reduce((sum, u) => sum + (Number(u.plano_valor) || 0), 0);

  const annualRevenueEst = monthlyRevenueEst * 12;

  // New signups count (created_at in last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const newSignupsCount = users.filter(u => new Date(u.created_at) >= thirtyDaysAgo).length;

  // Filtered users for data table
  const filteredUsers = users.filter((u) => {
    const searchString = `${u.nome || ""} ${u.empresa || ""} ${u.email || ""} ${u.username || ""}`.toLowerCase();
    const matchesSearch = searchString.includes(searchQuery.toLowerCase());
    
    const matchesPlan = filterPlan ? (u.plano_atual === filterPlan) : true;
    const matchesStatus = filterStatus ? (u.status === filterStatus) : true;
    const matchesPayment = filterPayment ? (u.situacao_pagamento === filterPayment) : true;
    const matchesGateway = filterGateway ? (
      filterGateway === "manual" ? u.plano_gateway === "manual" : u.plano_gateway !== "manual"
    ) : true;

    return matchesSearch && matchesPlan && matchesStatus && matchesPayment && matchesGateway;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner with Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-medium tracking-tight text-stone-950 inline-flex items-center gap-2">
            <Shield className="w-8 h-8 text-rose-500 shrink-0" />
            Painel MASTER SaaS
          </h1>
          <p className="text-stone-500 text-xs sm:text-sm mt-1">
            Métricas gerais de faturamento, controle absoluto de usuários, histórico de logs e parametrizações globais do sistema.
          </p>
        </div>

        {/* Master sub-tabs */}
        <div className="inline-flex rounded-xl bg-stone-100 p-1 border border-stone-200 shadow-sm self-start lg:self-center">
          <button
            onClick={() => setActiveSubTab("stats")}
            className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
              activeSubTab === "stats" ? "bg-white text-stone-900 shadow" : "text-stone-500 hover:text-stone-900"
            }`}
          >
            Métricas
          </button>
          <button
            onClick={() => setActiveSubTab("users")}
            className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
              activeSubTab === "users" ? "bg-white text-stone-900 shadow" : "text-stone-500 hover:text-stone-900"
            }`}
          >
            Clientes SaaS
          </button>
          <button
            onClick={() => setActiveSubTab("logs")}
            className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
              activeSubTab === "logs" ? "bg-white text-stone-900 shadow" : "text-stone-500 hover:text-stone-900"
            }`}
          >
            Auditoria / Logs
          </button>
          <button
            onClick={() => setActiveSubTab("settings")}
            className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-all ${
              activeSubTab === "settings" ? "bg-white text-stone-900 shadow" : "text-stone-500 hover:text-stone-900"
            }`}
          >
            Configurações
          </button>
        </div>
      </div>

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2.5 font-semibold">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-stone-450 hover:text-stone-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2.5 font-semibold">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-stone-450 hover:text-stone-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* RENDER MASTER VIEWS */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-rose-500 border-t-transparent" />
          <p className="mt-3 text-sm text-stone-500 font-semibold">Sincronizando Banco de Dados Master...</p>
        </div>
      ) : (
        <>
          {/* TAB 1: OVERALL METRICS DASHBOARD */}
          {activeSubTab === "stats" && (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-stone-400">Total Usuários</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-2xl font-extrabold text-stone-900">{totalUsersCount}</span>
                    <span className="text-[10px] text-stone-450">contas</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-600">Assinaturas Ativas</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-2xl font-extrabold text-emerald-700">{activeUsersCount}</span>
                    <span className="text-[10px] text-stone-450">ativas</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-amber-500">Inadimplentes</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-2xl font-extrabold text-amber-700">{delinquentUsersCount}</span>
                    <span className="text-[10px] text-stone-450">atrasos</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-stone-450">Aguardando Plano</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-2xl font-extrabold text-stone-700">{waitingUsersCount}</span>
                    <span className="text-[10px] text-stone-400">novos</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-rose-500">Contas Bloqueadas</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-2xl font-extrabold text-rose-700">{blockedUsersCount}</span>
                    <span className="text-[10px] text-stone-400">bloq.</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col justify-between col-span-2 sm:col-span-1">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-stone-500">Novos Cadastro (30d)</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-2xl font-extrabold text-stone-800">+{newSignupsCount}</span>
                    <span className="text-[10px] text-stone-450">registros</span>
                  </div>
                </div>
              </div>

              {/* Estimate Revenue Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-emerald-950/5 border border-emerald-900/10 rounded-3xl p-6 shadow-sm relative overflow-hidden">
                  <div className="absolute right-4 top-4 w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <span className="text-xs uppercase font-bold text-emerald-800 tracking-wider">Faturamento Mensal Estimado</span>
                  <h3 className="text-4xl font-black text-emerald-950 mt-3 font-mono">
                    R$ {monthlyRevenueEst.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h3>
                  <p className="text-xs text-emerald-700 mt-2">
                    Calculado com base nas assinaturas do plano atual de todos os usuários com status <strong>Assinatura Ativa</strong>.
                  </p>
                </div>

                <div className="bg-stone-900 text-white rounded-3xl p-6 shadow-lg relative overflow-hidden">
                  <div className="absolute right-4 top-4 w-12 h-12 rounded-2xl bg-stone-800 flex items-center justify-center text-rose-500">
                    <Landmark className="w-6 h-6" />
                  </div>
                  <span className="text-xs uppercase font-bold text-stone-400 tracking-wider">Estimativa Anualizada</span>
                  <h3 className="text-4xl font-black text-rose-500 mt-3 font-mono">
                    R$ {annualRevenueEst.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h3>
                  <p className="text-xs text-stone-400 mt-2">
                    Projeção estática para os próximos 12 meses, considerando a base recorrente atual sem novos churns.
                  </p>
                </div>
              </div>

              {/* Sub table of recent logins */}
              <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-stone-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wide">Últimos Acessos ao Sistema</h3>
                  <span className="px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 text-[10px] font-bold">Histórico Recente</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-200 text-[10px] uppercase font-bold text-stone-400">
                        <th className="p-4">Cliente</th>
                        <th className="p-4">Empresa</th>
                        <th className="p-4">E-mail</th>
                        <th className="p-4">Último Acesso</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 text-xs">
                      {users
                        .filter(u => u.ultimo_acesso)
                        .sort((a,b) => new Date(b.ultimo_acesso).getTime() - new Date(a.ultimo_acesso).getTime())
                        .slice(0, 5)
                        .map((u) => (
                          <tr key={u.id} className="hover:bg-stone-50/50">
                            <td className="p-4 font-semibold text-stone-900">{u.nome}</td>
                            <td className="p-4 text-stone-500">{u.empresa || "—"}</td>
                            <td className="p-4 font-mono text-stone-500 text-[11px]">{u.email || (u.username + "@pkm.com")}</td>
                            <td className="p-4 font-semibold text-stone-700">
                              {new Date(u.ultimo_acesso).toLocaleDateString("pt-BR")} às {new Date(u.ultimo_acesso).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: USER DIRECTORY AND ACCOUNT MGMT */}
          {activeSubTab === "users" && (
            <div className="space-y-4">
              {/* Header with Create User Button */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
                <div>
                  <h3 className="font-serif text-lg font-semibold text-stone-900">Diretório de Clientes</h3>
                  <p className="text-stone-500 text-xs mt-0.5">Gerencie os usuários, planos, status e acessos das clientes no Lumora Flow.</p>
                </div>
                <button
                  onClick={() => {
                    setCreatedUserCredentials(null);
                    setSuccess(null);
                    setError(null);
                    setIsCreateModalOpen(true);
                    generateTemporaryPassword();
                  }}
                  className="inline-flex items-center gap-2 cursor-pointer bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-md hover:shadow-lg active:scale-98 transition-all shrink-0 self-start sm:self-auto"
                >
                  <UserPlus className="w-4 h-4" />
                  Criar Novo Usuário
                </button>
              </div>

              {/* Search & Filters block */}
              <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {/* Search text input */}
                  <div className="md:col-span-2 relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                      <Search className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar por nome, empresa, e-mail ou username..."
                      className="pl-10 block w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all shadow-sm"
                    />
                  </div>

                  {/* Plan Filter */}
                  <div>
                    <select
                      value={filterPlan}
                      onChange={(e) => setFilterPlan(e.target.value)}
                      className="block w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs focus:border-rose-500 focus:outline-none transition-all shadow-sm"
                    >
                      <option value="">Todos os Planos</option>
                      <option value="Plano Bronze">Plano STANDART</option>
                      <option value="Plano Prata">Plano Prata</option>
                      <option value="Plano Ouro">Plano Ouro</option>
                    </select>
                  </div>

                  {/* Status Filter */}
                  <div>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="block w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs focus:border-rose-500 focus:outline-none transition-all shadow-sm"
                    >
                      <option value="">Todos os Status</option>
                      <option value="Assinatura Ativa">Assinatura Ativa</option>
                      <option value="Aguardando Assinatura">Aguardando Assinatura</option>
                      <option value="Assinatura Vencida">Assinatura Vencida</option>
                      <option value="Inadimplente">Inadimplente</option>
                      <option value="Assinatura Cancelada">Assinatura Cancelada</option>
                      <option value="Conta Bloqueada">Conta Bloqueada</option>
                      <option value="Conta Suspensa">Conta Suspensa</option>
                    </select>
                  </div>

                  {/* Gateway Filter */}
                  <div>
                    <select
                      value={filterGateway}
                      onChange={(e) => setFilterGateway(e.target.value)}
                      className="block w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs focus:border-rose-500 focus:outline-none transition-all shadow-sm"
                    >
                      <option value="">Todos os Gateways</option>
                      <option value="stripe">Stripe</option>
                      <option value="manual">Manual</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Main Directory Table */}
              <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-200 text-[10px] uppercase font-bold text-stone-400">
                        <th className="p-4">Cliente / Empresa</th>
                        <th className="p-4">Contatos</th>
                        <th className="p-4">Plano</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Financeiro</th>
                        <th className="p-4">Origem</th>
                        <th className="p-4">Cadastro / Expiração</th>
                        <th className="p-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 text-xs">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-12 text-center text-stone-500 font-medium">
                            Nenhum usuário encontrado correspondente aos filtros.
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((usr) => (
                          <tr key={usr.id} className="hover:bg-stone-50/30">
                            {/* Profile Info */}
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center font-bold text-rose-500 uppercase text-xs border border-stone-200">
                                  {usr.nome ? usr.nome.charAt(0) : "?"}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-stone-900 truncate leading-tight">{usr.nome}</p>
                                  <p className="text-[10px] text-stone-450 truncate mt-0.5">{usr.empresa || "Individual"}</p>
                                </div>
                              </div>
                            </td>

                            {/* Contacts */}
                            <td className="p-4">
                              <p className="font-mono text-stone-600 text-[11px] leading-tight">{usr.email || "—"}</p>
                              <p className="text-stone-450 mt-0.5 text-[10px]">{usr.celular || "—"}</p>
                            </td>

                            {/* Plan details */}
                            <td className="p-4 font-semibold text-stone-700">
                              <p className="leading-tight">{(usr.plano_atual === "Plano Bronze" || usr.plano_atual === "Bronze" || !usr.plano_atual) ? "STANDART" : usr.plano_atual.replace("Plano ", "")}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[10px] text-stone-400">R$ {Number(usr.plano_valor || 49.90).toFixed(2)}</span>
                                <span className={`text-[9px] px-1 py-0.2 rounded font-bold border ${
                                  usr.plano_gateway === "manual" 
                                    ? "bg-stone-100 text-stone-600 border-stone-200" 
                                    : "bg-blue-50 text-blue-600 border-blue-100"
                                }`}>
                                  {usr.plano_gateway === "manual" ? "Manual" : "Stripe"}
                                </span>
                              </div>
                            </td>

                            {/* Status Pill */}
                            <td className="p-4">
                              <span className={`px-2.5 py-0.5 rounded-full font-bold text-[9px] uppercase ${
                                usr.status === "Assinatura Ativa" 
                                  ? "bg-emerald-100 text-emerald-800"
                                  : usr.status === "Aguardando Assinatura"
                                  ? "bg-stone-100 text-stone-600"
                                  : usr.status === "Conta Bloqueada" || usr.status === "Conta Suspensa"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}>
                                {usr.status || "Pendente"}
                              </span>
                            </td>

                            {/* Payment Status */}
                            <td className="p-4 font-medium">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                usr.situacao_pagamento === "Pago" 
                                  ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                                  : "bg-amber-50 text-amber-600 border border-amber-100"
                              }`}>
                                {usr.situacao_pagamento || "Pendente"}
                              </span>
                            </td>

                            {/* Origin */}
                            <td className="p-4">
                              {usr.created_by === "admin" ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-100 leading-none">
                                  <Shield className="w-3 h-3 text-purple-500" /> Admin
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold bg-stone-50 text-stone-500 border border-stone-200 leading-none">
                                  <Users className="w-3 h-3 text-stone-400" /> Autocadastro
                                </span>
                              )}
                            </td>

                            {/* Dates */}
                            <td className="p-4 text-stone-600 leading-normal">
                              <p className="text-[10px]">Cad: <span className="font-mono">{new Date(usr.created_at).toLocaleDateString("pt-BR")}</span></p>
                              <p className="text-[10px]">Exp: <span className="font-mono text-stone-500">{usr.plano_data_vencimento ? new Date(usr.plano_data_vencimento).toLocaleDateString("pt-BR") : "—"}</span></p>
                            </td>

                            {/* Actions Trigger button */}
                            <td className="p-4 text-right">
                              <button
                                onClick={() => handleOpenUserActions(usr)}
                                className="inline-flex items-center gap-1 bg-stone-900 hover:bg-rose-600 text-white font-bold text-[10px] py-1.5 px-3 rounded-lg transition-all shadow-sm cursor-pointer"
                              >
                                <SlidersHorizontal className="w-3 h-3" /> Gerenciar
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: AUDITORING HISTORY LOGS */}
          {activeSubTab === "logs" && (
            <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-stone-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wide">Logs Administrativos do SaaS</h3>
                <span className="px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 text-[10px] font-bold">Rastreabilidade Rígida</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-[10px] uppercase font-bold text-stone-400">
                      <th className="p-4">Data/Hora</th>
                      <th className="p-4">Administrador</th>
                      <th className="p-4">Ação Executada</th>
                      <th className="p-4">Destinatário / Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-xs">
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-12 text-center text-stone-500 font-medium">
                          Nenhum log registrado até o momento.
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className="hover:bg-stone-50/30">
                          <td className="p-4 font-mono text-stone-500 text-[11px]">
                            {new Date(log.created_at).toLocaleDateString("pt-BR")} às {new Date(log.created_at).toLocaleTimeString("pt-BR")}
                          </td>
                          <td className="p-4 font-semibold text-stone-800">{log.admin_nome || "Sistema"}</td>
                          <td className="p-4 text-stone-700 font-medium">{log.acao}</td>
                          <td className="p-4 font-semibold text-rose-600">
                            {log.user_nome ? `${log.user_nome}` : "SaaS Geral"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: SAAS GLOBAL PARAMETER SETTINGS */}
          {activeSubTab === "settings" && (
            <form onSubmit={handleSaveSaaSSettings} className="bg-white rounded-3xl border border-stone-200 shadow-sm p-6 space-y-6">
              <div className="border-b border-stone-100 pb-4">
                <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wide">Parametrização de Negócio</h3>
                <p className="text-stone-500 text-xs mt-1">Configure o nome da plataforma, precificação padrão e regras de novos usuários.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">Nome Comercial do SaaS</label>
                  <input
                    type="text"
                    required
                    value={saasName}
                    onChange={(e) => setSaasName(e.target.value)}
                    className="block w-full rounded-xl border border-stone-200 px-3.5 py-2 text-xs focus:border-rose-500 focus:outline-none transition-all shadow-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">URL Logotipo (.png/.svg)</label>
                  <input
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://exemplo.com/logo.png"
                    className="block w-full rounded-xl border border-stone-200 px-3.5 py-2 text-xs focus:border-rose-500 focus:outline-none transition-all shadow-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">Preço Plano STANDART (R$ / mês)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={bronzePrice}
                    onChange={(e) => setBronzePrice(Number(e.target.value))}
                    className="block w-full rounded-xl border border-stone-200 px-3.5 py-2 text-xs focus:border-rose-500 focus:outline-none transition-all shadow-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">Preço Plano Prata (R$ / mês)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={prataPrice}
                    onChange={(e) => setPrataPrice(Number(e.target.value))}
                    className="block w-full rounded-xl border border-stone-200 px-3.5 py-2 text-xs focus:border-rose-500 focus:outline-none transition-all shadow-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">Preço Plano Ouro (R$ / mês)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={ouroPrice}
                    onChange={(e) => setOuroPrice(Number(e.target.value))}
                    className="block w-full rounded-xl border border-stone-200 px-3.5 py-2 text-xs focus:border-rose-500 focus:outline-none transition-all shadow-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">Dias de Garantia / Teste Grátis</label>
                  <input
                    type="number"
                    required
                    value={diasGarantia}
                    onChange={(e) => setDiasGarantia(Number(e.target.value))}
                    className="block w-full rounded-xl border border-stone-200 px-3.5 py-2 text-xs focus:border-rose-500 focus:outline-none transition-all shadow-sm font-mono"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 border-t border-stone-100 pt-5">
                <label className="inline-flex items-center text-xs font-semibold text-stone-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={garantiaActiva}
                    onChange={(e) => setGarantiaActiva(e.target.checked)}
                    className="rounded border-stone-300 text-rose-600 focus:ring-rose-500 mr-2 h-4.5 w-4.5 cursor-pointer"
                  />
                  Habilitar teste grátis
                </label>

                <label className="inline-flex items-center text-xs font-semibold text-stone-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={novosAtivos}
                    onChange={(e) => setNovosAtivos(e.target.checked)}
                    className="rounded border-stone-300 text-rose-600 focus:ring-rose-500 mr-2 h-4.5 w-4.5 cursor-pointer"
                  />
                  Habilitar novas contas
                </label>

                <label className="inline-flex items-center text-xs font-semibold text-stone-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={planoPrataAtivo}
                    onChange={(e) => setPlanoPrataAtivo(e.target.checked)}
                    className="rounded border-stone-300 text-rose-600 focus:ring-rose-500 mr-2 h-4.5 w-4.5 cursor-pointer"
                  />
                  Ativar Plano Prata
                </label>

                <label className="inline-flex items-center text-xs font-semibold text-stone-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={planoOuroAtivo}
                    onChange={(e) => setPlanoOuroAtivo(e.target.checked)}
                    className="rounded border-stone-300 text-rose-600 focus:ring-rose-500 mr-2 h-4.5 w-4.5 cursor-pointer"
                  />
                  Ativar Plano Ouro
                </label>
              </div>

              {/* API and Integration details */}
              <div className="border-t border-stone-100 pt-5 space-y-4">
                <h3 className="text-xs font-bold text-stone-800 tracking-wide uppercase">Chaves e Integrações SaaS (Gateway Stripe & Google/WhatsApp)</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">Stripe - Chave Pública</label>
                    <input
                      type="password"
                      value={stripePublicKey}
                      onChange={(e) => setStripePublicKey(e.target.value)}
                      placeholder="pk_live_xxxx ou pk_test_xxxx"
                      className="block w-full rounded-xl border border-stone-200 px-3.5 py-2 text-xs focus:border-rose-500 focus:outline-none transition-all shadow-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">Stripe - Chave Secreta</label>
                    <input
                      type="password"
                      value={stripeSecretKey}
                      onChange={(e) => setStripeSecretKey(e.target.value)}
                      placeholder="sk_live_xxxx ou sk_test_xxxx"
                      className="block w-full rounded-xl border border-stone-200 px-3.5 py-2 text-xs focus:border-rose-500 focus:outline-none transition-all shadow-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">Chave API WhatsApp Z-API</label>
                    <input
                      type="password"
                      value={whatsappApi}
                      onChange={(e) => setWhatsappApi(e.target.value)}
                      className="block w-full rounded-xl border border-stone-200 px-3.5 py-2 text-xs focus:border-rose-500 focus:outline-none transition-all shadow-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 tracking-wide uppercase mb-1">Google OAuth Client ID</label>
                    <input
                      type="password"
                      value={googleId}
                      onChange={(e) => setGoogleId(e.target.value)}
                      className="block w-full rounded-xl border border-stone-200 px-3.5 py-2 text-xs focus:border-rose-500 focus:outline-none transition-all shadow-sm font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end border-t border-stone-100 pt-5">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 cursor-pointer bg-stone-900 hover:bg-stone-950 text-white font-bold text-xs py-2.5 px-6 rounded-xl shadow-md transition-all"
                >
                  <Save className="w-4 h-4" /> Salvar Configurações Globais
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {/* DETAILED ACTION MODAL */}
      {isActionModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-200 max-w-lg w-full overflow-hidden shadow-2xl relative">
            
            {/* Modal Header */}
            <div className="bg-stone-900 text-white p-5 flex items-center justify-between">
              <div>
                <span className="text-[9px] uppercase tracking-wider text-rose-500 font-bold">Painel de Ações Master</span>
                <h3 className="font-serif text-base font-bold leading-tight mt-1">{selectedUser.nome}</h3>
              </div>
              <button
                onClick={() => setIsActionModalOpen(false)}
                className="text-stone-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Core Actions Directory */}
              {actionFormType === "none" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setActionFormType("edit")}
                      className="p-3.5 rounded-2xl border border-stone-200 hover:border-stone-300 bg-stone-50/50 hover:bg-stone-100/50 text-left space-y-1 transition-all cursor-pointer"
                    >
                      <Edit className="w-5 h-5 text-stone-700" />
                      <p className="text-xs font-bold text-stone-900">Editar Perfil</p>
                      <p className="text-[10px] text-stone-500 leading-normal">Alterar nome, empresa, telefone ou e-mail.</p>
                    </button>

                    <button
                      onClick={() => setActionFormType("password")}
                      className="p-3.5 rounded-2xl border border-stone-200 hover:border-stone-300 bg-stone-50/50 hover:bg-stone-100/50 text-left space-y-1 transition-all cursor-pointer"
                    >
                      <Key className="w-5 h-5 text-amber-600" />
                      <p className="text-xs font-bold text-stone-900">Alterar Senha</p>
                      <p className="text-[10px] text-stone-500 leading-normal">Definir nova senha de acesso administrativamente.</p>
                    </button>

                    <button
                      onClick={() => setActionFormType("plan")}
                      className="p-3.5 rounded-2xl border border-stone-200 hover:border-stone-300 bg-stone-50/50 hover:bg-stone-100/50 text-left space-y-1 transition-all cursor-pointer"
                    >
                      <CreditCard className="w-5 h-5 text-emerald-600" />
                      <p className="text-xs font-bold text-stone-900">Alterar Plano</p>
                      <p className="text-[10px] text-stone-500 leading-normal">Alterar plano contratado e valor mensal.</p>
                    </button>

                    <button
                      onClick={() => setActionFormType("status")}
                      className="p-3.5 rounded-2xl border border-stone-200 hover:border-stone-300 bg-stone-50/50 hover:bg-stone-100/50 text-left space-y-1 transition-all cursor-pointer"
                    >
                      <CheckCircle className="w-5 h-5 text-rose-500" />
                      <p className="text-xs font-bold text-stone-900">Gerenciar Acesso</p>
                      <p className="text-[10px] text-stone-500 leading-normal">Ativar conta, suspender ou bloquear acesso.</p>
                    </button>

                    {currentUser?.role === "master" && (
                      <>
                        <button
                          onClick={() => {
                            setActionFormType("manual_payment");
                            const today = new Date();
                            const todayStr = today.toISOString().split("T")[0];
                            
                            let startStr = todayStr;
                            if (selectedUser.plano_status === "Ativo" && selectedUser.plano_data_vencimento) {
                              const vDate = new Date(selectedUser.plano_data_vencimento);
                              if (vDate > today) {
                                startStr = selectedUser.plano_data_vencimento.split("T")[0];
                              }
                            }
                            
                            setManualStartDate(startStr);
                            const sDate = new Date(startStr + "T12:00:00");
                            const eDate = new Date(sDate);
                            eDate.setDate(eDate.getDate() + 30);
                            setManualEndDate(eDate.toISOString().split("T")[0]);

                            setManualPlanName(selectedUser.plano_atual || "Plano Bronze");
                            setManualPlanPrice(Number(selectedUser.plano_valor) || 49.90);
                          }}
                          className="p-3.5 rounded-2xl border border-rose-200 hover:border-rose-300 bg-rose-50/10 hover:bg-rose-50/25 text-left space-y-1 transition-all cursor-pointer col-span-2"
                        >
                          <Sparkles className="w-5 h-5 text-rose-600" />
                          <p className="text-xs font-bold text-stone-900">Ativação / Renovação Manual</p>
                          <p className="text-[10px] text-stone-500 leading-normal">Ativar ou renovar assinatura manualmente por 30 dias (Pix, Dinheiro, etc.).</p>
                        </button>

                        <button
                          onClick={() => {
                            setActionFormType("stripe_link");
                            setStripePlanName(selectedUser.plano_atual || "Plano Bronze");
                            setGeneratedStripeLink("");
                            setLinkCopied(false);
                          }}
                          className="p-3.5 rounded-2xl border border-blue-200 hover:border-blue-300 bg-blue-50/10 hover:bg-blue-50/25 text-left space-y-1 transition-all cursor-pointer col-span-2"
                        >
                          <Link className="w-5 h-5 text-blue-600" />
                          <p className="text-xs font-bold text-stone-900">Gerar Link Stripe</p>
                          <p className="text-[10px] text-stone-500 leading-normal">Gerar link customizado para o cliente renovar via Stripe.</p>
                        </button>
                      </>
                    )}
                  </div>

                  <div className="border-t border-stone-100 pt-4 flex gap-3">
                    <button
                      onClick={() => setActionFormType("delete")}
                      className="w-full inline-flex items-center justify-center gap-2 cursor-pointer bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs py-2.5 px-4 rounded-xl transition-all border border-red-200"
                    >
                      <Trash2 className="w-4 h-4" /> Excluir Cliente Permanentemente
                    </button>
                  </div>
                </div>
              )}

              {/* ACTION 1: EDIT PERFIL */}
              {actionFormType === "edit" && (
                <form onSubmit={handleSaveUserEdit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase">Nome Completo</label>
                      <input
                        type="text"
                        required
                        value={editNome}
                        onChange={(e) => setEditNome(e.target.value)}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase">Empresa / Clínica</label>
                      <input
                        type="text"
                        value={editEmpresa}
                        onChange={(e) => setEditEmpresa(e.target.value)}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase">Celular / WhatsApp</label>
                      <input
                        type="tel"
                        value={editCelular}
                        onChange={(e) => setEditCelular(e.target.value)}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase">E-mail Cadastrado</label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase">Papel de Acesso</label>
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
                      >
                        <option value="user">Cliente SaaS Comum (User)</option>
                        <option value="master">Administrador Master (Total)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-stone-100">
                    <button
                      type="button"
                      onClick={() => setActionFormType("none")}
                      className="flex-1 border border-stone-250 hover:bg-stone-50 text-stone-700 text-xs font-bold py-2 px-4 rounded-xl cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-stone-900 hover:bg-stone-950 text-white text-xs font-bold py-2 px-4 rounded-xl cursor-pointer"
                    >
                      Salvar Alterações
                    </button>
                  </div>
                </form>
              )}

              {/* ACTION 2: PASSWORD ALTERATION */}
              {actionFormType === "password" && (
                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-stone-500 uppercase">Nova Senha de Acesso</label>
                    <input
                      type="password"
                      required
                      placeholder="Mínimo 8 caracteres"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-stone-100">
                    <button
                      type="button"
                      onClick={() => setActionFormType("none")}
                      className="flex-1 border border-stone-250 hover:bg-stone-50 text-stone-700 text-xs font-bold py-2 px-4 rounded-xl cursor-pointer"
                    >
                      Voltar
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-2 px-4 rounded-xl cursor-pointer"
                    >
                      Confirmar Alteração de Senha
                    </button>
                  </div>
                </form>
              )}

              {/* ACTION 3: PLAN ALTERATION */}
              {actionFormType === "plan" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase">Plano Atribuído</label>
                      <select
                        value={changePlanName}
                        onChange={(e) => {
                          setChangePlanName(e.target.value);
                          if (e.target.value === "Plano Bronze") setChangePlanPrice(bronzePrice);
                          else if (e.target.value === "Plano Prata") setChangePlanPrice(prataPrice);
                          else if (e.target.value === "Plano Ouro") setChangePlanPrice(ouroPrice);
                        }}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:outline-none"
                      >
                        <option value="Plano Bronze">Plano STANDART</option>
                        <option value="Plano Prata">Plano Prata</option>
                        <option value="Plano Ouro">Plano Ouro</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase">Valor Customizado (R$ / mês)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={changePlanPrice}
                        onChange={(e) => setChangePlanPrice(Number(e.target.value))}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-stone-100">
                    <button
                      type="button"
                      onClick={() => setActionFormType("none")}
                      className="flex-1 border border-stone-250 hover:bg-stone-50 text-stone-700 text-xs font-bold py-2 px-4 rounded-xl cursor-pointer"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={handleUpdateUserPlan}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-4 rounded-xl cursor-pointer"
                    >
                      Confirmar Mudança de Plano
                    </button>
                  </div>
                </div>
              )}

              {/* ACTION 4: STATUS ACCESS CONTROL */}
              {actionFormType === "status" && (
                <div className="space-y-4">
                  <p className="text-xs text-stone-500">
                    Defina o status de assinatura ou acesso administrativo da conta. Alterar para <strong>Ativo</strong> gera renovação automática.
                  </p>
                  
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleUpdateUserStatus("Assinatura Ativa")}
                      className="py-2.5 px-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200 hover:bg-emerald-100 transition-all cursor-pointer text-center"
                    >
                      Ativar Assinatura (Acesso Total)
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUpdateUserStatus("Aguardando Assinatura")}
                      className="py-2.5 px-3 rounded-xl bg-stone-50 text-stone-700 text-xs font-bold border border-stone-200 hover:bg-stone-100 transition-all cursor-pointer text-center"
                    >
                      Aguardando Assinatura (Checkout)
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUpdateUserStatus("Assinatura Vencida")}
                      className="py-2.5 px-3 rounded-xl bg-amber-50 text-amber-800 text-xs font-bold border border-amber-200 hover:bg-amber-100 transition-all cursor-pointer text-center"
                    >
                      Marcar Como Vencido (Bloquear)
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUpdateUserStatus("Inadimplente")}
                      className="py-2.5 px-3 rounded-xl bg-amber-50 text-amber-800 text-xs font-bold border border-amber-200 hover:bg-amber-100 transition-all cursor-pointer text-center"
                    >
                      Marcar Inadimplente (Bloquear)
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUpdateUserStatus("Conta Bloqueada")}
                      className="py-2.5 px-3 rounded-xl bg-red-50 text-red-800 text-xs font-bold border border-red-200 hover:bg-red-100 transition-all cursor-pointer text-center col-span-2"
                    >
                      Bloquear Conta (Bloqueio Geral)
                    </button>
                  </div>

                  <div className="flex pt-4 border-t border-stone-100">
                    <button
                      type="button"
                      onClick={() => setActionFormType("none")}
                      className="w-full border border-stone-250 hover:bg-stone-50 text-stone-700 text-xs font-bold py-2 px-4 rounded-xl cursor-pointer text-center"
                    >
                      Voltar ao Painel Geral
                    </button>
                  </div>
                </div>
              )}

              {/* ACTION 5: PERMANENT DELETION */}
              {actionFormType === "delete" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs space-y-2">
                    <h4 className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-red-600" /> AVISO CRÍTICO DE EXCLUSÃO</h4>
                    <p className="leading-relaxed">
                      Esta ação é **irreversível**. Excluir este usuário irá apagar permanentemente todas as suas agendas, clientes de estética, dados de faturamento e conexões configuradas.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-stone-100">
                    <button
                      type="button"
                      onClick={() => setActionFormType("none")}
                      className="flex-1 border border-stone-250 hover:bg-stone-50 text-stone-700 text-xs font-bold py-2 px-4 rounded-xl cursor-pointer"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteUser}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 px-4 rounded-xl cursor-pointer"
                    >
                      Sim, Confirmar Exclusão
                    </button>
                  </div>
                </div>
              )}

              {/* ACTION 6: MANUAL PAYMENT ACTIVATION / RENEWAL */}
              {actionFormType === "manual_payment" && (
                <form onSubmit={handleSaveManualPayment} className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-rose-50/50 border border-rose-100 text-rose-950 text-xs space-y-1">
                    <h4 className="font-bold flex items-center gap-1"><Sparkles className="w-4 h-4 text-rose-500" /> ATIVAÇÃO/RENOVAÇÃO MANUAL (PIX/DINHEIRO)</h4>
                    <p className="leading-relaxed text-stone-600">
                      Isto ativará o plano do cliente pulando o Stripe. Define o gateway como <strong className="text-stone-900">manual</strong> e o status como <strong className="text-stone-900">Ativo</strong>.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-stone-550 uppercase">Plano Selecionado</label>
                      <select
                        value={manualPlanName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setManualPlanName(val);
                          if (val === "Plano Bronze") setManualPlanPrice(bronzePrice);
                          else if (val === "Plano Prata") setManualPlanPrice(prataPrice);
                          else if (val === "Plano Ouro") setManualPlanPrice(ouroPrice);
                        }}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none"
                      >
                        <option value="Plano Bronze">Plano STANDART</option>
                        <option value="Plano Prata">Plano Prata</option>
                        <option value="Plano Ouro">Plano Ouro</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-stone-550 uppercase">Valor do Plano (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={manualPlanPrice}
                        onChange={(e) => setManualPlanPrice(Number(e.target.value))}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-stone-550 uppercase">Data de Início</label>
                      <input
                        type="date"
                        required
                        value={manualStartDate}
                        onChange={(e) => handleManualStartDateChange(e.target.value)}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-stone-550 uppercase">Data de Vencimento</label>
                      <input
                        type="date"
                        required
                        value={manualEndDate}
                        onChange={(e) => setManualEndDate(e.target.value)}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-stone-100">
                    <button
                      type="button"
                      onClick={() => setActionFormType("none")}
                      className="flex-1 border border-stone-250 hover:bg-stone-50 text-stone-700 text-xs font-bold py-2.5 px-4 rounded-xl cursor-pointer"
                    >
                      Voltar
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl cursor-pointer disabled:opacity-50"
                    >
                      {loading ? "Processando..." : "Confirmar Ativação/Renovação"}
                    </button>
                  </div>
                </form>
              )}

              {/* ACTION 7: STRIPE RENEWAL LINK GENERATOR */}
              {actionFormType === "stripe_link" && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-blue-50/50 border border-blue-100 text-blue-950 text-xs space-y-1">
                    <h4 className="font-bold flex items-center gap-1"><Link className="w-4 h-4 text-blue-500" /> GERADOR DE LINK DE RENOVAÇÃO VIA STRIPE</h4>
                    <p className="leading-relaxed text-stone-600">
                      Gere um link direto para o cliente renovar via Stripe. Ao confirmar, o plano do usuário migrará de <strong className="text-stone-900">manual</strong> para <strong className="text-stone-900">stripe</strong> de forma totalmente automatizada.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-stone-550 uppercase">Plano de Destino</label>
                      <select
                        value={stripePlanName}
                        onChange={(e) => setStripePlanName(e.target.value)}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none"
                      >
                        <option value="Plano Bronze">Plano STANDART</option>
                        <option value="Plano Prata">Plano Prata</option>
                        <option value="Plano Ouro">Plano Ouro</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleGenerateStripeLink}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl cursor-pointer transition-all text-center"
                    >
                      Gerar Link de Pagamento
                    </button>

                    {generatedStripeLink && (
                      <div className="space-y-1.5 pt-2">
                        <label className="block text-[10px] font-bold text-stone-500 uppercase">Link de Checkout Gerado</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={generatedStripeLink}
                            className="block w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] font-mono focus:outline-none text-stone-600 truncate"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(generatedStripeLink);
                              setLinkCopied(true);
                              setTimeout(() => setLinkCopied(false), 2000);
                            }}
                            className="p-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 cursor-pointer flex items-center justify-center shrink-0"
                            title="Copiar Link"
                          >
                            {linkCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-stone-600" />}
                          </button>
                        </div>
                        {linkCopied && <p className="text-[10px] text-emerald-600 font-bold">✓ Copiado para a área de transferência!</p>}
                      </div>
                    )}
                  </div>

                  <div className="flex pt-4 border-t border-stone-100">
                    <button
                      type="button"
                      onClick={() => setActionFormType("none")}
                      className="w-full border border-stone-250 hover:bg-stone-50 text-stone-700 text-xs font-bold py-2.5 px-4 rounded-xl cursor-pointer text-center"
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MANUAL USER CREATION MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-stone-200 max-w-2xl w-full overflow-hidden shadow-2xl relative my-8">
            
            {/* Modal Header */}
            <div className="bg-stone-900 text-white p-5 flex items-center justify-between">
              <div>
                <span className="text-[9px] uppercase tracking-wider text-rose-500 font-bold">Criação Administrativa de Contas</span>
                <h3 className="font-serif text-lg font-bold leading-tight mt-1">
                  {!createdUserCredentials ? "Criar Novo Usuário" : "Usuário Criado com Sucesso!"}
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setCreatedUserCredentials(null);
                }}
                className="text-stone-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[75vh]">
              {!createdUserCredentials ? (
                <form onSubmit={handleCreateSystemUser} className="space-y-4">
                  {error && (
                    <div className="p-3 bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl font-medium">
                      ⚠️ {error}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Name */}
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-stone-500 uppercase">Nome Completo da Cliente</label>
                      <input
                        type="text"
                        required
                        value={createNome}
                        onChange={(e) => setCreateNome(e.target.value)}
                        placeholder="Ex: Amanda Silva"
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all"
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase">E-mail de Acesso</label>
                      <input
                        type="email"
                        required
                        value={createEmail}
                        onChange={(e) => setCreateEmail(e.target.value)}
                        placeholder="Ex: amanda@clinica.com"
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all font-mono"
                      />
                    </div>

                    {/* Phone */}
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase">Celular / WhatsApp</label>
                      <input
                        type="tel"
                        value={createCelular}
                        onChange={(e) => setCreateCelular(e.target.value)}
                        placeholder="Ex: (11) 99999-9999"
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all"
                      />
                    </div>

                    {/* Password */}
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-stone-500 uppercase">Senha Temporária</label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="text"
                          required
                          value={createSenha}
                          onChange={(e) => setCreateSenha(e.target.value)}
                          placeholder="Mínimo de 8 caracteres"
                          className="block w-full rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all font-mono"
                        />
                        <button
                          type="button"
                          onClick={generateTemporaryPassword}
                          className="bg-stone-100 hover:bg-stone-200 border border-stone-250 text-stone-700 text-xs font-bold px-3 py-2 rounded-xl transition-all cursor-pointer shrink-0"
                        >
                          Gerar Senha
                        </button>
                      </div>
                      <p className="text-[10px] text-stone-450 mt-1">No primeiro login, o sistema exigirá que a cliente defina uma senha pessoal definitiva.</p>
                    </div>

                    {/* Plan */}
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase">Plano Vinculado</label>
                      <select
                        value={createPlano}
                        onChange={(e) => setCreatePlano(e.target.value)}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      >
                        <option value="Plano Bronze">Plano STANDART (Bronze)</option>
                        <option value="Plano Prata">Plano Prata</option>
                        <option value="Plano Ouro">Plano Ouro</option>
                      </select>
                    </div>

                    {/* Access Period */}
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase">Período de Acesso Inicial</label>
                      <select
                        value={createPeriodoAcesso}
                        onChange={(e) => setCreatePeriodoAcesso(Number(e.target.value))}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      >
                        <option value={1}>1 Mês (Mensal)</option>
                        <option value={3}>3 Meses (Trimestral)</option>
                        <option value={6}>6 Meses (Semestral)</option>
                        <option value={12}>12 Meses (Anual)</option>
                      </select>
                    </div>

                    {/* Start Date */}
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase">Data de Início do Plano</label>
                      <input
                        type="date"
                        required
                        value={createDataInicio}
                        onChange={(e) => setCreateDataInicio(e.target.value)}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 font-mono"
                      />
                    </div>

                    {/* End Date (Vencimento) */}
                    <div>
                      <label className="block text-[10px] font-bold text-stone-500 uppercase">Data de Vencimento do Plano</label>
                      <input
                        type="date"
                        required
                        value={createDataVencimento}
                        onChange={(e) => setCreateDataVencimento(e.target.value)}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 font-mono"
                      />
                    </div>

                    {/* Payment Method */}
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-stone-500 uppercase">Método de Pagamento</label>
                      <select
                        value={createMetodoPagamento}
                        onChange={(e) => setCreateMetodoPagamento(e.target.value)}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      >
                        <option value="Manual (Pix)">Manual (Pix recebido)</option>
                        <option value="Manual (Cartão)">Manual (Máquina de Cartão)</option>
                        <option value="Boleto">Boleto Bancário</option>
                        <option value="Dinheiro">Dinheiro em Espécie</option>
                        <option value="Cortesia / Grátis">Cortesia / Acesso Grátis</option>
                        <option value="Outro">Outro Método</option>
                      </select>
                    </div>

                    {/* Admin Notes */}
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-stone-500 uppercase">Observações Administrativas</label>
                      <textarea
                        value={createObservacoes}
                        onChange={(e) => setCreateObservacoes(e.target.value)}
                        placeholder="Ex: Cliente fechou pelo Instagram, enviado desconto especial."
                        rows={3}
                        className="block w-full mt-1 rounded-xl border border-stone-250 bg-white px-3 py-2 text-xs focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all resize-none"
                      />
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex gap-3 pt-5 border-t border-stone-100 justify-end">
                    <button
                      type="button"
                      onClick={() => setIsCreateModalOpen(false)}
                      className="border border-stone-250 hover:bg-stone-50 text-stone-700 text-xs font-bold py-2.5 px-5 rounded-xl cursor-pointer transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-2.5 px-6 rounded-xl cursor-pointer shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {loading ? "Criando Conta..." : "Criar Conta da Cliente"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-5">
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs flex items-start gap-2.5">
                    <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-emerald-950 text-sm">✓ Conta configurada e liberada com sucesso!</p>
                      <p className="mt-1 leading-relaxed text-emerald-900">
                        A cliente já pode acessar o sistema com o e-mail e a senha temporária gerada abaixo.
                      </p>
                    </div>
                  </div>

                  {/* Account Summary details */}
                  <div className="bg-stone-50 p-5 rounded-2xl border border-stone-200 space-y-3">
                    <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Dados de Login da Cliente</h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="text-stone-500 text-[10px] uppercase font-bold">Cliente</p>
                        <p className="font-semibold text-stone-900 mt-0.5">{createdUserCredentials.nome}</p>
                      </div>
                      <div>
                        <p className="text-stone-500 text-[10px] uppercase font-bold">Plano Contratado</p>
                        <p className="font-semibold text-stone-900 mt-0.5">{(createdUserCredentials.plano === "Plano Bronze" || createdUserCredentials.plano === "Bronze") ? "STANDART" : createdUserCredentials.plano.replace("Plano ", "")}</p>
                      </div>
                      <div>
                        <p className="text-stone-500 text-[10px] uppercase font-bold">E-mail cadastrado</p>
                        <p className="font-mono text-stone-900 mt-0.5 font-semibold">{createdUserCredentials.email}</p>
                      </div>
                      <div>
                        <p className="text-stone-500 text-[10px] uppercase font-bold flex items-center gap-1">
                          Senha Temporária
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono bg-white px-2.5 py-1 rounded border border-stone-200 font-bold text-stone-900 select-all">
                            {createdUserCredentials.senha}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(createdUserCredentials.senha);
                              setCopiedCredentials(true);
                              setTimeout(() => setCopiedCredentials(false), 2000);
                            }}
                            className="p-1 rounded bg-stone-200 hover:bg-stone-300 transition-all cursor-pointer flex items-center justify-center"
                            title="Copiar Senha"
                          >
                            {copiedCredentials ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-stone-700" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Preformed Whatsapp Message */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-bold text-stone-550 uppercase tracking-wide">Mensagem Pronta para WhatsApp</label>
                      <button
                        type="button"
                        onClick={() => {
                          const domain = window.location.origin;
                          const msg = `Olá *${createdUserCredentials.nome}*, sua conta no *LUMORA Flow* foi criada com sucesso! 🌸\n\nAqui estão seus dados de acesso:\n📧 *E-mail:* ${createdUserCredentials.email}\n🔑 *Senha temporária:* ${createdUserCredentials.senha}\n\nPara começar, acesse o link abaixo:\n🔗 ${domain}\n\nNo seu primeiro acesso, você precisará definir uma nova senha pessoal de sua preferência. Seja muito bem-vinda!`;
                          navigator.clipboard.writeText(msg);
                          setCopiedCredentials(true);
                          setTimeout(() => setCopiedCredentials(false), 2000);
                        }}
                        className="text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer flex items-center gap-1 transition-all"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copiedCredentials ? "Copiado!" : "Copiar Mensagem do WhatsApp"}
                      </button>
                    </div>
                    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 font-sans text-xs text-stone-700 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap select-all">
                      {`Olá *${createdUserCredentials.nome}*, sua conta no *LUMORA Flow* foi criada com sucesso! 🌸

Aqui estão seus dados de acesso:
📧 *E-mail:* ${createdUserCredentials.email}
🔑 *Senha temporária:* ${createdUserCredentials.senha}

Para começar, acesse o link abaixo:
🔗 ${window.location.origin}

No seu primeiro acesso, você precisará definir uma nova senha pessoal de sua preferência. Seja muito bem-vinda!`}
                    </div>
                    <p className="text-[10px] text-stone-450">Dica: Envie essa mensagem para a cliente pelo WhatsApp Web para que ela tenha fácil acesso às credenciais.</p>
                  </div>

                  {/* Close button */}
                  <div className="flex pt-4 border-t border-stone-100 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreateModalOpen(false);
                        setCreatedUserCredentials(null);
                      }}
                      className="bg-stone-900 hover:bg-stone-950 text-white text-xs font-bold py-2.5 px-6 rounded-xl shadow-md transition-all cursor-pointer"
                    >
                      Fechar e Voltar ao Diretório
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
