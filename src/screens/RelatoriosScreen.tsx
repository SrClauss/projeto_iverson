import { Box, Typography, List, ListItem, ListItemText, Divider, Tabs, Tab } from '@mui/material';
import { useState } from 'react';

const RelatoriosScreen = () => {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

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
        Ajuda & Notas de Versão
      </Typography>

      <Tabs value={tabValue} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider', width: '100%' }}>
        <Tab label="Ajuda" />
        <Tab label="Notas de Versão" />
      </Tabs>

      {tabValue === 0 && (
        <>
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
        </>
      )}

      {tabValue === 1 && (
        <>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a', mt: 2 }}>
            Versão 1.0.1
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Lançada em 14 de abril de 2026
          </Typography>
          <Divider sx={{ width: '100%', borderColor: '#e2e8f0' }} />
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', mt: 2 }}>
            🎯 Melhorias no Cadastro de Orçamentos
          </Typography>
          <List sx={{ width: '100%', maxWidth: 780, gap: 1 }}>
            <ListItem>
              <ListItemText 
                primary="• Campo Complemento adicionado"
                secondary="Agora é possível informar complemento do endereço (apto, sala, bloco, etc.) de forma opcional."
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="• Reorganização dos campos de endereço"
                secondary="Layout otimizado: Linha 1: Logradouro e Bairro | Linha 2: Complemento, Cidade, UF e Número."
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="• UF agora é um select"
                secondary="Campo de Estado (UF) convertido para lista suspensa com todos os 27 estados brasileiros, impedindo erros de digitação."
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="• Campos obrigatórios implementados"
                secondary="Todos os campos de endereço agora são obrigatórios (exceto complemento), incluindo: CEP, Logradouro, Número, Bairro, Cidade e UF. Também são obrigatórios: Nota, Número de Cotação, CNPJ/CPF de Destino e pelo menos 1 volume completo."
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="• Validações aprimoradas"
                secondary="Sistema agora impede salvamento de orçamento sem campos obrigatórios, exibindo mensagens claras sobre o que está faltando."
              />
            </ListItem>
          </List>
          <Divider sx={{ width: '100%', borderColor: '#e2e8f0', mt: 2 }} />
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', mt: 2 }}>
            🎨 Ajustes de Interface
          </Typography>
          <List sx={{ width: '100%', maxWidth: 780, gap: 1 }}>
            <ListItem>
              <ListItemText 
                primary="• Melhor aproveitamento de espaço"
                secondary="Proporção entre área de formulário e área de propostas ajustada para 1.5:1, oferecendo melhor visualização."
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="• Larguras otimizadas"
                secondary="Campo Complemento: 180px | Campo Número: 140px | Campo UF: 100px - proporção visual aprimorada."
              />
            </ListItem>
          </List>
          <Divider sx={{ width: '100%', borderColor: '#e2e8f0', mt: 2 }} />
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', mt: 2 }}>
            🏗️ Melhorias Técnicas
          </Typography>
          <List sx={{ width: '100%', maxWidth: 780, gap: 1 }}>
            <ListItem>
              <ListItemText 
                primary="• Backend atualizado"
                secondary="Modelo de dados Rust atualizado para suportar campo complemento_destino em todas as operações."
              />
            </ListItem>
            <ListItem>
              <ListItemText 
                primary="• Build system otimizado"
                secondary="Variáveis de ambiente agora são embutidas no binário em tempo de compilação usando option_env!(), garantindo portabilidade."
              />
            </ListItem>
          </List>
        </>
      )}
    </Box>
  );
};

export default RelatoriosScreen;
