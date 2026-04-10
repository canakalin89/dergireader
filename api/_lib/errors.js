/**
 * Uygulama geneli hata kodu kataloğu.
 * Her hata: { code, http, message }
 *   code    → sabit makine kodu (logda, toast'ta gösterilir)
 *   http    → HTTP durum kodu
 *   message → Türkçe açıklama (kullanıcıya gösterilir)
 */
const ERRORS = {
  // ── Kimlik doğrulama ────────────────────────────────────────────────────────
  ERR_AUTH_NO_TOKEN:          { http: 401, message: 'Oturum bulunamadı. Lütfen giriş yapın.' },
  ERR_AUTH_INVALID_TOKEN:     { http: 401, message: 'Oturum geçersiz. Lütfen tekrar giriş yapın.' },
  ERR_AUTH_EXPIRED:           { http: 401, message: 'Oturum süresi dolmuş. Lütfen tekrar giriş yapın.' },
  ERR_AUTH_INSUFFICIENT_ROLE: { http: 403, message: 'Bu işlem için yetkiniz yok.' },
  ERR_AUTH_OWNER_ONLY:        { http: 403, message: 'Bu işlemi yalnızca sistem sahibi yapabilir.' },

  // ── Doğrulama (validation) ──────────────────────────────────────────────────
  ERR_VAL_INVALID_JSON:         { http: 400, message: 'İstek gövdesi JSON formatında olmalı.' },
  ERR_VAL_TITLE_REQUIRED:       { http: 400, message: 'Başlık zorunludur.' },
  ERR_VAL_TITLE_TOO_LONG:       { http: 400, message: 'Başlık en fazla 120 karakter olabilir.' },
  ERR_VAL_PDF_URL_REQUIRED:     { http: 400, message: 'PDF bağlantısı (URL) zorunludur.' },
  ERR_VAL_PDF_URL_INVALID:      { http: 400, message: 'PDF URL geçersiz. https:// ile başlayan tam adres girin.' },
  ERR_VAL_COVER_URL_INVALID:    { http: 400, message: 'Kapak URL geçersiz. https:// ile başlayan tam adres girin.' },
  ERR_VAL_NAME_REQUIRED:        { http: 400, message: 'Ad alanı zorunludur.' },
  ERR_VAL_EMAIL_REQUIRED:       { http: 400, message: 'E-posta alanı zorunludur.' },
  ERR_VAL_EMAIL_INVALID:        { http: 400, message: 'Geçerli bir e-posta adresi girin.' },
  ERR_VAL_PASSWORD_REQUIRED:    { http: 400, message: 'Şifre alanı zorunludur.' },
  ERR_VAL_PASSWORD_TOO_SHORT:   { http: 400, message: 'Şifre en az 6 karakter olmalıdır.' },
  ERR_VAL_INVALID_ROLE:         { http: 400, message: 'Geçersiz rol. owner / admin / editor / pending olmalı.' },
  ERR_VAL_BOT_DETECTED:         { http: 400, message: 'Geçersiz istek tespit edildi.' },

  // ── Dergi (magazine) ────────────────────────────────────────────────────────
  ERR_MAG_NOT_FOUND:    { http: 404, message: 'Dergi bulunamadı.' },
  ERR_MAG_SAVE_FAILED:  { http: 500, message: 'Dergi kaydedilirken sunucu hatası oluştu.' },

  // ── Kullanıcı ───────────────────────────────────────────────────────────────
  ERR_USR_NOT_FOUND:       { http: 404, message: 'Kullanıcı bulunamadı.' },
  ERR_USR_EMAIL_TAKEN:     { http: 409, message: 'Bu e-posta adresiyle zaten kayıtlı bir hesap var.' },
  ERR_USR_WRONG_PASSWORD:  { http: 401, message: 'E-posta veya şifre hatalı.' },
  ERR_USR_OWNER_PROTECTED: { http: 403, message: 'Sistem sahibinin hesabı değiştirilemez.' },

  // ── Depolama (Blob/Store) ───────────────────────────────────────────────────
  ERR_STORE_READ_FAILED:  { http: 500, message: 'Veriler okunurken hata oluştu. Lütfen sayfayı yenileyin.' },
  ERR_STORE_WRITE_FAILED: { http: 500, message: 'Veriler kaydedilirken hata oluştu. Lütfen tekrar deneyin.' },

  // ── Genel ───────────────────────────────────────────────────────────────────
  ERR_METHOD_NOT_ALLOWED: { http: 405, message: 'Bu HTTP metodu desteklenmiyor.' },
  ERR_SERVER_UNKNOWN:     { http: 500, message: 'Beklenmeyen bir sunucu hatası oluştu.' },
};

/**
 * Hata yanıtı gönder.
 * Yanıt formatı: { code, message, detail? }
 *   code    → "ERR_MAG_NOT_FOUND" gibi sabit kod (logda arayabilirsiniz)
 *   message → Türkçe açıklama
 *   detail  → (isteğe bağlı) geliştirici notu
 *
 * Kullanım: return sendError(res, 'ERR_MAG_NOT_FOUND');
 *           return sendError(res, 'ERR_SERVER_UNKNOWN', err.message);
 */
function sendError(res, code, detail) {
  const entry = ERRORS[code];
  if (!entry) {
    console.error('[sendError] Tanımsız hata kodu:', code);
    return res.status(500).json({ code: 'ERR_SERVER_UNKNOWN', message: ERRORS.ERR_SERVER_UNKNOWN.message });
  }
  const body = { code, message: entry.message };
  if (detail) body.detail = String(detail);
  console.error(`[API ${code}]${detail ? ' — ' + detail : ''}`);
  return res.status(entry.http).json(body);
}

module.exports = { ERRORS, sendError };
