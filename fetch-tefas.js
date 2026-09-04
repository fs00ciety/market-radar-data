const fs = require("fs");

const FUND_CODES = ["TP2", "TLY", "THF", "DFI", "PBR"];
const TEFAS_URL = "https://www.tefas.gov.tr/api/DB/BindHistoryInfo";

function formatDate(date) {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

async function getFundData(code) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 14);

  const body = new URLSearchParams({
    fontip: "YAT",
    bastarih: formatDate(startDate),
    bittarih: formatDate(endDate),
    fonkod: code
  });

  const response = await fetch(TEFAS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0"
    },
    body: body.toString()
  });

  if (!response.ok) {
    throw new Error(`${code}: TEFAS HTTP ${response.status}`);
  }

  const result = await response.json();
  const records = result.data || [];

  if (!records.length) {
    throw new Error(`${code}: TEFAS veri döndürmedi`);
  }

  const latest = records.sort((a, b) =>
    String(b.TARIH).localeCompare(String(a.TARIH))
  )[0];

  return {
    code: latest.FONKODU || code,
    name: latest.FONUNVAN || null,
    date: latest.TARIH || null,
    price: Number(latest.FIYAT) || null,
    portfolioValue: Number(latest.PORTFOYBUYUKLUK) || null,
    shares: Number(latest.TEDPAYSAYISI) || null,
    investors: Number(latest.KISISAYISI) || null
  };
}

async function main() {
  const funds = {};

  for (const code of FUND_CODES) {
    console.log(`${code} verisi çekiliyor...`);
    funds[code] = await getFundData(code);
  }

  const output = {
    updatedAt: new Date().toISOString(),
    timezone: "Europe/Istanbul",
    source: "TEFAS",
    dataNote: "Son açıklanan TEFAS fon fiyatlarıdır; anlık fiyat değildir.",
    funds
  };

  fs.writeFileSync("funds.json", JSON.stringify(output, null, 2), "utf8");
  console.log("funds.json başarıyla oluşturuldu.");
}

main().catch((error) => {
  console.error("Veri çekme hatası:", error.message);
  process.exit(1);
});
