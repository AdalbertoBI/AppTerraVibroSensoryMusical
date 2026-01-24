/**
 * =============================================================================
 * TERRA VIBRO SENSORY MUSICAL - Módulo de Áudio 8D / Espacial
 * =============================================================================
 * 
 * Implementação de áudio 8D usando Web Audio API.
 * O efeito 8D cria uma sensação de som rotacionando ao redor da cabeça
 * usando StereoPannerNode e efeitos de espacialização.
 * 
 * FUNDAMENTOS CIENTÍFICOS:
 * 
 * 1. HRTF (Head-Related Transfer Function):
 *    O áudio 8D simula como o som chega aos ouvidos de diferentes ângulos.
 *    Referência: Blauert, J. (1997). Spatial Hearing: The Psychophysics of 
 *    Human Sound Localization. MIT Press.
 * 
 * 2. ITD (Interaural Time Difference):
 *    Diferença de tempo entre a chegada do som em cada ouvido (~0.6ms máx).
 *    Crítico para localização horizontal de sons.
 * 
 * 3. ILD (Interaural Level Difference):
 *    Diferença de intensidade entre ouvidos devido à "sombra" da cabeça.
 *    Mais pronunciada em frequências altas (>1500Hz).
 * 
 * 4. EFEITOS TERAPÊUTICOS:
 *    - Maior imersão e relaxamento profundo
 *    - Estimulação bilateral do córtex auditivo
 *    - Redução de ansiedade (Linnemann et al., 2015)
 *    - Potencialização dos efeitos binaurais
 * 
 * 5. COMBINAÇÃO COM BINAURAIS:
 *    O áudio 8D na música ambiente complementa os binaurais:
 *    - Música 8D: Cria ambiente imersivo e relaxante
 *    - Binaurais: Mantêm frequências precisas L/R para sincronização cerebral
 *    - Resultado: Experiência terapêutica mais profunda
 */

import { state } from '../core/state.js';

// Configurações padrão do 8D
const DEFAULT_8D_SETTINGS = {
	enabled: false,
	rotationSpeed: 0.5,    // Velocidade de rotação (0.1 - 2.0)
	depth: 0.8,            // Intensidade do efeito pan (0.0 - 1.0)
	roomSize: 0.5,         // Tamanho do "ambiente" reverb (0.0 - 1.0)
	wetDryMix: 0.3,        // Mix reverb/direto (0.0 - 1.0)
	rotationPattern: 'circular'  // 'circular', 'figure8', 'random'
};

// Impulse responses para diferentes ambientes (gerados proceduralmente)
const ROOM_PRESETS = {
	small: { decay: 0.5, size: 0.3 },
	medium: { decay: 1.0, size: 0.5 },
	large: { decay: 2.0, size: 0.7 },
	cathedral: { decay: 4.0, size: 1.0 }
};

/**
 * Inicializa o sistema de áudio 8D
 * @param {AudioContext} audioCtx - Contexto de áudio
 * @param {GainNode} inputNode - Nó de entrada (fonte de áudio)
 * @param {GainNode} outputNode - Nó de saída (destino)
 */
export function initAudio8D(audioCtx, inputNode, outputNode) {
	if (!audioCtx) {
		console.error('Audio8D: AudioContext não disponível');
		return null;
	}
	
	try {
		// Cria o panner estéreo para o efeito de rotação
		const pannerNode = audioCtx.createStereoPanner();
		pannerNode.pan.value = 0;
		
		// Gains para controle wet/dry (reverb)
		const dryGain = audioCtx.createGain();
		const wetGain = audioCtx.createGain();
		dryGain.gain.value = 0.7;
		wetGain.gain.value = 0.3;
		
		// Convolver para reverb espacial
		const convolverNode = audioCtx.createConvolver();
		
		// Gera impulse response inicial
		const impulseBuffer = generateImpulseResponse(audioCtx, 2, 1.0, 0.5);
		convolverNode.buffer = impulseBuffer;
		
		// Conexões do grafo de áudio 8D:
		// input -> panner -> dryGain -> output
		//                 -> convolver -> wetGain -> output
		
		// O panner recebe o áudio e aplica a rotação
		pannerNode.connect(dryGain);
		pannerNode.connect(convolverNode);
		convolverNode.connect(wetGain);
		dryGain.connect(outputNode);
		wetGain.connect(outputNode);
		
		// Salva referências no estado
		state.audio8D = {
			...state.audio8D,
			pannerNode,
			convolverNode,
			dryGain,
			wetGain,
			audioCtx,
			inputNode,
			outputNode
		};
		
		console.log('Audio8D: Sistema inicializado com sucesso');
		return { pannerNode, dryGain, wetGain, convolverNode };
		
	} catch (error) {
		console.error('Audio8D: Erro na inicialização:', error);
		return null;
	}
}

