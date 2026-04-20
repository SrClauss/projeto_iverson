import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Chip,
  IconButton,
  Stack,
  Avatar,
  CircularProgress,
  Alert,
  Tooltip,
  Badge,
  Popover,
  Divider,
} from '@mui/material';
import {
  NotificationsActive,
  CheckCircle,
  Delete,
  AccountCircle,
  Warning as WarningAmberIcon,
} from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import glassBackground from './assets/glass-background-bordeaux.svg';
import './App.css';

import { glassPanel } from './styles/glass';
import { getTodayIso, normalizeDateInput, parseCurrency } from './utils/formatters';
import type {
  FilterKey,
  AppView,
  DashboardStats,
  OrcamentoRecenteItem,
  DashboardAlertaItem,
  TransportadoraMetricas,
  Transportadora,
  OrcamentoDetalhe,
  GoogleAuthStatus,
  WatcherStatus,
  EmailPendente,
  Notificacao,
  NovaTransportadoraForm,
  NovoOrcamentoForm,
  NovaPropostaForm,
  VolumesAgregados,
} from './types';
import Sidebar from './components/Sidebar';
import DashboardScreen from './screens/DashboardScreen';
import TransportadorasScreen from './screens/TransportadorasScreen';
import DivergenciasScreen from './screens/DivergenciasScreen';
import RelatoriosScreen from './screens/RelatoriosScreen';
import OrcamentosScreen from './screens/OrcamentosScreen';

