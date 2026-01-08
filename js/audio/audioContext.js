/**
 * =============================================================================
 * TERRA SENSORY MUSICAL - Contexto de Áudio Principal
 * =============================================================================
 * 
 * Gerencia o AudioContext e o grafo de áudio principal.
 * Ponto central de conexão para todos os módulos de áudio.
 */

import { state } from '../core/state.js';
import { initAudio8D } from './audio8d.js';

/**
 * Inicializa o contexto de áudio e o grafo principal
 * @returns {AudioContext} O contexto de áudio criado
 */
export function setupAudioGraph() {
	const AudioContextClass = window.AudioContext || window.webkitAudioContext;
	
	if (!AudioContextClass) {
		console.error('AudioContext: Navegador não suportado');
		return null;
	}
	
	// Cria o contexto
	state.audioCtx = new AudioContextClass();
	
	// Master Gain - controle de volume geral
	state.masterGain = state.audioCtx.createGain();
	state.masterGain.gain.value = 0.9;
	state.masterGain.connect(state.audioCtx.destination);
	
	// Inicializa o sistema 8D
	// O 8D será inserido entre a música e o masterGain
	initAudio8D(state.audioCtx, null, state.masterGain);
	
	// Suspende inicialmente (será resumido com interação do usuário)
	state.audioCtx.suspend();
	
	console.log('AudioGraph: Contexto inicializado');
	return state.audioCtx;
}

/**
 * Resume o contexto de áudio (necessário após interação do usuário)
 * @returns {Promise<void>}
 */
export async function resumeAudioContext() {
	if (state.audioCtx && state.audioCtx.state === 'suspended') {
		try {
			await state.audioCtx.resume();
			console.log('AudioGraph: Contexto resumido');
		} catch (error) {
			console.error('AudioGraph: Erro ao resumir contexto:', error);
		}
	}
}

/**
 * Suspende o contexto de áudio
 * @returns {Promise<void>}
 */
export async function suspendAudioContext() {
	if (state.audioCtx && state.audioCtx.state === 'running') {
		try {
			await state.audioCtx.suspend();
			console.log('AudioGraph: Contexto suspenso');
		} catch (error) {
			console.error('AudioGraph: Erro ao suspender contexto:', error);
		}
	}
}

/**
 * Retorna o contexto de áudio atual
 * @returns {AudioContext|null}
 */
export function getAudioContext() {
	return state.audioCtx;
}

/**
 * Retorna o master gain node
 * @returns {GainNode|null}
 */
export function getMasterGain() {
	return state.masterGain;
}

/**
 * Define o volume master
 * @param {number} volume - Volume (0.0 - 1.0)
 */
export function setMasterVolume(volume) {
	if (state.masterGain && state.audioCtx) {
		const safeVolume = Math.max(0, Math.min(1, volume));
		state.masterGain.gain.setTargetAtTime(safeVolume, state.audioCtx.currentTime, 0.05);
	}
}

export default {
	setup: setupAudioGraph,
	resume: resumeAudioContext,
	suspend: suspendAudioContext,
	getContext: getAudioContext,
	getMasterGain,
	setMasterVolume
};
