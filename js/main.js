/**
 * =============================================================================
 * TERRA SENSORY MUSICAL - Aplicação Principal
 * =============================================================================
 * 
 * Versão: 1.2.0.0
 * 
 * Ponto de entrada principal que inicializa e conecta todos os módulos:
 * - Audio: binaurais, 8D, player, enhancer
 * - UI: controles, tutorial, modais
 * - Dados: pacientes, presets, histórico
 * 
 * Arquitetura modular ES6 para manutenção e escalabilidade.
 * 
 * =============================================================================
 */

// Core
import { state, STORAGE_KEYS, TERMS_KEY } from './core/state.js';
import { stores, uuid } from './utils/storage.js';

// Audio
import { setupAudioContext, resumeAudioContext, suspendAudioContext } from './audio/audioContext.js';
import { buildBinauralChain, stopBinaural, connectMonitorToBinaural, updateBinauralFrequencies, updateBinauralVolume } from './audio/binaural.js';
import Audio8DProcessor from './audio/audio8d.js';
import { AudioEnhancer } from './audio/audioEnhancer.js';
import player from './audio/player.js';

// Monitor
import audioMonitor from './monitor/audioMonitor.js';

// Pacientes
import patientManager from './patients/patientManager.js';

// UI
import controls from './ui/controls.js';
import tutorial from './ui/tutorial.js';

// ============================================================================
// REFERÊNCIAS DE UI
// ============================================================================

const ui = {
	// Formulário principal
	presetSelect: null,
	baseFreqSlider: null,
	baseFreqInput: null,
	diffFreqSlider: null,
	diffFreqInput: null,
	diffFreqLabel: null,
	volumeSlider: null,
	volumeInput: null,
	lowpassSlider: null,
	lowpassInput: null,
	waveformSelect: null,
	mixSlider: null,
	mixInput: null,
	mixLabel: null,
	durationMinutes: null,
	durationSeconds: null,
	
	// Botões
	startBtn: null,
	stopBtn: null,
	audioMonitorBtn: null,
	audio8DToggle: null,
	
	// Player
	playBtn: null,
	prevBtn: null,
	nextBtn: null,
	progressBar: null,
	currentTime: null,
	totalTime: null,
	musicList: null,
	musicInput: null,
	currentTrackName: null,
	
	// Monitor
	audioMonitorWindow: null,
	audioMonitorClose: null,
	audioMonitorMinimize: null,
	spectrumCanvas: null,
	waveformCanvas: null,
	volumeMeterLeft: null,
	volumeMeterRight: null,
	volumeMeterMaster: null,
	volumePeakLeft: null,
	volumePeakRight: null,
	volumePeakMaster: null,
	volumeValueLeft: null,
	volumeValueRight: null,
	volumeValueMaster: null,
	monitorFreqLeft: null,
	monitorFreqRight: null,
	monitorFreqDiff: null,
	monitorBrainwave: null,
	monitorMusicStatus: null,
	monitorSessionTime: null,
	
	// Pacientes
	patientsList: null,
	patientSelect: null,
	patientModal: null,
	patientForm: null,
	
	// Modais
	tutorialModal: null,
	termsModal: null,
	infoModal: null,
	
	// Timer
	timerDisplay: null,
	sessionProgress: null
};

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

/**
 * Inicializa a aplicação
 */
async function init() {
	console.log('Terra Sensory Musical v1.1.0.0 - Iniciando...');
	
	try {
		// 1. Coleta referências de UI
		collectUIReferences();
		
		// 2. Injeta UI nos módulos
		injectUIToModules();
		
		// 3. Inicializa audio context
		setupAudioContext();
		
		// 4. Configura player (Howler)
		player.setupHowler();
		
		// 5. Carrega dados persistidos
		await loadPersistedData();
		
		// 6. Inicializa controles
		controls.init();
		await controls.loadPresets();
		
		// 7. Configura eventos
		setupEventListeners();
		
		// 8. Verifica termos de uso
		await checkTermsAcceptance();
		
		// 9. Tutorial para primeira visita
		await tutorial.checkFirstVisit();
		
		// 10. Configura monitor
		audioMonitor.setup();
		audioMonitor.setupDrag();
		
		console.log('Terra Sensory Musical - Pronto!');
		
	} catch (error) {
		console.error('Erro na inicialização:', error);
		showError('Erro ao inicializar a aplicação. Por favor, recarregue a página.');
	}
}

