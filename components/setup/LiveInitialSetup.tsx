"use client";
import { CustomSelect } from "@/components/ui/CustomSelect";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { useRouter } from "@/i18n/navigation";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, ShieldCheck } from "lucide-react";
import type { InitialSetupInput, InitialSetupStatus } from "@/lib/tastemail/initial-setup";
import { DevApiConnectionSetup } from "@/components/setup/DevApiConnectionSetup";

const defaultInput: InitialSetupInput = {
  setupToken: "", hostname: "", databaseHost: "127.0.0.1", databasePort: 5432,
  databaseUser: "tastemail", databaseName: "tastemail_db", databasePassword: "",
  createLocalDatabase: false, databaseAdminUser: "postgres", databaseAdminPassword: "",
  adminAddress: "", password: "", passwordConfirmation: "", dkimSelector: "mail",
  webmailPort: 7540, webmailListenHost: "127.0.0.1", apiPort: 6711, apiListenHost: "127.0.0.1",
  webmailHostname: "", webmailProxyEngine: "auto", cloudflareApiToken: "", confirmed: false,
};

const copy = {
  ko: {
    title: "TASTEMAIL 최초 설치", intro: "설치 서비스가 준비된 호스트에서 메일 서버와 최초 관리자를 설정합니다.",
    steps: ["설치 토큰", "서버", "PostgreSQL", "관리자", "검토"], next: "다음", back: "이전", submit: "초기 설정 시작",
    token: "일회용 설치 토큰", tokenHelp: "설치 서버의 bootstrap-token 파일에서 확인하세요. 설치 완료 후 삭제됩니다.",
    hostname: "공개 메일 호스트", webmailHost: "공개 웹메일 호스트 (선택)", proxy: "웹 서버 엔진", cloudflare: "Cloudflare DNS 토큰 (선택)",
    webmailPort: "웹메일 포트", apiPort: "메일 API 포트", webmailListen: "웹메일 수신 주소", apiListen: "API 수신 주소",
    dbHost: "DB 호스트", dbPort: "DB 포트", dbUser: "DB 사용자", dbName: "DB 이름", dbPassword: "DB 사용자 비밀번호",
    createDb: "로컬 DB 사용자·데이터베이스가 없으면 생성", dbAdmin: "PostgreSQL 관리자", dbAdminPassword: "PostgreSQL 관리자 비밀번호",
    admin: "최초 관리자 이메일", password: "관리자 비밀번호 (12자 이상)", passwordAgain: "관리자 비밀번호 확인", selector: "DKIM selector",
    confirm: "선택한 PostgreSQL에 스키마와 최초 관리자 계정을 생성하는 작업을 승인합니다.",
    review: "비밀값은 검토 화면에 표시하지 않습니다. 설치 요청은 제한된 권한의 일회성 파일로 전달됩니다.",
    processing: "설치 서비스가 설정을 적용하고 있습니다. 상태를 자동으로 확인합니다.", failed: "설치 적용에 실패했습니다. 서버 상태와 입력값을 확인한 후 다시 시도하세요.",
    serviceFailed: "설정은 완료됐지만 메일 서버 시작에 실패했습니다. 서버 서비스 상태를 확인하세요.",
    unavailable: "이 Next.js 서버에는 TASTEMAIL 초기 설치 서비스가 연결되지 않았습니다. 설치 패키지의 환경 설정이 필요합니다.",
    unavailableTitle: "설치 서비스 없음", login: "로그인으로 이동", loading: "설치 상태 확인 중…", invalidPassword: "관리자 비밀번호 확인이 일치하지 않습니다.",
    invalidRequest: "입력값을 확인하세요.", unauthorized: "설치 토큰이 올바르지 않습니다.", busy: "설치 요청이 이미 처리 중입니다.",
    configured: "초기 설정이 완료되었습니다.", forbidden: "HTTPS 또는 로컬 주소에서 이 화면을 열어야 합니다.",
  },
  en: {
    title: "TASTEMAIL initial setup", intro: "Configure the mail server and first administrator on a host with the installation service.",
    steps: ["Setup token", "Server", "PostgreSQL", "Administrator", "Review"], next: "Next", back: "Back", submit: "Start setup",
    token: "One-time setup token", tokenHelp: "Read the bootstrap-token file on the installation host. It is removed after setup.",
    hostname: "Public mail hostname", webmailHost: "Public webmail hostname (optional)", proxy: "Web server engine", cloudflare: "Cloudflare DNS token (optional)",
    webmailPort: "Webmail port", apiPort: "Mail API port", webmailListen: "Webmail listen address", apiListen: "API listen address",
    dbHost: "Database host", dbPort: "Database port", dbUser: "Database user", dbName: "Database name", dbPassword: "Database user password",
    createDb: "Create the local database and user if missing", dbAdmin: "PostgreSQL administrator", dbAdminPassword: "PostgreSQL administrator password",
    admin: "First administrator email", password: "Administrator password (12+ characters)", passwordAgain: "Confirm administrator password", selector: "DKIM selector",
    confirm: "I authorize creating the schema and first administrator account in the selected PostgreSQL database.",
    review: "Secrets are not displayed here. The request is passed through a restricted one-time file.",
    processing: "The installation service is applying the configuration. Status refreshes automatically.", failed: "Setup failed. Check the service status and input, then retry.",
    serviceFailed: "Configuration completed, but the mail service failed to start. Check the service state.",
    unavailable: "This Next.js server is not connected to the TASTEMAIL installation service. Package environment settings are required.",
    unavailableTitle: "Setup service unavailable", login: "Go to login", loading: "Checking setup status…", invalidPassword: "Administrator passwords do not match.",
    invalidRequest: "Check the input values.", unauthorized: "The setup token is incorrect.", busy: "A setup request is already being processed.",
    configured: "Initial setup is complete.", forbidden: "Open this page over HTTPS or from a local address.",
  },
  de: {
    title: "TASTEMAIL-Ersteinrichtung", intro: "Richten Sie den Mailserver und den ersten Administrator auf einem Host mit Installationsdienst ein.",
    steps: ["Einrichtungstoken", "Server", "PostgreSQL", "Administrator", "Prüfen"], next: "Weiter", back: "Zurück", submit: "Einrichtung starten",
    token: "Einmaliges Einrichtungstoken", tokenHelp: "Lesen Sie die Datei bootstrap-token auf dem Installationshost. Sie wird nach der Einrichtung gelöscht.",
    hostname: "Öffentlicher Mail-Hostname", webmailHost: "Öffentlicher Webmail-Hostname (optional)", proxy: "Webserver", cloudflare: "Cloudflare-DNS-Token (optional)",
    webmailPort: "Webmail-Port", apiPort: "Mail-API-Port", webmailListen: "Webmail-Bind-Adresse", apiListen: "API-Bind-Adresse",
    dbHost: "Datenbank-Host", dbPort: "Datenbank-Port", dbUser: "Datenbankbenutzer", dbName: "Datenbankname", dbPassword: "Datenbankpasswort",
    createDb: "Lokale Datenbank und Benutzer bei Bedarf erstellen", dbAdmin: "PostgreSQL-Administrator", dbAdminPassword: "PostgreSQL-Administratorpasswort",
    admin: "E-Mail des ersten Administrators", password: "Administratorpasswort (mind. 12 Zeichen)", passwordAgain: "Administratorpasswort bestätigen", selector: "DKIM-Selektor",
    confirm: "Ich stimme der Erstellung des Schemas und des ersten Administratorkontos in der ausgewählten PostgreSQL-Datenbank zu.",
    review: "Geheime Werte werden hier nicht angezeigt. Die Anfrage wird über eine geschützte Einmaldatei übermittelt.",
    processing: "Der Installationsdienst wendet die Einstellungen an. Der Status wird automatisch aktualisiert.", failed: "Einrichtung fehlgeschlagen. Prüfen Sie Dienststatus und Eingaben und versuchen Sie es erneut.",
    serviceFailed: "Die Konfiguration ist abgeschlossen, aber der Maildienst konnte nicht starten. Prüfen Sie den Dienststatus.",
    unavailable: "Dieser Next.js-Server ist nicht mit dem TASTEMAIL-Installationsdienst verbunden. Die Paket-Umgebungsvariablen müssen eingerichtet sein.",
    unavailableTitle: "Installationsdienst nicht verfügbar", login: "Zur Anmeldung", loading: "Einrichtungsstatus wird geprüft…", invalidPassword: "Die Administratorpasswörter stimmen nicht überein.",
    invalidRequest: "Prüfen Sie die Eingaben.", unauthorized: "Das Einrichtungstoken ist falsch.", busy: "Eine Einrichtungsanfrage wird bereits verarbeitet.",
    configured: "Die Ersteinrichtung ist abgeschlossen.", forbidden: "Öffnen Sie diese Seite über HTTPS oder eine lokale Adresse.",
  },
  es: {
    title: "Configuración inicial de TASTEMAIL", intro: "Configure el servidor de correo y el primer administrador en un equipo con el servicio de instalación.",
    steps: ["Token de configuración", "Servidor", "PostgreSQL", "Administrador", "Revisión"], next: "Siguiente", back: "Atrás", submit: "Iniciar configuración",
    token: "Token de configuración de un solo uso", tokenHelp: "Consulte el archivo bootstrap-token en el equipo de instalación. Se elimina al terminar.",
    hostname: "Nombre público del servidor de correo", webmailHost: "Nombre público del webmail (opcional)", proxy: "Servidor web", cloudflare: "Token de DNS de Cloudflare (opcional)",
    webmailPort: "Puerto del webmail", apiPort: "Puerto de la API de correo", webmailListen: "Dirección de escucha del webmail", apiListen: "Dirección de escucha de la API",
    dbHost: "Servidor de base de datos", dbPort: "Puerto de base de datos", dbUser: "Usuario de base de datos", dbName: "Nombre de base de datos", dbPassword: "Contraseña de base de datos",
    createDb: "Crear la base de datos y el usuario local si no existen", dbAdmin: "Administrador de PostgreSQL", dbAdminPassword: "Contraseña del administrador de PostgreSQL",
    admin: "Correo del primer administrador", password: "Contraseña del administrador (12 caracteres o más)", passwordAgain: "Confirmar contraseña", selector: "Selector DKIM",
    confirm: "Autorizo la creación del esquema y la primera cuenta de administrador en la base de datos PostgreSQL seleccionada.",
    review: "Los valores secretos no se muestran aquí. La solicitud se entrega mediante un archivo de uso único con acceso restringido.",
    processing: "El servicio de instalación está aplicando la configuración. El estado se actualiza automáticamente.", failed: "Falló la configuración. Revise el servicio y los datos y vuelva a intentarlo.",
    serviceFailed: "La configuración terminó, pero el servicio de correo no pudo iniciarse. Compruebe su estado.",
    unavailable: "Este servidor Next.js no está conectado al servicio de instalación de TASTEMAIL. Se requiere la configuración del paquete.",
    unavailableTitle: "Servicio de instalación no disponible", login: "Ir a inicio de sesión", loading: "Comprobando el estado…", invalidPassword: "Las contraseñas del administrador no coinciden.",
    invalidRequest: "Revise los datos introducidos.", unauthorized: "El token de configuración es incorrecto.", busy: "Ya se está procesando una solicitud de configuración.",
    configured: "La configuración inicial ha terminado.", forbidden: "Abra esta página mediante HTTPS o desde una dirección local.",
  },
  fr: {
    title: "Configuration initiale de TASTEMAIL", intro: "Configurez le serveur de messagerie et le premier administrateur sur un hôte disposant du service d’installation.",
    steps: ["Jeton", "Serveur", "PostgreSQL", "Administrateur", "Vérification"], next: "Suivant", back: "Retour", submit: "Démarrer la configuration",
    token: "Jeton de configuration à usage unique", tokenHelp: "Consultez le fichier bootstrap-token sur l’hôte d’installation. Il est supprimé après la configuration.",
    hostname: "Nom d’hôte public du courrier", webmailHost: "Nom d’hôte public du webmail (facultatif)", proxy: "Serveur web", cloudflare: "Jeton DNS Cloudflare (facultatif)",
    webmailPort: "Port du webmail", apiPort: "Port de l’API de messagerie", webmailListen: "Adresse d’écoute du webmail", apiListen: "Adresse d’écoute de l’API",
    dbHost: "Hôte de la base de données", dbPort: "Port de la base de données", dbUser: "Utilisateur de la base", dbName: "Nom de la base", dbPassword: "Mot de passe de la base",
    createDb: "Créer la base et l’utilisateur locaux s’ils n’existent pas", dbAdmin: "Administrateur PostgreSQL", dbAdminPassword: "Mot de passe de l’administrateur PostgreSQL",
    admin: "Adresse du premier administrateur", password: "Mot de passe administrateur (12 caractères minimum)", passwordAgain: "Confirmer le mot de passe", selector: "Sélecteur DKIM",
    confirm: "J’autorise la création du schéma et du premier compte administrateur dans la base PostgreSQL sélectionnée.",
    review: "Les secrets ne sont pas affichés ici. La demande passe par un fichier à usage unique aux accès restreints.",
    processing: "Le service d’installation applique la configuration. L’état est actualisé automatiquement.", failed: "Échec de la configuration. Vérifiez le service et les valeurs saisies, puis réessayez.",
    serviceFailed: "La configuration est terminée, mais le service de messagerie n’a pas démarré. Vérifiez son état.",
    unavailable: "Ce serveur Next.js n’est pas relié au service d’installation TASTEMAIL. Les paramètres du paquet sont requis.",
    unavailableTitle: "Service d’installation indisponible", login: "Aller à la connexion", loading: "Vérification de l’état…", invalidPassword: "Les mots de passe administrateur ne correspondent pas.",
    invalidRequest: "Vérifiez les valeurs saisies.", unauthorized: "Le jeton de configuration est incorrect.", busy: "Une demande de configuration est déjà en cours.",
    configured: "La configuration initiale est terminée.", forbidden: "Ouvrez cette page en HTTPS ou depuis une adresse locale.",
  },
  it: {
    title: "Configurazione iniziale di TASTEMAIL", intro: "Configura il server di posta e il primo amministratore su un host con il servizio di installazione.",
    steps: ["Token", "Server", "PostgreSQL", "Amministratore", "Verifica"], next: "Avanti", back: "Indietro", submit: "Avvia configurazione",
    token: "Token di configurazione monouso", tokenHelp: "Leggi il file bootstrap-token sull’host di installazione. Viene eliminato al termine.",
    hostname: "Host pubblico della posta", webmailHost: "Host pubblico del webmail (facoltativo)", proxy: "Server web", cloudflare: "Token DNS Cloudflare (facoltativo)",
    webmailPort: "Porta webmail", apiPort: "Porta API posta", webmailListen: "Indirizzo di ascolto webmail", apiListen: "Indirizzo di ascolto API",
    dbHost: "Host database", dbPort: "Porta database", dbUser: "Utente database", dbName: "Nome database", dbPassword: "Password utente database",
    createDb: "Crea database e utente locali se mancanti", dbAdmin: "Amministratore PostgreSQL", dbAdminPassword: "Password amministratore PostgreSQL",
    admin: "Email del primo amministratore", password: "Password amministratore (almeno 12 caratteri)", passwordAgain: "Conferma password", selector: "Selettore DKIM",
    confirm: "Autorizzo la creazione dello schema e del primo account amministratore nel database PostgreSQL selezionato.",
    review: "I valori segreti non vengono mostrati qui. La richiesta passa tramite un file monouso ad accesso limitato.",
    processing: "Il servizio di installazione applica la configurazione. Lo stato si aggiorna automaticamente.", failed: "Configurazione non riuscita. Controlla lo stato del servizio e i dati, poi riprova.",
    serviceFailed: "La configurazione è terminata, ma il servizio di posta non si è avviato. Controllane lo stato.",
    unavailable: "Questo server Next.js non è collegato al servizio di installazione TASTEMAIL. Servono le impostazioni del pacchetto.",
    unavailableTitle: "Servizio di installazione non disponibile", login: "Vai all’accesso", loading: "Verifica dello stato…", invalidPassword: "Le password dell’amministratore non corrispondono.",
    invalidRequest: "Controlla i dati inseriti.", unauthorized: "Il token di configurazione non è corretto.", busy: "Una richiesta di configurazione è già in corso.",
    configured: "La configurazione iniziale è completa.", forbidden: "Apri questa pagina tramite HTTPS o da un indirizzo locale.",
  },
  pt: {
    title: "Configuração inicial do TASTEMAIL", intro: "Configure o servidor de correio e o primeiro administrador num anfitrião com o serviço de instalação.",
    steps: ["Token", "Servidor", "PostgreSQL", "Administrador", "Revisão"], next: "Seguinte", back: "Voltar", submit: "Iniciar configuração",
    token: "Token de configuração de utilização única", tokenHelp: "Consulte o ficheiro bootstrap-token no anfitrião de instalação. É removido após a configuração.",
    hostname: "Nome público do servidor de correio", webmailHost: "Nome público do webmail (opcional)", proxy: "Servidor web", cloudflare: "Token DNS Cloudflare (opcional)",
    webmailPort: "Porta do webmail", apiPort: "Porta da API de correio", webmailListen: "Endereço de escuta do webmail", apiListen: "Endereço de escuta da API",
    dbHost: "Anfitrião da base de dados", dbPort: "Porta da base de dados", dbUser: "Utilizador da base de dados", dbName: "Nome da base de dados", dbPassword: "Palavra-passe da base de dados",
    createDb: "Criar a base de dados e o utilizador locais se não existirem", dbAdmin: "Administrador PostgreSQL", dbAdminPassword: "Palavra-passe do administrador PostgreSQL",
    admin: "Email do primeiro administrador", password: "Palavra-passe do administrador (mínimo 12 caracteres)", passwordAgain: "Confirmar palavra-passe", selector: "Seletor DKIM",
    confirm: "Autorizo a criação do esquema e da primeira conta de administrador na base de dados PostgreSQL selecionada.",
    review: "Os valores secretos não são apresentados aqui. O pedido é enviado através de um ficheiro de utilização única com acesso restrito.",
    processing: "O serviço de instalação está a aplicar a configuração. O estado é atualizado automaticamente.", failed: "A configuração falhou. Verifique o serviço e os dados introduzidos e tente novamente.",
    serviceFailed: "A configuração terminou, mas o serviço de correio não iniciou. Verifique o estado do serviço.",
    unavailable: "Este servidor Next.js não está ligado ao serviço de instalação TASTEMAIL. São necessárias as definições do pacote.",
    unavailableTitle: "Serviço de instalação indisponível", login: "Ir para o início de sessão", loading: "A verificar o estado…", invalidPassword: "As palavras-passe do administrador não coincidem.",
    invalidRequest: "Verifique os dados introduzidos.", unauthorized: "O token de configuração está incorreto.", busy: "Já está a ser processado um pedido de configuração.",
    configured: "A configuração inicial está concluída.", forbidden: "Abra esta página por HTTPS ou a partir de um endereço local.",
  },
  ja: {
    title: "TASTEMAIL初期設定", intro: "インストールサービスが利用できるホストで、メールサーバーと最初の管理者を設定します。",
    steps: ["設定トークン", "サーバー", "PostgreSQL", "管理者", "確認"], next: "次へ", back: "戻る", submit: "初期設定を開始",
    token: "一回限りの設定トークン", tokenHelp: "インストール先のbootstrap-tokenファイルを確認してください。設定完了後に削除されます。",
    hostname: "公開メールホスト名", webmailHost: "公開Webメールホスト名（任意）", proxy: "Webサーバー", cloudflare: "Cloudflare DNSトークン（任意）",
    webmailPort: "Webメールポート", apiPort: "メールAPIポート", webmailListen: "Webメール待受アドレス", apiListen: "API待受アドレス",
    dbHost: "DBホスト", dbPort: "DBポート", dbUser: "DBユーザー", dbName: "DB名", dbPassword: "DBユーザーパスワード",
    createDb: "ローカルDBとユーザーがなければ作成する", dbAdmin: "PostgreSQL管理者", dbAdminPassword: "PostgreSQL管理者パスワード",
    admin: "最初の管理者メールアドレス", password: "管理者パスワード（12文字以上）", passwordAgain: "管理者パスワードの確認", selector: "DKIMセレクター",
    confirm: "選択したPostgreSQLデータベースにスキーマと最初の管理者アカウントを作成することを承認します。",
    review: "秘密情報はこの画面に表示されません。要求はアクセス制限された一回限りのファイルで渡されます。",
    processing: "インストールサービスが設定を適用しています。状態は自動更新されます。", failed: "設定に失敗しました。サービスの状態と入力内容を確認して再試行してください。",
    serviceFailed: "設定は完了しましたが、メールサービスを開始できませんでした。サービスの状態を確認してください。",
    unavailable: "このNext.jsサーバーはTASTEMAILインストールサービスに接続されていません。パッケージの環境設定が必要です。",
    unavailableTitle: "インストールサービスを利用できません", login: "ログインへ", loading: "設定状態を確認中…", invalidPassword: "管理者パスワードが一致しません。",
    invalidRequest: "入力内容を確認してください。", unauthorized: "設定トークンが正しくありません。", busy: "設定要求はすでに処理中です。",
    configured: "初期設定が完了しました。", forbidden: "HTTPSまたはローカルアドレスからこのページを開いてください。",
  },
  zh: {
    title: "TASTEMAIL 初始设置", intro: "在具备安装服务的主机上配置邮件服务器和首位管理员。",
    steps: ["设置令牌", "服务器", "PostgreSQL", "管理员", "确认"], next: "下一步", back: "返回", submit: "开始初始设置",
    token: "一次性设置令牌", tokenHelp: "请查看安装主机上的 bootstrap-token 文件。设置完成后该文件会被删除。",
    hostname: "公共邮件主机名", webmailHost: "公共 Webmail 主机名（可选）", proxy: "Web 服务器", cloudflare: "Cloudflare DNS 令牌（可选）",
    webmailPort: "Webmail 端口", apiPort: "邮件 API 端口", webmailListen: "Webmail 监听地址", apiListen: "API 监听地址",
    dbHost: "数据库主机", dbPort: "数据库端口", dbUser: "数据库用户", dbName: "数据库名称", dbPassword: "数据库用户密码",
    createDb: "如果不存在则创建本地数据库和用户", dbAdmin: "PostgreSQL 管理员", dbAdminPassword: "PostgreSQL 管理员密码",
    admin: "首位管理员邮箱", password: "管理员密码（至少 12 个字符）", passwordAgain: "确认管理员密码", selector: "DKIM 选择器",
    confirm: "我授权在所选 PostgreSQL 数据库中创建架构和首位管理员账户。",
    review: "此处不会显示机密值。请求通过访问受限的一次性文件传递。",
    processing: "安装服务正在应用配置，状态会自动更新。", failed: "设置失败。请检查服务状态和输入内容后重试。",
    serviceFailed: "配置已完成，但邮件服务启动失败。请检查服务状态。",
    unavailable: "此 Next.js 服务器未连接到 TASTEMAIL 安装服务，需要配置安装包环境。",
    unavailableTitle: "安装服务不可用", login: "前往登录", loading: "正在检查设置状态…", invalidPassword: "管理员密码不一致。",
    invalidRequest: "请检查输入内容。", unauthorized: "设置令牌不正确。", busy: "设置请求正在处理中。",
    configured: "初始设置已完成。", forbidden: "请通过 HTTPS 或本地地址打开此页面。",
  },
  "zh-hant": {
    title: "TASTEMAIL 初始設定", intro: "在具備安裝服務的主機上設定郵件伺服器和第一位管理員。",
    steps: ["設定權杖", "伺服器", "PostgreSQL", "管理員", "確認"], next: "下一步", back: "返回", submit: "開始初始設定",
    token: "一次性設定權杖", tokenHelp: "請查看安裝主機上的 bootstrap-token 檔案。設定完成後會刪除。",
    hostname: "公開郵件主機名稱", webmailHost: "公開 Webmail 主機名稱（選填）", proxy: "網頁伺服器", cloudflare: "Cloudflare DNS 權杖（選填）",
    webmailPort: "Webmail 連接埠", apiPort: "郵件 API 連接埠", webmailListen: "Webmail 監聽位址", apiListen: "API 監聽位址",
    dbHost: "資料庫主機", dbPort: "資料庫連接埠", dbUser: "資料庫使用者", dbName: "資料庫名稱", dbPassword: "資料庫使用者密碼",
    createDb: "如不存在則建立本機資料庫和使用者", dbAdmin: "PostgreSQL 管理員", dbAdminPassword: "PostgreSQL 管理員密碼",
    admin: "第一位管理員電子郵件", password: "管理員密碼（至少 12 個字元）", passwordAgain: "確認管理員密碼", selector: "DKIM 選擇器",
    confirm: "我授權在所選 PostgreSQL 資料庫中建立結構和第一位管理員帳戶。",
    review: "此處不會顯示機密值。請求透過存取受限的一次性檔案傳遞。",
    processing: "安裝服務正在套用設定，狀態會自動更新。", failed: "設定失敗。請檢查服務狀態和輸入內容後重試。",
    serviceFailed: "設定已完成，但郵件服務啟動失敗。請檢查服務狀態。",
    unavailable: "此 Next.js 伺服器未連接 TASTEMAIL 安裝服務，需要設定安裝套件環境。",
    unavailableTitle: "安裝服務無法使用", login: "前往登入", loading: "正在檢查設定狀態…", invalidPassword: "管理員密碼不一致。",
    invalidRequest: "請檢查輸入內容。", unauthorized: "設定權杖不正確。", busy: "設定請求正在處理中。",
    configured: "初始設定已完成。", forbidden: "請透過 HTTPS 或本機位址開啟此頁面。",
  },
};

