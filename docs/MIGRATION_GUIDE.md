# Guia de Migração: app.js para Módulos ES6

**Versão:** 1.0.0  
**Objetivo:** Migrar o código monolítico de `app.js` (7113 linhas) para a estrutura modular ES6 já iniciada em `js/`

---

## 1. Situação Atual

### Estrutura Existente

O projeto possui **duas implementações paralelas**:

| Arquivo | Linhas | Status |
|---------|--------|--------|
| `app.js` | 7113 | **Ativo** - Carregado pelo `index.html` |
| `js/main.js` | 780 | **Parcial** - Estrutura modular iniciada |

### Problema

O `index.html` carrega `app.js` diretamente:

```html
<script type="module" src="app.js"></script>
```

A estrutura modular em `js/` não está sendo utilizada em produção.

---

## 2. Estratégia de Migração

### Princípios

1. **Migração Incremental**: Mover funções em pequenos lotes
2. **Zero Downtime**: O sistema deve funcionar durante toda a migração
3. **Testes a Cada Passo**: Validar funcionamento após cada mudança
4. **Compatibilidade**: Manter exports para funções globais necessárias

### Fases

```
┌─────────────────────────────────────────────────────────────────┐
│                     FASE 1 - PREPARAÇÃO                          │
│  - Criar js/core/constants.js                                    │
│  - Mover STORAGE_KEYS, DIFF_BANDS, STOCK_TEXTURES               │
│  - Atualizar imports em js/main.js                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FASE 2 - YOUTUBE                             │
│  - Criar js/audio/youtubePlayer.js                               │
│  - Mover funções: loadYoutubeAPI, playYoutubeAudio, etc.        │
│  - Exportar para uso global                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FASE 3 - PLAYLIST                            │
│  - Criar js/playlist/playlistManager.js                          │
│  - Criar js/playlist/uploadHandler.js                            │
│  - Mover renderPlaylistUnified, handleFiles, persistTrack        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FASE 4 - SESSÃO                              │
│  - Criar js/session/sessionManager.js                            │
│  - Criar js/session/timerManager.js                              │
│  - Mover startSession, stopSession, timer functions              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FASE 5 - UI                                  │
│  - Criar js/ui/toast.js                                          │
│  - Criar js/ui/modals.js                                         │
│  - Mover showToast, funções de modal                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FASE 6 - INTEGRAÇÃO                          │
│  - Atualizar js/main.js com todos os imports                    │
│  - Alterar index.html para carregar js/main.js                  │
│  - Remover app.js                                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Detalhamento das Fases

### FASE 1: Preparação (Estimativa: 1-2 horas)

#### 1.1 Criar `js/core/constants.js`

```javascript
/**
 * Constantes e Configurações Globais
 * @module core/constants
 */

export const STORAGE_KEYS = {
    PRESETS: 'presets',
    MUSIC_META: 'musicMeta',
    HISTORY: 'sessionHistory',
    PATIENTS: 'patients',
    CURRENT_PATIENT: 'currentPatient'
};

export const TERMS_KEY = 'ts-terms-accepted';
export const FAVORITES_KEY = 'playlist-favorites';

export const DIFF_BANDS = [
    { range: [1, 4], label: 'Delta (sono profundo)', tag: 'delta', hz: 2 },
    { range: [4, 8], label: 'Theta (meditação)', tag: 'theta', hz: 5 },
    { range: [8, 13], label: 'Alpha (relaxamento)', tag: 'alpha', hz: 10 },
    { range: [13, 30], label: 'Beta (foco)', tag: 'beta', hz: 18 },
    { range: [30, 50], label: 'Gamma (alta cognição)', tag: 'gamma', hz: 40 }
];

export const TAG_TO_FREQUENCY = {
    delta: 2,
    theta: 5,
    alpha: 10,
    beta: 18,
    gamma: 40,
    'relax/vibro': 7,
    'meditacao': 6,
    'ativa': 15
};

export const STOCK_TEXTURES = [
    // Copiar array completo do app.js
];

export const AUDIO_FORMATS = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'webm'];

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
```

#### 1.2 Atualizar `js/core/state.js`

```javascript
import { STORAGE_KEYS, TERMS_KEY } from './constants.js';