/**
 * Coleta todas as referências de elementos DOM
 */
function collectUIReferences() {
	// Formulário
	ui.presetSelect = document.getElementById('preset-select');
	ui.baseFreqSlider = document.getElementById('base-freq-slider');
	ui.baseFreqInput = document.getElementById('base-freq-input');
	ui.diffFreqSlider = document.getElementById('diff-freq-slider');
	ui.diffFreqInput = document.getElementById('diff-freq-input');
	ui.diffFreqLabel = document.getElementById('diff-freq-label');
	ui.volumeSlider = document.getElementById('volume-slider');
	ui.volumeInput = document.getElementById('volume-input');
	ui.lowpassSlider = document.getElementById('lowpass-slider');
	ui.lowpassInput = document.getElementById('lowpass-input');
	ui.waveformSelect = document.getElementById('waveform-select');
	ui.mixSlider = document.getElementById('mix-slider');
	ui.mixInput = document.getElementById('mix-input');
	ui.mixLabel = document.getElementById('mix-label');
	ui.durationMinutes = document.getElementById('duration-minutes');
	ui.durationSeconds = document.getElementById('duration-seconds');
	
	// Botões principais
	ui.startBtn = document.getElementById('start-session-btn');
	ui.stopBtn = document.getElementById('stop-session-btn');
	ui.audioMonitorBtn = document.getElementById('audio-monitor-btn');
	ui.audio8DToggle = document.getElementById('audio-8d-toggle');
	ui.enhancerToggle = document.getElementById('enhancer-toggle');
	
	// Player
	ui.playBtn = document.getElementById('play-btn');
	ui.prevBtn = document.getElementById('prev-btn');
	ui.nextBtn = document.getElementById('next-btn');
	ui.progressBar = document.getElementById('progress-bar');
	ui.currentTime = document.getElementById('current-time');
	ui.totalTime = document.getElementById('total-time');
	ui.musicList = document.getElementById('music-list');
	ui.musicInput = document.getElementById('music-input');
	ui.currentTrackName = document.getElementById('current-track-name');
	
	// Monitor
	ui.audioMonitorWindow = document.getElementById('audio-monitor-window');
	ui.audioMonitorClose = document.querySelector('.audio-monitor__close');
	ui.audioMonitorMinimize = document.querySelector('.audio-monitor__minimize');
	ui.spectrumCanvas = document.getElementById('spectrum-canvas');
	ui.waveformCanvas = document.getElementById('waveform-canvas');
	ui.volumeMeterLeft = document.getElementById('volume-meter-left');
	ui.volumeMeterRight = document.getElementById('volume-meter-right');
	ui.volumeMeterMaster = document.getElementById('volume-meter-master');
	ui.volumePeakLeft = document.getElementById('volume-peak-left');
	ui.volumePeakRight = document.getElementById('volume-peak-right');
	ui.volumePeakMaster = document.getElementById('volume-peak-master');
	ui.volumeValueLeft = document.getElementById('volume-value-left');
	ui.volumeValueRight = document.getElementById('volume-value-right');
	ui.volumeValueMaster = document.getElementById('volume-value-master');
	ui.monitorFreqLeft = document.getElementById('monitor-freq-left');
	ui.monitorFreqRight = document.getElementById('monitor-freq-right');
	ui.monitorFreqDiff = document.getElementById('monitor-freq-diff');
	ui.monitorBrainwave = document.getElementById('monitor-brainwave');
	ui.monitorMusicStatus = document.getElementById('monitor-music-status');
	ui.monitorSessionTime = document.getElementById('monitor-session-time');
	
	// Pacientes
	ui.patientsList = document.getElementById('patients-list');
	ui.patientSelect = document.getElementById('patient-select');
	ui.patientModal = document.getElementById('patient-modal');
	ui.patientForm = document.getElementById('patient-form');
	
	// Timer
	ui.timerDisplay = document.getElementById('timer-display');
	ui.sessionProgress = document.getElementById('session-progress');
}

