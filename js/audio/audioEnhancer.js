/**
 * =============================================================================
 * TERRA SENSORY MUSICAL - Aprimoramento de Áudio
 * =============================================================================
 * 
 * Processamento DSP para melhorar qualidade sonora em fones tradicionais:
 * - Noise Gate: Remove ruídos de fundo
 * - De-Hiss: Reduz chiados de alta frequência
 * - Equalização: Correção de resposta de frequência
 * - Compressão: Equaliza dinâmica e aumenta clareza
 * - Limitador: Previne distorção e protege audição
 * 
 * Referências Científicas:
 * - Zölzer, U. (2011). DAFX: Digital Audio Effects
 * - Smith, J.O. (2007). Introduction to Digital Filters
 * - ITU-R BS.1770-4: Loudness normalization and permitted maximum level
 * 
 * =============================================================================
 */

import { state } from '../core/state.js';

/**
 * Classe principal de aprimoramento de áudio
 */
export class AudioEnhancer {
	constructor(audioContext) {
		this.ctx = audioContext;
		this.isEnabled = false;
		this.nodes = {};
		
		// Configurações padrão
		this.settings = {
			// Noise Gate
			noiseGate: {
				enabled: true,
				threshold: -50,      // dB
				attack: 0.001,       // segundos
				release: 0.05,       // segundos
				ratio: 10
			},
			
			// De-Hiss (remove chiados)
			deHiss: {
				enabled: true,
				frequency: 6000,     // Hz - frequência de corte
				reduction: -12       // dB de redução acima da frequência
			},
			
			// De-Hum (remove zumbido de rede elétrica)
			deHum: {
				enabled: false,
				frequency: 60,       // 60Hz (Brasil/EUA) ou 50Hz (Europa)
				q: 30,               // Q alto para corte preciso
				reduction: -40       // dB
			},
			
			// Equalização para compensar fones baratos
			equalizer: {
				enabled: true,
				// Bandas baseadas em deficiências comuns de fones baratos
				bands: [
					{ freq: 60, gain: 2, q: 1 },      // Realce graves
					{ freq: 250, gain: -2, q: 1.5 },  // Reduz "muddy"
					{ freq: 1000, gain: 1, q: 1 },    // Clareza vocal
					{ freq: 3000, gain: 2, q: 1.5 },  // Presença
					{ freq: 8000, gain: 1, q: 1 },    // Brilho
					{ freq: 12000, gain: -1, q: 1 }   // Reduz harshness
				]
			},
			
			// Compressor dinâmico
			compressor: {
				enabled: true,
				threshold: -24,      // dB
				knee: 12,            // dB
				ratio: 4,            // 4:1
				attack: 0.003,       // segundos
				release: 0.25        // segundos
			},
			
			// Limitador (proteção)
			limiter: {
				enabled: true,
				threshold: -1,       // dB - previne clipping
				knee: 0,
				ratio: 20,
				attack: 0.001,
				release: 0.1
			},
			
			// Stereo Enhancement
			stereoEnhance: {
				enabled: false,
				width: 1.2           // 1 = normal, >1 = mais largo
			},
			
			// Output gain
			outputGain: 0            // dB
		};
		
		this._init();
	}
	
	/**
	 * Inicializa a cadeia de processamento
	 */
	_init() {
		// Input node (receberá conexão externa)
		this.inputNode = this.ctx.createGain();
		this.inputNode.gain.value = 1;
		
		// Output node (conecta ao destino)
		this.outputNode = this.ctx.createGain();
		this.outputNode.gain.value = 1;
		
		// Bypass node (quando desabilitado)
		this.bypassNode = this.ctx.createGain();
		this.bypassNode.gain.value = 1;
		
		// Conexão bypass padrão
		this.inputNode.connect(this.bypassNode);
		this.bypassNode.connect(this.outputNode);
		
		console.log('AudioEnhancer: Inicializado');
	}
	
