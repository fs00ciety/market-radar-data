// TEFAS'tan güncel fon fiyatlarını çeker ve funds.json dosyasını üretir.
// GitHub Actions runner'ından çalıştığı için tarayıcı CORS kısıtlaması yoktur.

const https = require("https");
const fs = require("fs");

const FUND_CODES = ["TP2", "TLY", "THF", "DFI", "PBR"];

function fmt(d) {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function parseDate(str) {
  const [d, m, y] = str.split(".");
  return new Date(`${y}-${m}-${d}`);
}

function postRequest(url, bodyObj) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(bodyObj).toString();
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(data),
          "User-Agent": "Mozilla/5.0 (compatible; MarketRadarPro/1.0)",
        },
      },
      (res) => {
        let chunks = "";
        res.on("data", (c) => (chunks += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(chunks));
          } catch (e) {
            reject(new Error(`JSON ayrıştırma hatası: ${e.message}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function fetchFund(code) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 10);

  const json = await postRequest("https://www.tefas.gov.tr/api/DB/BindHistoryInfo", {
    fontip: "YAT",
    fonkod: code,
    bastarih: fmt(start),
    bittarih: fmt(today),
  });

  if (!json || !Array.isArray(json.data) || json.data.length === 0) {
    return null;
  }

  const sorted = [...json.data].sort((a, b) => parseDate(a.TARIH) - parseDate(b.TARIH));
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const dailyChange = previous && previous.FIYAT ? ((latest.FIYAT - previous.FIYAT) / previous.FIYAT) * 100 : null;

  return {
    date: latest.TARIH,
    price: latest.FIYAT,
    dailyChangePct: dailyChange != null ? Number(dailyChange.toFixed(4)) : null,
  };
}

async function main() {
  const funds = {};

  for (const code of FUND_CODES) {
    try {
      const result = await fetchFund(code);
      if (result) {
        funds[code] = result;
        console.log(`${code}: ${result.price} TL (${result.date})`);
      } else {
        console.warn(`${code}: veri bulunamadı, önceki değer korunacak (varsa)`);
      }
    } catch (e) {
      console.error(`${code}: hata - ${e.message}`);
    }
  }

  // Önceki funds.json varsa ve bu çalıştırmada bir fon için veri gelmediyse, eski değeri koru
  // (böylece geçici bir TEFAS hatası tüm veriyi silmez).
  let previousData = {};
  try {
    previousData = JSON.parse(fs.readFileSync("funds.json", "utf8")).funds || {};
  } catch (e) {
    // İlk çalıştırma — önceki dosya yok, sorun değil.
  }

  const mergedFunds = { ...previousData, ...funds };

  const output = {
    updatedAt: new Date().toISOString(),
    source: "TEFAS",
    funds: mergedFunds,
  };

  fs.writeFileSync("funds.json", JSON.stringify(output, null, 2));
  console.log("\nfunds.json yazıldı.");
}

main().catch((e) => {
  console.error("Beklenmeyen hata:", e);
  process.exit(1);
});