/**
 * Injeta referências de UI em todos os módulos
 */
function injectUIToModules() {
	controls.injectUI(ui);
	tutorial.injectUI(ui);
	audioMonitor.injectUI(ui);
	player.injectUI(ui);
	patientManager.injectUI(ui);
}

/**
 * Carrega dados persistidos
 */
async function loadPersistedData() {
	// Músicas
	await player.loadMusic();
	
	// Pacientes
	await patientManager.load();
	
	// Histórico
	await patientManager.loadHistory();
	
	console.log('Dados carregados do IndexedDB');
}

// ============================================================================
// EVENTOS
// ============================================================================

/**
 * Configura todos os event listeners
 */
function setupEventListeners() {
	// Sessão
	ui.startBtn?.addEventListener('click', startSession);
	ui.stopBtn?.addEventListener('click', stopSession);
	
	// Monitor
	ui.audioMonitorBtn?.addEventListener('click', () => audioMonitor.toggle());
	ui.audioMonitorClose?.addEventListener('click', () => audioMonitor.close());
	ui.audioMonitorMinimize?.addEventListener('click', () => audioMonitor.toggleMinimize());
	
	// Player
	ui.playBtn?.addEventListener('click', () => player.togglePlay());
	ui.prevBtn?.addEventListener('click', () => player.previous());
	ui.nextBtn?.addEventListener('click', () => player.next());
	
	// Upload de música
	ui.musicInput?.addEventListener('change', handleMusicUpload);
	
	// 8D Toggle
	ui.audio8DToggle?.addEventListener('click', toggle8DAudio);
	
	// Audio Enhancer Toggle e controles
	ui.enhancerToggle?.addEventListener('click', toggleAudioEnhancer);
	setupEnhancerControls();
	
	// Eventos de teclado
	document.addEventListener('keydown', handleKeyboard);
	
	// Resize de canvas
	window.addEventListener('resize', resizeCanvases);
	resizeCanvases();
	
	// Antes de fechar
	window.addEventListener('beforeunload', handleBeforeUnload);
}

/**
 * Manipula upload de músicas
 */
async function handleMusicUpload(e) {
	const files = e.target.files;
	if (!files?.length) return;
	
	for (const file of files) {
		await player.addMusic(file);
	}
	
	// Limpa input
	e.target.value = '';
}

/**
 * Toggle áudio 8D
 */
function toggle8DAudio() {
	const enabled = !state.audio8D?.isEnabled;
	player.toggle8D(enabled);
	
	ui.audio8DToggle?.classList.toggle('active', enabled);
	
	showNotification(enabled ? 'Áudio 8D ativado' : 'Áudio 8D desativado');
}

// ============================================================================
// AUDIO ENHANCER
// ============================================================================

/**
 * Instância do AudioEnhancer
 */
let audioEnhancer = null;

/**
 * Toggle do aprimoramento de áudio
 */
function toggleAudioEnhancer() {
	if (!audioEnhancer && state.audioContext) {
		audioEnhancer = new AudioEnhancer(state.audioContext);
		player.setEnhancer(audioEnhancer);
	}
	
	if (!audioEnhancer) {
		showError('AudioContext não disponível. Inicie uma sessão primeiro.');
		return;
	}
	
	const enabled = !audioEnhancer.enabled;
	audioEnhancer.toggle(enabled);
	
	ui.enhancerToggle?.classList.toggle('active', enabled);
	
	const controls = document.getElementById('enhancerControls');
	controls?.classList.toggle('disabled', !enabled);
	
	showNotification(enabled ? 'Aprimoramento de áudio ativado' : 'Aprimoramento de áudio desativado');
}