/**
 * Conecta uma fonte de áudio ao processador 8D
 * @param {AudioNode} sourceNode - Nó fonte (ex: MediaElementSourceNode do Howler)
 */
export function connectSourceTo8D(sourceNode) {
	if (!state.audio8D.pannerNode) {
		console.warn('Audio8D: Sistema não inicializado');
		return false;
	}
	
	try {
		sourceNode.connect(state.audio8D.pannerNode);
		return true;
	} catch (error) {
		console.error('Audio8D: Erro ao conectar fonte:', error);
		return false;
	}
}

/**
 * Ativa ou desativa o efeito 8D
 * @param {boolean} enabled - Estado desejado
 */
export function setAudio8DEnabled(enabled) {
	state.audio8D.enabled = enabled;
	
	if (enabled) {
		startRotation();
	} else {
		stopRotation();
		// Reset pan para centro
		if (state.audio8D.pannerNode) {
			state.audio8D.pannerNode.pan.setTargetAtTime(0, state.audioCtx.currentTime, 0.1);
		}
	}
	
	console.log(`Audio8D: ${enabled ? 'Ativado' : 'Desativado'}`);
}

/**
 * Inicia a animação de rotação do áudio
 * Usa setInterval para continuar funcionando quando a aba perde foco
 */
export function startRotation() {
	if (state.audio8D.animationId) return;
	
	const startTime = performance.now();
	const INTERVAL_MS = 16; // ~60fps
	
	function animate() {
		if (!state.audio8D.enabled) {
			stopRotation();
			return;
		}
		
		const currentTime = performance.now();
		const elapsed = (currentTime - startTime) / 1000;
		const speed = state.audio8D.rotationSpeed;
		const depth = state.audio8D.depth;
		
		// Calcula posição no círculo
		let panValue;
		
		switch (state.audio8D.rotationPattern || 'circular') {
			case 'figure8':
				// Padrão em figura 8 (mais suave)
				panValue = Math.sin(elapsed * speed * Math.PI) * depth;
				break;
			
			case 'random':
				// Movimento aleatório suavizado
				const noise = Math.sin(elapsed * speed * 2.1) * 0.5 + 
				              Math.sin(elapsed * speed * 3.7) * 0.3 +
				              Math.sin(elapsed * speed * 5.3) * 0.2;
				panValue = noise * depth;
				break;
			
			case 'circular':
			default:
				// Rotação circular contínua
				panValue = Math.sin(elapsed * speed * Math.PI * 2) * depth;
				break;
		}
		
		// Aplica o pan
		if (state.audio8D.pannerNode && state.audioCtx) {
			state.audio8D.pannerNode.pan.setValueAtTime(panValue, state.audioCtx.currentTime);
		}
		
		// Atualiza ângulo para visualização
		state.audio8D.rotationAngle = (elapsed * speed * 360) % 360;
	}
	
	// Usa setInterval em vez de requestAnimationFrame para funcionar em background
	state.audio8D.animationId = setInterval(animate, INTERVAL_MS);
	
	// Executa imediatamente a primeira vez
	animate();
}

/**
 * Para a animação de rotação
 */
export function stopRotation() {
	if (state.audio8D.animationId) {
		clearInterval(state.audio8D.animationId);
		state.audio8D.animationId = null;
	}
}

/**
 * Configura a velocidade de rotação
 * @param {number} speed - Velocidade (0.1 - 2.0)
 */
export function setRotationSpeed(speed) {
	state.audio8D.rotationSpeed = Math.max(0.1, Math.min(2.0, speed));
}

/**
 * Configura a profundidade/intensidade do efeito
 * @param {number} depth - Profundidade (0.0 - 1.0)
 */
export function setDepth(depth) {
	state.audio8D.depth = Math.max(0, Math.min(1, depth));
}

