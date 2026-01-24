# Terra Vibro Sensory Musical - Documentação de API

**Versão:** 1.0.0  
**Última Atualização:** Janeiro 2025

---

## 📋 Sumário

1. [Estado Global (State)](#estado-global-state)
2. [API de Áudio Binaural](#api-de-áudio-binaural)
3. [API do Player YouTube](#api-do-player-youtube)
4. [API de Playlist](#api-de-playlist)
5. [API de Sessão Terapêutica](#api-de-sessão-terapêutica)
6. [API de Pacientes](#api-de-pacientes)
7. [API de Audio 8D](#api-de-audio-8d)
8. [API do Monitor de Áudio](#api-do-monitor-de-áudio)
9. [Utilitários](#utilitários)

---

## 🔄 Estado Global (State)

### Estrutura Completa

```javascript
const state = {
	// ===== CONTEXTO DE ÁUDIO =====
	audioCtx: AudioContext | null,
	masterGain: GainNode | null,
	binauralChain: BinauralChain | null,
	
	// ===== DADOS DE MÍDIA =====
	presets: Preset[],
	musicMeta: TrackMeta[],
	playlistQueue: string[],
	selectedPlaylist: string[],
	currentTrackIndex: number,
	currentHowl: Howl | null,
	activeHowls: Howl[],
	
	// ===== CONTROLES =====
	mixRatio: number,        // 0-1
	currentPan: number,      // -1 a 1
	
	// ===== TIMER =====
	timerId: number | null,
	remainingSeconds: number,
	isSessionRunning: boolean,
	
	// ===== PWA =====
	wb: Workbox | null,
	deferredPrompt: BeforeInstallPromptEvent | null,
	musicObjectUrls: string[],
	history: SessionLog[],
	
	// ===== PACIENTES =====
	patients: Patient[],
	currentPatient: Patient | null,
	patientFormStep: number,
	
	// ===== AUDIO 8D =====
	audio8D: Audio8DState,
	
	// ===== ENHANCER =====
	enhancer: EnhancerState,
	
	// ===== MONITOR =====
	audioMonitor: AudioMonitorState
};
```

### Tipos de Dados

```typescript
interface Preset {
	id: string;
	name: string;
	baseHz: number;        // 40-500 Hz
	diffHz: number;        // 1-40 Hz
	duration: number;      // minutos
	binauralVolume: number; // 0-100
	lowPass: number;       // 30-120 Hz
	playlist?: string[];
	description?: string;
	therapeutic?: string;
}

interface TrackMeta {
	id: string;
	name: string;
	size: number;
	type: string;          // MIME type
	tag: 'delta' | 'theta' | 'alpha' | 'beta' | 'gamma' | 'relax/vibro' | 'meditacao' | 'ativa';
	lowEnergyPct: number;  // 0-100
	addedAt: number;       // timestamp
	origin: 'upload' | 'bundled' | 'textura-nativa' | 'internet-archive' | 'youtube';
	youtubeId?: string;
	description?: string;
}

interface BinauralChain {
	leftOsc: OscillatorNode;
	rightOsc: OscillatorNode;
	leftGain: GainNode;
	rightGain: GainNode;
	merger: ChannelMergerNode;
	lowPass: BiquadFilterNode;
	analyser: AnalyserNode;
	binauralGain: GainNode;
	freqLeft: number;
	freqRight: number;
	freqDiff: number;
}

interface Patient {
	id: string;
	identification: PatientIdentification;
	anamnesis: Anamnesis;
	sessions: PatientSession[];
	createdAt: number;
	updatedAt: number;
}
```

---

## 🎵 API de Áudio Binaural

### `setupAudioGraph()`

Inicializa o contexto de áudio Web Audio API.

```javascript
function setupAudioGraph(): void
```

**Descrição:**
- Cria `AudioContext`
- Cria `GainNode` master com volume 0.9
- Conecta ao destino (speakers)
- Suspende contexto (aguardando interação do usuário)

**Uso:**
```javascript
setupAudioGraph();
```

---

### `buildBinauralChain(preset)`

Constrói a cadeia de osciladores binaurais.

```javascript
function buildBinauralChain(preset: Preset): void
```

**Parâmetros:**
| Nome | Tipo | Descrição |
|------|------|-----------|
| `preset` | `Preset` | Configurações da sessão |

**Fluxo de Áudio:**
```
leftOsc ──▶ leftGain ──┐
                       ├──▶ merger ──▶ lowPass ──▶ analyser ──▶ binauralGain ──▶ masterGain
rightOsc ─▶ rightGain ─┘
```

**Uso:**
```javascript
const preset = {
	baseHz: 200,
	diffHz: 10,
	binauralVolume: 70,
	lowPass: 80
};
buildBinauralChain(preset);
```

---

### `stopBinaural()`

Para e desconecta os osciladores binaurais.

```javascript
function stopBinaural(): void
```

---

### `updateBinauralFrequenciesRealtime()`

Atualiza frequências dos osciladores em tempo real (durante sessão ativa).

```javascript
function updateBinauralFrequenciesRealtime(): void
```

**Descrição:**
- Lê valores atuais dos sliders `baseFreq` e `diffFreq`
- Aplica transição suave (0.05s) para evitar cliques
- Atualiza valores guardados em `state.binauralChain`

---

### `updateBinauralVolumeRealtime()`

Atualiza volume dos osciladores em tempo real.

```javascript
function updateBinauralVolumeRealtime(): void
```

---

### `updateLowPassRealtime()`

Atualiza frequência de corte do filtro low-pass em tempo real.

```javascript
function updateLowPassRealtime(): void
```

---

## 📺 API do Player YouTube

### `loadYoutubeAPI()`

Carrega a API do YouTube IFrame dinamicamente.

```javascript
async function loadYoutubeAPI(): Promise<void>
```

**Retorno:** Promise que resolve quando a API está pronta.

---

### `playYoutubeAudio(youtubeId, options)`

Reproduz um vídeo do YouTube (apenas áudio).

```javascript
async function playYoutubeAudio(
	youtubeId: string, 
	options?: { volume?: number; loop?: boolean }
): Promise<boolean>
```

**Parâmetros:**
| Nome | Tipo | Padrão | Descrição |
|------|------|--------|-----------|
| `youtubeId` | `string` | - | ID do vídeo (11 caracteres) |
| `options.volume` | `number` | `70` | Volume (0-100) |
| `options.loop` | `boolean` | `true` | Repetir automaticamente |

**Retorno:** `true` se iniciou com sucesso, `false` se houve erro.

**Exemplo:**
```javascript
await playYoutubeAudio('dQw4w9WgXcQ', { volume: 80, loop: true });
```

---

### `stopYoutubeAudio()`

Para a reprodução do YouTube e destrói o player.

```javascript
function stopYoutubeAudio(): void
```

---

### `toggleYoutubePause()`

Pausa ou resume a reprodução do YouTube.

```javascript
function toggleYoutubePause(): void
```

---

### `openYoutubeFullscreen(youtubeId, title)`

Abre modal com vídeo em tela cheia.

```javascript
function openYoutubeFullscreen(youtubeId: string, title?: string): void
```

---

### `closeYoutubeFullscreen()`

Fecha modal do YouTube (função global).

```javascript
function closeYoutubeFullscreen(): void
// window.closeYoutubeFullscreen = closeYoutubeFullscreen;
```

---

### `updateControlsForYoutubeMode(isActive)`

Desabilita controles incompatíveis com YouTube.

```javascript
function updateControlsForYoutubeMode(isActive: boolean): void
```

**Descrição:**
Quando YouTube está ativo, desabilita:
- Toggle Audio 8D
- Toggle Enhancer
- Slider de Pan
- Exibe aviso visual

---

## 📋 API de Playlist

### `renderPlaylistUnified()`

Renderiza a playlist completa com todos os tipos de mídia.

```javascript
async function renderPlaylistUnified(): Promise<void>
```

**Descrição:**
- Renderiza músicas locais do usuário
- Renderiza sons padrão do catálogo
- Renderiza vídeos do YouTube (padrão e do usuário)
- Ordena favoritos no topo

---

### `togglePreview(trackId, button, li)`

Inicia ou para preview de uma faixa.

```javascript
async function togglePreview(
	trackId: string, 
	button: HTMLElement, 
	li: HTMLElement
): Promise<void>
```

**Parâmetros:**
| Nome | Tipo | Descrição |
|------|------|-----------|
| `trackId` | `string` | ID da faixa |
| `button` | `HTMLElement` | Botão de preview |
| `li` | `HTMLElement` | Elemento da lista |

---

### `stopPreview()`

Para qualquer preview em andamento.

```javascript
function stopPreview(): void
```

---

### `removeTrack(trackId)`

Remove uma faixa do IndexedDB e da lista.

```javascript
async function removeTrack(trackId: string): Promise<void>
```

---

### `handleFavoriteToggle(trackId, button, li)`

Alterna favorito de uma faixa e atualiza UI.

```javascript
async function handleFavoriteToggle(
	trackId: string, 
	button: HTMLElement, 
	li: HTMLElement
): Promise<void>
```

---

## 🎯 API de Sessão Terapêutica

### `startSession(preset)`

Inicia uma sessão terapêutica completa.

```javascript
async function startSession(preset: Preset): Promise<void>
```

**Descrição:**
1. Resume contexto de áudio
2. Constrói cadeia binaural
3. Configura mixer
4. Configura playlist
5. Inicia timer
6. Atualiza UI terapêutica
7. Inicia guia de respiração
8. Abre monitor de áudio
9. Registra sessão no log

---

### `stopSession()`

Para a sessão completamente.

```javascript
function stopSession(): void
```

**Descrição:**
- Para osciladores binaurais
- Para Howls ativos
- Para YouTube
- Para timer
- Reseta UI
- Para 8D e Enhancer

---

### `handlePlay()`

Handler do botão Play.

```javascript
async function handlePlay(): Promise<void>
```

**Descrição:**
- Coleta dados do formulário
- Cria preset
- Inicia sessão

---

### `handlePause()`

Handler do botão Pause.

```javascript
function handlePause(): void
```

**Descrição:**
- Pausa timer
- Pausa Howls
- Pausa YouTube
- Atualiza UI

---

### `startTimer(duration)`

Inicia cronômetro da sessão.

```javascript
function startTimer(duration: number): void
```

**Parâmetros:**
| Nome | Tipo | Descrição |
|------|------|-----------|
| `duration` | `number` | Duração em minutos |

---

### `formatTime(seconds)`

Formata segundos para MM:SS.

```javascript
function formatTime(seconds: number): string
```

**Exemplo:**
```javascript
formatTime(125); // "02:05"
```

---

## 👤 API de Pacientes

### `hydratePatients()`

Carrega pacientes do IndexedDB.

```javascript
async function hydratePatients(): Promise<void>
```

---

### `persistPatients()`

Salva lista de pacientes no IndexedDB.

```javascript
async function persistPatients(): Promise<void>
```

---

### `persistCurrentPatient()`

Salva referência ao paciente atual.

```javascript
async function persistCurrentPatient(): Promise<void>
```

---

### `openPatientModal(patient?)`

Abre modal de cadastro/edição de paciente.

```javascript
function openPatientModal(patient?: Patient): void
```

**Parâmetros:**
| Nome | Tipo | Descrição |
|------|------|-----------|
| `patient` | `Patient \| null` | Paciente para editar, ou null para novo |

---

### `closePatientModal()`

Fecha modal de paciente.

```javascript
function closePatientModal(): void
```

---

### `savePatient()`

Salva paciente no IndexedDB.

```javascript
async function savePatient(): Promise<void>
```

---

### `deletePatient(patientId)`

Remove paciente.

```javascript
async function deletePatient(patientId: string): Promise<void>
```

---

### `selectPatient(patientId)`

Define paciente como ativo.

```javascript
async function selectPatient(patientId: string): Promise<void>
```

---

### `exportPatientsData()`

Exporta dados de pacientes em JSON.

```javascript
async function exportPatientsData(): Promise<void>
```

---

### `importPatientsData(file)`

Importa pacientes de arquivo JSON.

```javascript
async function importPatientsData(file: File): Promise<void>
```

---

## 🔊 API de Audio 8D

### `toggleAudio8D()`

Liga/desliga efeito Audio 8D.

```javascript
function toggleAudio8D(): void
```

**Descrição:**
- Alterna `state.audio8D.enabled`
- Atualiza UI
- Inicia ou para animação de pan

---

### `initAudio8D()`

Inicializa efeito Audio 8D.

```javascript
function initAudio8D(): void
```

---

### `stopAudio8D()`

Para efeito Audio 8D.

```javascript
function stopAudio8D(): void
```

---

### `startAudio8DAnimation()`

Inicia animação de rotação do pan.

```javascript
function startAudio8DAnimation(): void
```

**Padrões Disponíveis:**
- `'circular'` - Movimento senoidal suave
- `'infinity'` - Movimento em forma de 8 (lemniscata)
- `'pendulum'` - Pêndulo (mais lento nos extremos)
- `'random'` - Variação aleatória suave

---

### `applyPanToHowl(howl, panValue)`

Aplica pan a um Howl.

```javascript
function applyPanToHowl(howl: Howl, panValue: number): void
```

**Parâmetros:**
| Nome | Tipo | Descrição |
|------|------|-----------|
| `howl` | `Howl` | Instância Howler |
| `panValue` | `number` | Valor de pan (-1 a 1) |

---

## 📊 API do Monitor de Áudio

### `openAudioMonitor()`

Abre e inicia o monitor de áudio.

```javascript
function openAudioMonitor(): void
```

---

### `setupAudioAnalysers()`

Configura analysers FFT para canais L/R/Master.

```javascript
function setupAudioAnalysers(): void
```

---

### `startAudioMonitorAnimation()`

Inicia loop de renderização do monitor.

```javascript
function startAudioMonitorAnimation(): void
```

---

### `drawSpectrum(analyser, canvas, color)`

Desenha espectro de frequências.

```javascript
function drawSpectrum(
	analyser: AnalyserNode, 
	canvas: HTMLCanvasElement, 
	color: string
): void
```

---

### `drawWaveform(analyser, canvas, color)`

Desenha forma de onda.

```javascript
function drawWaveform(
	analyser: AnalyserNode, 
	canvas: HTMLCanvasElement, 
	color: string
): void
```

---

### `updateVolumeMeter(channel, analyser, meterEl, peakEl, valueEl)`

Atualiza medidor de volume.

```javascript
function updateVolumeMeter(
	channel: 'left' | 'right' | 'master',
	analyser: AnalyserNode,
	meterEl: HTMLElement,
	peakEl: HTMLElement,
	valueEl: HTMLElement
): void
```

---

### `detectDominantFrequency(analyser)`

Detecta frequência dominante via FFT.

```javascript
function detectDominantFrequency(analyser: AnalyserNode): number
```

**Retorno:** Frequência em Hz, ou 0 se não detectada.

---

## 🔧 Utilitários

### `showToast(message, type, duration)`

Exibe notificação toast.

```javascript
function showToast(
	message: string, 
	type?: 'success' | 'error' | 'warning' | 'info',
	duration?: number
): void
```

**Parâmetros:**
| Nome | Tipo | Padrão | Descrição |
|------|------|--------|-----------|
| `message` | `string` | - | Texto da notificação |
| `type` | `string` | `'info'` | Tipo visual |
| `duration` | `number` | `3000` | Duração em ms |

**Exemplo:**
```javascript
showToast('Arquivo salvo com sucesso!', 'success', 2000);
```

---

### `uuid()`

Gera identificador único.

```javascript
function uuid(): string
```

**Retorno:** UUID v4 (ou fallback com timestamp).

---

### `wait(ms)`

Promise que resolve após delay.

```javascript
function wait(ms: number): Promise<void>
```

---

### `loadFavorites()`

Carrega lista de IDs favoritos.

```javascript
async function loadFavorites(): Promise<string[]>
```

---

### `saveFavorites(favorites)`

Salva lista de favoritos.

```javascript
async function saveFavorites(favorites: string[]): Promise<void>
```

---

### `toggleFavorite(trackId)`

Alterna favorito de uma faixa.

```javascript
async function toggleFavorite(trackId: string): Promise<boolean>
```

**Retorno:** `true` se agora é favorito, `false` se foi removido.

---

### `isFavorite(trackId, favorites)`

Verifica se faixa é favorita.

```javascript
function isFavorite(trackId: string, favorites: string[]): boolean
```

---

### `analyzeLowEnergy(blob)`

Analisa porcentagem de graves de um áudio.

```javascript
async function analyzeLowEnergy(blob: Blob): Promise<number>
```

**Descrição:**
1. Decodifica áudio
2. Analisa espectro via FFT
3. Calcula proporção de energia em frequências ≤200 Hz

**Retorno:** Porcentagem de energia em graves (0-100).

---

*Documentação de API gerada com base na análise do código-fonte.*