/**
 * Configura eventos dos controles do Audio Enhancer
 */
function setupEnhancerControls() {
	// Preset selector
	const presetSelect = document.getElementById('enhancerPreset');
	presetSelect?.addEventListener('change', (e) => {
		if (audioEnhancer) {
			audioEnhancer.applyPreset(e.target.value);
			updateEnhancerUIFromPreset();
			showNotification(`Preset "${e.target.options[e.target.selectedIndex].text}" aplicado`);
		}
	});
	
	// Noise Gate
	const noiseGate = document.getElementById('noiseGateThreshold');
	const noiseGateValue = document.getElementById('noiseGateValue');
	noiseGate?.addEventListener('input', (e) => {
		const value = parseFloat(e.target.value);
		if (noiseGateValue) noiseGateValue.textContent = `${value} dB`;
		if (audioEnhancer) audioEnhancer.setNoiseGateThreshold(value);
	});
	
	// De-Hiss
	const deHiss = document.getElementById('deHissAmount');
	const deHissValue = document.getElementById('deHissValue');
	deHiss?.addEventListener('input', (e) => {
		const value = parseFloat(e.target.value);
		if (deHissValue) deHissValue.textContent = `${value} dB`;
		if (audioEnhancer) audioEnhancer.setDeHiss(value);
	});
	
	// EQ Low
	const eqLow = document.getElementById('eqLow');
	const eqLowValue = document.getElementById('eqLowValue');
	eqLow?.addEventListener('input', (e) => {
		const value = parseFloat(e.target.value);
		if (eqLowValue) eqLowValue.textContent = `${value} dB`;
		if (audioEnhancer) audioEnhancer.setEQ('low', value);
	});
	
	// EQ Mid
	const eqMid = document.getElementById('eqMid');
	const eqMidValue = document.getElementById('eqMidValue');
	eqMid?.addEventListener('input', (e) => {
		const value = parseFloat(e.target.value);
		if (eqMidValue) eqMidValue.textContent = `${value} dB`;
		if (audioEnhancer) audioEnhancer.setEQ('mid', value);
	});
	
	// EQ High
	const eqHigh = document.getElementById('eqHigh');
	const eqHighValue = document.getElementById('eqHighValue');
	eqHigh?.addEventListener('input', (e) => {
		const value = parseFloat(e.target.value);
		if (eqHighValue) eqHighValue.textContent = `${value} dB`;
		if (audioEnhancer) audioEnhancer.setEQ('high', value);
	});
	
	// Compressor
	const compressor = document.getElementById('compressorRatio');
	const compressorValue = document.getElementById('compressorValue');
	compressor?.addEventListener('input', (e) => {
		const value = parseFloat(e.target.value);
		if (compressorValue) compressorValue.textContent = `${value}:1`;
		if (audioEnhancer) audioEnhancer.setCompression(value);
	});
	
	// Bass Enhancer
	const bassEnhance = document.getElementById('bassEnhance');
	const bassEnhanceValue = document.getElementById('bassEnhanceValue');
	bassEnhance?.addEventListener('input', (e) => {
		const value = parseFloat(e.target.value);
		if (bassEnhanceValue) bassEnhanceValue.textContent = `${value} dB`;
		if (audioEnhancer) audioEnhancer.setBassEnhance(value);
	});
	
	// Stereo Width
	const stereoWidth = document.getElementById('stereoWidth');
	const stereoWidthValue = document.getElementById('stereoWidthValue');
	stereoWidth?.addEventListener('input', (e) => {
		const value = parseFloat(e.target.value);
		if (stereoWidthValue) stereoWidthValue.textContent = `${value}%`;
		if (audioEnhancer) audioEnhancer.setStereoWidth(value / 100);
	});
	
	// Output Gain
	const outputGain = document.getElementById('outputGain');
	const outputGainValue = document.getElementById('outputGainValue');
	outputGain?.addEventListener('input', (e) => {
		const value = parseFloat(e.target.value);
		if (outputGainValue) outputGainValue.textContent = `${value} dB`;
		if (audioEnhancer) audioEnhancer.setOutputGain(value);
	});
}

