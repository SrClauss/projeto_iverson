import { Box, Typography, List, ListItem, ListItemText, Divider } from '@mui/material';

const RelatoriosScreen = () => {
  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        gap: 3,
        py: 8,
        px: { xs: 3, md: 6 },
      }}
    >
      <Typography variant="h4" sx={{ fontWeight: 800, color: '#0f172a' }}>
        Ajuda rápida
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 780, lineHeight: 1.8 }}>
        Este sistema organiza todo o fluxo de orçamento de frete até a resolução de divergências com transportadoras.
        Aqui você vê o passo a passo e o papel da inteligência artificial no processo.
      </Typography>
      <Divider sx={{ width: '100%', borderColor: '#e2e8f0' }} />
      <List sx={{ width: '100%', maxWidth: 780, gap: 1 }}>
        <ListItem>
          <ListItemText
            primary="1. Crie o orçamento"
            secondary="Cadastre a nota, destino, peso, volumes e valor do produto. Esse é o ponto de partida para enviar propostas e controlar a entrega." 
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="2. Envie pedidos de proposta"
            secondary="Selecione transportadoras e dispare emails automaticamente para pedir cotações de frete." 
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="3. Receba ou registre propostas"
            secondary="Se a proposta vier por e-mail, o sistema pode processá-la. Se vier de outro canal, você também pode cadastrar manualmente o valor e o prazo." 
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="4. A IA analisa divergências"
            secondary="O sistema tenta buscar o XML da nota, compara com o orçamento e identifica diferenças em campos como cidade, peso, valor e prazo." 
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="5. Marque o que está correto"
            secondary="Se a divergência for aceita (por exemplo, diferença de formato de cidade), você pode marcar o campo como OK para que ele não apareça mais como erro." 
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="6. Envie a divergência para a transportadora"
            secondary="O sistema monta um e-mail de divergência com os campos problemáticos e manda para a transportadora responsável." 
          />
        </ListItem>
        <ListItem>
          <ListItemText
            primary="7. Finalize quando estiver ok"
            secondary="Marque a divergência como tratada depois que a transportadora responder ou o problema for resolvido." 
          />
        </ListItem>
      </List>
      <Divider sx={{ width: '100%', borderColor: '#e2e8f0' }} />
      <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a' }}>
        O que a IA faz aqui?
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 780, lineHeight: 1.8 }}>
        A inteligência artificial ajuda o sistema a entender melhor os dados:
      </Typography>
      <List sx={{ width: '100%', maxWidth: 780, gap: 1 }}>
        <ListItem>
          <ListItemText primary="• Extrai campos de e-mails e XML" secondary="A IA tenta ler valores, prazos e campos de destino automaticamente." />
        </ListItem>
        <ListItem>
          <ListItemText primary="• Compara orçamento x nota" secondary="Ela identifica quando algo não bate e sinaliza divergências reais." />
        </ListItem>
        <ListItem>
          <ListItemText primary="• Ajuda a reduzir falsos positivos" secondary="Campos como nome de cidade são comparados de forma mais inteligente, independentemente de maiúsculas ou acentos." />
        </ListItem>
      </List>
    </Box>
  );
};

export default RelatoriosScreen;