	/**
	 * Constrói a cadeia de processamento completa
	 */
	_buildProcessingChain() {
		// Limpa nós anteriores
		this._disconnectAll();
		
		let currentNode = this.inputNode;
		
		// 1. NOISE GATE (via compressor com threshold muito baixo)
		if (this.settings.noiseGate.enabled) {
			this.nodes.noiseGate = this._createNoiseGate();
			currentNode.connect(this.nodes.noiseGate.input);
			currentNode = this.nodes.noiseGate.output;
		}
		
		// 2. DE-HUM (notch filter para 50/60 Hz)
		if (this.settings.deHum.enabled) {
			this.nodes.deHum = this._createNotchFilter(
				this.settings.deHum.frequency,
				this.settings.deHum.q
			);
			currentNode.connect(this.nodes.deHum);
			currentNode = this.nodes.deHum;
			
			// Também remove harmônicos
			const harmonics = [2, 3, 4, 5];
			harmonics.forEach((h, i) => {
				const harmFilter = this._createNotchFilter(
					this.settings.deHum.frequency * h,
					this.settings.deHum.q / 2
				);
				this.nodes[`deHumHarmonic${i}`] = harmFilter;
				currentNode.connect(harmFilter);
				currentNode = harmFilter;
			});
		}
		
		// 3. DE-HISS (lowpass suave para remover chiados)
		if (this.settings.deHiss.enabled) {
			this.nodes.deHiss = this._createDeHiss();
			currentNode.connect(this.nodes.deHiss);
			currentNode = this.nodes.deHiss;
		}
		
		// 4. EQUALIZER
		if (this.settings.equalizer.enabled) {
			const eqChain = this._createEqualizer();
			currentNode.connect(eqChain.input);
			currentNode = eqChain.output;
			this.nodes.equalizer = eqChain;
		}
		
		// 5. STEREO ENHANCEMENT
		if (this.settings.stereoEnhance.enabled) {
			const stereoEnhancer = this._createStereoEnhancer();
			currentNode.connect(stereoEnhancer.input);
			currentNode = stereoEnhancer.output;
			this.nodes.stereoEnhance = stereoEnhancer;
		}
		
		// 6. COMPRESSOR
		if (this.settings.compressor.enabled) {
			this.nodes.compressor = this._createCompressor(this.settings.compressor);
			currentNode.connect(this.nodes.compressor);
			currentNode = this.nodes.compressor;
		}
		
		// 7. LIMITER
		if (this.settings.limiter.enabled) {
			this.nodes.limiter = this._createCompressor(this.settings.limiter);
			currentNode.connect(this.nodes.limiter);
			currentNode = this.nodes.limiter;
		}
		
		// 8. OUTPUT GAIN
		this.nodes.outputGain = this.ctx.createGain();
		this.nodes.outputGain.gain.value = this._dbToLinear(this.settings.outputGain);
		currentNode.connect(this.nodes.outputGain);
		
		// Conecta ao output final
		this.nodes.outputGain.connect(this.outputNode);
		
		console.log('AudioEnhancer: Cadeia de processamento construída');
	}
	
	// =========================================================================
	// CRIAÇÃO DE NÓS DE PROCESSAMENTO
	// =========================================================================
	
	/**
	 * Cria noise gate usando compressor + expander
	 */
	_createNoiseGate() {
		const settings = this.settings.noiseGate;
		
		// Analyser para detectar nível
		const analyser = this.ctx.createAnalyser();
		analyser.fftSize = 256;
		
		// Gain node que será modulado
		const gateGain = this.ctx.createGain();
		gateGain.gain.value = 1;
		
		// Processamento via ScriptProcessor ou AudioWorklet
		// Por simplicidade, usamos um compressor com threshold baixo
		const compressor = this.ctx.createDynamicsCompressor();
		compressor.threshold.value = settings.threshold;
		compressor.knee.value = 0;
		compressor.ratio.value = settings.ratio;
		compressor.attack.value = settings.attack;
		compressor.release.value = settings.release;
		
		return {
			input: compressor,
			output: compressor
		};
	}
	
	/**
	 * Cria filtro de remoção de chiado
	 */
	_createDeHiss() {
		const settings = this.settings.deHiss;
		
		// Filtro lowshelf invertido (reduz altas frequências)
		const filter = this.ctx.createBiquadFilter();
		filter.type = 'highshelf';
		filter.frequency.value = settings.frequency;
		filter.gain.value = settings.reduction;
		
		return filter;
	}
	
