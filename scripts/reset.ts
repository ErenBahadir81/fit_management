import { resetSeed } from "../src/lib/seed";

// Kullanım: npm run reset [gün 1-7]   ör: npm run reset 4
const arg = Number(process.argv[2]);
const startDay = Number.isInteger(arg) && arg >= 1 && arg <= 7 ? arg : 1;

resetSeed(startDay - 1)
  .then((r) => {
    console.log(
      `✅ Veritabanı sıfırlandı. Program ${r.startDay}. günden (${r.dayTitle}) başlıyor.\n   Giriş: eren / Asd*123`
    );
    process.exit(0);
  })
  .catch((e) => {
    console.error("❌ Reset başarısız:", e);
    process.exit(1);
  });
