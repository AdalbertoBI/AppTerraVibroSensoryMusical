/**
 * =============================================================================
 * TERRA VIBRO SENSORY MUSICAL - Módulo de Ondas Binaurais
 * =============================================================================
 * 
 * Geração de batidas binaurais para sincronização cerebral.
 * Cada ouvido recebe uma frequência diferente, e o cérebro
 * percebe a diferença como um "batimento".
 * 
 * FUNDAMENTOS CIENTÍFICOS:
 * 
 * 1. DESCOBERTA (1839):
 *    Heinrich Wilhelm Dove descobriu que quando dois tons de
 *    frequências ligeiramente diferentes são apresentados
 *    separadamente aos ouvidos, o cérebro percebe um terceiro
 *    tom pulsante.
 * 
 * 2. SINCRONIZAÇÃO CEREBRAL (Entrainment):
 *    O cérebro tende a sincronizar suas ondas com a frequência
 *    da batida binaural (Frequency Following Response - FFR).
 *    Referência: Oster, G. (1973). "Auditory beats in the brain".
 *    Scientific American, 229(4), 94-102.
 * 
 * 3. FAIXAS DE FREQUÊNCIA:
 *    - Delta (0.5-4 Hz): Sono profundo, regeneração
 *    - Theta (4-8 Hz): Meditação, criatividade, memória
 *    - Alpha (8-13 Hz): Relaxamento, calma alerta
 *    - Beta (13-30 Hz): Concentração, foco, alerta
 *    - Gamma (30-100 Hz): Cognição superior, consciência
 * 
 * 4. EVIDÊNCIAS CLÍNICAS:
 *    - Redução de ansiedade (Padmanabhan et al., 2005)
 *    - Melhora do sono (Abeln et al., 2014)
 *    - Aumento de foco (Kraus & Porubanová, 2015)
 *    - Alívio de dor crônica (Zampi, 2016)
 */

import { state } from '../core/state.js';

/**
 * Construir a cadeia de processamento binaural
 * @param {object} preset - Configurações do preset
 * @param {number} preset.baseHz - Frequência base (Hz)
 * @param {number} preset.diffHz - Diferença binaural (Hz)
 * @param {number} preset.binauralVolume - Volume (0-100)
 * @param {number} preset.lowPass - Frequência do filtro passa-baixa (Hz)
 */
export function buildBinauralChain(preset) {
	// Para qualquer cadeia existente
	stopBinaural();
	
	const ctx = state.audioCtx;
	if (!ctx) {
		console.error('Binaural: AudioContext não disponível');
		return null;
	}
	
	// Osciladores para cada ouvido
	const leftOsc = ctx.createOscillator();
	const rightOsc = ctx.createOscillator();
	leftOsc.type = rightOsc.type = 'sine';
	
	// Frequências: esquerdo = base, direito = base + diferença
	leftOsc.frequency.value = preset.baseHz;
	rightOsc.frequency.value = preset.baseHz + preset.diffHz;
	
	// Gains individuais para cada canal
	const leftGain = ctx.createGain();
	const rightGain = ctx.createGain();
	const volume = ((preset.binauralVolume || 65) / 100) * 0.5;
	leftGain.gain.value = rightGain.gain.value = volume;
	
	// Merger para combinar em estéreo
	const merger = ctx.createChannelMerger(2);
	
	// Filtro passa-baixa para suavizar
	const lowPass = ctx.createBiquadFilter();
	lowPass.type = 'lowpass';
	lowPass.frequency.setValueAtTime(preset.lowPass || 80, ctx.currentTime);
	
	// Analyser para visualização
	const analyser = ctx.createAnalyser();
	analyser.fftSize = 512;
	
	// Gain de saída binaural
	const binauralGain = ctx.createGain();
	binauralGain.gain.value = state.mixRatio;
	
	// Conexões do grafo:
	// leftOsc -> leftGain -> merger[0] (canal esquerdo)
	// rightOsc -> rightGain -> merger[1] (canal direito)
	// merger -> lowPass -> analyser -> binauralGain -> masterGain
	leftOsc.connect(leftGain).connect(merger, 0, 0);
	rightOsc.connect(rightGain).connect(merger, 0, 1);
	merger.connect(lowPass);
	lowPass.connect(analyser);
	analyser.connect(binauralGain);
	binauralGain.connect(state.masterGain);
	
	// Inicia os osciladores
	leftOsc.start();
	rightOsc.start();
	
	// Salva a cadeia no estado
	state.binauralChain = {
		leftOsc,
		rightOsc,
		leftGain,
		rightGain,
		merger,
		lowPass,
		analyser,
		binauralGain,
		freqLeft: preset.baseHz,
		freqRight: preset.baseHz + preset.diffHz,
		freqDiff: preset.diffHz
	};
	
	// Conecta os analysers do monitor se existirem
	connectMonitorAnalysers();
	
	console.log(`Binaural: Iniciado - L=${preset.baseHz}Hz, R=${preset.baseHz + preset.diffHz}Hz, Δ=${preset.diffHz}Hz`);
	
	return state.binauralChain;
}

/**
 * Para e desconecta a cadeia binaural
 */
export function stopBinaural() {
	if (!state.binauralChain) return;
	
	// Para os osciladores
	['leftOsc', 'rightOsc'].forEach((osc) => {
		try {
			state.binauralChain[osc].stop();
		} catch (err) {
			// Oscilador já parado
		}
	});
	
	// Desconecta todos os nós
	Object.values(state.binauralChain).forEach((node) => {
		if (node?.disconnect) {
			try {
				node.disconnect();
			} catch (err) {
				// Já desconectado
			}
		}
	});
	
	state.binauralChain = null;
	console.log('Binaural: Parado');
}

