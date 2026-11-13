// Web エディタの文言（スペイン語）。形は messages.ts の日本語と同じ（NFR-I18N-01）
import type { WebMessages } from "../messages";

const areas = (n: number) => (n === 1 ? "1 área" : `${n} áreas`);

export const es: WebMessages = {
  header: {
    more: "Más acciones",
    settings: "Ajustes",
  },
  open: {
    button: "Abrir imagen",
    dropHint: (paste) => `Arrastra y suelta una captura de pantalla, o pégala (${paste}).`,
    formats:
      "Admite JPEG y PNG, y también SVG, WebP, GIF, HEIC y otros (se guardan como JPEG o PNG). Las imágenes guardadas funcionan como imágenes normales, y si las abres en Harie puedes volver a editar las anotaciones.",
    integrations:
      "Para capturar con la extensión de Chrome o editar desde Claude (MCP), consulta «Integraciones» arriba a la derecha (dentro de «…» en pantallas estrechas).",
    fileInput: "Archivo de imagen",
    imageFiles: "Imágenes",
    jpegFiles: "Imagen JPEG",
    pngFiles: "Imagen PNG",
    confirmTitle: "¿Abrir otra imagen?",
    confirmBody: (fileName) => `Se cerrará la imagen actual (${fileName}) y se abrirá otra.`,
    confirmUnsaved: "Los cambios sin guardar se perderán.",
    cancel: "Cancelar",
    choose: "Elegir imagen",
    loading: "Cargando…",
  },
  load: {
    unsupported:
      "Este archivo no se puede leer como imagen. Abre una imagen JPEG, PNG, SVG, WebP, GIF, HEIC u otra similar.",
    corrupted: "La imagen está dañada y no se puede abrir.",
    noSize: "No se pudo leer el tamaño de la imagen.",
    decodeFailed: (type: string) => `No se pudo leer esta imagen ${type}.`,
    mismatch: {
      PayloadMissing: "Faltan datos de las anotaciones. Solo se abrió la imagen.",
      PayloadCorrupted: "Los datos de las anotaciones están dañados. Solo se abrió la imagen.",
      RenderedImageModified:
        "Esta imagen se editó en otra aplicación. Se abrió con las anotaciones guardadas y la imagen original (no se incluyen los cambios hechos en la otra aplicación).",
      UnsupportedVersion:
        "Este archivo se guardó con una versión más reciente de Harie. Solo se abrió la imagen.",
      InvalidDocument: "No se pudieron leer los datos de las anotaciones. Solo se abrió la imagen.",
    },
    keepAnnotations: "Editar con las anotaciones guardadas",
    useCurrentImage: "Usar la imagen actual como nueva base (se quitarán las anotaciones)",
  },
  save: {
    button: "Guardar",
    saving: "Guardando…",
    saved: (fileName) => `Se guardó ${fileName}`,
    failed: (detail) => `No se pudo guardar: ${detail}`,
    cancelled: "Se canceló el guardado",
    format: "Formato de guardado",
    formatButton: (label) => `Formato de archivo: ${label}`,
    jpegNote: "Archivo más pequeño",
    pngNote: "Texto más nítido",
  },
  copy: {
    button: "Copiar",
    copying: "Copiando la imagen…",
    copied: "Se copió la imagen",
    failed: (detail) => `No se pudo copiar: ${detail}`,
  },
  replace: {
    button: "Reemplazar imagen",
    input: "Imagen de reemplazo",
    notImage: "Elige una imagen (JPEG, PNG, SVG, WebP, GIF, HEIC, etc.)",
    done: "Se reemplazó la imagen. ",
    resized: "Las anotaciones se ajustaron al tamaño de la nueva imagen. ",
    remask: (n) =>
      `Vuelve a enmascarar ${n === 1 ? "el área" : `las ${n} áreas`} que habías enmascarado en la imagen anterior`,
  },
  resize: {
    button: "Cambiar tamaño",
    title: "Tamaño de la imagen guardada",
    description:
      "Solo la imagen que guardas o copias se dibuja con este tamaño. La imagen original y las anotaciones se conservan, así que puedes cambiarlo cuando quieras.",
    original: (w, h) => `Imagen original: ${w} × ${h} px`,
    width: "Ancho (W)",
    height: "Alto (H)",
    keepAspect: "Mantener proporción",
    presets: "Escala",
    invalid: (max) => `Introduce números enteros de 1 a ${max} para el ancho y el alto`,
    cancel: "Cancelar",
    apply: "Cambiar",
    done: (w, h) => `Tamaño de la imagen guardada: ${w} × ${h} px`,
    reset: "Se restableció el tamaño original de la imagen guardada",
  },
  masks: {
    applied: (n) =>
      `Se enmascararon ${areas(n)}. Hasta que guardes, puedes seleccionar un área y volver a mostrarla`,
    unmasked: "Se volvió a mostrar el área",
  },
  settings: {
    title: "Ajustes",
    close: "Cerrar",
    language: "Idioma",
    languageNote: "El idioma de la interfaz. El texto de las anotaciones no cambia.",
    ai: "Ajustes de IA",
    aiNote:
      "Las sugerencias de la IA y la búsqueda de datos personales en la imagen necesitan conectarse a un servicio de IA. Conéctate con OpenRouter o guarda una clave de API de Anthropic. Las claves solo se guardan en este navegador y nunca se incluyen en los archivos.",
    aiNoteKeyOnly:
      "Las sugerencias de la IA y la búsqueda de datos personales en la imagen necesitan una clave de API de Anthropic. La clave solo se guarda aquí y nunca se incluye en los archivos.",
    keySteps: [
      "Inicia sesión en Anthropic Console desde el enlace de abajo y crea una clave con «Create Key».",
      "Pega la clave (empieza por sk-ant-) y guárdala.",
    ],
    keyLink: "Crear una clave de API (Anthropic Console)",
    keyBilling: "Anthropic te cobra solo lo que uses. No pagas nada a Harie.",
    openRouterTitle: "Conectar con OpenRouter (sin pegar ninguna clave)",
    openRouterNote:
      "Inicia sesión en OpenRouter y concede acceso para usar la IA sin pegar una clave. El uso se paga con tus créditos de OpenRouter.",
    openRouterConnect: "Conectar con OpenRouter",
    openRouterWaiting: "Concede acceso en la ventana que se abrió.",
    openRouterBlocked:
      "No se pudo abrir la ventana. Permite las ventanas emergentes y vuelve a pulsar el botón.",
    openRouterConnected: "Conectado con OpenRouter.",
    openRouterDisconnect: "Desconectar",
    anthropicTitle: "Usar una clave de API de Anthropic",
    apiKey: "Clave de API",
    register: "Guardar clave",
    registered: "Hay una clave de API guardada.",
    remove: "Eliminar la clave de API",
  },
  guide: {
    button: "Integraciones",
    title: "Usar con otras herramientas",
    close: "Cerrar",
    extensionLabel: "Extensión de Chrome",
    extensionTitle: "Capturar con la extensión de Chrome",
    extensionAbout:
      "Captura la página que estás viendo y anótala al momento en Harie. Puedes capturar el área visible, un área que arrastres o un elemento como un botón.",
    extensionStore: "Instalar desde Chrome Web Store",
    extensionStep1: "En la página de Harie en Chrome Web Store, haz clic en «Añadir a Chrome».",
    extensionStep2: (file) => [
      "Haz clic en Harie en la barra de herramientas o pulsa Alt+Shift+S para capturar. Los archivos ",
      file,
      " guardados también se pueden abrir y editar en esta versión web.",
    ],
    mcpTitle: "Editar desde Claude (MCP)",
    mcpAbout: (pkg, root) => [
      "Registra el servidor MCP ",
      pkg,
      " y podrás pedirle a Claude cosas como «pon un recuadro rojo alrededor del botón Guardar» para añadir y corregir anotaciones. Requiere Node.js 22 o posterior. Solo puede trabajar dentro de la carpeta indicada con ",
      root,
      ".",
    ],
    claudeCodeCommand: "Comando para registrarlo en Claude Code",
    desktopAbout: (file) => ["Añade esto a ", file, ". Cambia la carpeta por tu propia ruta."],
    desktopConfig: "Configuración de Claude Desktop",
    copy: "Copiar",
    copied: "Copiado",
    copyLabel: (label) => `Copiar: ${label}`,
    appLabel: "Aplicación",
    appTitle: "Usar como aplicación",
    appAbout:
      "Instala Harie como aplicación en tu ordenador o móvil para abrirla sin el navegador y usarla sin conexión. Puedes abrir archivos JPEG y PNG con «Abrir con» o enviar imágenes desde el menú Compartir del móvil.",
    appInstall: "Instalar como aplicación",
    appInstalled: "Estás usando Harie como aplicación.",
    appManual:
      "Instálala desde el menú del navegador con «Instalar aplicación» (en Safari, «Añadir a pantalla de inicio» o «Añadir al Dock»).",
  },
  ai: {
    title: "Crear una guía con IA",
    action: "Sugerir con IA",
    cancel: "Cancelar",
    intent: "Qué quieres explicar",
    intentPlaceholder: "Qué quieres explicar (p. ej., cómo configurar las notificaciones)",
    notice: (withDom, provider) =>
      `Al pulsar un botón, esta imagen${withDom ? " y el texto y la posición de los elementos de la página capturada" : ""} se enviarán a ${provider === "openrouter" ? "Claude de Anthropic a través de OpenRouter" : "la API de Claude de Anthropic"}. Si se ven datos personales, ocúltalos antes.`,
    consent: "Acepto enviar esta imagen",
    suggest: "Pedir sugerencias a la IA",
    detectPii: "Buscar en la imagen con IA",
    piiTitle: "Buscar datos personales",
    localNote:
      "Busca direcciones de correo, números de teléfono, campos de nombre y más en el texto de la página capturada. No se envía nada a ningún sitio. El texto y las caras dentro de la imagen no se encuentran así, así que revísalo también a simple vista.",
    detectPiiLocal: "Buscar en el texto de la página",
    noPiiLocal:
      "No se encontraron datos personales en el texto de la página. Revisa también la imagen a simple vista",
    needKey:
      "Para recibir sugerencias de la IA, conéctate con OpenRouter o guarda una clave de API en Ajustes.",
    openSettings: "Abrir ajustes",
    suggesting: "La IA está mirando la imagen…",
    detecting: "Buscando datos personales…",
    noSuggestions: "No hay sugerencias",
    suggested: (n) =>
      `Se ${n === 1 ? "añadió 1 sugerencia" : `añadieron ${n} sugerencias`}. Solo se guardan las que aceptes`,
    noPii: "No se encontraron datos personales. Revísalo también a simple vista",
    piiFound: (n) =>
      `Se ${n === 1 ? "añadió 1 candidato" : `añadieron ${n} candidatos`} como áreas de máscara. Revísalos antes de aplicarlos`,
    suggestions: (n) => `Sugerencias (${n})`,
    adopt: "Aceptar",
    reject: "Descartar",
    adoptAll: "Aceptar todas",
    rejectAll: "Descartar todas",
    errors: {
      auth: "La clave de API no es correcta o no tiene permisos",
      credits: "No hay suficientes créditos de OpenRouter. Añade créditos en OpenRouter",
      "rate-limit": "Se alcanzó el límite de uso. Inténtalo de nuevo más tarde",
      refusal: "La IA no pudo procesar esta imagen",
      "invalid-output": "No se pudo leer la respuesta de la IA",
      network: "No se pudo conectar con el servicio de IA",
      other: "Falló la llamada a la IA",
    },
  },
  openRouter: {
    connecting: "Conectando con OpenRouter…",
    done: "Conectado. Cierra esta ventana y vuelve a Harie.",
    failed: "No se pudo conectar. Vuelve a intentarlo desde los ajustes de Harie.",
  },
  desktop: {
    discardOpen: "Hay cambios sin guardar. Si abres otro archivo sin guardar, se perderán.",
    discardClose: "Hay cambios sin guardar. Si cierras sin guardar, se perderán.",
    discardOk: (action) => (action === "open" ? "Abrir sin guardar" : "Cerrar sin guardar"),
    cancel: "Cancelar",
  },
  extension: {
    notFound: "No se encontró la captura. Vuelve a capturar.",
  },
};
