# Iverson App

Este documento descreve o fluxo completo do aplicativo, desde a criação do orçamento até o tratamento de divergências de nota.

## Visão geral do sistema

O aplicativo é uma solução híbrida de frontend React + backend Tauri/Rust que gerencia orçamentos, propostas de transporte e divergências entre o orçamento e a nota de transporte.

As principais etapas do fluxo são:

1. Criação de orçamento
2. Envio de e-mail de propostas para transportadoras
3. Cadastro manual de propostas
4. Análise e marcação de divergências entre orçamento e nota
5. Envio de e-mail para transportadoras com divergências
6. Finalização do ciclo de divergência

## 1. Criação do Orçamento

A tela de cadastro de orçamentos (`src/screens/OrcamentosScreen.tsx`) permite ao usuário criar ou editar um orçamento com os seguintes dados:

- Número de nota / número de cotação
- Data de criação
- CEP e endereço de destino
- Nota do produto (`nota`)
- Valor do produto (`valor_produto`)
- Volumes, dimensões e peso
- CNPJ pagador e CNPJ/CPF do destino

O disparo para salvar o orçamento ocorre em `src/App.tsx` na função `handleSalvarOrcamento`, que valida campos obrigatórios e chama o comando Tauri `add_orcamento`.

### Relação nota de transporte x número de nota do produto

O orçamento guarda o campo `nota` e os campos `numero_nota` / `numero_cotacao`. Quando o orçamento é criado com esses dados, a nota de transporte é associada a essa referência como parte do próprio cadastro de orçamento. Essa relação garante que, ao enviar e analisar propostas ou notas, o sistema utilize corretamente o número da nota de produto que foi informado.

## 2. Envio de e-mail de propostas

Após criar o orçamento, o usuário pode enviar solicitações de proposta para transportadoras cadastradas.

- O botão de envio abre um modal de seleção de transportadoras.
- O aplicativo seleciona automaticamente transportadoras que ainda não receberam este orçamento, mas permite forçar reenvio para transportadoras já enviadas.
- O envio ocorre pela função `handleEnviarEmailOrcamento` em `src/App.tsx`.
- O comando Tauri chamado é `send_orcamento_request_email`.

Os dados enviados por e-mail incluem:

- número da nota e/ou cotação
- descrição do orçamento
- nota do produto
- valor do produto
- peso
- CEP e endereço de destino
- data de criação

## 3. Cadastro de propostas manualmente

O sistema permite cadastrar propostas manualmente em `src/screens/OrcamentosScreen.tsx`.

- O formulário de proposta manual inclui: valor da proposta, transportadora, data da proposta e prazo de entrega.
- A ação é tratada em `src/App.tsx` pela função `handleAdicionarPropostaManual`.
- Esse fluxo é útil quando a proposta não foi recebida automaticamente por e-mail ou quando o usuário precisa inserir uma cotação diretamente.

As propostas cadastradas ficam vinculadas ao orçamento e podem ser exibidas na tela de detalhes do orçamento.

## 4. Análise de divergências

O sistema detecta divergências entre o orçamento e as informações de nota de transporte. A análise de divergência é feita principalmente na tela de divergências (`src/screens/DivergenciasScreen.tsx`).

### Como a análise funciona

- Ao carregar um orçamento na tela de divergências, o frontend tenta buscar automaticamente o XML associado ao orçamento via `buscar_xml_orcamento`.
- Se o XML estiver disponível, o sistema executa a comparação usando o comando `comparar_cte_xml`.
- O resultado da comparação é um conjunto de campos com valores do orçamento e valores extraídos do XML.
- Cada campo divergente é identificado e exibido ao usuário.

### Entrada manual de XML

Se a busca automática falhar, o usuário pode colar o XML manualmente e executar a comparação via botão.

## 5. Marcação de divergências

Durante a análise de divergências, o usuário pode marcar campos como aceitos:

- Campos divergentes podem ser aceitos individualmente
- Campos marcados como aceitos são persistidos usando o comando `salvar_campos_divergencia`
- Isso permite que o sistema ignore diferenças já validadas e foque apenas nas divergências reais

A tela também exibe o status atual da divergência:

- pendente
- email enviado
- correção recebida
- finalizada

## 6. Envio de e-mail para transportadoras com divergências

Após analisar e marcar divergências, o usuário pode enviar um e-mail de divergência à transportadora responsável.

- O botão de envio coleta todos os campos divergentes ainda não aceitos
- A função `handleEnviarEmailDivergencia` em `src/App.tsx` chama o comando `enviar_email_divergencia`
- O sistema marcou no orçamento quais campos estão divergentes e registra o envio do e-mail

O envio de e-mail de divergência serve para comunicar à transportadora as diferenças encontradas entre a proposta orçada e a nota efetivamente recebida.

## 7. Finalização

Depois que a divergência é tratada, o usuário pode concluir o processo:

- A tela permite finalizar o tratamento de divergência com `handleFinalizarDivergencia`
- É possível também reverter uma divergência para o estado pendente via `handleReverterDivergencia`
- A marcação de divergência como tratada é feita por `handleMarcarDivergenciaTratada`

A finalização atualiza o dashboard e a situação do orçamento, fechando o ciclo de controle de divergências.

## Tabelas de dados principais

### `OrcamentoDetalhe`

O modelo de orçamento contém campos como:

- `id`
- `descricao`
- `numero_nota`
- `numero_cotacao`
- `data_criacao`
- `nota`
- `valor_produto`
- `propostas`
- `divergencia_tratada`
- `divergencia_email_status`
- `divergencia_campos`
- `divergencia_campos_aceitos`
- `divergencia_email_correcao`
- `transportadoras_enviadas`

### `PropostaDetalhe`

Cada proposta contém:

- `id`
- `valor_proposta`
- `transportadora_id`
- `transportadora_nome`
- `data_proposta`
- `valor_frete_pago` (quando informado pela nota)

## Pontos importantes

- O fluxo do app está centrado em orçamentos ativos, envio de propostas e gestão de divergências.
- O dashboard fornece um monitor de e-mails, alertas e estatísticas de divergência.
- A integração de Gmail é usada para processar emails de transportadoras e identificar notas recebidas.
- A tela de transportadoras permite cadastrar e manter contatos com e-mails de orçamento e de nota.

## Conclusão

Este aplicativo foi projetado para apoiar a equipe comercial/operacional desde a criação do orçamento até a resolução de divergências com transportadoras, mantendo rastreabilidade dos envios de proposta e das notas de transporte associadas.
