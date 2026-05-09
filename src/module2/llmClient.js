const { GoogleGenAI } = require('@google/genai');

let client = null;

function getClient(apiKey) {
  if (!apiKey) return null;
  if (!client || client._apiKey !== apiKey) {
    client = new GoogleGenAI({ apiKey });
    client._apiKey = apiKey;
  }
  return client;
}

async function callLlm(systemPrompt, userPrompt, apiKey) {
  const llm = getClient(apiKey);
  if (!llm) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await llm.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + "\n\n" + userPrompt }] }
        ],
        config: {
          temperature: 0,
          responseMimeType: 'application/json'
        }
      });
      const text = response.text;
      return JSON.parse(text);
    } catch (err) {
      if (attempt === 1) return null;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

async function chatWithReport(report, userMessage, apiKey) {
  const llm = getClient(apiKey);
  if (!llm) return null;

  const systemPrompt = `Tu es "Gemini Privacy Expert", un assistant IA spécialisé dans la cybersécurité et l'analyse de vie privée (Privacy) des applications Android.
Voici le rapport JSON complet d'une application que ton système vient d'analyser :
${JSON.stringify(report)}

Réponds aux questions de l'utilisateur concernant cette application de manière claire, concise et professionnelle en français. Ne propose pas de réponses en JSON, utilise du texte Markdown normal.`;

  try {
    const response = await llm.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: systemPrompt + "\n\nQuestion de l'utilisateur : " + userMessage }] }
      ],
      config: {
        temperature: 0.3
      }
    });
    return response.text;
  } catch (err) {
    console.error("Chat LLM Error:", err);
    return "Désolé, je n'ai pas pu analyser la question. Vérifiez votre clé API ou réessayez.";
  }
}

module.exports = { callLlm, chatWithReport };
