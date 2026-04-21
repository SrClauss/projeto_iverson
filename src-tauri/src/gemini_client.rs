use serde::Deserialize;
use std::collections::HashMap;

// ── Audit info ────────────────────────────────────────────────

/// Carries the raw prompt sent to Gemini and the raw text received back so
/// that callers can persist them to the audit log.
#[derive(Debug, Clone)]
pub struct GeminiAuditInfo {
    pub prompt: String,
    pub response: String,
}

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
        // Fallback: valor embutido em tempo de compilação pela CI
        .or_else(|| option_env!("GEMINI_API_KEY").map(|s| s.to_string()))
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

/// Analisa um XML CT-e e retorna os valores dos campos que o parser não conseguiu extrair.
pub async fn inferir_campos_cte(
    xml: &str,
    campos_faltantes: &[&str],
) -> Result<(HashMap<String, String>, GeminiAuditInfo), String> {
    let campos_texto = campos_faltantes.join(", ");
    let prompt = format!(
        r#"Você é um assistente especializado em CT-e.
Eu tenho um XML de CT-e e preciso que você identifique os valores dos campos listados abaixo.
Responda APENAS com um objeto JSON válido, onde cada chave é o nome do campo e o valor é o valor extraído.
Se não encontrar algum campo, retorne string vazia para ele.

Campos faltantes:
{}

XML:
{}"#,
        campos_texto, xml
    );

    let resposta_raw = call_gemini(&prompt).await?;
    let audit = GeminiAuditInfo {
        prompt: prompt.clone(),
        response: resposta_raw.clone(),
    };
    let mut resposta = resposta_raw.trim();
    if resposta.starts_with("```json") {
        resposta = resposta.trim_start_matches("```json").trim();
    }
    if resposta.starts_with("```") {
        resposta = resposta.trim_start_matches("```").trim();
    }
    if resposta.ends_with("```") {
        resposta = resposta.trim_end_matches("```").trim();
    }

    let parsed: serde_json::Value = serde_json::from_str(resposta)
        .map_err(|e| format!("Gemini retornou JSON inválido: {} | resposta: {}", e, resposta))?;

    let obj = parsed.as_object().ok_or_else(|| {
        format!("Gemini retornou JSON não-objeto: {}", resposta)
    })?;

    let mut result = HashMap::new();
    for &campo in campos_faltantes {
        let valor = obj.get(campo)
            .map(|v| {
                if let Some(s) = v.as_str() {
                    s.to_string()
                } else {
                    v.to_string()
                }
            })
            .unwrap_or_default();
        result.insert(campo.to_string(), valor);
    }

    Ok((result, audit))
}

/// Extrai valor de frete em centavos e prazo de entrega de um email de cotação usando Gemini.
/// Retorna (valor_centavos, prazo_extraido, audit_info)
pub async fn extrair_valor_cotacao(assunto: &str, corpo: &str) -> Result<(Option<i32>, Option<String>, GeminiAuditInfo), String> {
    let prompt = format!(
        r#"Você é um assistente especializado em logística de transporte de cargas.
Analise este email de uma transportadora que está enviando uma cotação/proposta de frete.

Extraia duas informações:
1. O VALOR DO FRETE proposto (em centavos de Real). Ex: R$ 1.250,00 = 125000, R$ 157,72 = 15772
2. O PRAZO DE ENTREGA mencionado. Converta sempre para DIAS CORRIDOS e responda em dias.
   - Ex: "3 dias úteis" → 3 dias
   - Ex: "5 a 7 dias" → 7 dias
   - Ex: "48 horas" → 2 dias
   - Ex: "1 mês" → 30 dias
   - Ex: "2 semanas" → 14 dias

Responda EXATAMENTE neste formato (uma linha por campo):
VALOR: <numero_em_centavos>
PRAZO: <numero_de_dias> dias

Se não encontrar o valor, responda VALOR: 0
Se não encontrar o prazo, responda PRAZO: A confirmar

ASSUNTO: {}
CORPO:
{}"#,
        assunto, corpo
    );

    let resposta_raw = call_gemini(&prompt).await?;
    let audit = GeminiAuditInfo {
        prompt: prompt.clone(),
        response: resposta_raw.clone(),
    };
    let resposta = resposta_raw.trim();

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
            let mut p = p.trim().to_string();
            if !p.is_empty() {
                let numeric_only: String = p.chars().filter(|c| c.is_ascii_digit()).collect();
                if !numeric_only.is_empty() && p.chars().all(|c| c.is_ascii_digit() || c.is_whitespace()) {
                    p = format!("{} dias", numeric_only);
                }
                prazo = Some(p);
            }
        }
    }

    Ok((valor, prazo, audit))
}

