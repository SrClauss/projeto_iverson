export type FilterKey = 'nota' | 'descricao' | 'cep_destino' | 'valor_produto' | 'peso' | 'data_criacao' | 'transportadora';
export type AppView = 'dashboard' | 'transportadoras' | 'orcamentos' | 'relatorios' | 'divergencia';

export type DashboardStats = {
  orcamentos_ativos: number;
  propostas_recebidas: number;
  divergencias_nota: number;
  transportadoras: number;
};

export type OrcamentoRecenteItem = {
  id: string;
  pedido: string;
  status: string;
  propostas: number;
  data: string;
  transportadoras_preview: string[];
};

export type DashboardAlertaItem = {
  id: string;
  orcamento_id: string;
  transportadora: string;
  transportadora_id: string | null;
  msg: string;
  severity: 'error' | 'info' | 'warning';
};

export type TransportadoraMetricas = {
  total_transacoes: number;
  transacoes_com_divergencia: number;
  taxa_divergencia_pct: number;
  valor_medio_proposta: number;
  valor_medio_frete_pago: number;
  divergencia_media: number;
};

export type Transportadora = {
  id: string;
  nome: string;
  cnpj: string;
  telefone: string;
  email_orcamento: string;
  email_nota: string;
};

export type PropostaDetalhe = {
  id: string;
  valor_proposta: number;
  valor_frete_pago?: number | null;
  prazo_entrega?: number | null;
  transportadora_id?: string | null;
  transportadora_nome?: string | null;
  data_proposta: string;
};

export type OrcamentoDetalhe = {
  id: string;
  descricao: string;
  numero_cotacao?: string | null;
  data_criacao: string;
  ativo: boolean;
  cnpj_pagador?: string | null;
  cnpj_cpf_destino?: string | null;
  cep_destino?: string | null;
  logradouro_destino?: string | null;
  numero_destino?: string | null;
  complemento_destino?: string | null;
  bairro_destino?: string | null;
  cidade_destino?: string | null;
  uf_destino?: string | null;
  endereco_destino?: string | null;
  nota?: string | null;
  valor_produto?: number | null;
  qtd_volumes?: number | null;
  volumes?: { comprimento: number; largura: number; altura: number; peso?: number | null }[] | null;
  dimensoes?: { comprimento: number; largura: number; altura: number } | null;
  peso?: number | null;
  proposta_ganhadora_id?: string | null;
  propostas: PropostaDetalhe[];
  divergencia_tratada: boolean;
  divergencia_email_status?: string | null;
  divergencia_campos?: string[] | null;
  divergencia_campos_aceitos?: string[] | null;
  divergencia_email_correcao?: string | null;
  divergencia_email_enviado_em?: string | null;
  transportadoras_enviadas: string[];
};

export type GoogleAuthStatus = {
  authenticated: boolean;
  email: string | null;
};

export type WatcherStatus = {
  running: boolean;
  last_check: string | null;
  emails_processados: number;
  ultimo_erro: string | null;
};

export type EmailPendente = {
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

export type Notificacao = {
  id: string;
  orcamento_id: string;
  orcamento_descricao: string;
  mensagem: string;
  lida: boolean;
  criada_em: string;
};

export type NovaTransportadoraForm = {
  nome: string;
  cnpj: string;
  telefone: string;
  email_orcamento: string;
  email_nota: string;
};

export type VolumeForm = {
  comprimento: string;
  largura: string;
  altura: string;
  peso: string;
};

export type NovoOrcamentoForm = {
  numero_cotacao: string;
  data_criacao: string;
  cnpj_pagador: string;
  cnpj_cpf_destino: string;
  cep_destino: string;
  logradouro_destino: string;
  numero_destino: string;
  complemento_destino: string;
  bairro_destino: string;
  cidade_destino: string;
  uf_destino: string;
  endereco_destino: string;
  nota: string;
  valor_produto: string;
  volumes: VolumeForm[];
  dimensoes: { comprimento: string; largura: string; altura: string };
  peso: string;
};

export type NovaPropostaForm = {
  valor_proposta: string;
  transportadora_id: string;
  data_proposta: string;
  prazo_entrega: string;
};

export type VolumesAgregados = {
  count: number;
  totalPeso: number;
  totalVolume: number;
};

export type CampoComparacao = {
  campo: string;
  valor_orcamento: string;
  valor_xml: string;
  divergente: boolean;
};

export type CteComparacao = {
  orcamento_id: string;
  campos: CampoComparacao[];
  tem_divergencia: boolean;
};

