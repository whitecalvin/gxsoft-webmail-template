"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale } from "next-intl";
import type { Locale } from "@/i18n/routing";

const copy = {
  ko: {
    title: "웹메일 API 연결", description: "TASTEMAIL 서버 설치가 이미 끝났다면, 이 개발 서버에서 사용할 메일 API 주소를 설정하세요.",
    label: "TASTEMAIL_API_URL", hint: "브라우저가 아닌 Next.js 서버에서 연결합니다. 같은 장비 또는 로컬 터널: http://127.0.0.1:6711",
    token: "설정 토큰", tokenHint: "이 개발 서버의 .env.development.local에 있는 GXWEBMAIL_CONNECTION_SETUP_TOKEN 값을 입력하세요.",
    warning: "다른 장비의 API에는 HTTPS 주소 또는 로컬 터널을 사용하세요. 사설망 HTTP 주소로 로그인 정보를 보내지 않습니다.",
    save: "연결 확인 후 저장", saving: "연결 확인 중…", saved: "설정이 저장되었습니다. 로그인 화면에서 다시 시도하세요.",
    connectionReady: "현재 설정된 API에 연결할 수 있습니다.", connectionUnreachable: "현재 설정된 API에 연결할 수 없습니다. 서버 또는 로컬 터널을 확인하세요.",
    connectionUnavailable: "현재 설정된 API가 일시적으로 응답하지 않습니다.", connectionInvalid: "현재 설정된 API 주소가 유효하지 않습니다.",
    connectionNotTastemail: "현재 주소에서 TASTEMAIL 상태 응답을 확인하지 못했습니다.",
    invalid_url: "경로·인증 정보가 없는 HTTPS, 로컬 HTTP 또는 사설 IPv4 HTTP 주소를 입력하세요.",
    not_tastemail: "주소가 TASTEMAIL API의 상태 응답을 반환하지 않았습니다.",
    unreachable: "Next.js 서버에서 해당 API 주소에 연결할 수 없습니다.",
    save_failed: "개발 환경 설정 파일을 저장하지 못했습니다.", forbidden: "이 설정은 로컬 개발 서버에서만 변경할 수 있습니다.",
    unauthorized: "설정 토큰을 확인하세요.",
    login: "로그인으로 이동", fallback: "연결을 확인하지 못했습니다. 주소와 서버 상태를 확인하세요.",
  },
  en: {
    title: "Webmail API connection", description: "If TASTEMAIL is already installed, configure the mail API used by this development server.",
    label: "TASTEMAIL_API_URL", hint: "The Next.js server connects to this address. Same host or local tunnel: http://127.0.0.1:6711",
    token: "Setup token", tokenHint: "Enter GXWEBMAIL_CONNECTION_SETUP_TOKEN from this development server's .env.development.local file.",
    warning: "Use HTTPS or a local tunnel for an API on another machine. Login credentials are never sent to a private-network HTTP origin.",
    save: "Check connection and save", saving: "Checking connection…", saved: "The setting was saved. Try signing in again.",
    connectionReady: "The configured API is reachable.", connectionUnreachable: "The configured API is unreachable. Check the server or local tunnel.",
    connectionUnavailable: "The configured API is temporarily unavailable.", connectionInvalid: "The configured API URL is invalid.",
    connectionNotTastemail: "The configured address did not return a TASTEMAIL health response.",
    invalid_url: "Enter an HTTPS, loopback HTTP or private IPv4 HTTP origin without a path or credentials.",
    not_tastemail: "The address did not return a TASTEMAIL API health response.",
    unreachable: "The Next.js server cannot reach this API address.",
    save_failed: "Could not save the development environment file.", forbidden: "Only a local development server can change this setting.",
    unauthorized: "Check the setup token.",
    login: "Go to login", fallback: "Could not verify the connection. Check the address and server status.",
  },
  de: {
    title: "Webmail-API-Verbindung", description: "Wenn TASTEMAIL bereits installiert ist, richten Sie die Mail-API für diesen Entwicklungsserver ein.",
    label: "TASTEMAIL_API_URL", hint: "Der Next.js-Server verbindet sich mit dieser Adresse. Gleicher Host oder lokaler Tunnel: http://127.0.0.1:6711",
    token: "Einrichtungstoken", tokenHint: "Geben Sie GXWEBMAIL_CONNECTION_SETUP_TOKEN aus der .env.development.local dieses Entwicklungsservers ein.",
    warning: "Verwenden Sie für eine API auf einem anderen Gerät HTTPS oder einen lokalen Tunnel. An private HTTP-Adressen werden keine Anmeldedaten gesendet.",
    save: "Verbindung prüfen und speichern", saving: "Verbindung wird geprüft…", saved: "Die Einstellung wurde gespeichert. Versuchen Sie erneut, sich anzumelden.",
    connectionReady: "Die konfigurierte API ist erreichbar.", connectionUnreachable: "Die konfigurierte API ist nicht erreichbar. Prüfen Sie den Server oder lokalen Tunnel.",
    connectionUnavailable: "Die konfigurierte API ist vorübergehend nicht verfügbar.", connectionInvalid: "Die konfigurierte API-Adresse ist ungültig.",
    connectionNotTastemail: "Diese Adresse liefert keine TASTEMAIL-Statusantwort.",
    invalid_url: "Geben Sie eine HTTPS-, lokale HTTP- oder private IPv4-HTTP-Adresse ohne Pfad und Zugangsdaten ein.",
    not_tastemail: "Die Adresse liefert keine TASTEMAIL-Statusantwort.", unreachable: "Der Next.js-Server kann diese API-Adresse nicht erreichen.",
    save_failed: "Die Entwicklungsumgebung konnte nicht gespeichert werden.", forbidden: "Diese Einstellung kann nur auf einem lokalen Entwicklungsserver geändert werden.",
    unauthorized: "Prüfen Sie das Einrichtungstoken.", login: "Zur Anmeldung", fallback: "Die Verbindung konnte nicht geprüft werden. Prüfen Sie Adresse und Serverstatus.",
  },
  es: {
    title: "Conexión con la API de correo", description: "Si TASTEMAIL ya está instalado, configure la API de correo de este servidor de desarrollo.",
    label: "TASTEMAIL_API_URL", hint: "El servidor Next.js se conecta a esta dirección. Mismo equipo o túnel local: http://127.0.0.1:6711",
    token: "Token de configuración", tokenHint: "Introduzca GXWEBMAIL_CONNECTION_SETUP_TOKEN del archivo .env.development.local de este servidor.",
    warning: "Use HTTPS o un túnel local para una API en otro equipo. No se envían credenciales por HTTP a redes privadas.",
    save: "Comprobar y guardar", saving: "Comprobando conexión…", saved: "La configuración se guardó. Vuelva a intentar iniciar sesión.",
    connectionReady: "Se puede acceder a la API configurada.", connectionUnreachable: "No se puede acceder a la API. Compruebe el servidor o túnel local.",
    connectionUnavailable: "La API configurada no está disponible temporalmente.", connectionInvalid: "La dirección de la API no es válida.",
    connectionNotTastemail: "La dirección no devolvió el estado de TASTEMAIL.",
    invalid_url: "Introduzca una dirección HTTPS, HTTP local o HTTP IPv4 privada sin ruta ni credenciales.",
    not_tastemail: "La dirección no devolvió el estado de TASTEMAIL.", unreachable: "El servidor Next.js no puede acceder a esta dirección.",
    save_failed: "No se pudo guardar el archivo de entorno de desarrollo.", forbidden: "Solo un servidor de desarrollo local puede cambiar esta configuración.",
    unauthorized: "Compruebe el token de configuración.", login: "Ir a inicio de sesión", fallback: "No se pudo comprobar la conexión. Revise la dirección y el estado del servidor.",
  },
  fr: {
    title: "Connexion à l’API de messagerie", description: "Si TASTEMAIL est déjà installé, configurez l’API utilisée par ce serveur de développement.",
    label: "TASTEMAIL_API_URL", hint: "Le serveur Next.js se connecte à cette adresse. Même hôte ou tunnel local : http://127.0.0.1:6711",
    token: "Jeton de configuration", tokenHint: "Saisissez GXWEBMAIL_CONNECTION_SETUP_TOKEN depuis le fichier .env.development.local de ce serveur.",
    warning: "Utilisez HTTPS ou un tunnel local pour une API sur un autre appareil. Aucun identifiant n’est envoyé via HTTP sur un réseau privé.",
    save: "Vérifier et enregistrer", saving: "Vérification de la connexion…", saved: "Le paramètre a été enregistré. Réessayez de vous connecter.",
    connectionReady: "L’API configurée est accessible.", connectionUnreachable: "L’API est inaccessible. Vérifiez le serveur ou le tunnel local.",
    connectionUnavailable: "L’API configurée est temporairement indisponible.", connectionInvalid: "L’adresse de l’API est invalide.",
    connectionNotTastemail: "Cette adresse n’a pas renvoyé l’état de TASTEMAIL.",
    invalid_url: "Saisissez une adresse HTTPS, HTTP locale ou HTTP IPv4 privée sans chemin ni identifiants.",
    not_tastemail: "L’adresse n’a pas renvoyé l’état de TASTEMAIL.", unreachable: "Le serveur Next.js ne peut pas joindre cette adresse.",
    save_failed: "Impossible d’enregistrer le fichier d’environnement de développement.", forbidden: "Seul un serveur de développement local peut modifier ce paramètre.",
    unauthorized: "Vérifiez le jeton de configuration.", login: "Aller à la connexion", fallback: "Connexion non vérifiée. Vérifiez l’adresse et l’état du serveur.",
  },
  it: {
    title: "Connessione API webmail", description: "Se TASTEMAIL è già installato, configura l’API di posta per questo server di sviluppo.",
    label: "TASTEMAIL_API_URL", hint: "Il server Next.js si connette a questo indirizzo. Stesso host o tunnel locale: http://127.0.0.1:6711",
    token: "Token di configurazione", tokenHint: "Inserisci GXWEBMAIL_CONNECTION_SETUP_TOKEN dal file .env.development.local di questo server.",
    warning: "Per un’API su un altro dispositivo usa HTTPS o un tunnel locale. Le credenziali non vengono inviate via HTTP su una rete privata.",
    save: "Verifica e salva", saving: "Verifica della connessione…", saved: "Impostazione salvata. Riprova ad accedere.",
    connectionReady: "L’API configurata è raggiungibile.", connectionUnreachable: "L’API non è raggiungibile. Controlla il server o il tunnel locale.",
    connectionUnavailable: "L’API configurata è temporaneamente non disponibile.", connectionInvalid: "L’indirizzo API non è valido.",
    connectionNotTastemail: "L’indirizzo non ha restituito lo stato di TASTEMAIL.",
    invalid_url: "Inserisci un indirizzo HTTPS, HTTP locale o HTTP IPv4 privato senza percorso né credenziali.",
    not_tastemail: "L’indirizzo non ha restituito lo stato di TASTEMAIL.", unreachable: "Il server Next.js non riesce a raggiungere questo indirizzo.",
    save_failed: "Impossibile salvare il file di ambiente di sviluppo.", forbidden: "Solo un server di sviluppo locale può modificare questa impostazione.",
    unauthorized: "Controlla il token di configurazione.", login: "Vai all’accesso", fallback: "Impossibile verificare la connessione. Controlla indirizzo e stato del server.",
  },
  pt: {
    title: "Ligação à API do webmail", description: "Se o TASTEMAIL já estiver instalado, configure a API de correio deste servidor de desenvolvimento.",
    label: "TASTEMAIL_API_URL", hint: "O servidor Next.js liga-se a este endereço. Mesmo anfitrião ou túnel local: http://127.0.0.1:6711",
    token: "Token de configuração", tokenHint: "Introduza GXWEBMAIL_CONNECTION_SETUP_TOKEN do ficheiro .env.development.local deste servidor.",
    warning: "Use HTTPS ou um túnel local para uma API noutro dispositivo. As credenciais não são enviadas por HTTP numa rede privada.",
    save: "Verificar e guardar", saving: "A verificar a ligação…", saved: "A configuração foi guardada. Tente iniciar sessão novamente.",
    connectionReady: "A API configurada está acessível.", connectionUnreachable: "A API está inacessível. Verifique o servidor ou o túnel local.",
    connectionUnavailable: "A API configurada está temporariamente indisponível.", connectionInvalid: "O endereço da API é inválido.",
    connectionNotTastemail: "Este endereço não devolveu o estado do TASTEMAIL.",
    invalid_url: "Introduza um endereço HTTPS, HTTP local ou HTTP IPv4 privado sem caminho nem credenciais.",
    not_tastemail: "O endereço não devolveu o estado do TASTEMAIL.", unreachable: "O servidor Next.js não consegue aceder a este endereço.",
    save_failed: "Não foi possível guardar o ficheiro de ambiente de desenvolvimento.", forbidden: "Só um servidor de desenvolvimento local pode alterar esta configuração.",
    unauthorized: "Verifique o token de configuração.", login: "Ir para o início de sessão", fallback: "Não foi possível verificar a ligação. Verifique o endereço e o estado do servidor.",
  },
  ja: {
    title: "WebメールAPI接続", description: "TASTEMAILのインストールが完了している場合、この開発サーバーで使用するメールAPIを設定します。",
    label: "TASTEMAIL_API_URL", hint: "接続するのはブラウザーではなくNext.jsサーバーです。同じホストまたはローカルトンネル: http://127.0.0.1:6711",
    token: "設定トークン", tokenHint: "この開発サーバーの.env.development.localにあるGXWEBMAIL_CONNECTION_SETUP_TOKENを入力してください。",
    warning: "別の端末のAPIにはHTTPSまたはローカルトンネルを使用してください。プライベートネットワークのHTTPへログイン情報は送信しません。",
    save: "接続を確認して保存", saving: "接続を確認中…", saved: "設定を保存しました。ログイン画面で再度お試しください。",
    connectionReady: "設定済みのAPIに接続できます。", connectionUnreachable: "設定済みのAPIに接続できません。サーバーまたはローカルトンネルを確認してください。",
    connectionUnavailable: "設定済みのAPIは一時的に利用できません。", connectionInvalid: "設定済みのAPIアドレスが無効です。",
    connectionNotTastemail: "このアドレスからTASTEMAILの状態応答を確認できませんでした。",
    invalid_url: "パスや認証情報を含まないHTTPS、ローカルHTTP、またはプライベートIPv4 HTTPアドレスを入力してください。",
    not_tastemail: "このアドレスからTASTEMAILの状態応答を確認できませんでした。", unreachable: "Next.jsサーバーからこのAPIアドレスに接続できません。",
    save_failed: "開発環境設定ファイルを保存できませんでした。", forbidden: "この設定を変更できるのはローカルの開発サーバーだけです。",
    unauthorized: "設定トークンを確認してください。", login: "ログインへ", fallback: "接続を確認できませんでした。アドレスとサーバーの状態を確認してください。",
  },
  zh: {
    title: "Webmail API 连接", description: "如果已安装 TASTEMAIL，请配置此开发服务器使用的邮件 API。",
    label: "TASTEMAIL_API_URL", hint: "连接由 Next.js 服务器发起，而不是浏览器。同一主机或本地隧道：http://127.0.0.1:6711",
    token: "配置令牌", tokenHint: "请输入此开发服务器的 .env.development.local 中的 GXWEBMAIL_CONNECTION_SETUP_TOKEN。",
    warning: "其他设备上的 API 请使用 HTTPS 或本地隧道。不会通过专用网络 HTTP 发送登录凭据。",
    save: "检查连接并保存", saving: "正在检查连接…", saved: "设置已保存。请返回登录页面重试。",
    connectionReady: "可以连接到已配置的 API。", connectionUnreachable: "无法连接到 API。请检查服务器或本地隧道。",
    connectionUnavailable: "已配置的 API 暂时不可用。", connectionInvalid: "API 地址无效。",
    connectionNotTastemail: "此地址未返回 TASTEMAIL 状态响应。",
    invalid_url: "请输入不含路径和凭据的 HTTPS、本地 HTTP 或专用 IPv4 HTTP 地址。",
    not_tastemail: "此地址未返回 TASTEMAIL 状态响应。", unreachable: "Next.js 服务器无法连接到此 API 地址。",
    save_failed: "无法保存开发环境配置文件。", forbidden: "只有本地开发服务器才能更改此设置。",
    unauthorized: "请检查配置令牌。", login: "前往登录", fallback: "无法验证连接。请检查地址和服务器状态。",
  },
  "zh-hant": {
    title: "Webmail API 連線", description: "若已安裝 TASTEMAIL，請設定此開發伺服器使用的郵件 API。",
    label: "TASTEMAIL_API_URL", hint: "連線由 Next.js 伺服器發起，而非瀏覽器。同一主機或本機通道：http://127.0.0.1:6711",
    token: "設定權杖", tokenHint: "請輸入此開發伺服器的 .env.development.local 中的 GXWEBMAIL_CONNECTION_SETUP_TOKEN。",
    warning: "其他裝置上的 API 請使用 HTTPS 或本機通道。不會透過私人網路 HTTP 傳送登入憑證。",
    save: "檢查連線並儲存", saving: "正在檢查連線…", saved: "設定已儲存。請返回登入頁面重試。",
    connectionReady: "可以連線至已設定的 API。", connectionUnreachable: "無法連線至 API。請檢查伺服器或本機通道。",
    connectionUnavailable: "已設定的 API 暫時無法使用。", connectionInvalid: "API 位址無效。",
    connectionNotTastemail: "此位址未回傳 TASTEMAIL 狀態回應。",
    invalid_url: "請輸入不含路徑與憑證的 HTTPS、本機 HTTP 或私人 IPv4 HTTP 位址。",
    not_tastemail: "此位址未回傳 TASTEMAIL 狀態回應。", unreachable: "Next.js 伺服器無法連線至此 API 位址。",
    save_failed: "無法儲存開發環境設定檔。", forbidden: "只有本機開發伺服器才能變更此設定。",
    unauthorized: "請檢查設定權杖。", login: "前往登入", fallback: "無法驗證連線。請檢查位址與伺服器狀態。",
  },
};