export { STORAGE_KEYS, TERMS_KEY };

export const state = {
    // ... (manter estrutura atual)
};
```

---

### FASE 2: YouTube Player (Estimativa: 2-3 horas)

#### 2.1 Criar `js/audio/youtubePlayer.js`

```javascript
/**
 * Player YouTube - Reprodução de vídeos (apenas áudio)
 * @module audio/youtubePlayer
 */

import { state } from '../core/state.js';
import { showToast } from '../ui/toast.js';

// Estado interno do módulo
let youtubePlayer = null;
let youtubePlayerReady = false;
let currentYoutubeId = null;
let youtubeLoopEnabled = true;

/**
 * Cria container oculto para o player YouTube
 */
function getYoutubePlayerContainer() {
    // ... código do app.js linhas 1083-1100
}

/**
 * Carrega a API do YouTube IFrame
 */
export function loadYoutubeAPI() {
    // ... código do app.js linhas 1102-1125
}

/**
 * Reproduz vídeo do YouTube (apenas áudio)
 */
export async function playYoutubeAudio(youtubeId, options = {}) {
    // ... código do app.js linhas 1127-1240
}

/**
 * Para reprodução do YouTube
 */
export function stopYoutubeAudio() {
    // ... código do app.js linhas 1245-1257
}

/**
 * Pausa/Resume YouTube
 */
export function toggleYoutubePause() {
    // ... código do app.js linhas 1259-1268
}

/**
 * Abre modal fullscreen
 */
export function openYoutubeFullscreen(youtubeId, title) {
    // ... código do app.js linhas 1270-1335
}

/**
 * Fecha modal fullscreen
 */
export function closeYoutubeFullscreen() {
    // ... código do app.js linhas 1340-1348
}

/**
 * Atualiza controles para modo YouTube
 */
export function updateControlsForYoutubeMode(isActive) {
    // ... código do app.js linhas 1196-1242
}

// Getters para estado interno
export function getCurrentYoutubeId() {
    return currentYoutubeId;
}

export function isYoutubePlayerActive() {
    return youtubePlayer !== null && currentYoutubeId !== null;
}

// Expor para onclick no HTML
window.closeYoutubeFullscreen = closeYoutubeFullscreen;
```

#### 2.2 Atualizar imports em `js/main.js`

```javascript
// Adicionar
import { 
    playYoutubeAudio, 
    stopYoutubeAudio, 
    toggleYoutubePause,
    updateControlsForYoutubeMode,
    getCurrentYoutubeId,
    isYoutubePlayerActive
} from './audio/youtubePlayer.js';
```

#### 2.3 Remover código do `app.js`

Após validar que funciona, remover linhas 1050-1500 do `app.js`.

---

### FASE 3: Playlist (Estimativa: 3-4 horas)

#### 3.1 Criar `js/playlist/playlistManager.js`

```javascript
/**
 * Gerenciador de Playlist Unificada
 * @module playlist/playlistManager
 */

import { state } from '../core/state.js';
import { stores } from '../utils/storage.js';
import { STORAGE_KEYS } from '../core/constants.js';
import { showToast } from '../ui/toast.js';
import { loadFavorites, toggleFavorite } from './favorites.js';

// Estado de preview
let currentPreview = null;
let currentPreviewId = null;

/**
 * Renderiza playlist completa
 */
export async function renderPlaylistUnified() {
    // ... código do app.js
}

/**
 * Toggle preview de uma faixa
 */
export async function togglePreview(trackId, button, li) {
    // ...
}

/**
 * Para preview atual
 */
export function stopPreview() {
    // ...
}

/**
 * Remove faixa
 */
export async function removeTrack(trackId) {
    // ...
}

/**
 * Toggle favorito
 */
export async function handleFavoriteToggle(trackId, button, li) {
    // ...
}

/**
 * Exporta faixa para arquivo
 */
export async function exportTrackToFile(trackId) {
    // ...
}
```

#### 3.2 Criar `js/playlist/uploadHandler.js`

```javascript
/**
 * Handler de Upload de Arquivos
 * @module playlist/uploadHandler
 */

