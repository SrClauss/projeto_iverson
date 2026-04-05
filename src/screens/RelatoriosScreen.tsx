import { Box, Typography } from '@mui/material';

const RelatoriosScreen = () => {
  return (
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
  );
};

export default RelatoriosScreen;
