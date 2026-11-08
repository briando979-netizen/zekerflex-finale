import type { LanguageCode } from "./detector";

export interface TranslationKey {
  [key: string]: string | TranslationKey;
}

type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

const TRANSLATIONS: Record<LanguageCode, DeepPartial<TranslationKey>> = {
  "en-US": {
    common: {
      welcome: "Welcome to ZekerFlex",
      hello: "Hello",
      goodbye: "Goodbye",
      confirm: "Confirm",
      cancel: "Cancel",
      save: "Save",
      delete: "Delete",
      loading: "Loading...",
      error: "An error occurred",
      success: "Success",
    },
    dashboard: {
      title: "Dashboard",
      earnings: "Earnings",
      jobs: "Jobs",
      messages: "Messages",
    },
  },
  "en-GB": {
    common: {
      welcome: "Welcome to ZekerFlex",
      hello: "Hello",
      goodbye: "Goodbye",
      confirm: "Confirm",
      cancel: "Cancel",
      save: "Save",
      delete: "Delete",
      loading: "Loading...",
      error: "An error occurred",
      success: "Success",
    },
  },
  "de": {
    common: {
      welcome: "Willkommen bei ZekerFlex",
      hello: "Hallo",
      goodbye: "Auf Wiedersehen",
      confirm: "Bestätigen",
      cancel: "Abbrechen",
      save: "Speichern",
      delete: "Löschen",
      loading: "Lädt...",
      error: "Ein Fehler ist aufgetreten",
      success: "Erfolg",
    },
  },
  "fr": {
    common: {
      welcome: "Bienvenue sur ZekerFlex",
      hello: "Bonjour",
      goodbye: "Au revoir",
      confirm: "Confirmer",
      cancel: "Annuler",
      save: "Enregistrer",
      delete: "Supprimer",
      loading: "Chargement...",
      error: "Une erreur s'est produite",
      success: "Succès",
    },
  },
  "es": {
    common: {
      welcome: "Bienvenido a ZekerFlex",
      hello: "Hola",
      goodbye: "Adiós",
      confirm: "Confirmar",
      cancel: "Cancelar",
      save: "Guardar",
      delete: "Eliminar",
      loading: "Cargando...",
      error: "Ocurrió un error",
      success: "Éxito",
    },
  },
  "pt-BR": {
    common: {
      welcome: "Bem-vindo ao ZekerFlex",
      hello: "Olá",
      goodbye: "Adeus",
      confirm: "Confirmar",
      cancel: "Cancelar",
      save: "Salvar",
      delete: "Excluir",
      loading: "Carregando...",
      error: "Ocorreu um erro",
      success: "Sucesso",
    },
  },
  "ja": {
    common: {
      welcome: "ZekerFlexへようこそ",
      hello: "こんにちは",
      goodbye: "さようなら",
      confirm: "確認",
      cancel: "キャンセル",
      save: "保存",
      delete: "削除",
      loading: "読み込み中...",
      error: "エラーが発生しました",
      success: "成功",
    },
  },
  "zh-CN": {
    common: {
      welcome: "欢迎来到ZekerFlex",
      hello: "你好",
      goodbye: "再见",
      confirm: "确认",
      cancel: "取消",
      save: "保存",
      delete: "删除",
      loading: "加载中...",
      error: "发生错误",
      success: "成功",
    },
  },
  "ar": {
    common: {
      welcome: "أهلا وسهلا بك في ZekerFlex",
      hello: "مرحبا",
      goodbye: "وداعا",
      confirm: "تأكيد",
      cancel: "إلغاء",
      save: "حفظ",
      delete: "حذف",
      loading: "جاري التحميل...",
      error: "حدث خطأ",
      success: "نجح",
    },
  },
  "nl": { common: { welcome: "Welkom bij ZekerFlex", hello: "Hallo" } },
  "en-AU": { common: { welcome: "Welcome to ZekerFlex", hello: "G'day" } },
  "en-CA": { common: { welcome: "Welcome to ZekerFlex", hello: "Hey there" } },
  "it": { common: { welcome: "Benvenuto in ZekerFlex", hello: "Ciao" } },
  "sv": { common: { welcome: "Välkommen till ZekerFlex", hello: "Hej" } },
  "da": { common: { welcome: "Velkommen til ZekerFlex", hello: "Hej" } },
  "no": { common: { welcome: "Velkommen til ZekerFlex", hello: "Hallo" } },
  "pt-PT": { common: { welcome: "Bem-vindo ao ZekerFlex", hello: "Olá" } },
  "pl": { common: { welcome: "Witaj w ZekerFlex", hello: "Cześć" } },
  "cs": { common: { welcome: "Vítejte v ZekerFlex", hello: "Ahoj" } },
  "hu": { common: { welcome: "Üdvözlünk a ZekerFlexben", hello: "Halló" } },
  "ru": { common: { welcome: "Добро пожаловать в ZekerFlex", hello: "Привет" } },
  "uk": { common: { welcome: "Ласкаво просимо до ZekerFlex", hello: "Привіт" } },
  "he": { common: { welcome: "ברוכים הבאים ל-ZekerFlex", hello: "שלום" } },
  "zh-TW": { common: { welcome: "歡迎來到ZekerFlex", hello: "你好" } },
  "ko": { common: { welcome: "ZekerFlex에 오신 것을 환영합니다", hello: "안녕하세요" } },
  "th": { common: { welcome: "ยินดีต้อนรับสู่ ZekerFlex", hello: "สวัสดี" } },
  "vi": { common: { welcome: "Chào mừng đến ZekerFlex", hello: "Xin chào" } },
  "id": { common: { welcome: "Selamat datang di ZekerFlex", hello: "Halo" } },
  "tr": { common: { welcome: "ZekerFlex'e hoş geldiniz", hello: "Merhaba" } },
  "el": { common: { welcome: "Καλώς ήρθατε στο ZekerFlex", hello: "Γεια σας" } },
};

export function getTranslation(lang: LanguageCode, key: string): string {
  const keys = key.split(".");
  let value: any = TRANSLATIONS[lang] || TRANSLATIONS["en-US"];

  for (const k of keys) {
    value = value?.[k];
  }

  return value || key;
}

export function t(lang: LanguageCode) {
  return (key: string, defaults?: Record<string, string>): string => {
    let translation = getTranslation(lang, key);

    if (defaults) {
      for (const [k, v] of Object.entries(defaults)) {
        translation = translation.replace(`{${k}}`, v);
      }
    }

    return translation;
  };
}
