# FitFloow 🏋️

Mobil öncelikli (mobile-first), flat tasarımlı bir **antrenman + yenilenme + vücut + diyet** takip uygulaması. Tamamı **Next.js 14 (App Router)** içinde çalışır — ayrı bir backend yoktur, veritabanı işlemleri route handler'lar üzerinden **MongoDB**'ye yapılır.

> İlk kullanıcı: **eren** / **Asd\*123** (uygulama ilk açıldığında otomatik oluşturulur).

## ✨ Özellikler

### 1. Antrenman Programı (dinamik 7 günlük döngü)
- 7 günlük şablon + bir **işaretçi** (`currentIndex`) = sıradaki yapılacak gün.
- **Tamamla** → işaretçi ilerler. **Atla (off day)** → işaretçi ilerlemez, takvim kayar. Yani Pzt = A yapıldı, Salı atlandı ⇒ Çarşamba yine B olur.
- 7. günden sonra hafta numarası artar; şablon korunur (**önceki haftayı kopyalama**), böylece bir sonraki Pazartesi push-up yine aynı hedefle gelir.
- **Hypertrophy / strength**: set × tekrar + opsiyonel **RIR** ("kaç tekrar daha yapabilirdin?"). Aktif gün set bazında güncellenebilir — ör. 4×5 yapıp 5. seti 6 tekrar girebilirsin.
- **Koşu (run)**: tek seferde yapmak zorunda değilsin; birden çok segment girilir (3 km 20 dk + 2 km 8 dk). Sonraki haftanın hedefi **en iyi tempoya** göre otomatik güncellenir.

### 2. Kas Yenilenme Takibi (projenin kalbi)
Her hareket, ilgili kas gruplarını **set sayısıyla orantılı** yorar. Her an her kasın **yenilenme yüzdesi** görülür.

**Yenilenme eğrisi:** antrenmandan hemen sonra %0, yarı sürede %70, tam sürede %100.
- `small` (küçük) kas → tam yenilenme **48 saat** ⇒ 24s'te %70, 48s'te %100 *(kullanıcı spesifikasyonu)*
- `large` (büyük) kas → tam yenilenme **24 saat** ⇒ 12s'te %70, 24s'te %100

Birikimli yorgunluk: `hazırlık% = 100 · (1 − Σ set·(1−yenilenme) / referansYük)`, kırmızı/sarı/yeşil renk kodlu.

Örnek programın haftalık set toplamları matrisle birebir uyumludur: Göğüs 17, Ön Omuz 9, Yan Omuz 6, Trapez 9, Lats 10, Karın 6, Bacak 14.

### 3. Vücut Takibi (US Navy formülü)
Cinsiyete göre ölçüm alınır (erkek: boy/boyun/bel · kadın: + kalça) ve **yağ oranı** hesaplanır. Zaman içinde grafiklenir:
- **Yağ oranı (%)** değişimi
- **Kilo (kg)** değişimi
- **Yağsız kütle (kg)** = `kilo − (yağ oranı · kilo)`

### 4. Diyet
Günlük kalori + makro hedefleri, öğün bazlı yemek kaydı, günün toplamı vs. hedef (kalori halkası + makro barları) ve son 7 günün geçmişi.

## 🧱 Teknoloji
- **Next.js 14** (App Router, TypeScript, strict)
- **MongoDB + Mongoose** (route handler'lar içinde; `MONGO_URI`)
- **Tailwind CSS** (flat, mobile-first tasarım sistemi)
- **SWR** (veri çekme), **Recharts** (grafikler), **lucide-react** (ikonlar)
- Çerez tabanlı basit oturum (güvenlik bilinçli olarak minimal tutulmuştur).

## 🚀 Çalıştırma

```bash
npm install
npm run dev      # http://localhost:3000
```

`MONGO_URI` ortam değişkeni okunur; tanımlı değilse kod içindeki varsayılan bağlantı kullanılır (`.env.local` örneği repoda mevcuttur).

İlk kullanıcı (Eren) ve programı **ilk istek/giriş anında otomatik** oluşturulur. Manuel tetiklemek için:

```bash
npm run seed                 # script ile
# veya çalışan uygulamada:
curl http://localhost:3000/api/seed
```

Production:
```bash
npm run build && npm start
```

## 🗂️ Mimari

```
src/
  app/
    (auth)/login            # giriş ekranı
    (app)/                  # korumalı uygulama (alt navigasyon)
      page.tsx              # Özet + kas yenilenme paneli
      program/              # 7 günlük program planlayıcı
      body/                 # vücut & yağ oranı
      diet/                 # diyet
    api/                    # route handler'lar (auth, program, recovery, body, diet, profile, seed)
  components/
    ui/                     # tasarım sistemi (Button, Card, Ring, Bar, Sheet, ...)
    layout/                 # AppHeader, BottomNav, ProfileButton
    charts/                 # Recharts sarmalayıcıları
  lib/
    mongodb.ts  models.ts   # veritabanı
    muscles.ts  recovery.ts # kas konfigürasyonu + yenilenme matematiği
    navy.ts                 # vücut yağ oranı formülü
    exercises.ts            # hareket → kas eşlemesi
    program-data.ts seed.ts # ilk kullanıcı + örnek program
    auth.ts http.ts types.ts utils.ts fetcher.ts
  middleware.ts             # oturum koruması
```

## 🔢 Formüller

**US Navy vücut yağ oranı (metrik):**
- Erkek: `495 / (1.0324 − 0.19077·log10(bel−boyun) + 0.15456·log10(boy)) − 450`
- Kadın: `495 / (1.29579 − 0.35004·log10(bel+kalça−boyun) + 0.22100·log10(boy)) − 450`

**Yenilenme:** yarı sürede %70, tam sürede %100 (`small`=48s, `large`=24s).

**Koşu ilerlemesi:** sonraki hedef süre = `en_iyi_tempo · hedef_km` (mevcut hedeften daha kötü olmaz).

---
Flat, mobile-first ve UX odaklı. 💜
