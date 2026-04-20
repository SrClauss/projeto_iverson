import React, { useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  TextField,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Tooltip,
  IconButton,
  LinearProgress,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Alert,
} from '@mui/material';
import {
  Email,
  Add,
  Delete,
  DeleteOutline,
  AttachMoney,
  Receipt,
} from '@mui/icons-material';
import { glassPanel, tableHeaderRowSx, tableHeaderCellSx } from '../styles/glass';
import { onlyDigits, formatCnpjOrCpf, formatCurrencyInput } from '../utils/formatters';
import type {
  Transportadora,
  OrcamentoDetalhe,
  NovoOrcamentoForm,
  NovaPropostaForm,
  VolumesAgregados,
} from '../types';

interface OrcamentosScreenProps {
  orcamentoSelecionadoId: string | null;
  orcamentoDetalhe: OrcamentoDetalhe | null;
  novoOrcamento: NovoOrcamentoForm;
  novaProposta: NovaPropostaForm;
  transportadoras: Transportadora[];
  savingOrcamento: boolean;
  savingEdicaoOrcamento: boolean;
  savingProposta: boolean;
  detalheLoading: boolean;
  sendingOrcamentoEmail: boolean;
  showEnviarOrcamentoModal: boolean;
  selectedTransportadoraIds: string[];
  forceSendTransportadoraIds: string[];
  cepError: string | null;
  volumesAgregados: VolumesAgregados;
  modalError: string | null;
  setNovoOrcamento: React.Dispatch<React.SetStateAction<NovoOrcamentoForm>>;
  setNovaProposta: React.Dispatch<React.SetStateAction<NovaPropostaForm>>;
  setShowEnviarOrcamentoModal: (v: boolean) => void;
  handleSalvarOrcamento: () => void;
  handleSalvarEdicaoOrcamento: () => void;
  handleAdicionarPropostaManual: () => void;
  handleDesativarOrcamento: () => void;
  handleReativarOrcamento: () => void;
  handleEscolherGanhadora: (propostaId: string) => void;
  handleDesfazerGanhadora: () => void;
  handleExcluirProposta: (propostaId: string) => void;
  handleRegistrarNotaManual: (propostaId: string, valorFretePago: number) => void;
  handleOpenEnviarOrcamentoModal: () => void;
  handleEnviarEmailOrcamento: () => void;
  handleToggleSelectTransportadora: (transportadoraId: string) => void;
  handleToggleForceSendTransportadora: (transportadoraId: string) => void;
  setSelectedTransportadoraIds: (ids: string[]) => void;
}

