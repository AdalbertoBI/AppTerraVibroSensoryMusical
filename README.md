# Terra Sensory Musical (VibroTerapia)

Progressive Web App 100% client-side para terapeutas de vibroacústica e musicoterapia. Reproduz tons binaurais reais, integra playlists locais via howler.js, funciona offline e oferece referências científicas de Skille, Oster, Wigram e Spintge.

**Versão 1.1.0.0** - Arquitetura modular ES6 + Áudio 8D espacial

## Recursos principais

- 🎧 **Geração binaural real** com Web Audio API (OscillatorNode, BiquadFilter, Gain/Stereo).
- 🎵 **Player howler.js** com upload local (File API), loop, volume e pan ajustáveis.
- � **Áudio 8D Espacial** - Processamento HRTF para som imersivo que circula ao redor da cabeça.
- �💾 **Armazenamento offline**: presets, músicas (IndexedDB/localForage) e histórico de sessões.
- 🌀 **Texturas nativas sintetizadas** (Delta Oceanic 2Hz, Teta Respiração 6Hz, Alfa Drone 10Hz, Sigma Harmonics 14Hz, Beta Focus 18Hz, Gama Clarity 32Hz) geradas via Web Audio e disponíveis mesmo sem uploads.
- 📡 **PWA completa**: manifest, service worker com Workbox, modo offline e instalável.
- 🌐 **Integração com Internet Archive**: busque e baixe músicas ambient/meditação de domínio público diretamente para sua biblioteca offline — sem cadastro, sem limites.
- � **Monitor de Áudio Profissional** - Visualização em tempo real de espectro, forma de onda L/R e níveis VU.
- �📚 **Guia científico embutido** + termos de uso obrigatórios.

## Áudio 8D - Base Científica

O processamento de áudio 8D utiliza técnicas baseadas em pesquisas em psicoacústica:

- **HRTF** (Møller, 1992): Head-Related Transfer Function que modela como o som é filtrado pelos ouvidos
- **ITD/ILD** (Blauert, 1997): Diferenças de tempo e intensidade interaural
- **Imersão** (Västfjäll, 2003): Ambientes sonoros imersivos aumentam presença e experiências emocionais

Padrões de movimento disponíveis: Circular, Infinito (∞), Aleatório e Pêndulo.

## Arquitetura Modular

```text
sensory_Musical/
├── index.html              # Entrada principal
├── app.js                  # Aplicação legada (mantida para compatibilidade)
├── sw.js                   # Service Worker PWA
├── js/
│   ├── main.js            # Ponto de entrada modular
│   ├── core/
│   │   └── state.js       # Estado global da aplicação
│   ├── audio/
│   │   ├── audioContext.js   # Gerenciamento do AudioContext
│   │   ├── binaural.js       # Geração de batimentos binaurais
│   │   ├── audio8d.js        # Processador de áudio 8D espacial
│   │   └── player.js         # Player de música (Howler.js)
│   ├── monitor/
│   │   └── audioMonitor.js   # Monitor de áudio em tempo real
│   ├── patients/
│   │   └── patientManager.js # Gerenciamento de pacientes
│   ├── ui/
│   │   ├── controls.js       # Controles do formulário
│   │   └── tutorial.js       # Sistema de onboarding
│   └── utils/
│       └── storage.js        # Utilitários de armazenamento
├── css/
│   └── modules.css        # Estilos dos novos componentes
├── data/
│   └── scientific_references.json  # Referências científicas
└── icons/
```

## Uso rápido

1. Abra `index.html` em um servidor estático (ex.: `npm serve`, `python -m http.server`).
2. Aceite os termos de responsabilidade.
3. Carregue músicas locais (MP3/WAV) arrastando para a biblioteca ou use o **Internet Archive** para buscar sons gratuitos.
4. **NOVO**: Ative o **Áudio 8D** para experiência imersiva (requer fones de ouvido).
5. Ajuste sliders do preset, escolha playlist ou use sugestões automáticas e clique em **Iniciar sessão**.
6. Use o **Monitor de Áudio** para visualização profissional em tempo real.
7. Instale como PWA pelo botão **Instalar** para uso offline em desktop ou mobile.

### Buscar no Internet Archive

1. Na seção **Playlist terapêutica**, clique em "Buscar no Internet Archive".
2. Digite termos como `ambient meditation`, `nature sounds`, `drone music`, etc.
3. Escolha uma categoria opcional para refinar a busca.
4. Clique em **Buscar** e aguarde os resultados.
5. Use o botão 🎧 para ouvir um preview ou **Baixar** para salvar na biblioteca local.
6. Os arquivos baixados ficam disponíveis offline e aparecem na lista de músicas com o badge "Archive".

## Desenvolvimento

- HTML/CSS/JS puros, mobile-first.
- **Arquitetura modular ES6** com imports/exports.
- Dependências externas via CDN (`howler`, `localforage`, `workbox-window`).
- `sw.js` usa Workbox para cache estático/dinâmico (áudio incluso).
- `presets.json` contém 5 protocolos baseados na literatura.
- `data/scientific_references.json` contém referências científicas do áudio 8D e batimentos binaurais.
- Biblioteca inclui 6 texturas geradas localmente; uploads pessoais continuam funcionando offline.

## Cuidados terapêuticos

Ferramenta educacional voltada a profissionais habilitados. Siga as contraindicações descritas no modal inicial e mantenha volume < 80dB.

**Importante para Áudio 8D:**

- Use sempre fones de ouvido para o efeito completo
- Evite velocidades muito altas por longos períodos
- Pacientes com vertigem ou labirintite devem usar com cautela
