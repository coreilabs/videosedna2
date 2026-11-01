# Projeto: recordações de Edna Moreira

Site estático destinado a https://coreilabs.github.io/videosedna/.

## Catálogo e manutenção

- Depois de adicionar ou remover vídeos e gerar miniaturas, executar `node scripts/generate-catalog.cjs` para atualizar `videos.json`.
- Os identificadores de compartilhamento dependem do nome original do arquivo. Não renomear vídeos antigos para preservar links.
- A página é estática, sem build; preservar caminhos relativos para o prefixo `/videosedna/`. Instruções de publicação e prévia em `README.md`.
- Antes de publicar, depois da última alteração em scripts ou estilos, executar `node scripts/version-assets.cjs` e incluir `index.html` atualizado na publicação. O helper adiciona versões por hash a `styles.css`, `accessibility.css` e `app.js`, evitando reutilizar cópias antigas em cache. Não usar versões aleatórias por acesso. O catálogo usa revalidação com `cache: 'no-cache'`. A atualização dos recursos depende de o visitante carregar o HTML novo; não prometer substituir abas antigas sem recarga.
- Quando o usuário pedir para forçar nova versão sem mudanças de conteúdo, executar `node scripts/version-assets.cjs --force`. A opção gera um sufixo de publicação nos links, uma única vez localmente, e deixa alterações concretas em `index.html` para commit. Execuções normais preservam o sufixo se o conteúdo continuar igual.
- Imagem Open Graph fornecida pelo usuário: `imgs/opengraph.webp`, 1200 × 630 px. Preservar as referências nas tags Open Graph e Twitter.
- Preservar o infinite scroll em lotes de 24 via `IntersectionObserver`, com botão alternativo acessível e sem mover o foco no carregamento automático.
- Virtualizar a galeria por grupos de 24: remover cartões e imagens de grupos distantes, reservando sua altura, e recriar ao se aproximarem da tela. Preservar o grupo com foco ou que abriu o player; oferecer restauração pelo teclado. Recalcular alturas ao mudar a largura. Não manter referências aos cartões descartados nem limpar o cache do navegador. Validar ida e volta da rolagem e redimensionamento com muitos grupos carregados.
- As miniaturas devem exibir skeleton e indicador “Carregando…” até carregar/decodificar. Em erro, encerrar a animação e mostrar “Prévia indisponível”, mantendo o vídeo acessível. Respeitar `prefers-reduced-motion` e não criar skeletons/imagens durante a medição dos grupos virtualizados.
- Preservar os padrões de legibilidade em `accessibility.css`: botões e textos principais com 18 px ou mais, controles com altura mínima de 56 px e rótulos visíveis. Não reduzir fontes ou áreas de toque para caber em telas menores; reorganizar o layout.
- Analytics de compartilhamento: `video_share_click` mede tentativas; `share` mede retorno da API nativa ou cópia do link, nunca o cancelamento. Não duplicar o evento por tentativa nem atribuir o evento ao vídeo novo caso o visitante troque de vídeo durante uma operação assíncrona. Manter a tag e o `send_to` em `G-K27Z7H0JVY`. Durante testes, bloquear requisições do Google Analytics e inspecionar os eventos localmente para não contaminar produção.

## Extração local de miniaturas

- Usar FFmpeg local pelo helper `scripts/generate-thumbnails.ps1`. Não enviar vídeos para IA para gerar capas nem extrair imagens no navegador do visitante.
- Originais em `gallery/`; miniaturas em `thumbnails/`. Nunca sobrescrever ou recomprimir os vídeos durante a extração.
- O nome da capa é o nome completo do arquivo mais `.webp`: `gallery/exemplo.mp4` corresponde a `thumbnails/exemplo.mp4.webp`. Respeitar maiúsculas e minúsculas nos caminhos publicados.
- O helper gera JPEG vertical 9:16 de 360 × 640 px por padrão. Encaixa o quadro inteiro com proporção preservada e preenche o espaço restante com fundo escuro, sem cortes nem distorção, inclusive em vídeos horizontais. `-MaxSize` limita a altura e arredonda para baixo em múltiplos de 32, preservando o 9:16 exato. Extrai em 1 segundo; tenta o início se o vídeo for curto. Arquivos sem faixa de vídeo válida são reportados como falhas, sem interromper os demais.
- A galeria deve exibir cartões 9:16 com `object-fit: contain`, também em desktop. Ao mudar o formato das capas, executar o helper com `-Force` para substituir todas e atualizar a versão em `thumbnailURL` de `app.js` para invalidar capas antigas em cache.
- A execução é sequencial para limitar uso de CPU. Capas existentes não vazias e mais recentes que o original são preservadas; `-Force` permite regenerar. Capas substituídas manualmente também são preservadas enquanto mais recentes que o original.
- Usar miniaturas com lazy loading na galeria. Não criar centenas de elementos de vídeo para obter capas. Publicar `thumbnails/` junto com o site; GitHub Pages não executa este script.

### Instalação no Windows (uma vez)

No PowerShell:

```powershell
winget install --id Gyan.FFmpeg -e --source winget
```

Fechar e reabrir o terminal e conferir:

```powershell
ffmpeg -version
```

Alternativa sem WinGet: baixar o ZIP **release essentials** de https://www.gyan.dev/ffmpeg/builds/, extrair fora do projeto e informar o caminho de `bin/ffmpeg.exe` com `-FFmpeg`. Não adicionar os binários do FFmpeg ao repositório.

### Comandos (a partir da raiz do projeto)

```powershell
# Gerar capas ausentes ou desatualizadas
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-thumbnails.ps1

# Testar somente um arquivo (usar o nome completo real)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-thumbnails.ps1 -Only 'exemplo.mp4'

# Trocar o instante de uma capa específica
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-thumbnails.ps1 -Only 'exemplo.mp4' -AtSeconds 3 -Force

# Executável fora do PATH
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-thumbnails.ps1 -FFmpeg 'C:\ferramentas\ffmpeg\bin\ffmpeg.exe'
```

`ExecutionPolicy Bypass` vale somente para o processo iniciado, sem alterar a política permanente. O script resolve as pastas pela própria localização, independentemente do diretório atual. Ao adicionar vídeos, executar novamente e publicar as novas capas. Verificar o resumo; código de saída 1 indica falha. Não inventar capas bem-sucedidas para arquivos inválidos ou contendo somente áudio.

## Validação no navegador

Usar Google Chrome pelo MCP Playwright com `channel: 'chrome'`. Se indisponível, usar `C:/Users/user/.codex/tools/browser/chrome.cjs` e seu helper `launchChrome()`, com perfil de testes separado. Validar desktop e mobile, toque, interações e erros reais. Não alterar o navegador padrão do Windows.

Reutilizar a instalação compartilhada do Playwright; não instalar dependências ou navegadores locais somente para validação. Artefatos temporários devem ficar fora do projeto, em `C:/Users/user/.codex/browser-artifacts/videosedna/<execucao-unica>/`. Remover somente os artefatos desta execução quando não forem necessários para entrega ou diagnóstico.