import { state } from '../core/state.js';
import { stores, uuid } from '../utils/storage.js';
import { STORAGE_KEYS, AUDIO_FORMATS, MAX_FILE_SIZE } from '../core/constants.js';
import { showToast } from '../ui/toast.js';
import { renderPlaylistUnified } from './playlistManager.js';

// Estado de validação
let uploadValidationState = {
    files: [],
    validated: [],
    validCount: 0,
    isValidating: false
};

/**
 * Inicia validação de arquivos
 */
export async function startUploadValidation(fileList) {
    // ... código do app.js linhas 2505-2540
}

/**
 * Valida um arquivo individual
 */
export async function validateSingleFile(file, index) {
    // ... código do app.js linhas 2545-2610
}

/**
 * Confirma upload dos arquivos válidos
 */
export async function confirmUploadValidation() {
    // ... código do app.js linhas 2615-2695
}

/**
 * Cancela upload
 */
export function cancelUploadValidation() {
    // ... código do app.js linhas 2700-2730
}

/**
 * Persiste arquivo no IndexedDB
 */
export async function persistTrack(file) {
    // ... código do app.js linhas 2735-2760
}

/**
 * Analisa porcentagem de graves
 */
export async function analyzeLowEnergy(blob) {
    // ... código do app.js linhas 2765-2805
}
```

---

### FASE 4: Sessão (Estimativa: 2-3 horas)

#### 4.1 Criar `js/session/sessionManager.js`

```javascript
/**
 * Gerenciador de Sessão Terapêutica
 * @module session/sessionManager
 */

import { state } from '../core/state.js';
import { buildBinauralChain, stopBinaural } from '../audio/binaural.js';
import { stopYoutubeAudio } from '../audio/youtubePlayer.js';
import { startTimer, stopTimer } from './timerManager.js';
import { startBreathingGuide, stopBreathingGuide } from './breathingGuide.js';
import { openAudioMonitor } from '../monitor/audioMonitor.js';

/**
 * Inicia sessão terapêutica
 */
export async function startSession(preset) {
    // ...
}

/**
 * Para sessão
 */
export function stopSession() {
    // ...
}

/**
 * Handler do botão play
 */
export async function handlePlay() {
    // ...
}

/**
 * Handler do botão pause
 */
export function handlePause() {
    // ...
}
```

#### 4.2 Criar `js/session/timerManager.js`

```javascript
/**
 * Gerenciador de Timer da Sessão
 * @module session/timerManager
 */

import { state } from '../core/state.js';

/**
 * Inicia timer
 */
export function startTimer(durationMinutes) {
    // ...
}

/**
 * Tick do timer
 */
export function tickTimer() {
    // ...
}

/**
 * Para timer
 */
export function stopTimer() {
    // ...
}

/**
 * Formata tempo
 */
export function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
```

---

### FASE 5: UI (Estimativa: 1-2 horas)

#### 5.1 Criar `js/ui/toast.js`

```javascript
/**
 * Sistema de Notificações Toast
 * @module ui/toast
 */

const ICONS = {
    success: 'fa-circle-check',
    error: 'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info: 'fa-circle-info'
};

/**
 * Exibe notificação toast
 */
