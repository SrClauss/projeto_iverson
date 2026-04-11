use quick_xml::events::Event;
use quick_xml::reader::Reader;
use serde::{Deserialize, Serialize};

/// Informações extraídas de um XML CT-e (Conhecimento de Transporte Eletrônico)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CteInfo {
    /// Valor total da prestação em centavos (ex: 15772 = R$ 157,72)
    pub valor_frete_centavos: i32,
    /// Valor total da prestação como float (ex: 157.72)
    pub valor_frete_original: f64,
    /// CNPJ do emitente (transportadora)
    pub cnpj_emitente: String,
    /// Nome do emitente
    pub nome_emitente: String,
    /// CNPJ do remetente
    pub cnpj_remetente: String,
    /// Nome do remetente
    pub nome_remetente: String,
    /// Descrição do produto predominante da carga
    pub descricao_carga: String,
    /// Data de emissão do CT-e
    pub data_emissao: String,
    /// Chave do CT-e (44 dígitos, sem prefixo "CTe")
    pub chave_cte: String,
    /// Chave da NF-e referenciada (44 dígitos)
    pub chave_nfe: String,
    /// Cidade de origem
    pub cidade_origem: String,
    /// Cidade de destino
    pub cidade_destino: String,
    /// CEP de destino
    pub cep_destino: String,
    /// UF de destino
    pub uf_destino: String,
    /// Logradouro (rua) de destino
    pub xlgr_destino: String,
    /// Número do endereço de destino
    pub nro_destino: String,
    /// Peso real (kg)
    pub peso_real: f64,
    /// Peso base de cálculo (kg), quando declarado no XML
    pub peso_base_calculo: Option<f64>,
    /// Volume total (m³)
    pub volume_m3: f64,
    /// Quantidade de volumes (unidades)
    pub qtd_volumes: u32,
    /// Valor da mercadoria
    pub valor_carga: f64,
}

/// Converte string de valor monetário para centavos: "157.72" → 15772
fn parse_valor_centavos(valor_str: &str) -> Option<i32> {
    let valor: f64 = valor_str.trim().replace(',', ".").parse().ok()?;
    Some((valor * 100.0).round() as i32)
}