	/**
	 * Cria filtro notch para remover frequência específica
	 */
	_createNotchFilter(frequency, q) {
		const filter = this.ctx.createBiquadFilter();
		filter.type = 'notch';
		filter.frequency.value = frequency;
		filter.Q.value = q;
		return filter;
	}
	
	/**
	 * Cria equalizador paramétrico multi-banda
	 */
	_createEqualizer() {
		const bands = this.settings.equalizer.bands;
		const filters = [];
		
		bands.forEach((band, index) => {
			const filter = this.ctx.createBiquadFilter();
			
			// Primeira banda: lowshelf, última: highshelf, resto: peaking
			if (index === 0) {
				filter.type = 'lowshelf';
			} else if (index === bands.length - 1) {
				filter.type = 'highshelf';
			} else {
				filter.type = 'peaking';
			}
			
			filter.frequency.value = band.freq;
			filter.gain.value = band.gain;
			filter.Q.value = band.q;
			
			filters.push(filter);
		});
		
		// Conecta em série
		for (let i = 0; i < filters.length - 1; i++) {
			filters[i].connect(filters[i + 1]);
		}
		
		return {
			input: filters[0],
			output: filters[filters.length - 1],
			filters: filters
		};
	}
	
	/**
	 * Cria compressor dinâmico
	 */
	_createCompressor(settings) {
		const compressor = this.ctx.createDynamicsCompressor();
		compressor.threshold.value = settings.threshold;
		compressor.knee.value = settings.knee;
		compressor.ratio.value = settings.ratio;
		compressor.attack.value = settings.attack;
		compressor.release.value = settings.release;
		return compressor;
	}
	
	/**
	 * Cria stereo enhancer (alargamento de imagem estéreo)
	 */
	_createStereoEnhancer() {
		// Técnica Mid-Side
		const splitter = this.ctx.createChannelSplitter(2);
		const merger = this.ctx.createChannelMerger(2);
		
		// Ganhos para ajuste
		const leftGain = this.ctx.createGain();
		const rightGain = this.ctx.createGain();
		
		// Mid = (L + R) / 2, Side = (L - R) / 2
		// Para alargar: aumenta Side, diminui Mid
		const width = this.settings.stereoEnhance.width;
		const midLevel = 2 - width;   // Reduz mid quando width > 1
		const sideLevel = width;       // Aumenta side quando width > 1
		
		leftGain.gain.value = midLevel / 2 + sideLevel / 2;
		rightGain.gain.value = midLevel / 2 + sideLevel / 2;
		
		splitter.connect(leftGain, 0);
		splitter.connect(rightGain, 1);
		
		leftGain.connect(merger, 0, 0);
		rightGain.connect(merger, 0, 1);
		
		return {
			input: splitter,
			output: merger
		};
	}
	
	// =========================================================================
	// CONTROLE
	// =========================================================================
	
	/**
	 * Ativa o aprimoramento de áudio
	 */
	enable() {
		if (this.isEnabled) return;
		
		// Desconecta bypass
		this.inputNode.disconnect(this.bypassNode);
		
		// Constrói cadeia de processamento
		this._buildProcessingChain();
		
		this.isEnabled = true;
		console.log('AudioEnhancer: Ativado');
	}
	
	/**
	 * Desativa o aprimoramento (bypass)
	 */
	disable() {
		if (!this.isEnabled) return;
		
		// Desconecta processamento
		this._disconnectAll();
		
		// Reconecta bypass
		this.inputNode.connect(this.bypassNode);
		this.bypassNode.connect(this.outputNode);
		
		this.isEnabled = false;
		console.log('AudioEnhancer: Desativado (bypass)');
	}
	
	/**
	 * Toggle ativar/desativar
	 */
	toggle() {
		if (this.isEnabled) {
			this.disable();
		} else {
			this.enable();
		}
		return this.isEnabled;
	}
	
	/**
	 * Conecta uma fonte de áudio ao enhancer
	 */
	connect(sourceNode) {
		sourceNode.connect(this.inputNode);
		return this;
	}
	
	/**
	 * Conecta uma fonte ao input do enhancer
	 * Alias para connect() para compatibilidade com main.js
	 */
	connectSource(sourceNode) {
		return this.connect(sourceNode);
	}
	
