import OpenAI from "openai";

function cors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function safeNum(x, fallback = null) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Use POST" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ ok: false, error: "OPENAI_API_KEY não configurada na Vercel" });
  }

  try {
    const {
      unidade,
      sigla,
      densidade,
      paramsUnidade,      // {nominal, minMoagem, riscoT, paradaConj, ...}
      estoqueAtualConj,
      realizado,          // [{hora, estoqueConj, agricolaTph, industriaTph}, ...]
      futuro,             // [{hora, agricolaTph, industriaTph}, ...]
      motivo              // texto do operador
    } = req.body ?? {};

    // ========= “ATLAS” SYSTEM PROMPT (AQUI É ONDE A GENTE REPLICA O GPT) =========
    const system = `
Você é o ATLAS AGRO (motor de análise COA). Sua missão:
1) Melhorar e padronizar o MOTIVO sem duplicar palavras (ex: "colhedoras próprias" repetido) e sem inventar fatos.
2) Analisar a projeção e recomendar conduta de moagem com antecipação:
   - Se risco futuro: reduzir ANTES de entrar no risco (preventivo), em degraus.
   - Se melhora futura: aumentar ANTES para aproveitar oportunidade, em degraus.
3) Se detectar janela de melhora, sugerir "reduzir até hora X e depois aumentar a partir de hora Y".
4) Sempre respeitar: degraus 50 t/h (100 t/h só se crítico), e piso da unidade (minMoagem).
5) Gerar um TEXTO FINAL no padrão COA: objetivo, técnico, com causa→efeito→risco.
6) Gerar também uma lista curta de ações operacionais (o que fazer agora) baseada no motivo (manutenção, logística, chuva, interdição, troca de frente etc).
Responda SOMENTE em JSON no formato combinado.
`;

    // ========= INPUT COM DADOS =========
    const input = {
      unidade,
      sigla,
      densidade: safeNum(densidade),
      paramsUnidade,
      estoqueAtualConj: safeNum(estoqueAtualConj),
      realizado,
      futuro,
      motivo: (motivo ?? "").toString()
    };

    // ========= CHAMADA À OPENAI =========
    // Use um modelo disponível pra você. (Se preferir, eu troco depois.)
    const response = await openai.responses.create({
      model: "gpt-5.2",
      input: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Analise este cenário e devolva JSON conforme o schema:\n\n` +
                   `SCHEMA:\n` +
                   `{\n` +
                   `  "motivo_melhorado": "string",\n` +
                   `  "status": "OK|ALERTA|CRITICO",\n` +
                   `  "hora_critica": "HH:00",\n` +
                   `  "conduta_chip": "Manter|Reduzir|Aumentar|Reduzir e depois Aumentar",\n` +
                   `  "plano_moagem": [ {"hora":"HH:00","moagem_sugerida_tph": number, "justificativa": "string"} ],\n` +
                   `  "acoes_imediatas": [ "string", "string", "string" ],\n` +
                   `  "informativo_final": "string"\n` +
                   `}\n\n` +
                   `DADOS:\n${JSON.stringify(input)}`
        }
      ]
    });

    // Extrair texto final
    const outText = response.output_text || "";

    // Tentar parsear JSON
    let parsed;
    try {
      parsed = JSON.parse(outText);
    } catch {
      // fallback: se vier texto “quebrado”, devolve como informativo
      parsed = {
        motivo_melhorado: motivo ?? "",
        status: "ALERTA",
        hora_critica: "—",
        conduta_chip: "Manter",
        plano_moagem: [],
        acoes_imediatas: ["Resposta da IA não veio em JSON. Ajuste prompt/schema."],
        informativo_final: outText
      };
    }

    return res.status(200).json({ ok: true, ...parsed });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Falha ao chamar IA", detail: String(e) });
  }
}
