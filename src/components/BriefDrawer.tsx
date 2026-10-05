/**
 * BriefDrawer — Laci Pembuat Brief.
 * Formulir spesifikasi baku, ekspor otomatis ke workspace/briefs/ via POST /brief.
 * Aturan: tanpa alert, tanpa select/input file native, tanpa emoji, tanpa em dash.
 */
import React, { useState } from 'react'
import Icon from './Icon'

interface BriefForm {
  judul: string
  tanggal: string
  kategori: string
  masalah: string
  solusi: string
  mengapaSekarang: string
  target: string
  som: string
  validasi: string
  harga: string
  cogs: string
  cac: string
  opex: string
  breakeven: string
  vendor: string
  legal: string
  alur: string
  anggaran: string
  tenggat: string
  larangan: string
}

const EMPTY: BriefForm = {
  judul: '', tanggal: new Date().toISOString().slice(0, 10), kategori: 'Produk Baru',
  masalah: '', solusi: '', mengapaSekarang: '',
  target: '', som: '', validasi: '',
  harga: '', cogs: '', cac: '', opex: '', breakeven: '',
  vendor: '', legal: '', alur: '',
  anggaran: '', tenggat: '', larangan: '',
}

const KATEGORI = ['Produk Baru', 'Ekspansi Pasar', 'Perubahan Harga', 'Kemitraan']

