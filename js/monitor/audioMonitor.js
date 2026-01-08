/**
 * =============================================================================
 * TERRA VIBRO SENSORY MUSICAL - Monitor de Áudio
 * =============================================================================
 * 
 * Visualização em tempo real do áudio:
 * - Espectro de frequências
 * - Forma de onda por canal (L/R)
 * - Medidores de volume (VU meters)
 * - Informações de frequência binaural
 */

import { state } from '../core/state.js';
import { describeBrainwaveBand } from '../audio/binaural.js';

// Referências de UI (serão injetadas)
let ui = {};

/**
 * Injeta as referências de UI
 * @param {object} uiRefs - Objeto com referências aos elementos DOM
 */
export function injectUIReferences(uiRefs) {
	ui = uiRefs;
}

/**
 * Configura os analisadores de áudio
 */
export function setupAudioAnalysers() {
	if (!state.audioCtx) return;
	
	try {
		// Analyser master (espectro geral)
		state.audioMonitor.analyserMaster = state.audioCtx.createAnalyser();
		state.audioMonitor.analyserMaster.fftSize = 256;
		state.audioMonitor.analyserMaster.smoothingTimeConstant = 0.8;
		
		// Conecta ao master gain
		if (state.masterGain) {
			state.masterGain.connect(state.audioMonitor.analyserMaster);
		}
		
		// Analysers L/R (alta resolução para frequências)
		state.audioMonitor.analyserLeft = state.audioCtx.createAnalyser();
		state.audioMonitor.analyserRight = state.audioCtx.createAnalyser();
		
		state.audioMonitor.analyserLeft.fftSize = 2048;
		state.audioMonitor.analyserRight.fftSize = 2048;
		state.audioMonitor.analyserLeft.smoothingTimeConstant = 0.85;
		state.audioMonitor.analyserRight.smoothingTimeConstant = 0.85;
		
		console.log('Monitor: Analysers configurados');
	} catch (error) {
		console.error('Monitor: Erro ao configurar analysers:', error);
	}
}

/**
 * Conecta os analysers aos canais binaurais
 */
export function connectToBinaural() {
	if (!state.audioMonitor.analyserLeft || !state.audioMonitor.analyserRight) {
		return;
	}
	
	if (!state.binauralChain?.leftGain || !state.binauralChain?.rightGain) {
		return;
	}
	
	try {
		state.binauralChain.leftGain.connect(state.audioMonitor.analyserLeft);
		state.binauralChain.rightGain.connect(state.audioMonitor.analyserRight);
		console.log('Monitor: Conectado aos canais binaurais');
	} catch (error) {
		console.warn('Monitor: Erro ao conectar:', error);
	}
}

/**
 * Abre o monitor de áudio
 */
export function openMonitor() {
	if (!ui.audioMonitorWindow) return;
	
	// Garante que os analysers existem
	if (!state.audioMonitor.analyserMaster) {
		setupAudioAnalysers();
	}
	
	// Conecta aos binaurais se existirem
	connectToBinaural();
	
	// Mostra a janela
	ui.audioMonitorWindow.classList.remove('hidden');
	state.audioMonitor.isOpen = true;
	state.audioMonitor.isMinimized = false;
	
	// Marca início da sessão
	if (!state.audioMonitor.sessionStartTime) {
		state.audioMonitor.sessionStartTime = Date.now();
	}
	
	// Inicia animação
	startAnimation();
	
	// Atualiza botão
	if (ui.audioMonitorBtn) {
		ui.audioMonitorBtn.classList.add('active');
	}
}

/**
 * Fecha o monitor de áudio
 */
export function closeMonitor() {
	if (!ui.audioMonitorWindow) return;
	
	ui.audioMonitorWindow.classList.add('hidden');
	state.audioMonitor.isOpen = false;
	
	stopAnimation();
	
	if (ui.audioMonitorBtn) {
		ui.audioMonitorBtn.classList.remove('active');
	}
}

/**
 * Minimiza/restaura o monitor
 */
