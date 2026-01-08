/**
 * =============================================================================
 * TERRA SENSORY MUSICAL - Player de Música
 * =============================================================================
 * 
 * Gerencia a reprodução de músicas com integração:
 * - Howler.js para playback
 * - Áudio 8D espacial
 * - Crossfade entre faixas
 * - Controle de volume e mix
 * 
 * Referências Científicas:
 * - Bernardi et al. (2006): Efeitos cardiovasculares e respiratórios da música
 * - Thoma et al. (2013): Música e resposta ao estresse
 * - Juslin & Västfjäll (2008): Mecanismos emocionais da música
 */

import { state } from '../core/state.js';
import { stores } from '../utils/storage.js';
import Audio8DProcessor from './audio8d.js';

// Referências de UI
let ui = {};

/**
 * Injeta referências de UI
 */
export function injectUIReferences(uiRefs) {
	ui = uiRefs;
}

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const CONFIG = {
	crossfadeDuration: 2000,    // ms
	fadeOutDuration: 1000,     // ms
	defaultVolume: 0.7,
	minVolume: 0,
	maxVolume: 1
};

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

/**
 * Inicializa o processador de áudio 8D
 */
export function init8DAudio() {
	if (!state.audioCtx) {
		console.warn('Player: AudioContext não disponível para 8D');
		return null;
	}
	
	if (!state.audio8D) {
		state.audio8D = new Audio8DProcessor(state.audioCtx, {
			initialPattern: 'circular',
			speed: 0.5,
			intensity: 0.8,
			roomSize: 10
		});
		console.log('Player: Processador 8D inicializado');
	}
	
	return state.audio8D;
}

/**
 * Configura o Howler para usar Web Audio API
 */
export function setupHowler() {
	if (typeof Howler !== 'undefined') {
		// Usa o AudioContext existente se disponível
		if (state.audioCtx) {
			Howler.ctx = state.audioCtx;
			Howler.masterGain = state.masterGain;
		}
		
		// Configurações globais
		Howler.autoUnlock = true;
		Howler.html5PoolSize = 10;
		
		console.log('Player: Howler configurado');
	}
}

// ============================================================================
// CARREGAMENTO DE MÚSICAS
// ============================================================================

/**
 * Carrega músicas do IndexedDB
 */
export async function loadMusicFromDB() {
	try {
		const keys = await stores.music.keys();
		state.musicMeta = [];
		
		for (const key of keys) {
			try {
				const data = await stores.music.getItem(key);
				if (data) {
					const meta = {
						id: key,
						name: data.name || key.replace(/\.[^/.]+$/, ''),
						blob: data.blob || data,
						duration: data.duration || 0,
						type: data.type || 'audio/mpeg'
					};
					state.musicMeta.push(meta);
				}
			} catch (err) {
				console.warn(`Player: Erro ao carregar música ${key}:`, err);
			}
		}
		
		console.log(`Player: ${state.musicMeta.length} músicas carregadas`);
		updatePlaylist();
		return state.musicMeta;
		
	} catch (error) {
		console.error('Player: Erro ao carregar músicas:', error);
		return [];
	}
}

/**
 * Atualiza a lista de reprodução na UI
 */
function updatePlaylist() {
	if (!ui.musicList) return;
	
	ui.musicList.innerHTML = '';
	
	if (state.musicMeta.length === 0) {
		ui.musicList.innerHTML = '<p class="no-music">Nenhuma música carregada</p>';
		return;
	}
	
	state.musicMeta.forEach((track, index) => {
		const item = document.createElement('div');
		item.className = 'music-item';
		item.dataset.index = index;
		
		item.innerHTML = `
			<span class="music-item__name">${escapeHtml(track.name)}</span>
			<span class="music-item__duration">${formatDuration(track.duration)}</span>
			<button class="music-item__remove" title="Remover">
				<i class="fa-solid fa-trash"></i>
			</button>
		`;
		
		// Click para tocar
		item.addEventListener('click', (e) => {
			if (!e.target.closest('.music-item__remove')) {
				playTrack(index);
			}
		});
		
		// Botão remover
		const removeBtn = item.querySelector('.music-item__remove');
		removeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			removeTrack(index);
		});
		
		ui.musicList.appendChild(item);
	});
}

