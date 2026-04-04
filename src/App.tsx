import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  Avatar,
  CircularProgress,
  Alert,
  Tooltip,
  FormControl,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  InputAdornment,
  InputLabel,
  OutlinedInput,
  Switch,
  FormControlLabel,
  Badge,
  Popover,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
} from '@mui/material';
import {
  Email,
  LocalShipping,
  Add,
  Search,
  Delete,
  Tune,
  AttachMoney,
  CalendarMonth,
  FilterAlt,
  RestartAlt,
  FitnessCenter,
  DeleteOutline,
  Dashboard as DashboardIcon,
  BarChart,
  NotificationsActive,
  CheckCircle,
  Close,
  AccountCircle,
  TrendingUp,
  ArrowBack,
  Warning as WarningAmberIcon,
} from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import glassBackground from './assets/glass-background-bordeaux.svg';
import './App.css';

type FilterKey = 'descricao' | 'cep_destino' | 'valor_produto' | 'peso' | 'data_criacao' | 'transportadora';
type AppView = 'dashboard' | 'transportadoras' | 'orcamentos' | 'relatorios' | 'divergencia';

// ============ Tipos TypeScript ============
type DashboardStats = {
  orcamentos_ativos: number;
  propostas_recebidas: number;
  divergencias_nota: number;
  transportadoras: number;
};

type OrcamentoRecenteItem = {
  id: string;
  pedido: string;
  status: string;
  propostas: number;
  data: string;
  transportadoras_preview: string[];
};

type DashboardAlertaItem = {
  id: string;
  orcamento_id: string;
  transportadora: string;
  transportadora_id: string | null;
  msg: string;
  severity: 'error' | 'info' | 'warning';
};

type TransportadoraMetricas = {
  total_transacoes: number;
  transacoes_com_divergencia: number;
  taxa_divergencia_pct: number;
  valor_medio_proposta: number;
  valor_medio_frete_pago: number;
  divergencia_media: number;
};

type Transportadora = {
  id: string;
  nome: string;
  cnpj: string;
  telefone: string;
  email_orcamento: string;
  email_nota: string;
};

type PropostaDetalhe = {
  id: string;
  valor_proposta: number;
  valor_frete_pago?: number | null;
  prazo_entrega?: string | null;
  transportadora_id?: string | null;
  transportadora_nome?: string | null;
  data_proposta: string;
};

type OrcamentoDetalhe = {
  id: string;
  descricao: string;
  data_criacao: string;
  ativo: boolean;
  cnpj_pagador?: string | null;
  cnpj_cpf_destino?: string | null;
  cep_destino?: string | null;
  endereco_destino?: string | null;
  nota?: string | null;
  valor_produto?: number | null;
  qtd_volumes?: number | null;
  volumes?: { comprimento: number; largura: number; altura: number; peso?: number | null }[] | null;
  dimensoes?: { comprimento: number; largura: number; altura: number } | null;
  peso?: number | null;
  peso_total?: number | null;
  proposta_ganhadora_id?: string | null;
  propostas: PropostaDetalhe[];
  divergencia_tratada: boolean;
  transportadoras_enviadas: string[];
};

type GoogleAuthStatus = {
  authenticated: boolean;
  email: string | null;
};

type WatcherStatus = {
  running: boolean;
  last_check: string | null;
  emails_processados: number;
  ultimo_erro: string | null;
};

type EmailPendente = {
  id: string;
  gmail_message_id: string;
  tipo: string;
  transportadora_nome: string;
  assunto: string | null;
  remetente: string | null;
  valor_extraido: number | null;
  processado_em: string;
  status: string;
};

type Notificacao = {
  id: string;
  orcamento_id: string;
  orcamento_descricao: string;
  mensagem: string;
  lida: boolean;
  criada_em: string;
};

// Estilo Glass (Glassmorphism)
const glassPanel = {
  background: 'rgba(255, 255, 255, 0.2)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  border: '1px solid rgba(255, 255, 255, 0.4)',
  borderRadius: '24px',
  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.08)',
};

const onlyDigits = (value: string) => value.replace(/\D/g, '');

