# E-Dergi Kütüphanesi — Aziz Sancar Anadolu Lisesi

Okulun basılı dergilerini dijital ortamda sergilemek için geliştirilmiş, okul web sitesine iframe olarak gömülebilen bir e-dergi galerisi ve PDF okuyucu.

🔗 Canlı site: https://dergireader.vercel.app

## Özellikler

- **Galeri** — Dergi kapaklarının listelendiği, yıl/kategoriye göre filtrelenebilen ana sayfa
- **Okuyucu** — Sayfa çevirme animasyonlu (flipbook), mobil uyumlu PDF görüntüleyici
- **Yönetim paneli** — Şifre korumalı; dergi ekleme/düzenleme/silme, kullanıcı ve kategori yönetimi
- **Rol sistemi** — `owner` → `admin` → `editor` → `pending` (onay bekleyen)
- **Google ile giriş** ve e-posta/şifre ile giriş desteği
- Okul kimliğine uygun lacivert + kırmızı tasarım, mobil öncelikli arayüz

## Teknolojiler

- Vanilla HTML / CSS / JavaScript (framework yok)
- [Vercel Serverless Functions](https://vercel.com/docs/functions) (`/api`)
- [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) — PDF, kapak görseli ve JSON verilerinin depolanması
- [PDF.js](https://mozilla.github.io/pdf.js/) — PDF render motoru
- [StPageFlip](https://github.com/Nodlik/StPageFlip) — sayfa çevirme animasyonu
- JWT (`jsonwebtoken`) + `bcryptjs` — kimlik doğrulama

## Kurulum

```bash
npm install
```

### Ortam değişkenleri

Proje Vercel üzerinde çalışacak şekilde tasarlanmıştır. Aşağıdaki ortam değişkenlerinin Vercel proje ayarlarında (Settings → Environment Variables) tanımlanması gerekir:

| Değişken | Açıklama |
|---|---|
| `JWT_SECRET` | Oturum token'larını imzalamak için rastgele, uzun bir string |
| `OWNER_EMAIL` | Sahip (owner) rolünü otomatik alacak e-posta adresi |
| `GOOGLE_CLIENT_ID` | Google OAuth istemci kimliği |
| `GOOGLE_CLIENT_SECRET` | Google OAuth istemci sırrı |
| `GOOGLE_REDIRECT_URI` | Google OAuth geri dönüş adresi (`https://<domain>/api/auth/callback`) |

`@vercel/blob` için gereken `BLOB_READ_WRITE_TOKEN`, proje Vercel'de bir Blob Store'a bağlandığında otomatik olarak eklenir; elle tanımlanmasına gerek yoktur.

### Yerel geliştirme

```bash
npm run dev
```

Bu komut `vercel dev` çalıştırır ve hem statik dosyaları hem de `/api` fonksiyonlarını yerelde ayağa kaldırır.

### Test

```bash
npm test
```

Node.js testleri gerçek Google veya Blob bağlantısı kurmadan mevcut hesaplarla
Google girişini, JSON güncellemelerini ve okuma hatasında veri korumasını denetler.
Blob SDK v2 için sabit JSON kayıtlarında `allowOverwrite: true` gereklidir.
Depo okuma hataları boş listeye dönüştürülmez; mevcut kayıtlar korunur.
Google başlangıç ve dönüş adımları aynı `GOOGLE_REDIRECT_URI` değerini kullanır;
bu değer Google Cloud'da kayıtlı adresle birebir eşleşmelidir. Sunucunun dahili
`localhost` adresinden otomatik dönüş adresi üretilmez.
Giriş başka bir alan adından başlatılırsa önce kayıtlı dönüş adresinin alanına
geçilir; böylece güvenlik çerezi ve Google dönüşü aynı alanda kalır.

### Dağıtım (Deploy)

Depo, `main` dalına yapılan her push'ta Vercel tarafından otomatik olarak dağıtılır.

## Klasör yapısı

```
api/            Vercel serverless fonksiyonları (dergi, kullanıcı, kategori, auth uçları)
  _lib/         Ortak yardımcılar (blob okuma/yazma, JWT doğrulama, hata mesajları)
public/         Statik site (galeri, okuyucu, yönetim paneli)
  css/, js/     Sayfa stilleri ve istemci tarafı script'ler
  admin/        Yönetim paneli arayüzü
  img/          Okul logosu ve görseller
```

## Embed (iframe) desteği

Site, okulun ana web sitesine `<iframe>` ile gömülebilmesi için `X-Frame-Options: ALLOWALL` ve `Content-Security-Policy: frame-ancestors *` başlıklarıyla yapılandırılmıştır (bkz. `vercel.json`).

---

Geliştirici: **Can AKALIN** — [@can_akalin](https://instagram.com/can_akalin)