/**
 * Atualiza a UI com valores do preset aplicado
 */
function updateEnhancerUIFromPreset() {
	if (!audioEnhancer) return;
	
	const settings = audioEnhancer.getCurrentSettings();
	
	// Atualiza sliders e outputs
	const updateControl = (id, valueId, value, suffix = '') => {
		const slider = document.getElementById(id);
		const output = document.getElementById(valueId);
		if (slider) slider.value = value;
		if (output) output.textContent = `${value}${suffix}`;
	};
	
	updateControl('noiseGateThreshold', 'noiseGateValue', settings.noiseGateThreshold, ' dB');
	updateControl('deHissAmount', 'deHissValue', settings.deHiss, ' dB');
	updateControl('eqLow', 'eqLowValue', settings.eqLow, ' dB');
	updateControl('eqMid', 'eqMidValue', settings.eqMid, ' dB');
	updateControl('eqHigh', 'eqHighValue', settings.eqHigh, ' dB');
	updateControl('compressorRatio', 'compressorValue', settings.compressorRatio, ':1');
	updateControl('bassEnhance', 'bassEnhanceValue', settings.bassEnhance, ' dB');
	updateControl('stereoWidth', 'stereoWidthValue', Math.round(settings.stereoWidth * 100), '%');
	updateControl('outputGain', 'outputGainValue', settings.outputGain, ' dB');
}

/**
 * Atalhos de teclado
 */
function handleKeyboard(e) {
	// Ignora se em input
	if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
	
	switch (e.key) {
		case ' ':
			e.preventDefault();
			if (state.isSessionRunning) {
				player.togglePlay();
			}
			break;
		case 'Escape':
			audioMonitor.close();
			break;
		case 'm':
		case 'M':
			audioMonitor.toggle();
			break;
	}
}

/**
 * Redimensiona canvas
 */
function resizeCanvases() {
	[ui.spectrumCanvas, ui.waveformCanvas].forEach(canvas => {
		if (canvas) {
			const parent = canvas.parentElement;
			canvas.width = parent.clientWidth;
			canvas.height = parent.clientHeight;
		}
	});
}

/**
 * Antes de fechar página
 */
function handleBeforeUnload(e) {
	if (state.isSessionRunning) {
		e.preventDefault();
		e.returnValue = 'Há uma sessão em andamento. Deseja realmente sair?';
		return e.returnValue;
	}
}

// ============================================================================
// SESSÃO
// ============================================================================

/**
 * Inicia uma sessão terapêutica
 */
async function startSession() {
	// Valida formulário
	const validation = controls.validate();
	if (!validation.valid) {
		showError(validation.errors.join('\n'));
		return;
	}
	
	// Resume audio context
	await resumeAudioContext();
	
	// Obtém valores do formulário
	const values = controls.getValues();
	
	// Constrói cadeia binaural
	buildBinauralChain({
		baseFreq: values.baseFreq,
		diffFreq: values.diffFreq,
		volume: values.volume / 100,
		waveform: values.waveform,
		lowpass: values.lowpass
	});
	
	// Conecta monitor aos binaurais
	connectMonitorToBinaural();
	
	// Configura timer
	const duration = controls.getDuration();
	startTimer(duration);
	
	// Atualiza estado
	state.isSessionRunning = true;
	state.sessionStartTime = Date.now();
	
	// Atualiza UI
	ui.startBtn?.classList.add('hidden');
	ui.stopBtn?.classList.remove('hidden');
	
	// Inicia monitor de sessão
	audioMonitor.open();
	
	console.log('Sessão iniciada:', values);
	showNotification('Sessão iniciada');
}