	/**
	 * Conecta a saída do enhancer a um destino
	 */
	connectTo(destinationNode) {
		this.outputNode.connect(destinationNode);
		return this;
	}
	
	/**
	 * Retorna o nó de saída para encadeamento externo
	 */
	getOutputNode() {
		return this.outputNode;
	}
	
	/**
	 * Retorna o nó de entrada para encadeamento externo
	 */
	getInputNode() {
		return this.inputNode;
	}
	
	/**
	 * Getter para estado habilitado (compatibilidade com main.js)
	 */
	get enabled() {
		return this.isEnabled;
	}
	
	/**
	 * Desconecta todos os nós internos
	 */
	_disconnectAll() {
		try {
			this.inputNode.disconnect();
		} catch (e) { /* ignore */ }
		
		Object.values(this.nodes).forEach(node => {
			try {
				if (node.disconnect) {
					node.disconnect();
				} else if (node.input?.disconnect) {
					node.input.disconnect();
					node.output?.disconnect();
				}
			} catch (e) { /* ignore */ }
		});
		
		this.nodes = {};
	}
	
	// =========================================================================
	// CONFIGURAÇÃO
	// =========================================================================
	
	/**
	 * Atualiza configurações e reconstrói cadeia
	 */
	updateSettings(newSettings) {
		this.settings = this._deepMerge(this.settings, newSettings);
		
		if (this.isEnabled) {
			this._buildProcessingChain();
		}
	}
	
	/**
	 * Define preset de aprimoramento
	 */
	setPreset(presetName) {
		const presets = {
			// Preset para fones de ouvido baratos
			'cheap-headphones': {
				deHiss: { enabled: true, frequency: 5000, reduction: -15 },
				equalizer: {
					enabled: true,
					bands: [
						{ freq: 60, gain: 4, q: 1 },
						{ freq: 200, gain: -3, q: 1.5 },
						{ freq: 1000, gain: 2, q: 1 },
						{ freq: 3500, gain: 3, q: 1.5 },
						{ freq: 8000, gain: 2, q: 1 },
						{ freq: 12000, gain: -3, q: 1 }
					]
				},
				compressor: { enabled: true, threshold: -20, ratio: 4 }
			},
			
			// Preset para earbuds
			'earbuds': {
				deHiss: { enabled: true, frequency: 6000, reduction: -10 },
				equalizer: {
					enabled: true,
					bands: [
						{ freq: 80, gain: 5, q: 0.8 },
						{ freq: 250, gain: -2, q: 1.5 },
						{ freq: 800, gain: 1, q: 1 },
						{ freq: 2500, gain: 2, q: 1.5 },
						{ freq: 6000, gain: 1, q: 1 },
						{ freq: 10000, gain: -2, q: 1 }
					]
				},
				compressor: { enabled: true, threshold: -18, ratio: 3 }
			},
			
			// Preset para gravações antigas/com ruído
			'old-recordings': {
				noiseGate: { enabled: true, threshold: -45 },
				deHiss: { enabled: true, frequency: 4000, reduction: -18 },
				deHum: { enabled: true, frequency: 60 },
				equalizer: {
					enabled: true,
					bands: [
						{ freq: 100, gain: 2, q: 1 },
						{ freq: 400, gain: 0, q: 1 },
						{ freq: 1500, gain: 3, q: 1 },
						{ freq: 4000, gain: -2, q: 1 },
						{ freq: 8000, gain: -6, q: 1 },
						{ freq: 12000, gain: -10, q: 1 }
					]
				},
				compressor: { enabled: true, threshold: -22, ratio: 5 }
			},
			
			// Preset para voz/podcasts
			'voice': {
				noiseGate: { enabled: true, threshold: -48 },
				deHiss: { enabled: true, frequency: 7000, reduction: -8 },
				equalizer: {
					enabled: true,
					bands: [
						{ freq: 80, gain: -4, q: 1 },
						{ freq: 200, gain: -2, q: 1.5 },
						{ freq: 1000, gain: 2, q: 1 },
						{ freq: 3000, gain: 4, q: 1.5 },
						{ freq: 6000, gain: 2, q: 1 },
						{ freq: 10000, gain: -2, q: 1 }
					]
				},
				compressor: { enabled: true, threshold: -16, ratio: 4 }
			},
			
			// Preset para meditação/relaxamento
			'meditation': {
				deHiss: { enabled: true, frequency: 8000, reduction: -6 },
				equalizer: {
					enabled: true,
					bands: [
						{ freq: 60, gain: 3, q: 0.8 },
						{ freq: 200, gain: 1, q: 1 },
						{ freq: 800, gain: 0, q: 1 },
						{ freq: 2000, gain: -2, q: 1 },
						{ freq: 6000, gain: -4, q: 1 },
						{ freq: 12000, gain: -6, q: 1 }
					]
				},
				compressor: { enabled: true, threshold: -30, ratio: 2 },
				stereoEnhance: { enabled: true, width: 1.3 }
			},
			
			// Bypass/flat
			'flat': {
				noiseGate: { enabled: false },
				deHiss: { enabled: false },
				deHum: { enabled: false },
				equalizer: { enabled: false },
				compressor: { enabled: false },
				limiter: { enabled: true },
				stereoEnhance: { enabled: false }
			}
		};
		
		const preset = presets[presetName];
		if (preset) {
			this.updateSettings(preset);
			console.log(`AudioEnhancer: Preset "${presetName}" aplicado`);
			return true;
		}
		
		console.warn(`AudioEnhancer: Preset "${presetName}" não encontrado`);
		return false;
	}
	
