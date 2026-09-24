# Production sprint — devir dokümanı (24.09.2026)

Bu belge, Claude Projects içinde yürütülen production sprint'ini **doğrudan repo üzerinde açılan bir
Claude Code oturumuna** devretmek için yazıldı. Yeni oturum önce bu dosyayı, sonra `handoff/` altındaki
hazırlık notlarını okur. Kalan işlerin kaynağı budur; Projects'teki thread'lere erişim yoktur.

Kod tabanı: `main` @ `ec0f44d` (PR #3 merge'ü). Ürün dili Türkçe, mühendislik dili İngilizce (kod, test, doküman).

---

## 1. Durum özeti

| İş paketi | Durum | PR | Kalan |
|---|---|---|---|
| T0 Prod güvenlik (Risk 1+3) + tasarım skill'leri | **bitti** | #1 merged | — |
| T1 Tasarım sistemi (Floo-mavi, flat), Floo bildirim kuyruğu, yeni ana ekran | merged, açık uçlar var | #3 merged | bkz. §4.1 (≈2,5–3,5 s) |
| T2 Floo 3 karakteri (iskelet, eller, poz kütüphanesi, event bus) | **draft, merge bekliyor** | #5 draft, dal `claude/t2-floo-character-holrr1` | bkz. §4.2 (≈3–4 s) |
| T3 Antrenman mantığı core+API (id tabanlı döngü, B1–B9, hacim bantları) | merged | #2 merged | bkz. §4.3 (≈2 s) |
| T4 Hareket→kas aktivasyon verisi v1 (143 hareket, 689 çift, kaynaklı) | merged (veri seed'e bağlı değil) | #6 merged | bkz. §4.4 (≈1–1,5 s) |
| T7 Kas kazanma motoru, FFMI, uyarlanan hedef (core+API) | merged | #4 merged | bkz. §4.5 (≈1 s) |
| T5 Antrenman ekranları | **başlamadı** (hazırlık notu var) | — | bkz. §4.6 (≈3–4,5 s) |
| T6 Beslenme ekranları | **başlamadı** (hazırlık notu var) | — | bkz. §4.7 (≈3–4,5 s) |
| T8 Onboarding veri seansı | **başlamadı** (hazırlık notu var) | — | bkz. §4.8 (≈3–4,5 s) |
| Entegrasyon QA (tüm akış tarayıcıda) | — | — | ≈1 s |

Kalan toplam ≈ **20–27 saat** (agent-saati; alt agent'lar paralel çalışırsa duvar saati ≈ 6–8 s).
Süreler tahmindir.

Bağımlılık sırası: **T2 merge → (T1 açık uçları ‖ T3/T4 seed sync ‖ T7 küçük iş) → T5 ‖ T6 → T8 → entegrasyon QA.**
T5/T6/T8 tasarım temeli (T1) ve karakter (T2) main'de olmadan başlamaz; T8 ayrıca T7 sözleşmesini kullanır (main'de).

---

## 2. Eren'in kararları (bağlayıcı)

- Production için sadece **Risk 1** (seed'de sabit admin şifresi) ve **Risk 3** (Mongo auth'suz dışa açık) çözülür; CI yok. İkisi de PR #1 ile bitti.
- **Marka rengi:** uygulama mordan **maviye** geçti; Floo mavi kalır. Token'lar `apps/mobile/src/theme/tokens.ts` (T1).
- **UI yönü:** FatSecret / MyFitnessPal / BitePal arası, daha flat ve daha animasyonlu. Floo ana ekranda kocaman değil, **sağ üstte küçük**; uyarılar ve temel bildirimler ondan gelir; uygulamanın ≈%50'si onun üzerinden akar (BitePal'daki gibi %80 değil).
- **Floo:** sadece kol düzeltmesi değil, Gemini referansına (`Gemini_Generated_Image_pgiob1pgiob1pgio.jpg`) doğru karakter geliştirmesi: rubber-hose uzuvlar, eller/pozlar, IK ile işaret etme, poz kütüphanesi, yürüme döngüsü, LOD, uygulamaya bağlı tetikleyiciler.
- **Antrenman programı:** haftaya yayılmış **veya** N günlük dönen döngü; sapma olursa "sıradaki gün = en son yapılan günün sonrakisi", pointer id ile, tek `logDay`. Düzenleme UI/UX'i sıfırdan.
- **Kas hacmi:** 5+ koruma, 10+ gelişim, 15+ ideal, 20+ sakatlığa doğru; geçişler yumuşak; öneri 10–15; kesirli setler aktivasyon yüzdesiyle; değerler **literatür ortalaması** (bench press triceps %90 örneği bağlayıcı değil). Eren ileride salonla revize edecek; veri düzenlenebilir kalmalı.
- **Beslenme:** yağ oranı hedef planlayıcısı beslenmenin **ana ekranı**; grafikler sıfırdan; besin ekleme hızlı, **kamera birincil**.
- **Onboarding:** ilk açılışta Floo ağırlıklı animasyonlu veri seansı; FFMI + yağ yorumu; hedef önerisi; progress bar dili; kas kazanma süre tahmini; her ölçümde anlık geri bildirim; hedef değişikliği Floo tarafından **önerilir, tek dokunuşla kabul**, asla sessizce uygulanmaz.

## 3. Çalışma kuralları (Eren'in koyduğu)

- **Model:** tüm agent'lar Opus 5.5, high; ana agent'lar UI/karakter işlerinde max. Test **koşturma** işçileri Sonnet olabilir; sonuçları yargılamak ve tüm kod Opus'ta kalır.
- **Gerçek tarayıcı testi:** Chromium + Playwright, mobil için Expo web (`EXPO_PUBLIC_API_FAKE=1 expo export --platform web`). Testler asla kısılmaz; hız yerine kalite ve performans.
- **UI/UX skill'leri zorunlu** (`.claude/skills/`, main'de): `frontend-design`, `design-taste-frontend`, `emil-design-eng`, `motion-framer` (web; mobilde prensip, uygulama Reanimated 4), `design-motion-principles` (audit modu da), `design-dna`, `game-ui-ux`. Skill–iş eşlemesi §6'daki tabloda.
- **Merge çıtası:** dal main ile güncel; sonrasında `pnpm typecheck` + tüm testler geçer; kullanıcıya görünen değişiklik Chromium'da kontrol edilir; temiz code-review turu; PR ready; normal GitHub merge; main'e asla force-push.
- Eren kullanımı izliyor: ekstra işçi sayısı minimumda, iş bitince işçiler durur.
- Ortam notları: `fastdl.mongodb.org` ve `huggingface.co` bu ortamdan erişilebilir olduğunda API testleri (mongodb-memory-server) koşar; Docker daemon yok. `apps/mobile/__tests__/lib/notifications.test.ts` tam koşuda bazen sıra bağımlı düşer, tek başına geçer (bilinen flake). Chromium bu ortamda jsDelivr sertifikasını reddediyor; Floo araçları canvaskit.wasm'ı yerel servis eder. Playwright `executablePath: "/opt/pw-browsers/chromium"`.