export function toggleMinimize() {
	if (!ui.audioMonitorWindow) return;
	
	state.audioMonitor.isMinimized = !state.audioMonitor.isMinimized;
	ui.audioMonitorWindow.classList.toggle('minimized', state.audioMonitor.isMinimized);
	
	if (ui.audioMonitorMinimize) {
		const icon = ui.audioMonitorMinimize.querySelector('i');
		if (icon) {
			icon.className = state.audioMonitor.isMinimized 
				? 'fa-solid fa-window-maximize' 
				: 'fa-solid fa-minus';
		}
	}
	
	if (state.audioMonitor.isMinimized) {
		stopAnimation();
	} else {
		startAnimation();
	}
}

/**
 * Alterna visibilidade do monitor
 */
export function toggleMonitor() {
	if (state.audioMonitor.isOpen) {
		closeMonitor();
	} else {
		openMonitor();
	}
}

// ============================================================================
// ANIMAÇÃO
// ============================================================================

/**
 * Inicia a animação do monitor
 */
function startAnimation() {
	if (state.audioMonitor.animationId) return;
	
	function animate() {
		if (!state.audioMonitor.isOpen || state.audioMonitor.isMinimized) {
			state.audioMonitor.animationId = null;
			return;
		}
		
		updateAllVisuals();
		state.audioMonitor.animationId = requestAnimationFrame(animate);
	}
	
	animate();
}

/**
 * Para a animação
 */
function stopAnimation() {
	if (state.audioMonitor.animationId) {
		cancelAnimationFrame(state.audioMonitor.animationId);
		state.audioMonitor.animationId = null;
	}
}

/**
 * Atualiza todas as visualizações
 */
function updateAllVisuals() {
	drawSpectrum();
	drawWaveform();
	updateVolumeMeter('left', state.audioMonitor.analyserLeft, ui.volumeMeterLeft, ui.volumePeakLeft, ui.volumeValueLeft);
	updateVolumeMeter('right', state.audioMonitor.analyserRight, ui.volumeMeterRight, ui.volumePeakRight, ui.volumeValueRight);
	updateVolumeMeter('master', state.audioMonitor.analyserMaster, ui.volumeMeterMaster, ui.volumePeakMaster, ui.volumeValueMaster);
	updateFrequencyDisplays();
	updateSessionInfo();
}

// ============================================================================
// ESPECTRO DE FREQUÊNCIAS
// ============================================================================

/**
 * Desenha o espectro de frequências
 */
function drawSpectrum() {
	const canvas = ui.spectrumCanvas;
	const analyser = state.audioMonitor.analyserMaster;
	
	if (!canvas || !analyser) return;
	
	const ctx = canvas.getContext('2d');
	const width = canvas.width;
	const height = canvas.height;
	
	const bufferLength = analyser.frequencyBinCount;
	const dataArray = new Uint8Array(bufferLength);
	analyser.getByteFrequencyData(dataArray);
	
	// Limpa
	ctx.fillStyle = 'rgba(26, 26, 26, 0.95)';
	ctx.fillRect(0, 0, width, height);
	
	// Grid
	ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
	ctx.lineWidth = 1;
	for (let i = 0; i < 10; i++) {
		const y = (height / 10) * i;
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(width, y);
		ctx.stroke();
	}
	
	// Barras
	const barWidth = (width / bufferLength) * 2.5;
	let x = 0;
	
	for (let i = 0; i < bufferLength; i++) {
		const barHeight = (dataArray[i] / 255) * height;
		const hue = (i / bufferLength) * 240 + 180;
		const lightness = 40 + (dataArray[i] / 255) * 30;
		
		ctx.fillStyle = `hsl(${hue}, 80%, ${lightness}%)`;
		ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
		x += barWidth;
	}
	
	// Linha de topo
	x = 0;
	ctx.strokeStyle = 'rgba(0, 208, 255, 0.8)';
	ctx.lineWidth = 2;
	ctx.beginPath();
	for (let i = 0; i < bufferLength; i++) {
		const barHeight = (dataArray[i] / 255) * height;
		const y = height - barHeight;
		
		if (i === 0) ctx.moveTo(x + barWidth / 2, y);
		else ctx.lineTo(x + barWidth / 2, y);
		x += barWidth;
	}
	ctx.stroke();
}

// ============================================================================
// FORMA DE ONDA (L/R)
// ============================================================================

/**
 * Desenha formas de onda L/R separadas
 */