const App = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orcamentos, setOrcamentos] = useState<OrcamentoRecenteItem[]>([]);
  const [alertas, setAlertas] = useState<DashboardAlertaItem[]>([]);
  const [transportadoras, setTransportadoras] = useState<Transportadora[]>([]);
  const [view, setView] = useState<AppView>('dashboard');
  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [savingTransportadora, setSavingTransportadora] = useState(false);
  const [savingOrcamento, setSavingOrcamento] = useState(false);
  const [savingProposta, setSavingProposta] = useState(false);
  const [savingEdicaoOrcamento, setSavingEdicaoOrcamento] = useState(false);
  const [detalheLoading, setDetalheLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<FilterKey>('nota');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [descricao, setDescricao] = useState('');
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [transportadoraIds, setTransportadoraIds] = useState<string[]>([]);
  const [selectedTransportadoraIds, setSelectedTransportadoraIds] = useState<string[]>([]);
  const [forceSendTransportadoraIds, setForceSendTransportadoraIds] = useState<string[]>([]);
  const [showEnviarOrcamentoModal, setShowEnviarOrcamentoModal] = useState(false);
  const [sendingOrcamentoEmail, setSendingOrcamentoEmail] = useState(false);
  const [, setSuccessMessage] = useState<string | null>(null);
  const [filtroAtivoLabel, setFiltroAtivoLabel] = useState<string | null>(null);
  const [cepError, setCepError] = useState<string | null>(null);
  const [novaTransportadora, setNovaTransportadora] = useState<NovaTransportadoraForm>({
    nome: '',
    cnpj: '',
    telefone: '',
    email_orcamento: '',
    email_nota: '',
  });
  const [editandoTransportadora, setEditandoTransportadora] = useState(false);
  const [transportadoraEmEdicao, setTransportadoraEmEdicao] = useState<Transportadora | null>(null);
  const [novoOrcamento, setNovoOrcamento] = useState<NovoOrcamentoForm>({
    numero_cotacao: '',
    data_criacao: getTodayIso(),
    cnpj_pagador: '',
    cnpj_cpf_destino: '',
    cep_destino: '',
    logradouro_destino: '',
    numero_destino: '',
    complemento_destino: '',
    bairro_destino: '',
    cidade_destino: '',
    uf_destino: '',
    endereco_destino: '',
    nota: '',
    valor_produto: '',
    volumes: [{ comprimento: '', largura: '', altura: '', peso: '' }],
    dimensoes: { comprimento: '', largura: '', altura: '' },
    peso: '',
  });

  const buildEnderecoDestino = (orc: NovoOrcamentoForm) => {
    const parts: string[] = [];
    if (orc.logradouro_destino.trim()) {
      parts.push(orc.logradouro_destino.trim());
    }
    if (orc.numero_destino.trim()) {
      parts.push(`nº ${orc.numero_destino.trim()}`);
    }
    if (orc.complemento_destino.trim()) {
      parts.push(orc.complemento_destino.trim());
    }
    if (orc.bairro_destino.trim()) {
      parts.push(orc.bairro_destino.trim());
    }
    const cidadeUf = [orc.cidade_destino.trim(), orc.uf_destino.trim()].filter(Boolean).join(' - ');
    if (cidadeUf) {
      parts.push(cidadeUf);
    }
    return parts.join(', ');
  };

  const [orcamentoSelecionadoId, setOrcamentoSelecionadoId] = useState<string | null>(null);
  const [orcamentoDetalhe, setOrcamentoDetalhe] = useState<OrcamentoDetalhe | null>(null);
  const [novaProposta, setNovaProposta] = useState<NovaPropostaForm>({
    valor_proposta: '',
    transportadora_id: '',
    data_proposta: getTodayIso(),
    prazo_entrega: '',
  });

  const volumesAgregados = useMemo((): VolumesAgregados => {
    const volumes = (novoOrcamento.volumes || [])
      .filter((v: any) => v.comprimento || v.largura || v.altura || v.peso)
      .map((v: any) => ({
        comprimento: Number(v.comprimento.replace(',', '.')),
        largura: Number(v.largura.replace(',', '.')),
        altura: Number(v.altura.replace(',', '.')),
        peso: v.peso ? Number(v.peso.replace(',', '.')) : 0,
      }));

    const totalPeso = volumes.reduce((acc, vol) => acc + (Number.isNaN(vol.peso) ? 0 : vol.peso), 0);
    const totalVolume = volumes.reduce((acc, vol) => {
      if (Number.isNaN(vol.comprimento) || Number.isNaN(vol.largura) || Number.isNaN(vol.altura)) return acc;
      return acc + vol.comprimento * vol.largura * vol.altura;
    }, 0);

    return { count: volumes.length, totalPeso, totalVolume };
  }, [novoOrcamento.volumes]);

  const detalheVolumesAgregados = useMemo((): VolumesAgregados => {
    const volumes = (orcamentoDetalhe?.volumes || []).map((v) => ({
      comprimento: v.comprimento,
      largura: v.largura,
      altura: v.altura,
      peso: v.peso || 0,
    }));

    const totalPeso = volumes.reduce((acc, vol) => acc + (Number.isNaN(vol.peso) ? 0 : vol.peso), 0);
    const totalVolume = volumes.reduce((acc, vol) => {
      if (Number.isNaN(vol.comprimento) || Number.isNaN(vol.largura) || Number.isNaN(vol.altura)) return acc;
      return acc + vol.comprimento * vol.largura * vol.altura;
    }, 0);

    return { count: volumes.length, totalPeso, totalVolume };
  }, [orcamentoDetalhe]);

  const [googleAuth, setGoogleAuth] = useState<GoogleAuthStatus | null>(null);
  const [googleAuthLoading, setGoogleAuthLoading] = useState(false);
  const [notifAnchorEl, setNotifAnchorEl] = useState<HTMLElement | null>(null);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [divergenciaAtual, setDivergenciaAtual] = useState<DashboardAlertaItem | null>(null);
  const [transportadoraMetricas, setTransportadoraMetricas] = useState<TransportadoraMetricas | null>(null);
  const [metricasLoading, setMetricasLoading] = useState(false);
  const [watcherStatus, setWatcherStatus] = useState<WatcherStatus | null>(null);
  const [emailsPendentes, setEmailsPendentes] = useState<EmailPendente[]>([]);
  const [watcherLoading, setWatcherLoading] = useState(false);
  const [emailAssociarId, setEmailAssociarId] = useState<string | null>(null);
  const [orcamentoAssociarId, setOrcamentoAssociarId] = useState('');

  useEffect(() => {
    if (!error) return undefined;
    const timeoutId = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [error]);

  useEffect(() => { loadDashboard(); }, []);

  useEffect(() => {
    const unlisten = listen('db-changed', () => { loadDashboard(undefined, false); });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    let timeoutId: number | undefined;
    const cepInput = novoOrcamento.cep_destino || '';
    const cepLimpo = cepInput.replace(/\D/g, '');
    if (!cepInput.trim()) { setCepError(null); return; }
    if (cepLimpo.length !== 8) { setCepError('CEP inválido. Deve ter 8 dígitos.'); return; }
    setCepError(null);
    timeoutId = window.setTimeout(async () => {
      try {
        const resp = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
        if (!resp.ok) throw new Error('Falha ao buscar CEP');
        const data = await resp.json();
        if (data.erro) { setCepError('CEP não encontrado.'); return; }
        setNovoOrcamento((prev) => {
          const next = {
            ...prev,
            logradouro_destino: data.logradouro || prev.logradouro_destino,
            bairro_destino: data.bairro || prev.bairro_destino,
            cidade_destino: data.localidade || prev.cidade_destino,
            uf_destino: data.uf || prev.uf_destino,
          };
          return {
            ...next,
            endereco_destino: buildEnderecoDestino(next) || prev.endereco_destino,
          };
        });
        setCepError(null);
      } catch { setCepError('Não foi possível consultar o CEP.'); }
    }, 500);
    return () => { if (timeoutId !== undefined) window.clearTimeout(timeoutId); };
  }, [novoOrcamento.cep_destino]);

  useEffect(() => { loadGoogleAuthStatus(); }, []);

  useEffect(() => {
    loadWatcherStatus();
    loadEmailsPendentes();
    const interval = setInterval(() => { loadWatcherStatus(); loadEmailsPendentes(); }, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboard = async (includeInactive?: boolean, showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    const inactive = includeInactive ?? mostrarInativos;
    try {
      invoke('sync_notificacoes_divergencias').catch(() => {});
      const [statsData, orcamentosData, alertasData, notificacoesData] = await Promise.all([
        invoke<DashboardStats>('get_dashboard_stats'),
        invoke<OrcamentoRecenteItem[]>('get_orcamentos_recentes', { limit: inactive ? 50 : 4, includeInactive: inactive }),
        invoke<DashboardAlertaItem[]>('get_dashboard_alertas', { limit: 20 }),
        invoke<Notificacao[]>('get_notificacoes'),
      ]);
      const transportadorasData = await invoke<Transportadora[]>('get_transportadoras');
      setStats(statsData);
      setOrcamentos(orcamentosData);
      setAlertas(alertasData);
      setNotificacoes(notificacoesData);
      setTransportadoras(transportadorasData);
      setFiltroAtivoLabel(null);
      const unreadNotificacoes = notificacoesData.filter((n) => !n.lida).length;
      await invoke('set_tray_divergencias', { count: unreadNotificacoes });
    } catch (err) {
      setError(String(err));
      console.error('Erro ao carregar dashboard:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleResolverDivergencia = async (alerta: DashboardAlertaItem) => {
    setView('divergencia');
    setDivergenciaAtual(alerta);
    setNotifAnchorEl(null);
    await loadOrcamentoDetalhe(alerta.orcamento_id);
    if (alerta.transportadora_id) {
      await loadTransportadoraMetricas(alerta.transportadora_id);
    } else {
      setTransportadoraMetricas(null);
    }
  };

  const loadTransportadoraMetricas = async (transportadoraId: string) => {
    setMetricasLoading(true);
    try {
      const metricas = await invoke<TransportadoraMetricas>('get_transportadora_metricas', { transportadoraId });
      setTransportadoraMetricas(metricas);
    } catch (err) {
      console.error('Erro ao carregar métricas da transportadora:', err);
      setTransportadoraMetricas(null);
    } finally {
      setMetricasLoading(false);
    }
  };

  const loadGoogleAuthStatus = async () => {
    try {
      const status = await invoke<GoogleAuthStatus>('google_auth_get_status');
      setGoogleAuth(status);
    } catch (err) {
      console.error('Erro ao carregar status de auth:', err);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleAuthLoading(true);
    setGoogleAuth(null);
    try {
      await invoke<string>('google_auth_start_login');
      await loadGoogleAuthStatus();
      try {
        await invoke('start_email_watcher');
        await loadWatcherStatus();
      } catch (watcherErr) {
        console.warn('Watcher não iniciado automaticamente:', watcherErr);
      }
    } catch (err) {
      setError(String(err));
      await loadGoogleAuthStatus();
    } finally {
      setGoogleAuthLoading(false);
    }
  };

  const handleGoogleLogout = async () => {
    setGoogleAuthLoading(true);
    try {
      await invoke<string>('google_auth_logout');
      await loadGoogleAuthStatus();
    } catch (err) {
      setError(String(err));
    } finally {
      setGoogleAuthLoading(false);
    }
  };

  const loadWatcherStatus = async () => {
    try {
      const status = await invoke<WatcherStatus>('get_watcher_status');
      setWatcherStatus(status);
    } catch (err) {
      console.error('Erro ao carregar status do watcher:', err);
    }
  };

  const loadEmailsPendentes = async () => {
    try {
      const emails = await invoke<EmailPendente[]>('get_emails_pendentes');
      setEmailsPendentes(emails);
    } catch (err) {
      console.error('Erro ao carregar emails pendentes:', err);
    }
  };

  const handleToggleWatcher = async () => {
    setWatcherLoading(true);
    try {
      if (watcherStatus?.running) {
        await invoke('stop_email_watcher');
      } else {
        await invoke('start_email_watcher');
      }
      await loadWatcherStatus();
    } catch (err) {
      setError(String(err));
    } finally {
      setWatcherLoading(false);
    }
  };

  const handleAssociarEmail = async (emailId: string, orcId: string) => {
    try {
      await invoke('associar_email_a_orcamento', { emailId, orcamentoId: orcId });
      setEmailAssociarId(null);
      setOrcamentoAssociarId('');
      await loadEmailsPendentes();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDescartarEmail = async (emailId: string) => {
    try {
      await invoke('descartar_email', { emailId });
      await loadEmailsPendentes();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleExcluirEmail = async (emailId: string) => {
    try {
      await invoke('excluir_email', { emailId });
      await loadEmailsPendentes();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleExcluirOrcamento = async (orcamentoId: string) => {
    if (!window.confirm('Excluir este orçamento permanentemente?')) return;
    try {
      await invoke('excluir_orcamento', { orcamentoId });
      await loadDashboard();
    } catch (err) {
      setError(String(err));
    }
  };

  const loadOrcamentoDetalhe = async (orcamentoId: string) => {
    setDetalheLoading(true);
    try {
      const detalhe = await invoke<OrcamentoDetalhe>('get_orcamento_detalhe', { orcamentoId });
      setOrcamentoDetalhe(detalhe);
      setNovoOrcamento({
        numero_cotacao: detalhe.numero_cotacao || '',
        data_criacao: detalhe.data_criacao,
        cnpj_pagador: detalhe.cnpj_pagador || '',
        cnpj_cpf_destino: detalhe.cnpj_cpf_destino || '',
        cep_destino: detalhe.cep_destino || '',
        logradouro_destino: detalhe.logradouro_destino || '',
        numero_destino: detalhe.numero_destino || '',
        complemento_destino: detalhe.complemento_destino || '',
        bairro_destino: detalhe.bairro_destino || '',
        cidade_destino: detalhe.cidade_destino || '',
        uf_destino: detalhe.uf_destino || '',
        endereco_destino: detalhe.endereco_destino || '',
        nota: detalhe.nota || '',
        valor_produto: detalhe.valor_produto !== undefined && detalhe.valor_produto !== null ? String(detalhe.valor_produto) : '',
        volumes: detalhe.volumes?.length
          ? detalhe.volumes.map((v) => ({
              comprimento: String(v.comprimento),
              largura: String(v.largura),
              altura: String(v.altura),
              peso: v.peso !== undefined && v.peso !== null ? String(v.peso) : '',
            }))
          : [{ comprimento: '', largura: '', altura: '', peso: '' }],
        dimensoes: {
          comprimento: detalhe.dimensoes?.comprimento ? String(detalhe.dimensoes.comprimento) : '',
          largura: detalhe.dimensoes?.largura ? String(detalhe.dimensoes.largura) : '',
          altura: detalhe.dimensoes?.altura ? String(detalhe.dimensoes.altura) : '',
        },
        peso: detalhe.peso !== undefined && detalhe.peso !== null ? String(detalhe.peso) : '',
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setDetalheLoading(false);
    }
  };

  const handleVerDetalhes = async (id: string) => {
    setView('orcamentos');
    setOrcamentoSelecionadoId(id);
    await loadOrcamentoDetalhe(id);
  };

  const handleNovoOrcamento = () => {
    setOrcamentoSelecionadoId(null);
    setOrcamentoDetalhe(null);
    setNovoOrcamento({
      numero_cotacao: '',
      data_criacao: getTodayIso(),
      cnpj_pagador: '',
      cnpj_cpf_destino: '',
      cep_destino: '',
      logradouro_destino: '',
      numero_destino: '',
      complemento_destino: '',
      bairro_destino: '',
      cidade_destino: '',
      uf_destino: '',
      endereco_destino: '',
      nota: '',
      valor_produto: '',
      volumes: [{ comprimento: '', largura: '', altura: '', peso: '' }],
      dimensoes: { comprimento: '', largura: '', altura: '' },
      peso: '',
    });
    setNovaProposta({
      valor_proposta: '',
      transportadora_id: '',
      data_proposta: getTodayIso(),
      prazo_entrega: '',
    });
    setView('orcamentos');
  };

  const handleSalvarTransportadora = async () => {
    setError(null);
    setSuccessMessage(null);
    const payload = {
      nome: novaTransportadora.nome.trim(),
      cnpj: novaTransportadora.cnpj.trim(),
      telefone: novaTransportadora.telefone.trim(),
      email_orcamento: novaTransportadora.email_orcamento.trim(),
      email_nota: novaTransportadora.email_nota.trim(),
    };
    if (!payload.nome || !payload.cnpj || !payload.telefone || !payload.email_orcamento || !payload.email_nota) {
      setError('Preencha todos os campos para cadastrar a transportadora.');
      return;
    }
    setSavingTransportadora(true);
    try {
      await invoke<string>('add_transportadora', { transportadora: payload });
      setNovaTransportadora({ nome: '', cnpj: '', telefone: '', email_orcamento: '', email_nota: '' });
      await loadDashboard();
      setView('transportadoras');
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingTransportadora(false);
    }
  };

  const handleToggleSelectTransportadora = (transportadoraId: string) => {
    setSelectedTransportadoraIds((prev) =>
      prev.includes(transportadoraId) ? prev.filter((id) => id !== transportadoraId) : [...prev, transportadoraId]
    );
  };

  const handleOpenEnviarOrcamentoModal = () => {
    if (!orcamentoSelecionadoId) { setError('Abra um orçamento existente para enviar e-mails.'); return; }
    const alreadySentIds = orcamentoDetalhe?.transportadoras_enviadas || [];
    const defaultSelection = transportadoras.filter((item) => !alreadySentIds.includes(item.id)).map((item) => item.id);
    setSelectedTransportadoraIds(defaultSelection);
    setForceSendTransportadoraIds([]);
    setShowEnviarOrcamentoModal(true);
  };

  const handleToggleForceSendTransportadora = (transportadoraId: string) => {
    const alreadySent = orcamentoDetalhe?.transportadoras_enviadas?.includes(transportadoraId);
    setForceSendTransportadoraIds((prev) => {
      const next = prev.includes(transportadoraId)
        ? prev.filter((id) => id !== transportadoraId)
        : [...prev, transportadoraId];
      if (next.includes(transportadoraId)) {
        setSelectedTransportadoraIds((current) =>
          current.includes(transportadoraId) ? current : [...current, transportadoraId]
        );
      } else if (alreadySent) {
        setSelectedTransportadoraIds((current) => current.filter((id) => id !== transportadoraId));
      }
      return next;
    });
  };

  const handleEnviarEmailOrcamento = async () => {
    setModalError(null);
    setSuccessMessage(null);
    if (!orcamentoSelecionadoId) { setModalError('Abra um orçamento existente para enviar e-mails.'); return; }
    if (selectedTransportadoraIds.length === 0) { setModalError('Selecione ao menos uma transportadora.'); return; }
    if ((!novoOrcamento.nota.trim() && !novoOrcamento.numero_cotacao.trim()) || !novoOrcamento.valor_produto.trim()) {
      setModalError('Preencha nota/cotação e valor do produto antes de enviar.');
      return;
    }
    setSendingOrcamentoEmail(true);
    try {
      const descricao = `NF:${novoOrcamento.nota.trim()} / COT:${novoOrcamento.numero_cotacao.trim()}`;
      const response = await invoke<string>('send_orcamento_request_email', {
        orcamentoId: orcamentoSelecionadoId,
        transportadoraIds: selectedTransportadoraIds,
        descricao,
        nota: novoOrcamento.nota.trim(),
        valorProduto: novoOrcamento.valor_produto.trim(),
        peso: novoOrcamento.peso.trim(),
        cepDestino: novoOrcamento.cep_destino.trim(),
        enderecoDestino: novoOrcamento.endereco_destino.trim(),
        dataCriacao: novoOrcamento.data_criacao.trim(),
      });
      setSuccessMessage(response);
      setShowEnviarOrcamentoModal(false);
      setModalError(null);
      await loadOrcamentoDetalhe(orcamentoSelecionadoId);
    } catch (err) {
      setModalError(String(err));
    } finally {
      setSendingOrcamentoEmail(false);
    }
  };

  const handleEditarTransportadora = (transportadora: Transportadora) => {
    setTransportadoraEmEdicao(transportadora);
    setNovaTransportadora({
      nome: transportadora.nome,
      cnpj: transportadora.cnpj,
      telefone: transportadora.telefone,
      email_orcamento: transportadora.email_orcamento,
      email_nota: transportadora.email_nota,
    });
    setEditandoTransportadora(true);
  };

  const handleSalvarEdicaoTransportadora = async () => {
    setError(null);
    if (!transportadoraEmEdicao?.id) { setError('ID de transportadora inválido'); return; }
    const payload = {
      nome: novaTransportadora.nome.trim(),
      cnpj: novaTransportadora.cnpj.trim(),
      telefone: novaTransportadora.telefone.trim(),
      email_orcamento: novaTransportadora.email_orcamento.trim(),
      email_nota: novaTransportadora.email_nota.trim(),
    };
    if (!payload.nome || !payload.cnpj || !payload.telefone || !payload.email_orcamento || !payload.email_nota) {
      setError('Preencha todos os campos para atualizar a transportadora.');
      return;
    }
    setSavingTransportadora(true);
    try {
      await invoke<string>('update_transportadora', { transportadoraId: transportadoraEmEdicao.id, transportadora: payload });
      setEditandoTransportadora(false);
      setTransportadoraEmEdicao(null);
      setNovaTransportadora({ nome: '', cnpj: '', telefone: '', email_orcamento: '', email_nota: '' });
      await loadDashboard();
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingTransportadora(false);
    }
  };

  const handleDeletarTransportadora = async (transportadora: Transportadora) => {
    if (!transportadora.id) { setError('ID de transportadora inválido'); return; }
    if (!window.confirm(`Tem certeza que deseja deletar a transportadora "${transportadora.nome}"?`)) return;
    setError(null);
    setSavingTransportadora(true);
    try {
      await invoke<string>('delete_transportadora', { transportadoraId: transportadora.id });
      await loadDashboard();
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingTransportadora(false);
    }
  };

  const handleSalvarOrcamento = async () => {
    setError(null);
    const nota = novoOrcamento.nota.trim();
    const numeroCotacao = novoOrcamento.numero_cotacao.trim();
    const dataCriacaoNormalizada = normalizeDateInput(novoOrcamento.data_criacao);
    
    // Validações de campos obrigatórios básicos
    if (!nota) { setError('Nota é obrigatória.'); return; }
    if (!numeroCotacao) { setError('Número de Cotação é obrigatório.'); return; }
    if (!novoOrcamento.cnpj_cpf_destino.trim()) { setError('CNPJ/CPF de destino é obrigatório.'); return; }
    if (!novoOrcamento.data_criacao.trim()) { setError('Preencha a data para cadastrar o orçamento.'); return; }
    if (!dataCriacaoNormalizada) { setError('Data inválida. Use dd/mm/aaaa ou aaaa-mm-dd.'); return; }
    
    // Validações de endereço obrigatórios
    if (!novoOrcamento.cep_destino.trim()) { setError('CEP de destino é obrigatório.'); return; }
    if (!novoOrcamento.logradouro_destino.trim()) { setError('Logradouro é obrigatório.'); return; }
    if (!novoOrcamento.numero_destino.trim()) { setError('Número é obrigatório.'); return; }
    if (!novoOrcamento.bairro_destino.trim()) { setError('Bairro é obrigatório.'); return; }
    if (!novoOrcamento.cidade_destino.trim()) { setError('Cidade é obrigatória.'); return; }
    if (!novoOrcamento.uf_destino.trim()) { setError('UF é obrigatória.'); return; }
    
    const valorProduto = novoOrcamento.valor_produto ? parseCurrency(novoOrcamento.valor_produto) || null : null;
    const peso = novoOrcamento.peso ? Number(novoOrcamento.peso.replace(',', '.')) : null;
    const volumes = (novoOrcamento.volumes || [])
      .filter((v: any) => v.comprimento || v.largura || v.altura || v.peso)
      .map((v: any) => ({
        comprimento: Number(v.comprimento.replace(',', '.')),
        largura: Number(v.largura.replace(',', '.')),
        altura: Number(v.altura.replace(',', '.')),
        peso: v.peso ? Number(v.peso.replace(',', '.')) : null,
      }));
    const pesoTotalVolumes = volumes.reduce((acc: number, vol: any) => {
      if (vol.peso !== null && !Number.isNaN(vol.peso)) return acc + vol.peso;
      return acc;
    }, 0);
    const pesoTotal = pesoTotalVolumes;
    const dimensoes = novoOrcamento.dimensoes.comprimento || novoOrcamento.dimensoes.largura || novoOrcamento.dimensoes.altura
      ? {
          comprimento: Number(novoOrcamento.dimensoes.comprimento.replace(',', '.')),
          largura: Number(novoOrcamento.dimensoes.largura.replace(',', '.')),
          altura: Number(novoOrcamento.dimensoes.altura.replace(',', '.')),
        }
      : null;
    const cnpjPagador = novoOrcamento.cnpj_pagador?.trim() || null;
    const cnpjCpfDestino = novoOrcamento.cnpj_cpf_destino?.trim() || null;
    const enderecoDestino = buildEnderecoDestino(novoOrcamento) || novoOrcamento.endereco_destino.trim();
    if (novoOrcamento.valor_produto && (valorProduto === null || Number.isNaN(valorProduto))) { setError('Valor do produto inválido.'); return; }
    if (novoOrcamento.peso && Number.isNaN(peso)) { setError('Peso inválido.'); return; }
    if (volumes.some((vol: any) => Number.isNaN(vol.comprimento) || Number.isNaN(vol.largura) || Number.isNaN(vol.altura))) { setError('Pelo menos um volume possui dimensão inválida.'); return; }
    if (volumes.some((vol: any) => vol.peso !== null && Number.isNaN(vol.peso))) { setError('Pelo menos um volume possui peso inválido.'); return; }
    setSavingOrcamento(true);
    try {
      const descricao = `NF:${nota} / COT:${numeroCotacao}`;
      const orcamentoId = await invoke<string>('add_orcamento', {
        orcamento: {
          descricao,
          numero_cotacao: numeroCotacao || null,
          data_criacao: dataCriacaoNormalizada, cnpj_pagador: cnpjPagador, cnpj_cpf_destino: cnpjCpfDestino,
          cep_destino: novoOrcamento.cep_destino.trim() || null,
          logradouro_destino: novoOrcamento.logradouro_destino.trim() || null,
          numero_destino: novoOrcamento.numero_destino.trim() || null,
          complemento_destino: novoOrcamento.complemento_destino.trim() || null,
          bairro_destino: novoOrcamento.bairro_destino.trim() || null,
          cidade_destino: novoOrcamento.cidade_destino.trim() || null,
          uf_destino: novoOrcamento.uf_destino.trim() || null,
          endereco_destino: enderecoDestino || null,
          nota: novoOrcamento.nota.trim() || null, valor_produto: valorProduto,
          volumes: volumes.length > 0 ? volumes : null, dimensoes, peso: peso ?? pesoTotal,
          propostas: [], ativo: true, transportadora_id: null,
        },
      });
      setOrcamentoSelecionadoId(orcamentoId);
      setNovoOrcamento({
        numero_cotacao: numeroCotacao, data_criacao: dataCriacaoNormalizada,
        cnpj_pagador: novoOrcamento.cnpj_pagador, cnpj_cpf_destino: novoOrcamento.cnpj_cpf_destino,
        cep_destino: novoOrcamento.cep_destino,
        logradouro_destino: novoOrcamento.logradouro_destino,
        numero_destino: novoOrcamento.numero_destino,
        complemento_destino: novoOrcamento.complemento_destino,
        bairro_destino: novoOrcamento.bairro_destino,
        cidade_destino: novoOrcamento.cidade_destino,
        uf_destino: novoOrcamento.uf_destino,
        endereco_destino: enderecoDestino,
        nota: novoOrcamento.nota, valor_produto: novoOrcamento.valor_produto,
        volumes: novoOrcamento.volumes, dimensoes: novoOrcamento.dimensoes,
        peso: novoOrcamento.peso || String(pesoTotal),
      });
      await loadOrcamentoDetalhe(orcamentoId);
      await loadDashboard();
      setView('orcamentos');
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingOrcamento(false);
    }
  };

  const handleSalvarEdicaoOrcamento = async () => {
    if (!orcamentoSelecionadoId) return;
    setError(null);
    const nota = novoOrcamento.nota.trim();
    const numeroCotacao = novoOrcamento.numero_cotacao.trim();
    const dataCriacaoNormalizada = normalizeDateInput(novoOrcamento.data_criacao);
    
    // Validações de campos obrigatórios básicos
    if (!nota) { setError('Nota é obrigatória.'); return; }
    if (!numeroCotacao) { setError('Número de Cotação é obrigatório.'); return; }
    if (!novoOrcamento.cnpj_cpf_destino.trim()) { setError('CNPJ/CPF de destino é obrigatório.'); return; }
    if (!dataCriacaoNormalizada) { setError('Data válida é obrigatória para atualizar o orçamento.'); return; }
    
    // Validações de endereço obrigatórios
    if (!novoOrcamento.cep_destino.trim()) { setError('CEP de destino é obrigatório.'); return; }
    if (!novoOrcamento.logradouro_destino.trim()) { setError('Logradouro é obrigatório.'); return; }
    if (!novoOrcamento.numero_destino.trim()) { setError('Número é obrigatório.'); return; }
    if (!novoOrcamento.bairro_destino.trim()) { setError('Bairro é obrigatório.'); return; }
    if (!novoOrcamento.cidade_destino.trim()) { setError('Cidade é obrigatória.'); return; }
    if (!novoOrcamento.uf_destino.trim()) { setError('UF é obrigatória.'); return; }
    
    const valorProduto = novoOrcamento.valor_produto ? parseCurrency(novoOrcamento.valor_produto) || null : null;
    const peso = novoOrcamento.peso ? Number(novoOrcamento.peso.replace(',', '.')) : null;
    const volumes = (novoOrcamento.volumes || [])
      .filter((v: any) => v.comprimento || v.largura || v.altura || v.peso)
      .map((v: any) => ({
        comprimento: Number(v.comprimento.replace(',', '.')),
        largura: Number(v.largura.replace(',', '.')),
        altura: Number(v.altura.replace(',', '.')),
        peso: v.peso ? Number(v.peso.replace(',', '.')) : null,
      }));
    
    // Validação de pelo menos um volume completo
    if (volumes.length === 0) { setError('É obrigatório informar pelo menos um volume com dimensões completas.'); return; }
    
    const pesoTotalVolumes = volumes.reduce((acc: number, vol: any) => {
      if (vol.peso !== null && !Number.isNaN(vol.peso)) return acc + vol.peso;
      return acc;
    }, 0);
    const pesoTotal = pesoTotalVolumes;
    const dimensoes = novoOrcamento.dimensoes.comprimento || novoOrcamento.dimensoes.largura || novoOrcamento.dimensoes.altura
      ? {
          comprimento: Number(novoOrcamento.dimensoes.comprimento.replace(',', '.')),
          largura: Number(novoOrcamento.dimensoes.largura.replace(',', '.')),
          altura: Number(novoOrcamento.dimensoes.altura.replace(',', '.')),
        }
      : null;
    if (novoOrcamento.valor_produto && (valorProduto === null || Number.isNaN(valorProduto))) { setError('Valor do produto inválido.'); return; }
    if (novoOrcamento.peso && Number.isNaN(peso)) { setError('Peso inválido.'); return; }
    const enderecoDestino = buildEnderecoDestino(novoOrcamento) || novoOrcamento.endereco_destino.trim();
    setSavingEdicaoOrcamento(true);
    try {
      await invoke<string>('update_orcamento_basico', {
        orcamentoId: orcamentoSelecionadoId,
        descricao: null,
        numeroCotacao: numeroCotacao || null,
        dataCriacao: dataCriacaoNormalizada,
        cnpj_pagador: novoOrcamento.cnpj_pagador.trim() || null, cnpj_cpf_destino: novoOrcamento.cnpj_cpf_destino.trim() || null,
        cep_destino: novoOrcamento.cep_destino.trim() || null,
        logradouro_destino: novoOrcamento.logradouro_destino.trim() || null,
        numero_destino: novoOrcamento.numero_destino.trim() || null,
        complemento_destino: novoOrcamento.complemento_destino.trim() || null,
        bairro_destino: novoOrcamento.bairro_destino.trim() || null,
        cidade_destino: novoOrcamento.cidade_destino.trim() || null,
        uf_destino: novoOrcamento.uf_destino.trim() || null,
        endereco_destino: enderecoDestino || null,
        nota: novoOrcamento.nota.trim() || null, valor_produto: valorProduto,
        volumes: volumes.length > 0 ? volumes : null, dimensoes, peso: peso ?? pesoTotal,
      });
      await loadOrcamentoDetalhe(orcamentoSelecionadoId);
      await loadDashboard();
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingEdicaoOrcamento(false);
    }
  };

  const handleAdicionarPropostaManual = async () => {
    if (!orcamentoSelecionadoId) return;
    setError(null);
    const valorProposta = parseCurrency(novaProposta.valor_proposta);
    const dataProposta = normalizeDateInput(novaProposta.data_proposta);
    const prazoEntregaStr = novaProposta.prazo_entrega.trim();
    const prazoEntrega = Number.parseInt(prazoEntregaStr, 10);
    if (Number.isNaN(valorProposta) || !dataProposta) { setError('Informe valor da proposta e data válidos para cadastrar a proposta.'); return; }
    if (!novaProposta.transportadora_id) { setError('Selecione uma transportadora para cadastrar a proposta.'); return; }
    if (!prazoEntregaStr || Number.isNaN(prazoEntrega) || prazoEntrega <= 0) { setError('Informe o prazo de entrega em dias para cadastrar a proposta.'); return; }
    setSavingProposta(true);
    try {
      await invoke<string>('add_proposta_manual', {
        orcamentoId: orcamentoSelecionadoId, valorProposta: valorProposta,
        transportadoraId: novaProposta.transportadora_id, dataProposta: dataProposta, prazoEntrega,
      });
      setNovaProposta({ valor_proposta: '', transportadora_id: '', data_proposta: getTodayIso(), prazo_entrega: '' });
      await loadOrcamentoDetalhe(orcamentoSelecionadoId);
      await loadDashboard();
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingProposta(false);
    }
  };

  const handleDesativarOrcamento = async () => {
    if (!orcamentoSelecionadoId) return;
    setError(null);
    try {
      await invoke<string>('desativar_orcamento', { orcamentoId: orcamentoSelecionadoId });
      await loadOrcamentoDetalhe(orcamentoSelecionadoId);
      await loadDashboard();
    } catch (err) { setError(String(err)); }
  };

  const handleReativarOrcamento = async () => {
    if (!orcamentoSelecionadoId) return;
    setError(null);
    try {
      await invoke<string>('reativar_orcamento', { orcamentoId: orcamentoSelecionadoId });
      await loadOrcamentoDetalhe(orcamentoSelecionadoId);
      await loadDashboard();
    } catch (err) { setError(String(err)); }
  };

  const handleEscolherGanhadora = async (propostaId: string) => {
    if (!orcamentoSelecionadoId) return;
    setError(null);
    try {
      await invoke<string>('escolher_proposta_ganhadora', { orcamentoId: orcamentoSelecionadoId, propostaId });
      await loadOrcamentoDetalhe(orcamentoSelecionadoId);
      await loadDashboard();
    } catch (err) { setError(String(err)); }
  };

  const handleDesfazerGanhadora = async () => {
    if (!orcamentoSelecionadoId) return;
    setError(null);
    try {
      await invoke<string>('desfazer_proposta_ganhadora', { orcamentoId: orcamentoSelecionadoId });
      await loadOrcamentoDetalhe(orcamentoSelecionadoId);
      await loadDashboard();
    } catch (err) { setError(String(err)); }
  };

  const handleRegistrarNotaManual = async (propostaId: string, valorFretePago: number) => {
    if (!orcamentoSelecionadoId) return;
    setError(null);
    try {
      await invoke<string>('registrar_nota_manual', {
        orcamentoId: orcamentoSelecionadoId,
        propostaId,
        valorFretePago,
      });
      await loadOrcamentoDetalhe(orcamentoSelecionadoId);
      await loadDashboard();
    } catch (err) { setError(String(err)); }
  };

  const handleExcluirProposta = async (propostaId: string) => {
    if (!orcamentoSelecionadoId) return;
    if (!window.confirm('Deseja realmente excluir esta proposta?')) return;
    setError(null);
    try {
      await invoke<string>('delete_proposta', { orcamentoId: orcamentoSelecionadoId, propostaId });
      await loadOrcamentoDetalhe(orcamentoSelecionadoId);
      await loadDashboard();
    } catch (err) { setError(String(err)); }
  };

  const handleApplyFilter = async () => {
    setError(null);
    setFilterLoading(true);
    try {
      let value = '';
      let filtroDescricao = '';
      switch (filterType) {
        case 'nota':
          if (!descricao.trim()) throw new Error('Informe o número da nota para filtrar.');
          value = descricao.trim();
          filtroDescricao = `Nota: ${value}`;
          break;
        case 'descricao':
          if (!descricao.trim()) throw new Error('Informe uma descrição para filtrar.');
          value = descricao.trim();
          filtroDescricao = `Descrição: ${value}`;
          break;
        case 'valor_produto': {
          if (valorMin === '' || valorMax === '') throw new Error('Informe valor mínimo e máximo do produto.');
          const min = Number(valorMin); const max = Number(valorMax);
          if (Number.isNaN(min) || Number.isNaN(max)) throw new Error('Os valores do filtro precisam ser numéricos.');
          value = JSON.stringify([min, max]);
          filtroDescricao = `Valor do produto entre R$ ${min} e R$ ${max}`;
          break;
        }
        case 'peso': {
          if (valorMin === '' || valorMax === '') throw new Error('Informe peso mínimo e máximo.');
          const min = Number(valorMin); const max = Number(valorMax);
          if (Number.isNaN(min) || Number.isNaN(max)) throw new Error('Os valores do filtro precisam ser numéricos.');
          value = JSON.stringify([min, max]);
          filtroDescricao = `Peso entre ${min} kg e ${max} kg`;
          break;
        }
        case 'cep_destino':
          if (!descricao.trim()) throw new Error('Informe o CEP de destino para filtrar.');
          value = descricao.trim();
          filtroDescricao = `CEP destino: ${value}`;
          break;
        case 'data_criacao':
          if (!dataInicial || !dataFinal) throw new Error('Informe a data inicial e final.');
          value = JSON.stringify([dataInicial, dataFinal]);
          filtroDescricao = `Período: ${dataInicial} até ${dataFinal}`;
          break;
        case 'transportadora': {
          if (transportadoraIds.length === 0) throw new Error('Selecione ao menos uma transportadora.');
          value = JSON.stringify(transportadoraIds);
          const nomes = transportadoras.filter((item) => transportadoraIds.includes(item.id)).map((item) => item.nome).join(', ');
          filtroDescricao = `Transportadoras: ${nomes}`;
          break;
        }
      }
      const resultado = await invoke<OrcamentoRecenteItem[]>('filter_orcamentos_by', { filter: filterType, value });
      setOrcamentos(resultado);
      setFiltroAtivoLabel(filtroDescricao);
    } catch (err) {
      setError(String(err));
    } finally {
      setFilterLoading(false);
    }
  };

  const handleClearFilter = async () => {
    setDescricao(''); setValorMin(''); setValorMax(''); setDataInicial(''); setDataFinal('');
    setTransportadoraIds([]); setMostrarInativos(false);
    await loadDashboard(false);
  };

  const handleToggleMostrarInativos = async (val: boolean) => {
    setMostrarInativos(val);
    await loadDashboard(val);
  };

  const handleMarcarDivergenciaTratada = async (orcamentoId: string, tratada: boolean) => {
    try {
      await invoke('marcar_divergencia_tratada', { orcamentoId, tratada });
      setOrcamentoDetalhe((prev) => prev ? { ...prev, divergencia_tratada: tratada } : prev);
      await loadDashboard();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleEnviarEmailDivergencia = async (orcamentoId: string, camposDivergentes: string[]) => {
    try {
      await invoke('enviar_email_divergencia', { orcamentoId, camposDivergentes });
      // showLoading=false: evita desmontar DivergenciasScreen (perderia comparacao/camposAceitos)
      await loadDashboard(undefined, false);
    } catch (err) {
      setError(String(err));
      throw err;
    }
  };

  const handleFinalizarDivergencia = async (orcamentoId: string) => {
    try {
      await invoke('finalizar_divergencia', { orcamentoId });
      await loadDashboard(undefined, false);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleReverterDivergencia = async (orcamentoId: string) => {
    try {
      await invoke('reverter_divergencia', { orcamentoId });
      await loadDashboard(undefined, false);
    } catch (err) {
      setError(String(err));
    }
  };

  if (loading) {
    return (
      <Box sx={{
        minHeight: '100vh', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center',
        backgroundImage: `url(${glassBackground})`, backgroundSize: 'cover', backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat', backgroundColor: '#f8fafc', overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.58)', backdropFilter: 'blur(14px) saturate(150%)', WebkitBackdropFilter: 'blur(14px) saturate(150%)' }} />
        <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', px: 4, py: 6, borderRadius: 4, boxShadow: '0 24px 80px rgba(15, 23, 42, 0.12)', backgroundColor: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.72)', backdropFilter: 'blur(24px)' }}>
          <CircularProgress size={64} thickness={5} />
          <Typography variant="h6" sx={{ mt: 3, color: 'text.primary' }}>Carregando...</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{
      height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: { xs: 'column', sm: 'row' },
      backgroundImage: `url(${glassBackground})`, backgroundSize: 'cover', backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat', backgroundAttachment: 'fixed', backgroundColor: '#f8fafc',
      p: { xs: 1, md: 3 }, boxSizing: 'border-box', gap: { xs: 2, lg: 0 },
    }}>
      <Sidebar view={view} setView={setView} handleNovoOrcamento={handleNovoOrcamento} />

      <Container maxWidth={false} sx={{ m: 0, p: '0 !important', maxWidth: '90vw', flex: 1, height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
        {/* Top Bar */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, px: 2, flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {view === 'dashboard' ? 'Operações' : view === 'transportadoras' ? 'Transportadoras' : view === 'relatorios' ? 'Ajuda' : view === 'divergencia' ? 'Tratar Divergência' : 'Cadastro de Orçamentos'}{' '}
              <Chip label="Live" size="small" sx={{ height: 28, borderRadius: '999px', px: 0.75, fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.04em', color: '#166534', background: 'linear-gradient(180deg, #dcfce7 0%, #bbf7d0 100%)', border: '1px solid rgba(34, 197, 94, 0.35)', boxShadow: '0 6px 16px rgba(34, 197, 94, 0.18)', '& .MuiChip-label': { px: 1 }, '&::before': { content: '""', display: 'block', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#22c55e', boxShadow: '0 0 0 4px rgba(34, 197, 94, 0.18)', marginLeft: '8px' } }} />
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {view === 'dashboard' ? 'Gestão de transportadoras e orçamentos ativos' : view === 'transportadoras' ? 'Gestão e cadastro de transportadoras' : view === 'relatorios' ? 'Ajuda rápida sobre o sistema' : view === 'divergencia' ? 'Análise e resolução de divergências de nota' : 'Cadastro de novos orçamentos no sistema'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            {(() => {
              const naoLidas = notificacoes.filter((n) => !n.lida).length;
              return (
                <Tooltip title={naoLidas > 0 ? `${naoLidas} notificação(ões) não lida(s)` : 'Notificações'} arrow>
                  <IconButton onClick={(e) => setNotifAnchorEl(e.currentTarget)} sx={{ color: naoLidas > 0 ? '#ef4444' : '#64748b', '&:hover': { bgcolor: 'rgba(239,68,68,0.08)' } }}>
                    <Badge badgeContent={naoLidas} color="error" max={99}><NotificationsActive /></Badge>
                  </IconButton>
                </Tooltip>
              );
            })()}
            {googleAuth?.authenticated ? (
              <Tooltip title={googleAuth.email || 'Conta Google conectada'} arrow>
                <Avatar sx={{ bgcolor: '#4285f4', width: 36, height: 36, fontSize: '0.95rem', fontWeight: 700, cursor: 'default', background: 'linear-gradient(135deg, #4285f4 0%, #34a853 100%)' }}>
                  {googleAuth.email ? googleAuth.email[0].toUpperCase() : 'G'}
                </Avatar>
              </Tooltip>
            ) : (
              <Tooltip title="Conta Google não conectada" arrow>
                <Avatar sx={{ bgcolor: '#94a3b8', width: 36, height: 36 }}><AccountCircle sx={{ fontSize: 22 }} /></Avatar>
              </Tooltip>
            )}
          </Stack>
        </Box>

        {/* Notification Popover */}
        <Popover open={Boolean(notifAnchorEl)} anchorEl={notifAnchorEl} onClose={() => setNotifAnchorEl(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { ...glassPanel, borderRadius: '16px', width: 400, maxHeight: 560, overflowY: 'auto', mt: 0.5 } } }}>
          <Box sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <NotificationsActive sx={{ color: '#ef4444', fontSize: 20 }} />
                <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1rem' }}>Notificações</Typography>
                {notificacoes.filter((n) => !n.lida).length > 0 && (
                  <Chip label={`${notificacoes.filter((n) => !n.lida).length} não lida(s)`} size="small" color="error" sx={{ fontWeight: 700, fontSize: '0.7rem', height: 20 }} />
                )}
              </Stack>
              {notificacoes.some((n) => !n.lida) && (
                <Button size="small" sx={{ textTransform: 'none', fontSize: '0.72rem', color: '#64748b' }} onClick={async () => {
                  await Promise.all(notificacoes.filter((n) => !n.lida).map((n) => invoke('marcar_notificacao_lida', { notificacaoId: n.id })));
                  setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
                }}>Marcar todas como lidas</Button>
              )}
            </Stack>
            {notificacoes.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>Nenhuma notificação.</Typography>
            ) : (
              <Stack spacing={0.75}>
                {notificacoes.map((notif) => (
                  <Box key={notif.id} sx={{ p: 1.5, borderRadius: '10px', bgcolor: notif.lida ? 'rgba(0,0,0,0.02)' : 'rgba(239,68,68,0.07)', border: `1px solid ${notif.lida ? 'rgba(0,0,0,0.06)' : 'rgba(239,68,68,0.22)'}`, opacity: notif.lida ? 0.7 : 1 }}>
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <WarningAmberIcon sx={{ fontSize: 18, color: notif.lida ? '#94a3b8' : '#ef4444', mt: 0.25, flexShrink: 0 }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: notif.lida ? '#64748b' : '#991b1b', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{notif.orcamento_descricao}</Typography>
                        <Typography variant="caption" color="text.secondary" display="block">{notif.mensagem}</Typography>
                        <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.65rem' }}>{new Date(notif.criada_em).toLocaleString('pt-BR')}</Typography>
                      </Box>
                      <Stack direction="row" spacing={0.5} flexShrink={0}>
                        {!notif.lida && (
                          <Tooltip title="Marcar como lida" arrow>
                            <IconButton size="small" onClick={async () => {
                              await invoke('marcar_notificacao_lida', { notificacaoId: notif.id });
                              setNotificacoes((prev) => prev.map((n) => (n.id === notif.id ? { ...n, lida: true } : n)));
                            }} sx={{ color: '#22c55e', p: 0.25 }}>
                              <CheckCircle sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Excluir" arrow>
                          <IconButton size="small" onClick={async () => {
                            await invoke('excluir_notificacao', { notificacaoId: notif.id });
                            setNotificacoes((prev) => prev.filter((n) => n.id !== notif.id));
                          }} sx={{ color: '#ef4444', p: 0.25 }}>
                            <Delete sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
            {emailsPendentes.filter((ep) => ep.tipo === 'nota').length > 0 && (
              <>
                <Divider sx={{ my: 1.5 }} />
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#94a3b8', display: 'block', mb: 1 }}>ÚLTIMAS NOTAS RECEBIDAS</Typography>
                <Stack spacing={0.75}>
                  {emailsPendentes.filter((ep) => ep.tipo === 'nota').slice(0, 5).map((ep) => {
                    const alertaRelacionado = alertas.find((a) => a.transportadora === ep.transportadora_nome);
                    return (
                      <Stack key={ep.id} direction="row" alignItems="center" spacing={1} sx={{ p: 1, borderRadius: '8px', bgcolor: alertaRelacionado ? 'rgba(239,68,68,0.05)' : 'rgba(34,197,94,0.04)', border: `1px solid ${alertaRelacionado ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.12)'}` }}>
                        {alertaRelacionado ? <WarningAmberIcon sx={{ fontSize: 15, color: '#ef4444', flexShrink: 0 }} /> : <CheckCircle sx={{ fontSize: 15, color: '#22c55e', flexShrink: 0 }} />}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.transportadora_nome}</Typography>
                          {ep.valor_extraido != null && <Typography variant="caption" sx={{ color: '#64748b' }}>R$ {(ep.valor_extraido / 100).toFixed(2)}</Typography>}
                        </Box>
                      </Stack>
                    );
                  })}
                </Stack>
              </>
            )}
          </Box>
        </Popover>

        {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}

        {view === 'dashboard' ? (
          <DashboardScreen
            stats={stats} orcamentos={orcamentos} alertas={alertas}
            googleAuth={googleAuth} googleAuthLoading={googleAuthLoading}
            watcherStatus={watcherStatus} watcherLoading={watcherLoading}
            emailsPendentes={emailsPendentes} emailAssociarId={emailAssociarId}
            orcamentoAssociarId={orcamentoAssociarId} filterType={filterType}
            descricao={descricao} valorMin={valorMin} valorMax={valorMax}
            dataInicial={dataInicial} dataFinal={dataFinal}
            transportadoraIds={transportadoraIds} transportadoras={transportadoras}
            filtroAtivoLabel={filtroAtivoLabel} mostrarInativos={mostrarInativos}
            filterLoading={filterLoading} setFilterType={setFilterType}
            setDescricao={setDescricao} setValorMin={setValorMin} setValorMax={setValorMax}
            setDataInicial={setDataInicial} setDataFinal={setDataFinal}
            setTransportadoraIds={setTransportadoraIds}
            setEmailAssociarId={setEmailAssociarId} setOrcamentoAssociarId={setOrcamentoAssociarId}
            handleApplyFilter={handleApplyFilter} handleClearFilter={handleClearFilter}
            handleToggleMostrarInativos={handleToggleMostrarInativos}
            handleResolverDivergencia={handleResolverDivergencia}
            handleVerDetalhes={handleVerDetalhes} handleExcluirOrcamento={handleExcluirOrcamento}
            handleGoogleLogin={handleGoogleLogin} handleGoogleLogout={handleGoogleLogout}
            handleToggleWatcher={handleToggleWatcher} handleDescartarEmail={handleDescartarEmail}
            handleExcluirEmail={handleExcluirEmail} handleAssociarEmail={handleAssociarEmail}
          />
        ) : view === 'transportadoras' ? (
          <TransportadorasScreen
            transportadoras={transportadoras} novaTransportadora={novaTransportadora}
            editandoTransportadora={editandoTransportadora} savingTransportadora={savingTransportadora}
            setNovaTransportadora={setNovaTransportadora} setEditandoTransportadora={setEditandoTransportadora}
            setTransportadoraEmEdicao={setTransportadoraEmEdicao}
            handleSalvarTransportadora={handleSalvarTransportadora}
            handleSalvarEdicaoTransportadora={handleSalvarEdicaoTransportadora}
            handleEditarTransportadora={handleEditarTransportadora}
            handleDeletarTransportadora={handleDeletarTransportadora}
          />
        ) : view === 'divergencia' ? (
          <DivergenciasScreen
            divergenciaAtual={divergenciaAtual} orcamentoDetalhe={orcamentoDetalhe}
            transportadoras={transportadoras} transportadoraMetricas={transportadoraMetricas}
            detalheLoading={detalheLoading} metricasLoading={metricasLoading}
            detalheVolumesAgregados={detalheVolumesAgregados}
            setView={setView} setOrcamentoDetalhe={setOrcamentoDetalhe}
            onMarcarDivergenciaTratada={handleMarcarDivergenciaTratada}
            onEnviarEmailDivergencia={handleEnviarEmailDivergencia}
            onFinalizarDivergencia={handleFinalizarDivergencia}
            onReverterDivergencia={handleReverterDivergencia}
          />
        ) : view === 'relatorios' ? (
          <RelatoriosScreen />
        ) : (
          <OrcamentosScreen
            orcamentoSelecionadoId={orcamentoSelecionadoId} orcamentoDetalhe={orcamentoDetalhe}
            novoOrcamento={novoOrcamento} novaProposta={novaProposta}
            transportadoras={transportadoras} savingOrcamento={savingOrcamento}
            savingEdicaoOrcamento={savingEdicaoOrcamento} savingProposta={savingProposta}
            detalheLoading={detalheLoading} sendingOrcamentoEmail={sendingOrcamentoEmail}
            showEnviarOrcamentoModal={showEnviarOrcamentoModal}
            selectedTransportadoraIds={selectedTransportadoraIds}
            forceSendTransportadoraIds={forceSendTransportadoraIds}
            cepError={cepError} volumesAgregados={volumesAgregados}
            modalError={modalError}
            setNovoOrcamento={setNovoOrcamento} setNovaProposta={setNovaProposta}
            setShowEnviarOrcamentoModal={(v) => { setShowEnviarOrcamentoModal(v); if (!v) setModalError(null); }}
            handleSalvarOrcamento={handleSalvarOrcamento}
            handleSalvarEdicaoOrcamento={handleSalvarEdicaoOrcamento}
            handleAdicionarPropostaManual={handleAdicionarPropostaManual}
            handleDesativarOrcamento={handleDesativarOrcamento}
            handleReativarOrcamento={handleReativarOrcamento}
            handleEscolherGanhadora={handleEscolherGanhadora}
            handleDesfazerGanhadora={handleDesfazerGanhadora}
            handleExcluirProposta={handleExcluirProposta}
            handleRegistrarNotaManual={handleRegistrarNotaManual}
            handleOpenEnviarOrcamentoModal={handleOpenEnviarOrcamentoModal}
            handleEnviarEmailOrcamento={handleEnviarEmailOrcamento}
            handleToggleSelectTransportadora={handleToggleSelectTransportadora}
            handleToggleForceSendTransportadora={handleToggleForceSendTransportadora}
            setSelectedTransportadoraIds={setSelectedTransportadoraIds}
          />
        )}
      </Container>
    </Box>
  );
};

export default App;