const OrcamentosScreen = (props: OrcamentosScreenProps) => {
  const {
    orcamentoSelecionadoId,
    orcamentoDetalhe,
    novoOrcamento,
    novaProposta,
    transportadoras,
    savingOrcamento,
    savingEdicaoOrcamento,
    savingProposta,
    detalheLoading,
    sendingOrcamentoEmail,
    showEnviarOrcamentoModal,
    selectedTransportadoraIds,
    forceSendTransportadoraIds,
    cepError,
    volumesAgregados,
    modalError,
    setNovoOrcamento,
    setNovaProposta,
    setShowEnviarOrcamentoModal,
    handleSalvarOrcamento,
    handleSalvarEdicaoOrcamento,
    handleAdicionarPropostaManual,
    handleDesativarOrcamento,
    handleReativarOrcamento,
    handleEscolherGanhadora,
    handleDesfazerGanhadora,
    handleExcluirProposta,
    handleOpenEnviarOrcamentoModal,
    handleEnviarEmailOrcamento,
    handleToggleSelectTransportadora,
    handleToggleForceSendTransportadora,
    setSelectedTransportadoraIds,
    handleRegistrarNotaManual,
  } = props;

  const [notaInputPropostaId, setNotaInputPropostaId] = useState<string | null>(null);
  const [notaInputValor, setNotaInputValor] = useState('');
  const [savingNota, setSavingNota] = useState(false);

  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', xl: '1.0fr 1fr' },
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
                label="Número de Cotação"
                value={novoOrcamento.numero_cotacao}
                onChange={(event) =>
                  setNovoOrcamento((prev) => ({ ...prev, numero_cotacao: event.target.value }))
                }
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                fullWidth
                required
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
              required
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Logradouro"
                value={novoOrcamento.logradouro_destino}
                onChange={(event) =>
                  setNovoOrcamento((prev) => ({ ...prev, logradouro_destino: event.target.value }))
                }
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                fullWidth
                required
              />
              <TextField
                label="Bairro"
                value={novoOrcamento.bairro_destino}
                onChange={(event) =>
                  setNovoOrcamento((prev) => ({ ...prev, bairro_destino: event.target.value }))
                }
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                fullWidth
                required
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Complemento"
                value={novoOrcamento.complemento_destino}
                onChange={(event) =>
                  setNovoOrcamento((prev) => ({ ...prev, complemento_destino: event.target.value }))
                }
                sx={{ maxWidth: 180, '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
              />
              <TextField
                label="Cidade"
                value={novoOrcamento.cidade_destino}
                onChange={(event) =>
                  setNovoOrcamento((prev) => ({ ...prev, cidade_destino: event.target.value }))
                }
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                fullWidth
                required
              />
              <FormControl sx={{ minWidth: 100, '& .MuiOutlinedInput-root': { borderRadius: 0 } }} required>
                <InputLabel>UF</InputLabel>
                <Select
                  label="UF"
                  value={novoOrcamento.uf_destino}
                  onChange={(event) =>
                    setNovoOrcamento((prev) => ({ ...prev, uf_destino: event.target.value }))
                  }
                >
                  <MenuItem value="AC">AC</MenuItem>
                  <MenuItem value="AL">AL</MenuItem>
                  <MenuItem value="AP">AP</MenuItem>
                  <MenuItem value="AM">AM</MenuItem>
                  <MenuItem value="BA">BA</MenuItem>
                  <MenuItem value="CE">CE</MenuItem>
                  <MenuItem value="DF">DF</MenuItem>
                  <MenuItem value="ES">ES</MenuItem>
                  <MenuItem value="GO">GO</MenuItem>
                  <MenuItem value="MA">MA</MenuItem>
                  <MenuItem value="MT">MT</MenuItem>
                  <MenuItem value="MS">MS</MenuItem>
                  <MenuItem value="MG">MG</MenuItem>
                  <MenuItem value="PA">PA</MenuItem>
                  <MenuItem value="PB">PB</MenuItem>
                  <MenuItem value="PR">PR</MenuItem>
                  <MenuItem value="PE">PE</MenuItem>
                  <MenuItem value="PI">PI</MenuItem>
                  <MenuItem value="RJ">RJ</MenuItem>
                  <MenuItem value="RN">RN</MenuItem>
                  <MenuItem value="RS">RS</MenuItem>
                  <MenuItem value="RO">RO</MenuItem>
                  <MenuItem value="RR">RR</MenuItem>
                  <MenuItem value="SC">SC</MenuItem>
                  <MenuItem value="SP">SP</MenuItem>
                  <MenuItem value="SE">SE</MenuItem>
                  <MenuItem value="TO">TO</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Número"
                value={novoOrcamento.numero_destino}
                onChange={(event) =>
                  setNovoOrcamento((prev) => ({ ...prev, numero_destino: event.target.value }))
                }
                sx={{ maxWidth: 140, '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                required
              />
            </Stack>
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
                required
              />
              <TextField
                label="Valor"
                placeholder="valor"
                type="text"
                value={novoOrcamento.valor_produto}
                onChange={(event) => {
                  const formatted = formatCurrencyInput(event.target.value);
                  setNovoOrcamento((prev) => ({ ...prev, valor_produto: formatted }));
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}>
                <InputLabel>CNPJ do Remetente</InputLabel>
                <Select
                  label="CNPJ do Remetente"
                  value={novoOrcamento.cnpj_pagador}
                  onChange={(event) =>
                    setNovoOrcamento((prev) => ({ ...prev, cnpj_pagador: event.target.value as string }))
                  }
                >
                  <MenuItem value="">— Selecione —</MenuItem>
                  <MenuItem value="23215217000114">23.215.217/0001-14</MenuItem>
                  <MenuItem value="51540489000125">51.540.489/0001-25</MenuItem>
                </Select>
              </FormControl>
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
                required
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
                  onChange={(event) => {
                    const formatted = formatCurrencyInput(event.target.value);
                    setNovaProposta((prev) => ({ ...prev, valor_proposta: formatted }));
                  }}
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
                  label="Prazo de entrega (dias) *"
                  type="number"
                  placeholder="Ex.: 5"
                  inputProps={{ min: 1, step: 1 }}
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

                              {ganhadora && item.valor_frete_pago == null && (
                                notaInputPropostaId === item.id ? (
                                  <Stack direction="row" spacing={0.5} alignItems="center">
                                    <TextField
                                      size="small"
                                      placeholder="Valor frete pago"
                                      value={notaInputValor}
                                      onChange={(e) => {
                                        const formatted = formatCurrencyInput(e.target.value);
                                        setNotaInputValor(formatted);
                                      }}
                                      sx={{ width: 140, '& .MuiOutlinedInput-root': { borderRadius: 0, fontSize: '0.75rem' } }}
                                      slotProps={{
                                        input: {
                                          startAdornment: (
                                            <InputAdornment position="start">
                                              <AttachMoney sx={{ fontSize: 14, color: '#64748b' }} />
                                            </InputAdornment>
                                          ),
                                        },
                                      }}
                                    />
                                    <Button
                                      size="small"
                                      variant="contained"
                                      color="success"
                                      disabled={savingNota || !notaInputValor.trim()}
                                      sx={{ textTransform: 'none', borderRadius: '8px', minWidth: 60, fontSize: '0.7rem' }}
                                      onClick={async () => {
                                        const { parseCurrency } = await import('../utils/formatters');
                                        const valor = parseCurrency(notaInputValor);
                                        if (!valor || isNaN(valor) || valor <= 0) return;
                                        setSavingNota(true);
                                        try {
                                          await handleRegistrarNotaManual(item.id, valor);
                                          setNotaInputPropostaId(null);
                                          setNotaInputValor('');
                                        } finally {
                                          setSavingNota(false);
                                        }
                                      }}
                                    >
                                      {savingNota ? '...' : 'Salvar'}
                                    </Button>
                                    <Button
                                      size="small"
                                      variant="text"
                                      sx={{ textTransform: 'none', fontSize: '0.7rem', minWidth: 48 }}
                                      onClick={() => { setNotaInputPropostaId(null); setNotaInputValor(''); }}
                                    >
                                      Cancelar
                                    </Button>
                                  </Stack>
                                ) : (
                                  <Tooltip title="Registrar nota manualmente" arrow>
                                    <IconButton
                                      size="small"
                                      color="primary"
                                      onClick={() => { setNotaInputPropostaId(item.id); setNotaInputValor(''); }}
                                      sx={{ border: '1px solid rgba(59, 130, 246, 0.4)' }}
                                    >
                                      <Receipt fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )
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

      <Dialog
        open={showEnviarOrcamentoModal}
        onClose={() => setShowEnviarOrcamentoModal(false)}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>Selecionar transportadoras para envio</DialogTitle>
        <DialogContent>
          {modalError && (
            <Alert severity="error" sx={{ mb: 2 }}>{modalError}</Alert>
          )}
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
    </>
  );
};

export default OrcamentosScreen;