function drawWaveform() {
	const canvas = ui.waveformCanvas;
	if (!canvas) return;
	
	const ctx = canvas.getContext('2d');
	const width = canvas.width;
	const height = canvas.height;
	
	// Limpa
	ctx.fillStyle = 'rgba(26, 26, 26, 0.95)';
	ctx.fillRect(0, 0, width, height);
	
	// Linhas de referência
	ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
	ctx.lineWidth = 1;
	
	ctx.beginPath();
	ctx.moveTo(0, height / 2);
	ctx.lineTo(width, height / 2);
	ctx.stroke();
	
	ctx.setLineDash([2, 4]);
	ctx.beginPath();
	ctx.moveTo(0, height * 0.25);
	ctx.lineTo(width, height * 0.25);
	ctx.moveTo(0, height * 0.75);
	ctx.lineTo(width, height * 0.75);
	ctx.stroke();
	ctx.setLineDash([]);
	
	// Labels
	ctx.font = '10px monospace';
	ctx.fillStyle = '#3b82f6';
	ctx.fillText('L', 5, height * 0.25 - 3);
	ctx.fillStyle = '#22c55e';
	ctx.fillText('R', 5, height * 0.75 - 3);
	
	// Canal L (azul)
	drawChannel(ctx, state.audioMonitor.analyserLeft, width, height * 0.5, 0, '#3b82f6', 'rgba(59, 130, 246, 0.2)');
	
	// Canal R (verde)
	drawChannel(ctx, state.audioMonitor.analyserRight, width, height * 0.5, height * 0.5, '#22c55e', 'rgba(34, 197, 94, 0.2)');
}

/**
 * Desenha um canal de waveform
 */
function drawChannel(ctx, analyser, width, height, offsetY, color, glowColor) {
	if (!analyser) return;
	
	const bufferLength = analyser.fftSize;
	const dataArray = new Uint8Array(bufferLength);
	analyser.getByteTimeDomainData(dataArray);
	
	ctx.strokeStyle = color;
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	
	const sliceWidth = width / bufferLength;
	let x = 0;
	
	for (let i = 0; i < bufferLength; i++) {
		const v = dataArray[i] / 128.0;
		const y = offsetY + (v * height) / 2;
		
		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
		x += sliceWidth;
	}
	
	ctx.lineTo(width, offsetY + height / 2);
	ctx.stroke();
	
	// Brilho
	ctx.strokeStyle = glowColor;
	ctx.lineWidth = 4;
	ctx.stroke();
}

// ============================================================================
// MEDIDORES DE VOLUME
// ============================================================================

/**
 * Atualiza um medidor de volume
 */
function updateVolumeMeter(channel, analyser, meterEl, peakEl, valueEl) {
	if (!analyser || !meterEl) return;
	
	const dataArray = new Uint8Array(analyser.frequencyBinCount);
	analyser.getByteFrequencyData(dataArray);
	
	// RMS
	let sum = 0;
	for (let i = 0; i < dataArray.length; i++) {
		sum += dataArray[i] * dataArray[i];
	}
	const rms = Math.sqrt(sum / dataArray.length);
	const level = (rms / 255) * 100;
	
	// Barra
	meterEl.style.width = `${level}%`;
	
	// Pico
	const peakKey = `peak${channel.charAt(0).toUpperCase() + channel.slice(1)}`;
	if (level > state.audioMonitor[peakKey]) {
		state.audioMonitor[peakKey] = level;
	} else {
		state.audioMonitor[peakKey] *= state.audioMonitor.peakDecay;
	}
	
	if (peakEl) {
		peakEl.style.left = `${state.audioMonitor[peakKey]}%`;
	}
	
	// Valor dB
	if (valueEl) {
		const db = level > 0 ? Math.round(20 * Math.log10(level / 100)) : -60;
		valueEl.textContent = `${db > -60 ? db : '-∞'} dB`;
	}
}

// ============================================================================
// DISPLAYS DE FREQUÊNCIA
// ============================================================================

/**
 * Atualiza displays de frequência binaural
 */
