/**
 * Gerador de Sons Terapêuticos em Tempo Real
 * Usa Web Audio API para gerar sons sem dependência de CDNs externos
 * 
 * @module therapeuticSounds
 * @version 1.0.0
 */

class TherapeuticSoundGenerator {
	constructor() {
		this.audioContext = null;
		this.masterGain = null;
		this.activeNodes = new Map();
	}

	/**
	 * Inicializa o contexto de áudio (deve ser chamado após interação do usuário)
	 */
	async init() {
		if (!this.audioContext) {
			this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
			this.masterGain = this.audioContext.createGain();
			this.masterGain.connect(this.audioContext.destination);
		}
		if (this.audioContext.state === 'suspended') {
			await this.audioContext.resume();
		}
		return this;
	}

	/**
	 * Cria um gerador de ruído branco
	 */
	createWhiteNoise(duration = 2) {
		const bufferSize = this.audioContext.sampleRate * duration;
		const buffer = this.audioContext.createBuffer(2, bufferSize, this.audioContext.sampleRate);
		
		for (let channel = 0; channel < 2; channel++) {
			const data = buffer.getChannelData(channel);
			for (let i = 0; i < bufferSize; i++) {
				data[i] = Math.random() * 2 - 1;
			}
		}
		
		return buffer;
	}

	/**
	 * Cria um gerador de ruído rosa (1/f noise)
	 */
	createPinkNoise(duration = 2) {
		const bufferSize = this.audioContext.sampleRate * duration;
		const buffer = this.audioContext.createBuffer(2, bufferSize, this.audioContext.sampleRate);
		
		for (let channel = 0; channel < 2; channel++) {
			const data = buffer.getChannelData(channel);
			let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
			
			for (let i = 0; i < bufferSize; i++) {
				const white = Math.random() * 2 - 1;
				b0 = 0.99886 * b0 + white * 0.0555179;
				b1 = 0.99332 * b1 + white * 0.0750759;
				b2 = 0.96900 * b2 + white * 0.1538520;
				b3 = 0.86650 * b3 + white * 0.3104856;
				b4 = 0.55000 * b4 + white * 0.5329522;
				b5 = -0.7616 * b5 - white * 0.0168980;
				data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
				b6 = white * 0.115926;
			}
		}
		
		return buffer;
	}

	/**
	 * Cria um gerador de ruído marrom (brownian noise)
	 */
	createBrownNoise(duration = 2) {
		const bufferSize = this.audioContext.sampleRate * duration;
		const buffer = this.audioContext.createBuffer(2, bufferSize, this.audioContext.sampleRate);
		
		for (let channel = 0; channel < 2; channel++) {
			const data = buffer.getChannelData(channel);
			let lastOut = 0;
			
			for (let i = 0; i < bufferSize; i++) {
				const white = Math.random() * 2 - 1;
				data[i] = (lastOut + (0.02 * white)) / 1.02;
				lastOut = data[i];
				data[i] *= 3.5;
			}
		}
		
		return buffer;
	}

	/**
	 * Simula som de ondas do mar
	 */
	createOceanWaves(duration = 10) {
		const bufferSize = this.audioContext.sampleRate * duration;
		const buffer = this.audioContext.createBuffer(2, bufferSize, this.audioContext.sampleRate);
		
		for (let channel = 0; channel < 2; channel++) {
			const data = buffer.getChannelData(channel);
			let lastOut = 0;
			
			for (let i = 0; i < bufferSize; i++) {
				const t = i / this.audioContext.sampleRate;
				const white = Math.random() * 2 - 1;
				const brown = (lastOut + (0.02 * white)) / 1.02;
				lastOut = brown;
				
				const waveFreq = 0.1 + Math.random() * 0.05;
				const waveMod = 0.3 + 0.7 * Math.pow(Math.sin(2 * Math.PI * waveFreq * t), 2);
				const smallWaveMod = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.5 * t);
				
				data[i] = brown * 3 * waveMod * smallWaveMod;
			}
		}
		