/// Parse procedural de XML CT-e. Extrai campos dentro de namespaces
/// http://www.portalfiscal.inf.br/cte
pub fn parse_cte_xml(xml_bytes: &[u8]) -> Result<CteInfo, String> {
    let xml_str = String::from_utf8_lossy(xml_bytes);
    let mut reader = Reader::from_str(&xml_str);
    reader.config_mut().trim_text(true);

    let mut valor_frete: Option<String> = None;
    let mut cnpj_emitente: Option<String> = None;
    let mut nome_emitente: Option<String> = None;
    let mut cnpj_remetente: Option<String> = None;
    let mut nome_remetente: Option<String> = None;
    let mut descricao_carga: Option<String> = None;
    let mut data_emissao: Option<String> = None;
    let mut chave_cte: Option<String> = None;
    let mut chave_nfe: Option<String> = None;
    let mut cidade_origem: Option<String> = None;
    let mut cidade_destino: Option<String> = None;
    let mut cep_destino: Option<String> = None;
    let mut uf_destino: Option<String> = None;
    let mut xlgr_destino: Option<String> = None;
    let mut nro_destino: Option<String> = None;
    let mut peso_real: Option<f64> = None;
    let mut peso_base_calculo: Option<f64> = None;
    let mut volume_m3: Option<f64> = None;
    let mut qtd_volumes: Option<u32> = None;
    let mut valor_carga: Option<f64> = None;

    // Stack para rastrear o caminho XML atual (sem namespace)
    let mut path_stack: Vec<String> = Vec::new();
    // Flags para contexto de seção
    let mut in_emit = false;
    let mut in_rem = false;
    let mut in_dest = false;
    let mut in_infq = false;
    let mut infq_tp_med: Option<String> = None;

    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                let local_name = strip_namespace(e.name().as_ref());
                let local_str = local_name.to_string();

                // Capturar chave do CT-e do atributo Id de infCte
                if local_str == "infCte" {
                    for attr in e.attributes().flatten() {
                        if strip_namespace(attr.key.as_ref()) == "Id" {
                            let val = String::from_utf8_lossy(&attr.value).to_string();
                            chave_cte = Some(val.strip_prefix("CTe").unwrap_or(&val).to_string());
                        }
                    }
                }

                match local_str.as_str() {
                    "emit" => in_emit = true,
                    "rem" => in_rem = true,
                    "dest" => in_dest = true,
                    "infQ" => {
                        in_infq = true;
                        infq_tp_med = None;
                    }
                    _ => {}
                }

                path_stack.push(local_str);
            }
            Ok(Event::End(ref e)) => {
                let local_name = strip_namespace(e.name().as_ref());
                match local_name.as_str() {
                    "emit" => in_emit = false,
                    "rem" => in_rem = false,
                    "dest" => in_dest = false,
                    "infQ" => {
                        in_infq = false;
                        infq_tp_med = None;
                    }
                    _ => {}
                }
                path_stack.pop();
            }
            Ok(Event::Text(ref e)) => {
                let text = e.unescape().unwrap_or_default().to_string();
                let current_tag = path_stack.last().map(|s| s.as_str()).unwrap_or("");

                match current_tag {
                    "vTPrest" => {
                        if valor_frete.is_none() {
                            valor_frete = Some(text.clone());
                        }
                    }
                    "vRec" => {
                        if valor_frete.is_none() {
                            valor_frete = Some(text.clone());
                        }
                    }
                    "vCarga" => {
                        if valor_carga.is_none() {
                            valor_carga = text.trim().replace(',', ".").parse().ok();
                        }
                    }
                    "CNPJ" => {
                        if in_emit && cnpj_emitente.is_none() {
                            cnpj_emitente = Some(text.clone());
                        } else if in_rem && cnpj_remetente.is_none() {
                            cnpj_remetente = Some(text.clone());
                        }
                    }
                    "xNome" => {
                        if in_emit && nome_emitente.is_none() {
                            nome_emitente = Some(text.clone());
                        } else if in_rem && nome_remetente.is_none() {
                            nome_remetente = Some(text.clone());
                        }
                    }
                    "proPred" => {
                        if descricao_carga.is_none() {
                            descricao_carga = Some(text.clone());
                        }
                    }
                    "dhEmi" => {
                        if data_emissao.is_none() {
                            data_emissao = Some(text.clone());
                        }
                    }
                    "xMunIni" => {
                        if cidade_origem.is_none() {
                            cidade_origem = Some(text.clone());
                        }
                    }
                    "xMunFim" => {
                        if cidade_destino.is_none() {
                            cidade_destino = Some(text.clone());
                        }
                    }
                    "CEP" => {
                        if in_dest && cep_destino.is_none() {
                            cep_destino = Some(text.clone());
                        }
                    }
                    "UF" => {
                        if in_dest && uf_destino.is_none() {
                            uf_destino = Some(text.clone());
                        }
                    }
                    "xLgr" => {
                        if in_dest && xlgr_destino.is_none() {
                            xlgr_destino = Some(text.clone());
                        }
                    }
                    "nro" => {
                        if in_dest && nro_destino.is_none() {
                            nro_destino = Some(text.clone());
                        }
                    }
                    "tpMed" => {
                        if in_infq {
                            infq_tp_med = Some(text.to_uppercase());
                        }
                    }
                    "qCarga" => {
                        if in_infq {
                            let q: f64 = text.trim().replace(',', ".").parse().unwrap_or(0.0);
                            match infq_tp_med.as_deref() {
                                Some("PESO REAL") => {
                                    if peso_real.is_none() { peso_real = Some(q); }
                                }
                                Some("PESO BASE DE CALCULO") => {
                                    if peso_base_calculo.is_none() { peso_base_calculo = Some(q); }
                                }
                                Some("M3") => {
                                    if volume_m3.is_none() { volume_m3 = Some(q); }
                                }
                                Some("UNIDADE") => {
                                    if qtd_volumes.is_none() { qtd_volumes = Some(q as u32); }
                                }
                                _ => {}
                            }
                        }
                    }
                    "chave" => {
                        // Chave da NF-e referenciada (dentro de infNFe)
                        if chave_nfe.is_none() {
                            chave_nfe = Some(text.clone());
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("Erro ao parsear XML CT-e: {}", e)),
            _ => {}
        }
        buf.clear();
    }

    let valor_str = valor_frete.ok_or("Campo vTPrest/vRec não encontrado no XML CT-e")?;
    let valor_f64: f64 = valor_str
        .trim()
        .replace(',', ".")
        .parse()
        .map_err(|_| format!("Valor do frete inválido: {}", valor_str))?;
    let valor_centavos = parse_valor_centavos(&valor_str)
        .ok_or_else(|| format!("Não foi possível converter valor: {}", valor_str))?;

    let resolved_peso_real = peso_real.or(peso_base_calculo).unwrap_or(0.0);

    Ok(CteInfo {
        valor_frete_centavos: valor_centavos,
        valor_frete_original: valor_f64,
        cnpj_emitente: cnpj_emitente.unwrap_or_default(),
        nome_emitente: nome_emitente.unwrap_or_default(),
        cnpj_remetente: cnpj_remetente.unwrap_or_default(),
        nome_remetente: nome_remetente.unwrap_or_default(),
        descricao_carga: descricao_carga.unwrap_or_default(),
        data_emissao: data_emissao.unwrap_or_default(),
        chave_cte: chave_cte.unwrap_or_default(),
        chave_nfe: chave_nfe.unwrap_or_default(),
        cidade_origem: cidade_origem.unwrap_or_default(),
        cidade_destino: cidade_destino.unwrap_or_default(),
        cep_destino: cep_destino.unwrap_or_default(),
        uf_destino: uf_destino.unwrap_or_default(),
        xlgr_destino: xlgr_destino.unwrap_or_default(),
        nro_destino: nro_destino.unwrap_or_default(),
        peso_real: resolved_peso_real,
        peso_base_calculo,
        volume_m3: volume_m3.unwrap_or(0.0),
        qtd_volumes: qtd_volumes.unwrap_or(0),
        valor_carga: valor_carga.unwrap_or(0.0),
    })
}

