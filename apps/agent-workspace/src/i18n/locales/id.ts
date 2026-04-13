import messages from "./modules/id/messages";
import skillAssist from "./modules/id/skill-assist";
import tasks from "./modules/id/tasks";
import wa from "./modules/id/wa";

export default {
  ...messages,
  ...tasks,
  nav: {
    home: "Beranda",
    messages: "Pesan",
    tasks: "Tugas",
    whatsapp: "WA"
  },
  home: {
    title: "Ringkasan Workspace",
    cards: {
      unread: "Pesan Belum Dibaca",
      tasks: "Tugas Saya",
      urgent: "Prioritas Tinggi"
    },
    unreadSection: "Percakapan Belum Dibaca",
    taskSection: "Tugas Aktif",
    openMessages: "Buka Halaman Pesan",
    openTasks: "Buka Halaman Tugas",
    emptyUnread: "Tidak ada percakapan belum dibaca saat ini",
    emptyTasks: "Tidak ada tugas aktif saat ini",
    unknown: "Pelanggan Tidak Dikenal",
    noMessage: "(Tidak ada pesan)"
  },
  login: {
    subtitle: "Hanya agen dengan akses aktif yang dapat masuk",
    emailLabel: "Email",
    emailPlaceholder: "Masukkan email",
    passwordLabel: "Kata sandi",
    passwordPlaceholder: "Masukkan kata sandi",
    loading: "Masuk…",
    submit: "Masuk ke Workspace",
    noAgentAccess: "Akun tidak memiliki akses workspace agen atau WhatsApp"
  },
  header: {
    title: "NuyChat Workspace",
    agent: "Agen",
    unbound: "Tidak terikat",
    socket: {
      connected: "Terhubung",
      error: "Koneksi gagal",
      disconnected: "Terputus",
      connecting: "Menghubungkan…"
    },
    language: "Bahasa",
    logout: "Keluar"
  },
  ...skillAssist
  ,
  ...wa
} as const;