		return buffer;
	}

	/**
	 * Simula som de chuva
	 */
	createRainSound(duration = 10) {
		const bufferSize = this.audioContext.sampleRate * duration;
		const buffer = this.audioContext.createBuffer(2, bufferSize, this.audioContext.sampleRate);
		
		for (let channel = 0; channel < 2; channel++) {
			const data = buffer.getChannelData(channel);
			let b0 = 0, b1 = 0, b2 = 0;
			
			for (let i = 0; i < bufferSize; i++) {
				const white = Math.random() * 2 - 1;
				b0 = 0.99765 * b0 + white * 0.0990460;
				b1 = 0.96300 * b1 + white * 0.2965164;
				b2 = 0.57000 * b2 + white * 1.0526913;
				let pink = (b0 + b1 + b2 + white * 0.1848) * 0.06;
				
				if (Math.random() < 0.001) {
					pink += (Math.random() - 0.5) * 0.3;
				}
				
				const t = i / this.audioContext.sampleRate;
				const intensity = 0.7 + 0.3 * Math.sin(2 * Math.PI * 0.03 * t);
				
				data[i] = pink * intensity;
			}
		}
		
		return buffer;
	}

	/**
	 * Simula som de riacho/córrego
	 */
	createStreamSound(duration = 10) {
		const bufferSize = this.audioContext.sampleRate * duration;
		const buffer = this.audioContext.createBuffer(2, bufferSize, this.audioContext.sampleRate);
		
		for (let channel = 0; channel < 2; channel++) {
			const data = buffer.getChannelData(channel);
			let lastOut = 0;
			let phase1 = 0, phase2 = 0;
			
			for (let i = 0; i < bufferSize; i++) {
				const t = i / this.audioContext.sampleRate;
				const white = Math.random() * 2 - 1;
				const brown = (lastOut + (0.015 * white)) / 1.015;
				lastOut = brown;
				
				phase1 += 0.01 + Math.random() * 0.02;
				phase2 += 0.005 + Math.random() * 0.01;
				
				const bubble1 = Math.sin(phase1) * 0.1 * (Math.random() < 0.01 ? 1 : 0.1);
				const bubble2 = Math.sin(phase2 * 1.5) * 0.05;
				const flow = 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.1 * t);
				
				data[i] = (brown * 2 + bubble1 + bubble2) * flow;
			}
		}
		
		return buffer;
	}

	/**
	 * Simula canto de pássaros
	 */
	createBirdSounds(duration = 10) {
		const bufferSize = this.audioContext.sampleRate * duration;
		const buffer = this.audioContext.createBuffer(2, bufferSize, this.audioContext.sampleRate);
		
		const birdEvents = [];
		let time = 0;
		while (time < duration) {
			birdEvents.push({
				start: time,
				freq: 1000 + Math.random() * 3000,
				duration: 0.1 + Math.random() * 0.3,
				chirps: Math.floor(1 + Math.random() * 5)
			});
			time += 0.5 + Math.random() * 2;
		}
		
		for (let channel = 0; channel < 2; channel++) {
			const data = buffer.getChannelData(channel);
			const pan = channel === 0 ? 0.3 : 0.7;
			
			for (let i = 0; i < bufferSize; i++) {
				const t = i / this.audioContext.sampleRate;
				let sample = 0;
				
				for (const bird of birdEvents) {
					if (t >= bird.start && t < bird.start + bird.duration * bird.chirps) {
						const localT = t - bird.start;
						const chirpPhase = (localT % bird.duration) / bird.duration;
						const envelope = Math.sin(Math.PI * chirpPhase) * 
							Math.exp(-3 * (localT / (bird.duration * bird.chirps)));
						const modFreq = bird.freq * (1 + 0.5 * Math.sin(2 * Math.PI * 20 * localT));
						const phase = 2 * Math.PI * modFreq * localT;
						sample += Math.sin(phase) * envelope * 0.1 * (Math.random() < pan ? 1 : 0.5);
					}
				}
				
				data[i] = sample;
			}
		}
		
		return buffer;
	}

	/**
	 * Simula som de trovoada distante
	 */
	createThunderSound(duration = 15) {
		const bufferSize = this.audioContext.sampleRate * duration;
		const buffer = this.audioContext.createBuffer(2, bufferSize, this.audioContext.sampleRate);
		
		const thunderEvents = [];
		let time = 2;
		while (time < duration - 3) {
			thunderEvents.push({
				start: time,
				duration: 1 + Math.random() * 3,
				intensity: 0.3 + Math.random() * 0.7
			});
			time += 3 + Math.random() * 5;
		}
		
		for (let channel = 0; channel < 2; channel++) {
			const data = buffer.getChannelData(channel);
			let lastOut = 0;
			
			for (let i = 0; i < bufferSize; i++) {
				const t = i / this.audioContext.sampleRate;
				const white = Math.random() * 2 - 1;
				const rain = (lastOut + (0.02 * white)) / 1.02;
				lastOut = rain;
				
				let thunder = 0;
				for (const event of thunderEvents) {
					if (t >= event.start && t < event.start + event.duration) {
						const localT = t - event.start;
						const progress = localT / event.duration;
						const envelope = Math.exp(-2 * progress) * event.intensity;
						thunder += (Math.random() * 2 - 1) * envelope * 0.5;
					}
				}
				
				data[i] = rain * 0.3 + thunder;
			}
		}
		
		return buffer;
	}

	/**
	 * Gera tom de tigela tibetana
	 */
	createSingingBowl(duration = 10) {
		const bufferSize = this.audioContext.sampleRate * duration;
		const buffer = this.audioContext.createBuffer(2, bufferSize, this.audioContext.sampleRate);
		const fundamentals = [196, 293.66, 329.63, 392];
		
		for (let channel = 0; channel < 2; channel++) {
			const data = buffer.getChannelData(channel);
			
			for (let i = 0; i < bufferSize; i++) {
				const t = i / this.audioContext.sampleRate;
				let sample = 0;
				const strikeEnvelope = Math.exp(-0.3 * t);
				
				for (let h = 0; h < fundamentals.length; h++) {
					const freq = fundamentals[h];
					const harmEnvelope = Math.exp(-0.1 * (h + 1) * t);
					const detune = 1 + (channel * 0.002);
					sample += Math.sin(2 * Math.PI * freq * detune * t) * harmEnvelope * (1 / (h + 1));
					sample += Math.sin(2 * Math.PI * freq * 2.02 * t) * harmEnvelope * 0.3;
					sample += Math.sin(2 * Math.PI * freq * 3.01 * t) * harmEnvelope * 0.15;
				}
				
				data[i] = sample * strikeEnvelope * 0.15;
			}
		}
		
		return buffer;
	}

	/**
	 * Gera drone OM
	 */
	createOmDrone(duration = 10) {
		const bufferSize = this.audioContext.sampleRate * duration;
		const buffer = this.audioContext.createBuffer(2, bufferSize, this.audioContext.sampleRate);
		const fundamental = 136.1;
		
		for (let channel = 0; channel < 2; channel++) {
			const data = buffer.getChannelData(channel);
			const detune = 1 + (channel * 0.003);
			
			for (let i = 0; i < bufferSize; i++) {
				const t = i / this.audioContext.sampleRate;
				let sample = 0;
				
				const fadeTime = 0.5;
				let envelope = 1;
				if (t < fadeTime) envelope = t / fadeTime;
				if (t > duration - fadeTime) envelope = (duration - t) / fadeTime;
				
				sample += Math.sin(2 * Math.PI * fundamental * detune * t) * 0.4;
				sample += Math.sin(2 * Math.PI * fundamental * 2 * detune * t) * 0.2;
				sample += Math.sin(2 * Math.PI * fundamental * 3 * detune * t) * 0.1;
				sample += Math.sin(2 * Math.PI * fundamental * 4 * detune * t) * 0.05;
				
				const vibrato = 1 + 0.005 * Math.sin(2 * Math.PI * 5 * t);
				sample *= vibrato;
				sample += Math.sin(2 * Math.PI * fundamental * 0.5 * t) * 0.15;
				
				data[i] = sample * envelope * 0.5;
			}
		}
		
		return buffer;
	}

	/**
	 * Gera som binaural
	 */
	createBinauralBeat(baseFreq, beatFreq, duration = 10) {
		const bufferSize = this.audioContext.sampleRate * duration;
		const buffer = this.audioContext.createBuffer(2, bufferSize, this.audioContext.sampleRate);
		
		const leftFreq = baseFreq;
		const rightFreq = baseFreq + beatFreq;
		
		const leftData = buffer.getChannelData(0);
		for (let i = 0; i < bufferSize; i++) {
			const t = i / this.audioContext.sampleRate;
			leftData[i] = Math.sin(2 * Math.PI * leftFreq * t) * 0.3;
		}
		
		const rightData = buffer.getChannelData(1);
		for (let i = 0; i < bufferSize; i++) {
			const t = i / this.audioContext.sampleRate;
			rightData[i] = Math.sin(2 * Math.PI * rightFreq * t) * 0.3;
		}
		
		return buffer;
	}

	/**
	 * Obtém um buffer de áudio pelo tipo do som
	 */
	getBuffer(soundType) {
		const generators = {
			'white-noise': () => this.createWhiteNoise(2),
			'pink-noise': () => this.createPinkNoise(2),
			'brown-noise': () => this.createBrownNoise(2),
			'ocean-waves': () => this.createOceanWaves(15),
			'rain': () => this.createRainSound(10),
			'stream': () => this.createStreamSound(10),
			'birds': () => this.createBirdSounds(15),
			'thunder': () => this.createThunderSound(20),
			'singing-bowl': () => this.createSingingBowl(15),
			'om-drone': () => this.createOmDrone(10),
			'binaural-delta': () => this.createBinauralBeat(100, 2, 10),
			'binaural-theta': () => this.createBinauralBeat(100, 6, 10),
			'binaural-alpha': () => this.createBinauralBeat(100, 10, 10),
			'binaural-beta': () => this.createBinauralBeat(100, 20, 10)
		};

		const generator = generators[soundType];
		if (!generator) {
			console.warn(`Tipo de som desconhecido: ${soundType}`);
			return this.createPinkNoise(2);
		}

		return generator();
	}

	/**
	 * Toca um som (método principal para uso externo)
	 */
	async play(soundType, options = {}) {
		await this.init();
		
		const volume = options.volume ?? 0.5;
		const buffer = this.getBuffer(soundType);
		
		const source = this.audioContext.createBufferSource();
		source.buffer = buffer;
		source.loop = true;
		
		const gainNode = this.audioContext.createGain();
		gainNode.gain.value = volume;
		
		source.connect(gainNode);
		gainNode.connect(this.audioContext.destination);
		
		source.start();
		
		const id = `${soundType}-${Date.now()}`;
		this.activeNodes.set(id, { source, gainNode, soundType });
		
		return id;
	}

	/**
	 * Para um som específico
	 */
	stopSound(id) {
		const nodes = this.activeNodes.get(id);
		if (nodes) {
			try {
				nodes.source.stop();
				nodes.source.disconnect();
				nodes.gainNode.disconnect();
			} catch (e) {
				// Ignorar erros se já parou
			}
			this.activeNodes.delete(id);
		}
	}

	/**
	 * Para todos os sons
	 */
	stopAll() {
		for (const id of this.activeNodes.keys()) {
			this.stopSound(id);
		}
	}

	/**
	 * Retorna a quantidade de sons ativos
	 */
	getActiveSoundCount() {
		return this.activeNodes.size;
	}
}

// Export default para uso como módulo ES
export default TherapeuticSoundGenerator;