export function showToast(message, type = 'info', duration = 3000) {
    // Remove toast anterior
    const existing = document.querySelector('.app-toast');
    if (existing) existing.remove();
    
    // Cria toast
    const toast = document.createElement('div');
    toast.className = `app-toast app-toast--${type}`;
    toast.innerHTML = `
        <i class="fa-solid ${ICONS[type] || ICONS.info}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    toast.offsetHeight; // Force reflow
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}
```

---

### FASE 6: Integração Final (Estimativa: 2-3 horas)

#### 6.1 Atualizar `js/main.js`

```javascript
/**
 * TERRA VIBRO SENSORY MUSICAL - Ponto de Entrada
 * @module main
 */

// Core
import { state, STORAGE_KEYS, TERMS_KEY } from './core/state.js';
import { DIFF_BANDS, TAG_TO_FREQUENCY, STOCK_TEXTURES } from './core/constants.js';
import { stores, uuid } from './utils/storage.js';

// Audio
import { setupAudioContext, resumeAudioContext } from './audio/audioContext.js';
import { buildBinauralChain, stopBinaural, updateBinauralFrequencies } from './audio/binaural.js';
import { playYoutubeAudio, stopYoutubeAudio, updateControlsForYoutubeMode } from './audio/youtubePlayer.js';
import Audio8DProcessor from './audio/audio8d.js';
import { AudioEnhancer } from './audio/audioEnhancer.js';
import player from './audio/player.js';

// Session
import { startSession, stopSession, handlePlay, handlePause } from './session/sessionManager.js';
import { startTimer, stopTimer, formatTime } from './session/timerManager.js';

// Playlist
import { renderPlaylistUnified, togglePreview, stopPreview, removeTrack } from './playlist/playlistManager.js';
import { startUploadValidation, confirmUploadValidation } from './playlist/uploadHandler.js';

// UI
import { showToast } from './ui/toast.js';
import controls from './ui/controls.js';
import tutorial from './ui/tutorial.js';
import { initScientificContent } from './ui/scientificContent.js';

// Monitor
import audioMonitor from './monitor/audioMonitor.js';

// Patients
import patientManager from './patients/patientManager.js';

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

const ui = {};

async function initApp() {
    cacheDom();
    attachListeners();
    // ... resto da inicialização
}

// ... resto do código
```

#### 6.2 Alterar `index.html`

```html
<!-- Antes -->
<script type="module" src="app.js"></script>

<!-- Depois -->
<script type="module" src="js/main.js"></script>
```

#### 6.3 Remover `app.js`

Após validar que tudo funciona, deletar `app.js`.

---

## 4. Checklist de Migração

### Fase 1 - Preparação
- [ ] Criar `js/core/constants.js`
- [ ] Mover constantes do `app.js`
- [ ] Atualizar imports em `state.js`
- [ ] Testar aplicação

### Fase 2 - YouTube
- [ ] Criar `js/audio/youtubePlayer.js`
- [ ] Mover funções YouTube
- [ ] Atualizar `main.js`
- [ ] Remover código do `app.js`
- [ ] Testar reprodução YouTube

### Fase 3 - Playlist
- [ ] Criar `js/playlist/playlistManager.js`
- [ ] Criar `js/playlist/uploadHandler.js`
- [ ] Mover funções de playlist
- [ ] Testar upload e renderização

### Fase 4 - Sessão
- [ ] Criar `js/session/sessionManager.js`
- [ ] Criar `js/session/timerManager.js`
- [ ] Mover funções de sessão
- [ ] Testar iniciar/parar sessão

### Fase 5 - UI
- [ ] Criar `js/ui/toast.js`
- [ ] Mover showToast
- [ ] Testar notificações

### Fase 6 - Integração
- [ ] Atualizar `main.js` completo
- [ ] Alterar `index.html`
- [ ] Testar todas as funcionalidades
- [ ] Remover `app.js`

---

## 5. Testes de Validação

Após cada fase, verificar:

1. **Sessão Terapêutica**
   - [ ] Iniciar sessão com binaural
   - [ ] Pausar e retomar
   - [ ] Timer funciona
   - [ ] Parar sessão

2. **Playlist**
   - [ ] Upload de arquivos
   - [ ] Validação funciona
   - [ ] Preview de áudio
   - [ ] Favoritos

3. **YouTube**
   - [ ] Adicionar vídeo
   - [ ] Preview funciona
   - [ ] Fullscreen abre/fecha
   - [ ] Controles desabilitados

4. **Pacientes**
   - [ ] Criar paciente
   - [ ] Editar paciente
   - [ ] Selecionar paciente
   - [ ] Exportar/Importar

5. **Efeitos**
   - [ ] Audio 8D liga/desliga
   - [ ] Enhancer funciona
   - [ ] Monitor de áudio

---

## 6. Rollback

Se algo der errado:

1. Reverter alteração em `index.html`
2. Restaurar `app.js` do git:
   ```bash
   git checkout HEAD -- app.js
   ```
3. Identificar e corrigir problema no módulo

---

*Guia de migração gerado com base na análise do código-fonte.*
