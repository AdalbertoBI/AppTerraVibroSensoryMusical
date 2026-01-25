/**
 * PlayerController - Módulo de controle unificado de reprodução
 * Gerencia play/pause/stop integrado para música + frequência binaural
 * Permite controle direto de cada item da playlist
 * 
 * @version 1.0.0
 * @author Terra Eletrônica
 */
const PlayerController = (function() {
	'use strict';
	
	// =========================================================================
	// ESTADO INTERNO
	// =========================================================================
	
	let isInitialized = false;
	let currentTrackId = null;
	let currentTrackElement = null;
	
	// Referências externas (injetadas via init)
	let appState = null;
	let appStores = null;
	let ui = null;
	
	// Callbacks externos
	let onBuildBinauralChain = null;
	let onStopBinaural = null;
	let onResumeAudioContext = null;
	let onSetupPlaylist = null;
	let onStartTimer = null;
	let onStopTimer = null;
	let onUpdateSessionUI = null;
	let onUpdateFrequencyDisplay = null;
	let onStartBreathingGuide = null;
	let onStopBreathingGuide = null;
	let onOpenAudioMonitor = null;
	let onLogSession = null;
	let onSetupMediaSession = null;
	let onUpdateMediaSessionState = null;
	let onScheduleMixer = null;
	let onPlayBeep = null;
	let onShowToast = null;
	let onCollectPresetFromForm = null;
	let onStopCurrentTrack = null;
	let onStopYoutubeAudio = null;
	let onUpdateTimerProgress = null;
	
	// =========================================================================
	// INICIALIZAÇÃO
	// =========================================================================
	
	/**
	 * Inicializa o PlayerController com referências necessárias
	 * @param {Object} config - Configuração com referências externas
	 */
	function init(config) {
		if (isInitialized) {
			console.warn('[PlayerController] Já inicializado');
			return;
		}
		
		// Referências de estado
		appState = config.state;
		appStores = config.stores;
		ui = config.ui;
		
		// Callbacks de áudio binaural
		onBuildBinauralChain = config.onBuildBinauralChain;
		onStopBinaural = config.onStopBinaural;
		onResumeAudioContext = config.onResumeAudioContext;
		onSetupPlaylist = config.onSetupPlaylist;
		onScheduleMixer = config.onScheduleMixer;
		onStopCurrentTrack = config.onStopCurrentTrack;
		onStopYoutubeAudio = config.onStopYoutubeAudio;
		
		// Callbacks de timer
		onStartTimer = config.onStartTimer;
		onStopTimer = config.onStopTimer;
		onUpdateTimerProgress = config.onUpdateTimerProgress;
		onPlayBeep = config.onPlayBeep;
		
		// Callbacks de UI
		onUpdateSessionUI = config.onUpdateSessionUI;
		onUpdateFrequencyDisplay = config.onUpdateFrequencyDisplay;
		onStartBreathingGuide = config.onStartBreathingGuide;
		onStopBreathingGuide = config.onStopBreathingGuide;
		onOpenAudioMonitor = config.onOpenAudioMonitor;
		
		// Callbacks de sessão
		onLogSession = config.onLogSession;
		onSetupMediaSession = config.onSetupMediaSession;
		onUpdateMediaSessionState = config.onUpdateMediaSessionState;
		onCollectPresetFromForm = config.onCollectPresetFromForm;
		
		// Callbacks de notificação
		onShowToast = config.onShowToast;
		
		isInitialized = true;
		console.log('[PlayerController] Inicializado');
	}
	
	// =========================================================================
	// CONTROLE DE SESSÃO
	// =========================================================================
	
	/**
	 * Inicia sessão terapêutica a partir de uma música específica
	 * @param {string} trackId - ID da música/som a ser reproduzido
	 * @param {HTMLElement} trackElement - Elemento DOM do item da playlist
	 */
	async function playFromTrack(trackId, trackElement) {
		if (!isInitialized) {
			console.error('[PlayerController] Não inicializado');
			return;
		}
		
		// Se já está tocando esta faixa, PARA a sessão (stop, não pause)
		if (appState.isSessionRunning && currentTrackId === trackId) {
			await stop();
			return;
		}
		
		// Se estava tocando outra faixa, para primeiro
		if (appState.isSessionRunning) {
			await stop();
		}
		
		// Atualiza estado
		currentTrackId = trackId;
		currentTrackElement = trackElement;
		
		// Coleta preset do formulário
		const preset = onCollectPresetFromForm ? onCollectPresetFromForm() : getDefaultPreset();
		
		// Configura playlist com a faixa selecionada
		preset.playlist = [trackId];
		
		// Inicia sessão
		await startSession(preset);
		
		// Atualiza visual do item
		updateTrackVisual(trackElement, 'playing');
	}
	
	/**
	 * Inicia sessão terapêutica completa
	 * @param {Object} preset - Configurações da sessão
	 */
	async function startSession(preset) {
		try {
			console.log('[PlayerController] startSession - preset:', preset);
			
			// Resume contexto de áudio
			if (onResumeAudioContext) {
				console.log('[PlayerController] Chamando onResumeAudioContext...');
				await onResumeAudioContext();
				console.log('[PlayerController] AudioContext resumido');
			}
			
			// Salva preset atual para resume funcionar
			appState.currentPreset = preset;
			
			// Constrói cadeia binaural
			if (onBuildBinauralChain) {
				console.log('[PlayerController] Chamando onBuildBinauralChain...');
				onBuildBinauralChain(preset);
				console.log('[PlayerController] Cadeia binaural construída');
			} else {
				console.error('[PlayerController] onBuildBinauralChain NÃO ESTÁ DEFINIDO!');
			}
			
			// Configura mixer
			if (onScheduleMixer) {
				onScheduleMixer(preset);
			}
			
			// Configura playlist
			if (onSetupPlaylist) {
				await onSetupPlaylist(preset.playlist);
			}
			
			// Inicia timer
			if (onStartTimer) {
				appState.totalSessionSeconds = preset.duration * 60;
				onStartTimer(preset.duration);
			}
			
			// Atualiza estado
			appState.isSessionRunning = true;
			appState.isPaused = false;
			
			// Log e media session
			if (onLogSession) onLogSession(preset);
			if (onSetupMediaSession) onSetupMediaSession(preset);
			
			// Atualiza UI
			if (onUpdateSessionUI) onUpdateSessionUI(true, false);
			if (onUpdateFrequencyDisplay) onUpdateFrequencyDisplay(preset.diffHz);
			if (onStartBreathingGuide) onStartBreathingGuide(preset.diffHz);
			if (onOpenAudioMonitor) onOpenAudioMonitor();
			
			// Notifica
			if (onShowToast) {
				onShowToast(`▶ Sessão iniciada: ${preset.name || 'Sessão'}`, 'success');
			}
			
			// Re-renderiza playlist para mostrar timer
			if (typeof PlaylistManager !== 'undefined') {
				await PlaylistManager.render();
			}
			
			console.log('[PlayerController] Sessão iniciada:', preset.name);
			
		} catch (error) {
			console.error('[PlayerController] Erro ao iniciar sessão:', error);
			if (onShowToast) {
				onShowToast('Erro ao iniciar sessão', 'error');
			}
		}
	}
	
	/**
	 * Alterna entre play e pause
	 */
	function togglePlayPause() {
		if (!appState.isSessionRunning) return;
		
		if (isPaused()) {
			resume();
		} else {
			pause();
		}
	}
	
	/**
	 * Pausa a sessão atual
	 */
	function pause() {
		if (!appState.isSessionRunning) return;
		
		// Pausa osciladores binaurais
		if (appState.binauralChain) {
			const ctx = appState.audioCtx;
			if (appState.binauralChain.leftOsc) {
				appState.binauralChain.leftOsc.frequency.setTargetAtTime(0, ctx.currentTime, 0.1);
			}
			if (appState.binauralChain.rightOsc) {
				appState.binauralChain.rightOsc.frequency.setTargetAtTime(0, ctx.currentTime, 0.1);
			}
		}
		
		// Pausa música
		if (appState.activeHowls && appState.activeHowls.length > 0) {
			appState.activeHowls.forEach(howl => {
				if (howl && howl.playing()) howl.pause();
			});
		} else if (appState.currentHowl && appState.currentHowl.playing()) {
			appState.currentHowl.pause();
		}
		
		// Pausa YouTube
		if (typeof youtubePlayer !== 'undefined' && youtubePlayer && typeof currentYoutubeId !== 'undefined' && currentYoutubeId) {
			try { youtubePlayer.pauseVideo(); } catch(e) {}
		}
		
		// Pausa timer
		if (appState.timerId) {
			clearInterval(appState.timerId);
			appState.timerPaused = true;
		}
		
		// Atualiza UI
		appState.isPaused = true;
		if (onUpdateMediaSessionState) onUpdateMediaSessionState('paused');
		if (onUpdateSessionUI) onUpdateSessionUI(true, true);
		
		// Atualiza visual do item
		if (currentTrackElement) {
			updateTrackVisual(currentTrackElement, 'paused');
		}
		
		console.log('[PlayerController] Sessão pausada');
	}
	
	/**
	 * Retoma sessão pausada
	 */
	function resume() {
		if (!appState.isSessionRunning) return;
		
		// Resume osciladores com frequências originais
		if (appState.binauralChain && appState.currentPreset) {
			const ctx = appState.audioCtx;
			const preset = appState.currentPreset;
			
			if (appState.binauralChain.leftOsc) {
				appState.binauralChain.leftOsc.frequency.setTargetAtTime(preset.baseHz, ctx.currentTime, 0.1);
			}
			if (appState.binauralChain.rightOsc) {
				appState.binauralChain.rightOsc.frequency.setTargetAtTime(preset.baseHz + preset.diffHz, ctx.currentTime, 0.1);
			}
		}
		
		// Resume música
		if (appState.activeHowls && appState.activeHowls.length > 0) {
			appState.activeHowls.forEach(howl => {
				if (howl && !howl.playing()) howl.play();
			});
		} else if (appState.currentHowl && !appState.currentHowl.playing()) {
			appState.currentHowl.play();
		}
		
		// Resume YouTube
		if (typeof youtubePlayer !== 'undefined' && youtubePlayer && typeof currentYoutubeId !== 'undefined' && currentYoutubeId) {
			try { youtubePlayer.playVideo(); } catch(e) {}
		}
		
		// Resume timer
		if (appState.timerPaused && appState.remainingSeconds > 0) {
			resumeTimer();
		}
		
		// Atualiza UI
		appState.isPaused = false;
		appState.timerPaused = false;
		if (onUpdateMediaSessionState) onUpdateMediaSessionState('playing');
		if (onUpdateSessionUI) onUpdateSessionUI(true, false);
		
		// Atualiza visual do item
		if (currentTrackElement) {
			updateTrackVisual(currentTrackElement, 'playing');
		}
		
		console.log('[PlayerController] Sessão retomada');
	}
	
	/**
	 * Resume o timer após pausa
	 */
	function resumeTimer() {
		if (appState.timerId) {
			clearInterval(appState.timerId);
		}
		
		appState.timerId = setInterval(() => {
			if (appState.remainingSeconds <= 0) {
				clearInterval(appState.timerId);
				appState.timerId = null;
				if (onPlayBeep) onPlayBeep();
				stop();
				return;
			}
			appState.remainingSeconds -= 1;
			updateTimerDisplay();
		}, 1000);
	}
	
	/**
	 * Atualiza display do timer
	 */
	function updateTimerDisplay() {
		const minutes = String(Math.floor(appState.remainingSeconds / 60)).padStart(2, '0');
		const seconds = String(appState.remainingSeconds % 60).padStart(2, '0');
		const timeStr = `${minutes}:${seconds}`;
		
		if (ui && ui.timerDisplay) {
			ui.timerDisplay.textContent = timeStr;
		}
	}
	
	/**
	 * Para a sessão completamente
	 */
	async function stop() {
		// Para binaural
		if (onStopBinaural) onStopBinaural();
		
		// Para música
		if (onStopCurrentTrack) onStopCurrentTrack();
		
		// Para YouTube
		if (onStopYoutubeAudio) onStopYoutubeAudio();
		
		// Para timer
		if (appState.timerId) {
			clearInterval(appState.timerId);
			appState.timerId = null;
		}
		
		// Reset estado
		appState.remainingSeconds = 0;
		appState.currentPlayingName = null;
		appState.totalSessionSeconds = 0;
		appState.isSessionRunning = false;
		appState.isPaused = false;
		
		// Suspende áudio
		if (appState.audioCtx && appState.audioCtx.state === 'running') {
			appState.audioCtx.suspend();
		}
		
		// Atualiza UI
		if (onUpdateMediaSessionState) onUpdateMediaSessionState('none');
		if (onUpdateSessionUI) onUpdateSessionUI(false, false);
		if (onStopBreathingGuide) onStopBreathingGuide();
		if (onUpdateTimerProgress) onUpdateTimerProgress(0, 1);
		
		// Limpa display de frequência
		if (ui && ui.frequencyDisplay) {
			const freqValue = ui.frequencyDisplay.querySelector('.freq-value');
			if (freqValue) freqValue.textContent = '--';
		}
		
		// Atualiza visual do item
		if (currentTrackElement) {
			updateTrackVisual(currentTrackElement, 'stopped');
		}
		
		// Limpa referências
		currentTrackId = null;
		currentTrackElement = null;
		
		// Re-renderiza playlist para remover timer
		if (typeof PlaylistManager !== 'undefined') {
			await PlaylistManager.render();
		}
		
		console.log('[PlayerController] Sessão encerrada');
	}
	
	/**
	 * Para a sessão de uma faixa específica
	 * @param {string} trackId - ID da faixa
	 */
	async function stopTrack(trackId) {
		if (currentTrackId === trackId) {
			await stop();
		}
	}
	
	// =========================================================================
	// UTILITÁRIOS
	// =========================================================================
	
	/**
	 * Verifica se a sessão está pausada
	 * @returns {boolean}
	 */
	function isPaused() {
		return appState.isPaused === true;
	}
	
	/**
	 * Verifica se uma faixa específica está tocando
	 * @param {string} trackId
	 * @returns {boolean}
	 */
	function isTrackPlaying(trackId) {
		return appState.isSessionRunning && currentTrackId === trackId && !isPaused();
	}
	
	/**
	 * Verifica se uma faixa específica está pausada
	 * @param {string} trackId
	 * @returns {boolean}
	 */
	function isTrackPaused(trackId) {
		return appState.isSessionRunning && currentTrackId === trackId && isPaused();
	}
	
	/**
	 * Obtém o ID da faixa atual
	 * @returns {string|null}
	 */
	function getCurrentTrackId() {
		return currentTrackId;
	}
	
	/**
	 * Atualiza visual do item da playlist
	 * @param {HTMLElement} element - Elemento DOM
	 * @param {string} status - 'playing', 'stopped'
	 */
	function updateTrackVisual(element, status) {
		if (!element) return;
		
		// Remove classes de estado
		element.classList.remove('is-playing', 'is-paused');
		
		// Encontra botão de controle
		const controlBtn = element.querySelector('.btn-track-control');
		if (!controlBtn) return;
		
		const icon = controlBtn.querySelector('i');
		if (!icon) return;
		
		switch (status) {
			case 'playing':
				element.classList.add('is-playing');
				icon.className = 'fa-solid fa-stop';
				controlBtn.title = 'Parar sessão';
				controlBtn.classList.add('playing');
				controlBtn.classList.remove('paused');
				break;
				
			case 'stopped':
			default:
				icon.className = 'fa-solid fa-play';
				controlBtn.title = 'Iniciar sessão';
				controlBtn.classList.remove('playing', 'paused');
				break;
		}
	}
	
	/**
	 * Atualiza visual de todos os itens da playlist
	 */
	function updateAllTracksVisual() {
		const items = document.querySelectorAll('.playlist-item');
		items.forEach(item => {
			const trackId = item.dataset.id;
			if (trackId === currentTrackId) {
				if (isPaused()) {
					updateTrackVisual(item, 'paused');
				} else if (appState.isSessionRunning) {
					updateTrackVisual(item, 'playing');
				}
			} else {
				updateTrackVisual(item, 'stopped');
			}
		});
	}
	
	/**
	 * Retorna preset padrão
	 * @returns {Object}
	 */
	function getDefaultPreset() {
		return {
			name: 'Sessão Rápida',
			baseHz: 52,
			diffHz: 10,
			duration: 25,
			binauralVolume: 50,
			lowPass: 70,
			playlist: []
		};
	}
	
	// =========================================================================
	// API PÚBLICA
	// =========================================================================
	
	return {
		init,
		playFromTrack,
		startSession,
		togglePlayPause,
		pause,
		resume,
		stop,
		stopTrack,
		isPaused,
		isTrackPlaying,
		isTrackPaused,
		getCurrentTrackId,
		updateTrackVisual,
		updateAllTracksVisual
	};
	
})();

// Exporta para uso global
if (typeof window !== 'undefined') {
	window.PlayerController = PlayerController;
}
