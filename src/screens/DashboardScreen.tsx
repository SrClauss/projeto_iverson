import {
  Box,
  Stack,
  Typography,
  Button,
  Chip,
  TextField,
  FormControl,
  Select,
  MenuItem,
  OutlinedInput,
  InputAdornment,
  InputLabel,
  Checkbox,
  ListItemText,
  Switch,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
  Tooltip,
  IconButton,
  LinearProgress,
  CircularProgress,
} from '@mui/material';
import {
  Tune,
  FilterAlt,
  RestartAlt,
  Search,
  FitnessCenter,
  AttachMoney,
  CalendarMonth,
  LocalShipping,
  NotificationsActive,
  CheckCircle,
  Close,
  Delete,
  Email,
} from '@mui/icons-material';
import { glassPanel, tableHeaderRowSx, tableHeaderCellSx } from '../styles/glass';
import type {
  FilterKey,
  DashboardStats,
  OrcamentoRecenteItem,
  DashboardAlertaItem,
  Transportadora,
  GoogleAuthStatus,
  WatcherStatus,
  EmailPendente,
} from '../types';

interface DashboardScreenProps {
  stats: DashboardStats | null;
  orcamentos: OrcamentoRecenteItem[];
  alertas: DashboardAlertaItem[];
  googleAuth: GoogleAuthStatus | null;
  googleAuthLoading: boolean;
  watcherStatus: WatcherStatus | null;
  watcherLoading: boolean;
  emailsPendentes: EmailPendente[];
  emailAssociarId: string | null;
  orcamentoAssociarId: string;
  filterType: FilterKey;
  descricao: string;
  valorMin: string;
  valorMax: string;
  dataInicial: string;
  dataFinal: string;
  transportadoraIds: string[];
  transportadoras: Transportadora[];
  filtroAtivoLabel: string | null;
  mostrarInativos: boolean;
  filterLoading: boolean;
  setFilterType: (v: FilterKey) => void;
  setDescricao: (v: string) => void;
  setValorMin: (v: string) => void;
  setValorMax: (v: string) => void;
  setDataInicial: (v: string) => void;
  setDataFinal: (v: string) => void;
  setTransportadoraIds: (v: string[]) => void;
  setEmailAssociarId: (v: string | null) => void;
  setOrcamentoAssociarId: (v: string) => void;
  handleApplyFilter: () => void;
  handleClearFilter: () => void;
  handleToggleMostrarInativos: (val: boolean) => Promise<void>;
  handleResolverDivergencia: (alerta: DashboardAlertaItem) => void;
  handleVerDetalhes: (id: string) => void;
  handleExcluirOrcamento: (id: string) => void;
  handleGoogleLogin: () => void;
  handleGoogleLogout: () => void;
  handleToggleWatcher: () => void;
  handleDescartarEmail: (emailId: string) => void;
  handleExcluirEmail: (emailId: string) => void;
  handleAssociarEmail: (emailId: string, orcId: string) => void;
}

const DashboardScreen = (props: DashboardScreenProps) => {
  const {
    stats,
    orcamentos,
    alertas,
    googleAuth,
    googleAuthLoading,
    watcherStatus,
    watcherLoading,
    emailsPendentes,
    emailAssociarId,
    orcamentoAssociarId,
    filterType,
    descricao,
    valorMin,
    valorMax,
    dataInicial,
    dataFinal,
    transportadoraIds,
    transportadoras,
    filtroAtivoLabel,
    mostrarInativos,
    filterLoading,
    setFilterType,
    setDescricao,
    setValorMin,
    setValorMax,
    setDataInicial,
    setDataFinal,
    setTransportadoraIds,
    setEmailAssociarId,
    setOrcamentoAssociarId,
    handleApplyFilter,
    handleClearFilter,
    handleToggleMostrarInativos,
    handleResolverDivergencia,
    handleVerDetalhes,
    handleExcluirOrcamento,
    handleGoogleLogin,
    handleGoogleLogout,
    handleToggleWatcher,
    handleDescartarEmail,
    handleExcluirEmail,
    handleAssociarEmail,
  } = props;

  return (
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
            <MenuItem value="numero_nota">Número de Nota</MenuItem>
            <MenuItem value="descricao">Descrição</MenuItem>
            <MenuItem value="cep_destino">CEP de destino</MenuItem>
            <MenuItem value="valor_produto">Faixa valor do produto</MenuItem>
            <MenuItem value="peso">Faixa de peso</MenuItem>
            <MenuItem value="data_criacao">Data de criação</MenuItem>
            <MenuItem value="transportadora">Transportadora</MenuItem>
          </TextField>

          {(filterType === 'descricao' || filterType === 'numero_nota') && (
            <TextField
              label={filterType === 'numero_nota' ? 'Número de Nota' : 'Descrição exata'}
              variant="outlined"
              placeholder={filterType === 'numero_nota' ? 'Ex.: 123456' : 'Ex.: Pedido 123'}
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

          {filterType === 'cep_destino' && (
            <TextField
              label="CEP de destino"
              variant="outlined"
              placeholder="Ex.: 01310-100"
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
                  await handleToggleMostrarInativos(e.target.checked);
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
                    <TableCell sx={tableHeaderCellSx}>ENTIDADE</TableCell>
                    <TableCell sx={tableHeaderCellSx}>PROPOSTAS</TableCell>
                    <TableCell sx={tableHeaderCellSx}>STATUS</TableCell>
                    <TableCell sx={tableHeaderCellSx}>DATA</TableCell>
                    <TableCell sx={tableHeaderCellSx}>AÇÃO</TableCell>
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
  );
};

export default DashboardScreen;