/**
 * Para a sessão
 */
function stopSession() {
	// Para binaurais
	stopBinaural();
	
	// Para música
	player.stop();
	
	// Para timer
	stopTimer();
	
	// Atualiza estado
	state.isSessionRunning = false;
	
	// Registra sessão se paciente selecionado
	if (state.selectedPatient) {
		const sessionData = {
			duration: Date.now() - state.sessionStartTime,
			settings: controls.getValues()
		};
		patientManager.addSession(state.selectedPatient.id, sessionData);
	}
	
	// Atualiza UI
	ui.startBtn?.classList.remove('hidden');
	ui.stopBtn?.classList.add('hidden');
	
	console.log('Sessão encerrada');
	showNotification('Sessão encerrada');
}

// ============================================================================
// TIMER
// ============================================================================

let timerInterval = null;
let remainingTime = 0;

/**
 * Inicia timer da sessão
 */
function startTimer(durationSeconds) {
	remainingTime = durationSeconds;
	updateTimerDisplay();
	
	timerInterval = setInterval(() => {
		remainingTime--;
		updateTimerDisplay();
		
		if (remainingTime <= 0) {
			stopSession();
			showNotification('Sessão concluída!');
		}
	}, 1000);
}

/**
 * Para timer
 */
function stopTimer() {
	if (timerInterval) {
		clearInterval(timerInterval);
		timerInterval = null;
	}
	remainingTime = 0;
	updateTimerDisplay();
}

/**
 * Atualiza display do timer
 */
function updateTimerDisplay() {
	if (!ui.timerDisplay) return;
	
	const minutes = Math.floor(remainingTime / 60);
	const seconds = remainingTime % 60;
	ui.timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	
	// Progress bar
	if (ui.sessionProgress && state.sessionDuration) {
		const progress = ((state.sessionDuration - remainingTime) / state.sessionDuration) * 100;
		ui.sessionProgress.style.width = `${progress}%`;
	}
}

// ============================================================================
// TERMOS DE USO
// ============================================================================

/**
 * Verifica aceitação dos termos
 */
async function checkTermsAcceptance() {
	try {
		const accepted = await stores.data.getItem(TERMS_KEY);
		
		if (!accepted) {
			showTermsModal();
			return false;
		}
		
		return true;
		
	} catch (error) {
		console.warn('Erro ao verificar termos:', error);
		return true;
	}
}

/**
 * Mostra modal de termos
 */
function showTermsModal() {
	const modal = document.getElementById('terms-modal');
	if (modal) {
		modal.classList.remove('hidden');
		
		const acceptBtn = modal.querySelector('#accept-terms-btn');
		acceptBtn?.addEventListener('click', async () => {
			await stores.data.setItem(TERMS_KEY, true);
			modal.classList.add('hidden');
		});
	}
}

// ============================================================================
// NOTIFICAÇÕES
// ============================================================================

/**
 * Mostra notificação toast
 */
function showNotification(message, type = 'info') {
	const toast = document.createElement('div');
	toast.className = `toast toast--${type}`;
	toast.textContent = message;
	
	document.body.appendChild(toast);
	
	// Anima entrada
	requestAnimationFrame(() => {
		toast.classList.add('show');
	});
	
	// Remove após 3s
	setTimeout(() => {
		toast.classList.remove('show');
		setTimeout(() => toast.remove(), 300);
	}, 3000);
}

/**
 * Mostra erro
 */
function showError(message) {
	showNotification(message, 'error');
	console.error(message);
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

// Inicia quando DOM estiver pronto
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}

// Exporta para uso global (debug)
window.TerraSensory = {
	state,
	player,
	audioMonitor,
	patientManager,
	controls,
	tutorial
};