// ============================================================================
// REPRODUÇÃO
// ============================================================================

/**
 * Reproduz uma faixa específica
 * @param {number} index - Índice da faixa
 * @param {boolean} with8D - Usar áudio 8D
 */
export async function playTrack(index, with8D = state.audio8D?.isEnabled) {
	if (index < 0 || index >= state.musicMeta.length) {
		console.warn('Player: Índice inválido:', index);
		return;
	}
	
	// Para a faixa atual com fade out
	if (state.currentHowl) {
		await fadeOut(state.currentHowl, CONFIG.fadeOutDuration);
		state.currentHowl.unload();
	}
	
	const track = state.musicMeta[index];
	state.currentTrackIndex = index;
	
	// Atualiza UI
	updateActiveTrack(index);
	
	// Cria URL do blob
	const url = URL.createObjectURL(track.blob);
	
	// Configuração do Howl
	const howlConfig = {
		src: [url],
		format: [getAudioFormat(track.type)],
		html5: false, // Usa Web Audio API
		volume: 0,
		onload: () => {
			console.log(`Player: "${track.name}" carregada`);
			track.duration = state.currentHowl.duration();
			
			// Fade in
			fadeIn(state.currentHowl, CONFIG.crossfadeDuration);
			
			// Conecta 8D se ativo
			if (with8D && state.audio8D) {
				connect8D();
			}
		},
		onplay: () => {
			updatePlayButton(true);
			requestAnimationFrame(updateProgress);
		},
		onpause: () => {
			updatePlayButton(false);
		},
		onstop: () => {
			updatePlayButton(false);
			URL.revokeObjectURL(url);
		},
		onend: () => {
			playNext();
		},
		onloaderror: (id, error) => {
			console.error(`Player: Erro ao carregar "${track.name}":`, error);
			URL.revokeObjectURL(url);
		}
	};
	
	// Cria e toca
	state.currentHowl = new Howl(howlConfig);
	state.currentHowl.play();
	
	// Armazena referência do URL para limpeza
	state.currentHowl._blobUrl = url;
}

/**
 * Conecta a faixa atual ao processador 8D
 */
function connect8D() {
	if (!state.audio8D || !state.currentHowl) return;
	
	try {
		// Obtém o nó de saída do Howl
		const soundId = state.currentHowl._sounds[0]?._id;
		if (!soundId) return;
		
		const node = state.currentHowl._soundById(soundId)?._node;
		if (!node) return;
		
		// Desconecta do destino padrão e conecta ao 8D
		state.audio8D.connect(node);
		console.log('Player: Conectado ao processador 8D');
		
	} catch (error) {
		console.warn('Player: Erro ao conectar 8D:', error);
	}
}

/**
 * Pausa/resume a reprodução
 */
export function togglePlay() {
	if (!state.currentHowl) {
		// Se não há faixa, toca a primeira
		if (state.musicMeta.length > 0) {
			playTrack(0);
		}
		return;
	}
	
	if (state.currentHowl.playing()) {
		state.currentHowl.pause();
	} else {
		state.currentHowl.play();
	}
}

/**
 * Para a reprodução
 */
export function stop() {
	if (state.currentHowl) {
		fadeOut(state.currentHowl, 500).then(() => {
			state.currentHowl.stop();
			if (state.currentHowl._blobUrl) {
				URL.revokeObjectURL(state.currentHowl._blobUrl);
			}
		});
	}
	
	if (state.audio8D) {
		state.audio8D.stop();
	}
}

/**
 * Próxima faixa
 */
export function playNext() {
	const nextIndex = (state.currentTrackIndex + 1) % state.musicMeta.length;
	
	if (state.musicMeta.length > 0) {
		playTrack(nextIndex);
	}
}

/**
 * Faixa anterior
 */
