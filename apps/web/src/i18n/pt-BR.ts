// Web エディタの文言（ポルトガル語・ブラジル）。形は messages.ts の日本語と同じ（NFR-I18N-01）
import type { WebMessages } from "../messages";

const areas = (n: number) => (n === 1 ? "1 área" : `${n} áreas`);

export const ptBR: WebMessages = {
  header: {
    more: "Mais ações",
    settings: "Configurações",
  },
  open: {
    button: "Abrir imagem",
    dropHint: (paste) => `Arraste e solte uma captura de tela ou cole-a (${paste}).`,
    formats:
      "Aceita JPEG e PNG, e também SVG, WebP, GIF, HEIC e outros (salvos como JPEG ou PNG). As imagens salvas funcionam como imagens comuns e, ao abri-las no Harie, você pode editar as anotações de novo.",
    integrations:
      "Para capturar com a extensão do Chrome ou editar pelo Claude (MCP), veja “Integrações” no canto superior direito (dentro de “…” em telas estreitas).",
    fileInput: "Arquivo de imagem",
    imageFiles: "Imagens",
    jpegFiles: "Imagem JPEG",
    pngFiles: "Imagem PNG",
    confirmTitle: "Abrir outra imagem?",
    confirmBody: (fileName) => `A imagem atual (${fileName}) será fechada e outra será aberta.`,
    confirmUnsaved: "As alterações não salvas serão perdidas.",
    cancel: "Cancelar",
    choose: "Escolher imagem",
    loading: "Carregando…",
  },
  load: {
    unsupported:
      "Não foi possível ler este arquivo como imagem. Abra uma imagem JPEG, PNG, SVG, WebP, GIF, HEIC ou similar.",
    corrupted: "A imagem está corrompida e não pode ser aberta.",
    noSize: "Não foi possível ler o tamanho da imagem.",
    decodeFailed: (type: string) => `Não foi possível ler esta imagem ${type}.`,
    mismatch: {
      PayloadMissing: "Parte dos dados das anotações está faltando. Só a imagem foi aberta.",
      PayloadCorrupted: "Os dados das anotações estão corrompidos. Só a imagem foi aberta.",
      RenderedImageModified:
        "Esta imagem foi editada em outro app. Ela foi aberta com as anotações salvas e a imagem original (as alterações feitas no outro app não foram incluídas).",
      UnsupportedVersion:
        "Este arquivo foi salvo por uma versão mais nova do Harie. Só a imagem foi aberta.",
      InvalidDocument: "Não foi possível ler os dados das anotações. Só a imagem foi aberta.",
    },
    keepAnnotations: "Editar com as anotações salvas",
    useCurrentImage: "Usar a imagem atual como nova base (as anotações serão removidas)",
  },
  save: {
    button: "Salvar",
    saving: "Salvando…",
    saved: (fileName) => `${fileName} foi salvo`,
    failed: (detail) => `Não foi possível salvar: ${detail}`,
    cancelled: "Salvamento cancelado",
    format: "Formato de salvamento",
    formatButton: (label) => `Formato do arquivo: ${label}`,
    jpegNote: "Arquivo menor",
    pngNote: "Texto mais nítido",
  },
  copy: {
    button: "Copiar",
    copying: "Copiando a imagem…",
    copied: "Imagem copiada",
    failed: (detail) => `Não foi possível copiar: ${detail}`,
  },
  replace: {
    button: "Substituir imagem",
    input: "Imagem substituta",
    notImage: "Escolha uma imagem (JPEG, PNG, SVG, WebP, GIF, HEIC etc.)",
    done: "A imagem foi substituída. ",
    resized: "As anotações foram ajustadas ao tamanho da nova imagem. ",
    remask: (n) =>
      `Aplique de novo a máscara ${n === 1 ? "na área" : `nas ${n} áreas`} que você tinha mascarado na imagem anterior`,
  },
  resize: {
    button: "Redimensionar",
    title: "Tamanho da imagem salva",
    description:
      "Só a imagem salva fica neste tamanho. A proporção é mantida e a imagem original continua guardada, então dá para voltar depois.",
    original: (w, h) => `Imagem original: ${w} × ${h} px`,
    width: "Largura (W)",
    height: "Altura (H)",
    invalid: (max) => `Digite números inteiros de 1 a ${max} para a largura e a altura`,
    cancel: "Cancelar",
    apply: "Redimensionar",
    done: (w, h) => `Tamanho da imagem salva definido como ${w} × ${h} px`,
    restored: "O tamanho da imagem salva voltou ao original",
    resetButton: "Voltar ao tamanho original",
  },
  masks: {
    applied: (n) =>
      `${areas(n)} ${n === 1 ? "foi mascarada" : "foram mascaradas"}. Até salvar, você pode selecionar uma área e reexibi-la`,
    unmasked: "A área foi reexibida",
  },
  settings: {
    title: "Configurações",
    close: "Fechar",
    language: "Idioma",
    languageNote: "O idioma da interface. O texto das anotações não muda.",
    ai: "Configurações de IA",
    aiNote:
      "As sugestões da IA e a busca de dados pessoais na imagem precisam de uma conexão com um serviço de IA. Conecte-se com o OpenRouter ou salve uma chave de API da Anthropic. As chaves ficam só neste navegador e nunca entram nos arquivos.",
    aiNoteKeyOnly:
      "As sugestões da IA e a busca de dados pessoais na imagem precisam de uma chave de API da Anthropic. A chave fica só aqui e nunca entra nos arquivos.",
    keySteps: [
      "Entre no Anthropic Console pelo link abaixo e crie uma chave em “Create Key”.",
      "Cole a chave (ela começa com sk-ant-) e salve.",
    ],
    keyLink: "Criar uma chave de API (Anthropic Console)",
    keyBilling: "A Anthropic cobra só o que você usar. Você não paga nada ao Harie.",
    openRouterTitle: "Conectar com o OpenRouter (sem colar chave)",
    openRouterNote:
      "Entre no OpenRouter e permita o acesso para usar a IA sem colar uma chave. O uso é pago com seus créditos do OpenRouter.",
    openRouterConnect: "Conectar com o OpenRouter",
    openRouterWaiting: "Permita o acesso na janela que foi aberta.",
    openRouterBlocked: "Não foi possível abrir a janela. Permita pop-ups e clique de novo.",
    openRouterConnected: "Conectado com o OpenRouter.",
    openRouterDisconnect: "Desconectar",
    anthropicTitle: "Usar uma chave de API da Anthropic",
    apiKey: "Chave de API",
    register: "Salvar chave",
    registered: "Há uma chave de API salva.",
    remove: "Remover a chave de API",
  },
  guide: {
    button: "Integrações",
    title: "Usar com outras ferramentas",
    close: "Fechar",
    extensionLabel: "Extensão do Chrome",
    extensionTitle: "Capturar com a extensão do Chrome",
    extensionAbout:
      "Capture a página que você está vendo e faça as anotações na hora no Harie. Dá para capturar a área visível, uma área arrastada ou um elemento, como um botão.",
    extensionStore: "Instalar pela Chrome Web Store",
    extensionStep1: "Na página do Harie na Chrome Web Store, clique em “Usar no Chrome”.",
    extensionStep2: (file) => [
      "Clique no Harie na barra de ferramentas ou pressione Alt+Shift+S para capturar. Os arquivos ",
      file,
      " salvos também podem ser abertos e editados nesta versão web.",
    ],
    mcpTitle: "Editar pelo Claude (MCP)",
    mcpAbout: (pkg, root) => [
      "Registre o servidor MCP ",
      pkg,
      " e você poderá pedir ao Claude coisas como “coloque uma caixa vermelha em volta do botão Salvar” para adicionar e corrigir anotações. Requer Node.js 22 ou mais recente. Ele só pode trabalhar dentro da pasta indicada com ",
      root,
      ".",
    ],
    claudeCodeCommand: "Comando para registrar no Claude Code",
    desktopAbout: (file) => [
      "Adicione isto a ",
      file,
      ". Troque a pasta pelo seu próprio caminho.",
    ],
    desktopConfig: "Configuração do Claude Desktop",
    copy: "Copiar",
    copied: "Copiado",
    copyLabel: (label) => `Copiar: ${label}`,
    appLabel: "Aplicativo",
    appTitle: "Usar como aplicativo",
    appAbout:
      "Instale o Harie como aplicativo no computador ou no celular para abri-lo sem o navegador e usá-lo offline. Você pode abrir arquivos JPEG e PNG com “Abrir com” ou enviar imagens pelo menu Compartilhar do celular.",
    appInstall: "Instalar como aplicativo",
    appInstalled: "Você está usando o Harie como aplicativo.",
    appManual:
      "Instale pelo menu do navegador com “Instalar app” (no Safari, “Adicionar à Tela de Início” ou “Adicionar ao Dock”).",
  },
  ai: {
    title: "Criar um guia com IA",
    action: "Sugestão da IA",
    cancel: "Cancelar",
    intent: "O que você quer explicar",
    intentPlaceholder: "O que você quer explicar (ex.: como configurar as notificações)",
    notice: (withDom, provider) =>
      `Ao clicar em um botão, esta imagem${withDom ? " e o texto e as posições dos elementos da página capturada" : ""} serão enviados para ${provider === "openrouter" ? "o Claude da Anthropic por meio do OpenRouter" : "a API do Claude da Anthropic"}. Se houver dados pessoais visíveis, oculte-os antes.`,
    consent: "Concordo em enviar esta imagem",
    suggest: "Pedir sugestões à IA",
    detectPii: "Buscar na imagem com IA",
    piiTitle: "Encontrar dados pessoais",
    localNote:
      "Procura endereços de e-mail, telefones, campos de nome e mais no texto da página capturada. Nada é enviado para lugar nenhum. Textos e rostos dentro da imagem não são encontrados assim, então confira também com os próprios olhos.",
    detectPiiLocal: "Buscar no texto da página",
    noPiiLocal:
      "Nenhum dado pessoal foi encontrado no texto da página. Confira também a imagem com os próprios olhos",
    needKey:
      "Para receber sugestões da IA, conecte-se com o OpenRouter ou salve uma chave de API nas Configurações.",
    openSettings: "Abrir configurações",
    suggesting: "A IA está olhando a imagem…",
    detecting: "Procurando dados pessoais…",
    noSuggestions: "Nenhuma sugestão",
    suggested: (n) =>
      `${n === 1 ? "1 sugestão foi adicionada" : `${n} sugestões foram adicionadas`}. Só as que você aceitar serão salvas`,
    noPii: "Nenhum dado pessoal foi encontrado. Confira também com os próprios olhos",
    piiFound: (n) =>
      `${n === 1 ? "1 candidato foi adicionado" : `${n} candidatos foram adicionados`} como áreas de máscara. Revise antes de aplicar`,
    suggestions: (n) => `Sugestões (${n})`,
    adopt: "Aceitar",
    reject: "Descartar",
    adoptAll: "Aceitar todas",
    rejectAll: "Descartar todas",
    errors: {
      auth: "A chave de API está incorreta ou não tem permissão",
      credits: "Créditos insuficientes no OpenRouter. Adicione créditos no OpenRouter",
      "rate-limit": "O limite de uso foi atingido. Tente de novo mais tarde",
      refusal: "A IA não conseguiu processar esta imagem",
      "invalid-output": "Não foi possível ler a resposta da IA",
      network: "Não foi possível conectar ao serviço de IA",
      other: "A chamada à IA falhou",
    },
  },
  openRouter: {
    connecting: "Conectando com o OpenRouter…",
    done: "Conectado. Feche esta janela e volte ao Harie.",
    failed: "Não foi possível conectar. Tente de novo pelas configurações do Harie.",
  },
  desktop: {
    discardOpen:
      "Há alterações não salvas. Se você abrir outro arquivo sem salvar, elas serão perdidas.",
    discardClose: "Há alterações não salvas. Se você fechar sem salvar, elas serão perdidas.",
    discardOk: (action) => (action === "open" ? "Abrir sem salvar" : "Fechar sem salvar"),
    cancel: "Cancelar",
  },
  extension: {
    notFound: "Captura não encontrada. Capture de novo.",
  },
};
