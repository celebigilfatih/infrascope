# 🗄️ Archived Documentation — DO NOT TRUST

> ⚠️ **Bu klasördeki dosyalar v1.0 (2024) dönemine aittir ve büyük ölçüde geçersizdir.**

Bu dosyalar arşivde tutuluyor sadece **tarihsel referans** için.
İçerikleri günümüz InfraScope'unu yansıtmaz:

- 6 sayfalık küçük bir projeyi anlatıyorlar; gerçek uygulama 25+ sayfa, 5+ entegrasyon, 50+ alarm tanımı içeriyor.
- "Phase 2 / Phase 3 / Phase 4 roadmap" referansları geçerliliğini yitirdi (zaten yapıldı veya artık planlanmıyor).
- Mimari diyagramları gerçek `lib/` yapısıyla uyuşmuyor.
- `d:\Dev\infraScope` gibi Windows yolları, eski tablolar, ölü linkler içeriyor.

## Güncel Kaynak

Bunun yerine bakılması gereken yer:

- **`docs/00-product/CONSTITUTION.md`** — Ürün anayasası (gerçek kaynak)
- **`docs/README.md`** — Doküman haritası
- **`docs/30-runbooks/`** — Olay rehberleri

## Bu Dosyalar Neden Silinmedi

1. Geçmiş bağlam (commit history, eski PR referansları) için saklanıyor.
2. Bazı seksiyonlar (örn. seed data açıklaması) hâlâ doğru olabilir; tek tek değerlendirilebilir.
3. Tamamen güvendiğimiz noktada `git rm` ile silinecek.

## Arşivlenenler

| Dosya | Eski rolü |
|---|---|
| `ARCHITECTURE.md` | Mimari (yerine: `docs/10-architecture/OVERVIEW.md` planlı) |
| `INDEX.md` | Doküman haritası (yerine: `docs/README.md`) |
| `DELIVERABLES.md` | "Ne teslim edildi" listesi (artık alakasız) |
| `NEXT_STEPS.md` | v1.0 sonrası roadmap (geçersiz) |
| `PROJECT_SUMMARY.md` | Proje özeti (yerine: `docs/00-product/CONSTITUTION.md`) |
| `QUICK_START.md` | Hızlı başlangıç (yerine: kök `README.md`) |

---

**Yeni bir Quest açarken bu klasördeki hiçbir dosyayı anchor olarak verme.**