export function playPrevious() {
	const prevIndex = state.currentTrackIndex - 1;
	const index = prevIndex < 0 ? state.musicMeta.length - 1 : prevIndex;
	
	if (state.musicMeta.length > 0) {
		playTrack(index);
	}
}

/**
 * Define posição de reprodução
 * @param {number} percent - Posição em porcentagem (0-100)
 */
export function seek(percent) {
	if (!state.currentHowl) return;
	
	const duration = state.currentHowl.duration();
	const position = (percent / 100) * duration;
	state.currentHowl.seek(position);
}

// ============================================================================
// VOLUME E MIX
// ============================================================================

/**
 * Define volume da música
 * @param {number} volume - Volume (0-1)
 */
export function setVolume(volume) {
	const safeVolume = Math.max(CONFIG.minVolume, Math.min(CONFIG.maxVolume, volume));
	
	if (state.currentHowl) {
		state.currentHowl.volume(safeVolume);
	}
	
	state.musicVolume = safeVolume;
}

/**
 * Define o mix entre binaural e música
 * @param {number} mix - Mix (0 = só binaural, 100 = só música)
 */
export function setMix(mix) {
	const normalizedMix = mix / 100;
	
	// Volume da música
	const musicVol = normalizedMix * state.musicVolume;
	if (state.currentHowl) {
		state.currentHowl.volume(musicVol);
	}
	
	// Volume do binaural (invertido)
	if (state.binauralChain?.binauralGain) {
		const binauralVol = (1 - normalizedMix) * state.binauralVolume;
		state.binauralChain.binauralGain.gain.setValueAtTime(
			binauralVol,
			state.audioCtx.currentTime
		);
	}
}

// ============================================================================
// CONTROLES 8D
// ============================================================================

/**
 * Ativa/desativa áudio 8D
 */
export function toggle8D(enabled) {
	if (!state.audio8D) {
		init8DAudio();
	}
	
	if (state.audio8D) {
		if (enabled) {
			state.audio8D.start();
			if (state.currentHowl) {
				connect8D();
			}
		} else {
			state.audio8D.stop();
		}
	}
	
	// Atualiza UI
	if (ui.audio8DToggle) {
		ui.audio8DToggle.classList.toggle('active', enabled);
	}
}

/**
 * Define padrão de movimento 8D
 */
export function set8DPattern(pattern) {
	if (state.audio8D) {
		state.audio8D.setPattern(pattern);
	}
}

/**
 * Define velocidade do 8D
 */
export function set8DSpeed(speed) {
	if (state.audio8D) {
		state.audio8D.setSpeed(speed);
	}
}

/**
 * Define intensidade do 8D
 */
export function set8DIntensity(intensity) {
	if (state.audio8D) {
		state.audio8D.setIntensity(intensity);
	}
}

// ============================================================================
// GERENCIAMENTO DE FAIXAS
// ============================================================================

/**
 * Adiciona música do input de arquivo
 * @param {File} file - Arquivo de áudio
 */
export async function addMusic(file) {
	if (!file.type.startsWith('audio/')) {
		console.warn('Player: Arquivo não é áudio:', file.type);
		return null;
	}
	
	try {
		const id = `music_${Date.now()}_${file.name}`;
		
		// Armazena no IndexedDB
		await stores.music.setItem(id, {
			name: file.name.replace(/\.[^/.]+$/, ''),
			blob: file,
			type: file.type,
			addedAt: new Date().toISOString()
		});
		
		// Recarrega lista
		await loadMusicFromDB();
		
		console.log(`Player: "${file.name}" adicionada`);
		return id;
		
	} catch (error) {
		console.error('Player: Erro ao adicionar música:', error);
		return null;
	}
}

/**
 * Remove uma faixa
 * @param {number} index - Índice da faixa
 */