function updateFrequencyDisplays() {
	let freqLeft, freqRight, freqDiff;
	
	// Usa frequências dos osciladores se ativos
	if (state.binauralChain?.leftOsc) {
		freqLeft = state.binauralChain.leftOsc.frequency.value;
		freqRight = state.binauralChain.rightOsc.frequency.value;
		freqDiff = freqRight - freqLeft;
	} else if (state.binauralChain?.freqLeft !== undefined) {
		freqLeft = state.binauralChain.freqLeft;
		freqRight = state.binauralChain.freqRight;
		freqDiff = state.binauralChain.freqDiff;
	} else {
		// Valores do formulário
		const baseFreq = parseFloat(ui.baseFreq?.value) || 200;
		const diffFreqVal = parseFloat(ui.diffFreq?.value) || 10;
		freqLeft = baseFreq;
		freqRight = baseFreq + diffFreqVal;
		freqDiff = diffFreqVal;
	}
	
	// Atualiza displays
	if (ui.monitorFreqLeft) {
		ui.monitorFreqLeft.textContent = `${freqLeft.toFixed(1)} Hz`;
		ui.monitorFreqLeft.classList.toggle('active', !!state.binauralChain?.leftOsc);
	}
	
	if (ui.monitorFreqRight) {
		ui.monitorFreqRight.textContent = `${freqRight.toFixed(1)} Hz`;
		ui.monitorFreqRight.classList.toggle('active', !!state.binauralChain?.rightOsc);
	}
	
	if (ui.monitorFreqDiff) {
		ui.monitorFreqDiff.textContent = `Δ ${freqDiff.toFixed(1)} Hz`;
		
		const band = describeBrainwaveBand(freqDiff);
		if (ui.monitorBrainwave) {
			ui.monitorBrainwave.textContent = `${band.name} (${band.description})`;
			ui.monitorBrainwave.className = `brainwave-indicator ${band.name.toLowerCase()}`;
		}
	}
}

/**
 * Atualiza informações da sessão
 */
function updateSessionInfo() {
	// Status da música
	if (ui.monitorMusicStatus) {
		if (state.currentHowl && state.currentHowl.playing()) {
			const track = state.musicMeta[state.currentTrackIndex];
			ui.monitorMusicStatus.textContent = `♪ ${track?.name || 'Reproduzindo...'}`;
			ui.monitorMusicStatus.classList.add('playing');
		} else if (state.isSessionRunning) {
			ui.monitorMusicStatus.textContent = '◼ Sessão ativa (sem música)';
			ui.monitorMusicStatus.classList.remove('playing');
		} else {
			ui.monitorMusicStatus.textContent = '◻ Aguardando...';
			ui.monitorMusicStatus.classList.remove('playing');
		}
	}
	
	// Tempo
	if (ui.monitorSessionTime && state.audioMonitor.sessionStartTime) {
		const elapsed = Date.now() - state.audioMonitor.sessionStartTime;
		const minutes = Math.floor(elapsed / 60000);
		const seconds = Math.floor((elapsed % 60000) / 1000);
		ui.monitorSessionTime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
	}
}

// ============================================================================
// DRAG & DROP
// ============================================================================

/**
 * Configura arraste da janela
 */
export function setupDrag() {
	const monitor = ui.audioMonitorWindow;
	if (!monitor) return;
	
	const header = monitor.querySelector('.audio-monitor__header');
	if (!header) return;
	
	let isDragging = false;
	let startX, startY, initialX, initialY;
	
	header.addEventListener('mousedown', (e) => {
		if (e.target.closest('.audio-monitor__close') || e.target.closest('.audio-monitor__minimize')) {
			return;
		}
		
		isDragging = true;
		startX = e.clientX;
		startY = e.clientY;
		
		const rect = monitor.getBoundingClientRect();
		initialX = rect.left;
		initialY = rect.top;
		
		header.style.cursor = 'grabbing';
		e.preventDefault();
	});
	
	document.addEventListener('mousemove', (e) => {
		if (!isDragging) return;
		
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		
		let newX = Math.max(0, Math.min(initialX + dx, window.innerWidth - monitor.offsetWidth));
		let newY = Math.max(0, Math.min(initialY + dy, window.innerHeight - monitor.offsetHeight));
		
		monitor.style.left = `${newX}px`;
		monitor.style.top = `${newY}px`;
		monitor.style.right = 'auto';
		monitor.style.bottom = 'auto';
	});
	
	document.addEventListener('mouseup', () => {
		if (isDragging) {
			isDragging = false;
			header.style.cursor = 'grab';
		}
	});
}

export default {
	injectUI: injectUIReferences,
	setup: setupAudioAnalysers,
	connectToBinaural,
	open: openMonitor,
	close: closeMonitor,
	toggle: toggleMonitor,
	toggleMinimize,
	setupDrag
};