const formatCNPJ = (value: string) => {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

const formatCPF = (value: string) => {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const formatCnpjOrCpf = (value: string) => {
  const digits = onlyDigits(value);
  if (digits.length > 11) {
    return formatCNPJ(digits);
  }
  return formatCPF(digits);
};

const tableHeaderRowSx = {
  background: 'linear-gradient(90deg, rgba(255,255,255,0.28) 0%, rgba(168, 28, 60, 0.10) 100%)',
  '& th:first-of-type': {
    borderTopLeftRadius: '14px',
    borderBottomLeftRadius: '14px',
  },
  '& th:last-of-type': {
    borderTopRightRadius: '14px',
    borderBottomRightRadius: '14px',
  },
};

const tableHeaderCellSx = {
  border: 'none',
  color: '#475569',
  fontWeight: 900,
  fontSize: '0.8rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  py: 1.75,
  boxShadow: 'inset 0 -1px 0 rgba(15, 23, 42, 0.08)',
};

const getTodayIso = () => new Date().toISOString().slice(0, 10);

const normalizeDateInput = (raw: string) => {
  const value = raw.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const brMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${year}-${month}-${day}`;
  }

  return '';
};

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
  const [filterType, setFilterType] = useState<FilterKey>('descricao');
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
  const [novaTransportadora, setNovaTransportadora] = useState({
    nome: '',
    cnpj: '',
    telefone: '',
    email_orcamento: '',
    email_nota: '',
  });
  const [editandoTransportadora, setEditandoTransportadora] = useState(false);
  const [transportadoraEmEdicao, setTransportadoraEmEdicao] = useState<Transportadora | null>(null);
  const [novoOrcamento, setNovoOrcamento] = useState({
    descricao: '',
    data_criacao: getTodayIso(),
    cnpj_pagador: '',
    cnpj_cpf_destino: '',
    cep_destino: '',
    endereco_destino: '',
    nota: '',
    valor_produto: '',
    volumes: [{ comprimento: '', largura: '', altura: '', peso: '' }],
    dimensoes: { comprimento: '', largura: '', altura: '' },
    peso: '',
  });
  const [orcamentoSelecionadoId, setOrcamentoSelecionadoId] = useState<string | null>(null);
  const [orcamentoDetalhe, setOrcamentoDetalhe] = useState<OrcamentoDetalhe | null>(null);
  const [novaProposta, setNovaProposta] = useState({
    valor_proposta: '',
    transportadora_id: '',
    data_proposta: getTodayIso(),
    prazo_entrega: '',
  });

  const volumesAgregados = useMemo(() => {
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

    return {
      count: volumes.length,
      totalPeso,
      totalVolume,
    };
  }, [novoOrcamento.volumes]);

  const detalheVolumesAgregados = useMemo(() => {
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

    return {
      count: volumes.length,
      totalPeso,
      totalVolume,
    };
  }, [orcamentoDetalhe]);

  // ── Google Auth State ───────────────────────────────────
  const [googleAuth, setGoogleAuth] = useState<GoogleAuthStatus | null>(null);
  const [googleAuthLoading, setGoogleAuthLoading] = useState(false);

  // ── Notification State ──────────────────────────────────
  const [notifAnchorEl, setNotifAnchorEl] = useState<HTMLElement | null>(null);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);

  // ── Divergência State ───────────────────────────────────
  const [divergenciaAtual, setDivergenciaAtual] = useState<DashboardAlertaItem | null>(null);
  const [transportadoraMetricas, setTransportadoraMetricas] = useState<TransportadoraMetricas | null>(null);
  const [metricasLoading, setMetricasLoading] = useState(false);

  // ── Email Watcher State ─────────────────────────────────
  const [watcherStatus, setWatcherStatus] = useState<WatcherStatus | null>(null);
  const [emailsPendentes, setEmailsPendentes] = useState<EmailPendente[]>([]);
  const [watcherLoading, setWatcherLoading] = useState(false);
  const [emailAssociarId, setEmailAssociarId] = useState<string | null>(null);
  const [orcamentoAssociarId, setOrcamentoAssociarId] = useState('');

  useEffect(() => {
    if (!error) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setError(null);
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [error]);

  // ============ Carrega dados ao montar ============
  useEffect(() => {
    loadDashboard();
  }, []);

  // ============ Listener de mudança no banco (watcher) ============
  useEffect(() => {
    const unlisten = listen('db-changed', () => {
      loadDashboard(undefined, false);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // ============ Validador de CEP + busca endereço (ViaCEP) ============
  useEffect(() => {
    let timeoutId: number | undefined;
    const cepInput = novoOrcamento.cep_destino || '';
    const cepLimpo = cepInput.replace(/\D/g, '');

    if (!cepInput.trim()) {
      setCepError(null);
      return;
    }

    if (cepLimpo.length !== 8) {
      setCepError('CEP inválido. Deve ter 8 dígitos.');
      return;
    }

    setCepError(null);

    timeoutId = window.setTimeout(async () => {
      try {
        const resp = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
        if (!resp.ok) {
          throw new Error('Falha ao buscar CEP');
        }

        const data = await resp.json();
        if (data.erro) {
          setCepError('CEP não encontrado.');
          return;
        }

        const enderecoFormatado = [data.logradouro, data.bairro, data.localidade, data.uf]
          .filter(Boolean)
          .join(', ');

        setNovoOrcamento((prev) => ({
          ...prev,
          endereco_destino: enderecoFormatado || prev.endereco_destino,
        }));
        setCepError(null);
      } catch (err) {
        setCepError('Não foi possível consultar o CEP.');
      }
    }, 500);

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [novoOrcamento.cep_destino]);

  const loadDashboard = async (includeInactive?: boolean, showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    setError(null);
    const inactive = includeInactive ?? mostrarInativos;

    try {
      // Sincronizar notificações de divergências existentes (sem bloquear)
      invoke('sync_notificacoes_divergencias').catch(() => {});;

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
      if (showLoading) {
        setLoading(false);
      }
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
      const metricas = await invoke<TransportadoraMetricas>('get_transportadora_metricas', {
        transportadoraId,
      });
      setTransportadoraMetricas(metricas);
    } catch (err) {
      console.error('Erro ao carregar métricas da transportadora:', err);
      setTransportadoraMetricas(null);
    } finally {
      setMetricasLoading(false);
    }
  };

  // ── Google Auth Handlers ──────────────────────────────────

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
    // Limpa estado atual para forçar re-render mesmo se authenticated já era true
    setGoogleAuth(null);
    try {
      await invoke<string>('google_auth_start_login');
      await loadGoogleAuthStatus();
      // Inicia o watcher automaticamente após login bem-sucedido
      try {
        await invoke('start_email_watcher');
        await loadWatcherStatus();
      } catch (watcherErr) {
        console.warn('Watcher não iniciado automaticamente:', watcherErr);
      }
    } catch (err) {
      setError(String(err));
      // Restaura status em caso de erro
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

  // ── Email Watcher Handlers ────────────────────────────────

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

  // Carregar auth status ao montar
  useEffect(() => {
    loadGoogleAuthStatus();
  }, []);

  // Polling do watcher status a cada 10s quando na view dashboard
  useEffect(() => {
    loadWatcherStatus();
    loadEmailsPendentes();
    const interval = setInterval(() => {
      loadWatcherStatus();
      loadEmailsPendentes();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadOrcamentoDetalhe = async (orcamentoId: string) => {
    setDetalheLoading(true);
    try {
      const detalhe = await invoke<OrcamentoDetalhe>('get_orcamento_detalhe', {
        orcamentoId,
      });
      setOrcamentoDetalhe(detalhe);
      setNovoOrcamento({
        descricao: detalhe.descricao,
        data_criacao: detalhe.data_criacao,
        cnpj_pagador: detalhe.cnpj_pagador || '',
        cnpj_cpf_destino: detalhe.cnpj_cpf_destino || '',
        cep_destino: detalhe.cep_destino || '',
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
      descricao: '',
      data_criacao: getTodayIso(),
      cnpj_pagador: '',
      cnpj_cpf_destino: '',
      cep_destino: '',
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

    if (
      !payload.nome ||
      !payload.cnpj ||
      !payload.telefone ||
      !payload.email_orcamento ||
      !payload.email_nota
    ) {
      setError('Preencha todos os campos para cadastrar a transportadora.');
      return;
    }

    setSavingTransportadora(true);
    try {
      await invoke<string>('add_transportadora', { transportadora: payload });
      setNovaTransportadora({
        nome: '',
        cnpj: '',
        telefone: '',
        email_orcamento: '',
        email_nota: '',
      });
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
      prev.includes(transportadoraId)
        ? prev.filter((id) => id !== transportadoraId)
        : [...prev, transportadoraId]
    );
  };

  const handleOpenEnviarOrcamentoModal = () => {
    if (!orcamentoSelecionadoId) {
      setError('Abra um orçamento existente para enviar e-mails.');
      return;
    }

    const alreadySentIds = orcamentoDetalhe?.transportadoras_enviadas || [];
    const defaultSelection = transportadoras
      .filter((item) => !alreadySentIds.includes(item.id))
      .map((item) => item.id);

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
    setError(null);
    setSuccessMessage(null);

    if (!orcamentoSelecionadoId) {
      setError('Abra um orçamento existente para enviar e-mails.');
      return;
    }

    if (selectedTransportadoraIds.length === 0) {
      setError('Selecione ao menos uma transportadora.');
      return;
    }

    if (!novoOrcamento.descricao.trim() || !novoOrcamento.nota.trim() || !novoOrcamento.valor_produto.trim()) {
      setError('Preencha descrição, nota e valor do produto antes de enviar.');
      return;
    }

    setSendingOrcamentoEmail(true);
    try {
      const response = await invoke<string>('send_orcamento_request_email', {
        orcamentoId: orcamentoSelecionadoId,
        transportadoraIds: selectedTransportadoraIds,
        descricao: novoOrcamento.descricao.trim(),
        nota: novoOrcamento.nota.trim(),
        valorProduto: novoOrcamento.valor_produto.trim(),
        peso: novoOrcamento.peso.trim(),
        cepDestino: novoOrcamento.cep_destino.trim(),
        enderecoDestino: novoOrcamento.endereco_destino.trim(),
        dataCriacao: novoOrcamento.data_criacao.trim(),
      });
      setSuccessMessage(response);
      setShowEnviarOrcamentoModal(false);
      await loadOrcamentoDetalhe(orcamentoSelecionadoId);
    } catch (err) {
      setError(String(err));
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

    if (!transportadoraEmEdicao?.id) {
      setError('ID de transportadora inválido');
      return;
    }

    const payload = {
      nome: novaTransportadora.nome.trim(),
      cnpj: novaTransportadora.cnpj.trim(),
      telefone: novaTransportadora.telefone.trim(),
      email_orcamento: novaTransportadora.email_orcamento.trim(),
      email_nota: novaTransportadora.email_nota.trim(),
    };

    if (
      !payload.nome ||
      !payload.cnpj ||
      !payload.telefone ||
      !payload.email_orcamento ||
      !payload.email_nota
    ) {
      setError('Preencha todos os campos para atualizar a transportadora.');
      return;
    }

    setSavingTransportadora(true);
    try {
      await invoke<string>('update_transportadora', {
        transportadoraId: transportadoraEmEdicao.id,
        transportadora: payload,
      });
      setEditandoTransportadora(false);
      setTransportadoraEmEdicao(null);
      setNovaTransportadora({
        nome: '',
        cnpj: '',
        telefone: '',
        email_orcamento: '',
        email_nota: '',
      });
      await loadDashboard();
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingTransportadora(false);
    }
  };

  const handleDeletarTransportadora = async (transportadora: Transportadora) => {
    if (!transportadora.id) {
      setError('ID de transportadora inválido');
      return;
    }

    if (!window.confirm(`Tem certeza que deseja deletar a transportadora "${transportadora.nome}"?`)) {
      return;
    }

    setError(null);
    setSavingTransportadora(true);
    try {
      await invoke<string>('delete_transportadora', {
        transportadora_id: transportadora.id,
      });
      await loadDashboard();
    } catch (err) {
      setError(String(err));
    } finally {
      setSavingTransportadora(false);
    }
  };

  const handleSalvarOrcamento = async () => {
    setError(null);

    const descricao = novoOrcamento.descricao.trim();
    const dataCriacaoNormalizada = normalizeDateInput(novoOrcamento.data_criacao);

    if (!descricao || !novoOrcamento.data_criacao.trim()) {
      setError('Preencha descrição e data para cadastrar o orçamento.');
      return;
    }

    if (!dataCriacaoNormalizada) {
      setError('Data inválida. Use dd/mm/aaaa ou aaaa-mm-dd.');
      return;
    }

    const valorProduto = novoOrcamento.valor_produto
      ? Number(novoOrcamento.valor_produto.replace(',', '.'))
      : null;
    const peso = novoOrcamento.peso
      ? Number(novoOrcamento.peso.replace(',', '.'))
      : null;

    const volumes = (novoOrcamento.volumes || [])
      .filter((v: any) => v.comprimento || v.largura || v.altura || v.peso)
      .map((v: any) => ({
        comprimento: Number(v.comprimento.replace(',', '.')),
        largura: Number(v.largura.replace(',', '.')),
        altura: Number(v.altura.replace(',', '.')),
        peso: v.peso ? Number(v.peso.replace(',', '.')) : null,
      }));

    const pesoTotalVolumes = volumes.reduce((acc: number, vol: any) => {
      if (vol.peso !== null && !Number.isNaN(vol.peso)) {
        return acc + vol.peso;
      }
      return acc;
    }, 0);

    const pesoTotal = pesoTotalVolumes;
    const dimensoes =
      novoOrcamento.dimensoes.comprimento ||
      novoOrcamento.dimensoes.largura ||
      novoOrcamento.dimensoes.altura
        ? {
            comprimento: Number(novoOrcamento.dimensoes.comprimento.replace(',', '.')),
            largura: Number(novoOrcamento.dimensoes.largura.replace(',', '.')),
            altura: Number(novoOrcamento.dimensoes.altura.replace(',', '.')),
          }
        : null;
    const cnpjPagador = novoOrcamento.cnpj_pagador?.trim() || null;
    const cnpjCpfDestino = novoOrcamento.cnpj_cpf_destino?.trim() || null;

    if (novoOrcamento.valor_produto && Number.isNaN(valorProduto)) {
      setError('Valor do produto inválido.');
      return;
    }

    if (novoOrcamento.peso && Number.isNaN(peso)) {
      setError('Peso inválido.');
      return;
    }

    if (volumes.some((vol: any) => Number.isNaN(vol.comprimento) || Number.isNaN(vol.largura) || Number.isNaN(vol.altura))) {
      setError('Pelo menos um volume possui dimensão inválida.');
      return;
    }

    if (volumes.some((vol: any) => vol.peso !== null && Number.isNaN(vol.peso))) {
      setError('Pelo menos um volume possui peso inválido.');
      return;
    }

    setSavingOrcamento(true);
    try {
      const orcamentoId = await invoke<string>('add_orcamento', {
        orcamento: {
          descricao,
          data_criacao: dataCriacaoNormalizada,
          cnpj_pagador: cnpjPagador,
          cnpj_cpf_destino: cnpjCpfDestino,
          cep_destino: novoOrcamento.cep_destino.trim() || null,
          endereco_destino: novoOrcamento.endereco_destino.trim() || null,
          nota: novoOrcamento.nota.trim() || null,
          valor_produto: valorProduto,
          volumes: volumes.length > 0 ? volumes : null,
          dimensoes,
          peso: peso ?? pesoTotal,
          propostas: [],
          ativo: true,
          transportadora_id: null,
        },
      });

      setOrcamentoSelecionadoId(orcamentoId);
      setNovoOrcamento({
        descricao,
        data_criacao: dataCriacaoNormalizada,
        cnpj_pagador: novoOrcamento.cnpj_pagador,
        cnpj_cpf_destino: novoOrcamento.cnpj_cpf_destino,
        cep_destino: novoOrcamento.cep_destino,
        endereco_destino: novoOrcamento.endereco_destino,
        nota: novoOrcamento.nota,
        valor_produto: novoOrcamento.valor_produto,
        volumes: novoOrcamento.volumes,
        dimensoes: novoOrcamento.dimensoes,
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
    const descricao = novoOrcamento.descricao.trim();
    const dataCriacaoNormalizada = normalizeDateInput(novoOrcamento.data_criacao);

    if (!descricao || !dataCriacaoNormalizada) {
      setError('Descrição e data válidas são obrigatórias para atualizar o orçamento.');
      return;
    }

    const valorProduto = novoOrcamento.valor_produto
      ? Number(novoOrcamento.valor_produto.replace(',', '.'))
      : null;
    const peso = novoOrcamento.peso
      ? Number(novoOrcamento.peso.replace(',', '.'))
      : null;
    const volumes = (novoOrcamento.volumes || [])
      .filter((v: any) => v.comprimento || v.largura || v.altura || v.peso)
      .map((v: any) => ({
        comprimento: Number(v.comprimento.replace(',', '.')),
        largura: Number(v.largura.replace(',', '.')),
        altura: Number(v.altura.replace(',', '.')),
        peso: v.peso ? Number(v.peso.replace(',', '.')) : null,
      }));

    const pesoTotalVolumes = volumes.reduce((acc: number, vol: any) => {
      if (vol.peso !== null && !Number.isNaN(vol.peso)) {
        return acc + vol.peso;
      }
      return acc;
    }, 0);

    const pesoTotal = pesoTotalVolumes;
    const dimensoes =
      novoOrcamento.dimensoes.comprimento ||
      novoOrcamento.dimensoes.largura ||
      novoOrcamento.dimensoes.altura
        ? {
            comprimento: Number(novoOrcamento.dimensoes.comprimento.replace(',', '.')),
            largura: Number(novoOrcamento.dimensoes.largura.replace(',', '.')),
            altura: Number(novoOrcamento.dimensoes.altura.replace(',', '.')),
          }
        : null;

    if (novoOrcamento.valor_produto && Number.isNaN(valorProduto)) {
      setError('Valor do produto inválido.');
      return;
    }

    if (novoOrcamento.peso && Number.isNaN(peso)) {
      setError('Peso inválido.');
      return;
    }

    setSavingEdicaoOrcamento(true);
    try {
      await invoke<string>('update_orcamento_basico', {
        orcamentoId: orcamentoSelecionadoId,
        descricao,
        dataCriacao: dataCriacaoNormalizada,
        cnpj_pagador: novoOrcamento.cnpj_pagador.trim() || null,
        cnpj_cpf_destino: novoOrcamento.cnpj_cpf_destino.trim() || null,
        cep_destino: novoOrcamento.cep_destino.trim() || null,
        endereco_destino: novoOrcamento.endereco_destino.trim() || null,
        nota: novoOrcamento.nota.trim() || null,
        valor_produto: valorProduto,
        volumes: volumes.length > 0 ? volumes : null,
        dimensoes,
        peso: peso ?? pesoTotal,
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
    const valorProposta = Number(novaProposta.valor_proposta.replace(',', '.').trim());
    const dataProposta = normalizeDateInput(novaProposta.data_proposta);
    const prazoEntrega = novaProposta.prazo_entrega.trim();

    if (Number.isNaN(valorProposta) || !dataProposta) {
      setError('Informe valor da proposta e data válidos para cadastrar a proposta.');
      return;
    }

    if (!novaProposta.transportadora_id) {
      setError('Selecione uma transportadora para cadastrar a proposta.');
      return;
    }

    if (!prazoEntrega) {
      setError('Informe o prazo de entrega para cadastrar a proposta.');
      return;
    }

    setSavingProposta(true);
    try {
      await invoke<string>('add_proposta_manual', {
        orcamentoId: orcamentoSelecionadoId,
        valorProposta: valorProposta,
        transportadoraId: novaProposta.transportadora_id,
        dataProposta: dataProposta,
        prazoEntrega,
      });

      setNovaProposta({
        valor_proposta: '',
        transportadora_id: '',
        data_proposta: getTodayIso(),
        prazo_entrega: '',
      });

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
    } catch (err) {
      setError(String(err));
    }
  };

  const handleReativarOrcamento = async () => {
    if (!orcamentoSelecionadoId) return;

    setError(null);
    try {
      await invoke<string>('reativar_orcamento', { orcamentoId: orcamentoSelecionadoId });
      await loadOrcamentoDetalhe(orcamentoSelecionadoId);
      await loadDashboard();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleEscolherGanhadora = async (propostaId: string) => {
    if (!orcamentoSelecionadoId) return;

    setError(null);
    try {
      await invoke<string>('escolher_proposta_ganhadora', {
        orcamentoId: orcamentoSelecionadoId,
        propostaId,
      });
      await loadOrcamentoDetalhe(orcamentoSelecionadoId);
      await loadDashboard();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDesfazerGanhadora = async () => {
    if (!orcamentoSelecionadoId) return;

    setError(null);
    try {
      await invoke<string>('desfazer_proposta_ganhadora', {
        orcamentoId: orcamentoSelecionadoId,
      });
      await loadOrcamentoDetalhe(orcamentoSelecionadoId);
      await loadDashboard();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleExcluirProposta = async (propostaId: string) => {
    if (!orcamentoSelecionadoId) return;

    const confirmado = window.confirm('Deseja realmente excluir esta proposta?');
    if (!confirmado) return;

    setError(null);
    try {
      await invoke<string>('delete_proposta', {
        orcamentoId: orcamentoSelecionadoId,
        propostaId,
      });
      await loadOrcamentoDetalhe(orcamentoSelecionadoId);
      await loadDashboard();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleApplyFilter = async () => {
    setError(null);
    setFilterLoading(true);

    try {
      let value = '';
      let filtroDescricao = '';

      switch (filterType) {
        case 'descricao':
          if (!descricao.trim()) {
            throw new Error('Informe uma descrição para filtrar.');
          }
          value = descricao.trim();
          filtroDescricao = `Descrição: ${value}`;
          break;
        case 'valor_produto': {
          if (valorMin === '' || valorMax === '') {
            throw new Error('Informe valor mínimo e máximo do produto.');
          }
          const min = Number(valorMin);
          const max = Number(valorMax);
          if (Number.isNaN(min) || Number.isNaN(max)) {
            throw new Error('Os valores do filtro precisam ser numéricos.');
          }
          value = JSON.stringify([min, max]);
          filtroDescricao = `Valor do produto entre R$ ${min} e R$ ${max}`;
          break;
        }
        case 'peso': {
          if (valorMin === '' || valorMax === '') {
            throw new Error('Informe peso mínimo e máximo.');
          }
          const min = Number(valorMin);
          const max = Number(valorMax);
          if (Number.isNaN(min) || Number.isNaN(max)) {
            throw new Error('Os valores do filtro precisam ser numéricos.');
          }
          value = JSON.stringify([min, max]);
          filtroDescricao = `Peso entre ${min} kg e ${max} kg`;
          break;
        }
        case 'cep_destino':
          if (!descricao.trim()) {
            throw new Error('Informe o CEP de destino para filtrar.');
          }
          value = descricao.trim();
          filtroDescricao = `CEP destino: ${value}`;
          break;
        case 'data_criacao':
          if (!dataInicial || !dataFinal) {
            throw new Error('Informe a data inicial e final.');
          }
          value = JSON.stringify([dataInicial, dataFinal]);
          filtroDescricao = `Período: ${dataInicial} até ${dataFinal}`;
          break;
        case 'transportadora': {
          if (transportadoraIds.length === 0) {
            throw new Error('Selecione ao menos uma transportadora.');
          }
          value = JSON.stringify(transportadoraIds);
          const nomes = transportadoras
            .filter((item) => transportadoraIds.includes(item.id))
            .map((item) => item.nome)
            .join(', ');
          filtroDescricao = `Transportadoras: ${nomes}`;
          break;
        }
      }

      const resultado = await invoke<OrcamentoRecenteItem[]>('filter_orcamentos_by', {
        filter: filterType,
        value,
      });

      setOrcamentos(resultado);
      setFiltroAtivoLabel(filtroDescricao);
    } catch (err) {
      setError(String(err));
    } finally {
      setFilterLoading(false);
    }
  };

  const handleClearFilter = async () => {
    setDescricao('');
    setValorMin('');
    setValorMax('');
    setDataInicial('');
    setDataFinal('');
    setTransportadoraIds([]);
    setMostrarInativos(false);
    await loadDashboard(false);
  };

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundImage: `url(${glassBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#f8fafc',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(255,255,255,0.58)',
            backdropFilter: 'blur(14px) saturate(150%)',
            WebkitBackdropFilter: 'blur(14px) saturate(150%)',
          }}
        />
        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            px: 4,
            py: 6,
            borderRadius: 4,
            boxShadow: '0 24px 80px rgba(15, 23, 42, 0.12)',
            backgroundColor: 'rgba(255,255,255,0.75)',
            border: '1px solid rgba(255,255,255,0.72)',
            backdropFilter: 'blur(24px)',
          }}
        >
          <CircularProgress size={64} thickness={5} />
          <Typography variant="h6" sx={{ mt: 3, color: 'text.primary' }}>
            Carregando...
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        backgroundImage: `url(${glassBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        backgroundColor: '#f8fafc',
        p: { xs: 1, md: 3 },
        boxSizing: 'border-box',
        gap: { xs: 2, lg: 0 },
      }}
    >
      {/* Top Bar (mobile) */}
      <Box
        sx={{
          ...glassPanel,
          display: { xs: 'flex', sm: 'none' },
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          width: '100%',
        }}
      >
        <Avatar sx={{ bgcolor: '#6366f1', fontWeight: 'bold', width: 36, height: 36, fontSize: '0.9rem' }}>L</Avatar>
        <Stack
          direction="row"
          sx={{
            '& .MuiIconButton-root': { width: 40, height: 40 },
            flex: 1,
            ml: 1,
            justifyContent: 'space-between',
          }}
        >
          <Tooltip title="Dashboard" arrow>
            <IconButton
              onClick={() => setView('dashboard')}
              sx={{
                color: view === 'dashboard' ? '#6366f1' : '#64748b',
                bgcolor: view === 'dashboard' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              }}
            >
              <DashboardIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Cadastro de Orçamentos" arrow>
            <IconButton
              onClick={handleNovoOrcamento}
              sx={{
                color: view === 'orcamentos' ? '#6366f1' : '#64748b',
                bgcolor: view === 'orcamentos' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              }}
            >
              <Add />
            </IconButton>
          </Tooltip>
          <Tooltip title="Transportadoras" arrow>
            <IconButton
              onClick={() => setView('transportadoras')}
              sx={{
                color: view === 'transportadoras' ? '#6366f1' : '#64748b',
                bgcolor: view === 'transportadoras' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              }}
            >
              <LocalShipping />
            </IconButton>
          </Tooltip>
          <Tooltip title="Relatórios" arrow>
            <IconButton
              onClick={() => setView('relatorios')}
              sx={{
                color: view === 'relatorios' ? '#6366f1' : '#64748b',
                bgcolor: view === 'relatorios' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              }}
            >
              <BarChart />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* Sidebar Glass (desktop) */}
      <Box
        sx={{
          ...glassPanel,
          width: '80px',
          display: { xs: 'none', sm: 'flex' },
          flexDirection: 'column',
          alignItems: 'center',
          py: 4,
          mr: 3,
          height: '100vh',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          alignSelf: 'flex-start',
          overflowY: 'hidden',
        }}
      >
        <Avatar sx={{ bgcolor: '#6366f1', mb: 6, fontWeight: 'bold' }}>L</Avatar>
        <Stack spacing={4} sx={{ '& .MuiIconButton-root': { width: 40, height: 40 } }}>
          <Tooltip title="Dashboard" placement="right" arrow>
            <IconButton
              onClick={() => setView('dashboard')}
              sx={{
                color: view === 'dashboard' ? '#6366f1' : '#64748b',
                bgcolor: view === 'dashboard' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              }}
            >
              <DashboardIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Cadastro de Orçamentos" placement="right" arrow>
            <IconButton
              onClick={handleNovoOrcamento}
              sx={{
                color: view === 'orcamentos' ? '#6366f1' : '#64748b',
                bgcolor: view === 'orcamentos' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              }}
            >
              <Add />
            </IconButton>
          </Tooltip>
          <Tooltip title="Transportadoras" placement="right" arrow>
            <IconButton
              onClick={() => setView('transportadoras')}
              sx={{
                color: view === 'transportadoras' ? '#6366f1' : '#64748b',
                bgcolor: view === 'transportadoras' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              }}
            >
              <LocalShipping />
            </IconButton>
          </Tooltip>
          <Tooltip title="Relatórios" placement="right" arrow>
            <IconButton
              onClick={() => setView('relatorios')}
              sx={{
                color: view === 'relatorios' ? '#6366f1' : '#64748b',
                bgcolor: view === 'relatorios' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              }}
            >
              <BarChart />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      <Container maxWidth={false} sx={{ m: 0, p: '0 !important', maxWidth: '90vw', flex: 1, height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
        {/* Top Bar */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2,
            px: 2,
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Box>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 900,
                color: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap',
              }}
            >
              {view === 'dashboard'
                ? 'Operações'
                : view === 'transportadoras'
                  ? 'Transportadoras'
                  : view === 'relatorios'
                    ? 'Relatórios'
                    : view === 'divergencia'
                      ? 'Tratar Divergência'
                      : 'Cadastro de Orçamentos'}{' '}
              <Chip
                label="Live"
                size="small"
                sx={{
                  height: 28,
                  borderRadius: '999px',
                  px: 0.75,
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  color: '#166534',
                  background: 'linear-gradient(180deg, #dcfce7 0%, #bbf7d0 100%)',
                  border: '1px solid rgba(34, 197, 94, 0.35)',
                  boxShadow: '0 6px 16px rgba(34, 197, 94, 0.18)',
                  '& .MuiChip-label': {
                    px: 1,
                  },
                  '&::before': {
                    content: '""',
                    display: 'block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: '#22c55e',
                    boxShadow: '0 0 0 4px rgba(34, 197, 94, 0.18)',
                    marginLeft: '8px',
                  },
                }}
              />
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {view === 'dashboard'
                ? 'Gestão de transportadoras e orçamentos ativos'
                : view === 'transportadoras'
                  ? 'Gestão e cadastro de transportadoras'
                  : view === 'relatorios'
                    ? 'Em construção'
                    : view === 'divergencia'
                      ? 'Análise e resolução de divergências de nota'
                      : 'Cadastro de novos orçamentos no sistema'}
            </Typography>
          </Box>

          {/* Top-right: Notification Bell + Google Avatar */}
          <Stack direction="row" spacing={1} alignItems="center">
            {(() => {
              const naoLidas = notificacoes.filter((n) => !n.lida).length;
              return (
                <Tooltip title={naoLidas > 0 ? `${naoLidas} notificação(ões) não lida(s)` : 'Notificações'} arrow>
                  <IconButton
                    onClick={(e) => setNotifAnchorEl(e.currentTarget)}
                    sx={{
                      color: naoLidas > 0 ? '#ef4444' : '#64748b',
                      '&:hover': { bgcolor: 'rgba(239,68,68,0.08)' },
                    }}
                  >
                    <Badge badgeContent={naoLidas} color="error" max={99}>
                      <NotificationsActive />
                    </Badge>
                  </IconButton>
                </Tooltip>
              );
            })()}

            {googleAuth?.authenticated ? (
              <Tooltip title={googleAuth.email || 'Conta Google conectada'} arrow>
                <Avatar
                  sx={{
                    bgcolor: '#4285f4',
                    width: 36,
                    height: 36,
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    cursor: 'default',
                    background: 'linear-gradient(135deg, #4285f4 0%, #34a853 100%)',
                  }}
                >
                  {googleAuth.email ? googleAuth.email[0].toUpperCase() : 'G'}
                </Avatar>
              </Tooltip>
            ) : (
              <Tooltip title="Conta Google não conectada" arrow>
                <Avatar sx={{ bgcolor: '#94a3b8', width: 36, height: 36 }}>
                  <AccountCircle sx={{ fontSize: 22 }} />
                </Avatar>
              </Tooltip>
            )}
          </Stack>
        </Box>

        {/* Notification Popover */}
        <Popover
          open={Boolean(notifAnchorEl)}
          anchorEl={notifAnchorEl}
          onClose={() => setNotifAnchorEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{
            paper: {
              sx: {
                ...glassPanel,
                borderRadius: '16px',
                width: 400,
                maxHeight: 560,
                overflowY: 'auto',
                mt: 0.5,
              },
            },
          }}
        >
          <Box sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <NotificationsActive sx={{ color: '#ef4444', fontSize: 20 }} />
                <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1rem' }}>
                  Notificações
                </Typography>
                {notificacoes.filter((n) => !n.lida).length > 0 && (
                  <Chip
                    label={`${notificacoes.filter((n) => !n.lida).length} não lida(s)`}
                    size="small"
                    color="error"
                    sx={{ fontWeight: 700, fontSize: '0.7rem', height: 20 }}
                  />
                )}
              </Stack>
              {notificacoes.some((n) => !n.lida) && (
                <Button
                  size="small"
                  sx={{ textTransform: 'none', fontSize: '0.72rem', color: '#64748b' }}
                  onClick={async () => {
                    await Promise.all(
                      notificacoes
                        .filter((n) => !n.lida)
                        .map((n) => invoke('marcar_notificacao_lida', { notificacaoId: n.id }))
                    );
                    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
                  }}
                >
                  Marcar todas como lidas
                </Button>
              )}
            </Stack>

            {/* Divergências persistidas */}
            {notificacoes.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                Nenhuma notificação.
              </Typography>
            ) : (
              <Stack spacing={0.75}>
                {notificacoes.map((notif) => (
                  <Box
                    key={notif.id}
                    sx={{
                      p: 1.5,
                      borderRadius: '10px',
                      bgcolor: notif.lida ? 'rgba(0,0,0,0.02)' : 'rgba(239,68,68,0.07)',
                      border: `1px solid ${notif.lida ? 'rgba(0,0,0,0.06)' : 'rgba(239,68,68,0.22)'}`,
                      opacity: notif.lida ? 0.7 : 1,
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <WarningAmberIcon
                        sx={{ fontSize: 18, color: notif.lida ? '#94a3b8' : '#ef4444', mt: 0.25, flexShrink: 0 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 700,
                            color: notif.lida ? '#64748b' : '#991b1b',
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {notif.orcamento_descricao}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {notif.mensagem}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.65rem' }}>
                          {new Date(notif.criada_em).toLocaleString('pt-BR')}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.5} flexShrink={0}>
                        {!notif.lida && (
                          <Tooltip title="Marcar como lida" arrow>
                            <IconButton
                              size="small"
                              onClick={async () => {
                                await invoke('marcar_notificacao_lida', { notificacaoId: notif.id });
                                setNotificacoes((prev) =>
                                  prev.map((n) => (n.id === notif.id ? { ...n, lida: true } : n))
                                );
                              }}
                              sx={{ color: '#22c55e', p: 0.25 }}
                            >
                              <CheckCircle sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Excluir" arrow>
                          <IconButton
                            size="small"
                            onClick={async () => {
                              await invoke('excluir_notificacao', { notificacaoId: notif.id });
                              setNotificacoes((prev) => prev.filter((n) => n.id !== notif.id));
                            }}
                            sx={{ color: '#ef4444', p: 0.25 }}
                          >
                            <Delete sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}

            {/* Seção de notas recebidas por email */}
            {emailsPendentes.filter((ep) => ep.tipo === 'nota').length > 0 && (
              <>
                <Divider sx={{ my: 1.5 }} />
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#94a3b8', display: 'block', mb: 1 }}>
                  ÚLTIMAS NOTAS RECEBIDAS
                </Typography>
                <Stack spacing={0.75}>
                  {emailsPendentes
                    .filter((ep) => ep.tipo === 'nota')
                    .slice(0, 5)
                    .map((ep) => {
                      const alertaRelacionado = alertas.find(
                        (a) => a.transportadora === ep.transportadora_nome
                      );
                      return (
                        <Stack
                          key={ep.id}
                          direction="row"
                          alignItems="center"
                          spacing={1}
                          sx={{
                            p: 1,
                            borderRadius: '8px',
                            bgcolor: alertaRelacionado ? 'rgba(239,68,68,0.05)' : 'rgba(34,197,94,0.04)',
                            border: `1px solid ${alertaRelacionado ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.12)'}`,
                          }}
                        >
                          {alertaRelacionado ? (
                            <WarningAmberIcon sx={{ fontSize: 15, color: '#ef4444', flexShrink: 0 }} />
                          ) : (
                            <CheckCircle sx={{ fontSize: 15, color: '#22c55e', flexShrink: 0 }} />
                          )}
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ep.transportadora_nome}
                            </Typography>
                            {ep.valor_extraido != null && (
                              <Typography variant="caption" sx={{ color: '#64748b' }}>
                                R$ {(ep.valor_extraido / 100).toFixed(2)}
                              </Typography>
                            )}
                          </Box>
                        </Stack>
                      );
                    })}
                </Stack>
              </>
            )}
          </Box>
        </Popover>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {view === 'dashboard' ? (
          <>

        <Box sx={{ ...glassPanel, p: 2, mb: 2 }}>
          {/* Linha 1: título + seletor + campo de filtro */}
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', md: 'center' }}
            flexWrap="wrap"
          >
            <Stack spacing={0.5} sx={{ minWidth: 160, flexShrink: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f172a' }}>
                Filtros de orçamento
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Descrição, CEP destino, valor produto, peso, data ou transportadora.
              </Typography>
            </Stack>

            <TextField
              select
              label="Tipo de filtro"
              variant="outlined"
              value={filterType}
              onChange={(event) => setFilterType(event.target.value as FilterKey)}
              sx={{ width: 220, flexShrink: 0, '& .MuiOutlinedInput-root': { borderRadius: 0, '& .MuiInputAdornment-positionStart': { marginRight: 0 }, '& .MuiOutlinedInput-input': { boxShadow: 'none' } } }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Tune sx={{ color: '#64748b' }} />
                    </InputAdornment>
                  ),
                },
              }}
            >
              <MenuItem value="descricao">Descrição</MenuItem>
              <MenuItem value="cep_destino">CEP de destino</MenuItem>
              <MenuItem value="valor_produto">Faixa valor do produto</MenuItem>
              <MenuItem value="peso">Faixa de peso</MenuItem>
              <MenuItem value="data_criacao">Data de criação</MenuItem>
              <MenuItem value="transportadora">Transportadora</MenuItem>
            </TextField>

            {filterType === 'descricao' && (
              <TextField
                label="Descrição exata"
                variant="outlined"
                placeholder="Ex.: Pedido 123"
                value={descricao}
                onChange={(event) => setDescricao(event.target.value)}
                sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-root': { borderRadius: 0, '& .MuiInputAdornment-positionStart': { marginRight: 0 }, '& .MuiOutlinedInput-input': { boxShadow: 'none' } } }}
                fullWidth
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search sx={{ color: '#64748b' }} />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            )}

            {(filterType === 'valor_produto' || filterType === 'peso') && (
              <Stack direction="row" spacing={2} sx={{ flex: 1 }}>
                <TextField
                  label={filterType === 'peso' ? 'Peso mínimo (kg)' : 'Valor mínimo (R$)'}
                  variant="outlined"
                  type="text"
                  inputMode="decimal"
                  value={valorMin}
                  onChange={(event) => setValorMin(event.target.value)}
                  sx={{ flex: 1, minWidth: 140, '& .MuiOutlinedInput-root': { borderRadius: 0, '& .MuiInputAdornment-positionStart': { marginRight: 0 }, '& .MuiOutlinedInput-input': { boxShadow: 'none' } } }}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start">{filterType === 'peso' ? <FitnessCenter sx={{ color: '#64748b' }} /> : <AttachMoney sx={{ color: '#64748b' }} />}</InputAdornment> } }}
                />
                <TextField
                  label={filterType === 'peso' ? 'Peso máximo (kg)' : 'Valor máximo (R$)'}
                  variant="outlined"
                  type="text"
                  inputMode="decimal"
                  value={valorMax}
                  onChange={(event) => setValorMax(event.target.value)}
                  sx={{ flex: 1, minWidth: 140, '& .MuiOutlinedInput-root': { borderRadius: 0, '& .MuiInputAdornment-positionStart': { marginRight: 0 }, '& .MuiOutlinedInput-input': { boxShadow: 'none' } } }}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start">{filterType === 'peso' ? <FitnessCenter sx={{ color: '#64748b' }} /> : <AttachMoney sx={{ color: '#64748b' }} />}</InputAdornment> } }}
                />
              </Stack>
            )}

            {filterType === 'data_criacao' && (
              <Stack direction="row" spacing={2} sx={{ flex: 1 }}>
                <TextField
                  label="Data inicial"
                  variant="outlined"
                  type="date"
                  value={dataInicial}
                  onChange={(event) => setDataInicial(event.target.value)}
                  sx={{ flex: 1, minWidth: 160, '& .MuiOutlinedInput-root': { borderRadius: 0, '& .MuiInputAdornment-positionStart': { marginRight: 0 }, '& .MuiOutlinedInput-input': { boxShadow: 'none' } } }}
                  InputLabelProps={{ shrink: true }}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start"><CalendarMonth sx={{ color: '#64748b' }} /></InputAdornment> } }}
                />
                <TextField
                  label="Data final"
                  variant="outlined"
                  type="date"
                  value={dataFinal}
                  onChange={(event) => setDataFinal(event.target.value)}
                  sx={{ flex: 1, minWidth: 160, '& .MuiOutlinedInput-root': { borderRadius: 0, '& .MuiInputAdornment-positionStart': { marginRight: 0 }, '& .MuiOutlinedInput-input': { boxShadow: 'none' } } }}
                  InputLabelProps={{ shrink: true }}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start"><CalendarMonth sx={{ color: '#64748b' }} /></InputAdornment> } }}
                />
              </Stack>
            )}

            {filterType === 'transportadora' && (
              <FormControl variant="outlined" sx={{ flex: 1, minWidth: 240 }}>
                <InputLabel id="transportadoras-label">Transportadoras</InputLabel>
                <Select
                  labelId="transportadoras-label"
                  multiple
                  value={transportadoraIds}
                  displayEmpty
                  input={
                    <OutlinedInput
                      label="Transportadoras"
                      startAdornment={
                        <InputAdornment position="start">
                          <LocalShipping sx={{ color: '#64748b' }} />
                        </InputAdornment>
                      }
                      sx={{ '& .MuiInputAdornment-positionStart': { marginRight: 0 }, '& .MuiOutlinedInput-input': { boxShadow: 'none' } }}
                    />
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    setTransportadoraIds(typeof value === 'string' ? value.split(',') : value);
                  }}
                  renderValue={(selected) => {
                    const nomes = transportadoras
                      .filter((item) => selected.includes(item.id))
                      .map((item) => item.nome);
                    return nomes.length > 0 ? nomes.join(', ') : 'Selecione as transportadoras';
                  }}
                >
                  {transportadoras.map((item) => {
                    const itemId = item.id;
                    return (
                      <MenuItem key={itemId} value={itemId}>
                        <Checkbox checked={transportadoraIds.includes(itemId)} />
                        <ListItemText primary={item.nome} secondary={item.email_orcamento} />
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>
            )}
          </Stack>

          {/* Linha 2: ações */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems={{ xs: 'stretch', sm: 'center' }}
            flexWrap="wrap"
            sx={{ mt: 1.5, px: { xs: 0.5, sm: 0 } }}
          >
            <Button
              variant="contained"
              startIcon={<FilterAlt />}
              onClick={handleApplyFilter}
              disabled={filterLoading}
              sx={{
                borderRadius: '14px',
                textTransform: 'none',
                width: { xs: '100%', sm: 180 },
                minWidth: { xs: '100%', sm: 180 },
                height: 42,
              }}
            >
              {filterLoading ? 'Filtrando...' : 'Aplicar filtro'}
            </Button>
            <Button
              variant="outlined"
              startIcon={<RestartAlt />}
              onClick={handleClearFilter}
              disabled={filterLoading}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: '14px',
                height: 42,
                width: { xs: '100%', sm: 180 },
                minWidth: { xs: '100%', sm: 180 },
                borderColor: 'rgba(99, 102, 241, 0.22)',
                color: '#4f46e5',
                backgroundColor: 'rgba(255,255,255,0.35)',
              }}
            >
              Limpar
            </Button>
            <FormControlLabel
              control={
                <Switch
                  checked={mostrarInativos}
                  onChange={async (e) => {
                    const val = e.target.checked;
                    setMostrarInativos(val);
                    await loadDashboard(val);
                  }}
                />
              }
              label={
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#64748b' }}>
                  Mostrar inativos
                </Typography>
              }
              sx={{ m: 0, pl: { xs: 0.5, sm: 0 } }}
            />
            {filtroAtivoLabel && (
              <Chip
                label={filtroAtivoLabel}
                onDelete={handleClearFilter}
                sx={{ maxWidth: 300 }}
              />
            )}
          </Stack>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' },
            alignItems: 'stretch',
            gap: 2,
          }}
        >
          {/* Coluna Esquerda - Orçamentos & Alertas */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
            {/* Alerta de Divergência - Banner Principal (apenas o mais recente) */}
            {alertas.length > 0 && (
              <Box
                sx={{
                  ...glassPanel,
                  p: 3,
                  background:
                    'linear-gradient(90deg, rgba(239, 68, 68, 0.1) 0%, rgba(255, 255, 255, 0.3) 100%)',
                  borderLeft: '6px solid #ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 2,
                }}
              >
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: '50%',
                      bgcolor: '#ef4444',
                      color: 'white',
                      display: 'flex',
                    }}
                  >
                    <NotificationsActive />
                  </Box>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#991b1b' }}>
                      Divergência de Nota Detectada
                      {alertas.length > 1 && (
                        <Chip
                          label={`+${alertas.length - 1} mais`}
                          size="small"
                          color="error"
                          sx={{ ml: 1, fontWeight: 700, fontSize: '0.7rem', height: 20 }}
                        />
                      )}
                    </Typography>
                    <Typography variant="body2">
                      Transportadora <b>{alertas[0].transportadora}</b>: {alertas[0].msg}
                    </Typography>
                  </Box>
                </Stack>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => handleResolverDivergencia(alertas[0])}
                  sx={{ borderRadius: '12px', fontWeight: 'bold' }}
                >
                  Resolver Agora
                </Button>
              </Box>
            )}

            {/* Orçamentos em Aberto */}
            <Box sx={{ ...glassPanel, p: 3, flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
                {mostrarInativos ? 'Todos os Orçamentos' : 'Orçamentos em Aberto'}
              </Typography>
              <TableContainer sx={{ border: 'none', flex: 1, overflowY: 'auto' }}>
                <Table>
                  <TableHead>
                    <TableRow sx={tableHeaderRowSx}>
                      <TableCell sx={tableHeaderCellSx}>
                        ENTIDADE
                      </TableCell>
                      <TableCell sx={tableHeaderCellSx}>
                        PROPOSTAS
                      </TableCell>
                      <TableCell sx={tableHeaderCellSx}>
                        STATUS
                      </TableCell>
                      <TableCell sx={tableHeaderCellSx}>
                        DATA
                      </TableCell>
                      <TableCell sx={tableHeaderCellSx}>
                        AÇÃO
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {orcamentos.map((item) => (
                      <TableRow
                        key={item.id}
                        sx={{
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' },
                          transition: '0.2s',
                        }}
                      >
                        <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)', py: 2 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {item.pedido.substring(0, 20)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.id.substring(0, 8)}...
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                          <Stack direction="row" spacing={-1}>
                            {item.transportadoras_preview.map((nome, i) => (
                              <Tooltip key={`${item.id}-${nome}-${i}`} title={nome} arrow>
                                <Avatar
                                  sx={{
                                    width: 24,
                                    height: 24,
                                    fontSize: 10,
                                    border: '2px solid white',
                                    bgcolor: '#6366f1',
                                    cursor: 'help',
                                  }}
                                >
                                  {nome.charAt(0).toUpperCase()}
                                </Avatar>
                              </Tooltip>
                            ))}
                            {item.propostas > 3 && (
                              <Tooltip title={`${item.propostas - 3} transportadora(s) adicional(is)`} arrow>
                                <Box
                                  sx={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: '50%',
                                    bgcolor: '#e2e8f0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 10,
                                    fontWeight: 'bold',
                                    cursor: 'help',
                                  }}
                                >
                                  +{item.propostas - 3}
                                </Box>
                              </Tooltip>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                          <Chip
                            label={item.status}
                            size="small"
                            color={
                              item.status === 'Nota Recebida' || item.status === 'Concluído'
                                ? 'success'
                                : item.status === 'Aguardando Nota'
                                  ? 'info'
                                  : item.status === 'Em Análise'
                                    ? 'warning'
                                    : item.status === 'Encerrado'
                                      ? 'error'
                                      : 'default'
                            }
                            sx={{ fontWeight: 'bold' }}
                          />
                        </TableCell>
                        <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                          <Typography variant="caption">{item.data}</Typography>
                        </TableCell>
                        <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Button
                              size="small"
                              onClick={() => handleVerDetalhes(item.id)}
                              sx={{
                                textTransform: 'none',
                                color: '#6366f1',
                                fontWeight: 'bold',
                              }}
                            >
                              Ver
                            </Button>
                            <Tooltip title="Excluir orçamento" arrow>
                              <IconButton
                                size="small"
                                onClick={() => handleExcluirOrcamento(item.id)}
                                sx={{ color: '#ef4444', '&:hover': { bgcolor: 'rgba(239,68,68,0.08)' } }}
                              >
                                <Delete fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                    {orcamentos.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} sx={{ borderBottom: 'none', py: 5, textAlign: 'center' }}>
                          <Typography variant="body2" color="text.secondary">
                            Nenhum orçamento encontrado para o filtro selecionado.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Box>

          {/* Coluna Direita - Estatísticas & IA */}
          <Stack spacing={2}>
            {/* Email Monitor */}
            <Box sx={{ ...glassPanel, p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  Monitor de Emails
                </Typography>
                {googleAuth?.authenticated && (
                  <Button
                    size="small"
                    variant={watcherStatus?.running ? 'outlined' : 'contained'}
                    color={watcherStatus?.running ? 'error' : 'primary'}
                    onClick={handleToggleWatcher}
                    disabled={watcherLoading}
                    sx={{
                      borderRadius: '12px',
                      textTransform: 'none',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                    }}
                  >
                    {watcherLoading ? '...' : watcherStatus?.running ? 'Parar' : 'Iniciar'}
                  </Button>
                )}
              </Stack>

              {/* Google Auth Section */}
              {!googleAuth?.authenticated ? (
                <Box
                  sx={{
                    p: 3,
                    borderRadius: '16px',
                    bgcolor: 'rgba(99, 102, 241, 0.05)',
                    border: '1px dashed #6366f1',
                    textAlign: 'center',
                  }}
                >
                  <Email sx={{ color: '#6366f1', fontSize: 40, mb: 1 }} />
                  <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                    Conecte sua conta Gmail
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                    Para monitorar emails de transportadoras, autorize o acesso à sua conta Google.
                  </Typography>
                  <Button
                    variant="contained"
                    onClick={handleGoogleLogin}
                    disabled={googleAuthLoading}
                    startIcon={googleAuthLoading ? <CircularProgress size={16} color="inherit" /> : <Email />}
                    sx={{
                      borderRadius: '12px',
                      textTransform: 'none',
                      fontWeight: 700,
                      background: 'linear-gradient(135deg, #4285f4 0%, #34a853 100%)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #3367d6 0%, #2d9249 100%)',
                      },
                    }}
                  >
                    {googleAuthLoading ? 'Aguardando autorização...' : 'Entrar com Google'}
                  </Button>
                </Box>
              ) : (
                <>
                  {/* Conta conectada */}
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: '12px',
                      bgcolor: 'rgba(34, 197, 94, 0.06)',
                      border: '1px solid rgba(34, 197, 94, 0.2)',
                      mb: 2,
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={1} alignItems="center">
                        <CheckCircle sx={{ color: '#22c55e', fontSize: 18 }} />
                        <Box>
                          <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                            Conta conectada
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {googleAuth.email || 'Gmail'}
                          </Typography>
                        </Box>
                      </Stack>
                      <Button
                        size="small"
                        color="inherit"
                        onClick={handleGoogleLogout}
                        disabled={googleAuthLoading}
                        sx={{
                          textTransform: 'none',
                          fontSize: '0.7rem',
                          color: '#94a3b8',
                          minWidth: 'auto',
                        }}
                      >
                        Desconectar
                      </Button>
                    </Stack>
                  </Box>

                  {/* Watcher Status */}
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: '16px',
                      bgcolor: watcherStatus?.running ? 'rgba(34, 197, 94, 0.05)' : 'rgba(99, 102, 241, 0.05)',
                      border: `1px dashed ${watcherStatus?.running ? '#22c55e' : '#6366f1'}`,
                      mb: 2,
                    }}
                  >
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Email sx={{ color: watcherStatus?.running ? '#22c55e' : '#6366f1' }} />
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {watcherStatus?.running ? 'Monitorando...' : 'Parado'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {watcherStatus?.last_check
                            ? `Último check: ${new Date(watcherStatus.last_check).toLocaleTimeString('pt-BR')}`
                            : 'Aguardando início'}
                        </Typography>
                      </Box>
                    </Stack>
                    {watcherStatus?.running && (
                      <LinearProgress
                        variant="indeterminate"
                        sx={{
                          mt: 2,
                          borderRadius: 5,
                          height: 4,
                          bgcolor: 'rgba(34,197,94,0.1)',
                          '& .MuiLinearProgress-bar': { bgcolor: '#22c55e' },
                        }}
                      />
                    )}
                  </Box>
                </>
              )}

              {googleAuth?.authenticated && watcherStatus?.ultimo_erro && (
                <Typography variant="caption" display="block" sx={{ color: '#ef4444', mb: 1 }}>
                  ⚠ {watcherStatus.ultimo_erro.slice(0, 80)}
                </Typography>
              )}

              {googleAuth?.authenticated && (
              <>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                ÚLTIMOS EMAILS ({emailsPendentes.length})
              </Typography>
              <Stack spacing={1} sx={{ mt: 1, maxHeight: 200, overflowY: 'auto' }}>
                {emailsPendentes.slice(0, 5).map((ep) => (
                  <Box
                    key={ep.id}
                    sx={{
                      p: 1,
                      borderRadius: '8px',
                      bgcolor: ep.status === 'aplicado' ? 'rgba(34,197,94,0.06)' : ep.status === 'descartado' ? 'rgba(100,100,100,0.06)' : 'rgba(99,102,241,0.06)',
                      border: '1px solid rgba(0,0,0,0.05)',
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="caption" display="block" sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ep.transportadora_nome}
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ep.assunto || 'Sem assunto'}
                        </Typography>
                        <Typography variant="caption" display="block" color="text.secondary">
                          {ep.tipo === 'cotacao' ? '📋 Cotação' : '📄 Nota'}
                          {ep.valor_extraido != null && ` • R$ ${(ep.valor_extraido / 100).toFixed(2)}`}
                          {' • '}
                          <Chip
                            label={ep.status}
                            size="small"
                            sx={{
                              height: 16,
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              bgcolor: ep.status === 'aplicado' ? '#22c55e' : ep.status === 'pendente' ? '#f59e0b' : '#94a3b8',
                              color: 'white',
                            }}
                          />
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.5}>
                        {ep.status === 'pendente' && (
                          <>
                            <IconButton
                              size="small"
                              color="primary"
                              title="Associar a orçamento"
                              onClick={() => {
                                setEmailAssociarId(ep.id);
                                setOrcamentoAssociarId('');
                              }}
                            >
                              <CheckCircle sx={{ fontSize: 16 }} />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="warning"
                              title="Descartar"
                              onClick={() => handleDescartarEmail(ep.id)}
                            >
                              <Delete sx={{ fontSize: 16 }} />
                            </IconButton>
                          </>
                        )}
                        <IconButton
                          size="small"
                          color="error"
                          title="Excluir email"
                          onClick={() => handleExcluirEmail(ep.id)}
                        >
                          <Close sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Stack>
                    </Stack>
                    {emailAssociarId === ep.id && (
                      <Box sx={{ mt: 1 }}>
                        <FormControl size="small" fullWidth>
                          <Select
                            value={orcamentoAssociarId}
                            onChange={(e) => setOrcamentoAssociarId(e.target.value)}
                            displayEmpty
                            sx={{ fontSize: '0.75rem', height: 30 }}
                          >
                            <MenuItem value="" disabled>Selecione o orçamento</MenuItem>
                            {orcamentos.filter(o => o.status !== 'Encerrado').map(o => (
                              <MenuItem key={o.id} value={o.id} sx={{ fontSize: '0.75rem' }}>
                                {o.pedido}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                          <Button
                            size="small"
                            variant="contained"
                            disabled={!orcamentoAssociarId}
                            onClick={() => handleAssociarEmail(ep.id, orcamentoAssociarId)}
                            sx={{ textTransform: 'none', fontSize: '0.7rem', borderRadius: '8px' }}
                          >
                            Associar
                          </Button>
                          <Button
                            size="small"
                            onClick={() => setEmailAssociarId(null)}
                            sx={{ textTransform: 'none', fontSize: '0.7rem' }}
                          >
                            Cancelar
                          </Button>
                        </Stack>
                      </Box>
                    )}
                  </Box>
                ))}
                {emailsPendentes.length === 0 && (
                  <Typography variant="caption" color="text.secondary">
                    Nenhum email processado ainda
                  </Typography>
                )}
              </Stack>
              <Stack spacing={1} sx={{ mt: 2 }}>
                <Typography variant="caption" display="block">
                  ✅ <b>Sistema</b>: {stats?.propostas_recebidas} propostas recebidas
                </Typography>
                <Typography variant="caption" display="block">
                  ✅ <b>Monitor</b>: {watcherStatus?.emails_processados ?? 0} emails processados
                </Typography>
              </Stack>
              </>
              )}
            </Box>

          </Stack>
        </Box>
        </>
        ) : view === 'transportadoras' ? (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', xl: '1fr 1.5fr' },
              gap: 2,
            }}
          >
            <Box sx={{ ...glassPanel, p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
                Cadastro de Transportadora
              </Typography>
              <Stack spacing={2}>
                <TextField
                  label="Nome"
                  value={novaTransportadora.nome}
                  onChange={(event) =>
                    setNovaTransportadora((prev) => ({ ...prev, nome: event.target.value }))
                  }
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                  fullWidth
                />
                <TextField
                  label="CNPJ"
                  value={novaTransportadora.cnpj}
                  onFocus={() =>
                    setNovaTransportadora((prev) => ({ ...prev, cnpj: onlyDigits(prev.cnpj) }))
                  }
                  onBlur={() =>
                    setNovaTransportadora((prev) => ({ ...prev, cnpj: formatCNPJ(prev.cnpj) }))
                  }
                  onChange={(event) =>
                    setNovaTransportadora((prev) => ({ ...prev, cnpj: event.target.value }))
                  }
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                  fullWidth
                />
                <TextField
                  label="Telefone"
                  value={novaTransportadora.telefone}
                  onChange={(event) =>
                    setNovaTransportadora((prev) => ({ ...prev, telefone: event.target.value }))
                  }
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                  fullWidth
                />
                <TextField
                  label="Email para orçamento"
                  value={novaTransportadora.email_orcamento}
                  onChange={(event) =>
                    setNovaTransportadora((prev) => ({ ...prev, email_orcamento: event.target.value }))
                  }
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                  fullWidth
                />
                <TextField
                  label="Email para nota"
                  value={novaTransportadora.email_nota}
                  onChange={(event) =>
                    setNovaTransportadora((prev) => ({ ...prev, email_nota: event.target.value }))
                  }
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                  fullWidth
                />
                <Stack direction="row" gap={1}>
                  <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={editandoTransportadora ? handleSalvarEdicaoTransportadora : handleSalvarTransportadora}
                    disabled={savingTransportadora}
                    sx={{
                      borderRadius: '14px',
                      textTransform: 'none',
                      minWidth: 120,
                      alignSelf: 'flex-start',
                    }}
                  >
                    {savingTransportadora ? 'Salvando...' : editandoTransportadora ? 'Atualizar' : 'Cadastrar'}
                  </Button>
                  {editandoTransportadora && (
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setEditandoTransportadora(false);
                        setTransportadoraEmEdicao(null);
                        setNovaTransportadora({
                          nome: '',
                          cnpj: '',
                          telefone: '',
                          email_orcamento: '',
                          email_nota: '',
                        });
                      }}
                      sx={{
                        borderRadius: '14px',
                        textTransform: 'none',
                      }}
                    >
                      Cancelar
                    </Button>
                  )}
                </Stack>
              </Stack>
            </Box>

            <Box sx={{ ...glassPanel, p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2, gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  Transportadoras Cadastradas
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
                  <Chip label={`${transportadoras.length} cadastradas`} size="small" />
                </Stack>
              </Stack>
              <TableContainer sx={{ border: 'none' }}>
                <Table>
                  <TableHead>
                    <TableRow sx={tableHeaderRowSx}>
                        <TableCell sx={tableHeaderCellSx}>NOME</TableCell>
                      <TableCell sx={tableHeaderCellSx}>CNPJ</TableCell>
                      <TableCell sx={tableHeaderCellSx}>TELEFONE</TableCell>
                      <TableCell sx={tableHeaderCellSx}>
                        EMAIL ORÇAMENTO
                      </TableCell>
                      <TableCell sx={tableHeaderCellSx}>
                        EMAIL NOTA
                      </TableCell>
                      <TableCell sx={tableHeaderCellSx}>AÇÕES</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {transportadoras.map((item) => (
                      <TableRow key={item.id ?? item.email_orcamento}>
                        <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>{item.nome}</TableCell>
                        <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>{item.cnpj}</TableCell>
                        <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                          {item.telefone}
                        </TableCell>
                        <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                          {item.email_orcamento}
                        </TableCell>
                        <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                          {item.email_nota}
                        </TableCell>
                        <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                          <Stack direction="row" gap={1}>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => handleEditarTransportadora(item)}
                              disabled={savingTransportadora}
                              sx={{
                                textTransform: 'none',
                                borderRadius: '8px',
                              }}
                            >
                              Editar
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              onClick={() => handleDeletarTransportadora(item)}
                              disabled={savingTransportadora}
                              sx={{
                                textTransform: 'none',
                                borderRadius: '8px',
                              }}
                            >
                              Deletar
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                    {transportadoras.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} sx={{ borderBottom: 'none', py: 5, textAlign: 'center' }}>
                          <Typography variant="body2" color="text.secondary">
                            Nenhuma transportadora cadastrada.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Box>
        ) : view === 'divergencia' ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Back button and alert message */}
            <Stack direction="row" spacing={2} alignItems="center">
              <Button
                startIcon={<ArrowBack />}
                onClick={() => setView('dashboard')}
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '12px' }}
              >
                Voltar
              </Button>
              {divergenciaAtual && (
                <Alert
                  severity="error"
                  icon={<WarningAmberIcon />}
                  sx={{ flex: 1, borderRadius: '12px', fontWeight: 600 }}
                >
                  <b>{divergenciaAtual.transportadora}</b>: {divergenciaAtual.msg}
                </Alert>
              )}
            </Stack>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
                gap: 2,
              }}
            >
              {/* Pedido (Orcamento) */}
              <Box sx={{ ...glassPanel, p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
                  Dados do Pedido
                </Typography>
                {detalheLoading ? (
                  <LinearProgress sx={{ borderRadius: 5, height: 4 }} />
                ) : orcamentoDetalhe ? (
                  <Stack spacing={1.5}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Descrição</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{orcamentoDetalhe.descricao}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Data de Criação</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{orcamentoDetalhe.data_criacao}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">CEP de destino</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{orcamentoDetalhe.cep_destino ?? '-'}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Endereço de destino</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{orcamentoDetalhe.endereco_destino ?? '-'}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Nota</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{orcamentoDetalhe.nota ?? '-'}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Valor do produto</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{orcamentoDetalhe.valor_produto ? `R$ ${orcamentoDetalhe.valor_produto.toFixed(2)}` : '-'}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Dimensões</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{orcamentoDetalhe.dimensoes ? `${orcamentoDetalhe.dimensoes.comprimento} x ${orcamentoDetalhe.dimensoes.largura} x ${orcamentoDetalhe.dimensoes.altura}` : '-'}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Peso</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{orcamentoDetalhe.peso ? `${orcamentoDetalhe.peso.toFixed(3)} kg` : '-'}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Peso agregado (volumes)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{detalheVolumesAgregados.totalPeso.toFixed(3)} kg</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">CNPJ Pagador</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{orcamentoDetalhe.cnpj_pagador ?? '-'}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">CNPJ/CPF Destino</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{orcamentoDetalhe.cnpj_cpf_destino ?? '-'}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Qtd. Volumes</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{orcamentoDetalhe.qtd_volumes ?? '-'}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Volumes (LxAxP)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{orcamentoDetalhe.volumes ? orcamentoDetalhe.volumes.map((v) => `${v.comprimento}x${v.largura}x${v.altura}${v.peso ? ` (${v.peso}kg)` : ''}`).join(', ') : '-'}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Volumes agregados</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{detalheVolumesAgregados.count}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Meta volume (m³)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{detalheVolumesAgregados.totalVolume.toFixed(3)}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Peso agregado (kg)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{detalheVolumesAgregados.totalPeso.toFixed(3)}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Status</Typography>
                      <Chip
                        label={orcamentoDetalhe.ativo ? 'Ativo' : 'Encerrado'}
                        size="small"
                        color={orcamentoDetalhe.ativo ? 'success' : 'default'}
                        sx={{ fontWeight: 700 }}
                      />
                    </Stack>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" color="text.secondary">Divergência</Typography>
                      <Chip
                        label={orcamentoDetalhe.divergencia_tratada ? 'Tratada' : 'Pendente'}
                        size="small"
                        color={orcamentoDetalhe.divergencia_tratada ? 'success' : 'error'}
                        sx={{ fontWeight: 700, cursor: 'pointer' }}
                        onClick={async () => {
                          const novoValor = !orcamentoDetalhe.divergencia_tratada;
                          try {
                            await invoke('marcar_divergencia_tratada', {
                              orcamentoId: orcamentoDetalhe.id,
                              tratada: novoValor,
                            });
                            setOrcamentoDetalhe((prev) =>
                              prev ? { ...prev, divergencia_tratada: novoValor } : prev
                            );
                            await loadDashboard();
                          } catch (err) {
                            setError(String(err));
                          }
                        }}
                      />
                    </Stack>
                    <Divider />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#475569' }}>
                      PROPOSTAS
                    </Typography>
                    {orcamentoDetalhe.propostas.map((proposta) => {
                      const ganhadora = orcamentoDetalhe.proposta_ganhadora_id === proposta.id;
                      const divergente =
                        proposta.valor_frete_pago != null &&
                        proposta.valor_frete_pago !== proposta.valor_proposta;
                      return (
                        <Box
                          key={proposta.id}
                          sx={{
                            p: 1.5,
                            borderRadius: '10px',
                            bgcolor: divergente
                              ? 'rgba(239,68,68,0.08)'
                              : ganhadora
                                ? 'rgba(34,197,94,0.06)'
                                : 'rgba(99,102,241,0.05)',
                            border: `1px solid ${divergente ? 'rgba(239,68,68,0.2)' : ganhadora ? 'rgba(34,197,94,0.2)' : 'rgba(99,102,241,0.12)'}`,
                          }}
                        >
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
                              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                                {proposta.transportadora_nome ?? 'Transportadora não informada'}
                              </Typography>
                              <Typography variant="caption" display="block" color="text.secondary">
                                Proposta: R$ {Number(proposta.valor_proposta).toFixed(2)}
                                {proposta.valor_frete_pago != null && (
                                  <> · Nota: R$ {Number(proposta.valor_frete_pago).toFixed(2)}</>
                                )}
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={0.5}>
                              {ganhadora && <Chip label="Ganhadora" size="small" color="success" sx={{ fontWeight: 700, fontSize: '0.65rem' }} />}
                              {divergente && <Chip label="Divergência" size="small" color="error" sx={{ fontWeight: 700, fontSize: '0.65rem' }} />}
                            </Stack>
                          </Stack>
                        </Box>
                      );
                    })}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">Carregando dados do pedido...</Typography>
                )}
              </Box>

              {/* Transportadora */}
              <Box sx={{ ...glassPanel, p: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
                  Dados da Transportadora
                </Typography>
                {divergenciaAtual?.transportadora_id ? (
                  (() => {
                    const t = transportadoras.find((tr) => tr.id === divergenciaAtual.transportadora_id);
                    return t ? (
                      <Stack spacing={1.5}>
                        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                          <Avatar sx={{ bgcolor: '#6366f1', width: 44, height: 44, fontWeight: 700 }}>
                            {t.nome.charAt(0).toUpperCase()}
                          </Avatar>
                          <Typography variant="h6" sx={{ fontWeight: 800 }}>{t.nome}</Typography>
                        </Stack>
                        <Divider />
                        {[
                          { label: 'CNPJ', value: t.cnpj },
                          { label: 'Telefone', value: t.telefone },
                          { label: 'Email Orçamento', value: t.email_orcamento },
                          { label: 'Email Nota', value: t.email_nota },
                        ].map(({ label, value }) => (
                          <Stack key={label} direction="row" justifyContent="space-between">
                            <Typography variant="body2" color="text.secondary">{label}</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{value}</Typography>
                          </Stack>
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Transportadora: <b>{divergenciaAtual.transportadora}</b>
                      </Typography>
                    );
                  })()
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Transportadora: <b>{divergenciaAtual?.transportadora}</b>
                  </Typography>
                )}
              </Box>

              {/* Métricas da Transportadora */}
              <Box
                sx={{
                  ...glassPanel,
                  p: 3,
                  gridColumn: { xs: '1', lg: '1 / -1' },
                  background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                  color: 'white',
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                  <TrendingUp sx={{ color: '#6366f1' }} />
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>
                    Histórico com esta Transportadora
                  </Typography>
                </Stack>
                {metricasLoading ? (
                  <LinearProgress sx={{ borderRadius: 5, height: 4, bgcolor: 'rgba(255,255,255,0.1)', '& .MuiLinearProgress-bar': { bgcolor: '#6366f1' } }} />
                ) : transportadoraMetricas ? (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' },
                      gap: 2,
                    }}
                  >
                    {[
                      { label: 'Total de Transações', value: String(transportadoraMetricas.total_transacoes) },
                      { label: 'Com Divergência', value: String(transportadoraMetricas.transacoes_com_divergencia) },
                      { label: 'Taxa de Divergência', value: `${transportadoraMetricas.taxa_divergencia_pct.toFixed(1)}%` },
                      { label: 'Valor Médio Proposta', value: `R$ ${transportadoraMetricas.valor_medio_proposta.toFixed(2)}` },
                      { label: 'Valor Médio Pago', value: `R$ ${transportadoraMetricas.valor_medio_frete_pago.toFixed(2)}` },
                      { label: 'Divergência Média', value: `R$ ${transportadoraMetricas.divergencia_media.toFixed(2)}` },
                    ].map(({ label, value }) => (
                      <Box key={label} sx={{ textAlign: 'center', p: 1.5, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                        <Typography variant="caption" sx={{ opacity: 0.6, display: 'block', mb: 0.5, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {label}
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 900, fontSize: '1.1rem', color: label === 'Com Divergência' || label === 'Taxa de Divergência' ? '#fca5a5' : 'white' }}>
                          {value}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" sx={{ opacity: 0.6 }}>
                    Nenhum dado de métricas disponível.
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        ) : view === 'relatorios' ? (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              opacity: 0.5,
              userSelect: 'none',
              py: 8,
            }}
          >
            <Typography sx={{ fontSize: 64 }}>🚧</Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>
              Em construção
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Esta seção ainda está sendo desenvolvida.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', xl: '1fr 1.5fr' },
              gap: 2,
            }}
          >
            <Box sx={{ ...glassPanel, p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  {orcamentoSelecionadoId ? 'Editar Orçamento' : 'Novo Orçamento'}
                </Typography>
              </Stack>

              <Stack spacing={2}>
                <Stack direction="row" spacing={2}>
                  <TextField
                    label="Descrição"
                    value={novoOrcamento.descricao}
                    onChange={(event) =>
                      setNovoOrcamento((prev) => ({ ...prev, descricao: event.target.value }))
                    }
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                    fullWidth
                  />
                  <TextField
                    label="Data de criação"
                    type="date"
                    value={novoOrcamento.data_criacao}
                    onChange={(event) =>
                      setNovoOrcamento((prev) => ({ ...prev, data_criacao: event.target.value }))
                    }
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                  />
                </Stack>

                <TextField
                  label="CEP de destino"
                  value={novoOrcamento.cep_destino}
                  onChange={(event) =>
                    setNovoOrcamento((prev) => ({ ...prev, cep_destino: event.target.value }))
                  }
                  error={!!cepError}
                  helperText={cepError || 'Somente dígitos: 8 caracteres'}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                  fullWidth
                />
                <TextField
                  label="Endereço de destino"
                  value={novoOrcamento.endereco_destino}
                  onChange={(event) =>
                    setNovoOrcamento((prev) => ({ ...prev, endereco_destino: event.target.value }))
                  }
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                  fullWidth
                />
                <Stack direction="row" spacing={2}>
                  <TextField
                    label="Nota"
                    placeholder="nota"
                    value={novoOrcamento.nota}
                    onChange={(event) =>
                      setNovoOrcamento((prev) => ({ ...prev, nota: event.target.value }))
                    }
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                    fullWidth
                  />
                  <TextField
                    label="Valor"
                    placeholder="valor"
                    type="text"
                    value={novoOrcamento.valor_produto}
                    onChange={(event) =>
                      setNovoOrcamento((prev) => ({ ...prev, valor_produto: event.target.value }))
                    }
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                    fullWidth
                  />
                </Stack>
                <Stack direction="row" spacing={2}>
                  <TextField
                    label="CNPJ Pagador"
                    value={novoOrcamento.cnpj_pagador}
                    onFocus={() =>
                      setNovoOrcamento((prev) => ({ ...prev, cnpj_pagador: onlyDigits(prev.cnpj_pagador) }))
                    }
                    onBlur={() =>
                      setNovoOrcamento((prev) => ({ ...prev, cnpj_pagador: formatCNPJ(prev.cnpj_pagador) }))
                    }
                    onChange={(event) =>
                      setNovoOrcamento((prev) => ({ ...prev, cnpj_pagador: event.target.value }))
                    }
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                    fullWidth
                  />
                  <TextField
                    label="CNPJ/CPF Destino"
                    value={novoOrcamento.cnpj_cpf_destino}
                    onFocus={() =>
                      setNovoOrcamento((prev) => ({ ...prev, cnpj_cpf_destino: onlyDigits(prev.cnpj_cpf_destino) }))
                    }
                    onBlur={() =>
                      setNovoOrcamento((prev) => ({
                        ...prev,
                        cnpj_cpf_destino: formatCnpjOrCpf(prev.cnpj_cpf_destino),
                      }))
                    }
                    onChange={(event) =>
                      setNovoOrcamento((prev) => ({ ...prev, cnpj_cpf_destino: event.target.value }))
                    }
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                    fullWidth
                  />
                </Stack>

                {(novoOrcamento.volumes || []).map((volume: any, idx: number) => (
                  <Stack direction="row" spacing={1} alignItems="center" key={`volume-${idx}`}>
                    <Typography sx={{ minWidth: 52, fontWeight: 700 }}>#{idx + 1}</Typography>
                    <TextField
                      label="Comprimento (m)"
                      placeholder="comprimento"
                      value={volume.comprimento}
                      onChange={(event) =>
                        setNovoOrcamento((prev) => {
                          const newVolumes = [...(prev.volumes || [])];
                          newVolumes[idx] = { ...newVolumes[idx], comprimento: event.target.value };
                          return { ...prev, volumes: newVolumes };
                        })
                      }
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                      fullWidth
                    />
                    <TextField
                      label="Largura (m)"
                      placeholder="largura"
                      value={volume.largura}
                      onChange={(event) =>
                        setNovoOrcamento((prev) => {
                          const newVolumes = [...(prev.volumes || [])];
                          newVolumes[idx] = { ...newVolumes[idx], largura: event.target.value };
                          return { ...prev, volumes: newVolumes };
                        })
                      }
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                      fullWidth
                    />
                    <TextField
                      label="Altura (m)"
                      placeholder="altura"
                      value={volume.altura}
                      onChange={(event) =>
                        setNovoOrcamento((prev) => {
                          const newVolumes = [...(prev.volumes || [])];
                          newVolumes[idx] = { ...newVolumes[idx], altura: event.target.value };
                          return { ...prev, volumes: newVolumes };
                        })
                      }
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                      fullWidth
                    />
                    <TextField
                      label="Peso (kg)"
                      placeholder="peso"
                      value={volume.peso || ''}
                      onChange={(event) =>
                        setNovoOrcamento((prev) => {
                          const newVolumes = [...(prev.volumes || [])];
                          newVolumes[idx] = { ...newVolumes[idx], peso: event.target.value };
                          return { ...prev, volumes: newVolumes };
                        })
                      }
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                      type="text"
                      fullWidth
                    />
                    <IconButton
                      aria-label={`Remover volume ${idx + 1}`}
                      size="small"
                      color="error"
                      onClick={() =>
                        setNovoOrcamento((prev) => {
                          const newVolumes = [...(prev.volumes || [])];
                          newVolumes.splice(idx, 1);
                          return {
                            ...prev,
                            volumes:
                              newVolumes.length > 0
                                ? newVolumes
                                : [{ comprimento: '', largura: '', altura: '', peso: '' }],
                          };
                        })
                      }
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
                <Button
                  variant="text"
                  onClick={() =>
                    setNovoOrcamento((prev) => ({
                      ...prev,
                      volumes: [...(prev.volumes || []), { comprimento: '', largura: '', altura: '', peso: '' }],
                    }))
                  }
                  sx={{ padding: 0, alignSelf: 'flex-start', textTransform: 'none' }}>
                  + Adicionar volume
                </Button>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Volumes: {volumesAgregados.count} | Volume agregado: {volumesAgregados.totalVolume.toFixed(3)} m³ | Peso agregado: {volumesAgregados.totalPeso.toFixed(3)} kg
                </Typography>
                {orcamentoSelecionadoId ? (
                  <Stack direction="row" spacing={1.5} flexWrap="wrap">
                    <Button
                      variant="contained"
                      onClick={handleSalvarEdicaoOrcamento}
                      disabled={savingEdicaoOrcamento}
                      sx={{ borderRadius: '14px', textTransform: 'none' }}
                    >
                      {savingEdicaoOrcamento ? 'Salvando...' : 'Salvar alterações'}
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<Email />}
                      onClick={handleOpenEnviarOrcamentoModal}
                      disabled={!orcamentoDetalhe?.ativo || sendingOrcamentoEmail}
                      sx={{ borderRadius: '14px', textTransform: 'none' }}
                    >
                      Enviar e-mails em massa
                    </Button>
                    <Button
                      variant="outlined"
                      color={orcamentoDetalhe?.ativo ? 'error' : 'success'}
                      onClick={orcamentoDetalhe?.ativo ? handleDesativarOrcamento : handleReativarOrcamento}
                      sx={{ borderRadius: '14px', textTransform: 'none' }}
                    >
                      {orcamentoDetalhe?.ativo ? 'Desativar orçamento' : 'Reativar orçamento'}
                    </Button>
                  </Stack>
                ) : (
                  <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={handleSalvarOrcamento}
                    disabled={savingOrcamento}
                    sx={{
                      borderRadius: '14px',
                      textTransform: 'none',
                      minWidth: 170,
                      alignSelf: 'flex-start',
                    }}
                  >
                    {savingOrcamento ? 'Salvando...' : 'Cadastrar Orçamento'}
                  </Button>
                )}
              </Stack>
            </Box>

            <Box sx={{ ...glassPanel, p: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  Propostas
                </Typography>
                {orcamentoDetalhe && (
                  <Stack direction="row" spacing={1}>
                    <Chip label={orcamentoDetalhe.ativo ? 'Ativo' : 'Concluído'} size="small" color={orcamentoDetalhe.ativo ? 'primary' : 'default'} />
                    {orcamentoDetalhe.proposta_ganhadora_id && (
                      <Chip label="Ganhadora definida — aguardando nota" color="success" size="small" />
                    )}
                  </Stack>
                )}
              </Stack>

              {!orcamentoSelecionadoId ? (
                <Typography variant="body2" color="text.secondary">
                  Cadastre o orçamento para começar a adicionar e gerenciar propostas.
                </Typography>
              ) : detalheLoading ? (
                <LinearProgress sx={{ borderRadius: 5, height: 4 }} />
              ) : (
                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                      label="Valor proposta"
                      value={novaProposta.valor_proposta}
                      onChange={(event) =>
                        setNovaProposta((prev) => ({ ...prev, valor_proposta: event.target.value }))
                      }
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 }, flex: 1 }}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <AttachMoney sx={{ color: '#64748b' }} />
                            </InputAdornment>
                          ),
                        },
                      }}
                    />
                  </Stack>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <TextField
                      label="Data da proposta"
                      type="text"
                      placeholder="dd/mm/aaaa ou aaaa-mm-dd"
                      value={novaProposta.data_proposta}
                      onChange={(event) =>
                        setNovaProposta((prev) => ({ ...prev, data_proposta: event.target.value }))
                      }
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 }, flex: 1 }}
                    />
                    <TextField
                      label="Prazo de entrega *"
                      type="text"
                      placeholder="Ex.: 5 dias úteis"
                      value={novaProposta.prazo_entrega}
                      onChange={(event) =>
                        setNovaProposta((prev) => ({ ...prev, prazo_entrega: event.target.value }))
                      }
                      required
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 }, flex: 1 }}
                    />
                  </Stack>

                  <FormControl variant="outlined" fullWidth required>
                    <InputLabel id="proposta-transportadora-label">Transportadora *</InputLabel>
                    <Select
                      labelId="proposta-transportadora-label"
                      label="Transportadora *"
                      value={novaProposta.transportadora_id}
                      onChange={(event) =>
                        setNovaProposta((prev) => ({ ...prev, transportadora_id: event.target.value }))
                      }
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                    >
                      {transportadoras.map((item) => {
                        const itemId = item.id;
                        return (
                          <MenuItem key={itemId} value={itemId}>
                            {item.nome}
                          </MenuItem>
                        );
                      })}
                    </Select>
                  </FormControl>

                  <Button
                    variant="contained"
                    onClick={handleAdicionarPropostaManual}
                    disabled={savingProposta || !orcamentoDetalhe?.ativo}
                    sx={{ textTransform: 'none', borderRadius: '12px', alignSelf: 'flex-start' }}
                  >
                    {savingProposta ? 'Salvando proposta...' : 'Adicionar proposta'}
                  </Button>

                  <TableContainer sx={{ border: 'none' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={tableHeaderRowSx}>
                          <TableCell sx={tableHeaderCellSx}>TRANSPORTADORA</TableCell>
                          <TableCell sx={tableHeaderCellSx}>PROPOSTA</TableCell>
                          <TableCell sx={tableHeaderCellSx}>FRETE PAGO</TableCell>
                          <TableCell sx={tableHeaderCellSx}>DATA</TableCell>
                          <TableCell sx={tableHeaderCellSx}>PRAZO</TableCell>
                          <TableCell sx={tableHeaderCellSx}>AÇÃO</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(orcamentoDetalhe?.propostas ?? []).map((item) => {
                          const ganhadora = orcamentoDetalhe?.proposta_ganhadora_id === item.id;
                          return (
                            <TableRow key={item.id}>
                              <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                {item.transportadora_nome ?? 'Não informada'}
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                R$ {Number(item.valor_proposta).toFixed(2)}
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                {item.valor_frete_pago != null ? `R$ ${Number(item.valor_frete_pago).toFixed(2)}` : '-'}
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                {item.data_proposta}
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                {item.prazo_entrega ?? '-'}
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                  {ganhadora ? (
                                    <Chip
                                      label="Ganhadora"
                                      color="success"
                                      size="small"
                                      onDelete={handleDesfazerGanhadora}
                                      title="Clique no X para desfazer"
                                    />
                                  ) : (
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      onClick={() => handleEscolherGanhadora(item.id)}
                                      disabled={!orcamentoDetalhe?.ativo}
                                      sx={{ textTransform: 'none', borderRadius: '10px' }}
                                    >
                                      Escolher
                                    </Button>
                                  )}

                                  <Tooltip title="Excluir proposta" arrow>
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={() => handleExcluirProposta(item.id)}
                                      sx={{ border: '1px solid rgba(220, 38, 38, 0.35)' }}
                                    >
                                      <DeleteOutline fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Stack>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {(orcamentoDetalhe?.propostas ?? []).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} sx={{ borderBottom: 'none', py: 3, textAlign: 'center' }}>
                              <Typography variant="body2" color="text.secondary">
                                Nenhuma proposta cadastrada para este orçamento.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Stack>
              )}
            </Box>
          </Box>
        )}
      </Container>

      <Dialog
        open={showEnviarOrcamentoModal}
        onClose={() => setShowEnviarOrcamentoModal(false)}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>Selecionar transportadoras para envio</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Selecione as transportadoras que devem receber o pedido de orçamento.
            Itens já enviados antes estão desabilitados, salvo se você ativar o envio forçado.
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
            E-mails já enviados para {orcamentoDetalhe?.transportadoras_enviadas?.length || 0} transportadora(s).
          </Typography>
          <Checkbox
            indeterminate={selectedTransportadoraIds.length > 0 && selectedTransportadoraIds.length < transportadoras.length}
            checked={selectedTransportadoraIds.length === transportadoras.length}
            onChange={() => {
              const allSelectableIds = transportadoras
                .filter((item) => {
                  const alreadySent = orcamentoDetalhe?.transportadoras_enviadas?.includes(item.id);
                  const forced = forceSendTransportadoraIds.includes(item.id);
                  return !(alreadySent && !forced);
                })
                .map((item) => item.id);

              if (selectedTransportadoraIds.length === allSelectableIds.length) {
                setSelectedTransportadoraIds([]);
              } else {
                setSelectedTransportadoraIds(allSelectableIds);
              }
            }}
          /> Selecionar/Deselecionar todas
          <Table size="small">
            <TableHead>
              <TableRow sx={tableHeaderRowSx}>
                <TableCell sx={tableHeaderCellSx}>Selecionar</TableCell>
                <TableCell sx={tableHeaderCellSx}>Nome</TableCell>
                <TableCell sx={tableHeaderCellSx}>CNPJ</TableCell>
                <TableCell sx={tableHeaderCellSx}>Telefone</TableCell>
                <TableCell sx={tableHeaderCellSx}>E-mail orçamento</TableCell>
                <TableCell sx={tableHeaderCellSx}>Status</TableCell>
                <TableCell sx={tableHeaderCellSx}>Ação</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transportadoras.map((item) => {
                const alreadySent = orcamentoDetalhe?.transportadoras_enviadas?.includes(item.id);
                const forced = forceSendTransportadoraIds.includes(item.id);
                const disabled = alreadySent && !forced;

                return (
                  <TableRow key={item.id}>
                    <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                      <Checkbox
                        checked={selectedTransportadoraIds.includes(item.id)}
                        disabled={disabled}
                        onChange={() => handleToggleSelectTransportadora(item.id)}
                      />
                    </TableCell>
                    <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>{item.nome}</TableCell>
                    <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>{item.cnpj}</TableCell>
                    <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>{item.telefone}</TableCell>
                    <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>{item.email_orcamento}</TableCell>
                    <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                      {alreadySent ? (
                        <Chip label={forced ? 'Enviado (forçado)' : 'Já enviado'} size="small" color={forced ? 'warning' : 'default'} />
                      ) : (
                        <Chip label="Não enviado" size="small" color="primary" />
                      )}
                    </TableCell>
                    <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                      {alreadySent && (
                        <Button
                          size="small"
                          variant={forced ? 'contained' : 'outlined'}
                          color={forced ? 'error' : 'primary'}
                          onClick={() => handleToggleForceSendTransportadora(item.id)}
                          sx={{ textTransform: 'none', borderRadius: '10px' }}
                        >
                          {forced ? 'Remover forçar envio' : 'Forçar envio'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowEnviarOrcamentoModal(false)} sx={{ textTransform: 'none' }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleEnviarEmailOrcamento}
            disabled={sendingOrcamentoEmail || selectedTransportadoraIds.length === 0}
            sx={{ textTransform: 'none' }}
          >
            {sendingOrcamentoEmail ? 'Enviando...' : 'Enviar e-mails'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default App;
