import {
  Box,
  Stack,
  Avatar,
  Tooltip,
  IconButton,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Add,
  LocalShipping,
  HelpOutline,
} from '@mui/icons-material';
import { glassPanel } from '../styles/glass';
import type { AppView } from '../types';

interface SidebarProps {
  view: AppView;
  setView: (v: AppView) => void;
  handleNovoOrcamento: () => void;
}

const Sidebar = ({ view, setView, handleNovoOrcamento }: SidebarProps) => {
  return (
    <>
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
          <Tooltip title="Ajuda" arrow>
            <IconButton
              onClick={() => setView('relatorios')}
              sx={{
                color: view === 'relatorios' ? '#6366f1' : '#64748b',
                bgcolor: view === 'relatorios' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              }}
            >
              <HelpOutline />
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
          <Tooltip title="Ajuda" placement="right" arrow>
            <IconButton
              onClick={() => setView('relatorios')}
              sx={{
                color: view === 'relatorios' ? '#6366f1' : '#64748b',
                bgcolor: view === 'relatorios' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              }}
            >
              <HelpOutline />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
    </>
  );
};

export default Sidebar;