const PRESETS: { label: string; data: Partial<BriefForm> }[] = [
  {
    label: 'Ekspansi SaaS B2B',
    data: {
      judul: 'Ekspansi SaaS B2B ke Segmen Manufaktur Menengah',
      kategori: 'Ekspansi Pasar',
      masalah: 'Produsen menengah mencatat produksi di spreadsheet terpisah sehingga stok dan jadwal shift selalu terlambat. Kesalahan prediksi stok menahan kas rata-rata 18 hari per kuartal.',
      solusi: 'Paket langganan per pabrik untuk perencanaan produksi dan stok, terhubung ke keuangan, dengan implementasi 2 minggu.',
      mengapaSekarang: 'Regulasi pelaporan pajak baru menuntut jejak digital stok, sementara pesaing besar hanya melayani korporat multinasional.',
      target: 'Pabrik menengah dengan 50 sampai 300 karyawan di Jawa Barat dan Jawa Tengah',
      som: '1,8 miliar rupiah tahun pertama (320 pabrik x 4,7 juta rupiah)',
      validasi: 'Wawancara 14 pabrik, 3 surat komitmen bayar, uji coba 1 pabrik 6 minggal.',
      harga: '399.000 rupiah per pabrik per bulan',
      cogs: '41.000 rupiah per pabrik per bulan (infrastruktur dan dukungan)',
      cac: '1.600.000 rupiah per pabrik (pelatihan lapangan dan demo)',
      opex: '28.000.000 rupiah per bulan (2 karyawan lapangan, iklan, lisensi peta)',
      breakeven: '11 bulan atau 145 pabrik aktif',
      vendor: 'Penyedia cloud lokal, integrator akuntansi, konsultan pajak',
      legal: 'Perjanjian pemrosesan data, sertifikasi keamanan informasi level 2',
      alur: 'Demo 1 hari, uji coba 14 hari, tanda tangan kontrak, implementasi 2 minggu, go-live berbayar.',
      anggaran: '900.000.000 rupiah',
      tenggat: 'Kuartal berikutnya',
      larangan: 'Tanpa diskon tahunan pertama, tanpa kustomisasi kode sumber klien.',
    },
  },
  {
    label: 'Layanan Logistik Kilat',
    data: {
      judul: 'Layanan Logistik Kilat Antar Kota Pulau Jawa',
      kategori: 'Produk Baru',
      masalah: 'Toko daring kecil kehilangan pembeli karena estimasi kirim 5 sampai 7 hari padahal kompetitor menawarkan 2 hari. Biaya retur karena keterlambatan memakan 6 persen omset.',
      solusi: 'Layanan antar kota same-day dan next-day lewat armada mitra, dengan pelacakan per segmen rute.',
      mengapaSekarang: 'Jalur tol baru memangkas waktu tempuh 30 persen dan tarif bahan bakar turun, menurunkan biaya per kilometer.',
      target: 'Penjual daring dengan 200 sampai 5.000 pesanan per bulan di Jawa',
      som: '2,4 miliar rupiah tahun pertama (1.100 penjual aktif x 181 ribu rupiah per bulan)',
      validasi: 'Data 3 kurir mitra, uji rute Solo-Semarang 60 hari, pra-pesan 87 penjual.',
      harga: '12.500 rupiah per paket 2 kilogram dalam kota',
      cogs: '8.900 rupiah per paket (insentif kurir, bahan bakar, sopir)',
      cac: '420.000 rupiah per penjual (akuisisi tim penjualan)',
      opex: '46.000.000 rupiah per bulan (subpusat, sistem, gaji tim operasi)',
      breakeven: '14 bulan atau 9.800 paket per hari',
      vendor: 'Mitra armada, penyedia asuransi kargo, penyedia pintu pembayaran',
      legal: 'izin usaha angkutan barang, perjanjian mitra kurir',
      alur: 'Penjual pickup, sortir subpusat, antar kota malam hari, kirim terakhir sebelum pukul 17.00.',
      anggaran: '1.500.000.000 rupiah',
      tenggat: 'Dalam 5 bulan',
      larangan: 'Tanpa subsidi tarif di bawah biaya, tanpa perluasan luar Jawa sebelum kuartal ketiga.',
    },
  },
  {
    label: 'Perubahan Skema Biaya Langganan',
    data: {
      judul: 'Perubahan Skema Biaya Langganan ke Struktur Bertingkat',
      kategori: 'Perubahan Harga',
      masalah: 'Pelanggan kecil membayar fitur tingkat perusahaan sehingga biaya layanan melonjak 40 persen tanpa tambahan pendapatan. Marjin grup terendah di lini langganan.',
      solusi: 'Tiga tingkat langganan: Dasar, Tim, Perusahaan, dengan batas pemakaian wajar per tingkat.',
      mengapaSekarang: 'Kontrak pelanggan besar berakhir dalam 90 hari dan menjadi momen peralihan ke skema baru.',
      target: 'Seluruh basis pelanggan berbayar aktif (2.300 akun)',
      som: 'kenaikan marjin 6 poin persen tanpa perubahan jumlah pelanggan',
      validasi: 'Uji harga pada 200 pelanggan luring, elastisitas terukur minus 4 persen.',
      harga: 'Dasar 99.000, Tim 349.000, Perusahaan 1.200.000 rupiah per bulan',
      cogs: 'biaya layanan per akun tetap 18.000 rupiah per bulan',
      cac: 'nol untuk pelanggan luring, 260.000 rupiah untuk pelanggan baru berbayar',
      opex: 'tidak berubah, 31.000.000 rupiah per bulan',
      breakeven: 'perubahan langsung menguntungkan sejak bulan pertama',
      vendor: 'penyedia tagihan, penyedia pintu pembayaran',
      legal: 'pemberitahuan perubahan syarat layanan 30 hari sebelumnya',
      alur: 'pemberitahuan, masa uji 30 hari, migrasi otomatis, penagihan pada siklus berikutnya.',
      anggaran: '150.000.000 rupiah (migrasi sistem dan komunikasi)',
      tenggat: 'Kuartal ini',
      larangan: 'Tanpa kenaikan untuk pelanggan tahunan yang sudah membayar di muka.',
    },
  },
]

