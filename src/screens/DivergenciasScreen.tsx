import React from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  Chip,
  Alert,
  Avatar,
  Divider,
  LinearProgress,
} from '@mui/material';
import {
  ArrowBack,
  TrendingUp,
  Warning as WarningAmberIcon,
} from '@mui/icons-material';
import { glassPanel } from '../styles/glass';
import type {
  AppView,
  DashboardAlertaItem,
  OrcamentoDetalhe,
  Transportadora,
  TransportadoraMetricas,
  VolumesAgregados,
} from '../types';

interface DivergenciasScreenProps {
  divergenciaAtual: DashboardAlertaItem | null;
  orcamentoDetalhe: OrcamentoDetalhe | null;
  transportadoras: Transportadora[];
  transportadoraMetricas: TransportadoraMetricas | null;
  detalheLoading: boolean;
  metricasLoading: boolean;
  detalheVolumesAgregados: VolumesAgregados;
  setView: (v: AppView) => void;
  setOrcamentoDetalhe: React.Dispatch<React.SetStateAction<OrcamentoDetalhe | null>>;
  onMarcarDivergenciaTratada: (orcamentoId: string, tratada: boolean) => Promise<void>;
}

const DivergenciasScreen = (props: DivergenciasScreenProps) => {
  const {
    divergenciaAtual,
    orcamentoDetalhe,
    transportadoras,
    transportadoraMetricas,
    detalheLoading,
    metricasLoading,
    detalheVolumesAgregados,
    setView,
    onMarcarDivergenciaTratada,
  } = props;

  return (
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
                  onClick={() => {
                    const novoValor = !orcamentoDetalhe.divergencia_tratada;
                    onMarcarDivergenciaTratada(orcamentoDetalhe.id, novoValor);
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
  );
};

export default DivergenciasScreen;
