# Suv inshooti yorilishi — 3D toshqin simulyatsiyasi

Samarqanddagi **Cho'pon ota** va **Dagbit** suv inshootlari uchun veb-xarita: inshoot yorilsa, suv qancha joyni bosishini 3D relyef ustida ko'rsatadi.

Skrinshotli to'liq qo'llanma: [docs/Suv_inshooti_qollanma.docx](docs/Suv_inshooti_qollanma.docx).

## Ishga tushirish

[Node.js](https://nodejs.org) (18 yoki undan yangi) kerak. Qo'shimcha kutubxona o'rnatish shart emas.

- **Windows:** `start.bat` ni ikki marta bosing — server yonadi va brauzer ochiladi. To'xtatish uchun `stop.bat`.
- **Boshqa tizimlar:** `npm start`, keyin brauzerda `http://localhost:8080`.

Sun'iy yo'ldosh tasviri va relyef plitkalari internetdan yuklanadi.

## Foydalanish

1. Inshootni tanlang (ro'yxatdan yoki xaritadagi belgini bosib).
2. Suv hajmi, to'g'on balandligi, yorilish ulushi va davomiylikni kiriting.
3. «Simulyatsiyani boshlash» ni bosing. Hisob tugagach, toshqin sekin animatsiya qilinadi.
4. Pastki panelda tezlikni tanlang, kadrma-kadr yuring yoki «Maksimal» va «Yetib kelish vaqti» xaritalariga o'ting.
5. Natijani Google Earth Pro uchun KMZ yoki jadval uchun CSV qilib eksport qilish mumkin.

## Inshootlar

| Inshoot | Kenglik | Uzunlik | Standart hajm |
|---|---|---|---|
| Cho'pon ota suv inshooti | 39.682269 | 67.059071 | 6 000 m³ (pasport: 2×2 000 + 2×1 000 m³) |
| Dagbit suv inshooti | 39.712479 | 66.956325 | 6 000 m³ (pasport: 2×3 000 m³) |

To'g'on balandligi ikkalasida ham 8 m deb olingan — bu **taxminiy** qiymat. Hisobdan oldin pasport ma'lumotlarini kiriting. Qiymatlar `public/app.js` boshidagi `SITES` ichida turadi.

## Xavfli zonalar va xlorlash

Xaritada har bir inshoot atrofida xlor ombori turiga qarab xavfli zonalar ko'rsatiladi:

| Xlor ombori turi | Radius | Maydon |
|---|---|---|
| Ballonli | 150 m | ≈7,1 ga |
| Konteynerli | 500 m | ≈78,5 ga |

- Chap paneldagi «Xavfli zonalar (xlor)» bo'limida ombor turi tanlanadi (150 m, 500 m, ikkalasi yoki ko'rsatilmasin).
- Zona ichidagi binolar OpenStreetMap'dan olingan (Dagbit: 150 m ichida 1 ta, 500 m ichida 187 ta). Cho'pon ota atrofidagi binolar OpenStreetMap'da kiritilmagan, shuning uchun u yerda son ko'rsatilmaydi.
- Zona markazi sifatida inshoot nuqtasi olingan. Xlor omborining aniq o'rni va haqiqiy turi (ballon yoki konteyner) aniqlashtirilishi kerak.

«Xlorlash» bo'limida faol xlor sarfi kalkulyatori (M = Q × D / 1000), ikkala inshootning qiyosiy jadvali va sutkalik suv hajmiga qarab xlorlash usuli mezonlari bor. Manbalar: `data/XLORLASH.docx` va `data/XLORLASH mezonlari.docx`.

## DEM va Inspektor

- **Inspektor** (yuqori paneldagi tugma, standart holatda yoqilgan): xaritada bosilgan nuqtaning dengiz sathidan balandligi (metrda), koordinatasi, eng yaqin inshootgacha masofa, xavfli zonaga tushishi va — simulyatsiya o'tkazilgan bo'lsa — suv chuqurligi hamda yetib kelish vaqti ko'rsatiladi.
- **DEM** belgisi balandlik bo'yicha ranglangan relyef qatlamini va uning afsonasini yoqadi.
- Kursor ostidagi koordinata va balandlik xaritaning yuqori chap burchagida doimiy ko'rinib turadi.

Balandlik SRTM (~30 m) modelidan olinadi; xatosi bir necha metr bo'lishi mumkin.

## Model va cheklovlar

- **Relyef:** AWS Terrain Tiles (SRTM, ~30 m). Binolar, kanal dambalari va yo'l ko'tarmalari hisobga olinmaydi.
- **Oqim:** soddalashtirilgan 2D sayoz suv modeli (Bates va b., 2010 usuli), `public/sim-core.js`.
- **Yorilish gidrografi:** Froehlich (2008) empirik formulasi bo'yicha cho'qqi sarf, uchburchak gidrograf.

Natija dastlabki baholash uchun mo'ljallangan va rasmiy xavf xaritasi yoki loyihaviy hisob o'rnini bosmaydi.

## Tuzilishi

| Fayl | Vazifasi |
|---|---|
| `server.mjs` | statik fayl serveri |
| `public/index.html` | sahifa va uslublar |
| `public/app.js` | xarita, boshqaruv, animatsiya, eksport |
| `public/sim-core.js`, `public/sim-worker.js` | toshqin modeli (Web Worker'da ishlaydi) |
| `public/export.js` | KMZ/CSV yordamchilari |
| `public/info.js`, `public/data.js` | Pasport va Statistika bo'limlari, ularning ma'lumotlari |
| `public/dem.js` | DEM qatlami va Inspektor (nuqta balandligi) |
| `public/xlor.js`, `public/hazard-data.js` | Xavfli zonalar qatlami va Xlorlash bo'limi; zona ichidagi binolar (OpenStreetMap) |
| `public/vendor/` | MapLibre GL JS 4.7.1 |
| `docs/` | Word qo'llanma (skrinshotlar bilan) |

## Rasmlar

Inshoot sxemalari va pasport surati (`public/img/`) repozitoriyga kiritilmagan — ular qo'riqlanadigan obyektga tegishli. Dashboardning Pasport bo'limida ko'rinishi uchun fayllarni shu papkaga qo'lda qo'ying: `choponota-texnologik-karta.jpg`, `choponota-pasport-stend.jpg`, `samarqand-sxema.jpg`.

Manba jadvallar va hujjatlar `data/` papkasida; `public/data.js` jadvallardan yaratilgan.

## Litsenziya eslatmasi

Asos xarita sifatida Google sun'iy yo'ldosh plitkalari to'g'ridan-to'g'ri ulangan; bu rasmiy litsenziyalangan yo'l emas. Ommaviy foydalanish uchun Esri qatlamiga o'ting yoki Google Maps API kalitidan foydalaning.

Xavfli zona ichidagi binolar ma'lumoti: © OpenStreetMap ishtirokchilari, ODbL litsenziyasi.