function buildMarkdown(f: BriefForm): string {
  const line = (label: string, val: string) => `- ${label}: ${val.trim() || '[belum diisi]'}`
  return [
    `# SPESIFIKASI PROPOSAL: ${f.judul.trim()}`,
    '- Pemilik Inisiatif: Bos',
    `- Tanggal Pengajuan: ${f.tanggal}`,
    `- Kategori: ${f.kategori}`,
    '',
    '---',
    '',
    '### 1. HIPOTESIS INTI & PROPOSISI NILAI',
    line('Masalah yang Diselesaikan', f.masalah),
    line('Solusi yang Ditawarkan', f.solusi),
    line('Alasan Mengapa Sekarang', f.mengapaSekarang),
    '',
    '### 2. KLAIM TARGET PASAR & TRAKSI',
    line('Target Konsumen Spesifik', f.target),
    line('Estimasi Ukuran Pasar yang Diincar', f.som),
    line('Bukti Validasi Awal', f.validasi),
    '',
    '### 3. ASUMSI UNIT ECONOMICS & KEUANGAN',
    line('Harga Jual per Unit', f.harga),
    line('Estimasi Biaya Modal / COGS', f.cogs),
    line('Alokasi Biaya Akuisisi Konsumen (Target CAC)', f.cac),
    line('Biaya Operasional Tetap Bulanan', f.opex),
    line('Target Titik Impas (Break-Even)', f.breakeven),
    '',
    '### 4. ALUR OPERASIONAL & KETERGANTUNGAN PIHAK KETIGA',
    line('Vendor Kritis', f.vendor),
    line('Aspek Legalitas / Izin Khusus', f.legal),
    line('Alur Transaksi Utama', f.alur),
    '',
    '### 5. BATASAN MUTLAK (NON-NEGOTIABLES)',
    line('Anggaran Maksimal', f.anggaran),
    line('Tenggat Waktu Rilis', f.tenggat),
    line('Hal yang Dilarang Dikerjakan', f.larangan),
    '',
  ].join('\n')
}

interface Props {
  open: boolean
  onClose: () => void
  onSent: (file: string) => void
}

