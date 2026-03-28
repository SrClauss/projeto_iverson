use serde::Deserialize;

// ── Structs ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GeminiPart {
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GeminiContent {
    parts: Option<Vec<GeminiPart>>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: Option<GeminiContent>,
}

#[derive(Debug, Deserialize)]
struct GeminiGenerateContentResponse {
    candidates: Option<Vec<GeminiCandidate>>,
}

// ── Funções auxiliares ───────────────────────────────────────

fn get_non_empty_env(var_name: &str) -> Option<String> {
    std::env::var(var_name)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

pub fn resolve_gemini_api_key() -> Option<String> {
    get_non_empty_env("GEMINI_API_KEY")
        .or_else(|| get_non_empty_env("GEMINI_API_LEY"))
        .or_else(|| get_non_empty_env("gemini_api_key"))
        .or_else(|| get_non_empty_env("gemini_api_ley"))
}

// ── Cliente Gemini ───────────────────────────────────────────

/// Envia um prompt ao Gemini 2.5 Flash e retorna o texto da resposta
pub async fn call_gemini(prompt: &str) -> Result<String, String> {
    let api_key = resolve_gemini_api_key()
        .ok_or_else(|| "GEMINI_API_KEY não definida no .env".to_string())?;

    let http = reqwest::Client::new();
    let response = http
        .post("https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent")
        .query(&[("key", api_key.as_str())])
        .json(&serde_json::json!({
            "contents": [{
                "parts": [{ "text": prompt }]
            }]
        }))
        .send()
        .await
        .map_err(|e| format!("Erro ao chamar Gemini API: {}", e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Erro ao ler resposta Gemini: {}", e))?;

    if !status.is_success() {
        return Err(format!("Gemini API retornou {}: {}", status, body));
    }

    let parsed: GeminiGenerateContentResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Resposta inválida Gemini: {}", e))?;

    parsed
        .candidates
        .as_ref()
        .and_then(|c| c.first())
        .and_then(|c| c.content.as_ref())
        .and_then(|c| c.parts.as_ref())
        .and_then(|parts| {
            parts
                .iter()
                .filter_map(|p| p.text.as_ref())
                .find(|t| !t.trim().is_empty())
        })
        .map(|t| t.to_string())
        .ok_or_else(|| "Gemini não retornou texto".to_string())
}

/// Extrai valor de frete em centavos e prazo de entrega de um email de cotação usando Gemini.
/// Retorna (valor_centavos, prazo_extraido)
pub async fn extrair_valor_cotacao(assunto: &str, corpo: &str) -> Result<(Option<i32>, Option<String>), String> {
    let prompt = format!(
        r#"Você é um assistente especializado em logística de transporte de cargas.
Analise este email de uma transportadora que está enviando uma cotação/proposta de frete.

Extraia duas informações:
1. O VALOR DO FRETE proposto (em centavos de Real). Ex: R$ 1.250,00 = 125000, R$ 157,72 = 15772
2. O PRAZO DE ENTREGA mencionado (ex: "3 dias úteis", "5 a 7 dias", "48 horas")

Responda EXATAMENTE neste formato (uma linha por campo):
VALOR: <numero_em_centavos>
PRAZO: <prazo_texto>

Se não encontrar o valor, responda VALOR: 0
Se não encontrar o prazo, responda PRAZO: A confirmar

ASSUNTO: {}
CORPO:
{}"#,
        assunto, corpo
    );

    let resposta = call_gemini(&prompt).await?;
    let resposta = resposta.trim();

    let mut valor: Option<i32> = None;
    let mut prazo: Option<String> = None;

    for line in resposta.lines() {
        let line = line.trim();
        if let Some(v) = line.strip_prefix("VALOR:") {
            let limpo: String = v.trim().chars().filter(|c| c.is_ascii_digit()).collect();
            if let Ok(n) = limpo.parse::<i32>() {
                if n > 0 {
                    valor = Some(n);
                }
            }
        } else if let Some(p) = line.strip_prefix("PRAZO:") {
            let p = p.trim().to_string();
            if !p.is_empty() {
                prazo = Some(p);
            }
        }
    }

    Ok((valor, prazo))
}

/// Tenta extrair valor de frete de conteúdo de PDF/texto não-estruturado
pub async fn extrair_valor_nota_texto(conteudo: &str) -> Result<Option<i32>, String> {
    let prompt = format!(
        r#"Analise este documento de transporte (CT-e/DACTE) e extraia o valor total do frete.
Responda SOMENTE com o valor em centavos (inteiro). Ex: R$ 157,72 → 15772.
Se não encontrar, responda "NAO_ENCONTRADO".

CONTEÚDO:
{}"#,
        conteudo
    );

    let resposta = call_gemini(&prompt).await?;
    let resposta = resposta.trim();

    if resposta == "NAO_ENCONTRADO" || resposta.is_empty() {
        return Ok(None);
    }

    let limpo: String = resposta.chars().filter(|c| c.is_ascii_digit()).collect();
    if limpo.is_empty() {
        return Ok(None);
    }

    limpo
        .parse::<i32>()
        .map(Some)
        .map_err(|_| format!("Gemini retornou valor não numérico: {}", resposta))
}

/// Identifica a qual orçamento um email se refere. SEMPRE escolhe o melhor match.
pub async fn identificar_orcamento(
    assunto: &str,
    corpo: &str,
    descricoes_disponiveis: &[String],
) -> Result<Option<String>, String> {
    if descricoes_disponiveis.is_empty() {
        return Ok(None);
    }

    // Se só tem 1 orçamento ativo, nem precisa perguntar à IA
    if descricoes_disponiveis.len() == 1 {
        return Ok(Some(descricoes_disponiveis[0].clone()));
    }

    let lista = descricoes_disponiveis
        .iter()
        .enumerate()
        .map(|(i, d)| format!("{}. {}", i + 1, d))
        .collect::<Vec<_>>()
        .join("\n");

    let prompt = format!(
        r#"Você é um sistema automatizado de logística. Uma transportadora enviou um email com uma cotação de frete.
Sua tarefa é decidir QUAL orçamento da lista abaixo esta cotação se refere.

Você DEVE escolher a melhor opção. Analise o conteúdo do email (menção a cidades, produtos, pesos, destinos) e compare com as descrições dos orçamentos.

Responda SOMENTE com o número da opção escolhida (ex: "1" ou "3"). Nunca responda com texto adicional.
Se houver dúvida entre opções, escolha a mais provável. Você PRECISA escolher uma.

LISTA DE ORÇAMENTOS ATIVOS:
{}

ASSUNTO DO EMAIL: {}
CORPO DO EMAIL:
{}"#,
        lista, assunto, corpo
    );

    let resposta = call_gemini(&prompt).await?;
    let resposta = resposta.trim();

    let index: usize = resposta
        .chars()
        .filter(|c| c.is_ascii_digit())
        .collect::<String>()
        .parse()
        .unwrap_or(1); // Default para 1 se não conseguir parsear

    if index >= 1 && index <= descricoes_disponiveis.len() {
        Ok(Some(descricoes_disponiveis[index - 1].clone()))
    } else {
        // Fallback: escolhe o primeiro
        Ok(Some(descricoes_disponiveis[0].clone()))
    }
}