const localizedCopy: Record<Locale, typeof copy.en> = copy;

export function DevApiConnectionSetup() {
  const locale = useLocale();
  const t = localizedCopy[locale as Locale] ?? copy.en;
  const [apiUrl, setApiUrl] = useState("http://127.0.0.1:6711");
  const [setupToken, setSetupToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(false);
  const [configuredUrl, setConfiguredUrl] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<"ready" | "unreachable" | "unavailable" | "invalid_url" | "not_tastemail" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/mail/setup/connection", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const result: { apiUrl?: string; connectionStatus?: typeof connectionStatus } = await response.json();
        if (!controller.signal.aborted) {
          setAvailable(true);
          if (result.apiUrl) { setApiUrl(result.apiUrl); setConfiguredUrl(result.apiUrl); }
          setConnectionStatus(result.connectionStatus ?? null);
        }
      }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch("/api/mail/setup/connection", {
        method: "POST", headers: { "content-type": "application/json", "x-gxwebmail-setup-token": setupToken }, body: JSON.stringify({ apiUrl: apiUrl.trim() }),
      });
      const result: { status?: string; apiUrl?: string } = await response.json();
      if (response.ok && result.status === "saved") {
        setApiUrl(result.apiUrl ?? apiUrl.trim());
        setConfiguredUrl(result.apiUrl ?? apiUrl.trim());
        setConnectionStatus("ready");
        setSetupToken("");
        setSaved(true);
      } else {
        setError(t[result.status as keyof typeof t] ?? t.fallback);
      }
    } catch { setError(t.fallback); }
    finally { setSaving(false); }
  };

  if (!available) return null;

  return <section aria-labelledby="api-connection-heading" className="space-y-5 border-t border-(--border-app) p-5 sm:p-8">
    <div><h2 id="api-connection-heading" className="text-lg font-semibold">{t.title}</h2><p className="mt-2 text-sm text-(--text-muted)">{t.description}</p></div>
    <form onSubmit={submit} className="space-y-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">{t.label}
        <input type="url" value={apiUrl} onChange={(event) => { setApiUrl(event.target.value); setSaved(false); setError(""); }} required spellCheck={false}
          className="h-11 rounded-lg border border-(--border-app) bg-background px-3 font-mono text-sm outline-none focus:border-(--color-primary)" />
      </label>
      <p className="text-xs text-(--text-muted)">{t.hint}</p>
      {connectionStatus && apiUrl.trim() === configuredUrl ? <p role="status" className={`text-xs ${connectionStatus === "ready" ? "text-(--status-success)" : "text-(--status-warning)"}`}>
        {({ ready: t.connectionReady, unreachable: t.connectionUnreachable, unavailable: t.connectionUnavailable, invalid_url: t.connectionInvalid, not_tastemail: t.connectionNotTastemail })[connectionStatus]}
      </p> : null}
      <label className="flex flex-col gap-1.5 text-sm font-medium">{t.token}
        <input type="password" value={setupToken} onChange={(event) => { setSetupToken(event.target.value); setError(""); }} required autoComplete="off"
          className="h-11 rounded-lg border border-(--border-app) bg-background px-3 text-sm outline-none focus:border-(--color-primary)" />
      </label>
      <p className="text-xs text-(--text-muted)">{t.tokenHint}</p>
      <p className="rounded-lg bg-(--status-warning-bg) p-3 text-xs text-(--status-warning)">{t.warning}</p>
      {error ? <p role="alert" className="text-sm text-(--status-danger)">{error}</p> : null}
      {saved ? <p role="status" className="text-sm text-(--status-success)">{t.saved}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="rounded-lg bg-(--color-primary-solid) px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? t.saving : t.save}</button>
        {saved ? <a href={`/${locale}/login`} className="rounded-lg border border-(--border-app) px-4 py-2.5 text-sm font-semibold">{t.login}</a> : null}
      </div>
    </form>
  </section>;
}
