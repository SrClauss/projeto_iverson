import React from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  Chip,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControlLabel,
  Checkbox,
  Tooltip,
} from '@mui/material';
import { Add, ContentCopy } from '@mui/icons-material';
import { glassPanel, tableHeaderRowSx, tableHeaderCellSx } from '../styles/glass';
import { onlyDigits, formatCNPJ } from '../utils/formatters';
import type { Transportadora, NovaTransportadoraForm } from '../types';

interface TransportadorasScreenProps {
  transportadoras: Transportadora[];
  novaTransportadora: NovaTransportadoraForm;
  editandoTransportadora: boolean;
  savingTransportadora: boolean;
  setNovaTransportadora: React.Dispatch<React.SetStateAction<NovaTransportadoraForm>>;
  setEditandoTransportadora: (v: boolean) => void;
  setTransportadoraEmEdicao: (v: Transportadora | null) => void;
  handleSalvarTransportadora: () => void;
  handleSalvarEdicaoTransportadora: () => void;
  handleEditarTransportadora: (t: Transportadora) => void;
  handleDeletarTransportadora: (t: Transportadora) => void;
}

const TransportadorasScreen = (props: TransportadorasScreenProps) => {
  const {
    transportadoras,
    novaTransportadora,
    editandoTransportadora,
    savingTransportadora,
    setNovaTransportadora,
    setEditandoTransportadora,
    setTransportadoraEmEdicao,
    handleSalvarTransportadora,
    handleSalvarEdicaoTransportadora,
    handleEditarTransportadora,
    handleDeletarTransportadora,
  } = props;

  const [mesmoEmail, setMesmoEmail] = React.useState(false);

  // Auto-reset the checkbox when the form is cleared after save
  React.useEffect(() => {
    if (!novaTransportadora.email_orcamento && !novaTransportadora.email_nota) {
      setMesmoEmail(false);
    }
  }, [novaTransportadora.email_orcamento, novaTransportadora.email_nota]);

  // When "mesmoEmail" is toggled on, mirror the orcamento email into nota
  const handleMesmoEmailChange = (checked: boolean) => {
    setMesmoEmail(checked);
    if (checked) {
      setNovaTransportadora((prev) => ({ ...prev, email_nota: prev.email_orcamento }));
    }
  };

  return (
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
            onChange={(event) => {
              const val = event.target.value;
              setNovaTransportadora((prev) => ({
                ...prev,
                email_orcamento: val,
                ...(mesmoEmail ? { email_nota: val } : {}),
              }));
            }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 0 } }}
            fullWidth
          />
          <Stack direction="row" alignItems="center" spacing={1}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={mesmoEmail}
                  onChange={(e) => handleMesmoEmailChange(e.target.checked)}
                />
              }
              label={
                <Typography variant="caption" sx={{ color: '#64748b' }}>
                  Usar mesmo email para nota
                </Typography>
              }
              sx={{ m: 0 }}
            />
            {!mesmoEmail && novaTransportadora.email_orcamento && (
              <Tooltip title="Copiar email de orçamento para nota" arrow>
                <Button
                  size="small"
                  variant="text"
                  startIcon={<ContentCopy fontSize="small" />}
                  onClick={() =>
                    setNovaTransportadora((prev) => ({ ...prev, email_nota: prev.email_orcamento }))
                  }
                  sx={{ textTransform: 'none', fontSize: '0.75rem', color: '#6366f1' }}
                >
                  Copiar
                </Button>
              </Tooltip>
            )}
          </Stack>
          <TextField
            label="Email para nota"
            value={novaTransportadora.email_nota}
            onChange={(event) =>
              setNovaTransportadora((prev) => ({ ...prev, email_nota: event.target.value }))
            }
            disabled={mesmoEmail}
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
                  setMesmoEmail(false);
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
                <TableCell sx={tableHeaderCellSx}>EMAIL ORÇAMENTO</TableCell>
                <TableCell sx={tableHeaderCellSx}>EMAIL NOTA</TableCell>
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
  );
};

export default TransportadorasScreen;
