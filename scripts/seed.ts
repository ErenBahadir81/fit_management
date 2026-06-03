import { ensureSeeded } from "../src/lib/seed";

ensureSeeded()
  .then(() => {
    console.log("✅ Seed tamamlandı (kullanıcı: eren / Asd*123)");
    process.exit(0);
  })
  .catch((e) => {
    console.error("❌ Seed başarısız:", e);
    process.exit(1);
  });