/**
 * Configura o padrão de rotação
 * @param {string} pattern - 'circular', 'figure8', 'random'
 */
export function setRotationPattern(pattern) {
	if (['circular', 'figure8', 'random'].includes(pattern)) {
		state.audio8D.rotationPattern = pattern;
	}
}

/**
 * Configura o mix wet/dry do reverb
 * @param {number} wetAmount - Quantidade de reverb (0.0 - 1.0)
 */
export function setReverbMix(wetAmount) {
	const wet = Math.max(0, Math.min(1, wetAmount));
	const dry = 1 - wet;
	
	if (state.audio8D.wetGain) {
		state.audio8D.wetGain.gain.setTargetAtTime(wet, state.audioCtx.currentTime, 0.1);
	}
	if (state.audio8D.dryGain) {
		state.audio8D.dryGain.gain.setTargetAtTime(dry, state.audioCtx.currentTime, 0.1);
	}
}

/**
 * Configura o tamanho do ambiente (reverb)
 * @param {string} roomType - 'small', 'medium', 'large', 'cathedral'
 */
export function setRoomSize(roomType) {
	const preset = ROOM_PRESETS[roomType] || ROOM_PRESETS.medium;
	
	if (state.audio8D.convolverNode && state.audioCtx) {
		const newImpulse = generateImpulseResponse(
			state.audioCtx, 
			preset.decay, 
			preset.size, 
			0.5
		);
		state.audio8D.convolverNode.buffer = newImpulse;
		state.audio8D.roomSize = preset.size;
	}
}

/**
 * Gera um impulse response para reverb
 * @param {AudioContext} audioCtx - Contexto de áudio
 * @param {number} duration - Duração do decay em segundos
 * @param {number} decay - Taxa de decay
 * @param {number} density - Densidade das reflexões
 * @returns {AudioBuffer} Buffer do impulse response
 */
function generateImpulseResponse(audioCtx, duration = 2, decay = 0.5, density = 0.5) {
	const sampleRate = audioCtx.sampleRate;
	const length = sampleRate * duration;
	const impulse = audioCtx.createBuffer(2, length, sampleRate);
	const leftChannel = impulse.getChannelData(0);
	const rightChannel = impulse.getChannelData(1);
	
	for (let i = 0; i < length; i++) {
		const n = i / length;
		const envelope = Math.pow(1 - n, decay * 3);
		
		// Reflexões com densidade variável
		const reflection = (Math.random() * 2 - 1) * density;
		
		// Adiciona um pouco de variação entre canais para espacialidade
		leftChannel[i] = reflection * envelope * (1 + Math.random() * 0.1);
		rightChannel[i] = reflection * envelope * (1 + Math.random() * 0.1);
	}
	
	return impulse;
}

/**
 * Retorna as configurações atuais do 8D
 * @returns {object} Configurações
 */
export function getAudio8DSettings() {
	return {
		enabled: state.audio8D.enabled,
		rotationSpeed: state.audio8D.rotationSpeed,
		depth: state.audio8D.depth,
		roomSize: state.audio8D.roomSize,
		rotationPattern: state.audio8D.rotationPattern || 'circular',
		rotationAngle: state.audio8D.rotationAngle
	};
}

/**
 * Aplica configurações ao sistema 8D
 * @param {object} settings - Configurações a aplicar
 */
export function applyAudio8DSettings(settings) {
	if (settings.rotationSpeed !== undefined) {
		setRotationSpeed(settings.rotationSpeed);
	}
	if (settings.depth !== undefined) {
		setDepth(settings.depth);
	}
	if (settings.rotationPattern !== undefined) {
		setRotationPattern(settings.rotationPattern);
	}
	if (settings.roomSize !== undefined) {
		setRoomSize(settings.roomSize);
	}
	if (settings.enabled !== undefined) {
		setAudio8DEnabled(settings.enabled);
	}
}

// Export default para uso simplificado
export default {
	init: initAudio8D,
	connect: connectSourceTo8D,
	enable: setAudio8DEnabled,
	startRotation,
	stopRotation,
	setSpeed: setRotationSpeed,
	setDepth,
	setPattern: setRotationPattern,
	setReverbMix,
	setRoomSize,
	getSettings: getAudio8DSettings,
	applySettings: applyAudio8DSettings
};