/**
 * Atualiza as frequências binaurais em tempo real
 * @param {number} baseHz - Nova frequência base
 * @param {number} diffHz - Nova diferença
 */
export function updateFrequencies(baseHz, diffHz) {
	if (!state.binauralChain?.leftOsc || !state.binauralChain?.rightOsc) {
		return false;
	}
	
	const ctx = state.audioCtx;
	
	// Atualiza com transição suave
	state.binauralChain.leftOsc.frequency.setTargetAtTime(baseHz, ctx.currentTime, 0.05);
	state.binauralChain.rightOsc.frequency.setTargetAtTime(baseHz + diffHz, ctx.currentTime, 0.05);
	
	// Atualiza referências
	state.binauralChain.freqLeft = baseHz;
	state.binauralChain.freqRight = baseHz + diffHz;
	state.binauralChain.freqDiff = diffHz;
	
	console.log(`Binaural: Atualizado - L=${baseHz}Hz, R=${baseHz + diffHz}Hz, Δ=${diffHz}Hz`);
	return true;
}

/**
 * Atualiza o volume binaural
 * @param {number} volumePercent - Volume (0-100)
 */
export function updateVolume(volumePercent) {
	if (!state.binauralChain?.leftGain || !state.binauralChain?.rightGain) {
		return false;
	}
	
	const gain = (volumePercent / 100) * 0.5;
	const ctx = state.audioCtx;
	
	state.binauralChain.leftGain.gain.setTargetAtTime(gain, ctx.currentTime, 0.05);
	state.binauralChain.rightGain.gain.setTargetAtTime(gain, ctx.currentTime, 0.05);
	
	return true;
}

/**
 * Atualiza o filtro passa-baixa
 * @param {number} frequency - Frequência de corte (Hz)
 */
export function updateLowPass(frequency) {
	if (!state.binauralChain?.lowPass) {
		return false;
	}
	
	state.binauralChain.lowPass.frequency.setTargetAtTime(
		frequency, 
		state.audioCtx.currentTime, 
		0.05
	);
	
	return true;
}

/**
 * Atualiza o mix binaural/música
 * @param {number} ratio - Ratio (0.0 = só música, 1.0 = só binaural)
 */
export function updateMixRatio(ratio) {
	state.mixRatio = Math.max(0, Math.min(1, ratio));
	
	if (state.binauralChain?.binauralGain) {
		state.binauralChain.binauralGain.gain.setTargetAtTime(
			state.mixRatio, 
			state.audioCtx.currentTime, 
			0.05
		);
	}
	
	return state.mixRatio;
}

/**
 * Conecta os analysers do monitor de áudio aos gains binaurais
 */
function connectMonitorAnalysers() {
	if (!state.audioMonitor?.analyserLeft || !state.audioMonitor?.analyserRight) {
		return;
	}
	
	if (!state.binauralChain?.leftGain || !state.binauralChain?.rightGain) {
		return;
	}
	
	try {
		state.binauralChain.leftGain.connect(state.audioMonitor.analyserLeft);
		state.binauralChain.rightGain.connect(state.audioMonitor.analyserRight);
		console.log('Binaural: Monitor conectado aos canais L/R');
	} catch (error) {
		console.warn('Binaural: Erro ao conectar monitor:', error);
	}
}

/**
 * Retorna informações sobre a cadeia binaural atual
 * @returns {object|null} Informações ou null se não ativa
 */
export function getBinauralInfo() {
	if (!state.binauralChain) return null;
	
	return {
		freqLeft: state.binauralChain.freqLeft,
		freqRight: state.binauralChain.freqRight,
		freqDiff: state.binauralChain.freqDiff,
		isActive: true
	};
}

/**
 * Descreve a faixa de frequência baseada na diferença binaural
 * @param {number} diff - Diferença em Hz
 * @returns {object} Descrição da faixa
 */
export function describeBrainwaveBand(diff) {
	if (diff <= 4) {
		return { 
			name: 'Delta', 
			range: '0.5-4 Hz',
			description: 'Sono profundo, regeneração celular',
			color: '#8b5cf6',
			tag: 'sleep'
		};
	} else if (diff <= 8) {
		return { 
			name: 'Theta', 
			range: '4-8 Hz',
			description: 'Meditação profunda, criatividade, memória',
			color: '#06b6d4',
			tag: 'meditation'
		};
	} else if (diff <= 13) {
		return { 
			name: 'Alpha', 
			range: '8-13 Hz',
			description: 'Relaxamento, calma alerta, redução de estresse',
			color: '#22c55e',
			tag: 'relax'
		};
	} else if (diff <= 30) {
		return { 
			name: 'Beta', 
			range: '13-30 Hz',
			description: 'Concentração, foco, estado de alerta',
			color: '#f59e0b',
			tag: 'focus'
		};
	} else {
		return { 
			name: 'Gamma', 
			range: '30-100 Hz',
			description: 'Cognição superior, percepção expandida',
			color: '#ef4444',
			tag: 'cognitive'
		};
	}
}

export default {
	build: buildBinauralChain,
	stop: stopBinaural,
	updateFrequencies,
	updateVolume,
	updateLowPass,
	updateMixRatio,
	getInfo: getBinauralInfo,
	describeBand: describeBrainwaveBand
};