	/**
	 * Obtém lista de presets disponíveis
	 */
	getAvailablePresets() {
		return [
			{ id: 'cheap-headphones', name: 'Fones Baratos', description: 'Compensa deficiências de fones econômicos' },
			{ id: 'earbuds', name: 'Earbuds', description: 'Otimizado para fones intra-auriculares' },
			{ id: 'old-recordings', name: 'Gravações Antigas', description: 'Remove ruídos de gravações com qualidade baixa' },
			{ id: 'voice', name: 'Voz/Podcast', description: 'Clareza vocal e redução de ruído' },
			{ id: 'meditation', name: 'Meditação', description: 'Som suave e envolvente' },
			{ id: 'flat', name: 'Desativado', description: 'Sem processamento (bypass)' }
		];
	}
	
	// =========================================================================
	// CONTROLES INDIVIDUAIS
	// =========================================================================
	
	/**
	 * Ajusta ganho de uma banda do EQ
	 */
	setEQBand(bandIndex, gain) {
		if (this.nodes.equalizer?.filters?.[bandIndex]) {
			this.nodes.equalizer.filters[bandIndex].gain.value = gain;
			this.settings.equalizer.bands[bandIndex].gain = gain;
		}
	}
	
	/**
	 * Ajusta EQ por nome de banda (low, mid, high)
	 * Usado pela interface de controle
	 */
	setEQ(band, gain) {
		const bandMap = { low: 0, mid: 2, high: 4 };
		const bandIndex = bandMap[band];
		if (bandIndex !== undefined) {
			this.setEQBand(bandIndex, gain);
		}
	}
	
	/**
	 * Ajusta threshold do noise gate
	 */
	setNoiseGateThreshold(threshold) {
		this.settings.noiseGate.threshold = threshold;
		if (this.nodes.noiseGate?.input) {
			this.nodes.noiseGate.input.threshold.value = threshold;
		}
	}
	
	/**
	 * Ajusta nível de redução de chiado (de-hiss)
	 */
	setDeHiss(reduction) {
		this.settings.deHiss.reduction = reduction;
		if (this.nodes.deHiss) {
			this.nodes.deHiss.gain.value = reduction;
		}
	}
	
	/**
	 * Ajusta ratio de compressão
	 */
	setCompression(ratio) {
		this.settings.compressor.ratio = ratio;
		if (this.nodes.compressor) {
			this.nodes.compressor.ratio.value = ratio;
		}
	}
	
	/**
	 * Ajusta realce de graves
	 */
	setBassEnhance(gainDb) {
		// Aplica na primeira banda do EQ (graves)
		if (this.nodes.equalizer?.filters?.[0]) {
			this.nodes.equalizer.filters[0].gain.value = gainDb;
		}
	}
	
