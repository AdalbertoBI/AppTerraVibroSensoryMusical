# Terra Vibro Sensory Musical - Documentação de Arquitetura

**Versão:** 1.0.0  
**Última Atualização:** Janeiro 2025  
**Status:** Sistema Funcional (Refatoração Recomendada)

---

## 📋 Sumário

1. [Visão Geral](#visão-geral)
2. [Estrutura de Diretórios](#estrutura-de-diretórios)
3. [Arquitetura do Sistema](#arquitetura-do-sistema)
4. [Módulos e Componentes](#módulos-e-componentes)
5. [Fluxo de Dados](#fluxo-de-dados)
6. [APIs Externas e Dependências](#apis-externas-e-dependências)
7. [Armazenamento de Dados](#armazenamento-de-dados)
8. [Estado da Aplicação](#estado-da-aplicação)
9. [Plano de Refatoração](#plano-de-refatoração)

---

## 🎯 Visão Geral

O **Terra Vibro Sensory Musical** é uma aplicação web progressiva (PWA) para terapia sonora que combina:

- **Batimentos Binaurais**: Geração de frequências binaurais para indução de estados cerebrais
- **Player de Áudio**: Reprodução de músicas terapêuticas locais e streaming
- **Integração YouTube**: Streaming de vídeos terapêuticos
- **Áudio 8D**: Efeito de rotação espacial panorâmica
- **Aprimorador de Áudio**: Equalização e compressão em tempo real
- **Sistema de Pacientes**: Gerenciamento de pacientes com anamnese completa
- **Monitor de Áudio**: Visualização em tempo real de frequências e volumes

### Stack Tecnológico

| Tecnologia | Uso |
|------------|-----|
| **Web Audio API** | Geração de binaurais, análise FFT, processamento de áudio |
| **Howler.js** | Reprodução de áudio local com controle de stereo/volume |
| **YouTube IFrame API** | Streaming de vídeos do YouTube |
| **localforage** | Persistência IndexedDB para dados e áudios |
| **Workbox 6.5.4** | Service Worker para PWA offline |

---

## 📁 Estrutura de Diretórios

```
AppTerraVibroSensoryMusical/
├── app.js                 # ARQUIVO PRINCIPAL (7113 linhas) - Monolítico
├── index.html             # Interface principal
├── style.css              # Estilos (7814+ linhas)
├── manifest.json          # Manifest PWA
├── sw.js                  # Service Worker
├── presets.json           # Presets binaurais padrão
│
├── js/                    # MÓDULOS ES6 (estrutura nova)
│   ├── main.js            # Novo ponto de entrada modular (780 linhas)
│   ├── audio/
│   │   ├── audio8d.js          # Processador Áudio 8D
│   │   ├── audioContext.js     # Gerenciador de contexto de áudio
│   │   ├── audioEnhancer.js    # Aprimorador de áudio
│   │   ├── binaural.js         # Geração de binaurais
│   │   ├── player.js           # Player de áudio
│   │   └── therapeuticSounds.js # Gerador de sons terapêuticos
│   ├── core/
│   │   └── state.js            # Estado global centralizado
│   ├── monitor/
│   │   └── audioMonitor.js     # Monitor de áudio
│   ├── patients/
│   │   └── patientManager.js   # Gerenciador de pacientes
│   ├── ui/
│   │   ├── controls.js         # Controles da interface
│   │   ├── scientificContent.js # Conteúdo científico
│   │   └── tutorial.js         # Sistema de tutorial
│   └── utils/
│       └── storage.js          # Utilitários de armazenamento
│
├── data/
│   ├── bibliography.json           # Bibliografia científica
│   ├── scientific_foundations.json # Fundamentos científicos
│   ├── scientific_references.json  # Referências científicas
│   └── therapeutic_presets.json    # Presets terapêuticos
│
├── audio/
│   └── default/
│       └── manifest.json       # Manifesto de áudios pré-carregados
│
├── css/
│   └── modules.css            # Estilos modulares
│
├── icons/                     # Ícones da PWA
├── libs/                      # Bibliotecas externas
└── modelo_cadastro/           # Modelos de dados de pacientes
```

---

## 🏗️ Arquitetura do Sistema

### Visão de Alto Nível

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INTERFACE (index.html)                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐            │
│  │  Sessão   │ │  Player   │ │ Pacientes │ │  Monitor  │            │
│  │ Terapêutica│ │   Bar    │ │   Bar     │ │   Áudio   │            │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘            │
├────────┼─────────────┼─────────────┼─────────────┼──────────────────┤
│        │             │             │             │                   │
│        ▼             ▼             ▼             ▼                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                         app.js                               │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │    │
│  │  │ Audio   │ │ YouTube │ │ Playlist│ │ Patients│            │    │
│  │  │ Engine  │ │ Player  │ │ Manager │ │ Manager │            │    │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘            │    │
│  │       │           │           │           │                  │    │
│  │       ▼           ▼           ▼           ▼                  │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │              STATE (Objeto Global)                   │    │    │
│  │  │  audioCtx, binauralChain, presets, musicMeta,       │    │    │
│  │  │  patients, currentPatient, playlistQueue, etc.      │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────────────┤
│                          ARMAZENAMENTO                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │  ts_data     │  │  ts_music    │  │ ts_patients  │               │
│  │  (presets,   │  │  (blobs de   │  │ (dados de    │               │
│  │   meta)      │  │   áudio)     │  │  pacientes)  │               │
│  └──────────────┘  └──────────────┘  └──────────────┘               │
│                         IndexedDB via localforage                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Módulos e Componentes

### Inventário de Funções do app.js (7113 linhas)

O arquivo `app.js` contém **170+ funções** organizadas em grupos funcionais:

#### 1. Inicialização e Configuração (Linhas 468-700)

| Função | Linha | Descrição |
|--------|-------|-----------|
| `initApp()` | 468 | Inicializa toda a aplicação |
| `cacheDom()` | 490 | Cache de referências DOM |
| `attachListeners()` | 658 | Anexa todos os event listeners |

#### 2. Sistema de Áudio Binaural (Linhas 919-2200)

| Função | Linha | Descrição |
|--------|-------|-----------|
| `setupAudioGraph()` | 919 | Cria contexto de áudio e master gain |
| `buildBinauralChain(preset)` | 2050 | Constrói cadeia de osciladores binaurais |
| `stopBinaural()` | 2130 | Para e desconecta osciladores |
| `updateBinauralFrequenciesRealtime()` | 2090 | Atualiza frequências em tempo real |
| `updateBinauralVolumeRealtime()` | 2125 | Atualiza volume em tempo real |
| `updateLowPassRealtime()` | 2115 | Atualiza filtro low-pass em tempo real |

#### 3. Player YouTube (Linhas 1050-1500)

| Função | Linha | Descrição |
|--------|-------|-----------|
| `getYoutubePlayerContainer()` | 1083 | Cria container oculto para player |
| `loadYoutubeAPI()` | 1102 | Carrega YouTube IFrame API |
| `playYoutubeAudio(id, opts)` | 1127 | Toca vídeo do YouTube (áudio only) |
| `stopYoutubeAudio()` | 1245 | Para reprodução do YouTube |
| `toggleYoutubePause()` | 1259 | Pausa/resume YouTube |
| `openYoutubeFullscreen(id, title)` | 1270 | Abre modal fullscreen |
| `closeYoutubeFullscreen()` | 1340 | Fecha modal fullscreen |
| `updateControlsForYoutubeMode(active)` | 1196 | Desabilita controles incompatíveis |

#### 4. Controles de Sessão (Linhas 2000-2500)

| Função | Linha | Descrição |
|--------|-------|-----------|
| `startSession(preset)` | 2010 | Inicia sessão terapêutica |
| `resumeAudioContext()` | 2040 | Resume contexto suspenso |
| `scheduleMixer(preset)` | 2046 | Configura mixer binaural/música |
| `applyMix()` | 2055 | Aplica proporção de mix |
| `handlePlay()` | 1730 | Handler do botão play |
| `handlePause()` | 1780 | Handler do botão pause |
| `stopSession()` | 1800 | Para sessão completamente |

#### 5. Sistema de Upload (Linhas 2500-2800)

| Função | Linha | Descrição |
|--------|-------|-----------|
| `startUploadValidation(files)` | 2505 | Inicia validação de arquivos |
| `validateSingleFile(file, index)` | 2545 | Valida um arquivo de áudio |
| `confirmUploadValidation()` | 2615 | Confirma upload dos válidos |
| `cancelUploadValidation()` | 2700 | Cancela processo de upload |
| `persistTrack(file)` | 2735 | Persiste arquivo no IndexedDB |
| `analyzeLowEnergy(blob)` | 2765 | Análise espectral de graves |

#### 6. Playlist Unificada (Linhas 2800-3260)

| Função | Linha | Descrição |
|--------|-------|-----------|
| `renderMusicList()` | 2810 | Alias para renderPlaylistUnified |
| `updatePlaylistSelect()` | 2814 | Alias para renderPlaylistUnified |
| `renderPlaylistUnified()` | 2820 | Renderiza playlist completa |
| `renderDefaultSoundsInPlaylist()` | 2825 | Renderiza sons padrão na playlist |
| `togglePreview(id, btn, li)` | 3320 | Toggle preview de áudio |
| `stopPreview()` | 3400 | Para preview atual |
| `removeTrack(id)` | 3240 | Remove faixa do IndexedDB |
| `handleFavoriteToggle(id, btn, li)` | 3208 | Alterna favorito de faixa |

#### 7. Timer e Respiração (Linhas 1830-1900)

| Função | Linha | Descrição |
|--------|-------|-----------|
| `startTimer(duration)` | 1830 | Inicia cronômetro da sessão |
| `tickTimer()` | 1850 | Tick do cronômetro (1s) |
| `formatTime(seconds)` | 1890 | Formata segundos para MM:SS |
| `startBreathingGuide(diffHz)` | 4933 | Inicia guia de respiração |
| `stopBreathingGuide()` | 4990 | Para guia de respiração |

#### 8. Tutorial Guiado (Linhas 3843-4255)

| Função | Linha | Descrição |
|--------|-------|-----------|
| `startGuidedTutorial()` | 3843 | Inicia tutorial interativo |
| `showTutorialStep(index)` | 3900 | Mostra step do tutorial |
| `positionTooltip(element)` | 3960 | Posiciona tooltip no elemento |
| `nextTutorialStep()` | 4050 | Avança para próximo step |
| `prevTutorialStep()` | 4080 | Volta para step anterior |
| `endTutorial()` | 4100 | Finaliza tutorial |

#### 9. Sistema de Pacientes (Linhas 5236-6162)

| Função | Linha | Descrição |
|--------|-------|-----------|
| `hydratePatients()` | 5245 | Carrega pacientes do IndexedDB |
| `persistPatients()` | 5270 | Salva lista de pacientes |
| `persistCurrentPatient()` | 5280 | Salva paciente atual |
| `updatePatientBar()` | 5290 | Atualiza barra de paciente |
| `openPatientModal(patient)` | 5320 | Abre modal de cadastro |
| `closePatientModal()` | 5365 | Fecha modal de paciente |
| `openPatientsListModal()` | 5380 | Abre lista de pacientes |
| `savePatient()` | 5600 | Salva paciente no IndexedDB |
| `deletePatient(id)` | 5700 | Remove paciente |
| `selectPatient(id)` | 5730 | Seleciona paciente ativo |
| `renderPatientsList(patients)` | 5500 | Renderiza lista de pacientes |
| `exportPatientsData()` | 5850 | Exporta dados em JSON |
| `importPatientsData(file)` | 5900 | Importa dados de arquivo |

#### 10. Áudio 8D e Enhancer (Linhas 6199-6547)

| Função | Linha | Descrição |
|--------|-------|-----------|
| `toggleAudio8D()` | 6230 | Liga/desliga Audio 8D |
| `initAudio8D()` | 6270 | Inicializa efeito 8D |
| `stopAudio8D()` | 6290 | Para efeito 8D |
| `startAudio8DAnimation()` | 6310 | Inicia animação de pan |
| `applyPanToHowl(howl, value)` | 6400 | Aplica pan em um Howl |
| `toggleEnhancer()` | 6430 | Liga/desliga Enhancer |
| `initEnhancer()` | 6460 | Inicializa equalização |
| `stopEnhancer()` | 6500 | Para enhancer |

#### 11. Monitor de Áudio (Linhas 6200-7113)

| Função | Linha | Descrição |
|--------|-------|-----------|
| `openAudioMonitor()` | 6200 | Abre monitor de áudio |
| `setupAudioAnalysers()` | 6260 | Configura analysers FFT |
| `startAudioMonitorAnimation()` | 6340 | Inicia animação do monitor |
| `drawSpectrum()` | 6400 | Desenha espectro de frequências |
| `drawWaveform()` | 6500 | Desenha forma de onda |
| `updateVolumeMeter()` | 6940 | Atualiza medidores de volume |
| `updateFrequencyDisplays()` | 6980 | Atualiza displays de frequência |
| `detectDominantFrequency()` | 7050 | Detecta frequência dominante via FFT |

#### 12. Utilitários (Dispersos)

| Função | Linha | Descrição |
|--------|-------|-----------|
| `showToast(msg, type, dur)` | 163 | Exibe notificação toast |
| `uuid()` | 84 | Gera UUID único |
| `wait(ms)` | 2790 | Promise de espera |
| `loadFavorites()` | 99 | Carrega favoritos |
| `saveFavorites(favs)` | 115 | Salva favoritos |
| `toggleFavorite(id)` | 127 | Alterna favorito |
| `isFavorite(id, favs)` | 149 | Verifica se é favorito |

---

## 🔄 Fluxo de Dados

### 1. Início da Sessão Terapêutica

```
┌─────────────────┐
│  Usuário clica  │
│     PLAY        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  handlePlay()   │
│  - Coleta dados │
│  - Cria preset  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ startSession()  │────▶│ buildBinauralChain()
│                 │     │ - Cria osciladores
└────────┬────────┘     │ - Conecta cadeia
         │              └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ setupPlaylist() │────▶│ Carrega Howl ou │
│                 │     │ YouTube Player  │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│  startTimer()   │
│  - Atualiza UI  │
│  - tickTimer()  │
└─────────────────┘
```

### 2. Fluxo de Upload de Áudio

```
┌─────────────────┐
│ Arquivo(s)      │
│ selecionado(s)  │
└────────┬────────┘
         │
         ▼
┌──────────────────────┐
│ startUploadValidation│
│ - Exibe área preview │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ validateSingleFile() │◀───┐
│ - Verifica formato   │    │
│ - Analisa espectro   │    │ Para cada arquivo
│ - Determina tag      │────┘
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ Usuário confirma     │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ confirmUploadValidation
│ - persistTrack()     │
│ - Salva em IndexedDB │
│ - Atualiza playlist  │
└──────────────────────┘
```

### 3. Fluxo do Player YouTube

```
┌─────────────────┐
│ Usuário adiciona│
│ URL do YouTube  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Extrai videoId  │
│ Valida URL      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ playYoutubeAudio│
│ - loadYoutubeAPI│
│ - Cria YT.Player│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ updateControls  │
│ ForYoutubeMode  │
│ - Desabilita 8D │
│ - Desabilita Pan│
└─────────────────┘
```

---

## 🔌 APIs Externas e Dependências

### Dependências CDN

| Biblioteca | Versão | Uso |
|------------|--------|-----|
| Workbox | 6.5.4 | Service Worker para PWA |
| Howler.js | 2.x | Reprodução de áudio |
| YouTube IFrame API | - | Streaming de vídeos |
| Font Awesome | 6.x | Ícones |

### Web APIs Utilizadas

| API | Uso |
|-----|-----|
| Web Audio API | Geração de binaurais, análise FFT |
| IndexedDB | Armazenamento de dados e áudios |
| MediaSession API | Controles de mídia do sistema |
| Service Worker API | PWA offline |
| Crypto API | Geração de UUIDs |

---

## 💾 Armazenamento de Dados

### Stores IndexedDB (via localforage)

```javascript
const stores = {
	// Dados gerais (presets, metadados de música)
	data: localforage.createInstance({ 
		name: 'terra-sensory', 
		storeName: 'ts_data' 
	}),
	
	// Blobs de áudio
	music: localforage.createInstance({ 
		name: 'terra-sensory', 
		storeName: 'ts_music' 
	}),
	
	// Histórico de sessões
	history: localforage.createInstance({ 
		name: 'terra-sensory', 
		storeName: 'ts_history' 
	}),
	
	// Dados de pacientes (persistente separado)
	patients: localforage.createInstance({ 
		name: 'terra-sensory-patients', 
		storeName: 'ts_patients'
	})
};
```

### Chaves de Armazenamento

```javascript
const STORAGE_KEYS = {
	PRESETS: 'presets',
	MUSIC_META: 'musicMeta',
	HISTORY: 'sessionHistory',
	PATIENTS: 'patients',
	CURRENT_PATIENT: 'currentPatient'
};
```

---

## 📊 Estado da Aplicação

### Objeto State Principal

```javascript
const state = {
	// Contexto Web Audio
	audioCtx: null,           // AudioContext
	masterGain: null,         // GainNode master
	binauralChain: null,      // Cadeia de osciladores binaurais
	
	// Dados de sessão
	presets: [],              // Array de presets binaurais
	musicMeta: [],            // Metadados das músicas
	playlistQueue: [],        // Fila de reprodução
	selectedPlaylist: [],     // Músicas selecionadas
	currentTrackIndex: 0,     // Índice atual na playlist
	
	// Player
	currentHowl: null,        // Howl atual (single track)
	activeHowls: [],          // Howls ativos (múltiplas faixas)
	
	// Controles
	mixRatio: 0.7,            // Proporção binaural/música
	currentPan: 0,            // Pan estéreo (-1 a 1)
	
	// Timer
	timerId: null,            // ID do setInterval
	remainingSeconds: 0,      // Segundos restantes
	isSessionRunning: false,  // Sessão ativa?
	
	// PWA
	wb: null,                 // Workbox instance
	deferredPrompt: null,     // Prompt de instalação
	
	// Pacientes
	patients: [],             // Lista de pacientes
	currentPatient: null,     // Paciente ativo
	patientFormStep: 0,       // Step do formulário
	
	// Audio 8D
	audio8D: {
		enabled: false,
		speed: 50,
		intensity: 80,
		pattern: 'circular',
		angle: 0,
		animationId: null
	},
	
	// Enhancer
	enhancer: {
		enabled: false,
		preset: 'default',
		nodes: {}
	},
	
	// Monitor de Áudio
	audioMonitor: {
		isOpen: false,
		analyserLeft: null,
		analyserRight: null,
		analyserMaster: null,
		animationId: null
	}
};
```

---

## 🔧 Plano de Refatoração

### Problema Atual

O arquivo `app.js` com **7113 linhas** viola os princípios:

- **SRP (Single Responsibility Principle)**: Um arquivo faz tudo
- **Manutenibilidade**: Difícil navegar e entender
- **Testabilidade**: Impossível testar unidades isoladas
- **Reutilização**: Código acoplado

### Estrutura Modular Proposta

> ⚠️ **Nota**: Já existe uma estrutura modular parcial em `js/main.js` e subpastas.
> A refatoração deve completar a migração, não duplicar código.

```
js/
├── main.js                    # Ponto de entrada (orquestração)
├── core/
│   ├── state.js               # ✅ Existe - Estado global
│   ├── constants.js           # 🆕 Constantes e configurações
│   └── events.js              # 🆕 Event bus para comunicação
│
├── audio/
│   ├── audioContext.js        # ✅ Existe - Gerenciador de contexto
│   ├── binaural.js            # ✅ Existe - Geração binaural
│   ├── player.js              # ✅ Existe - Player Howler
│   ├── audio8d.js             # ✅ Existe - Efeito 8D
│   ├── audioEnhancer.js       # ✅ Existe - Equalização
│   ├── therapeuticSounds.js   # ✅ Existe - Sons terapêuticos
│   └── youtubePlayer.js       # 🆕 Mover código YouTube
│
├── monitor/
│   └── audioMonitor.js        # ✅ Existe - Monitor de áudio
│
├── patients/
│   └── patientManager.js      # ✅ Existe - Gerenciador de pacientes
│
├── playlist/
│   ├── playlistManager.js     # 🆕 Gerenciamento de playlist
│   ├── playlistRenderer.js    # 🆕 Renderização de playlist
│   └── uploadHandler.js       # 🆕 Upload e validação
│
├── session/
│   ├── sessionManager.js      # 🆕 Controle de sessão
│   ├── timerManager.js        # 🆕 Timer da sessão
│   └── breathingGuide.js      # 🆕 Guia de respiração
│
├── ui/
│   ├── controls.js            # ✅ Existe - Controles
│   ├── tutorial.js            # ✅ Existe - Tutorial
│   ├── scientificContent.js   # ✅ Existe - Conteúdo científico
│   ├── drawer.js              # 🆕 Menu drawer
│   ├── modals.js              # 🆕 Gerenciador de modais
│   └── toast.js               # 🆕 Notificações toast
│
└── utils/
    ├── storage.js             # ✅ Existe - Armazenamento
    ├── helpers.js             # 🆕 Funções utilitárias
    └── validators.js          # 🆕 Validadores
```

### Estratégia de Migração

1. **Fase 1**: Mover constantes e configurações para `core/constants.js`
2. **Fase 2**: Extrair código YouTube para `audio/youtubePlayer.js`
3. **Fase 3**: Criar módulos de playlist em `playlist/`
4. **Fase 4**: Criar módulos de sessão em `session/`
5. **Fase 5**: Extrair utilitários para `utils/`
6. **Fase 6**: Integrar tudo via `main.js`

### Estimativa de Esforço

| Módulo | Linhas a Migrar | Complexidade |
|--------|-----------------|--------------|
| YouTube Player | ~400 | Média |
| Playlist Manager | ~600 | Alta |
| Session Manager | ~500 | Alta |
| Timer/Breathing | ~150 | Baixa |
| Toast/Modals | ~200 | Baixa |
| Constants | ~100 | Baixa |

**Total estimado**: 15-20 horas de refatoração cuidadosa

---

## ✅ Próximos Passos

1. [ ] Criar `js/core/constants.js` com todas as constantes
2. [ ] Migrar código YouTube para `js/audio/youtubePlayer.js`
3. [ ] Criar `js/playlist/playlistManager.js`
4. [ ] Criar `js/session/sessionManager.js`
5. [ ] Atualizar `js/main.js` para importar novos módulos
6. [ ] Testar cada migração incrementalmente
7. [ ] Remover código migrado do `app.js`
8. [ ] Quando `app.js` estiver vazio, removê-lo

---

*Documentação gerada automaticamente com base na análise do código-fonte.*
