export const glassPanel = {
  background: 'rgba(255, 255, 255, 0.2)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  border: '1px solid rgba(255, 255, 255, 0.4)',
  borderRadius: '24px',
  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.08)',
};

export const tableHeaderRowSx = {
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

export const tableHeaderCellSx = {
  border: 'none',
  color: '#475569',
  fontWeight: 900,
  fontSize: '0.8rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  py: 1.75,
  boxShadow: 'inset 0 -1px 0 rgba(15, 23, 42, 0.08)',
};