const BriefDrawer: React.FC<Props> = ({ open, onClose, onSent }) => {
  const [form, setForm] = useState<BriefForm>(EMPTY)
  const [kategoriOpen, setKategoriOpen] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'err'; text: string }>(
    { kind: 'idle', text: '' }
  )

  const set = (k: keyof BriefForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }))

  const applyPreset = (data: Partial<BriefForm>) => {
    setForm({ ...EMPTY, ...data, tanggal: form.tanggal })
    setStatus({ kind: 'idle', text: 'Contoh cepat dimuat. Ganti angkanya sesuai kasusmu.' })
  }

  const submit = async () => {
    if (!form.judul.trim() || !form.masalah.trim()) {
      setStatus({ kind: 'err', text: 'Judul dan Masalah yang Diselesaikan wajib diisi.' })
      return
    }
    setStatus({ kind: 'busy', text: 'Mengirim ke meja Ketua Tim...' })
    try {
      const res = await fetch('http://127.0.0.1:3334/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.judul, content: buildMarkdown(form) }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'gagal')
      setStatus({ kind: 'ok', text: `Terkirim: ${data.file}. Ketua Tim mulai membacanya.` })
      onSent(data.file)
      setForm({ ...EMPTY, tanggal: form.tanggal })
    } catch (e) {
      setStatus({ kind: 'err', text: `Gagal mengirim: ${e instanceof Error ? e.message : e}` })
    }
  }

  if (!open) return null

  const Field = ({ label, k, area = false, hint }: {
    label: string; k: keyof BriefForm; area?: boolean; hint?: string
  }) => (
    <label className="brief-field">
      <span className="brief-label">{label}</span>
      {area ? (
        <textarea className="brief-input brief-area" rows={2} value={form[k]} onChange={set(k)} placeholder={hint} />
      ) : (
        <input className="brief-input" value={form[k]} onChange={set(k)} placeholder={hint} />
      )}
    </label>
  )

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="brief-section">
      <h3 className="brief-section-title">{title}</h3>
      {children}
    </section>
  )

  return (
    <>
      <div className="brief-scrim" onClick={onClose} />
      <aside className="brief-drawer">
        <header className="brief-header">
          <Icon name="doc" size={13} />
          <span>AJUKAN BRIEF BARU</span>
          <button className="brief-close" onClick={onClose} aria-label="Tutup">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>

        <div className="brief-presets">
          <span className="brief-presets-label">Contoh cepat:</span>
          {PRESETS.map(p => (
            <button key={p.label} className="brief-preset" onClick={() => applyPreset(p.data)}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="brief-body">
          <Section title="Identitas">
            <Field label="Nama proyek / fitur" k="judul" hint="mis. Ekspansi ke Surabaya" />
            <div className="brief-row">
              <Field label="Tanggal pengajuan" k="tanggal" />
              <div className="brief-field">
                <span className="brief-label">Kategori</span>
                <button
                  className="brief-input brief-select"
                  onClick={() => setKategoriOpen(v => !v)}
                  onBlur={() => setTimeout(() => setKategoriOpen(false), 150)}
                >
                  <span>{form.kategori}</span>
                  <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </button>
                {kategoriOpen && (
                  <div className="brief-select-menu">
                    {KATEGORI.map(k => (
                      <button
                        key={k}
                        className={`brief-select-item${form.kategori === k ? ' active' : ''}`}
                        onMouseDown={() => { setForm(prev => ({ ...prev, kategori: k })); setKategoriOpen(false) }}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Section>

          <Section title="1. Hipotesis Inti & Proposisi Nilai">
            <Field label="Masalah yang diselesaikan" k="masalah" area hint="penderitaan riil konsumen, 2 kalimat" />
            <Field label="Solusi yang ditawarkan" k="solusi" area />
            <Field label="Alasan mengapa sekarang" k="mengapaSekarang" area hint="tren, regulasi, kegagalan pemain lama" />
          </Section>

          <Section title="2. Klaim Target Pasar & Traksi">
            <Field label="Target konsumen spesifik" k="target" />
            <Field label="Estimasi ukuran pasar (SOM)" k="som" hint="angka realistis dalam rupiah atau unit" />
            <Field label="Bukti validasi awal" k="validasi" area hint="wawancara, preorder, survei, data kompetitor" />
          </Section>

          <Section title="3. Asumsi Unit Economics & Keuangan">
            <div className="brief-row">
              <Field label="Harga jual per unit" k="harga" hint="Rp" />
              <Field label="Biaya modal / COGS" k="cogs" hint="Rp per unit" />
            </div>
            <div className="brief-row">
              <Field label="Target CAC" k="cac" hint="Rp per pelanggan" />
              <Field label="Biaya operasional bulanan" k="opex" hint="Rp" />
            </div>
            <Field label="Target titik impas" k="breakeven" hint="berapa bulan atau transaksi" />
          </Section>

          <Section title="4. Alur Operasional & Pihak Ketiga">
            <Field label="Vendor kritis" k="vendor" hint="payment gateway, API, logistik, lisensi" />
            <Field label="Legalitas / izin khusus" k="legal" hint="OJK, sertifikasi data, hak cipta" />
            <Field label="Alur transaksi utama" k="alur" area hint="langkah 1 bayar sampai langkah 5 terima" />
          </Section>

          <Section title="5. Batasan Mutlak">
            <div className="brief-row">
              <Field label="Anggaran maksimal" k="anggaran" hint="Rp" />
              <Field label="Tenggat rilis" k="tenggat" hint="bulan/tahun" />
            </div>
            <Field label="Hal yang dilarang dikerjakan" k="larangan" area />
          </Section>
        </div>

        <footer className="brief-footer">
          <div className={`brief-status brief-status-${status.kind}`}>{status.text}</div>
          <button className="brief-submit" onClick={submit} disabled={status.kind === 'busy'}>
            <Icon name="rocket" size={12} />
            {status.kind === 'busy' ? 'MENGIRIM...' : 'KIRIM KE MEJA KETUA TIM'}
          </button>
        </footer>
      </aside>
    </>
  )
}

export default BriefDrawer