---

## 4. Kalan işler (iş paketi başına)

### 4.1 T1 Tasarım sistemi (merged, PR #3) — ≈2,5–3,5 s
Yapıldı: Floo-mavi token'lar (light/dark, AA), flat primitifler, `src/mascot/voice` (`useFloo().say` kuyruğu, `useFlooOnce`, `useFlooPresence`, `FlooCornerHost`), hata toast'ları Floo'ya yönlendirildi, docked tab bar, `Screen` scroll top bar, `Header` Floo için yer ayırır, yeni ana ekran (GoalStrip, CalorieCard, TodayCard, StreaksRow), `CountUp`.
Kalan:
- `design-motion-principles` ile motion audit; light/dark tam Chromium turu (modaller dahil); README bölümleri (voice/Screen/Header/TabBar/CountUp).
- `CountUp` eslint hatası (effect içinde setState); `onScrim` token'ı ekle (scan ekranı `ON_SCRIM = dark.ink` geçici); Program ekranında sticky header kaydırınca Floo'nun üstüne biniyor; beslenme FAB'ı "−514" değerini kapatıyor (T6 ile çözülür).
- Sağ üst Floo'yu T2'nin küçük karakterine bağla (§4.2 entegrasyon adımları; T2 PR'ında yapılır).

### 4.2 T2 Floo 3 karakteri (draft PR #5) — ≈3–4 s
Yapıldı (dalda): `rig.ts` (IK, rubber-hose uzuvlar, eller, botlar, spring'ler), `poses.ts` (9 mood pozu, 23 jest), `behaviour.ts` (tetikleyici planları, LOD/`flooBox`, ambientMood), `FlooLimbs.tsx`, `events.ts` (`flooBus`, nutrition/workout/body/goal mutasyonlarına bağlı), film şeridi aracı `scripts/floo-filmstrip`, parity aracı yolları düzeltildi. 646 mobil test geçiyor.
Kalan:
1. **Önce merge:** main'i dala al, typecheck + tüm testler, T1 entegrasyonu: `<FlooEventBridge/>` T1'in `FlooVoice` sarmalayıcısına (`app/_layout.tsx`); `FlooCorner` `<FlooModel lod="badge" trigger={voice.reaction} size={40}>` kullanır; `voice/queue.ts` tip importları `FlooMood`/`FlooTrigger`; `FlooV2` trigger/pointAt geçirir; `FLOO_COLORS` mavi. Sonra PR ready + merge.
2. Film şeridi bulguları (`node scripts/floo-filmstrip/filmstrip.mjs` ile yeniden üret): idle fazla hareketli (fidget'lar seyrek ve küçük olsun); `point@864ms` gövde 6 px düşüyor; wipeBrow, bellyPat, whoa, shrug, cheer, flex tek adımlı zıplıyor; reduced motion ilk karede snap, tap'te hiçbir şey olmuyor; mealLogged ve goalHit sonrası kollar yukarıda kalıyor; fallRecover'da T-poz ve sonda pop; walk gerçek yürüme değil; clap'te kol düzleşiyor ve eller ağzı kapatıyor; wave kolu düz düşüyor; point ≈800 ms geç başlıyor.
3. Parity 96,63 → hedef ≥97 (yüz bölgesi 88,1).
4. T8 için `onGestureEnd` callback'i ekle (şimdilik `gestureDuration(name)` ile sıralanıyor).
5. Su ve set mutasyonu yok: T5/T6 ekranları `flooBus.emit("waterLogged"|"setCompleted")` kendisi çağırır.

### 4.3 T3 Antrenman mantığı (merged, PR #2) — ≈2 s
Yapıldı: id tabanlı döngü pointer'ı, `POST /program/log-day`, weekly mod, B1–B9 düzeltmeleri, `core/training/volumeBands.ts`, 17 kas, mobil veri katmanı (`features/training/queries.ts`, `lib/fake`).
Kalan:
1. Seed katalog senkronu (T4 ile anlaşıldı): eksik hareketleri `nameKey` ile ekle; `muscles`'ı yalnızca tüm yükler 1 ve anahtarlar v1 kümesindeyse üzerine yaz.
2. `templates.ts` kasları `SEED_EXERCISES`'tan isimle alsın ("legs" yok).
3. Expo web'de gerçek tarayıcı turu.

### 4.4 T4 Aktivasyon verisi (merged, PR #6) — ≈1–1,5 s
Yapıldı: `apps/api/src/seed/data/exerciseActivation.v1.ts` (`EXERCISE_ACTIVATION_V1`, `ACTIVATION_SOURCES`; çift başına ortalama yük, 0,05'e yuvarlı, <0,1 atılır; `confidence {level,n,spread}` + kaynaklar), `exerciseActivation.v1.evidence.json` (218 kaynak), `apps/api/scripts/build-activation-seed.mjs`.
Kalan:
1. `exercises.ts` içindeki `SEED_EXERCISES`'ı `EXERCISE_ACTIVATION_V1`'den türet (20 eski isim veride var); hareket sayan seed testlerini güncelle.
2. Şüpheli değerleri bağımsız doğrula: muscle-up chest 1,0; cable kickback hamstring yüksek; jump squat/box jump/sled push belki conditioning (`muscles: []`); Pallof press oblik payı; cable curl forearms 1,0. Burpee, kardiyo, Stretch/Mobility `muscles: []`.
3. Admin panelde aktivasyon düzenleme (Eren salonla revize edecek).

### 4.5 T7 Kas kazanma motoru (merged, PR #4) — ≈1 s
Yapıldı: `assessBody` (FFMI, bant, Türkçe yorum, öneri), üç yönlü plan (`cut`/`bulk`/`recomp`) aynı roadmap yapısında, kas kazanma hızı literatür ortalaması (Aragon/McDonald), uyarlanan hedef (ilk 3 hafta bekler; önde/geride/durmuş → Floo önerisi, accept/dismiss uçları), her ölçümde geri bildirim (`feedback {textTr, mood, trigger, bars}`); sözleşme `docs/plan/11-muscle-gain-engine.md`.
Kalan: rekomp hedef ayarı yalnızca kiloya bakıyor; yağ oranı ölçümleri de hesaba katılmalı.

### 4.6 T5 Antrenman ekranları — ≈3–4,5 s (başlamadı)
Hazırlık notu: `handoff/t5-workout-ui-prep.md` (T3 arayüzü, baseline script'leri). Kapsam (plan §3–4): program ekranı, program kurma/düzenleme (gün ekle/sil/yeniden adlandır, hareket sırası, ad-hoc hareket), bugünün günü + "bugün başka bir şey yaptım" seçimi (`logDay`), mola günü tamamlama, canlı kas hacmi çubukları ve Floo uyarıları (`programVolume` editörde canlı), logger'ın `logDay({dayId})`'ye geçişi (T5'in işi). `queries.ts` ve `lib/fake` T3'e ait; T5 yalnızca tüketir.

### 4.7 T6 Beslenme ekranları — ≈3–4,5 s (başlamadı)
Hazırlık notu: `handoff/t6-nutrition-prep.md` (T7 sözleşme cevabı). Kapsam (plan §5): üstte hedef şeridi + gidişat mini grafiği (plan çizgisi vs EWMA trendi), bugünün bütçesi ("Kalan" denklemi), kamera birincil hızlı ekleme çubuğu (sheet menüsü yok), öğünler (tek dokunuş tekrar, kaydırarak sil), ilerleme sekmesi (kilo/yağ/bel, plan vs gerçek, uyum, Floo'dan recalibrasyon/ayar önerisi + accept/dismiss). Fotoğraf: `MIN_ANALYZE_MS` yapay bekleme kaldırılır, porsiyon presetleri + gram klavyesi, düşük güvende "bunu mu demek istedin?" (API'den kalem başına top-3: `zDetection`'a alternatives, T6 alanı). Ölçüm yoksa yağ oranı akış içinde girilir.

### 4.8 T8 Onboarding veri seansı — ≈3–4,5 s (başlamadı)
Hazırlık notu: `handoff/t8-onboarding-prep.md` (T7 ve T2 API anlaşmaları). Kapsam (plan §7): 7 adımlı Floo'lu seans (isim; cinsiyet/doğum/boy; kilo/boyun/bel(/kalça) canlı yağ halkasıyla; aktivite + haftalık gün + antrenman deneyimi; "mevcut durum" kartı: yağ %, LBM, FFMI + yorum; Floo'nun hedef önerisi + kaydırıcı + canlı süre/haftalık hız; bitiş). Taslak MMKV'de, kaldığı yerden devam. `trainingLevel` (beginner/intermediate/advanced) T7 girişine gider; POST /onboarding zaten `createGoal` çağırıyor.

### 4.9 Entegrasyon QA — ≈1 s
Onboarding → ana ekran → program → antrenman kaydı → beslenme (kamera) → ölçüm → Floo geri bildirimi akışı Chromium'da baştan sona; light/dark; reduced motion.

---

## 5. Repo haritası (yeni oturum için)

- `packages/core`: saf domain mantığı. `training/` (döngü pointer'ı, `volumeBands.ts`), `goal/` (plan, progress, recalibrate, assessment/FFMI), `navy/`, `schemas/`.
- `apps/api`: Fastify + Mongoose. `modules/training`, `modules/body` (goals), `modules/nutrition`, `seed/` (`data/exercises.ts`, `data/exerciseActivation.v1.ts`, `data/muscles.ts`, `data/templates.ts`).
- `apps/mobile`: Expo Router. `src/theme/tokens.ts`, `src/ui/*` (bileşen kiti + README), `src/mascot/` (`model/` Floo 3, `voice/` kuyruk, `events.ts`), `src/features/{home,training,nutrition,goals,body,onboarding}`, `app/(tabs)`, `app/(modals)`, `app/mascot-playground.tsx`.
- `apps/admin`: Next.js panel (kaslar, hareketler, şablonlar, hedef sabitleri).
- Testler: `pnpm typecheck`, `pnpm test:core`, `pnpm test:api`, `pnpm test:mobile`, `pnpm test:admin`; tarayıcı e2e `scripts/e2e.sh`.
- Planlar: `docs/plan/00-…11-*.md` (v2 mimarisi), bu dosya (sprint devri), aşağıdaki ek (sprint planının tamamı).

## 6. Skill–iş eşlemesi

| İş | Ana agent skill'leri | Yardımcı agent skill'leri |
|---|---|---|
| T1 açık uçları | frontend-design, emil-design-eng | design-motion-principles (audit), run |
| T2 Floo | design-motion-principles, emil-design-eng, game-ui-ux | design-motion-principles (audit) |
| T3/T4 seed sync | engineering:system-design | engineering:testing-strategy, code-review |
| T5 Antrenman UI | frontend-design, emil-design-eng, dataviz | design-motion-principles, run |
| T6 Beslenme UI | frontend-design, emil-design-eng, dataviz | design-motion-principles, run |
| T8 Onboarding | frontend-design, design-motion-principles, game-ui-ux, emil-design-eng | design-motion-principles, run |
| Hepsi | superpowers, code-review | — |

---

# Ek: Production planı v2 (24.09.2026, onaylandı)

Aşağısı Projects'te yazılan planın tamamıdır. Satır referansları `main @ 75ee09a` içindir; T1–T4 ve T7 merge'lerinden sonra bazı dosyalar değişti, güncel durum için §1 ve §4 esastır.

## 0. Ön kontroller

### Skill'ler repoya geldi mi?
Geldi, ama **`main`'de değil, `prod-sprint` dalında** (commit 10864aa, `.claude/skills/`, 54 dosya). Yedisi de yerinde ve SKILL.md'leri okunabiliyor:

| Skill | Durum | Not |
|---|---|---|
| frontend-design | var | Genel görsel yön, tipografi |
| design-taste-frontend | var | Landing page odaklı; "audit-first redesign" kısmı işimize yarar |
| emil-design-eng | var | Mikro detay, polish, animasyon kararları. Mobil için en değerlisi |
| motion-framer | var | **Framer Motion = web/React DOM.** Admin panelde doğrudan, mobilde (React Native) sadece prensip olarak kullanılır; mobilde karşılığı Reanimated 4 |
| design-motion-principles | var | Animasyon denetimi (audit) modu maskot ve geçişler için çok uygun |
| design-dna | var | Token/stil çıkarımı. BitePal/MFP/FatSecret referanslarından DNA çıkarmak için |
| game-ui-ux | var | Motor odaklı (HUD, menü). Maskotun köşe "HUD"u ve bildirim kuyruğu için fikir kaynağı |

**Yapılması gereken:** `prod-sprint`'i `main`'e merge etmek (içinde sadece bu skill commit'i var). Aksi halde `main`'den açılan her thread skill'leri göremez. Bu, planın 0. adımı.

`agent-reach` skill'i hesapta var, ama CLI'ı (`agent-reach`, `mcporter`) bu ortamda kurulu değil. Web okuma kanalı (`r.jina.ai`) çalışıyor. Araştırma thread'i ilk iş olarak CLI'ı kurup `agent-reach doctor` ile kanalları doğrulayacak.

### Ortam
- `fastdl.mongodb.org` ve `huggingface.co` artık erişilebilir (ikisi de 200 döndü). Yani API testleri (mongodb-memory-server) ve vision model testleri artık bu ortamda koşabilir. Önceki ortamda bloklu olan buydu.
- Docker yok. Mobil UI doğrulaması `expo export --platform web` + Playwright ekran görüntüleriyle yapılabilir (Skia web'de CanvasKit ile çalışıyor). Gerçek iOS/Android hissi için son kontrol senin cihazında olmalı.

### Production riskleri (sadece 1 ve 3)
- **Risk 1:** `apps/api/src/seed/index.ts:53` sabit şifre `Asd*123` ile `eren` (admin) ve `inci` hesaplarını boş DB'de oluşturuyor; `SEED_ON_BOOT` varsayılan açık. Plan: production'da `SEED_ON_BOOT` varsayılan kapalı; admin şifresi env'den (`SEED_ADMIN_PASSWORD`) gelmezse seed kullanıcı oluşturmayı reddetsin; README'deki şifre kaldırılsın.
- **Risk 3:** `docker-compose.yml:10` Mongo'yu `27017:27017` ile auth'suz dışarı açıyor. Plan: port yayını kaldırılsın (sadece iç ağ) veya `127.0.0.1:27017`'ye bağlansın, `MONGO_INITDB_ROOT_USERNAME/PASSWORD` + uygulama kullanıcısı ile auth açılsın, `MONGO_URI` kimlik bilgili olsun.

---

## 1. Maskot (Floo V2) — kollar

### Neden kötü görünüyor (koddan tespit)
- Her kol, referans JPG'den piksel piksel çizilmiş **tek parça sert bir poligon**. Dirsek, bilek, kemik yok (`mascot/model/geometry.ts:31-50`).
- Animasyon sadece omuz pivotu etrafında **tek bir `rotate`** (`FlooModel.tsx:791-806`). Aşağı sarkan el 135° "sevinç" pozunda olduğu gibi ters dönüyor; hiçbir nokta bükülmüyor.
- T-poz görüntüsünü gizlemek için 60°'den sonra kolu doğrusal kaydıran bir hack var (`shoulderRide`, `:125-139`). 60°'de harekette kırılma yaratıyor (çıkarım).
- Omuzda dikiş: kol dolgusu `#6BC3E9`, gövde `#69C8F1` (`params.ts:130-133`) ve kollar artık gövdenin önünde çiziliyor. Renk ve kontur farkı omuzda görünüyor (çıkarım).
- 5 katmanlı açı toplamı sert şekilde −40..142'ye kesiliyor, bu yüzden spring'in taşması düz bir duvara çarpıyor. `shake` doğrusal (spec "lineer yok" diyor).
- Ana ekranda 72 px genişlikte, kol ≈10 px. Kıvrım/kenar detayları piksel altı, ama yine de çiziliyor (LOD yok).
- Spec "kol/bacak yok" diyor, kodda 4 uzuv ve 21 parametre var. Spec ve kod çelişiyor.
- Tetikleyiciler (mealLogged, goalHit…) sadece playground'da bağlı; uygulamada hiçbir ekran tetiklemiyor.
- Parity aracı sadece statik kareyi ölçüyor, hareket kalitesini değil. `compare.mjs:10` Mac yolunu sabit kodlamış.

### Öneri: sadece düzeltme değil, Floo 3 karakter geliştirmesi (T2)
Referans görsel (`Gemini_Generated_Image_pgiob1pgiob1pgio.jpg`) hedefimiz: ince rubber-hose kollar, 4 parmaklı el, çıplak ayak, uçtan fırlayan damlacıklar, iki uzun highlight. Statik parity zaten %97 civarında; eksik olan **hareket ve karakter**. Kapsam:

**A. İskelet ve uzuvlar**
1. Kol: omuz→dirsek→bilek 2 segment; her karede worklet içinde noktalardan tüp path üretilir (sabit kalınlık, yuvarlak uçlu kalın Skia stroke, gövdeyle aynı dolgu + koyu kontur). Kök gövdenin içinde başlar, dikiş kalmaz.
2. El: 4 parmaklı mitten, 6 poz (açık, yumruk, işaret, başparmak yukarı, el sallama, düz avuç). Poz geçişi path morph ile (eşit nokta sayısı).
3. Bacak: kalça→diz→ayak 2 segment; ayak yere basar, zıplamada yerden ayrılır, inişte dizler kırılır (squash ile senkron).
4. IK: el hedefi verildiğinde (örn. "sağ üstteki halkayı göster") dirsek 2-kemik IK ile çözülür; balonu ya da UI öğesini işaret edebilir.
5. Tek spring katmanı, yumuşak limitler (soft clamp), dirsek/bilek omuzdan 40–80 ms gecikmeli (follow-through). Sert clamp ve doğrusal wobble kaldırılır.

**B. Poz ve hareket kütüphanesi** (her biri eklem açılarıyla tanımlı, playground'da izlenebilir)
- Idle: ağırlık aktarma, nefes, ara sıra kolları kavuşturma/başı kaşıma gibi 3–4 mikro jest.
- Tepkiler: el sallama (selam), alkış, yumruk havada (goalHit), flex (kas gösterme, antrenman bitince), işaret etme (uyarı balonu yönüne), omuz silkme (worried), esneme (sleepy), başparmak yukarı, "shh" düşünme (think).
- Hareket halinde: yürüme döngüsü (onboarding ekranlar arası geçişte sahneye yürür), zıplama, düşüp toparlanma (missedDay: üzülür, hemen kalkar).
- Su temalı: içme (waterLogged, gövde parlar), sıçrama (damlacık efekti), terleme (antrenman sırasında).

**C. Bağlam farkındalığı**
- Boyut LOD: ≥96 px tam gövde; 56–96 px kollar var bacak yok; <56 px (sağ üst köşe) sadece gövde+yüz+tek el, bakış kullanıcı dokunuşunu izler.
- Tetikleyiciler uygulamaya bağlanır (bugün sadece playground'da): yemek eklendi, hedef tutturuldu, seri arttı, gün kaçtı, hedef aşıldı, su içildi, set tamamlandı, kas hacmi uyarısı, hedef ayarı önerisi. Hepsi `useFloo().say()` kuyruğundan geçer (T1 API'si).
- Zaman farkındalığı: sabah/gece (sleepy), antrenman günü (enerjik), dinlenme günü (rahat).
- Hidrasyon ekseni korunur.

**D. Kalite kapısı**
- Playground'a "film şeridi" kaydı: her poz/tetikleyici için 8 kare, Playwright ile render, `design-motion-principles` audit modu ile değerlendirme (metronom simetrisi, lineer hareket, teleport red).
- Parity aracı korunur ve yol sabitliği (`compare.mjs:10` Mac yolu) parametre yapılır.
- Spec dosyası gerçek modele göre yeniden yazılır ("kol/bacak yok" cümlesi kaldırılır).

**Kapsam dışı (ileride):** Blender/Rive dışa aktarım, ses efektleri, kıyafet/aksesuar (slot bırakılır).

**Marka rengi (karar):** Floo V2'nin gök mavisi kalır; uygulama primary'si mordan (`#6D5DF6`) Floo ailesinden bir maviye geçer. T1 token'ları buna göre yazar.

---

## 2. Genel UI yönü: BitePal ↔ MyFitnessPal ↔ FatSecret, daha flat ve animasyonlu

### Bugün neden yorucu
- Ana ekranda 6 tam genişlik blok var, hepsi kademeli (stagger) animasyonla giriyor (`HomeScreen.tsx:66-86`).
- Mor gradient ve mor glow gölge her yerde: GoalHero, Ring, FAB, avatar, AiThinking, CurrentDayCard.
- 24/28 radius ve her kartta gölge.
- Mor zemin üstüne yeşil/amber/kırmızı durum renkleri ve kas başına renkler eklenince çok renkli bir görüntü çıkıyor.

### Hedef dil
- **Flat:** beyaz/açık gri zemin, kartlarda gölge yerine 1px ayırıcı ya da çok hafif yüzey farkı, radius 14–16, gradient sadece 1 yerde (hedef halkası).
- **Tek vurgu rengi** ve durum renkleri sadece anlam taşıdığı yerde. Rakamlar büyük ve net (MFP'nin "Kalan = Hedef − Yemek + Egzersiz" satırı gibi).
- **Animasyon anlamlı:** sayı sayma (count-up), halka dolması, liste ekleme/çıkarma layout animasyonu, basma geri bildirimi. Sayfa açılışında kademeli giriş yok.
- **Maskot sağ üstte**, header'da ≈44–56 px. Tüm uyarı ve temel bildirimler ondan konuşma balonu olarak çıkar. Mutasyon onayları gibi nötr sistem mesajları (kaydedildi, silindi, geri al) toast/UndoBar'da kalır. Böylece etkileşimin ≈%50'si Floo üzerinden akar, %80 değil.
- **Tek bildirim kanalı:** `useFloo().say(message, {mood, trigger, priority})` kuyruğu. Hedef aşıldı, set hacmi uyarısı, öğün hatırlatması, seri artışı gibi olayların hepsi buradan geçer ve Floo'nun tetikleyicilerini gerçekten bağlar.
- Önce `design-dna` ile 3 referans uygulamadan token/stil DNA'sı çıkarılır, sonra `tokens.ts` yeniden yazılır. Token disiplini zaten iyi (özelliklerde ham hex yok), bu yüzden tema değişimi merkezi yapılabilir.

---

## 3. Antrenman mantığı

### Mevcut model
Program zaten "döngü" tabanlı: `days[]` + `currentIndex` ve her adım `% days.length`. Yani 3 günlük idman-koşu-mola döngüsü bugün de saklanabiliyor. Sorun, bunun üstündeki mantık:

| # | Hata | Kanıt |
|---|---|---|
| B1 | Mola gününde "Dinlendim, devam et" skip çağırıyor, API skip'te pointer'ı kaydırmıyor. Döngü mola gününde takılı kalıyor. **Senin anlattığın kullanım tam burada kırılıyor.** | `CurrentDayCard.tsx:49,175`, `program.routes.ts:201-203` |
| B2 | Uygulama skip'te pointer'ı ilerletiyor, API ilerletmiyor. Ekran önce ilerliyor, sonra geri zıplıyor. Testler iki tarafta zıt davranışı kilitlemiş. | `queries.ts:184-196`, `training.program.test.ts:291`, `queries.test.tsx:86-105` |
| B3 | Aynı gün tekrar tamamlanınca plan bir sonraki güne göre eşleşiyor. | `program.routes.ts:114-128` |
| B4 | Bugünün kaydı geçmişten silinince pointer geri alınmıyor, döngüden bir gün kayboluyor. | `workouts.routes.ts:85-91` |
| B5 | Editörde gün sırası değişince "bugün" başka güne kayıyor. | `ProgramEditorSheet.tsx:53-67`, `program.routes.ts:85` |
| B6 | Kayıt düzenlenince (PATCH) planlanan set bilgisi kayboluyor. | `workouts.routes.ts:70` |
| B7 | Pointer 3 farklı şekilde hesaplanıyor (core, ana ekran raporu, admin). | `reports.service.ts:248`, admin `users/[id]/page.tsx:131` |
| B8 | Türkçe I/İ küçültme tutarsız. | core `program.ts:104` ve API `service.ts:42` |
| B9 | Aynı güne çift kayıt veya çift ilerlemeye karşı unique index yok (çıkarım). | `workoutLog.ts:85-86` |

"İdman planlıydı ama koşu yaptım" durumu için tek yol bugün Jump + tamamla. Sonrasında atlanan idman sessizce kayboluyor.

### Yeni mantık (öneri)
- **İki mod, tek motor:**
  - **Haftalık:** gün hafta gününe bağlı (Pzt = Push…).
  - **Döngü:** N gün, haftadan bağımsız döner.
- **Kural: "Sıradaki gün = en son yaptığın günün bir sonrakidir."** Pointer'ı "planlanan" değil, **yapılan** belirler.
  - Bugün ekranında önerilen gün büyük gösterilir, altında "Bugün başka bir şey yaptım" seçeneğiyle döngünün diğer günleri hızlıca seçilir.
  - Örnek: Pzt idman, Sal koşu, Çar mola, Per tekrar idman sırası. Sen koşu yaptın ve "Koşu" seçtin; sıra "Mola"dan devam eder. İstersen tek dokunuşla "İdmanı kaçırdım, sıraya geri koy" da seçilebilir.
  - Mola günü de bir "yapılan gün": "Dinlendim" onu tamamlar ve döngü ilerler.
- Skip, jump ve complete tek bir `logDay(dayId)` işlemine iner. Undo, silme ve yeniden sıralama pointer'ı **gün id'si** ile tutar (index değil), böylece B4/B5 kendiliğinden çözülür.
- Pointer hesabı sadece `packages/core`'da olur; API, admin ve mobil onu çağırır (B7). `(userId, dateKey)` için unique index eklenir (B9).
- Haftalık mod takvim görünümü, döngü modu "sıradaki 7 gün" projeksiyonu gösterir. `weekNumber` → `cycleNumber` olarak düzeltilir.

---

## 4. Program oluşturma motoru ve kas hacmi uyarıları

### Bugün
- Veri modeli zaten ağırlıklı: `muscles: [{key, load 0..1}]` (`models/exercise.ts:8`).
- Ama **seed'de her yük 1**: şınav göğüs, ön omuz ve trapez için tam set sayılıyor.
- Sadece **20 hareket** var ve **14 kasın 7'si aktif** (biceps, triceps, glute, hamstring, baldır, bel, önkol pasif; "legs" tek grup).
- Hacim hesabı var (`core/training/volume.ts`), ama admin panelde ayrı bir kopya var ve 7/döngü ölçeklemesi farklı. **Mobil editörde hiç hacim uyarısı yok.**

### Kas grupları (öneri, 17)
göğüs, ön omuz, yan omuz, arka omuz, trapez/üst sırt, lat, bel (erector), biceps, triceps, önkol, karın, oblik, quadriceps, hamstring, kalça (glute), adduktör, baldır.

### Hacim bantları (haftalık, yüzdelikli set)
Etkin set = Σ (set × aktivasyon). Örneğin bench press 3 set ve göğüs 0.9 aktivasyon, 2.7 göğüs seti eder; 9.9 gibi değerler mümkün.

| Etkin set | Durum | Renk/uyarı |
|---|---|---|
| < 5 | Yetersiz, kas kaybı riski | gri, Floo nazikçe uyarır |
| 5–10 | Koruma | mavi |
| **10–15** | **Önerilen: gelişim** | yeşil |
| 15–20 | Çok iyi, üst sınırda | koyu yeşil, "önerilenin üstündesin" bilgisi |
| 20+ | Aşırı, sakatlık riskine doğru | amber → kırmızıya geçiş |

Geçişler yumuşak olur: skor sürekli bir fonksiyondur (sigmoid/rampa), eşiklerde sıçrama yok. 19 set yeşil-sarı arası, 20 set "hafif uyarı", 24+ gerçek uyarı. Döngü programlarında hacim 7 güne ölçeklenir (döngü başına set × 7 / döngü uzunluğu).

### Motor
- Editörde canlı kas haritası/çubukları: gün eklerken ve hareket eklerken bantlar anında güncellenir.
- Floo uyarıları: "Arka omuz 3 set, koruma altında", "Göğüs 22 set, çok fazla; bir hareketi 2 sete düşür?"
- Öneri: eksik kas için hareket önerisi (katalogdan en yüksek aktivasyonlu ve ekipmana uygun).
- Programdaki hareketler katalog id'si ile bağlanır. Bugün isimle kopyalanıyor; snapshot korunur.

### Seed verisi (araştırma)
- Hedef ≈120–150 hareket × 17 kas aktivasyon matrisi. Kaynak: EMG çalışmaları, ExRx, Stronger by Science ve benzerleri; `agent-reach` ile toplanır.
- Her satırda `source` ve `confidence` alanları bulunur; veri ayrı versiyonlu bir dosyada durur (`seed/data/exerciseActivation.v1.ts`).
- Admin panelden düzenlenebilir, sonradan salonla revize etmen kolay olur.
- Karar: her hareket–kas çifti için birden fazla kaynağın **ortalaması** alınır; kaynak sayısı ve dağılım `confidence` alanına yazılır.

---

## 5. Beslenme: hedef planlayıcı ana ekran

### Bugün
- Matematik gerçekten sağlam (`core/goal/plan.ts`):
  - Katch-McArdle + Mifflin karışımı
  - haftalık metabolik adaptasyon
  - 4 ayrı güvenli hız sınırı
  - kalori tabanı
  - haftalık makrolar
  - EWMA trendi
  - yeniden kalibrasyon
  - kapsamlı testler
- Ama planlayıcı bir **modal** içinde. Beslenme sekmesinde hedef ilerlemesi ve kilo/yağ trend grafiği yok.
- Mevcut yağ oranı son ölçümden geliyor. Ölçüm yoksa "Ölçüm ekle" butonu sadece `router.back()` yapıyor (`GoalSetupScreen.tsx:154`).
- Fotoğrafla ekleme bir sheet'teki 5 eşit satırdan biri. Ek olarak:
  - zorunlu 1.8 sn "analiz" beklemesi (`scanMachine.ts:12`)
  - sonuç sheet'i kaydırarak kapanmıyor
  - porsiyon sadece +/- ile değişiyor
  - düşük güvende alternatif öneri yok

### Yeni beslenme sekmesi (sıfırdan)
1. **Üst: Hedef şeridi.** "%18 → %12 · 9 hafta kaldı · Yolundasın" ve mini gidişat grafiği (plan çizgisi ile gerçek EWMA trendi üst üste). Dokununca tam yol haritası açılır.
2. **Bugünün bütçesi:** yol haritasının bu haftasından gelen kalori ve makrolar; MFP tarzı "Kalan" denklemi.
3. **Hızlı ekleme çubuğu:** kamera (birincil ve büyük), ara, barkod, son yenenler. Sheet menüsü yok.
4. **Öğünler:** tek dokunuşla tekrar ekleme, kaydırarak silme.
5. **İlerleme sekmesi:** kilo, yağ, bel grafikleri; plan ve gerçek karşılaştırması; haftalık uyum; yeniden kalibrasyon önerisi (Floo'dan gelir).

Fotoğraf akışı:
- Yapay bekleme kaldırılır.
- Porsiyon presetleri (1 porsiyon, 100 g, avuç…) ve gram klavyesi eklenir.
- Düşük güvende "Bunu mu demek istedin?" alternatifleri gösterilir; API'den kalem başına top-3 dönmesi gerekir.

Ölçüm yoksa yağ oranı akış içinde (inline) girilir: Navy ölçüsü ya da doğrudan %.

---

## 6. Thread ve agent dağılımı (v2)

**8 thread, 3 dalga. Aynı anda en fazla 5 thread.** Her thread 1 ana Claude + tabloda yazan alt agent'lar. Model: hepsi Opus 5.5 high; "max" yazan işler max effort. Saatler **tahmindir**; duvar saati, thread'in açılışından draft PR'ın doğrulanmış hale gelmesine kadar. Bekleme (senin cihaz kontrolün, inceleme) dahil değil.

| # | Thread | Dalga | Bağımlılık | Ana + alt agent'lar | Tahmini süre |
|---|---|---|---|---|---|
| T0 | Prod güvenlik (Risk 1+3) + `prod-sprint` → `main` merge | 1 | — | 1 ana (high) | 1–2 s |
| T1 | Tasarım sistemi + kabuk: mavi token'lar, flat bileşen seti, ana ekran, sağ üst Floo + bildirim kuyruğu `useFloo().say()` | 1 | T0 | 1 ana (max) + DNA çıkarımı (high) + uygulama (high) + motion audit (high) | 8–12 s |
| T2 | **Floo 3 karakter geliştirmesi**: iskelet (kol/el/bacak, IK), poz ve hareket kütüphanesi, LOD, uygulamaya bağlı tetikleyiciler, film şeridi kalite kapısı (bölüm 1) | 1 | T0 | 1 ana (max) + rig/geometri (high) + motion audit (high) | 14–20 s |
| T3 | Antrenman mantığı core+API: id tabanlı pointer, "yapılan gün" kuralı, B1–B9, hacim motoru (sürekli bantlar, döngü→hafta ölçekleme) | 1 | — | 1 ana (high) + test/inceleme (high) | 6–9 s |
| T4 | Aktivasyon seed araştırması: ≈130 hareket × 17 kas, literatür ortalaması, kaynak+confidence, admin düzenleme | 1 | — | 1 ana (high) + 3 paralel araştırma (high, kas grubu başına) + 1 derleme/doğrulama (max) | 8–12 s |
| T7 | **Kas kazanma motoru + uyarlanan hedef** (core+API): FFMI, çift yönlü plan (yağ ver / kas kazan / rekomp), literatür hız tabloları, ilerlemeye göre otomatik hedef ayarı, her ölçümde anlık geri bildirim | 1 | — | 1 ana (max) + literatür araştırması (high) + test (high) | 10–14 s |
| T5 | Antrenman UI: program ekranı, editör, canlı hacim çubukları + Floo uyarıları | 2 | T1, T3, T4 | 1 ana (high) + görsel doğrulama (high) | 8–12 s |
| T6 | Beslenme UI: hedef-merkezli ana ekran, gidişat grafikleri, hızlı ekleme çubuğu, fotoğraf UX | 2 | T1, T7 | 1 ana (max) + görsel doğrulama (high) | 10–14 s |
| T8 | **Onboarding veri seansı**: Floo'lu animasyonlu akış, FFMI/yağ yorumu, hedef önerisi, progress bar dili | 3 | T1, T2, T7 | 1 ana (max) + motion/görsel doğrulama (high) | 10–14 s |

Toplam ≈ **75–109 agent-saati**; 3 dalga ile takvimde ≈ **4–5 iş günü** (dalga 1 ≈ 14–20 s (T2 en uzun), dalga 2 ≈ 10–14 s, dalga 3 ≈ 10–14 s, aralarda senin kontrolün). Aynı anda ≈ 12–15 agent.

Sahiplik: `theme/tokens.ts` ve `src/ui/*` T1; `core/training` T3; `seed/data/exercise*` T4; `core/goal`, `core/body` ve `/goals` API'si T7; onboarding T8. T5, T6 ve T8 bu modüllere dokunmaz, API'lerini kullanır. Her thread kendi draft PR'ını açar; CI yok, her PR `pnpm typecheck` + ilgili testler + web ekran görüntüleriyle doğrulanır.

### Opus 5.5 yeter mi?
Evet. T1, T2, T6, T7 ve T8 için ana agent max effort; geri kalanı high. Asıl sınır model değil cihazda görsel doğrulama: her dalga sonunda senin kontrolün planlanmalı.

---

## 7. Onboarding veri seansı, FFMI ve kas kazanma motoru (Eren'in eklediği)

### Bugün
- Onboarding var ama ince: 6 adım (welcome, account, about, measure, goal, done; `features/onboarding/model.ts:13`), form gibi. Floo sadece karşılama/bitiş ekranında.
- **FFMI kodda yok** (repo genelinde 0 eşleşme). `bodyComposition` ve `bodyFatCategory` var (`core/navy`).
- Hedef motoru **tek yönlü**: sadece hedef yağ < mevcut yağ için çalışıyor; hedef yüksekse `TARGET_ABOVE_CURRENT` uyarısı veriyor (`core/goal/plan.ts:50`). Kas kazanma planı yok.
- Uyarlama: `progress.ts` gerçek/beklenen farkını ve `recalibrate.ts` ölçülen TDEE'yi hesaplıyor, ama **hedefi otomatik değiştirmiyor**; roadmap sabit kalıyor.

### Onboarding akışı (T8)
Bir "seans" gibi, her adım tek soru, Floo soruyor, cevap gelince tepki veriyor (rig'den poz + balon). Adımlar:
1. Merhaba ve isim.
2. Cinsiyet, doğum tarihi, boy.
3. Kilo, boyun, bel (kadın için kalça): her ölçüm girildiğinde Floo'nun yanında canlı yağ oranı halkası dolar.
4. Aktivite düzeyi ve haftalık antrenman günü.
5. **"Mevcut durumun" kartı:** yağ %, yağsız kütle, **FFMI** ve yorum (örn. "FFMI 18.5: kas kütlen düşük, hedefin önce kas kazanmak olmalı"; "Yağ %24, FFMI 21: yağ vermek öncelikli"; ikisi de orta ise rekomp seçeneği).
6. Hedef önerisi: Floo bir hedef önerir (yön + hedef değer + tempo), kullanıcı kaydırıcıyla değiştirir, tahmini süre ve haftalık kilo hızı canlı görünür.
7. Bitiş: ilk program şablonu ve beslenme hedefi hazır, ana ekrana geçiş.
Taslak hâlâ diskte tutulur (mevcut `draft.ts`), yarım bırakılınca kaldığı yerden devam eder.

### Kas kazanma motoru (T7, core)
- **FFMI** = LBM/boy² + 6.1×(1.8 − boy). Bantlar: <18 düşük, 18–20 ortalama, 20–22 iyi, 22–25 ileri, >25 doğal sınıra yakın (kadın için ≈ −3). Yorumlar Türkçe, tabloda.
- **Kas kazanma hızı (literatür ortalaması, ay başına vücut ağırlığı yüzdesi):** başlangıç ≈ %1–1.5, orta ≈ %0.5–1, ileri ≈ %0.25–0.5 (Lyle McDonald / Alan Aragon modelleri, kadın için yaklaşık yarısı). Seviye, antrenman yılı ve FFMI'dan türetilir. Araştırma T7'nin ilk adımı; T4'teki gibi kaynak + confidence ile veri dosyasında tutulur.
- Kalori fazlası: hedef kas hızı × (kg başına ≈ 2500–3000 kcal kas + kaçınılmaz yağ payı); yağ kazanma oranı seviyeye göre (örn. başlangıç 1:1, ileri 1:2 kas:yağ). Protein 1.6–2.2 g/kg.
- **Tek plan tipi, üç yön:** `cut`, `bulk`, `recomp`. Roadmap haftalık aynı yapıda (kilo, yağ %, LBM, kcal, makro), böylece mevcut RoadmapScreen, grafikler ve progress bar'lar üç yönde de çalışır.
- **Uyarlanan hedef:** her ölçüm girişinde `computeGoalProgress` sonucu bir "ayar" üretir:
  - Planın önündeysen (EWMA trendi beklenenin ≥0.4 kg önünde 2+ hafta): hedef tarihi öne çek ya da hedef değeri sıkılaştır; Floo kutlar ve öneriyi balonda sunar, tek dokunuşla kabul.
  - Gerideysen: TDEE yeniden kalibre (mevcut `recalibrateTdee`), kaloriyi düzelt, tarihi ötele; Floo nedenini kısa söyler.
  - Ayar tek dokunuşla kabul edilir, otomatik uygulanmaz (kullanıcı hedefi kendisi belirlemeli). Kabul edilen ayar `GoalAdjustment` olarak kaydedilir, grafikte işaretlenir.
- Anlık geri bildirim: ölçüm kaydedildiği anda `useFloo().say()` kuyruğuna "beklenenden 0.6 kg öndesin, 8 hafta yerine 7'de bitebilir" gibi mesaj düşer; progress bar'lar (yağ, LBM, hafta) aynı kareyle güncellenir.

---

## 8. Uygulama özeti (kesin): thread'ler, agent'lar, skill'ler, süreler

Model: her agent Opus 5.5. "max" = ana agent max effort, diğerleri high. **Agent-saati** = tüm agent'ların toplam çalışma süresi; **duvar saati** = thread'in açılıştan doğrulanmış draft PR'a kadar gerçek süresi (alt agent'lar paralel çalıştığı için agent-saatinden kısa). İkisi de tahmin.

Ortak skill'ler (her thread'de): `superpowers` (TDD/plan/debug disiplini), `code-review` (PR öncesi kendi diff'ini denetler), `run` (uygulamayı web'de açıp ekran görüntüsü alır).

| # | Thread | Agent'lar (rol → skill'ler) | Agent | Agent-saati | Duvar saati |
|---|---|---|---|---|---|
| T0 | Prod güvenlik + skill merge | ana (high) → `security-review`, `engineering:deploy-checklist` | 1 | 1–2 | 1–2 |
| T1 | Tasarım sistemi + kabuk (mavi) | ana (max) → `frontend-design`, `emil-design-eng`, `design-taste-frontend` · DNA çıkarımı (high) → `design-dna`, `agent-reach` (BitePal/MFP/FatSecret referansları) · uygulama (high) → `frontend-design`, `emil-design-eng` · motion audit (high) → `design-motion-principles`, `motion-framer` (prensip) | 4 | 8–12 | 5–7 |
| T2 | Floo 3 karakter geliştirmesi | ana (max) → `design-motion-principles`, `emil-design-eng`, `game-ui-ux` · rig/geometri (high) → `design-motion-principles` · motion audit (high) → `design-motion-principles` (audit modu) | 3 | 14–20 | 8–12 |
| T3 | Antrenman mantığı core+API | ana (high) → `engineering:system-design` · test/inceleme (high) → `engineering:testing-strategy`, `code-review` | 2 | 6–9 | 4–6 |
| T4 | Aktivasyon seed araştırması | ana (high) → `agent-reach`, `deep-research` · 3 araştırma (high, üst gövde / alt gövde / core-izole) → `agent-reach` · derleme/doğrulama (max) → `engineering:testing-strategy` | 5 | 8–12 | 4–6 |
| T7 | Kas kazanma motoru + FFMI + uyarlanan hedef | ana (max) → `engineering:system-design`, `engineering:architecture` (ADR: plan yönleri) · literatür (high) → `agent-reach`, `deep-research` · test (high) → `engineering:testing-strategy` | 3 | 10–14 | 6–9 |
| T5 | Antrenman UI | ana (high) → `frontend-design`, `emil-design-eng`, `dataviz` (hacim çubukları) · görsel doğrulama (high) → `design-motion-principles`, `run` | 2 | 8–12 | 5–7 |
| T6 | Beslenme UI | ana (max) → `frontend-design`, `emil-design-eng`, `dataviz` (gidişat grafikleri) · görsel doğrulama (high) → `design-motion-principles`, `run` | 2 | 10–14 | 6–9 |
| T8 | Onboarding veri seansı | ana (max) → `frontend-design`, `design-motion-principles`, `game-ui-ux` (sahne/akış), `emil-design-eng` · motion/görsel doğrulama (high) → `design-motion-principles`, `run` | 2 | 10–14 | 6–9 |
| | **Toplam** | | **24 agent** (aynı anda en fazla ≈18, dalga 1'de) | **75–109** | **kritik yol ≈ 20–28** |

**Kritik yol** (dalga 1 → 2 → 3): T1 (5–7) → T6 (6–9) → T8 (6–9) ≈ 17–25 saat; T2 (8–12) de T8'in ön koşulu olduğundan dalga 1 T2 bitene kadar kapanmaz. Aralarda senin cihaz kontrolün eklenir. Gerçekçi takvim: **≈3 iş günü** (5 thread paralel, dalga sonlarında kontrol).

**3 saat öngörüsü:** 3 saatte tüm plan bitmez. 3 saatte gerçekçi olan: T0 tamamen biter; T3, T4, T7'nin araştırma ve core taslakları (ilk draft PR'lar) hazır olur; T1 token'ları ve bileşen iskeleti gelir; T2 iskelet prototipi playground'da görünür. Dalga 2 ve 3 UI işleri 3 saat içinde başlamaz.