/// Tenta extrair valor de frete de conteúdo de PDF/texto não-estruturado
pub async fn extrair_valor_nota_texto(conteudo: &str) -> Result<(Option<i32>, GeminiAuditInfo), String> {
    let prompt = format!(
        r#"Analise este documento de transporte (CT-e/DACTE) e extraia o valor total do frete.
Responda SOMENTE com o valor em centavos (inteiro). Ex: R$ 157,72 → 15772.
Se não encontrar, responda "NAO_ENCONTRADO".

CONTEÚDO:
{}"#,
        conteudo
    );

    let resposta_raw = call_gemini(&prompt).await?;
    let audit = GeminiAuditInfo {
        prompt: prompt.clone(),
        response: resposta_raw.clone(),
    };
    let resposta = resposta_raw.trim();

    if resposta == "NAO_ENCONTRADO" || resposta.is_empty() {
        return Ok((None, audit));
    }

    let limpo: String = resposta.chars().filter(|c| c.is_ascii_digit()).collect();
    if limpo.is_empty() {
        return Ok((None, audit));
    }

    let result = limpo
        .parse::<i32>()
        .map(Some)
        .map_err(|_| format!("Gemini retornou valor não numérico: {}", resposta))?;

    Ok((result, audit))
}

/// Identifica a qual orçamento um email se refere. SEMPRE escolhe o melhor match.
/// Retorna (descrição_escolhida, audit_info).
pub async fn identificar_orcamento(
    assunto: &str,
    corpo: &str,
    descricoes_disponiveis: &[String],
) -> Result<(Option<String>, GeminiAuditInfo), String> {
    if descricoes_disponiveis.is_empty() {
        return Ok((None, GeminiAuditInfo {
            prompt: "(nenhum orçamento ativo disponível)".to_string(),
            response: String::new(),
        }));
    }

    // Se só tem 1 orçamento ativo, nem precisa perguntar à IA
    if descricoes_disponiveis.len() == 1 {
        return Ok((Some(descricoes_disponiveis[0].clone()), GeminiAuditInfo {
            prompt: "(identificação direta — apenas 1 orçamento ativo)".to_string(),
            response: descricoes_disponiveis[0].clone(),
        }));
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

O primeiro critério a ser analisado é o número da cotação do orçamento. Após isso, compare o conteúdo do email com os demais parâmetros: CNPJ pagador, CNPJ/CPF destino, CEP de destino, endereço de destino, nota, valor do produto, quantidade de volumes, dimensões de volumes ou produto, peso e peso total. NÃO use apenas a descrição.

Responda SOMENTE com o número da opção escolhida (ex: "1" ou "3"). Nunca responda com texto adicional.
Se houver dúvida entre opções, escolha a mais provável. Você PRECISA escolher uma.

LISTA DE ORÇAMENTOS ATIVOS:
{}

ASSUNTO DO EMAIL: {}
CORPO DO EMAIL:
{}"#,
        lista, assunto, corpo
    );

    let resposta_raw = call_gemini(&prompt).await?;
    let audit = GeminiAuditInfo {
        prompt: prompt.clone(),
        response: resposta_raw.clone(),
    };
    let resposta = resposta_raw.trim();

    let index: usize = resposta
        .chars()
        .filter(|c| c.is_ascii_digit())
        .collect::<String>()
        .parse()
        .unwrap_or(1); // Default para 1 se não conseguir parsear

    if index >= 1 && index <= descricoes_disponiveis.len() {
        Ok((Some(descricoes_disponiveis[index - 1].clone()), audit))
    } else {
        // Fallback: escolhe o primeiro
        Ok((Some(descricoes_disponiveis[0].clone()), audit))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_inferir_campos_cte() {
        dotenv::from_filename(".env").ok();

        let xml = r#"<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<cteProc xmlns=\"http://www.portalfiscal.inf.br/cte\" versao=\"4.00\">
<CTe xmlns=\"http://www.portalfiscal.inf.br/cte\"><infCte Id=\"CTe41260333535024000285570010000000601000291273\" versao=\"4.00\">
<ide><cUF>41</cUF><cCT>00029127</cCT><CFOP>6353</CFOP><natOp>Transp a est comercial</natOp><mod>57</mod><serie>1</serie><nCT>60</nCT></ide>
<emit><CNPJ>33535024000285</CNPJ></emit>
<rem><CNPJ>51540489000125</CNPJ></rem>
<infCTeNorm><infCarga>
<infQ><tpMed>PESO REAL</tpMed><qCarga>60.0000</qCarga></infQ>
<infQ><tpMed>M3</tpMed><qCarga>0.3542</qCarga></infQ>
<infQ><tpMed>UNIDADE</tpMed><qCarga>1</qCarga></infQ>
<vCarga>598.32</vCarga>
</infCarga><infDoc><infNFe><chave>41260351540489000125550010000111971755985292</chave></infNFe></infDoc></infCTeNorm>
</infCte></CTe></cteProc>"#;

        let campos = ["peso_real", "volume_m3", "qtd_volumes"];
        let resultado = inferir_campos_cte(xml, &campos)
            .await
            .expect("Falha no fallback de IA");

        assert!(resultado.get("peso_real").map(|v| !v.is_empty()).unwrap_or(false));
        assert!(resultado.get("volume_m3").map(|v| !v.is_empty()).unwrap_or(false));
        assert!(resultado.get("qtd_volumes").map(|v| !v.is_empty()).unwrap_or(false));
    }
}