type Copy = typeof copy.ko;
const localizedCopy: Record<Locale, Copy> = copy;
type TextField = keyof Pick<InitialSetupInput, "setupToken" | "hostname" | "webmailHostname" | "cloudflareApiToken" | "databaseHost" | "databaseUser" | "databaseName" | "databasePassword" | "databaseAdminUser" | "databaseAdminPassword" | "adminAddress" | "password" | "passwordConfirmation" | "dkimSelector">;

export function LiveInitialSetup() {
  const t = localizedCopy[useLocale() as Locale] ?? copy.en;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<InitialSetupStatus | "loading">("loading");
  const [step, setStep] = useState(0);
  const [input, setInput] = useState<InitialSetupInput>(defaultInput);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const processing = sending || status === "queued" || status === "running";

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch("/api/mail/setup", { cache: "no-store", signal: controller.signal });
        const body: { status?: InitialSetupStatus } = await response.json();
        if (!controller.signal.aborted) {
          const next = body.status ?? "disabled";
          setStatus(next);
          if (next === "configured") router.replace("/login");
        }
      } catch { if (!controller.signal.aborted) setStatus("disabled"); }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 2500);
    return () => { controller.abort(); clearInterval(timer); };
  }, [router]);

  const update = (key: TextField, value: string) => setInput((current) => ({ ...current, [key]: value }));
  const field = (key: TextField, label: string, options?: { type?: string; required?: boolean; minLength?: number; maxLength?: number }) => (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground" key={key}>
      {label}
      <input name={key} type={options?.type ?? "text"} value={input[key]} onChange={(event) => update(key, event.target.value)}
        required={options?.required} minLength={options?.minLength} maxLength={options?.maxLength} autoComplete="off"
        className="h-11 rounded-lg border border-(--border-app) bg-background px-3 text-sm outline-none focus:border-(--color-primary)" />
    </label>
  );
  const port = (key: "webmailPort" | "apiPort" | "databasePort", label: string) => (
    <label className="flex flex-col gap-1.5 text-sm font-medium" key={key}>{label}
      <input type="number" min={key === "databasePort" ? 1 : 1024} max={65535} required value={input[key]}
        onChange={(event) => setInput((current) => ({ ...current, [key]: Number(event.target.value) }))}
        className="h-11 rounded-lg border border-(--border-app) bg-background px-3 outline-none focus:border-(--color-primary)" />
    </label>
  );
  const address = (key: "webmailListenHost" | "apiListenHost", label: string) => (
    <label className="flex flex-col gap-1.5 text-sm font-medium" key={key}>{label}
      <CustomSelect value={input[key]} onChange={(event) => setInput((current) => ({ ...current, [key]: event.target.value as InitialSetupInput[typeof key] }))}
        className="h-11 rounded-lg border border-(--border-app) bg-background px-3"><option value="127.0.0.1">127.0.0.1</option><option value="0.0.0.0">0.0.0.0</option></CustomSelect>
    </label>
  );

  const next = () => {
    if (!formRef.current?.reportValidity()) return;
    if (step === 3 && input.password !== input.passwordConfirmation) { setError(t.invalidPassword); return; }
    setError("");
    setStep((current) => Math.min(current + 1, 4));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!input.confirmed || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/mail/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      const result: { status?: string } = await response.json();
      if (response.ok && result.status === "queued") setStatus("queued");
      else setError(result.status === "unauthorized" ? t.unauthorized : result.status === "busy" ? t.busy : result.status === "forbidden" ? t.forbidden : t.invalidRequest);
    } catch { setError(t.unavailable); }
    finally { setSending(false); }
  };

  return <main className="min-h-dvh bg-(--surface-muted) px-4 py-8 text-foreground sm:py-14">
    <section className="mx-auto w-full max-w-3xl rounded-xl border border-(--border-app) bg-background shadow-sm">
      <header className="border-b border-(--border-app) px-5 py-6 sm:px-8">
        <p className="text-xs font-bold uppercase tracking-widest text-(--color-primary-ink)">GXWebMail · TASTEMAIL</p>
        <h1 className="mt-2 text-2xl font-bold">{t.title}</h1><p className="mt-2 text-sm text-(--text-muted)">{t.intro}</p>
      </header>
      {status === "loading" ? <p role="status" className="p-8">{t.loading}</p> :
      status === "disabled" ? <><div className="p-8"><h2 className="font-semibold">{t.unavailableTitle}</h2><p className="mt-2 text-sm text-(--text-muted)">{t.unavailable}</p></div><DevApiConnectionSetup /></> :
      status === "configured" ? <p role="status" className="p-8">{t.configured}</p> :
      <div className="p-5 sm:p-8">
        <ol className="mb-8 flex flex-wrap gap-2" aria-label={t.title}>{t.steps.map((name, index) => <li key={name} aria-current={index === step ? "step" : undefined}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${index === step ? "bg-(--color-primary-solid) text-white" : "bg-(--surface-muted) text-(--text-muted)"}`}>{index < step ? <Check size={12} className="mr-1 inline" /> : null}{index + 1}. {name}</li>)}</ol>
        {status === "error" ? <p role="alert" className="mb-5 text-sm text-(--status-danger)">{t.failed}</p> : null}
        {status === "service-error" ? <div role="alert" className="space-y-4 py-8 text-sm"><p className="text-(--status-danger)">{t.serviceFailed}</p><button type="button" onClick={() => router.push("/login")} className="rounded-lg border border-(--border-app) px-4 py-2">{t.login}</button></div> :
        processing ? <p role="status" className="flex items-center gap-2 py-10 text-sm"><LoaderCircle className="animate-spin" size={18} />{t.processing}</p> :
        <form ref={formRef} onSubmit={submit} className="space-y-5">
          {step === 0 ? <div className="space-y-4">{field("setupToken", t.token, { type: "password", required: true, minLength: 43, maxLength: 43 })}<p className="text-xs text-(--text-muted)">{t.tokenHelp}</p></div> : null}
          {step === 1 ? <div className="grid gap-4 sm:grid-cols-2">{field("hostname", t.hostname, { required: true })}{field("webmailHostname", t.webmailHost)}{port("webmailPort", t.webmailPort)}{port("apiPort", t.apiPort)}{address("webmailListenHost", t.webmailListen)}{address("apiListenHost", t.apiListen)}
            <label className="flex flex-col gap-1.5 text-sm font-medium">{t.proxy}<CustomSelect value={input.webmailProxyEngine} onChange={(event) => setInput((current) => ({ ...current, webmailProxyEngine: event.target.value as InitialSetupInput["webmailProxyEngine"] }))} className="h-11 rounded-lg border border-(--border-app) bg-background px-3"><option value="auto">Auto</option><option value="nginx">nginx</option><option value="apache">Apache</option><option value="caddy">Caddy</option></CustomSelect></label>
            {field("cloudflareApiToken", t.cloudflare, { type: "password" })}</div> : null}
          {step === 2 ? <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2">{field("databaseHost", t.dbHost, { required: true })}{port("databasePort", t.dbPort)}{field("databaseUser", t.dbUser, { required: true })}{field("databaseName", t.dbName, { required: true })}</div>{field("databasePassword", t.dbPassword, { type: "password" })}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={input.createLocalDatabase} onChange={(event) => setInput((current) => ({ ...current, createLocalDatabase: event.target.checked }))} />{t.createDb}</label>
            {input.createLocalDatabase ? <div className="grid gap-4 sm:grid-cols-2">{field("databaseAdminUser", t.dbAdmin, { required: true })}{field("databaseAdminPassword", t.dbAdminPassword, { type: "password" })}</div> : null}</div> : null}
          {step === 3 ? <div className="space-y-4">{field("adminAddress", t.admin, { type: "email", required: true })}<div className="grid gap-4 sm:grid-cols-2">{field("password", t.password, { type: "password", required: true, minLength: 12 })}{field("passwordConfirmation", t.passwordAgain, { type: "password", required: true, minLength: 12 })}</div>{field("dkimSelector", t.selector, { required: true })}</div> : null}
          {step === 4 ? <div className="space-y-5 text-sm"><p className="text-(--text-muted)">{t.review}</p><dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2"><dt>{t.hostname}</dt><dd>{input.hostname}</dd><dt>{t.webmailPort} / {t.apiPort}</dt><dd>{input.webmailPort} / {input.apiPort}</dd><dt>{t.dbHost}</dt><dd>{input.databaseUser}@{input.databaseHost}:{input.databasePort}/{input.databaseName}</dd><dt>{t.admin}</dt><dd>{input.adminAddress}</dd><dt>{t.selector}</dt><dd>{input.dkimSelector}</dd></dl>
            <label className="flex items-start gap-2"><input type="checkbox" required checked={input.confirmed} onChange={(event) => setInput((current) => ({ ...current, confirmed: event.target.checked }))} className="mt-1" />{t.confirm}</label></div> : null}
          {error ? <p role="alert" className="text-sm text-(--status-danger)">{error}</p> : null}
          <footer className="flex items-center justify-between border-t border-(--border-app) pt-5">
            {step > 0 ? <button type="button" onClick={() => { setStep((current) => current - 1); setError(""); }} className="inline-flex items-center gap-1 rounded-lg border border-(--border-app) px-4 py-2.5 text-sm"><ArrowLeft size={16} />{t.back}</button> : <span />}
            {step < 4 ? <button type="button" onClick={next} className="inline-flex items-center gap-1 rounded-lg bg-(--color-primary-solid) px-4 py-2.5 text-sm font-semibold text-white">{t.next}<ArrowRight size={16} /></button> :
              <button type="submit" disabled={!input.confirmed || sending} className="inline-flex items-center gap-2 rounded-lg bg-(--color-primary-solid) px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><ShieldCheck size={16} />{t.submit}</button>}
          </footer>
        </form>}
      </div>}
    </section>
  </main>;
}