export async function removeTrack(index) {
	const track = state.musicMeta[index];
	if (!track) return;
	
	// Se está tocando, para
	if (state.currentTrackIndex === index && state.currentHowl) {
		stop();
	}
	
	try {
		await stores.music.removeItem(track.id);
		state.musicMeta.splice(index, 1);
		
		// Ajusta índice atual se necessário
		if (state.currentTrackIndex >= state.musicMeta.length) {
			state.currentTrackIndex = Math.max(0, state.musicMeta.length - 1);
		}
		
		updatePlaylist();
		console.log(`Player: "${track.name}" removida`);
		
	} catch (error) {
		console.error('Player: Erro ao remover:', error);
	}
}

/**
 * Limpa todas as músicas
 */
export async function clearAllMusic() {
	stop();
	
	try {
		await stores.music.clear();
		state.musicMeta = [];
		state.currentTrackIndex = 0;
		updatePlaylist();
		console.log('Player: Todas as músicas removidas');
	} catch (error) {
		console.error('Player: Erro ao limpar:', error);
	}
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

/**
 * Fade in
 */
function fadeIn(howl, duration) {
	return new Promise((resolve) => {
		if (!howl) {
			resolve();
			return;
		}
		
		howl.volume(0);
		howl.fade(0, state.musicVolume || CONFIG.defaultVolume, duration);
		
		setTimeout(resolve, duration);
	});
}

/**
 * Fade out
 */
function fadeOut(howl, duration) {
	return new Promise((resolve) => {
		if (!howl || !howl.playing()) {
			resolve();
			return;
		}
		
		const currentVol = howl.volume();
		howl.fade(currentVol, 0, duration);
		
		setTimeout(resolve, duration);
	});
}

/**
 * Atualiza indicador de faixa ativa
 */
function updateActiveTrack(index) {
	if (!ui.musicList) return;
	
	const items = ui.musicList.querySelectorAll('.music-item');
	items.forEach((item, i) => {
		item.classList.toggle('active', i === index);
	});
	
	// Atualiza nome na UI principal
	if (ui.currentTrackName && state.musicMeta[index]) {
		ui.currentTrackName.textContent = state.musicMeta[index].name;
	}
}

/**
 * Atualiza botão play/pause
 */
function updatePlayButton(isPlaying) {
	if (!ui.playBtn) return;
	
	const icon = ui.playBtn.querySelector('i');
	if (icon) {
		icon.className = isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
	}
}

/**
 * Atualiza barra de progresso
 */
function updateProgress() {
	if (!state.currentHowl || !state.currentHowl.playing()) return;
	
	const seek = state.currentHowl.seek() || 0;
	const duration = state.currentHowl.duration() || 1;
	const percent = (seek / duration) * 100;
	
	if (ui.progressBar) {
		ui.progressBar.style.width = `${percent}%`;
	}
	
	if (ui.currentTime) {
		ui.currentTime.textContent = formatDuration(seek);
	}
	
	if (ui.totalTime) {
		ui.totalTime.textContent = formatDuration(duration);
	}
	
	requestAnimationFrame(updateProgress);
}

/**
 * Formata duração em mm:ss
 */
function formatDuration(seconds) {
	if (!seconds || !isFinite(seconds)) return '0:00';
	
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Obtém formato de áudio do tipo MIME
 */
function getAudioFormat(mimeType) {
	const formats = {
		'audio/mpeg': 'mp3',
		'audio/mp3': 'mp3',
		'audio/wav': 'wav',
		'audio/wave': 'wav',
		'audio/ogg': 'ogg',
		'audio/flac': 'flac',
		'audio/aac': 'aac',
		'audio/mp4': 'mp4',
		'audio/webm': 'webm'
	};
	return formats[mimeType] || 'mp3';
}

/**
 * Escapa HTML
 */
function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
	injectUI: injectUIReferences,
	init8D: init8DAudio,
	setupHowler,
	loadMusic: loadMusicFromDB,
	play: playTrack,
	togglePlay,
	stop,
	next: playNext,
	previous: playPrevious,
	seek,
	setVolume,
	setMix,
	toggle8D,
	set8DPattern,
	set8DSpeed,
	set8DIntensity,
	addMusic,
	removeTrack,
	clearAll: clearAllMusic
};