	/**
	 * Ajusta largura estéreo
	 */
	setStereoWidth(width) {
		this.settings.stereoEnhance.width = width;
		// Reconstruir cadeia é necessário para ajuste de stereo
		if (this.isEnabled) {
			this._buildProcessingChain();
		}
	}
	
	/**
	 * Aplica preset por nome (interface)
	 */
	applyPreset(presetName) {
		// Map de presets da interface para presets internos
		const presetMap = {
			'default': 'flat',
			'noise_reduction': 'old-recordings',
			'music': 'cheap-headphones',
			'voice': 'voice',
			'bass_boost': 'earbuds',
			'treble_boost': 'cheap-headphones',
			'phone_quality': 'cheap-headphones'
		};
		
		const internalPreset = presetMap[presetName] || presetName;
		return this.setPreset(internalPreset);
	}
	
	/**
	 * Retorna configurações atuais em formato para a interface
	 */
	getCurrentSettings() {
		return {
			noiseGateThreshold: this.settings.noiseGate.threshold,
			deHiss: this.settings.deHiss.reduction,
			eqLow: this.settings.equalizer.bands[0]?.gain || 0,
			eqMid: this.settings.equalizer.bands[2]?.gain || 0,
			eqHigh: this.settings.equalizer.bands[4]?.gain || 0,
			compressorRatio: this.settings.compressor.ratio,
			bassEnhance: this.settings.equalizer.bands[0]?.gain || 0,
			stereoWidth: this.settings.stereoEnhance.width,
			outputGain: this.settings.outputGain
		};
	}
	
	/**
	 * Ajusta threshold do compressor
	 */
	setCompressorThreshold(threshold) {
		this.settings.compressor.threshold = threshold;
		if (this.nodes.compressor) {
			this.nodes.compressor.threshold.value = threshold;
		}
	}
	
	/**
	 * Ajusta frequência de corte do de-hiss
	 */
	setDeHissFrequency(frequency) {
		this.settings.deHiss.frequency = frequency;
		if (this.nodes.deHiss) {
			this.nodes.deHiss.frequency.value = frequency;
		}
	}
	
	/**
	 * Ajusta ganho de saída
	 */
	setOutputGain(gainDb) {
		this.settings.outputGain = gainDb;
		if (this.nodes.outputGain) {
			this.nodes.outputGain.gain.value = this._dbToLinear(gainDb);
		}
	}
	
	// =========================================================================
	// UTILITÁRIOS
	// =========================================================================
	
	/**
	 * Converte dB para linear
	 */
	_dbToLinear(db) {
		return Math.pow(10, db / 20);
	}
	
	/**
	 * Converte linear para dB
	 */
	_linearToDb(linear) {
		return 20 * Math.log10(linear);
	}
	
	/**
	 * Deep merge de objetos
	 */
	_deepMerge(target, source) {
		const result = { ...target };
		
		for (const key in source) {
			if (source[key] instanceof Object && key in target) {
				result[key] = this._deepMerge(target[key], source[key]);
			} else {
				result[key] = source[key];
			}
		}
		
		return result;
	}
	
	/**
	 * Retorna configurações atuais
	 */
	getSettings() {
		return { ...this.settings };
	}
	
	/**
	 * Limpa recursos
	 */
	destroy() {
		this.disable();
		this._disconnectAll();
		this.inputNode = null;
		this.outputNode = null;
		this.bypassNode = null;
	}
}

// ============================================================================
// FUNÇÕES DE CONVENIÊNCIA
// ============================================================================

let enhancerInstance = null;

/**
 * Obtém ou cria instância do enhancer
 */
export function getAudioEnhancer() {
	if (!enhancerInstance && state.audioCtx) {
		enhancerInstance = new AudioEnhancer(state.audioCtx);
	}
	return enhancerInstance;
}

/**
 * Ativa aprimoramento com preset
 */
export function enableAudioEnhancement(preset = 'cheap-headphones') {
	const enhancer = getAudioEnhancer();
	if (enhancer) {
		enhancer.setPreset(preset);
		enhancer.enable();
		return true;
	}
	return false;
}

/**
 * Desativa aprimoramento
 */
export function disableAudioEnhancement() {
	if (enhancerInstance) {
		enhancerInstance.disable();
	}
}

export default AudioEnhancer;
