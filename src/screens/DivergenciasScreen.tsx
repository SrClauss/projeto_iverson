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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Paper,
  Collapse,
} from '@mui/material';
import {
  ArrowBack,
  TrendingUp,
  Warning as WarningAmberIcon,
  Email as EmailIcon,
  CheckCircle,
  Undo,
  ExpandMore,
  ExpandLess,
  MarkEmailRead,
} from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';
import { glassPanel } from '../styles/glass';
import type {
  AppView,
  CampoComparacao,
  CteComparacao,
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
  onEnviarEmailDivergencia: (orcamentoId: string, camposDivergentes: string[]) => Promise<void>;
  onFinalizarDivergencia: (orcamentoId: string) => Promise<void>;
  onReverterDivergencia: (orcamentoId: string) => Promise<void>;
}

const DivergenciasScreen = (props: DivergenciasScreenProps) => {
  const {
    divergenciaAtual,
    orcamentoDetalhe,
    transportadoras,
    transportadoraMetricas,
    detalheLoading,
    metricasLoading,
    setView,
    onEnviarEmailDivergencia,
    onFinalizarDivergencia,
    onReverterDivergencia,
  } = props;

  const [xmlInput, setXmlInput] = React.useState('');
  const [comparacao, setComparacao] = React.useState<CteComparacao | null>(null);
  const [comparandoXml, setComparandoXml] = React.useState(false);
  const [enviandoEmail, setEnviandoEmail] = React.useState(false);
  const [finalizando, setFinalizando] = React.useState(false);
  const [revertendo, setRevertendo] = React.useState(false);
  const [xmlError, setXmlError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
  const [correcaoExpandida, setCorrecaoExpandida] = React.useState(false);

  const emailStatus = orcamentoDetalhe?.divergencia_email_status ?? 'pendente';
  const camposDivergentes = orcamentoDetalhe?.divergencia_campos ?? [];
  const correcaoRecebida = orcamentoDetalhe?.divergencia_email_correcao;
  const finalizada = orcamentoDetalhe?.divergencia_tratada ?? false;

  const handleCompararXml = async () => {
    if (!orcamentoDetalhe || !xmlInput.trim()) return;
    setXmlError(null);
    setComparacao(null);
    setComparandoXml(true);
    try {
      // Accept raw XML or base64; convert raw XML to base64 if needed
      let b64 = xmlInput.trim();
      if (b64.startsWith('<') || b64.startsWith('<?')) {
        b64 = btoa(unescape(encodeURIComponent(b64)));
      }
      const result = await invoke<CteComparacao>('comparar_cte_xml', {
        orcamentoId: orcamentoDetalhe.id,
        xmlBase64: b64,
      });
      setComparacao(result);
    } catch (err) {
      setXmlError(String(err));
    } finally {
      setComparandoXml(false);
    }
  };

  const handleEnviarEmail = async () => {
    if (!orcamentoDetalhe || !comparacao) return;
    const campos = comparacao.campos
      .filter((c: CampoComparacao) => c.divergente)
      .map((c: CampoComparacao) => `${c.campo}: orçamento=${c.valor_orcamento}, XML=${c.valor_xml}`);
    if (campos.length === 0) { setXmlError('Nenhum campo divergente encontrado.'); return; }
    setEnviandoEmail(true);
    setXmlError(null);
    try {
      await onEnviarEmailDivergencia(orcamentoDetalhe.id, campos);
      setSuccessMsg('Email de divergência enviado com sucesso!');
      // Refresh detalhe
      const updated = await invoke<OrcamentoDetalhe>('get_orcamento_detalhe', { orcamentoId: orcamentoDetalhe.id });
      props.setOrcamentoDetalhe(updated);
    } catch (err) {
      setXmlError(String(err));
    } finally {
      setEnviandoEmail(false);
    }
  };

  const handleFinalizar = async () => {
    if (!orcamentoDetalhe) return;
    setFinalizando(true);
    setXmlError(null);
    try {
      await onFinalizarDivergencia(orcamentoDetalhe.id);
      const updated = await invoke<OrcamentoDetalhe>('get_orcamento_detalhe', { orcamentoId: orcamentoDetalhe.id });
      props.setOrcamentoDetalhe(updated);
      setSuccessMsg('Divergência finalizada com sucesso!');
    } catch (err) {
      setXmlError(String(err));
    } finally {
      setFinalizando(false);
    }
  };

  const handleReverter = async () => {
    if (!orcamentoDetalhe) return;
    setRevertendo(true);
    setXmlError(null);
    try {
      await onReverterDivergencia(orcamentoDetalhe.id);
      const updated = await invoke<OrcamentoDetalhe>('get_orcamento_detalhe', { orcamentoId: orcamentoDetalhe.id });
      props.setOrcamentoDetalhe(updated);
      setComparacao(null);
      setSuccessMsg('Divergência revertida para pendente.');
    } catch (err) {
      setXmlError(String(err));
    } finally {
      setRevertendo(false);
    }
  };

  const getStatusChip = () => {
    if (finalizada) return <Chip label="Finalizada" color="success" size="small" sx={{ fontWeight: 700 }} />;
    if (emailStatus === 'correcao_recebida') return <Chip label="Correção Recebida" color="warning" size="small" sx={{ fontWeight: 700 }} />;
    if (emailStatus === 'email_enviado') return <Chip label="Email Enviado" color="info" size="small" sx={{ fontWeight: 700 }} />;
    return <Chip label="Pendente" color="error" size="small" sx={{ fontWeight: 700 }} />;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Back + Alert */}
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

      {successMsg && (
        <Alert severity="success" onClose={() => setSuccessMsg(null)} sx={{ borderRadius: '12px' }}>
          {successMsg}
        </Alert>
      )}
      {xmlError && (
        <Alert severity="error" onClose={() => setXmlError(null)} sx={{ borderRadius: '12px' }}>
          {xmlError}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
        {/* Dados do Pedido */}
        <Box sx={{ ...glassPanel, p: 3 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>Dados do Pedido</Typography>
            {getStatusChip()}
          </Stack>
          {detalheLoading ? (
            <LinearProgress sx={{ borderRadius: 5, height: 4 }} />
          ) : orcamentoDetalhe ? (
            <Stack spacing={1.5}>
              {[
                { label: 'Nº Nota', value: orcamentoDetalhe.numero_nota ?? orcamentoDetalhe.nota ?? '-' },
                { label: 'Nº Cotação', value: orcamentoDetalhe.numero_cotacao ?? '-' },
                { label: 'Data de Criação', value: orcamentoDetalhe.data_criacao },
                { label: 'CEP de destino', value: orcamentoDetalhe.cep_destino ?? '-' },
                { label: 'Endereço de destino', value: orcamentoDetalhe.endereco_destino ?? '-' },
                { label: 'Valor do produto', value: orcamentoDetalhe.valor_produto ? `R$ ${orcamentoDetalhe.valor_produto.toFixed(2)}` : '-' },
                { label: 'Peso', value: orcamentoDetalhe.peso ? `${orcamentoDetalhe.peso.toFixed(3)} kg` : '-' },
                { label: 'CNPJ Remetente', value: orcamentoDetalhe.cnpj_pagador ?? '-' },
                { label: 'Qtd. Volumes', value: String(orcamentoDetalhe.qtd_volumes ?? '-') },
              ].map(({ label, value }) => (
                <Stack key={label} direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">{label}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{value}</Typography>
                </Stack>
              ))}

              {/* Divergencia email status section */}
              <Divider />
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" color="text.secondary">Status Divergência</Typography>
                {getStatusChip()}
              </Stack>

              {emailStatus === 'email_enviado' && !correcaoRecebida && (
                <Alert severity="info" sx={{ borderRadius: '10px', fontSize: '0.8rem' }}>
                  Aguardando resposta de correção da transportadora.
                </Alert>
              )}

              {correcaoRecebida && (
                <Box sx={{ bgcolor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: '10px', p: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" onClick={() => setCorrecaoExpandida(v => !v)} sx={{ cursor: 'pointer' }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <MarkEmailRead sx={{ color: '#d97706', fontSize: 18 }} />
                      <Typography variant="body2" sx={{ fontWeight: 700, color: '#92400e' }}>Correção recebida da transportadora</Typography>
                    </Stack>
                    {correcaoExpandida ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                  </Stack>
                  <Collapse in={correcaoExpandida}>
                    <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(0,0,0,0.03)', borderRadius: '8px', maxHeight: 200, overflowY: 'auto' }}>
                      <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{correcaoRecebida}</Typography>
                    </Box>
                  </Collapse>
                </Box>
              )}

              {camposDivergentes.length > 0 && (
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Campos divergentes notificados
                  </Typography>
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {camposDivergentes.map((c, i) => (
                      <Typography key={i} variant="caption" sx={{ color: '#dc2626', fontFamily: 'monospace', fontSize: '0.7rem' }}>• {c}</Typography>
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Action buttons */}
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                {!finalizada && (emailStatus === 'email_enviado' || emailStatus === 'correcao_recebida') && (
                  <Button
                    variant="contained"
                    color="success"
                    size="small"
                    startIcon={<CheckCircle />}
                    onClick={handleFinalizar}
                    disabled={finalizando}
                    sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700 }}
                  >
                    {finalizando ? 'Finalizando...' : 'Finalizar Divergência'}
                  </Button>
                )}
                {(emailStatus !== 'pendente' || finalizada) && (
                  <Button
                    variant="outlined"
                    color="warning"
                    size="small"
                    startIcon={<Undo />}
                    onClick={handleReverter}
                    disabled={revertendo}
                    sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700 }}
                  >
                    {revertendo ? 'Revertendo...' : 'Reverter'}
                  </Button>
                )}
              </Stack>

              <Divider />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#475569' }}>PROPOSTAS</Typography>
              {orcamentoDetalhe.propostas.map((proposta) => {
                const ganhadora = orcamentoDetalhe.proposta_ganhadora_id === proposta.id;
                const divergente = proposta.valor_frete_pago != null && proposta.valor_frete_pago !== proposta.valor_proposta;
                return (
                  <Box
                    key={proposta.id}
                    sx={{
                      p: 1.5, borderRadius: '10px',
                      bgcolor: divergente ? 'rgba(239,68,68,0.08)' : ganhadora ? 'rgba(34,197,94,0.06)' : 'rgba(99,102,241,0.05)',
                      border: `1px solid ${divergente ? 'rgba(239,68,68,0.2)' : ganhadora ? 'rgba(34,197,94,0.2)' : 'rgba(99,102,241,0.12)'}`,
                    }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>{proposta.transportadora_nome ?? 'Transportadora não informada'}</Typography>
                        <Typography variant="caption" display="block" color="text.secondary">
                          Proposta: R$ {Number(proposta.valor_proposta).toFixed(2)}
                          {proposta.valor_frete_pago != null && <> · Nota: R$ {Number(proposta.valor_frete_pago).toFixed(2)}</>}
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
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>Dados da Transportadora</Typography>
          {divergenciaAtual?.transportadora_id ? (
            (() => {
              const t = transportadoras.find((tr) => tr.id === divergenciaAtual.transportadora_id);
              return t ? (
                <Stack spacing={1.5}>
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
                    <Avatar sx={{ bgcolor: '#6366f1', width: 44, height: 44, fontWeight: 700 }}>{t.nome.charAt(0).toUpperCase()}</Avatar>
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
                <Typography variant="body2" color="text.secondary">Transportadora: <b>{divergenciaAtual.transportadora}</b></Typography>
              );
            })()
          ) : (
            <Typography variant="body2" color="text.secondary">Transportadora: <b>{divergenciaAtual?.transportadora}</b></Typography>
          )}
        </Box>

        {/* Análise de XML CT-e */}
        {orcamentoDetalhe && (
          <Box sx={{ ...glassPanel, p: 3, gridColumn: { xs: '1', lg: '1 / -1' } }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <EmailIcon sx={{ color: '#6366f1' }} />
              <Typography variant="h6" sx={{ fontWeight: 800 }}>Análise de CT-e XML</Typography>
            </Stack>
            <Stack spacing={2}>
              <TextField
                label="Cole o conteúdo do XML CT-e aqui"
                multiline
                rows={4}
                value={xmlInput}
                onChange={(e) => setXmlInput(e.target.value)}
                fullWidth
                sx={{ '& .MuiOutlinedInput-root': { fontFamily: 'monospace', fontSize: '0.8rem', borderRadius: '10px' } }}
                placeholder="<?xml version=&quot;1.0&quot;?><CTeOS>...</CTeOS>"
              />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  onClick={handleCompararXml}
                  disabled={comparandoXml || !xmlInput.trim()}
                  sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700 }}
                >
                  {comparandoXml ? 'Analisando...' : 'Analisar XML'}
                </Button>
                {comparacao?.tem_divergencia && emailStatus === 'pendente' && (
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<EmailIcon />}
                    onClick={handleEnviarEmail}
                    disabled={enviandoEmail}
                    sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700 }}
                  >
                    {enviandoEmail ? 'Enviando...' : 'Enviar Email de Divergência'}
                  </Button>
                )}
              </Stack>

              {comparacao && (
                <Box>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <Chip
                      label={comparacao.tem_divergencia ? `${comparacao.campos.filter((c: CampoComparacao) => c.divergente).length} campo(s) divergente(s)` : 'Sem divergências'}
                      color={comparacao.tem_divergencia ? 'error' : 'success'}
                      sx={{ fontWeight: 700 }}
                    />
                  </Stack>
                  <TableContainer component={Paper} sx={{ borderRadius: '10px', boxShadow: 'none', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: 'rgba(99,102,241,0.06)' }}>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Campo</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Orçamento</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>XML CT-e</TableCell>
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {comparacao.campos.map((campo: CampoComparacao) => (
                          <TableRow
                            key={campo.campo}
                            sx={{ bgcolor: campo.divergente ? 'rgba(239,68,68,0.05)' : undefined }}
                          >
                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{campo.campo}</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem' }}>{campo.valor_orcamento}</TableCell>
                            <TableCell sx={{ fontSize: '0.75rem' }}>{campo.valor_xml}</TableCell>
                            <TableCell>
                              <Chip
                                label={campo.divergente ? 'Divergente' : 'OK'}
                                size="small"
                                color={campo.divergente ? 'error' : 'success'}
                                sx={{ fontWeight: 700, fontSize: '0.65rem' }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </Stack>
          </Box>
        )}

        {/* Métricas da Transportadora */}
        <Box
          sx={{
            ...glassPanel, p: 3,
            gridColumn: { xs: '1', lg: '1 / -1' },
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            color: 'white',
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <TrendingUp sx={{ color: '#6366f1' }} />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>Histórico com esta Transportadora</Typography>
          </Stack>
          {metricasLoading ? (
            <LinearProgress sx={{ borderRadius: 5, height: 4, bgcolor: 'rgba(255,255,255,0.1)', '& .MuiLinearProgress-bar': { bgcolor: '#6366f1' } }} />
          ) : transportadoraMetricas ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' }, gap: 2 }}>
              {[
                { label: 'Total de Transações', value: String(transportadoraMetricas.total_transacoes) },
                { label: 'Com Divergência', value: String(transportadoraMetricas.transacoes_com_divergencia) },
                { label: 'Taxa de Divergência', value: `${transportadoraMetricas.taxa_divergencia_pct.toFixed(1)}%` },
                { label: 'Valor Médio Proposta', value: `R$ ${transportadoraMetricas.valor_medio_proposta.toFixed(2)}` },
                { label: 'Valor Médio Pago', value: `R$ ${transportadoraMetricas.valor_medio_frete_pago.toFixed(2)}` },
                { label: 'Divergência Média', value: `R$ ${transportadoraMetricas.divergencia_media.toFixed(2)}` },
              ].map(({ label, value }) => (
                <Box key={label} sx={{ textAlign: 'center', p: 1.5, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                  <Typography variant="caption" sx={{ opacity: 0.6, display: 'block', mb: 0.5, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 900, fontSize: '1.1rem', color: label === 'Com Divergência' || label === 'Taxa de Divergência' ? '#fca5a5' : 'white' }}>{value}</Typography>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography variant="body2" sx={{ opacity: 0.6 }}>Nenhum dado de métricas disponível.</Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default DivergenciasScreen;