/// Remove prefixo de namespace de um nome de tag XML.
/// Ex: b"{http://www.portalfiscal.inf.br/cte}vTPrest" → "vTPrest"
fn strip_namespace(name: &[u8]) -> String {
    let s = String::from_utf8_lossy(name);
    if let Some(pos) = s.rfind('}') {
        s[pos + 1..].to_string()
    } else if let Some(pos) = s.rfind(':') {
        // Para prefixos como "cte:vTPrest"
        s[pos + 1..].to_string()
    } else {
        s.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valor_centavos() {
        assert_eq!(parse_valor_centavos("157.72"), Some(15772));
        assert_eq!(parse_valor_centavos("0.50"), Some(50));
        assert_eq!(parse_valor_centavos("1000.00"), Some(100000));
        assert_eq!(parse_valor_centavos("157,72"), Some(15772));
    }

    #[test]
    fn test_parse_cte_xml_peso_base_calculo_fallback() {
        let xml = r#"<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<cteProc xmlns=\"http://www.portalfiscal.inf.br/cte\" versao=\"4.00\"> 
  <CTe>
    <infCte Id=\"CTe123\" versao=\"4.00\"> 
      <ide><cUF>41</cUF></ide>
      <emit><CNPJ>00000000000000</CNPJ><xNome>Emitente</xNome></emit>
      <rem><CNPJ>11111111111111</CNPJ><xNome>Remetente</xNome></rem>
      <infCTeNorm>
        <infCarga>
          <vCarga>100.00</vCarga>
          <proPred>Produto</proPred>
          <infQ>
            <tpMed>PESO BASE DE CALCULO</tpMed>
            <qCarga>12.34</qCarga>
          </infQ>
        </infCarga>
        <infDoc><infNFe><chave>12345678901234567890123456789012345678901234</chave></infNFe></infDoc>
      </infCTeNorm>
      <vPrest><vTPrest>200.00</vTPrest><vRec>200.00</vRec></vPrest>
      <infRespTec><CNPJ>00000000000000</CNPJ><xContato>Contato</xContato><email>e@e.com</email><fone>000</fone></infRespTec>
    </infCte>
  </CTe>
</cteProc>"#;

        let info = parse_cte_xml(xml.as_bytes()).unwrap();
        assert_eq!(info.peso_real, 12.34);
        assert_eq!(info.peso_base_calculo, Some(12.34));
    }
}

