const fs = require("fs");
const { execFileSync } = require("child_process");

const FUND_CODES = ["TP2", "TLY", "THF", "DFI", "PBR"];
const BASE_URL = "https://www.tefas.gov.tr";
const COOKIE_FILE = "/tmp/tefas-cookies.txt";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function curl(args) {
  return execFileSync("curl", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function warmUpSession() {
  console.log("TEFAS oturumu hazırlanıyor...");

  curl([
    "-sS",
    "-L",
    "-A", USER_AGENT,
    "-c", COOKIE_FILE,
    "-b", COOKIE_FILE,
    "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    `${BASE_URL}/tr/`
  ]);
}

function getFundData(code) {
  const payload = JSON.stringify({
    fonKodu: code,
    dil: "TR",
    periyod: 13
  });

  const response = curl([
    "-sS",
    "-L",
    "-A", USER_AGENT,
    "-c", COOKIE_FILE,
    "-b", COOKIE_FILE,
    "-H", "Accept: application/json, text/plain, */*",
    "-H", "Accept-Language: tr-TR,tr;q=0.9",
    "-H", "Content-Type: application/json",
    "-H", `Origin: ${BASE_URL}`,
    "-H", `Referer: ${BASE_URL}/tr/`,
    "-X", "POST",
    "--data", payload,
    `${BASE_URL}/api/funds/fonFiyatBilgiGetir`
  ]);

  let result;

  try {
    result = JSON.parse(response);
  } catch {
    throw new Error(`${code}: TEFAS JSON yerine geçersiz yanıt döndürdü`);
  }

  const records = result.resultList || [];

  if (!records.length) {
    throw new Error(`${code}: TEFAS veri döndürmedi`);
  }

  const sorted = records.sort((a, b) =>
    String(a.tarih).localeCompare(String(b.tarih))
  );

  const latest = sorted.at(-1);
  const previous = sorted.at(-2);
  const price = Number(latest.fiyat);

  return {
    code: latest.fonKodu || code,
    name: latest.fonUnvan || null,
    date: latest.tarih || null,
    price,
    previousPrice: previous ? Number(previous.fiyat) : null,
    dailyChange:
      previous && Number(previous.fiyat) > 0
        ? Number((((price / Number(previous.fiyat)) - 1) * 100).toFixed(4))
        : null
  };
}

function main() {
  warmUpSession();

  const funds = {};

  for (const code of FUND_CODES) {
    console.log(`${code} verisi çekiliyor...`);
    funds[code] = getFundData(code);
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

try {
  main();
} catch (error) {
  console.error("Veri çekme hatası:", error.message);
  process.exit(1);
}
