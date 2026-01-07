# Terra Sensory Musical (VibroTerapia)

Progressive Web App 100% client-side para terapeutas de vibroacústica e musicoterapia. Reproduz tons binaurais reais, integra playlists locais via howler.js, funciona offline e oferece referências científicas de Skille, Oster, Wigram e Spintge.

## Recursos principais

- 🎧 **Geração binaural real** com Web Audio API (OscillatorNode, BiquadFilter, Gain/Stereo).
- 🎵 **Player howler.js** com upload local (File API), loop, volume e pan ajustáveis.
- 💾 **Armazenamento offline**: presets, músicas (IndexedDB/localForage) e histórico de sessões.
- 🌀 **Texturas nativas sintetizadas** (Delta Oceanic 2Hz, Teta Respiração 6Hz, Alfa Drone 10Hz, Sigma Harmonics 14Hz, Beta Focus 18Hz, Gama Clarity 32Hz) geradas via Web Audio e disponíveis mesmo sem uploads.
- 📡 **PWA completa**: manifest, service worker com Workbox, modo offline e instalável.
- 🌐 **Integração com Internet Archive**: busque e baixe músicas ambient/meditação de domínio público diretamente para sua biblioteca offline — sem cadastro, sem limites.
- 📚 **Guia científico embutido** + termos de uso obrigatórios.

## Uso rápido

1. Abra `index.html` em um servidor estático (ex.: `npm serve`, `python -m http.server`).
2. Aceite os termos de responsabilidade.
3. Carregue músicas locais (MP3/WAV) arrastando para a biblioteca ou use o **Internet Archive** para buscar sons gratuitos.
4. Ajuste sliders do preset, escolha playlist ou use sugestões automáticas e clique em **Iniciar sessão**.
5. Instale como PWA pelo botão **Instalar** para uso offline em desktop ou mobile.

### Buscar no Internet Archive

1. Na seção **Playlist terapêutica**, clique em "Buscar no Internet Archive".
2. Digite termos como `ambient meditation`, `nature sounds`, `drone music`, etc.
3. Escolha uma categoria opcional para refinar a busca.
4. Clique em **Buscar** e aguarde os resultados.
5. Use o botão 🎧 para ouvir um preview ou **Baixar** para salvar na biblioteca local.
6. Os arquivos baixados ficam disponíveis offline e aparecem na lista de músicas com o badge "Archive".

## Desenvolvimento

- HTML/CSS/JS puros, mobile-first.
- Dependências externas via CDN (`howler`, `localforage`, `workbox-window`).
- `sw.js` usa Workbox para cache estático/dinâmico (áudio incluso).
- `presets.json` contém 5 protocolos baseados na literatura.
- Biblioteca inclui 6 texturas geradas localmente; uploads pessoais continuam funcionando offline.

## Cuidados terapêuticos

Ferramenta educacional voltada a profissionais habilitados. Siga as contraindicações descritas no modal inicial e mantenha volume < 80dB.
