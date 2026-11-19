export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY belum dipasang di Environment Variables Vercel.' });
  }

  try {
    const { productImage, personImage, note = '', tone = 'racun' } = req.body || {};
    if (!productImage || typeof productImage !== 'string' || !productImage.includes(',')) {
      return res.status(400).json({ error: 'Foto produk wajib diupload.' });
    }

    const toneMap = {
      racun: 'Racun TikTok yang antusias, FOMO, santai bahasa sehari-hari',
      review: 'Review jujur natural seperti teman sendiri, meyakinkan',
      solusi: 'Masalah lalu solusi praktis, langsung ke manfaat produk',
      soft: 'Soft selling hangat, bercerita santai tanpa terkesan memaksa'
    };

    const promptInstruction = `Kamu adalah ahli konten TikTok Affiliate Indonesia. Analisa foto produk yang dikirim dengan teliti (baca merek, jenis produk, warna, bentuk kemasan, ukuran, dan manfaat utamanya).
Catatan tambahan dari user: "${note || 'tidak ada'}".
Gaya jualan: ${toneMap[tone] || toneMap.racun}.

Balas HANYA dengan JSON valid (tanpa markdown) dengan struktur persis berikut:
{
  "productName": "Nama produk jelas & singkat dalam Bahasa Indonesia",
  "productVisualEn": "Concise accurate English visual description of the exact product shape, color, material, and packaging visible in the photo (max 22 words)",
  "productBenefitsId": "2-3 keunggulan utama produk dalam Bahasa Indonesia singkat & natural",
  "scene1Dialog": "Dialog Bahasa Indonesia natural untuk Scene 1 (0-10 detik, 18-24 kata, hook menarik + kenalin produk, akhiri dengan kalimat pengantar ke Scene 2)",
  "scene2Dialog": "Dialog Bahasa Indonesia natural untuk Scene 2 (10-20 detik, 18-24 kata, lanjutan langsung dari Scene 1 + sebut keunggulan + ajak klik keranjang kuning kiri bawah)",
  "caption": "Caption TikTok jualan 2-3 baris dalam Bahasa Indonesia yang menarik",
  "hashtags": "6-8 hashtag relevan diawali #"
}`;

    const prodBase64 = productImage.split(',')[1];
    const prodMime = (productImage.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/) || [])[1] || 'image/jpeg';

    const parts = [
      { text: promptInstruction },
      { inlineData: { mimeType: prodMime, data: prodBase64 } }
    ];

    if (personImage && typeof personImage === 'string' && personImage.includes(',')) {
      const pBase64 = personImage.split(',')[1];
      const pMime = (personImage.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/) || [])[1] || 'image/jpeg';
      parts.push({ inlineData: { mimeType: pMime, data: pBase64 } });
    }

    const modelsToTry = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
    let lastError = 'Gagal menghubungi Gemini API.';

    for (const model of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.7 }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        lastError = `Model ${model}: ${response.status} ${errText.slice(0, 150)}`;
        continue;
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      parsed.modelUsed = model;
      return res.status(200).json(parsed);
    }

    return res.status(502).json({ error: lastError });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Terjadi kesalahan di server.' });
  }
}
