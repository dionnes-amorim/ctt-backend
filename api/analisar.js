function cors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight (o browser faz isso antes do POST às vezes)
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Use POST" });
  }

  try {
    const {
      unidade,
      densidade,
      estoqueAtualConj,
      realizado,
      futuro,
      motivo
    } = req.body ?? {};

    // Resposta mock (só pra provar que tá funcionando)
    const informativo =
`Informativo ${unidade ?? "—"}

Recebido no backend:
- densidade: ${densidade ?? "—"}
- estoque: ${estoqueAtualConj ?? "—"} conj
- motivo: ${motivo ?? ""}

Realizado: ${Array.isArray(realizado) ? realizado.length : 0} linhas
Futuro: ${Array.isArray(futuro) ? futuro.length : 0} linhas

✅ API no ar. Próximo passo: plugar IA real aqui.`;

    return res.status(200).json({
      ok: true,
      informativo,
      sugestoes: [
        "Se a projeção entrar em risco, reduzir preventivo antes de encostar no crítico.",
        "Se o cenário virar positivo, rampear em degraus para aproveitar a oportunidade."
      ]
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Falha", detail: String(e) });
  }
}
