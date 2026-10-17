import { BookOpen, ChevronDown, Clock3, Info, KeyRound, Plus, ShieldCheck, Unplug } from 'lucide-react';
import { PageHeading } from '@/components/ui/page-heading';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Button } from '@/components/ui/button';
import styles from './page.module.css';

// This installation has no application API-key store, authentication or usage log.
// Integration credentials belong to their respective integration settings.
export default function KeysPage() {
  return <div className={styles.page}>
    <div className={styles.workspace}>
      <header className={styles.header}>
        <PageHeading section="keys" description="Uygulama API anahtarlarının durumu, erişim yetkileri ve kullanım bilgileri.">API Anahtarları</PageHeading>
        <Button disabled aria-describedby="key-availability"><Plus size={16} aria-hidden="true" className="mr-2" />Yeni anahtar</Button>
      </header>

      <div className={styles.availability}>
        <SemanticBadge tone="neutral" icon={Unplug}>Henüz kullanılamıyor</SemanticBadge>
        <p id="key-availability">Bu sürümde API anahtarı oluşturma ve yönetme desteği bulunmuyor.</p>
      </div>

      <section aria-label="API anahtarlarına genel bakış" className={styles.stats}>
        <article className={styles.stat}>
          <div><h2>Anahtar durumu</h2><span className={styles.icon}><KeyRound size={18} aria-hidden="true" /></span></div>
          <p className={styles.value}>Bilinmiyor</p>
          <p>Etkin, süresi dolmuş veya iptal edilmiş anahtar bilgisi alınamıyor.</p>
        </article>
        <article className={styles.stat}>
          <div><h2>Erişim yetkileri</h2><span className={styles.icon}><ShieldCheck size={18} aria-hidden="true" /></span></div>
          <p className={styles.value}>Tanımlanamıyor</p>
          <p>Anahtar bazında okuma ve yazma yetkileri bu sürümde yönetilemiyor.</p>
        </article>
        <article className={styles.stat}>
          <div><h2>Son kullanım</h2><span className={styles.icon}><Clock3 size={18} aria-hidden="true" /></span></div>
          <p className={styles.value}>Veri yok</p>
          <p>Kullanım kaydı bulunmaması, bir anahtarın hiç kullanılmadığı anlamına gelmez.</p>
        </article>
      </section>

      <section aria-labelledby="key-list-title" className={styles.collection}>
        <div className={styles.sectionHeader}>
          <span className={styles.icon}><KeyRound size={20} aria-hidden="true" /></span>
          <div><h2 id="key-list-title">Anahtar kayıtları</h2><p>Durum, yetkiler ve kullanım bilgileri</p></div>
        </div>
        <div className={styles.empty}>
          <span className={styles.emptyIcon}><Unplug size={28} aria-hidden="true" /></span>
          <h3>Anahtar yönetimi henüz kullanıma açık değil</h3>
          <p>Anahtar listesi ve kullanım geçmişi bu sürümde sunulmuyor. Bu nedenle anahtar oluşturma, kopyalama ve iptal etme işlemleri kullanılamıyor.</p>
        </div>
        <div className={styles.note}><Info size={17} aria-hidden="true" /><p>Entegrasyonlarda kullandığınız erişim anahtarlarını ilgili entegrasyonun ayarlarından yönetebilirsiniz.</p></div>
      </section>

      <details className={styles.guide}>
        <summary><span className={styles.icon}><BookOpen size={18} aria-hidden="true" /></span><span>Durum, yetki ve kullanım bilgileri ne anlama gelir?</span><ChevronDown size={18} aria-hidden="true" className={styles.chevron} /></summary>
        <div className={styles.guideBody}>
          <p className={styles.guideIntro}>Aşağıdaki açıklamalar bilgi amaçlıdır; mevcut anahtar veya atanmış yetki göstermez.</p>
          <dl>
            <div><dt><KeyRound size={16} aria-hidden="true" />Anahtar durumu</dt><dd>Etkinlik, son geçerlilik tarihi ve iptal bilgisi birlikte değerlendirilir. Durumu bilinmeyen bir anahtar etkin kabul edilmez.</dd></div>
            <div><dt><ShieldCheck size={16} aria-hidden="true" />Erişim yetkileri</dt><dd>Yetki kapsamı, hangi kaynakların okunabildiğini ve hangi işlemlerin yapılabildiğini belirtir. Okuma izni, yazma veya silme izni anlamına gelmez.</dd></div>
            <div><dt><Clock3 size={16} aria-hidden="true" />Son kullanım</dt><dd>Kaydedilmiş son kullanımın tarih ve saatidir. Veri yoksa kullanım zamanı ve kullanım sıklığı hakkında çıkarım yapılamaz.</dd></div>
          </dl>
        </div>
      </details>
    </div>
  </div>;
}
