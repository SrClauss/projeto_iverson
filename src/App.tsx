import { useState, useEffect } from 'react';
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
} from '@mui/material';
import {
  Email,
  LocalShipping,
  Add,
  Search,
  Tune,
  AttachMoney,
  CalendarMonth,
  FilterAlt,
  RestartAlt,
  DeleteOutline,
  Dashboard as DashboardIcon,
  BarChart,
  NotificationsActive,
  CheckCircle,
  Delete,
  Close,
} from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';
import glassBackground from './assets/glass-background-bordeaux.svg';
import './App.css';

type FilterKey = 'descricao' | 'valor' | 'data_criacao' | 'transportadora';
type AppView = 'dashboard' | 'transportadoras' | 'orcamentos' | 'relatorios';

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
  transportadora: string;
  msg: string;
  severity: 'error' | 'info' | 'warning';
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
  proposta_ganhadora_id?: string | null;
  propostas: PropostaDetalhe[];
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

// Estilo Glass (Glassmorphism)
const glassPanel = {
  background: 'rgba(255, 255, 255, 0.2)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  border: '1px solid rgba(255, 255, 255, 0.4)',
  borderRadius: '24px',
  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.08)',
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
  const [filtroAtivoLabel, setFiltroAtivoLabel] = useState<string | null>(null);
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
  });
  const [orcamentoSelecionadoId, setOrcamentoSelecionadoId] = useState<string | null>(null);
  const [orcamentoDetalhe, setOrcamentoDetalhe] = useState<OrcamentoDetalhe | null>(null);
  const [novaProposta, setNovaProposta] = useState({
    valor_proposta: '',
    transportadora_id: '',
    data_proposta: getTodayIso(),
    prazo_entrega: '',
  });

  // ── Google Auth State ───────────────────────────────────
  const [googleAuth, setGoogleAuth] = useState<GoogleAuthStatus | null>(null);
  const [googleAuthLoading, setGoogleAuthLoading] = useState(false);

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

  const loadDashboard = async (includeInactive?: boolean) => {
    setLoading(true);
    setError(null);
    const inactive = includeInactive ?? mostrarInativos;

    try {
      const [statsData, orcamentosData, alertasData] = await Promise.all([
        invoke<DashboardStats>('get_dashboard_stats'),
        invoke<OrcamentoRecenteItem[]>('get_orcamentos_recentes', { limit: inactive ? 50 : 4, includeInactive: inactive }),
        invoke<DashboardAlertaItem[]>('get_dashboard_alertas', { limit: 1 }),
      ]);

      const transportadorasData = await invoke<Transportadora[]>('get_transportadoras');

      setStats(statsData);
      setOrcamentos(orcamentosData);
      setAlertas(alertasData);
      setTransportadoras(transportadorasData);
      setFiltroAtivoLabel(null);

      await invoke('set_tray_divergencias', { count: alertasData.length });
    } catch (err) {
      setError(String(err));
      console.error('Erro ao carregar dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolverDivergencia = (id: string) => {
    console.log('Resolver divergência:', id);
    // TODO: Implementar resolução
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

    setSavingOrcamento(true);
    try {
      const orcamentoId = await invoke<string>('add_orcamento', {
        orcamento: {
          descricao,
          data_criacao: dataCriacaoNormalizada,
          propostas: [],
          ativo: true,
          transportadora_id: null,
        },
      });

      setOrcamentoSelecionadoId(orcamentoId);
      setNovoOrcamento({
        descricao,
        data_criacao: dataCriacaoNormalizada,
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

    setSavingEdicaoOrcamento(true);
    try {
      await invoke<string>('update_orcamento_basico', {
        orcamentoId: orcamentoSelecionadoId,
        descricao,
        dataCriacao: dataCriacaoNormalizada,
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
        case 'valor': {
          if (valorMin === '' || valorMax === '') {
            throw new Error('Informe valor mínimo e máximo.');
          }
          const min = Number(valorMin);
          const max = Number(valorMax);
          if (Number.isNaN(min) || Number.isNaN(max)) {
            throw new Error('Os valores do filtro precisam ser numéricos.');
          }
          value = JSON.stringify([min, max]);
          filtroDescricao = `Valor entre R$ ${min} e R$ ${max}`;
          break;
        }
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
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundImage: `url(${glassBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#f8fafc',
        }}
      >
        <CircularProgress />
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
                    : 'Cadastro de novos orçamentos no sistema'}
            </Typography>
          </Box>
        </Box>

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
                Descrição, valor, data ou transportadora.
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
              <MenuItem value="valor">Faixa de valor</MenuItem>
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

            {filterType === 'valor' && (
              <Stack direction="row" spacing={2} sx={{ flex: 1 }}>
                <TextField
                  label="Valor mínimo"
                  variant="outlined"
                  type="text"
                  inputMode="decimal"
                  value={valorMin}
                  onChange={(event) => setValorMin(event.target.value)}
                  sx={{ flex: 1, minWidth: 140, '& .MuiOutlinedInput-root': { borderRadius: 0, '& .MuiInputAdornment-positionStart': { marginRight: 0 }, '& .MuiOutlinedInput-input': { boxShadow: 'none' } } }}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start"><AttachMoney sx={{ color: '#64748b' }} /></InputAdornment> } }}
                />
                <TextField
                  label="Valor máximo"
                  variant="outlined"
                  type="text"
                  inputMode="decimal"
                  value={valorMax}
                  onChange={(event) => setValorMax(event.target.value)}
                  sx={{ flex: 1, minWidth: 140, '& .MuiOutlinedInput-root': { borderRadius: 0, '& .MuiInputAdornment-positionStart': { marginRight: 0 }, '& .MuiOutlinedInput-input': { boxShadow: 'none' } } }}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start"><AttachMoney sx={{ color: '#64748b' }} /></InputAdornment> } }}
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
            gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' },
            gap: 2,
          }}
        >
          {/* Coluna Esquerda - Orçamentos & Alertas */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Alerta de Divergência - Banner Principal */}
            {alertas.length > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {alertas.map((alerta) => (
                  <Box
                    key={alerta.id}
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
                        </Typography>
                        <Typography variant="body2">
                          Transportadora <b>{alerta.transportadora}</b>: {alerta.msg}
                        </Typography>
                      </Box>
                    </Stack>
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={() => handleResolverDivergencia(alerta.id)}
                      sx={{ borderRadius: '12px', fontWeight: 'bold' }}
                    >
                      Resolver Agora
                    </Button>
                  </Box>
                ))}
              </Box>
            )}

            {/* Orçamentos em Aberto */}
            <Box sx={{ ...glassPanel, p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
                {mostrarInativos ? 'Todos os Orçamentos' : 'Orçamentos em Aberto'}
              </Typography>
              <TableContainer sx={{ border: 'none' }}>
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

            {/* Stats Card */}
            <Box
              sx={{
                ...glassPanel,
                p: 3,
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                color: 'white',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <Box sx={{ position: 'relative', zIndex: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, mb: 3 }}>
                  Dashboard
                </Typography>
                {stats && (
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="caption" sx={{ opacity: 0.7 }}>
                        ORÇAMENTOS ATIVOS
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 900 }}>
                        {stats.orcamentos_ativos}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ opacity: 0.7 }}>
                        TRANSPORTADORAS
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 900 }}>
                        {stats.transportadoras}
                      </Typography>
                    </Box>
                  </Stack>
                )}
              </Box>
              {/* Círculo decorativo de fundo */}
              <Box
                sx={{
                  position: 'absolute',
                  top: -20,
                  right: -20,
                  width: 100,
                  height: 100,
                  borderRadius: '50%',
                  background: 'rgba(99, 102, 241, 0.4)',
                  filter: 'blur(30px)',
                }}
              />
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
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  Transportadoras Cadastradas
                </Typography>
                <Chip label={`${transportadoras.length} cadastradas`} size="small" />
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
                  type="text"
                  placeholder="dd/mm/aaaa ou aaaa-mm-dd"
                  value={novoOrcamento.data_criacao}
                  onChange={(event) =>
                    setNovoOrcamento((prev) => ({ ...prev, data_criacao: event.target.value }))
                  }
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                  InputLabelProps={{ shrink: true }}
                  helperText="Exemplo: 27/03/2026"
                  fullWidth
                />

                {orcamentoSelecionadoId ? (
                  <Stack direction="row" spacing={1.5}>
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
                                R$ {item.valor_proposta}
                              </TableCell>
                              <TableCell sx={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                                {item.valor_frete_pago != null ? `R$ ${item.valor_frete_pago}` : '-'}
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
    </Box>
  );
};

export default App;
