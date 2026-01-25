import { Workbox } from 'https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-window.prod.mjs';
import TherapeuticSoundGenerator from './js/audio/therapeuticSounds.js';

// Instância global do gerador de sons terapêuticos
const therapeuticGenerator = new TherapeuticSoundGenerator();

const state = {
	audioCtx: null,
	masterGain: null,
	binauralChain: null,
	presets: [],
	musicMeta: [],
	playlistQueue: [],
	selectedPlaylist: [],
	currentTrackIndex: 0,
	currentHowl: null,
	currentPlayingName: null, // Nome da faixa em reprodução (música local ou YouTube)
	activeHowls: [], // Múltiplas músicas simultâneas
	mixRatio: 0.5,
	currentPan: 0,
	timerId: null,
	remainingSeconds: 0,
	isSessionRunning: false,
	wasPlayingBeforeBlur: false,
	wb: null,
	deferredPrompt: null,
	musicObjectUrls: [],
	history: [],
	archivePreview: null,
	defaultSoundsCatalog: null, // Catálogo de sons padrão para streaming
	// Sistema de Pacientes
	patients: [],
	currentPatient: null,
	patientFormStep: 0,
	// Audio 8D
	audio8D: {
		enabled: false,
		speed: 50,
		intensity: 80,
		pattern: 'circular',
		angle: 0,
		animationId: null,
		targetPan: 0,
		lastPan: 0
	},
	// Enhancer
	enhancer: {
		enabled: false
	},
	// Monitor de Áudio
	audioMonitor: {
		isOpen: false,
		isMinimized: false,
		analyserLeft: null,
		analyserRight: null,
		analyserMaster: null,
		animationId: null,
		peakLeft: 0,
		peakRight: 0,
		peakMaster: 0,
		peakDecay: 0.95,
		sessionStartTime: null
	}
};

const STORAGE_KEYS = {
	PRESETS: 'presets',
	MUSIC_META: 'musicMeta',
	HISTORY: 'sessionHistory',
	PATIENTS: 'patients',
	CURRENT_PATIENT: 'currentPatient'
};

const TERMS_KEY = 'ts-terms-accepted';

const stores = {
	data: localforage.createInstance({ name: 'terra-sensory', storeName: 'ts_data' }),
	music: localforage.createInstance({ name: 'terra-sensory', storeName: 'ts_music' }),
	history: localforage.createInstance({ name: 'terra-sensory', storeName: 'ts_history' }),
	// Store separado para pacientes - persiste mesmo com limpeza de cache
	patients: localforage.createInstance({ 
		name: 'terra-sensory-patients', 
		storeName: 'ts_patients',
		description: 'Dados de pacientes e anamnese - persistente'
	})
};

const uuid = () => (crypto?.randomUUID ? crypto.randomUUID() : `ts-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);

// =============================================================================
// SISTEMA DE FAVORITOS
// =============================================================================

const FAVORITES_KEY = 'playlist-favorites';

/**
 * Carrega lista de IDs favoritos do storage
 * @returns {Promise<string[]>}
 */
async function loadFavorites() {
	try {
		const favorites = await stores.data.getItem(FAVORITES_KEY);
		return favorites || [];
	} catch (e) {
		console.warn('Erro ao carregar favoritos:', e);
		return [];
	}
}

/**
 * Salva lista de favoritos no storage
 * @param {string[]} favorites
 */
async function saveFavorites(favorites) {
	try {
		await stores.data.setItem(FAVORITES_KEY, favorites);
	} catch (e) {
		console.warn('Erro ao salvar favoritos:', e);
	}
}

/**
 * Alterna favorito de um item
 * @param {string} trackId - ID da faixa
 * @returns {Promise<boolean>} - true se agora é favorito, false se removido
 */
async function toggleFavorite(trackId) {
	console.log('[toggleFavorite] trackId:', trackId);
	const favorites = await loadFavorites();
	console.log('[toggleFavorite] favorites antes:', favorites);
	const index = favorites.indexOf(trackId);
	
	if (index === -1) {
		favorites.push(trackId);
		await saveFavorites(favorites);
		console.log('[toggleFavorite] favorites depois (adicionado):', favorites);
		showToast('Adicionado aos favoritos ⭐', 'success', 2000);
		return true;
	} else {
		favorites.splice(index, 1);
		await saveFavorites(favorites);
		console.log('[toggleFavorite] favorites depois (removido):', favorites);
		showToast('Removido dos favoritos', 'info', 2000);
		return false;
	}
}

/**
 * Verifica se um item é favorito
 * @param {string} trackId
 * @param {string[]} favorites - Lista de favoritos (para evitar múltiplas leituras)
 * @returns {boolean}
 */
function isFavorite(trackId, favorites) {
	return favorites.includes(trackId);
}

// =============================================================================
// TOAST / NOTIFICAÇÕES VISUAIS
// =============================================================================

/**
 * Mostra uma notificação toast temporária
 * @param {string} message - Mensagem a exibir
 * @param {string} type - Tipo: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duração em ms (padrão: 3000)
 */
function showToast(message, type = 'info', duration = 3000) {
	// Remove toast anterior se existir
	const existingToast = document.querySelector('.app-toast');
	if (existingToast) {
		existingToast.remove();
	}
	
	// Cria o elemento toast
	const toast = document.createElement('div');
	toast.className = `app-toast app-toast--${type}`;
	
	// Ícone baseado no tipo
	const icons = {
		success: 'fa-circle-check',
		error: 'fa-circle-xmark',
		warning: 'fa-triangle-exclamation',
		info: 'fa-circle-info'
	};
	
	toast.innerHTML = `
		<i class="fa-solid ${icons[type] || icons.info}"></i>
		<span>${message}</span>
	`;
	
	// Adiciona ao body
	document.body.appendChild(toast);
	
	// Força reflow para animação
	toast.offsetHeight;
	toast.classList.add('show');
	
	// Remove após duração
	setTimeout(() => {
		toast.classList.remove('show');
		setTimeout(() => toast.remove(), 300);
	}, duration);
}

// =============================================================================
// ESTRUTURA DE DADOS DO PACIENTE E ANAMNESE
// =============================================================================

/**
 * Schema completo do paciente baseado em anamnese clínica profissional
 * Adaptado para terapia vibroacústica e musicoterapia
 */
function createEmptyPatient() {
	return {
		id: uuid(),
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		
		// 1. IDENTIFICAÇÃO E DADOS BÁSICOS
		identification: {
			fullName: '',
			preferredName: '',
			birthDate: '',
			age: null,
			gender: '',
			genderOther: '',
			cpf: '',
			phone: '',
			phoneSecondary: '',
			email: '',
			address: '',
			city: '',
			state: '',
			occupation: '',
			maritalStatus: '',
			referralSource: '', // Quem indicou
			referralProfessional: '', // Profissional que encaminhou
			emergencyContact: '',
			emergencyPhone: ''
		},
		
		// 2. QUEIXA PRINCIPAL (QP)
		chiefComplaint: {
			mainComplaint: '', // Nas palavras do paciente
			complaintDuration: '', // Há quanto tempo
			complaintOnset: '', // Data aproximada de início
			painIntensity: null, // Escala 0-10
			painType: [], // pontada, queimação, latejante, contínua, etc.
			painLocation: [], // Localização(ões) da dor
			functionalImpact: '' // Como afeta o dia a dia
		},
		
		// 3. HISTÓRIA DA DOENÇA ATUAL (HDA)
		currentIllnessHistory: {
			symptomEvolution: '', // Como os sintomas evoluíram
			aggravatingFactors: '', // O que piora
			relievingFactors: '', // O que alivia
			previousTreatments: '', // Tratamentos já tentados
			treatmentResults: '', // Resultados obtidos
			sleepImpact: '', // Impacto no sono
			workImpact: '', // Impacto no trabalho
			moodImpact: '', // Impacto no humor
			dailyActivitiesImpact: '' // Impacto nas atividades diárias
		},
		
		// 4. HISTÓRIA PATOLÓGICA PREGRESSA E MEDICAMENTOS
		medicalHistory: {
			previousDiseases: [], // Doenças anteriores
			surgeries: [], // Cirurgias (nome, ano)
			hospitalizations: [], // Internações
			allergies: [], // Alergias conhecidas
			currentMedications: [], // Medicamentos em uso (nome, dose, frequência)
			supplements: '', // Suplementos
			complementaryTherapies: [], // Terapias complementares em curso
			contraindications: {
				epilepsy: false,
				pacemaker: false,
				pregnancy: false,
				pregnancyHighRisk: false,
				thrombosis: false,
				recentSurgery: false,
				vibrationHypersensitivity: false,
				severeHearingLoss: false,
				psychoticDisorders: false,
				other: ''
			}
		},
		
		// 5. HISTÓRIA FAMILIAR
		familyHistory: {
			cardiovascular: false, // Doenças cardíacas
			psychiatric: false, // Transtornos psiquiátricos
			neurological: false, // Doenças neurológicas
			chronicPain: false, // Dor crônica
			diabetes: false,
			hypertension: false,
			cancer: false,
			autoimmune: false,
			observations: ''
		},
		
		// 6. HÁBITOS E ESTILO DE VIDA
		lifestyle: {
			sleepQuality: '', // boa, regular, ruim
			sleepHours: null,
			sleepDifficulties: '', // dificuldade para dormir, acordar, etc.
			physicalActivity: '', // sedentário, leve, moderado, intenso
			physicalActivityFrequency: '',
			dietQuality: '', // equilibrada, irregular, restritiva
			hydration: '', // adequada, insuficiente
			smokingStatus: '', // nunca, ex-fumante, fumante
			smokingDetails: '',
			alcoholUse: '', // nunca, ocasional, regular, frequente
			alcoholDetails: '',
			caffeineUse: '', // quantidade diária
			drugUse: '', // uso de substâncias
			workRoutine: '', // horas, tipo de trabalho
			stressLevel: '', // baixo, moderado, alto, muito alto
			leisureActivities: '',
			socialSupport: '' // rede de apoio
		},
		
		// 7. ASPECTOS PSICOSSOCIAIS E EMOCIONAIS
		psychosocial: {
			currentMood: '', // Como se sente atualmente
			anxietyLevel: '', // nenhuma, leve, moderada, severa
			depressionSymptoms: false,
			recentLifeEvents: '', // Eventos significativos recentes
			copingStrategies: '', // Como lida com estresse
			treatmentExpectations: '', // O que espera do tratamento
			motivationLevel: '', // baixa, moderada, alta
			previousPsychotherapy: false,
			currentPsychotherapy: false,
			supportNetwork: '' // Quem oferece apoio
		},
		
		// 8. FICHA MUSICOTERAPÊUTICA / VIBROACÚSTICA
		musicTherapyProfile: {
			// Histórico Musical
			musicalBackground: '', // Experiência com música
			playsInstrument: false,
			instruments: '',
			singingExperience: '',
			musicalTraining: '',
			
			// Preferências Musicais
			preferredGenres: [], // Gêneros preferidos
			dislikedGenres: [], // Gêneros que não gosta
			preferredArtists: '',
			musicForRelaxation: '', // Músicas que relaxam
			musicForEnergy: '', // Músicas que energizam
			
			// Experiências Sensoriais
			soundSensitivity: '', // normal, aumentada, diminuída
			frequencyPreference: '', // graves, médios, agudos
			vibrationExperience: '', // Experiência anterior com vibração
			vibrationTolerance: '', // boa, moderada, baixa
			hearingIssues: '', // Problemas auditivos
			tinnitus: false,
			tinnitusDetails: '',
			
			// Experiências Anteriores com Terapia
			previousMusicTherapy: false,
			previousMusicTherapyDetails: '',
			previousVibroacoustic: false,
			previousVibroacousticDetails: '',
			binauralBeatsExperience: '',
			
			// Respostas a Sons
			soundAversions: [], // Sons que incomodam
			calmingSounds: [], // Sons que acalmam
			triggerSounds: '', // Sons que causam ansiedade/desconforto
			
			// Objetivos Terapêuticos com Música
			therapeuticGoals: [], // Objetivos específicos
			otherGoals: ''
		},
		
		// 9. AVALIAÇÃO FÍSICA (quando aplicável)
		physicalAssessment: {
			bloodPressure: '',
			heartRate: null,
			respiratoryRate: null,
			oxygenSaturation: null,
			weight: null,
			height: null,
			posturalObservations: '',
			mobilityObservations: '',
			painPointsMap: '', // Descrição dos pontos de dor
			muscularTensionAreas: ''
		},
		
		// 10. SÍNTESE E PLANO TERAPÊUTICO
		therapeuticPlan: {
			clinicalSummary: '', // Síntese do caso
			mainHypothesis: '', // Hipóteses diagnósticas
			therapeuticObjectives: [], // Objetivos do tratamento
			recommendedProtocols: [], // Protocolos recomendados
			sessionFrequency: '', // Frequência das sessões
			estimatedDuration: '', // Duração estimada do tratamento
			precautions: '', // Precauções específicas
			observations: '',
			consentObtained: false,
			consentDate: ''
		},
		
		// HISTÓRICO DE SESSÕES (vinculado ao paciente)
		sessions: [] // Array de sessões realizadas com este paciente
	};
}

// Opções para campos de seleção
const PATIENT_FORM_OPTIONS = {
	genders: ['Masculino', 'Feminino', 'Não-binário', 'Prefiro não informar', 'Outro'],
	maritalStatus: ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)', 'Outro'],
	painTypes: ['Pontada', 'Queimação', 'Latejante', 'Contínua', 'Pressão', 'Formigamento', 'Irradiada', 'Cólica'],
	painLocations: ['Cabeça', 'Pescoço', 'Ombros', 'Coluna cervical', 'Coluna torácica', 'Coluna lombar', 'Quadril', 'Membros superiores', 'Membros inferiores', 'Articulações', 'Abdômen', 'Tórax', 'Generalizada'],
	sleepQuality: ['Boa', 'Regular', 'Ruim', 'Muito ruim'],
	physicalActivityLevels: ['Sedentário', 'Leve (1-2x/semana)', 'Moderado (3-4x/semana)', 'Intenso (5+x/semana)'],
	stressLevels: ['Baixo', 'Moderado', 'Alto', 'Muito alto'],
	anxietyLevels: ['Nenhuma', 'Leve', 'Moderada', 'Severa'],
	motivationLevels: ['Baixa', 'Moderada', 'Alta'],
	soundSensitivity: ['Normal', 'Aumentada (hipersensibilidade)', 'Diminuída'],
	frequencyPreferences: ['Graves (relaxantes)', 'Médios (equilibrados)', 'Agudos (estimulantes)', 'Sem preferência'],
	vibrationTolerance: ['Boa (aceita bem)', 'Moderada', 'Baixa (desconforto)'],
	musicGenres: ['Clássica', 'Instrumental', 'Ambiente/New Age', 'Jazz', 'MPB', 'Pop', 'Rock', 'Eletrônica', 'Folk', 'World Music', 'Natureza/Sons ambientes', 'Mantras/Meditativa', 'Gospel/Religiosa', 'Outro'],
	soundAversions: ['Sons agudos', 'Sons graves intensos', 'Música alta', 'Ruídos repentinos', 'Vozes', 'Instrumentos de sopro', 'Percussão intensa', 'Nenhuma aversão específica'],
	therapeuticGoals: ['Redução de dor', 'Relaxamento muscular', 'Melhora do sono', 'Redução de ansiedade', 'Redução de estresse', 'Melhora do humor', 'Aumento de foco/concentração', 'Meditação', 'Recuperação física', 'Alívio de zumbido', 'Bem-estar geral']
};

// Bandas cerebrais corrigidas conforme literatura científica
const DIFF_BANDS = [
	{ range: [0.5, 4], label: 'Delta profundo', tag: 'sono', description: 'Sono reparador, analgesia, regeneração celular' },
	{ range: [4, 8], label: 'Teta introspectiva', tag: 'meditacao', description: 'Meditação profunda, criatividade, REM' },
	{ range: [8, 13], label: 'Alfa relaxado', tag: 'relax/vibro', description: 'Relaxamento alerta, redução de ansiedade' },
	{ range: [12, 15], label: 'SMR sensório-motor', tag: 'smr', description: 'Calma focada, controle motor, TDAH' },
	{ range: [13, 30], label: 'Beta ativo', tag: 'foco', description: 'Concentração, alerta, resolução de problemas' },
	{ range: [30, 40], label: 'Gama cognitivo', tag: 'cognitivo', description: 'Processamento superior, percepção, memória' }
];

// Protocolos terapêuticos baseados em estudos científicos
const THERAPEUTIC_PROTOCOLS = {
	// Dor e Tensão (Skille 1991)
	'pain-lumbar': { baseHz: 52, diffHz: 2, duration: 30, binauralVolume: 70, lowPass: 70, name: 'Dor Lombar' },
	'pain-muscle': { baseHz: 40, diffHz: 6, duration: 25, binauralVolume: 65, lowPass: 60, name: 'Espasmos Musculares' },
	'pain-fibro': { baseHz: 40, diffHz: 10, duration: 40, binauralVolume: 60, lowPass: 60, name: 'Fibromialgia' },
	'tension-neck': { baseHz: 60, diffHz: 10, duration: 20, binauralVolume: 65, lowPass: 80, name: 'Tensão Cervical' },
	// Relaxamento (Wigram 1995)
	'relax-anxiety': { baseHz: 68, diffHz: 10, duration: 25, binauralVolume: 60, lowPass: 90, name: 'Ansiedade' },
	'relax-deep': { baseHz: 52, diffHz: 6, duration: 35, binauralVolume: 65, lowPass: 70, name: 'Relaxamento Profundo' },
	'relax-stress': { baseHz: 60, diffHz: 14, duration: 20, binauralVolume: 55, lowPass: 80, name: 'Redução de Estresse' },
	// Sono (Oster 1973)
	'sleep-induction': { baseHz: 40, diffHz: 2, duration: 30, binauralVolume: 55, lowPass: 60, name: 'Indução ao Sono' },
	'sleep-deep': { baseHz: 52, diffHz: 1, duration: 45, binauralVolume: 50, lowPass: 70, name: 'Sono Reparador' },
	'sleep-insomnia': { baseHz: 40, diffHz: 3, duration: 40, binauralVolume: 55, lowPass: 60, name: 'Insônia Crônica' },
	// Cognição e Foco
	'focus-attention': { baseHz: 80, diffHz: 18, duration: 20, binauralVolume: 50, lowPass: 100, name: 'Atenção Sustentada' },
	'focus-creativity': { baseHz: 68, diffHz: 7, duration: 25, binauralVolume: 55, lowPass: 90, name: 'Criatividade' },
	'focus-memory': { baseHz: 80, diffHz: 40, duration: 15, binauralVolume: 45, lowPass: 100, name: 'Memória' },
	// Respiratório (Skille)
	'resp-expansion': { baseHz: 68, diffHz: 8, duration: 20, binauralVolume: 60, lowPass: 90, name: 'Expansão Pulmonar' },
	'resp-asthma': { baseHz: 50, diffHz: 5, duration: 25, binauralVolume: 55, lowPass: 70, name: 'Suporte Asmático' }
};

const STOCK_TEXTURES = [];

const ui = {};

// Inicialização
window.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
	cacheDom();
	attachListeners();
	initPlaylistManager(); // Inicializa o gerenciador de playlist ANTES de carregar dados
	initPlayerController(); // Inicializa o controlador de player integrado
	await hydratePresetStore();
	await hydrateMusicStore();
	await ensureStockTextures();
	await loadBundledAudio(); // Carrega áudios pré-incluídos
	await hydrateHistory();
	await hydratePatients();
	setupAudioGraph();
	updateRangeOutputs();
	updateConnectivity();
	updateMixOutput(state.mixRatio * 100);
	updatePanOutput(0);
	await PlaylistManager.render(); // Renderiza playlist via novo módulo
	updateSuggestions();
	registerServiceWorker();
	checkTermsModal();
	verifyHeadphones();
	setFooterYear();
	initScientificTicker();
	updatePatientBar();
	console.log('Terra Vibro Sensory Musical pronto. Presets carregados:', state.presets.length);
}

/**
 * Inicializa o PlaylistManager com as configurações necessárias
 */
function initPlaylistManager() {
	if (typeof PlaylistManager !== 'undefined') {
		PlaylistManager.init({
			container: ui.playlistSelect,
			countEl: ui.playlistCount,
			state: state,
			stores: stores,
			onTrackRemove: async (trackId, isYoutube) => {
				if (isYoutube) {
					await removeUserYoutubeVideo(trackId);
				} else {
					await removeTrack(trackId);
				}
			},
			onFavoriteToggle: handleFavoriteToggle,
			onShowToast: showToast,
			onShowSoundEvidence: showSoundEvidence
		});
	}
}

/**
 * Inicializa o PlayerController com as configurações necessárias
 */
function initPlayerController() {
	if (typeof PlayerController !== 'undefined') {
		PlayerController.init({
			state: state,
			stores: stores,
			ui: ui,
			// Callbacks de áudio binaural
			onBuildBinauralChain: buildBinauralChain,
			onStopBinaural: stopBinaural,
			onResumeAudioContext: resumeAudioContext,
			onSetupPlaylist: setupPlaylist,
			onScheduleMixer: scheduleMixer,
			onStopCurrentTrack: stopCurrentTrack,
			onStopYoutubeAudio: stopYoutubeAudio,
			// Callbacks de timer
			onStartTimer: startTimer,
			onStopTimer: () => { clearInterval(state.timerId); state.timerId = null; },
			onUpdateTimerProgress: updateTimerProgress,
			onPlayBeep: playBeep,
			// Callbacks de UI
			onUpdateSessionUI: updateSessionUI,
			onUpdateFrequencyDisplay: updateFrequencyDisplay,
			onStartBreathingGuide: startBreathingGuide,
			onStopBreathingGuide: stopBreathingGuide,
			onOpenAudioMonitor: openAudioMonitor,
			// Callbacks de sessão
			onLogSession: logSession,
			onSetupMediaSession: setupMediaSession,
			onUpdateMediaSessionState: updateMediaSessionState,
			onCollectPresetFromForm: collectPresetFromForm,
			// Callbacks de notificação
			onShowToast: showToast
		});
		console.log('[App] PlayerController inicializado');
	}
}

function cacheDom() {
	ui.presetList = document.getElementById('presetList');
	ui.loadDefaultPresets = document.getElementById('loadDefaultPresets');
	ui.form = document.getElementById('sessionForm');
	ui.baseFreq = document.getElementById('baseFreq');
	ui.baseFreqValue = document.getElementById('baseFreqValue');
	ui.diffFreq = document.getElementById('diffFreq');
	ui.diffFreqValue = document.getElementById('diffFreqValue');
	ui.protocolQuickSelector = document.getElementById('protocolQuickSelector');
	ui.duration = document.getElementById('duration');
	ui.durationValue = document.getElementById('durationValue');
	ui.binauralVolume = document.getElementById('binauralVolume');
	ui.binauralVolumeValue = document.getElementById('binauralVolumeValue');
	ui.lowPass = document.getElementById('lowPass');
	ui.lowPassValue = document.getElementById('lowPassValue');
	ui.playlistSelect = document.getElementById('playlistSelect');
	ui.playlistCount = document.getElementById('playlistCount');
	ui.musicSuggestions = document.getElementById('musicSuggestions');
	ui.audioUpload = document.getElementById('audioUpload');
	ui.dropZone = document.getElementById('dropZone');
	// Upload validation elements
	ui.uploadValidationArea = document.getElementById('uploadValidationArea');
	ui.uploadValidationList = document.getElementById('uploadValidationList');
	ui.uploadConfirmBtn = document.getElementById('uploadConfirmBtn');
	ui.uploadCancelBtn = document.getElementById('uploadCancelBtn');
	ui.uploadStatus = document.getElementById('uploadStatus');
	ui.playBtn = document.getElementById('playBtn');
	ui.pauseBtn = document.getElementById('pauseBtn');
	ui.stopBtn = document.getElementById('stopBtn');
	ui.mixSlider = document.getElementById('mixSlider');
	ui.mixValue = document.getElementById('mixValue');
	ui.panSlider = document.getElementById('panSlider');
	ui.panValue = document.getElementById('panValue');
	ui.timerDisplay = document.getElementById('timerDisplay');
	ui.onlineStatus = document.getElementById('onlineStatus');
	ui.offlineStatus = document.getElementById('offlineStatus');
	ui.installBtn = document.getElementById('installPwaBtn');
	ui.headphoneStatus = document.getElementById('headphoneStatus');
	ui.termsModal = document.getElementById('termsModal');
	ui.acceptTerms = document.getElementById('acceptTerms');
	ui.year = document.getElementById('year');
	// Tutorial Modal (Boas-vindas)
	ui.tutorialSlides = document.getElementById('tutorialSlides');
	ui.tutorialDots = document.getElementById('tutorialDots');
	ui.tutorialPrev = document.getElementById('tutorialPrev');
	ui.tutorialNext = document.getElementById('tutorialNext');
	ui.termsCheckbox = document.getElementById('termsCheckbox');
	// Tutorial Guiado Interativo
	ui.guidedTutorial = document.getElementById('guidedTutorial');
	ui.tutorialSpotlight = document.getElementById('tutorialSpotlight');
	ui.tutorialTooltip = document.getElementById('tutorialTooltip');
	ui.tooltipStep = document.getElementById('tooltipStep');
	ui.tooltipTitle = document.getElementById('tooltipTitle');
	ui.tooltipText = document.getElementById('tooltipText');
	ui.tooltipArrow = document.getElementById('tooltipArrow');
	ui.closeTutorialBtn = document.getElementById('closeTutorialBtn');
	ui.skipTutorialBtn = document.getElementById('skipTutorialBtn');
	ui.tutorialPrevBtn = document.getElementById('tutorialPrevBtn');
	ui.tutorialNextBtn = document.getElementById('tutorialNextBtn');
	// YouTube Add Panel
	ui.youtubeUrlInput = document.getElementById('youtubeUrlInput');
	ui.youtubeNameInput = document.getElementById('youtubeNameInput');
	ui.youtubeTagInput = document.getElementById('youtubeTagInput');
	ui.youtubePreviewBtn = document.getElementById('youtubePreviewBtn');
	ui.youtubeAddBtn = document.getElementById('youtubeAddBtn');
	ui.youtubeAddStatus = document.getElementById('youtubeAddStatus');
	// Novos elementos do Centro de Controle Terapêutico
	ui.sessionStatus = document.getElementById('sessionStatus');
	ui.sessionVisualizer = document.getElementById('sessionVisualizer');
	ui.wavePulse = document.getElementById('wavePulse');
	ui.frequencyDisplay = document.getElementById('frequencyDisplay');
	ui.timerProgress = document.getElementById('timerProgress');
	ui.circularTimer = document.getElementById('circularTimer');
	ui.breathingGuide = document.getElementById('breathingGuide');
	ui.breathCircle = document.getElementById('breathCircle');
	ui.breathText = document.getElementById('breathText');
	// Ticker de dicas científicas
	ui.tickerText = document.getElementById('tickerText');
	ui.tickerPrev = document.getElementById('tickerPrev');
	ui.tickerPause = document.getElementById('tickerPause');
	ui.tickerNext = document.getElementById('tickerNext');
	ui.tickerPauseIcon = document.getElementById('tickerPauseIcon');
	
	// Sistema de Pacientes
	ui.patientBar = document.getElementById('patientBar');
	ui.currentPatientName = document.querySelector('.patient-bar__name');
	ui.newPatientBtn = document.getElementById('newPatientBtn');
	ui.listPatientsBtn = document.getElementById('openPatientListBtn');
	ui.patientModal = document.getElementById('patientFormModal');
	ui.patientModalClose = document.getElementById('closePatientFormModal');
	ui.patientModalTitle = document.getElementById('patientFormTitle');
	ui.patientForm = document.getElementById('patientForm');
	ui.anamnesisSteps = document.getElementById('anamnesisSteps');
	ui.savePatientBtn = document.getElementById('savePatientBtn');
	ui.prevStepBtn = document.getElementById('prevStepBtn');
	ui.nextStepBtn = document.getElementById('nextStepBtn');
	ui.stepIndicator = document.getElementById('stepIndicator');
	ui.patientsListModal = document.getElementById('patientListModal');
	ui.patientsListModalClose = document.getElementById('closePatientListModal');
	ui.patientsSearchInput = document.getElementById('patientSearchInput');
	ui.patientsList = document.getElementById('patientList');
	ui.noPatientsMessage = document.getElementById('noPatients');
	ui.newPatientFromListBtn = document.getElementById('newPatientFromListBtn');
	ui.selectPatientFolderBtn = document.getElementById('selectStorageFolderBtn');
	ui.exportPatientsBtn = document.getElementById('exportPatientsBtn');
	ui.exportTerraMidiBtn = document.getElementById('exportTerraMidiBtn');
	ui.importPatientsBtn = document.getElementById('importPatientsBtn');
	ui.importPatientsInput = document.getElementById('importPatientsInput');
	
	// Footer Actions
	ui.repeatTutorialBtn = document.getElementById('repeatTutorialBtn');
	ui.showTermsBtn = document.getElementById('showTermsBtn');
	
	// Painel de Sessão (Frequências)
	ui.monitorFreqLeft = document.getElementById('monitorFreqLeft');
	ui.monitorFreqRight = document.getElementById('monitorFreqRight');
	ui.monitorFreqDiff = document.getElementById('monitorFreqDiff');
	ui.monitorBrainwaveBadge = document.getElementById('monitorBrainwaveBadge');
	
	// Menu Drawer Principal
	ui.menuToggle = document.getElementById('menuToggle');
	ui.mainDrawer = document.getElementById('mainDrawer');
	ui.mainDrawerOverlay = document.getElementById('mainDrawerOverlay');
	ui.closeDrawerBtn = document.getElementById('closeDrawerBtn');
	ui.drawerTabs = document.querySelectorAll('.drawer-tab');
	ui.drawerContents = document.querySelectorAll('.drawer-content');
	ui.scientificFoundations = document.getElementById('scientificFoundations');
	ui.scientificReferences = document.getElementById('scientificReferences');
	
	// Player Bar (Unified)
	ui.playerBar = document.getElementById('playerBar');
	ui.timerTotal = document.getElementById('timerTotal');
	
	// Audio 8D e Enhancer toggles
	ui.audio8DToggle = document.getElementById('audio-8d-toggle');
	ui.enhancerToggle = document.getElementById('enhancer-toggle');
	ui.audio8dControls = document.getElementById('audio8dControls');
	ui.enhancerControls = document.getElementById('enhancerControls');
	ui.audio8dSpeed = document.getElementById('audio8dSpeed');
	ui.audio8dSpeedValue = document.getElementById('audio8dSpeedValue');
	ui.audio8dIntensity = document.getElementById('audio8dIntensity');
	ui.audio8dIntensityValue = document.getElementById('audio8dIntensityValue');
	ui.enhancerPreset = document.getElementById('enhancerPreset');
	
	// EQ controls
	ui.eqLow = document.getElementById('eqLow');
	ui.eqMid = document.getElementById('eqMid');
	ui.eqHigh = document.getElementById('eqHigh');
	ui.compressorRatio = document.getElementById('compressorRatio');
	ui.compressorValue = document.getElementById('compressorValue');
}

function attachListeners() {
	// Menu Drawer Principal
	ui.menuToggle.addEventListener('click', openMainDrawer);
	ui.closeDrawerBtn.addEventListener('click', closeMainDrawer);
	ui.mainDrawerOverlay.addEventListener('click', closeMainDrawer);
	ui.drawerTabs.forEach(tab => {
		tab.addEventListener('click', () => switchDrawerTab(tab.dataset.tab));
	});
	
	document.addEventListener('keydown', (ev) => {
		if (ev.key === 'Escape' && ui.mainDrawer.classList.contains('open')) {
			closeMainDrawer();
		}
	});
	
	ui.form.addEventListener('submit', handlePresetSave);
	ui.loadDefaultPresets.addEventListener('click', reloadScientificPresets);
	ui.baseFreq.addEventListener('input', () => {
		updateRangeOutputs();
		updateBinauralFrequenciesRealtime();
	});
	ui.diffFreq.addEventListener('input', () => {
		updateRangeOutputs();
		updateSuggestions();
		updateBinauralFrequenciesRealtime();
		// Remove estado ativo dos botões de protocolo quando slider é movido manualmente
		ui.protocolQuickSelector?.querySelectorAll('.protocol-chip').forEach(b => b.classList.remove('active'));
	});
	// Seletor rápido de protocolos - clique para aplicar configuração completa
	ui.protocolQuickSelector?.addEventListener('click', handleProtocolQuickSelect);
	ui.duration.addEventListener('input', updateRangeOutputs);
	ui.binauralVolume.addEventListener('input', () => {
		updateRangeOutputs();
		warnHighVolume();
		updateBinauralVolumeRealtime();
	});
	ui.lowPass.addEventListener('input', () => {
		updateRangeOutputs();
		updateLowPassRealtime();
	});
	ui.playBtn?.addEventListener('click', handlePlay);
	ui.pauseBtn?.addEventListener('click', handlePause);
	ui.stopBtn?.addEventListener('click', stopSession);
	ui.mixSlider.addEventListener('input', handleMixChange);
	ui.panSlider.addEventListener('input', handlePanChange);
	// Upload com validação
	ui.audioUpload.addEventListener('change', (ev) => handleFilesWithValidation(ev.target.files));
	ui.uploadConfirmBtn?.addEventListener('click', confirmValidatedUploads);
	ui.uploadCancelBtn?.addEventListener('click', cancelUploadValidation);
	['dragover', 'drop', 'dragleave'].forEach((evt) => {
		ui.dropZone.addEventListener(evt, handleDropZone, false);
	});
	// Nota: event listeners do playlist são gerenciados pelo PlaylistManager
	ui.presetList.addEventListener('click', handlePresetActions);
	window.addEventListener('online', updateConnectivity);
	window.addEventListener('offline', updateConnectivity);
	document.addEventListener('visibilitychange', handleVisibilityChange);
	window.addEventListener('blur', handleWindowBlur);
	window.addEventListener('focus', handleWindowFocus);
	window.addEventListener('beforeinstallprompt', captureInstallPrompt);
	ui.installBtn.addEventListener('click', triggerInstallPrompt);
	ui.acceptTerms.addEventListener('click', acceptTerms);
	// Tutorial Modal (Boas-vindas)
	ui.tutorialPrev.addEventListener('click', tutorialPrevSlide);
	ui.tutorialNext.addEventListener('click', tutorialNextSlide);
	ui.tutorialDots.addEventListener('click', handleTutorialDotClick);
	ui.termsCheckbox.addEventListener('change', handleTermsCheckboxChange);
	// Tutorial Guiado Interativo
	ui.closeTutorialBtn.addEventListener('click', endGuidedTutorial);
	ui.skipTutorialBtn.addEventListener('click', endGuidedTutorial);
	ui.tutorialPrevBtn.addEventListener('click', guidedTutorialPrev);
	ui.tutorialNextBtn.addEventListener('click', guidedTutorialNext);
	window.addEventListener('resize', repositionTutorialTooltip);
	// YouTube Add Panel
	ui.youtubePreviewBtn.addEventListener('click', handleYoutubePreviewToggle);
	ui.youtubeAddBtn.addEventListener('click', handleConfirmAddYoutubeVideo);
	ui.youtubeUrlInput.addEventListener('keydown', (ev) => {
		if (ev.key === 'Enter') {
			ev.preventDefault();
			handleYoutubePreviewToggle();
		}
	});
	ui.youtubeUrlInput.addEventListener('input', resetYoutubeAddForm);
	
	// Ticker de dicas científicas
	if (ui.tickerPrev) {
		ui.tickerPrev.addEventListener('click', () => {
			showPreviousTip();
			resetTickerInterval();
		});
	}
	if (ui.tickerNext) {
		ui.tickerNext.addEventListener('click', () => {
			showNextTip();
			resetTickerInterval();
		});
	}
	if (ui.tickerPause) {
		ui.tickerPause.addEventListener('click', toggleTickerPause);
	}
	
	// Sistema de Pacientes
	if (ui.newPatientBtn) {
		ui.newPatientBtn.addEventListener('click', () => openPatientModal());
	}
	if (ui.listPatientsBtn) {
		ui.listPatientsBtn.addEventListener('click', openPatientsListModal);
	}
	if (ui.patientModalClose) {
		ui.patientModalClose.addEventListener('click', closePatientModal);
	}
	if (ui.savePatientBtn) {
		ui.savePatientBtn.addEventListener('click', (e) => {
			e.preventDefault();
			saveCurrentPatient();
		});
	}
	if (ui.prevStepBtn) {
		ui.prevStepBtn.addEventListener('click', goToPreviousStep);
	}
	if (ui.nextStepBtn) {
		ui.nextStepBtn.addEventListener('click', goToNextStep);
	}
	if (ui.patientsListModalClose) {
		ui.patientsListModalClose.addEventListener('click', closePatientsListModal);
	}
	if (ui.patientsSearchInput) {
		ui.patientsSearchInput.addEventListener('input', handlePatientSearch);
	}
	if (ui.anamnesisSteps) {
		ui.anamnesisSteps.addEventListener('click', handleStepNavClick);
	}
	if (ui.patientsList) {
		ui.patientsList.addEventListener('click', handlePatientsListClick);
	}
	if (ui.newPatientFromListBtn) {
		ui.newPatientFromListBtn.addEventListener('click', () => {
			closePatientsListModal();
			setTimeout(() => openPatientModal(), 100);
		});
	}
	// Botão de seleção de pasta local para pacientes
	if (ui.selectPatientFolderBtn) {
		ui.selectPatientFolderBtn.addEventListener('click', async () => {
			const { selectPatientFolder } = await import('./js/patients/patientManager.js');
			await selectPatientFolder();
		});
	}
	// Exportar todos os pacientes
	if (ui.exportPatientsBtn) {
		ui.exportPatientsBtn.addEventListener('click', async () => {
			const { exportAllData } = await import('./js/patients/patientManager.js');
			await exportAllData();
		});
	}
	// Exportar para TerraMidi
	if (ui.exportTerraMidiBtn) {
		ui.exportTerraMidiBtn.addEventListener('click', async () => {
			const { downloadTerraMidiExport } = await import('./js/patients/terraMidiCompat.js');
			const data = downloadTerraMidiExport();
			alert(`${data.patients.length} paciente(s) exportado(s) no formato TerraMidi.\n\nO arquivo pode ser importado no TerraMidi para compartilhar o prontuário.`);
		});
	}
	// Importar pacientes
	if (ui.importPatientsBtn) {
		ui.importPatientsBtn.addEventListener('click', () => {
			ui.importPatientsInput?.click();
		});
	}
	if (ui.importPatientsInput) {
		ui.importPatientsInput.addEventListener('change', handleImportPatients);
	}
	// Fechar modais clicando fora
	if (ui.patientModal) {
		ui.patientModal.addEventListener('click', (e) => {
			if (e.target === ui.patientModal) closePatientModal();
		});
	}
	if (ui.patientsListModal) {
		ui.patientsListModal.addEventListener('click', (e) => {
			if (e.target === ui.patientsListModal) closePatientsListModal();
		});
	}
	// Submit do formulário de paciente
	if (ui.patientForm) {
		ui.patientForm.addEventListener('submit', (e) => {
			e.preventDefault();
			saveCurrentPatient();
		});
	}
	
	// Footer Actions - Repetir Tutorial e Ver Termos
	if (ui.repeatTutorialBtn) {
		ui.repeatTutorialBtn.addEventListener('click', resetAndStartGuidedTutorial);
	}
	if (ui.showTermsBtn) {
		ui.showTermsBtn.addEventListener('click', showTermsModal);
	}
	
	// Audio 8D Toggle
	if (ui.audio8DToggle) {
		ui.audio8DToggle.addEventListener('click', toggleAudio8D);
		ui.audio8DToggle.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggleAudio8D();
			}
		});
	}
	if (ui.audio8dSpeed) {
		ui.audio8dSpeed.addEventListener('input', updateAudio8DSettings);
	}
	if (ui.audio8dIntensity) {
		ui.audio8dIntensity.addEventListener('input', updateAudio8DSettings);
	}
	// Pattern buttons
	document.querySelectorAll('.pattern-btn').forEach(btn => {
		btn.addEventListener('click', (e) => {
			document.querySelectorAll('.pattern-btn').forEach(b => b.classList.remove('active'));
			e.currentTarget.classList.add('active');
			updateAudio8DSettings();
		});
	});
	
	// Enhancer Toggle
	if (ui.enhancerToggle) {
		ui.enhancerToggle.addEventListener('click', toggleEnhancer);
		ui.enhancerToggle.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggleEnhancer();
			}
		});
	}
	if (ui.enhancerPreset) {
		ui.enhancerPreset.addEventListener('change', updateEnhancerSettings);
	}
	
	// EQ Sliders
	if (ui.eqLow) {
		ui.eqLow.addEventListener('input', updateEQFromSliders);
	}
	if (ui.eqMid) {
		ui.eqMid.addEventListener('input', updateEQFromSliders);
	}
	if (ui.eqHigh) {
		ui.eqHigh.addEventListener('input', updateEQFromSliders);
	}
	if (ui.compressorRatio) {
		ui.compressorRatio.addEventListener('input', () => {
			const ratio = parseFloat(ui.compressorRatio.value);
			if (ui.compressorValue) {
				ui.compressorValue.textContent = `${ratio}:1`;
			}
			if (state.enhancer.enabled && state.enhancer.nodes.compressor) {
				state.enhancer.nodes.compressor.ratio.value = ratio;
			}
		});
	}
}

function setupAudioGraph() {
	const AudioContextClass = window.AudioContext || window.webkitAudioContext;
	state.audioCtx = new AudioContextClass();
	state.masterGain = state.audioCtx.createGain();
	state.masterGain.gain.value = 0.9;
	state.masterGain.connect(state.audioCtx.destination);
	state.audioCtx.suspend();
	
	// Configura o Howler para usar o mesmo AudioContext
	if (typeof Howler !== 'undefined') {
		Howler.ctx = state.audioCtx;
		Howler.masterGain = state.masterGain;
		Howler.autoUnlock = true;
		console.log('Howler configurado para usar AudioContext compartilhado');
	}
}

async function hydratePresetStore() {
	const stored = await stores.data.getItem(STORAGE_KEYS.PRESETS);
	if (Array.isArray(stored) && stored.length) {
		state.presets = stored;
		renderPresetList();
		return;
	}
	const response = await fetch('presets.json');
	const defaults = await response.json();
	state.presets = defaults;
	renderPresetList();
	await stores.data.setItem(STORAGE_KEYS.PRESETS, defaults);
}

async function reloadScientificPresets() {
	const response = await fetch('presets.json');
	const defaults = await response.json();
	state.presets = defaults;
	renderPresetList();
	await stores.data.setItem(STORAGE_KEYS.PRESETS, defaults);
	console.log('Presets científicos restaurados');
}

async function hydrateMusicStore() {
	const meta = await stores.data.getItem(STORAGE_KEYS.MUSIC_META);
	state.musicMeta = Array.isArray(meta) ? meta : [];
	// Nota: PlaylistManager.render() será chamado no initApp()
}

async function ensureStockTextures() {
	const added = [];
	for (const texture of STOCK_TEXTURES) {
		const metaExists = state.musicMeta.some((track) => track.id === texture.id);
		let blob = await stores.music.getItem(texture.id);
		if (!blob) {
			try {
				blob = await synthesizeTexture(texture);
				await stores.music.setItem(texture.id, blob);
			} catch (error) {
				console.warn('Falha ao gerar textura nativa', texture.name, error);
				continue;
			}
		}
		if (!metaExists) {
			const meta = {
				id: texture.id,
				name: `${texture.name} (Nativo)` ,
				size: blob?.size || 0,
				type: blob?.type || 'audio/wav',
				tag: texture.tag,
				lowEnergyPct: texture.lowEnergyPct,
				addedAt: Date.now(),
				origin: 'textura-nativa',
				description: texture.description
			};
			state.musicMeta.push(meta);
			added.push(meta);
		}
	}
	if (added.length) {
		await stores.data.setItem(STORAGE_KEYS.MUSIC_META, state.musicMeta);
		renderMusicList();
		updatePlaylistSelect();
	}
}

// =============================================================================
// ÁUDIOS PRÉ-CARREGADOS (Biblioteca Inicial)
// =============================================================================

/**
 * Carrega os áudios padrão da pasta audio/default para a biblioteca do usuário
 * Esses áudios são incluídos no repositório e carregados na primeira execução
 */
async function loadBundledAudio() {
	try {
		const response = await fetch('./audio/default/manifest.json');
		if (!response.ok) {
			console.log('Nenhum áudio pré-carregado encontrado');
			return;
		}
		
		const manifest = await response.json();
		if (!manifest.tracks || !manifest.tracks.length) {
			return;
		}
		
		const added = [];
		
		for (const track of manifest.tracks) {
			// Verifica se já foi adicionado (pelo ID único)
			const exists = state.musicMeta.some(m => m.bundledId === track.id);
			if (exists) continue;
			
			try {
				// Baixa o arquivo de áudio
				const audioResponse = await fetch(`./audio/default/${track.filename}`);
				if (!audioResponse.ok) {
					console.warn(`Falha ao carregar áudio: ${track.filename}`);
					continue;
				}
				
				const blob = await audioResponse.blob();
				const trackId = `bundled-${track.id}-${Date.now()}`;
				
				// Salva o blob no IndexedDB
				await stores.music.setItem(trackId, blob);
				
				// Cria metadados
				const meta = {
					id: trackId,
					bundledId: track.id,
					name: track.name,
					size: blob.size,
					type: blob.type || 'audio/mpeg',
					tag: track.tag || 'alpha',
					lowEnergyPct: track.lowEnergyPct || 50,
					addedAt: Date.now(),
					origin: 'bundled',
					category: track.category,
					therapeuticUse: track.therapeuticUse || [],
					description: track.description || '',
					source: track.source || '',
					sourceUrl: track.sourceUrl || '',
					archiveId: track.archiveId || null
				};
				
				state.musicMeta.push(meta);
				added.push(meta);
				
				console.log(`✓ Áudio pré-carregado: ${track.name}`);
			} catch (err) {
				console.warn(`Erro ao carregar ${track.filename}:`, err);
			}
		}
		
		if (added.length) {
			await stores.data.setItem(STORAGE_KEYS.MUSIC_META, state.musicMeta);
			renderMusicList();
			updatePlaylistSelect();
			console.log(`${added.length} áudio(s) pré-carregado(s) na biblioteca`);
		}
	} catch (error) {
		console.log('Erro ao carregar áudios pré-carregados:', error);
	}
}

// =============================================================================
// PLAYER YOUTUBE (Embed sem API)
// =============================================================================

let youtubePlayer = null;
let youtubePlayerReady = false;
let currentYoutubeId = null;
let youtubeLoopEnabled = true; // Loop habilitado por padrão para sessões

/**
 * Cria ou obtém o container do player YouTube (escondido)
 */
function getYoutubePlayerContainer() {
	let container = document.getElementById('youtube-player-container');
	if (!container) {
		container = document.createElement('div');
		container.id = 'youtube-player-container';
		container.innerHTML = `
			<div id="youtube-player-wrapper" style="position:fixed; bottom:-1000px; left:-1000px; width:1px; height:1px; overflow:hidden; pointer-events:none;">
				<div id="youtube-player"></div>
			</div>
		`;
		document.body.appendChild(container);
	}
	return container;
}

/**
 * Carrega a API do YouTube IFrame (uma vez)
 */
function loadYoutubeAPI() {
	return new Promise((resolve, reject) => {
		if (window.YT && window.YT.Player) {
			resolve();
			return;
		}
		
		// Callback global quando API carrega
		window.onYouTubeIframeAPIReady = () => {
			youtubePlayerReady = true;
			resolve();
		};
		
		// Carregar script da API
		const script = document.createElement('script');
		script.src = 'https://www.youtube.com/iframe_api';
		script.onerror = reject;
		document.head.appendChild(script);
	});
}

/**
 * Toca um vídeo do YouTube (apenas áudio - vídeo escondido)
 * @param {string} youtubeId - ID do vídeo do YouTube
 * @param {object} options - Opções: volume (0-100), loop (boolean)
 */
async function playYoutubeAudio(youtubeId, options = {}) {
	if (!navigator.onLine) {
		showToast('⚠️ Requer conexão com a internet', 'warning');
		return false;
	}
	
	// Configurar loop (padrão: true para sessões)
	youtubeLoopEnabled = options.loop !== undefined ? options.loop : true;
	
	try {
		getYoutubePlayerContainer();
		await loadYoutubeAPI();
		
		return new Promise((resolve) => {
			// Destruir player anterior se existir
			if (youtubePlayer) {
				try { youtubePlayer.destroy(); } catch(e) {}
			}
			
			currentYoutubeId = youtubeId;
			
			youtubePlayer = new YT.Player('youtube-player', {
				height: '1',
				width: '1',
				videoId: youtubeId,
				playerVars: {
					autoplay: 1,
					controls: 0,
					disablekb: 1,
					fs: 0,
					modestbranding: 1,
					rel: 0,
					showinfo: 0,
					loop: 1, // Habilita loop nativo (precisa de playlist)
					playlist: youtubeId, // Necessário para loop funcionar
					origin: window.location.origin
				},
				events: {
					onReady: (event) => {
						event.target.setVolume(options.volume || 70);
						event.target.playVideo();
						resolve(true);
					},
					onStateChange: (event) => {
						// Quando o vídeo termina
						if (event.data === YT.PlayerState.ENDED) {
							if (youtubeLoopEnabled && state.isSessionRunning) {
								// Reiniciar o vídeo para loop durante a sessão
								console.log('YouTube: reiniciando em loop');
								event.target.seekTo(0);
								event.target.playVideo();
							} else if (!state.isSessionRunning) {
								// Se não há sessão ativa, para o vídeo
								stopYoutubeAudio();
							}
						}
					},
					onError: (event) => {
						console.error('YouTube Error:', event.data);
						showToast('Erro ao carregar vídeo do YouTube', 'error');
						resolve(false);
					}
				}
			});
		});
	} catch (error) {
		console.error('Erro ao iniciar YouTube:', error);
		showToast('Erro ao carregar player do YouTube', 'error');
		return false;
	}
}

/**
 * Ativa/desativa controles baseado no modo YouTube
 * Quando YouTube está ativo, controles que não funcionam ficam desabilitados e minimizados
 */
function updateControlsForYoutubeMode(isYoutubeActive) {
	// Busca os cards de efeitos pelo toggle interno (compatível com todos navegadores)
	const audio8dToggle = document.getElementById('audio-8d-toggle');
	const enhancerToggle = document.getElementById('enhancer-toggle');
	const panSlider = document.getElementById('panSlider');
	const lowPassSlider = document.getElementById('lowPass');
	
	// Encontra o card pai de cada toggle
	const audio8dCard = audio8dToggle?.closest('.effect-card');
	const enhancerCard = enhancerToggle?.closest('.effect-card');
	const panContainer = panSlider?.closest('.mixer-item, .control-group');
	const lowPassContainer = lowPassSlider?.closest('.mixer-item, .control-group');
	
	// Lista de elementos para aplicar classes
	const elementsToDisable = [
		audio8dToggle,
		enhancerToggle,
		panSlider,
		lowPassSlider
	].filter(Boolean);
	
	const cardsToDisable = [
		audio8dCard,
		enhancerCard,
		panContainer,
		lowPassContainer
	].filter(Boolean);
	
	// Aplica/remove classe nos toggles e sliders
	elementsToDisable.forEach(element => {
		if (isYoutubeActive) {
			element.classList.add('disabled-for-youtube');
			element.setAttribute('aria-disabled', 'true');
			element.style.pointerEvents = 'none';
		} else {
			element.classList.remove('disabled-for-youtube');
			element.setAttribute('aria-disabled', 'false');
			element.style.pointerEvents = '';
		}
	});
	
	// Aplica/remove classe nos cards
	cardsToDisable.forEach(card => {
		card.classList.toggle('disabled-for-youtube', isYoutubeActive);
	});
	
	// Desabilita todos os inputs dentro dos controles de efeitos
	const effectInputs = document.querySelectorAll('#audio8dControls input, #audio8dControls button, #enhancerControls input, #enhancerControls select, #enhancerControls button');
	effectInputs.forEach(input => {
		input.disabled = isYoutubeActive;
	});
	
	// Mostra/remove aviso de controles limitados
	let warning = document.getElementById('youtube-controls-warning');
	
	if (isYoutubeActive) {
		if (!warning) {
			warning = document.createElement('div');
			warning.id = 'youtube-controls-warning';
			warning.className = 'youtube-controls-warning';
			warning.innerHTML = `
				<i class="fa-brands fa-youtube"></i>
				<span>Modo YouTube: controles 8D, Aprimoramento, Pan e Filtro estão desabilitados</span>
			`;
			// Insere antes dos cards de efeitos
			const effectsGrid = document.querySelector('.effects-grid');
			if (effectsGrid && effectsGrid.parentNode) {
				effectsGrid.parentNode.insertBefore(warning, effectsGrid);
			}
		}
	} else {
		if (warning) {
			warning.remove();
		}
	}
}

/**
 * Para o áudio do YouTube
 */
function stopYoutubeAudio() {
	if (youtubePlayer) {
		try {
			youtubePlayer.stopVideo();
			youtubePlayer.destroy();
		} catch(e) {}
		youtubePlayer = null;
	}
	currentYoutubeId = null;
	// Reativa controles ao parar YouTube
	updateControlsForYoutubeMode(false);
}

/**
 * Pausa/Resume o YouTube
 */
function toggleYoutubePause() {
	if (!youtubePlayer) return;
	
	const state = youtubePlayer.getPlayerState();
	if (state === YT.PlayerState.PLAYING) {
		youtubePlayer.pauseVideo();
	} else {
		youtubePlayer.playVideo();
	}
}

/**
 * Abre modal com vídeo do YouTube em tela cheia
 */
function openYoutubeFullscreen(youtubeId, title) {
	// Criar modal se não existir
	let modal = document.getElementById('youtube-fullscreen-modal');
	if (!modal) {
		modal = document.createElement('div');
		modal.id = 'youtube-fullscreen-modal';
		modal.className = 'modal youtube-modal hidden';
		modal.innerHTML = `
			<div class="modal-content youtube-modal-content">
				<div class="modal-header">
					<h3 id="youtube-modal-title">Vídeo</h3>
					<button class="modal-close" onclick="closeYoutubeFullscreen()">
						<i class="fa-solid fa-times"></i>
					</button>
				</div>
				<div class="youtube-video-wrapper">
					<iframe id="youtube-fullscreen-iframe" 
						src="" 
						frameborder="0" 
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" 
						allowfullscreen>
					</iframe>
				</div>
				<div class="youtube-modal-footer">
					<span class="youtube-notice">
						<i class="fa-solid fa-wifi"></i> Requer conexão com a internet
					</span>
					<a id="youtube-external-link" href="#" target="_blank" class="btn secondary">
						<i class="fa-brands fa-youtube"></i> Abrir no YouTube
					</a>
				</div>
			</div>
		`;
		document.body.appendChild(modal);
		
		// Fechar ao clicar fora do conteúdo
		modal.addEventListener('click', (e) => {
			if (e.target === modal) {
				closeYoutubeFullscreen();
			}
		});
	}
	
	// Atualizar conteúdo
	document.getElementById('youtube-modal-title').textContent = title || 'Vídeo';
	document.getElementById('youtube-fullscreen-iframe').src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`;
	document.getElementById('youtube-external-link').href = `https://www.youtube.com/watch?v=${youtubeId}`;
	
	// Parar áudio de fundo se estiver tocando
	if (currentYoutubeId === youtubeId) {
		stopYoutubeAudio();
	}
	
	modal.classList.remove('hidden');
	document.body.style.overflow = 'hidden';
}

/**
 * Fecha modal do YouTube
 */
function closeYoutubeFullscreen() {
	const modal = document.getElementById('youtube-fullscreen-modal');
	if (modal) {
		modal.classList.add('hidden');
		document.getElementById('youtube-fullscreen-iframe').src = '';
		document.body.style.overflow = '';
	}
}

// Expor funções globalmente para onclick
window.closeYoutubeFullscreen = closeYoutubeFullscreen;

// =============================================================================
// CONTROLES YOUTUBE - DESABILITAR FUNÇÕES NÃO SUPORTADAS
// =============================================================================

/**
 * Verifica se apenas YouTube está ativo na sessão (sem músicas locais)
 */
function isOnlyYoutubeActive() {
	return youtubePlayer && currentYoutubeId && 
		   (!state.activeHowls || state.activeHowls.length === 0);
}

/**
 * Atualiza estado dos controles baseado no tipo de áudio ativo
 * Desabilita controles que não funcionam com YouTube
 */
function updateControlsForYoutube(youtubeActive) {
	const controlsToDisable = [
		{ element: ui.audio8DToggle, label: 'Áudio 8D' },
		{ element: ui.enhancerToggle, label: 'Aprimoramento' },
		{ element: ui.panSlider, label: 'Pan Estéreo' }
	];
	
	controlsToDisable.forEach(({ element, label }) => {
		if (!element) return;
		
		const container = element.closest('.mixer-item, .control-group, .audio-effect-toggle');
		
		if (youtubeActive) {
			element.disabled = true;
			element.classList.add('disabled-youtube');
			if (container) {
				container.classList.add('disabled-youtube');
				container.title = `${label} não disponível com YouTube`;
			}
		} else {
			element.disabled = false;
			element.classList.remove('disabled-youtube');
			if (container) {
				container.classList.remove('disabled-youtube');
				container.title = '';
			}
		}
	});
	
	// Atualiza controles 8D e Enhancer
	if (ui.audio8dControls) {
		ui.audio8dControls.classList.toggle('disabled-youtube', youtubeActive);
	}
	if (ui.enhancerControls) {
		ui.enhancerControls.classList.toggle('disabled-youtube', youtubeActive);
	}
}

// =============================================================================
// SONS TERAPÊUTICOS PADRÕES
// =============================================================================

let defaultSoundsData = null;

/**
 * Carrega o catálogo de sons padrões
 */
async function loadDefaultSoundsCatalog() {
	if (defaultSoundsData) return defaultSoundsData;
	
	try {
		const response = await fetch('./data/default_sounds.json');
		if (!response.ok) throw new Error('Falha ao carregar catálogo');
		defaultSoundsData = await response.json();
		return defaultSoundsData;
	} catch (error) {
		console.error('Erro ao carregar sons padrões:', error);
		return null;
	}
}

/**
 * Baixa um som padrão do Internet Archive
 */
async function downloadDefaultSound(soundId) {
	const catalog = await loadDefaultSoundsCatalog();
	if (!catalog) return;
	
	const sound = catalog.sounds.find(s => s.id === soundId);
	if (!sound) {
		showToast('Som não encontrado', 'error');
		return;
	}
	
	// Verifica se já foi baixado
	if (state.musicMeta.some(m => m.defaultSoundId === soundId)) {
		showToast('Este som já está na sua biblioteca', 'info');
		return;
	}
	
	// Find download button in playlist
	const button = document.querySelector(`[data-sound-id="${soundId}"].btn-download`);
	if (button) {
		button.disabled = true;
		button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
	}
	
	try {
		showToast(`Baixando "${sound.name}"...`, 'info', 5000);
		
		// URL do Internet Archive (direta do JSON)
		const audioUrl = sound.archiveUrl;
		
		const response = await fetch(audioUrl);
		if (!response.ok) {
			throw new Error(`Falha no download: ${response.status}`);
		}
		
		const arrayBuffer = await response.arrayBuffer();
		const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
		
		// Criar metadados
		const trackMeta = {
			id: `default-${soundId}-${Date.now()}`,
			name: sound.name,
			size: blob.size,
			type: 'audio/mpeg',
			tag: sound.tag,
			lowEnergyPct: sound.lowEnergyPct,
			addedAt: Date.now(),
			origin: 'default-sounds',
			defaultSoundId: soundId,
			archiveUrl: sound.archiveUrl,
			category: sound.category,
			therapeuticUse: sound.therapeuticUse,
			evidence: sound.evidence,
			description: sound.description
		};
		
		// Salvar no IndexedDB
		await stores.music.setItem(trackMeta.id, blob);
		state.musicMeta.push(trackMeta);
		await stores.data.setItem(STORAGE_KEYS.MUSIC_META, state.musicMeta);
		
		// Re-render playlist to show updated state
		await PlaylistManager.render();
		
		showToast(`"${sound.name}" baixado com sucesso!`, 'success');
		
	} catch (error) {
		console.error('Erro ao baixar som padrão:', error);
		showToast(`Erro ao baixar: ${error.message}`, 'error');
		
		// Re-render to restore button state
		await PlaylistManager.render();
	}
}

/**
 * Mostra detalhes científicos de um som
 */
async function showSoundEvidence(soundId) {
	const catalog = await loadDefaultSoundsCatalog();
	if (!catalog) return;
	
	const sound = catalog.sounds.find(s => s.id === soundId);
	if (!sound) return;
	
	const category = catalog.categories[sound.category];
	
	const modal = document.createElement('div');
	modal.className = 'evidence-modal-overlay';
	modal.innerHTML = `
		<div class="evidence-modal">
			<div class="evidence-modal-header">
				<h3><i class="${category.icon}"></i> ${sound.name}</h3>
				<button class="btn-close-evidence" aria-label="Fechar">
					<i class="fa-solid fa-times"></i>
				</button>
			</div>
			<div class="evidence-modal-body">
				<p class="sound-full-description">${sound.description}</p>
				
				<div class="evidence-section">
					<h4><i class="fa-solid fa-flask"></i> Base Científica</h4>
					<div class="evidence-card">
						<p class="evidence-study"><strong>Estudo:</strong> ${sound.evidence.study}</p>
						<p class="evidence-finding"><strong>Resultado:</strong> ${sound.evidence.finding}</p>
						<p class="evidence-mechanism"><strong>Mecanismo:</strong> ${sound.evidence.mechanism}</p>
					</div>
				</div>
				
				<div class="evidence-section">
					<h4><i class="fa-solid fa-stethoscope"></i> Indicações Terapêuticas</h4>
					<div class="therapeutic-uses">
						${sound.therapeuticUse.map(u => `<span class="use-badge">${u}</span>`).join('')}
					</div>
				</div>
				
				<div class="evidence-section">
					<h4><i class="fa-solid fa-wave-square"></i> Características Sonoras</h4>
					<ul class="sound-characteristics">
						<li><strong>Faixa de ondas cerebrais:</strong> ${sound.tag.toUpperCase()}</li>
						<li><strong>Energia em graves:</strong> ${sound.lowEnergyPct}%</li>
					</ul>
				</div>
			</div>
			<div class="evidence-modal-footer">
				<button class="btn-download-from-evidence primary" data-sound-id="${soundId}">
					<i class="fa-solid fa-download"></i>
					Adicionar à Biblioteca
				</button>
			</div>
		</div>
	`;
	
	document.body.appendChild(modal);
	
	// Event listeners
	modal.querySelector('.btn-close-evidence').addEventListener('click', () => modal.remove());
	modal.querySelector('.btn-download-from-evidence').addEventListener('click', async (e) => {
		await downloadDefaultSound(soundId);
		modal.remove();
	});
	modal.addEventListener('click', (e) => {
		if (e.target === modal) modal.remove();
	});
}

async function hydrateHistory() {
	const saved = await stores.history.getItem(STORAGE_KEYS.HISTORY);
	state.history = Array.isArray(saved) ? saved : [];
}

// ============================================================================
// MENU DRAWER DE PRESETS
// ============================================================================

// ============================================================================
// MENU DRAWER PRINCIPAL
// ============================================================================

let scientificDataLoaded = false;

function openMainDrawer() {
	ui.mainDrawer.classList.add('open');
	ui.mainDrawerOverlay.classList.add('active');
	ui.menuToggle.setAttribute('aria-expanded', 'true');
	document.body.style.overflow = 'hidden';
}

function closeMainDrawer() {
	ui.mainDrawer.classList.remove('open');
	ui.mainDrawerOverlay.classList.remove('active');
	ui.menuToggle.setAttribute('aria-expanded', 'false');
	document.body.style.overflow = '';
}

function switchDrawerTab(tabName) {
	// Atualiza abas ativas
	ui.drawerTabs.forEach(tab => {
		tab.classList.toggle('active', tab.dataset.tab === tabName);
	});
	
	// Mostra/esconde conteúdos
	ui.drawerContents.forEach(content => {
		const isActive = content.dataset.tabContent === tabName;
		content.classList.toggle('hidden', !isActive);
	});
	
	// Carrega dados científicos na primeira vez que acessar
	if ((tabName === 'scientific' || tabName === 'references') && !scientificDataLoaded) {
		loadScientificContent();
	}
}

// ============================================================================
// SCIENTIFIC CONTENT
// ============================================================================

async function loadScientificContent() {
	if (scientificDataLoaded) return;
	
	try {
		// Carrega fundamentos científicos
		const foundationsRes = await fetch('./data/scientific_foundations.json');
		const foundationsData = await foundationsRes.json();
		renderScientificFoundations(foundationsData.foundations);
		
		// Carrega bibliografia
		const bibliographyRes = await fetch('./data/bibliography.json');
		const bibliographyData = await bibliographyRes.json();
		renderScientificReferences(bibliographyData.categories);
		
		scientificDataLoaded = true;
	} catch (error) {
		console.error('Erro ao carregar conteúdo científico:', error);
		ui.scientificFoundations.innerHTML = '<p class="error">Erro ao carregar dados</p>';
		ui.scientificReferences.innerHTML = '<p class="error">Erro ao carregar dados</p>';
	}
}

function renderScientificFoundations(foundations) {
	if (!foundations) {
		ui.scientificFoundations.innerHTML = '<p class="error">Dados não encontrados</p>';
		return;
	}
	
	const html = Object.entries(foundations).map(([key, foundation]) => `
		<div class="sci-foundation-card" data-foundation="${key}">
			<div class="sci-foundation-header" onclick="this.parentElement.classList.toggle('expanded')">
				<h4><i class="${foundation.icon || 'fa-solid fa-flask'}"></i> ${foundation.title}</h4>
				<i class="fa-solid fa-chevron-down toggle-icon"></i>
			</div>
			<div class="sci-foundation-body">
				<p class="sci-summary">${foundation.summary}</p>
				${foundation.pioneer ? `
					<p class="sci-pioneer"><i class="fa-solid fa-user-graduate"></i> 
						<strong>Pioneiro:</strong> ${foundation.pioneer.name} (${foundation.pioneer.period}), ${foundation.pioneer.country}
					</p>
				` : ''}
				${foundation.mechanisms && foundation.mechanisms.length > 0 ? `
					<div class="sci-mechanisms">
						<h5><i class="fa-solid fa-cogs"></i> Mecanismos</h5>
						<ul>
							${foundation.mechanisms.map(m => `<li><strong>${m.name}:</strong> ${m.description}</li>`).join('')}
						</ul>
					</div>
				` : ''}
				${foundation.keyStudies && foundation.keyStudies.length > 0 ? `
					<div class="evidence-tag">
						<i class="fa-solid fa-check-circle"></i> ${foundation.keyStudies.length} estudos-chave documentados
					</div>
				` : ''}
			</div>
		</div>
	`).join('');
	
	ui.scientificFoundations.innerHTML = html || '<p class="empty">Nenhum fundamento encontrado</p>';
}

function getFoundationIcon(key) {
	const icons = {
		vibroacoustic: 'wave-square',
		binaural: 'headphones',
		neurological: 'brain'
	};
	return icons[key] || 'flask';
}

function renderScientificReferences(categories) {
	if (!categories) {
		ui.scientificReferences.innerHTML = '<p class="error">Dados não encontrados</p>';
		return;
	}
	
	let html = '';
	
	Object.entries(categories).forEach(([categoryKey, categoryData]) => {
		const categoryName = categoryData.name || getCategoryTitle(categoryKey);
		const categoryIcon = categoryData.icon || 'fa-solid fa-book';
		const refs = categoryData.references || [];
		
		if (refs.length === 0) return;
		
		html += `<div class="reference-category">
			<h4 class="reference-category-title">
				<i class="${categoryIcon}"></i> ${categoryName}
				<span class="ref-count">(${refs.length})</span>
			</h4>
		`;
		
		refs.forEach(ref => {
			html += `
				<div class="reference-item ${ref.highlight ? 'highlight' : ''}">
					<div class="ref-authors">${ref.authors} (${ref.year})</div>
					<div class="ref-title">${ref.title}</div>
					${ref.journal ? `<div class="ref-journal">${ref.journal}${ref.volume ? `, ${ref.volume}` : ''}${ref.pages ? `, pp. ${ref.pages}` : ''}</div>` : ''}
					${ref.publisher ? `<div class="ref-publisher">${ref.publisher}</div>` : ''}
					${ref.summary ? `<div class="ref-summary"><i class="fa-solid fa-info-circle"></i> ${ref.summary}</div>` : ''}
					${ref.doi ? `<a href="https://doi.org/${ref.doi}" target="_blank" rel="noopener" class="ref-doi"><i class="fa-solid fa-external-link"></i> DOI: ${ref.doi}</a>` : ''}
				</div>
			`;
		});
		
		html += '</div>';
	});
	
	ui.scientificReferences.innerHTML = html || '<p class="empty">Nenhuma referência encontrada</p>';
}

function getCategoryTitle(category) {
	const titles = {
		vibroacoustic: '🔊 Terapia Vibroacústica',
		binaural: '🎧 Batimentos Binaurais',
		clinical: '🏥 Estudos Clínicos',
		music_medicine: '🎵 Musicoterapia Médica'
	};
	return titles[category] || category;
}

function renderPresetList() {
	ui.presetList.innerHTML = '';
	state.presets.forEach((preset) => {
		const band = describeDiffBand(preset.diffHz);
		const bandClass = getBandClass(preset.diffHz);
		const li = document.createElement('li');
		li.dataset.id = preset.id;
		li.innerHTML = `
			<div class="preset-row">
				<div class="preset-info">
					<strong>${preset.name}</strong>
					<span class="band-chip ${bandClass}">${band.label}</span>
				</div>
				<small><i class="fa-solid fa-wave-square"></i> ${preset.baseHz}Hz base • ${preset.diffHz}Hz diff • ${preset.duration}min</small>
			</div>
			<div class="preset-actions">
				<button class="secondary" data-action="load"><i class="fa-solid fa-download"></i> Carregar</button>
				<button class="primary" data-action="start"><i class="fa-solid fa-play"></i> Iniciar</button>
			</div>
		`;
		ui.presetList.append(li);
	});
}

function handlePresetActions(event) {
	const button = event.target.closest('button');
	if (!button) return;
	const li = button.closest('li');
	const preset = state.presets.find((p) => p.id === li.dataset.id);
	if (!preset) return;
	if (button.dataset.action === 'load') {
		loadPresetToForm(preset);
		closeMainDrawer();
	}
	if (button.dataset.action === 'start') {
		closeMainDrawer();
		startSession(preset);
	}
}

function loadPresetToForm(preset) {
	ui.form.presetName.value = preset.name;
	ui.baseFreq.value = preset.baseHz;
	ui.diffFreq.value = preset.diffHz;
	ui.duration.value = preset.duration;
	ui.binauralVolume.value = preset.binauralVolume;
	ui.lowPass.value = preset.lowPass;
	ui.form.dataset.editingId = preset.id;
	updateRangeOutputs();
	selectPlaylistOptions(preset.playlist || []);
	updateSuggestions();
}

function selectPlaylistOptions(ids) {
	// Update selected playlist state
	state.selectedPlaylist = [...ids];
	// Re-render to reflect changes
	PlaylistManager.render();
}

async function handlePresetSave(event) {
	event.preventDefault();
	const preset = collectPresetFromForm();
	const existingIndex = state.presets.findIndex((p) => p.id === preset.id);
	if (existingIndex >= 0) {
		state.presets[existingIndex] = preset;
	} else {
		state.presets.push(preset);
	}
	renderPresetList();
	await stores.data.setItem(STORAGE_KEYS.PRESETS, state.presets);
	console.log('Preset salvo', preset.name);
	delete ui.form.dataset.editingId;
}

function collectPresetFromForm() {
	// Get selected tracks from state
	const playlist = state.selectedPlaylist || [];
	return {
		id: ui.form.dataset.editingId || uuid(),
		name: ui.form.presetName.value.trim() || 'Preset sem nome',
		baseHz: Number(ui.baseFreq.value),
		diffHz: Number(ui.diffFreq.value),
		duration: Number(ui.duration.value),
		binauralVolume: Number(ui.binauralVolume.value),
		lowPass: Number(ui.lowPass.value),
		playlist,
		createdAt: Date.now()
	};
}

async function startSessionFromForm(savePreset = true) {
	const preset = collectPresetFromForm();
	if (savePreset) {
		const existingIndex = state.presets.findIndex((p) => p.id === preset.id);
		if (existingIndex >= 0) {
			state.presets[existingIndex] = preset;
		} else {
			state.presets.push(preset);
		}
		renderPresetList();
		await stores.data.setItem(STORAGE_KEYS.PRESETS, state.presets);
	}
	delete ui.form.dataset.editingId;
	await startSession(preset);
}

async function handlePlay() {
	if (state.isSessionRunning) {
		resumeSession();
		return;
	}
	await startSessionFromForm(false);
}

function handlePause() {
	if (!state.isSessionRunning) return;
	pauseSession(false);
}

function handleMixChange(event) {
	const value = Number(event.target.value);
	state.mixRatio = value / 100;
	updateMixOutput(value);
	applyMix();
}

function handlePanChange(event) {
	const value = Number(event.target.value);
	state.currentPan = value;
	updatePanOutput(value);
	
	// Aplica pan em todas as faixas ativas (apenas Howler)
	if (state.activeHowls && state.activeHowls.length > 0) {
		state.activeHowls.forEach(howl => {
			if (howl && typeof howl.stereo === 'function') {
				howl.stereo(value);
			}
		});
	} else if (state.currentHowl && typeof state.currentHowl.stereo === 'function') {
		state.currentHowl.stereo(value);
	}
	
	// Aviso se tentar usar pan com YouTube
	if (youtubePlayer && currentYoutubeId && value !== 0) {
		showToast('⚠️ Pan estéreo não funciona com YouTube', 'warning');
	}
}

function updateMixOutput(value) {
	ui.mixValue.textContent = `Binaural ${value}% / Música ${100 - value}%`;
}

function updatePanOutput(value) {
	ui.panValue.textContent = value === 0 ? 'Centralizado' : value > 0 ? `Direita +${value}` : `Esquerda ${value}`;
}

function warnHighVolume() {
	const value = Number(ui.binauralVolume.value);
	let label = '';
	let icon = '';
	
	if (value >= 80) {
		label = `${value}% ⚠️ Limite máximo terapêutico`;
		icon = 'warning';
	} else if (value >= 70) {
		label = `${value}% (Intenso)`;
		icon = 'caution';
	} else if (value >= 50) {
		label = `${value}% (Terapêutico ideal)`;
		icon = 'optimal';
	} else {
		label = `${value}% (Suave)`;
		icon = 'low';
	}
	
	ui.binauralVolumeValue.textContent = label;
}

function updateRangeOutputs() {
	// Frequência base com indicação terapêutica
	const baseHz = Number(ui.baseFreq.value);
	let baseLabel = `${baseHz} Hz`;
	if (baseHz === 40) baseLabel += ' • Espasmos';
	else if (baseHz >= 50 && baseHz <= 54) baseLabel += ' • Lombar';
	else if (baseHz >= 60 && baseHz <= 70) baseLabel += ' • Pulmonar';
	else if (baseHz >= 80) baseLabel += ' • Circulação';
	ui.baseFreqValue.textContent = baseLabel;
	
	// Diferença binaural
	const diff = Number(ui.diffFreq.value);
	const diffDescriptor = describeDiffBand(diff);
	ui.diffFreqValue.textContent = `${diff} Hz • ${diffDescriptor.label}`;
	
	// Duração com indicação
	const duration = Number(ui.duration.value);
	let durationLabel = `${duration} min`;
	if (duration < 15) durationLabel += ' (curta)';
	else if (duration >= 15 && duration <= 30) durationLabel += ' (ideal)';
	else if (duration > 30) durationLabel += ' (profunda)';
	ui.durationValue.textContent = durationLabel;
	
	// Low-pass
	ui.lowPassValue.textContent = `${ui.lowPass.value} Hz`;
	
	warnHighVolume();
}

function describeDiffBand(value) {
	return DIFF_BANDS.find((band) => value >= band.range[0] && value <= band.range[1]) || DIFF_BANDS[2];
}

/**
 * Manipula clique nos botões de protocolos terapêuticos rápidos
 * Aplica configuração completa do protocolo (base, diff, duração, volume, lowpass)
 * @param {Event} e - Evento de clique
 */
function handleProtocolQuickSelect(e) {
	const btn = e.target.closest('.protocol-chip');
	if (!btn) return;
	
	const protocolKey = btn.dataset.protocol;
	if (!protocolKey || !THERAPEUTIC_PROTOCOLS[protocolKey]) return;
	
	const protocol = THERAPEUTIC_PROTOCOLS[protocolKey];
	
	// Aplica todas as configurações do protocolo
	ui.baseFreq.value = protocol.baseHz;
	ui.diffFreq.value = protocol.diffHz;
	ui.duration.value = protocol.duration;
	ui.binauralVolume.value = protocol.binauralVolume;
	ui.lowPass.value = protocol.lowPass;
	
	// Atualiza nome do preset
	ui.form.presetName.value = `Protocolo: ${protocol.name}`;
	
	// Atualiza os outputs e sugestões
	updateRangeOutputs();
	updateSuggestions();
	
	// Atualiza frequências em tempo real se sessão estiver ativa
	updateBinauralFrequenciesRealtime();
	updateBinauralVolumeRealtime();
	updateLowPassRealtime();
	
	// Remove classe ativa de todos os botões
	ui.protocolQuickSelector.querySelectorAll('.protocol-chip').forEach(b => b.classList.remove('active'));
	// Adiciona classe ativa ao botão clicado
	btn.classList.add('active');
	
	// Feedback visual
	showToast(`Protocolo "${protocol.name}" aplicado`, 'success');
}

function updateSuggestions() {
	const diff = Number(ui.diffFreq.value);
	const band = describeDiffBand(diff);
	const matches = state.musicMeta.filter((track) => track.tag === band.tag);
	if (!state.musicMeta.length) {
		ui.musicSuggestions.textContent = 'Faça upload de músicas para liberar recomendações.';
		return;
	}
	if (!matches.length) {
		ui.musicSuggestions.textContent = `Nenhuma música com tag ${band.tag} ainda. Uploads com graves >40% recebem automaticamente o selo relax.`;
		return;
	}
	const names = matches.slice(0, 3).map((track) => track.name).join(', ');
	ui.musicSuggestions.textContent = `Sugerido para ${band.label}: ${names}`;
}

async function startSession(preset) {
	await resumeAudioContext();
	buildBinauralChain(preset);
	scheduleMixer(preset);
	await setupPlaylist(preset.playlist);
	
	// Configurar total de segundos para o progresso
	totalSessionSeconds = preset.duration * 60;
	
	startTimer(preset.duration);
	state.isSessionRunning = true;
	logSession(preset);
	setupMediaSession(preset);
	
	// Atualizar novo UI terapêutico
	updateSessionUI(true, false);
	updateFrequencyDisplay(preset.diffHz);
	startBreathingGuide(preset.diffHz);
	
	// Iniciar monitor de áudio automaticamente
	openAudioMonitor();
	
	console.log('Sessão iniciada', preset.name);
}

async function resumeAudioContext() {
	if (state.audioCtx.state === 'suspended') {
		await state.audioCtx.resume();
	}
}

function scheduleMixer(preset) {
	state.mixRatio = Math.min(1, Math.max(0, preset.binauralVolume / 100));
	ui.mixSlider.value = Math.round(state.mixRatio * 100);
	updateMixOutput(ui.mixSlider.value);
	applyMix();
}

function applyMix() {
	if (state.binauralChain?.binauralGain) {
		state.binauralChain.binauralGain.gain.setTargetAtTime(state.mixRatio, state.audioCtx.currentTime, 0.05);
	}
	const musicRatio = 1 - state.mixRatio;
	
	// Aplica volume em todas as faixas ativas (Howler)
	if (state.activeHowls && state.activeHowls.length > 0) {
		const trackCount = state.activeHowls.length;
		const volumePerTrack = musicRatio / Math.sqrt(trackCount);
		state.activeHowls.forEach(howl => {
			if (howl && typeof howl.volume === 'function') {
				howl.volume(volumePerTrack);
			}
		});
	} else if (state.currentHowl && typeof state.currentHowl.volume === 'function') {
		state.currentHowl.volume(musicRatio);
	}
	
	// Aplica volume no YouTube se estiver ativo
	if (youtubePlayer && currentYoutubeId) {
		try {
			// YouTube usa volume de 0-100
			youtubePlayer.setVolume(Math.round(musicRatio * 100));
		} catch (e) {
			// Player pode não estar pronto ainda
		}
	}
}

function buildBinauralChain(preset) {
	console.log('[buildBinauralChain] Iniciando com preset:', preset);
	console.log('[buildBinauralChain] AudioContext state:', state.audioCtx.state);
	
	stopBinaural();
	const ctx = state.audioCtx;
	const leftOsc = ctx.createOscillator();
	const rightOsc = ctx.createOscillator();
	leftOsc.type = rightOsc.type = 'sine';
	leftOsc.frequency.value = preset.baseHz;
	rightOsc.frequency.value = preset.baseHz + preset.diffHz;
	const leftGain = ctx.createGain();
	const rightGain = ctx.createGain();
	leftGain.gain.value = rightGain.gain.value = 0.5;
	const merger = ctx.createChannelMerger(2);
	const lowPass = ctx.createBiquadFilter();
	lowPass.type = 'lowpass';
	// LowPass usa valor multiplicado para não cortar as frequências binaurais
	// O slider vai de 30-120, multiplicamos por 10 para ter 300-1200Hz de corte
	const lowPassFrequency = (preset.lowPass || 80) * 10;
	lowPass.frequency.setValueAtTime(lowPassFrequency, ctx.currentTime);
	const analyser = ctx.createAnalyser();
	analyser.fftSize = 512;
	const binauralGain = ctx.createGain();
	// Usa diretamente o valor do preset, não o state.mixRatio que pode estar desatualizado
	const binauralVolume = (preset.binauralVolume || 50) / 100;
	binauralGain.gain.value = binauralVolume;
	
	console.log('[buildBinauralChain] Frequências: L=' + preset.baseHz + 'Hz, R=' + (preset.baseHz + preset.diffHz) + 'Hz, diff=' + preset.diffHz + 'Hz');
	console.log('[buildBinauralChain] binauralVolume:', binauralVolume);
	console.log('[buildBinauralChain] lowPass:', lowPassFrequency + 'Hz (slider: ' + preset.lowPass + ')');
	
	leftOsc.connect(leftGain).connect(merger, 0, 0);
	rightOsc.connect(rightGain).connect(merger, 0, 1);
	merger.connect(lowPass);
	lowPass.connect(analyser);
	analyser.connect(binauralGain);
	binauralGain.connect(state.masterGain);
	leftOsc.start();
	rightOsc.start();
	
	console.log('[buildBinauralChain] Osciladores iniciados e conectados ao masterGain');
	console.log('[buildBinauralChain] Ganhos - leftGain:', leftGain.gain.value, 'rightGain:', rightGain.gain.value, 'binauralGain:', binauralGain.gain.value, 'masterGain:', state.masterGain.gain.value);
	console.log('[buildBinauralChain] Enhancer ativo:', state.enhancer?.enabled, 'conectado:', state.enhancer?.connected);
	
	// Guarda referências para o monitor de áudio poder conectar
	state.binauralChain = { 
		leftOsc, 
		rightOsc, 
		leftGain,
		rightGain,
		merger,
		lowPass, 
		analyser, 
		binauralGain,
		// Guarda as frequências para o monitor exibir
		freqLeft: preset.baseHz,
		freqRight: preset.baseHz + preset.diffHz,
		freqDiff: preset.diffHz
	};
	
	// Conecta os analysers do monitor aos canais L/R se estiverem configurados
	connectMonitorToBinaural();
}

/**
 * Atualiza as frequências dos osciladores binaurais em tempo real
 * Chamada quando os sliders baseFreq ou diffFreq são alterados
 */
function updateBinauralFrequenciesRealtime() {
	// Se não há sessão ativa, não há o que atualizar nos osciladores
	// Mas o monitor ainda mostrará os valores dos sliders
	if (!state.binauralChain?.leftOsc || !state.binauralChain?.rightOsc) {
		return;
	}
	
	const baseHz = parseFloat(ui.baseFreq?.value) || 200;
	const diffHz = parseFloat(ui.diffFreq?.value) || 10;
	const ctx = state.audioCtx;
	
	// Atualiza frequências com transição suave para evitar cliques
	state.binauralChain.leftOsc.frequency.setTargetAtTime(baseHz, ctx.currentTime, 0.05);
	state.binauralChain.rightOsc.frequency.setTargetAtTime(baseHz + diffHz, ctx.currentTime, 0.05);
	
	// Atualiza os valores guardados na cadeia
	state.binauralChain.freqLeft = baseHz;
	state.binauralChain.freqRight = baseHz + diffHz;
	state.binauralChain.freqDiff = diffHz;
	
	console.log(`Frequências atualizadas: L=${baseHz}Hz, R=${baseHz + diffHz}Hz, Δ=${diffHz}Hz`);
}

/**
 * Atualiza o filtro low-pass em tempo real
 */
function updateLowPassRealtime() {
	if (!state.binauralChain?.lowPass || !state.audioCtx) return;
	
	// O valor do slider vai de 30-120, multiplicamos por 10 para ter 300-1200Hz de corte
	// Isso evita cortar as frequências binaurais (que vão de ~40-100Hz)
	const sliderValue = parseFloat(ui.lowPass?.value) || 80;
	const frequency = sliderValue * 10;
	
	state.binauralChain.lowPass.frequency.setTargetAtTime(frequency, state.audioCtx.currentTime, 0.05);
}

/**
 * Atualiza o volume do binaural em tempo real
 */
function updateBinauralVolumeRealtime() {
	if (!state.binauralChain?.leftGain || !state.binauralChain?.rightGain || !state.audioCtx) return;
	
	const volumePercent = parseFloat(ui.binauralVolume?.value) || 50;
	const gain = (volumePercent / 100) * 0.5; // Max 0.5 para evitar distorção
	
	state.binauralChain.leftGain.gain.setTargetAtTime(gain, state.audioCtx.currentTime, 0.05);
	state.binauralChain.rightGain.gain.setTargetAtTime(gain, state.audioCtx.currentTime, 0.05);
}

function stopBinaural() {
	if (!state.binauralChain) return;
	['leftOsc', 'rightOsc'].forEach((osc) => {
		try {
			state.binauralChain[osc].stop();
		} catch (err) {
			console.warn('Oscilador já parado', err.message);
		}
	});
	Object.values(state.binauralChain).forEach((node) => {
		if (node?.disconnect) node.disconnect();
	});
	state.binauralChain = null;
}

async function setupPlaylist(playlistIds = []) {
	if (!playlistIds.length && state.musicMeta.length) {
		const diff = Number(ui.diffFreq.value);
		const band = describeDiffBand(diff);
		const fallback = state.musicMeta.filter((track) => track.tag === band.tag);
		playlistIds = fallback.length ? [fallback[0].id] : [state.musicMeta[0].id];
	}
	state.playlistQueue = playlistIds;
	state.currentTrackIndex = 0;
	await playAllSelectedTracks();
}

/**
 * Toca todas as músicas selecionadas simultaneamente
 */
async function playAllSelectedTracks() {
	stopCurrentTrack();
	stopYoutubeAudio(); // Para qualquer vídeo YouTube anterior
	if (!state.playlistQueue.length) return;
	
	// Limpa o array de howls ativos
	state.activeHowls = [];
	
	// Para sons gerados pelo TherapeuticSoundGenerator
	therapeuticGenerator.stopAll();
	
	// Volume dividido entre as faixas para evitar clipping
	const trackCount = state.playlistQueue.length;
	const volumePerTrack = (1 - state.mixRatio) / Math.sqrt(trackCount);
	
	// Carrega e toca cada faixa selecionada
	for (const trackId of state.playlistQueue) {
		// Verifica se é um vídeo do YouTube (padrão ou do usuário)
		if (trackId.startsWith('yt-') || trackId.startsWith('user-youtube-')) {
			let youtubeId, soundName;
			
			if (trackId.startsWith('yt-')) {
				// Vídeo do catálogo padrão
				const soundId = trackId.replace('yt-', '');
				const catalog = state.defaultSoundsCatalog;
				const sound = catalog?.sounds?.find(s => s.id === soundId);
				
				if (!sound || !sound.youtubeId) {
					console.warn('YouTube ID ausente para:', soundId);
					continue;
				}
				youtubeId = sound.youtubeId;
				soundName = sound.name;
			} else {
				// Vídeo adicionado pelo usuário
				const userVideos = await stores.data.getItem('userYoutubeVideos') || [];
				const userVideo = userVideos.find(v => v.id === trackId);
				
				if (!userVideo || !userVideo.youtube) {
					console.warn('Vídeo do usuário não encontrado:', trackId);
					continue;
				}
				youtubeId = userVideo.youtube;
				soundName = userVideo.name;
			}
			
			// Reproduz via streaming do YouTube
			try {
				const success = await playYoutubeAudio(youtubeId, {
					volume: Math.round(volumePerTrack * 100),
					loop: true
				});
				if (success) {
					console.log('Streaming YouTube:', soundName, '- ID:', youtubeId);
					// Salva nome da faixa em reprodução
					state.currentPlayingName = soundName;
					// Ativa modo YouTube (desabilita controles não funcionais)
					updateControlsForYoutubeMode(true);
				}
			} catch (err) {
				console.error('Erro ao reproduzir YouTube:', err);
				showToast(`Erro ao reproduzir: ${soundName}`, 'error');
			}
		}
		// Verifica se é um som padrão (gerado) ou música local
		else if (trackId.startsWith('default-')) {
			// Som padrão - reproduz via Web Audio API (geração em tempo real)
			const soundId = trackId.replace('default-', '');
			const catalog = state.defaultSoundsCatalog;
			const sound = catalog?.sounds?.find(s => s.id === soundId);
			
			if (!sound || !sound.generatorType) {
				console.warn('Tipo de gerador ausente para som padrão:', soundId);
				continue;
			}
			
			try {
				// Usa o gerador de sons terapêuticos
				await therapeuticGenerator.play(sound.generatorType, {
					volume: volumePerTrack
				});
				console.log('Gerando som terapêutico:', sound.name, '- Tipo:', sound.generatorType);
			} catch (err) {
				console.error('Erro ao gerar som terapêutico:', err);
				showToast(`Erro ao gerar som: ${sound.name}`, 'error');
			}
		} else {
			// Música local - busca do IndexedDB
			const blob = await stores.music.getItem(trackId);
			if (!blob) {
				console.warn('Blob ausente para track', trackId);
				continue;
			}
			
			// Busca metadados da faixa para exibir o nome
			const trackMeta = state.musicMeta.find(t => t.id === trackId);
			const trackName = trackMeta?.name || 'Música local';
			
			const objectUrl = URL.createObjectURL(blob);
			state.musicObjectUrls.push(objectUrl);
			
			// Detecta o formato do áudio baseado no MIME type
			const mimeType = blob.type || 'audio/mpeg';
			const format = getAudioFormat(mimeType);
			
			const howl = new Howl({
				src: [objectUrl],
				format: [format],
				html5: false, // IMPORTANTE: Usar Web Audio API para suportar efeitos 8D, pan e filtros
				loop: true,
				volume: volumePerTrack,
				stereo: state.currentPan, // Aplica pan inicial
				onplay: () => {
					console.log('Howler reproduzindo', trackId, 'formato:', format, 'volume:', volumePerTrack.toFixed(2));
					// Salva nome da faixa em reprodução
					state.currentPlayingName = trackName;
					if (state.audio8D.enabled) {
						console.log('Audio 8D: Ativo na sessão');
						// Re-inicia a animação 8D para incluir esta faixa
						startAudio8DAnimation();
					}
				},
				onloaderror: (id, err) => {
					console.error('Erro ao carregar áudio:', err, 'formato:', format);
					showToast(`Erro ao carregar áudio.`, 'error');
				},
				onplayerror: (id, err) => {
					console.error('Erro ao reproduzir áudio:', err);
					howl.once('unlock', () => {
						howl.play();
					});
				}
			});
			
			howl._trackId = trackId; // Referência para identificar a faixa
			state.activeHowls.push(howl);
			howl.play();
		}
	}
	
	// Mantém compatibilidade com currentHowl (primeira faixa)
	state.currentHowl = state.activeHowls[0] || null;
	
	const generatedCount = therapeuticGenerator.getActiveSoundCount();
	const howlCount = state.activeHowls.length;
	console.log(`Tocando ${howlCount} faixa(s) local(is) + ${generatedCount} som(ns) gerado(s)`);
}

async function playCurrentTrack() {
	// Redireciona para a nova função que toca múltiplas faixas
	await playAllSelectedTracks();
}

/**
 * Detecta o formato de áudio a partir do MIME type
 */
function getAudioFormat(mimeType) {
	const formatMap = {
		'audio/mpeg': 'mp3',
		'audio/mp3': 'mp3',
		'audio/mp4': 'm4a',
		'audio/m4a': 'm4a',
		'audio/aac': 'aac',
		'audio/ogg': 'ogg',
		'audio/wav': 'wav',
		'audio/wave': 'wav',
		'audio/webm': 'webm',
		'audio/flac': 'flac',
		'audio/x-wav': 'wav',
		'audio/x-m4a': 'm4a'
	};
	return formatMap[mimeType] || 'mp3';
}

function stopCurrentTrack() {
	// Para sons gerados pelo TherapeuticSoundGenerator
	therapeuticGenerator.stopAll();
	
	// Para todas as faixas ativas
	if (state.activeHowls && state.activeHowls.length > 0) {
		state.activeHowls.forEach(howl => {
			try {
				howl.stop();
				howl.unload();
			} catch (err) {
				console.warn('Erro ao parar howl:', err.message);
			}
		});
		state.activeHowls = [];
	}
	
	// Mantém compatibilidade com currentHowl legado
	if (state.currentHowl) {
		state.currentHowl.stop();
		state.currentHowl.unload();
		state.currentHowl = null;
	}
	
	state.musicObjectUrls.forEach((url) => URL.revokeObjectURL(url));
	state.musicObjectUrls = [];
}

function pauseSession(autoResume = false) {
	// Pausa todas as faixas ativas
	if (state.activeHowls && state.activeHowls.length > 0) {
		state.activeHowls.forEach(howl => howl.pause());
	} else if (state.currentHowl) {
		state.currentHowl.pause();
	}
	if (state.audioCtx.state === 'running') {
		state.audioCtx.suspend();
	}
	state.wasPlayingBeforeBlur = autoResume;
	updateMediaSessionState('paused');
	updateSessionUI(true, true);
}

function resumeSession() {
	if (!state.isSessionRunning) return;
	resumeAudioContext();
	
	// Retoma todas as faixas ativas
	if (state.activeHowls && state.activeHowls.length > 0) {
		state.activeHowls.forEach(howl => {
			if (!howl.playing()) {
				howl.play();
			}
		});
	} else if (state.currentHowl && !state.currentHowl.playing()) {
		state.currentHowl.play();
	}
	
	state.wasPlayingBeforeBlur = false;
	updateMediaSessionState('playing');
	updateSessionUI(true, false);
}

function stopSession() {
	stopBinaural();
	stopCurrentTrack();
	stopYoutubeAudio(); // Para o YouTube quando a sessão termina
	clearInterval(state.timerId);
	state.timerId = null;
	state.remainingSeconds = 0;
	state.currentPlayingName = null; // Limpa nome da música atual
	totalSessionSeconds = 0;
	updateTimerDisplay();
	state.isSessionRunning = false;
	state.audioCtx.suspend();
	updateMediaSessionState('none');
	updateSessionUI(false, false);
	stopBreathingGuide();
	updateTimerProgress(0, 1);
	ui.frequencyDisplay.querySelector('.freq-value').textContent = '--';
	console.log('Sessão encerrada');
}

function startTimer(durationMinutes) {
	clearInterval(state.timerId);
	state.remainingSeconds = durationMinutes * 60;
	updateTimerDisplay();
	state.timerId = setInterval(() => {
		if (state.remainingSeconds <= 0) {
			clearInterval(state.timerId);
			state.timerId = null;
			playBeep();
			stopSession();
			return;
		}
		state.remainingSeconds -= 1;
		updateTimerDisplay();
	}, 1000);
}

function updateTimerDisplay() {
	const minutes = String(Math.floor(state.remainingSeconds / 60)).padStart(2, '0');
	const seconds = String(state.remainingSeconds % 60).padStart(2, '0');
	const timeStr = `${minutes}:${seconds}`;
	
	// Atualizar timer principal (legacy)
	if (ui.timerDisplay) {
		ui.timerDisplay.textContent = timeStr;
	}
	
	// Atualizar timer na track atual da playlist
	if (typeof PlaylistManager !== 'undefined' && typeof PlayerController !== 'undefined') {
		const currentTrackId = PlayerController.getCurrentTrackId();
		if (currentTrackId) {
			PlaylistManager.updateTrackTimer(currentTrackId, state.remainingSeconds);
		}
	}
}

/**
 * Atualiza a barra de progresso do timer
 * @param {number} current - Valor atual (segundos decorridos)
 * @param {number} total - Valor total (duração total em segundos)
 */
function updateTimerProgress(current, total) {
	if (!ui.timerProgress) return;
	
	const progress = total > 0 ? (current / total) * 100 : 0;
	ui.timerProgress.style.width = `${progress}%`;
}

function playBeep() {
	const ctx = state.audioCtx;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = 'triangle';
	osc.frequency.value = 880;
	gain.gain.setValueAtTime(0.0001, ctx.currentTime);
	gain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.05);
	gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
	osc.connect(gain).connect(ctx.destination);
	osc.start();
	osc.stop(ctx.currentTime + 0.8);
}

// Estado de validação de upload
let uploadValidationState = {
	files: [],
	validated: [],
	validCount: 0,
	isValidating: false
};

/**
 * Formata tamanho de arquivo em bytes para formato legível
 */
function formatFileSize(bytes) {
	if (bytes < 1024) return bytes + ' B';
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
	return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Valida um arquivo de áudio tentando decodificá-lo
 */
async function validateAudioFile(file) {
	return new Promise((resolve) => {
		try {
			const audio = new Audio();
			const url = URL.createObjectURL(file);
			
			const cleanup = () => {
				URL.revokeObjectURL(url);
				audio.src = '';
			};
			
			audio.oncanplaythrough = () => {
				cleanup();
				resolve({ valid: true, duration: audio.duration });
			};
			
			audio.onerror = () => {
				cleanup();
				resolve({ valid: false, error: 'Não foi possível reproduzir este arquivo' });
			};
			
			// Timeout de 10 segundos
			setTimeout(() => {
				cleanup();
				resolve({ valid: false, error: 'Timeout ao validar arquivo' });
			}, 10000);
			
			audio.src = url;
			audio.load();
		} catch (error) {
			resolve({ valid: false, error: error.message });
		}
	});
}

/**
 * Processa arquivos com validação antes de adicionar
 */
async function handleFilesWithValidation(fileList) {
	if (!fileList?.length) return;
	
	// Reset estado
	uploadValidationState = {
		files: [...fileList],
		validated: [],
		validCount: 0,
		isValidating: true
	};
	
	// Mostra área de validação
	if (ui.uploadValidationArea) {
		ui.uploadValidationArea.style.display = 'block';
		ui.uploadConfirmBtn.disabled = true;
	}
	
	// Renderiza lista inicial
	renderUploadValidationList();
	
	// Valida cada arquivo
	for (let i = 0; i < fileList.length; i++) {
		const file = fileList[i];
		
		// Atualiza status para "validando"
		uploadValidationState.validated[i] = { status: 'validating' };
		renderUploadValidationList();
		
		// Valida o arquivo
		const result = await validateAudioFile(file);
		
		if (result.valid) {
			uploadValidationState.validated[i] = { 
				status: 'valid', 
				duration: result.duration 
			};
			uploadValidationState.validCount++;
		} else {
			uploadValidationState.validated[i] = { 
				status: 'invalid', 
				error: result.error 
			};
		}
		
		renderUploadValidationList();
	}
	
	// Validação completa
	uploadValidationState.isValidating = false;
	updateUploadValidationHeader();
	
	// Habilita botão se há arquivos válidos
	if (ui.uploadConfirmBtn && uploadValidationState.validCount > 0) {
		ui.uploadConfirmBtn.disabled = false;
		ui.uploadConfirmBtn.innerHTML = `<i class="fa-solid fa-check"></i> Adicionar ${uploadValidationState.validCount} arquivo${uploadValidationState.validCount > 1 ? 's' : ''}`;
	}
	
	ui.audioUpload.value = '';
}

/**
 * Renderiza a lista de validação de upload
 */
function renderUploadValidationList() {
	if (!ui.uploadValidationList) return;
	
	ui.uploadValidationList.innerHTML = uploadValidationState.files.map((file, index) => {
		const validation = uploadValidationState.validated[index] || { status: 'pending' };
		
		let statusHtml = '';
		let itemClass = '';
		
		switch (validation.status) {
			case 'validating':
				statusHtml = `<span class="file-status status-validating"><i class="fa-solid fa-spinner fa-spin"></i> Validando...</span>`;
				itemClass = 'validating';
				break;
			case 'valid':
				statusHtml = `<span class="file-status status-valid"><i class="fa-solid fa-check-circle"></i> Válido</span>`;
				itemClass = 'valid';
				break;
			case 'invalid':
				statusHtml = `<span class="file-status status-invalid"><i class="fa-solid fa-times-circle"></i> ${validation.error || 'Inválido'}</span>`;
				itemClass = 'invalid';
				break;
			default:
				statusHtml = `<span class="file-status"><i class="fa-solid fa-clock"></i> Aguardando</span>`;
		}
		
		return `
			<li class="upload-validation-item ${itemClass}">
				<i class="fa-solid fa-file-audio file-icon"></i>
				<div class="file-info">
					<span class="file-name">${file.name}</span>
					<span class="file-size">${formatFileSize(file.size)}</span>
				</div>
				${statusHtml}
			</li>
		`;
	}).join('');
}

/**
 * Atualiza o header da área de validação
 */
function updateUploadValidationHeader() {
	const header = ui.uploadValidationArea?.querySelector('.upload-validation-header');
	if (!header) return;
	
	if (uploadValidationState.isValidating) {
		header.innerHTML = `<span><i class="fa-solid fa-spinner fa-spin"></i> Validando arquivos...</span>`;
		header.classList.remove('complete');
	} else {
		const total = uploadValidationState.files.length;
		const valid = uploadValidationState.validCount;
		header.innerHTML = `<span><i class="fa-solid fa-check-circle"></i> ${valid} de ${total} arquivo${total > 1 ? 's' : ''} válido${valid > 1 ? 's' : ''}</span>`;
		header.classList.add('complete');
	}
}

/**
 * Confirma e adiciona os arquivos válidos
 */
async function confirmValidatedUploads() {
	if (uploadValidationState.validCount === 0) return;
	
	// Filtra apenas arquivos válidos
	const validFiles = uploadValidationState.files.filter((_, index) => 
		uploadValidationState.validated[index]?.status === 'valid'
	);
	
	// Adiciona cada arquivo
	const tasks = validFiles.map(persistTrack);
	await Promise.all(tasks);
	
	showToast(`${validFiles.length} arquivo${validFiles.length > 1 ? 's' : ''} adicionado${validFiles.length > 1 ? 's' : ''} com sucesso!`, 'success');
	
	// Limpa e esconde área de validação
	cancelUploadValidation();
	
	// Atualiza playlist
	updatePlaylistSelect();
	updateSuggestions();
}

/**
 * Cancela a validação e limpa o estado
 */
function cancelUploadValidation() {
	uploadValidationState = {
		files: [],
		validated: [],
		validCount: 0,
		isValidating: false
	};
	
	if (ui.uploadValidationArea) {
		ui.uploadValidationArea.style.display = 'none';
		ui.uploadValidationList.innerHTML = '';
		ui.uploadConfirmBtn.disabled = true;
		ui.uploadConfirmBtn.innerHTML = '<i class="fa-solid fa-check"></i> Adicionar Válidos';
	}
	
	// Reset header
	const header = ui.uploadValidationArea?.querySelector('.upload-validation-header');
	if (header) {
		header.innerHTML = `<span><i class="fa-solid fa-spinner fa-spin"></i> Validando arquivos...</span>`;
		header.classList.remove('complete');
	}
	
	ui.audioUpload.value = '';
}

async function handleFiles(fileList) {
	if (!fileList?.length) return;
	const tasks = [...fileList].map(persistTrack);
	await Promise.all(tasks);
	ui.audioUpload.value = '';
	updatePlaylistSelect();
	updateSuggestions();
}

async function persistTrack(file) {
	const arrayBuffer = await file.arrayBuffer();
	const blob = new Blob([arrayBuffer], { type: file.type || 'audio/mpeg' });
	const lowEnergyPct = await analyzeLowEnergy(blob);
	const tag = lowEnergyPct > 40 ? 'relax/vibro' : lowEnergyPct > 25 ? 'meditacao' : 'ativa';
	const meta = {
		id: uuid(),
		name: file.name,
		size: file.size,
		type: blob.type,
		tag,
		lowEnergyPct: Number(lowEnergyPct.toFixed(2)),
		addedAt: Date.now(),
		origin: 'upload'
	};
	await stores.music.setItem(meta.id, blob);
	state.musicMeta.push(meta);
	await stores.data.setItem(STORAGE_KEYS.MUSIC_META, state.musicMeta);
	// Não renderiza aqui - será feito uma única vez após todos os uploads
	console.log('Arquivo armazenado', meta.name, tag);
}

async function analyzeLowEnergy(blob) {
	try {
		const AudioContextClass = window.AudioContext || window.webkitAudioContext;
		const ctx = new AudioContextClass();
		const arrayBuffer = await blob.arrayBuffer();
		const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 2048;
		const gain = ctx.createGain();
		gain.gain.value = 0;
		source.connect(analyser);
		analyser.connect(gain);
		gain.connect(ctx.destination);
		source.start();
		await ctx.resume();
		await wait(500);
		const data = new Float32Array(analyser.frequencyBinCount);
		analyser.getFloatFrequencyData(data);
		source.stop();
		ctx.close();
		const lowPercent = computeLowEnergyPercent(data, ctx.sampleRate);
		return lowPercent;
	} catch (error) {
		console.warn('Falha na análise espectral', error);
		return 20;
	}
}

function computeLowEnergyPercent(data, sampleRate) {
	const nyquist = sampleRate / 2;
	let lowEnergy = 0;
	let totalEnergy = 0;
	for (let i = 0; i < data.length; i += 1) {
		const freq = (i * nyquist) / data.length;
		const magnitude = Math.pow(10, data[i] / 20);
		totalEnergy += magnitude;
		if (freq <= 200) {
			lowEnergy += magnitude;
		}
	}
	return totalEnergy === 0 ? 0 : (lowEnergy / totalEnergy) * 100;
}

function renderMusicList() {
	PlaylistManager.render();
}

function updatePlaylistSelect() {
	PlaylistManager.render();
}

/**
 * Renderiza os sons terapêuticos padrões na playlist unificada
 * Sons padrão são reproduzidos via streaming do Internet Archive
 * Também inclui vídeos do YouTube adicionados pelo usuário
 */
/**
 * @deprecated Use PlaylistManager.render() diretamente
 * Mantido para compatibilidade retroativa
 */
async function renderDefaultSoundsInPlaylist(selectedTracks) {
	console.warn('[DEPRECATED] renderDefaultSoundsInPlaylist() chamada - use PlaylistManager.render()');
	return PlaylistManager.render();
}

/**
 * @deprecated Use PlaylistManager.render() diretamente
 * Mantido para compatibilidade retroativa
 */
async function renderPlaylistUnified() {
	console.warn('[DEPRECATED] renderPlaylistUnified() chamada - use PlaylistManager.render()');
	return PlaylistManager.render();
}

/**
 * @deprecated Use PlaylistManager.updateCounter() diretamente
 */
function updatePlaylistCounter() {
	PlaylistManager.updateCounter();
}

/**
 * @deprecated Agora delega para PlaylistManager.handleSelectionChange()
 */
function handlePlaylistSelectionChange(event) {
	PlaylistManager.handleSelectionChange(event);
}

/**
 * @deprecated Agora delega para PlaylistManager.handleActions()
 */
async function handlePlaylistActions(event) {
	await PlaylistManager.handleActions(event);
}

/**
 * Alterna o estado de favorito de uma faixa e atualiza a interface
 * @param {string} trackId - ID da faixa
 * @param {HTMLElement} button - Botão clicado
 * @param {HTMLElement} li - Elemento li do item
 */
async function handleFavoriteToggle(trackId, button, li) {
	const isFav = await toggleFavorite(trackId);
	
	// Atualiza visual do botão
	if (button) {
		button.classList.toggle('active', isFav);
		const icon = button.querySelector('i');
		if (icon) {
			icon.className = `fa-${isFav ? 'solid' : 'regular'} fa-star`;
		}
		button.title = isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
	}
	
	// Atualiza classe do item
	if (li) {
		li.classList.toggle('playlist-item--favorite', isFav);
		
		// Atualiza o nome com/sem estrela
		const nameEl = li.querySelector('.playlist-info strong');
		if (nameEl) {
			const currentName = nameEl.textContent.replace(/^⭐\s*/, '');
			nameEl.textContent = isFav ? `⭐ ${currentName}` : currentName;
		}
	}
	
	// Re-renderiza para reordenar (favoritos no topo)
	await PlaylistManager.render();
}

async function removeTrack(trackId) {
	await stores.music.removeItem(trackId);
	state.musicMeta = state.musicMeta.filter((track) => track.id !== trackId);
	
	// Remove from selected playlist
	if (state.selectedPlaylist) {
		state.selectedPlaylist = state.selectedPlaylist.filter(id => id !== trackId);
	}
	
	await stores.data.setItem(STORAGE_KEYS.MUSIC_META, state.musicMeta);
	PlaylistManager.render();
	console.log('Track removida', trackId);
}

/**
 * Exporta um áudio do IndexedDB para arquivo físico (download)
 * Útil para salvar áudios baixados do Internet Archive
 */
async function exportTrackToFile(trackId) {
	const meta = state.musicMeta.find(m => m.id === trackId);
	if (!meta) {
		showToast('Áudio não encontrado', 'error');
		return;
	}
	
	const blob = await stores.music.getItem(trackId);
	if (!blob) {
		showToast('Arquivo de áudio não encontrado', 'error');
		return;
	}
	
	// Determinar nome do arquivo
	let filename;
	if (meta.archiveId) {
		filename = `${meta.archiveId}.mp3`;
	} else if (meta.bundledId) {
		filename = `${meta.bundledId}.mp3`;
	} else {
		// Sanitizar nome para uso como arquivo
		const safeName = meta.name
			.replace(/[^a-z0-9\s-]/gi, '')
			.replace(/\s+/g, '-')
			.toLowerCase()
			.substring(0, 50);
		filename = `${safeName}.mp3`;
	}
	
	// Criar link de download
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
	
	// Mostrar informações para o manifest.json no console
	console.log('=== DADOS PARA manifest.json ===');
	console.log(JSON.stringify({
		id: meta.archiveId || meta.bundledId || filename.replace('.mp3', ''),
		filename: filename,
		name: meta.name.replace(' (Archive)', '').replace(' (Nativo)', ''),
		tag: meta.tag || 'alpha',
		lowEnergyPct: meta.lowEnergyPct || 50,
		category: meta.category || 'ambient',
		therapeuticUse: meta.therapeuticUse || [],
		description: meta.description || '',
		source: meta.origin === 'internet-archive' ? 'Internet Archive' : 'Local',
		sourceUrl: meta.archiveId ? `https://archive.org/details/${meta.archiveId}` : '',
		archiveId: meta.archiveId || null
	}, null, 2));
	
	showToast(`Arquivo exportado: ${filename}`, 'success');
}

function logSession(preset) {
	const entry = {
		id: uuid(),
		preset: preset.name,
		timestamp: Date.now(),
		duration: preset.duration,
		diffHz: preset.diffHz
	};
	state.history.push(entry);
	stores.history.setItem(STORAGE_KEYS.HISTORY, state.history);
}

function updateConnectivity() {
	const online = navigator.onLine;
	ui.onlineStatus.classList.toggle('hidden', !online);
	ui.offlineStatus.classList.toggle('hidden', online);
}

function handleDropZone(event) {
	event.preventDefault();
	if (event.type === 'dragover') {
		ui.dropZone.classList.add('dragging');
	}
	if (event.type === 'dragleave') {
		ui.dropZone.classList.remove('dragging');
	}
	if (event.type === 'drop') {
		ui.dropZone.classList.remove('dragging');
		handleFilesWithValidation(event.dataTransfer.files);
	}
}

function handleVisibilityChange() {
	// Áudio continua tocando em segundo plano
	// Não pausar quando a aba perde visibilidade
}

function handleWindowBlur() {
	// Áudio continua tocando em segundo plano
	// Não pausar quando a janela perde foco
}

function handleWindowFocus() {
	// Nada a fazer - áudio já está tocando
}

// Media Session API para controles de mídia do sistema
function setupMediaSession(preset) {
	if (!('mediaSession' in navigator)) return;
	
	navigator.mediaSession.metadata = new MediaMetadata({
		title: preset.name || 'Sessão Binaural',
		artist: 'Terra Vibro Sensory Musical',
		album: `${preset.diffHz}Hz ${describeDiffBand(preset.diffHz).label}`,
		artwork: [
			{ src: 'icons/baselogo_app.png', sizes: '512x512', type: 'image/png' }
		]
	});
	
	navigator.mediaSession.setActionHandler('play', () => {
		resumeSession();
	});
	
	navigator.mediaSession.setActionHandler('pause', () => {
		pauseSession(false);
	});
	
	navigator.mediaSession.setActionHandler('stop', () => {
		stopSession();
	});
	
	navigator.mediaSession.playbackState = 'playing';
}

function updateMediaSessionState(state) {
	if ('mediaSession' in navigator) {
		navigator.mediaSession.playbackState = state;
	}
}

function captureInstallPrompt(event) {
	event.preventDefault();
	state.deferredPrompt = event;
	ui.installBtn.disabled = false;
}

async function triggerInstallPrompt() {
	if (!state.deferredPrompt) return;
	state.deferredPrompt.prompt();
	await state.deferredPrompt.userChoice;
	state.deferredPrompt = null;
	ui.installBtn.disabled = true;
}

// =============================================================================
// SISTEMA DE ATUALIZAÇÃO DO SERVICE WORKER
// =============================================================================

/**
 * Registra o Service Worker e configura sistema de atualização
 */
function registerServiceWorker() {
	if (!('serviceWorker' in navigator)) {
		console.log('[App] Service Worker não suportado');
		return;
	}

	// Flag para evitar múltiplos reloads
	let refreshing = false;
	
	// Listener CRÍTICO: quando um novo SW assume o controle, recarrega a página
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (refreshing) return;
		refreshing = true;
		console.log('[App] Novo Service Worker assumiu - recarregando página...');
		window.location.reload();
	});

	state.wb = new Workbox('sw.js');

	// Quando há uma nova versão esperando
	state.wb.addEventListener('waiting', (event) => {
		console.log('[App] Nova versão disponível, aguardando ativação...');
		showUpdateNotification(event.sw);
	});

	// Quando o SW é instalado pela primeira vez
	state.wb.addEventListener('installed', (event) => {
		if (event.isUpdate) {
			console.log('[App] Atualização instalada');
		} else {
			console.log('[App] Service Worker instalado pela primeira vez');
		}
	});

	// Quando o SW é ativado
	state.wb.addEventListener('activated', (event) => {
		if (event.isUpdate) {
			console.log('[App] Nova versão ativada');
			// O reload será feito pelo controllerchange listener
		}
	});

	// Quando o controlador muda (novo SW assumiu)
	state.wb.addEventListener('controlling', () => {
		console.log('[App] Novo Service Worker assumiu o controle');
	});

	// Mensagens do SW
	navigator.serviceWorker.addEventListener('message', handleSWMessage);

	// Registra o SW
	state.wb.register().then((registration) => {
		console.log('[App] Service Worker registrado');
		
		// Verifica atualizações periodicamente (a cada 1 hora)
		setInterval(() => {
			console.log('[App] Verificando atualizações...');
			registration.update();
		}, 60 * 60 * 1000);
		
		// Verifica imediatamente ao registrar
		registration.update();
	});
}

/**
 * Processa mensagens recebidas do Service Worker
 */
function handleSWMessage(event) {
	const { type, version } = event.data || {};
	
	switch (type) {
		case 'UPDATE_AVAILABLE':
			console.log(`[App] Atualização disponível: v${version}`);
			showUpdateNotification();
			break;
			
		case 'CACHE_UPDATED':
			console.log(`[App] Cache atualizado para v${version}`);
			break;
	}
}

/**
 * Exibe banner de notificação de atualização disponível
 */
function showUpdateNotification(waitingSW = null) {
	// Remove banner anterior se existir
	const existingBanner = document.getElementById('update-banner');
	if (existingBanner) existingBanner.remove();

	const banner = document.createElement('div');
	banner.id = 'update-banner';
	banner.className = 'update-banner';
	banner.innerHTML = `
		<div class="update-banner__content">
			<i class="fa-solid fa-arrow-rotate-right"></i>
			<span>Nova versão disponível!</span>
		</div>
		<div class="update-banner__actions">
			<button class="update-banner__btn update-banner__btn--later" type="button">Depois</button>
			<button class="update-banner__btn update-banner__btn--update" type="button">Atualizar agora</button>
		</div>
	`;

	document.body.appendChild(banner);

	// Força reflow para animação
	banner.offsetHeight;
	banner.classList.add('update-banner--visible');

	// Botão "Depois" - apenas esconde o banner
	banner.querySelector('.update-banner__btn--later').addEventListener('click', () => {
		banner.classList.remove('update-banner--visible');
		setTimeout(() => banner.remove(), 300);
	});

	// Botão "Atualizar agora" - ativa o novo SW
	banner.querySelector('.update-banner__btn--update').addEventListener('click', () => {
		const updateBtn = banner.querySelector('.update-banner__btn--update');
		updateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Atualizando...';
		updateBtn.disabled = true;
		banner.querySelector('.update-banner__btn--later').disabled = true;

		if (waitingSW) {
			waitingSW.postMessage({ type: 'SKIP_WAITING' });
		} else if (state.wb) {
			state.wb.messageSkipWaiting();
		}
		
		// Fallback: se após 3 segundos não recarregou, força o reload
		setTimeout(() => {
			console.log('[App] Fallback: forçando reload...');
			window.location.reload();
		}, 3000);
	});
}

/**
 * Força verificação manual de atualizações
 * Pode ser chamada de qualquer lugar (ex: botão de configurações)
 */
async function checkForUpdates() {
	if (!state.wb) {
		console.log('[App] Service Worker não disponível');
		return false;
	}
	
	try {
		const registration = await navigator.serviceWorker.getRegistration();
		if (registration) {
			await registration.update();
			console.log('[App] Verificação de atualização concluída');
			
			// Se há um SW esperando, mostra o banner
			if (registration.waiting) {
				showUpdateNotification(registration.waiting);
				return true;
			}
		}
		return false;
	} catch (error) {
		console.error('[App] Erro ao verificar atualizações:', error);
		return false;
	}
}

function setFooterYear() {
	ui.year.textContent = new Date().getFullYear();
}

// =============================================================================
// SISTEMA DE TUTORIAL / ONBOARDING
// =============================================================================

let currentTutorialSlide = 0;
const TOTAL_TUTORIAL_SLIDES = 6;

function checkTermsModal() {
	const accepted = localStorage.getItem(TERMS_KEY);
	if (accepted) {
		ui.termsModal.classList.add('hidden');
	} else {
		ui.termsModal.classList.remove('hidden');
		initTutorial();
	}
}

function initTutorial() {
	currentTutorialSlide = 0;
	updateTutorialUI();
}

function updateTutorialUI() {
	// Atualiza slides
	const slides = ui.tutorialSlides.querySelectorAll('.tutorial-slide');
	slides.forEach((slide, index) => {
		slide.classList.toggle('active', index === currentTutorialSlide);
	});
	
	// Atualiza dots
	const dots = ui.tutorialDots.querySelectorAll('.tutorial-dot');
	dots.forEach((dot, index) => {
		dot.classList.toggle('active', index === currentTutorialSlide);
	});
	
	// Atualiza botões de navegação
	ui.tutorialPrev.disabled = currentTutorialSlide === 0;
	
	// No último slide, mostra botão de aceitar em vez de próximo
	const isLastSlide = currentTutorialSlide === TOTAL_TUTORIAL_SLIDES - 1;
	ui.tutorialNext.classList.toggle('hidden', isLastSlide);
	ui.acceptTerms.classList.toggle('hidden', !isLastSlide);
	
	// Botão aceitar sempre habilitado (checkbox é opcional)
	if (isLastSlide) {
		ui.acceptTerms.disabled = false;
	}
}

function tutorialPrevSlide() {
	if (currentTutorialSlide > 0) {
		currentTutorialSlide--;
		updateTutorialUI();
	}
}

function tutorialNextSlide() {
	if (currentTutorialSlide < TOTAL_TUTORIAL_SLIDES - 1) {
		currentTutorialSlide++;
		updateTutorialUI();
	}
}

function handleTutorialDotClick(event) {
	const dot = event.target.closest('.tutorial-dot');
	if (!dot) return;
	
	const slideIndex = parseInt(dot.dataset.slide, 10);
	if (!isNaN(slideIndex) && slideIndex >= 0 && slideIndex < TOTAL_TUTORIAL_SLIDES) {
		currentTutorialSlide = slideIndex;
		updateTutorialUI();
	}
}

function handleTermsCheckboxChange() {
	// Checkbox é opcional - não precisa fazer nada
}

function acceptTerms() {
	// Aceita os termos diretamente (checkbox opcional)
	localStorage.setItem(TERMS_KEY, 'true');
	ui.termsModal.classList.add('hidden');
	
	// Inicia o tutorial guiado após um pequeno delay
	setTimeout(() => {
		startGuidedTutorial();
	}, 500);
}

// =============================================================================
// TUTORIAL GUIADO INTERATIVO
// =============================================================================

const GUIDED_TUTORIAL_KEY = 'ts-guided-tutorial-completed';

const TUTORIAL_STEPS = [
	{
		selector: '#patientBar',
		title: '👤 Barra de Pacientes',
		text: 'Aqui você visualiza o paciente selecionado e pode cadastrar novos pacientes ou acessar a lista de pacientes já cadastrados.',
		position: 'bottom'
	},
	{
		selector: '#newPatientBtn',
		title: '➕ Novo Paciente',
		text: 'Clique aqui para cadastrar um novo paciente. Um formulário completo de anamnese será aberto para você preencher.',
		position: 'bottom'
	},
	{
		selector: '#protocolQuickSelector',
		title: '📋 Protocolos Terapêuticos',
		text: 'Clique em qualquer botão para aplicar um protocolo pré-definido baseado em evidências científicas. Todas as configurações serão ajustadas automaticamente.',
		position: 'bottom'
	},
	{
		selector: '#baseFreq',
		title: '🎵 Frequência Base',
		text: 'Ajuste a frequência portadora vibroacústica. Valores entre 40Hz e 68Hz são mais comuns na prática terapêutica (Skille 1991).',
		position: 'bottom'
	},
	{
		selector: '#diffFreq',
		title: '🧠 Diferença Binaural',
		text: 'Define a diferença de frequência entre os canais esquerdo e direito, criando o efeito binaural. Delta (0.5-4Hz), Theta (4-8Hz), Alpha (8-13Hz), Beta (13-30Hz), Gamma (30-40Hz).',
		position: 'bottom'
	},
	{
		selector: '#duration',
		title: '⏱️ Duração da Sessão',
		text: 'Configure a duração da sessão. Mínimo recomendado: 20 minutos (Wigram 1995). O sistema irá parar automaticamente.',
		position: 'bottom'
	},
	{
		selector: '#binauralVolume',
		title: '🔊 Intensidade',
		text: 'Controle a intensidade vibroacústica. Recomendamos manter entre 50-75% para segurança.',
		position: 'bottom'
	},
	{
		selector: '#playerSection',
		title: '▶️ Centro de Controle',
		text: 'Aqui você controla a sessão terapêutica: play, pause, volume e visualizador em tempo real.',
		position: 'top'
	},
	{
		selector: '#presetList',
		title: '📁 Presets Salvos',
		text: 'Salve suas configurações favoritas como presets para reutilizar em sessões futuras.',
		position: 'top'
	},
	{
		selector: '#musicLibrary',
		title: '🎶 Biblioteca de Músicas',
		text: 'Importe músicas para combinar com as frequências binaurais. A música é mixada com o tom para uma experiência mais agradável.',
		position: 'top'
	},
	{
		selector: '#references',
		title: '📊 Referências Científicas',
		text: 'Consulte as evidências científicas que fundamentam os protocolos e configurações disponíveis no sistema.',
		position: 'top'
	}
];

let currentGuidedStep = 0;
let previousHighlightedElement = null;

function startGuidedTutorial() {
	// Verifica se já completou o tutorial
	const completed = localStorage.getItem(GUIDED_TUTORIAL_KEY);
	if (completed) return;
	
	currentGuidedStep = 0;
	ui.guidedTutorial.classList.remove('hidden');
	ui.guidedTutorial.classList.add('active');
	
	// Scroll para o topo
	window.scrollTo({ top: 0, behavior: 'smooth' });
	
	setTimeout(() => {
		showGuidedStep(currentGuidedStep);
	}, 300);
}

function showGuidedStep(stepIndex) {
	const step = TUTORIAL_STEPS[stepIndex];
	if (!step) return;
	
	const element = document.querySelector(step.selector);
	if (!element) {
		// Se elemento não encontrado, pula para o próximo
		console.warn(`[Tutorial] Elemento não encontrado: ${step.selector}`);
		if (stepIndex < TUTORIAL_STEPS.length - 1) {
			currentGuidedStep++;
			showGuidedStep(currentGuidedStep);
		} else {
			endGuidedTutorial();
		}
		return;
	}
	
	// Remove destaque anterior
	if (previousHighlightedElement) {
		previousHighlightedElement.classList.remove('tutorial-highlight');
	}
	
	// Adiciona destaque ao elemento atual
	element.classList.add('tutorial-highlight');
	previousHighlightedElement = element;
	
	// Verifica se o elemento está visível na viewport
	const rect = element.getBoundingClientRect();
	const viewportHeight = window.innerHeight;
	const margin = 100; // Margem extra para garantir visibilidade
	
	const isFullyVisible = rect.top >= margin && rect.bottom <= (viewportHeight - margin);
	
	if (!isFullyVisible) {
		// Scroll suave até o elemento, posicionando no centro
		element.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
	
	// Aguarda o scroll completar (tempo maior para mobile)
	const waitTime = isFullyVisible ? 100 : 600;
	setTimeout(() => {
		positionSpotlight(element);
		positionTooltip(element, step);
		updateGuidedTutorialUI();
	}, waitTime);
}

function positionSpotlight(element) {
	const rect = element.getBoundingClientRect();
	const padding = window.innerWidth < 600 ? 4 : 8;
	
	ui.tutorialSpotlight.style.top = `${rect.top - padding}px`;
	ui.tutorialSpotlight.style.left = `${rect.left - padding}px`;
	ui.tutorialSpotlight.style.width = `${rect.width + padding * 2}px`;
	ui.tutorialSpotlight.style.height = `${rect.height + padding * 2}px`;
}

function positionTooltip(element, step) {
	const rect = element.getBoundingClientRect();
	const tooltip = ui.tutorialTooltip;
	const gap = 16;
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;
	const isMobile = viewportWidth < 600;
	
	// Atualiza conteúdo primeiro
	ui.tooltipTitle.textContent = step.title;
	ui.tooltipText.textContent = step.text;
	
	// Força recálculo do tamanho do tooltip após atualizar conteúdo
	tooltip.style.top = '0';
	tooltip.style.left = '0';
	
	// Obtém dimensões reais do tooltip
	const tooltipRect = tooltip.getBoundingClientRect();
	const tooltipWidth = Math.min(tooltipRect.width, viewportWidth - 32);
	const tooltipHeight = tooltipRect.height;
	
	let top, left;
	let arrowPosition = step.position;
	
	// Em mobile, posiciona sempre abaixo ou acima do elemento
	if (isMobile) {
		left = (viewportWidth - tooltipWidth) / 2;
		
		// Verifica se cabe abaixo
		if (rect.bottom + gap + tooltipHeight < viewportHeight - 20) {
			top = rect.bottom + gap;
			arrowPosition = 'bottom';
		} else {
			// Posiciona acima
			top = rect.top - tooltipHeight - gap;
			arrowPosition = 'top';
		}
		
		// Se ainda não couber, posiciona no centro da tela
		if (top < 10) {
			top = Math.max(10, (viewportHeight - tooltipHeight) / 2);
		}
	} else {
		// Desktop: calcula posição baseada na preferência
		switch (step.position) {
			case 'top':
				top = rect.top - tooltipHeight - gap;
				left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
				break;
			case 'bottom':
				top = rect.bottom + gap;
				left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
				break;
			case 'left':
				top = rect.top + (rect.height / 2) - (tooltipHeight / 2);
				left = rect.left - tooltipWidth - gap;
				break;
			case 'right':
				top = rect.top + (rect.height / 2) - (tooltipHeight / 2);
				left = rect.right + gap;
				break;
			default:
				top = rect.bottom + gap;
				left = rect.left;
		}
		
		// Ajusta se sair da tela horizontalmente
		if (left < 16) left = 16;
		if (left + tooltipWidth > viewportWidth - 16) {
			left = viewportWidth - tooltipWidth - 16;
		}
		
		// Ajusta se sair da tela verticalmente
		if (top < 16) {
			top = rect.bottom + gap;
			arrowPosition = 'bottom';
		}
		if (top + tooltipHeight > viewportHeight - 16) {
			top = rect.top - tooltipHeight - gap;
			arrowPosition = 'top';
			
			// Se ainda não couber, centraliza verticalmente
			if (top < 16) {
				top = Math.max(16, (viewportHeight - tooltipHeight) / 2);
			}
		}
	}
	
	tooltip.style.top = `${top}px`;
	tooltip.style.left = `${left}px`;
	
	// Posiciona a seta
	ui.tooltipArrow.setAttribute('data-position', arrowPosition);
	
	// Ajusta posição horizontal da seta para apontar para o elemento
	if (arrowPosition === 'top' || arrowPosition === 'bottom') {
		const elementCenter = rect.left + rect.width / 2;
		const tooltipLeft = left;
		const arrowOffset = Math.max(20, Math.min(tooltipRect.width - 20, elementCenter - tooltipLeft));
		ui.tooltipArrow.style.left = `${arrowOffset}px`;
		ui.tooltipArrow.style.marginLeft = '-8px';
		ui.tooltipArrow.style.top = '';
		ui.tooltipArrow.style.marginTop = '';
	} else {
		ui.tooltipArrow.style.left = '';
		ui.tooltipArrow.style.marginLeft = '';
	}
}

function repositionTutorialTooltip() {
	if (!ui.guidedTutorial.classList.contains('active')) return;
	
	const step = TUTORIAL_STEPS[currentGuidedStep];
	if (!step) return;
	
	const element = document.querySelector(step.selector);
	if (!element) return;
	
	positionSpotlight(element);
	positionTooltip(element, step);
}

function updateGuidedTutorialUI() {
	const total = TUTORIAL_STEPS.length;
	const current = currentGuidedStep + 1;
	
	ui.tooltipStep.textContent = `${current}/${total}`;
	ui.tutorialPrevBtn.disabled = currentGuidedStep === 0;
	
	// Último passo - muda botão para "Concluir"
	if (currentGuidedStep === total - 1) {
		ui.tutorialNextBtn.innerHTML = '<i class="fa-solid fa-check"></i> Concluir';
		ui.tutorialNextBtn.classList.add('tooltip__btn--finish');
	} else {
		ui.tutorialNextBtn.innerHTML = 'Próximo <i class="fa-solid fa-chevron-right"></i>';
		ui.tutorialNextBtn.classList.remove('tooltip__btn--finish');
	}
}

function guidedTutorialPrev() {
	if (currentGuidedStep > 0) {
		currentGuidedStep--;
		showGuidedStep(currentGuidedStep);
	}
}

function guidedTutorialNext() {
	if (currentGuidedStep < TUTORIAL_STEPS.length - 1) {
		currentGuidedStep++;
		showGuidedStep(currentGuidedStep);
	} else {
		endGuidedTutorial();
	}
}

function endGuidedTutorial() {
	// Remove destaque
	if (previousHighlightedElement) {
		previousHighlightedElement.classList.remove('tutorial-highlight');
		previousHighlightedElement = null;
	}
	
	// Esconde o tutorial
	ui.guidedTutorial.classList.remove('active');
	ui.guidedTutorial.classList.add('hidden');
	
	// Marca como concluído
	localStorage.setItem(GUIDED_TUTORIAL_KEY, 'true');
}

// Resetar e reiniciar o tutorial guiado (chamado pelo botão do rodapé)
function resetAndStartGuidedTutorial() {
	// Remove a flag de tutorial concluído
	localStorage.removeItem(GUIDED_TUTORIAL_KEY);
	
	// Scroll para o topo
	window.scrollTo({ top: 0, behavior: 'smooth' });
	
	// Inicia o tutorial
	setTimeout(() => {
		currentGuidedStep = 0;
		ui.guidedTutorial.classList.remove('hidden');
		ui.guidedTutorial.classList.add('active');
		showGuidedStep(currentGuidedStep);
	}, 300);
}

// Mostrar o modal de termos de uso (chamado pelo botão do rodapé)
function showTermsModal() {
	// Resetar para o primeiro slide
	currentTutorialSlide = 0;
	const slides = document.querySelectorAll('.tutorial-slide');
	slides.forEach((slide, i) => {
		slide.classList.toggle('active', i === 0);
	});
	updateTutorialUI();
	
	// Mostra o modal
	ui.termsModal.classList.add('active');
}

async function verifyHeadphones() {
	try {
		const ctx = state.audioCtx;
		const channels = ctx.destination.maxChannelCount || ctx.destination.channelCount;
		if (channels < 2) {
			ui.headphoneStatus.innerHTML = '<i class="fa-solid fa-headphones"></i> Utilize fones estéreo';
			return;
		}
		const buffer = ctx.createBuffer(2, 1, ctx.sampleRate);
		buffer.getChannelData(1);
		ui.headphoneStatus.innerHTML = '<i class="fa-solid fa-headphones"></i> Fones estéreo detectados';
	} catch (error) {
		ui.headphoneStatus.innerHTML = '<i class="fa-solid fa-headphones"></i> Não foi possível testar fones';
	}
}

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function synthesizeTexture(textureDef = {}) {
	const config = textureDef.config || {};
	const duration = Math.max(15, Math.min(config.duration || 30, 60));
	const sampleRate = 44100;
	const frameCount = sampleRate * duration;
	const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
	if (!OfflineContext) {
		throw new Error('OfflineAudioContext indisponível');
	}
	const offline = new OfflineContext(2, frameCount, sampleRate);
	const merger = offline.createChannelMerger(2);
	const lowPass = offline.createBiquadFilter();
	lowPass.type = 'lowpass';
	lowPass.frequency.value = config.lowPass || 500;
	merger.connect(lowPass);
	lowPass.connect(offline.destination);

	const leftOsc = offline.createOscillator();
	const rightOsc = offline.createOscillator();
	leftOsc.type = 'sine';
	rightOsc.type = 'sine';
	const base = config.baseHz || 200;
	const diff = config.diffHz || 8;
	leftOsc.frequency.value = base;
	rightOsc.frequency.value = base + diff;

	const leftGain = offline.createGain();
	const rightGain = offline.createGain();
	leftGain.gain.value = config.leftGain ?? 0.35;
	rightGain.gain.value = config.rightGain ?? 0.35;
	leftOsc.connect(leftGain).connect(merger, 0, 0);
	rightOsc.connect(rightGain).connect(merger, 0, 1);

	if (config.pulse) {
		const lfo = offline.createOscillator();
		lfo.type = 'sine';
		lfo.frequency.value = diff / 2;
		const lfoGain = offline.createGain();
		lfoGain.gain.value = 0.15;
		lfo.connect(lfoGain);
		const dc = offline.createConstantSource();
		dc.offset.value = 0.3;
		lfoGain.connect(leftGain.gain);
		lfoGain.connect(rightGain.gain);
		dc.connect(leftGain.gain);
		dc.connect(rightGain.gain);
		dc.start(0);
		lfo.start(0);
	}

	if (config.shimmer) {
		const shimmer = offline.createOscillator();
		shimmer.type = 'triangle';
		shimmer.frequency.value = base * 2;
		const shimmerGain = offline.createGain();
		shimmerGain.gain.value = 0.08;
		shimmer.connect(shimmerGain).connect(merger);
		shimmer.start(0);
	}

	if (config.noise) {
		const noiseBuffer = createNoiseBuffer(offline, frameCount, config.noise);
		const noiseSource = offline.createBufferSource();
		noiseSource.buffer = noiseBuffer;
		const noiseGain = offline.createGain();
		noiseGain.gain.value = 0.18;
		noiseSource.connect(noiseGain).connect(merger);
		noiseSource.start(0);
	}

	leftOsc.start(0);
	rightOsc.start(0);
	const rendered = await offline.startRendering();
	const wavBuffer = bufferToWave(rendered);
	return new Blob([wavBuffer], { type: 'audio/wav' });
}

function createNoiseBuffer(ctx, frameCount, color = 'pink') {
	const buffer = ctx.createBuffer(2, frameCount, ctx.sampleRate);
	for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
		const output = buffer.getChannelData(channel);
		let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
		let lastOut = 0;
		for (let i = 0; i < frameCount; i += 1) {
			const white = Math.random() * 2 - 1;
			if (color === 'brown') {
				lastOut = (lastOut + 0.02 * white) / 1.02;
				output[i] = lastOut * 3.5;
			} else if (color === 'pink') {
				b0 = 0.99886 * b0 + white * 0.0555179;
				b1 = 0.99332 * b1 + white * 0.0750759;
				b2 = 0.969 * b2 + white * 0.153852;
				b3 = 0.8665 * b3 + white * 0.3104856;
				b4 = 0.55 * b4 + white * 0.5329522;
				b5 = -0.7616 * b5 - white * 0.016898;
				output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
				output[i] *= 0.11;
				b6 = white * 0.115926;
			} else {
				output[i] = white * 0.3;
			}
		}
	}
	return buffer;
}

function bufferToWave(buffer) {
	const numOfChan = buffer.numberOfChannels;
	const length = buffer.length * numOfChan * 2 + 44;
	const result = new ArrayBuffer(length);
	const view = new DataView(result);
	let offset = 0;

	writeString(view, offset, 'RIFF'); offset += 4;
	view.setUint32(offset, length - 8, true); offset += 4;
	writeString(view, offset, 'WAVE'); offset += 4;
	writeString(view, offset, 'fmt '); offset += 4;
	view.setUint32(offset, 16, true); offset += 4;
	view.setUint16(offset, 1, true); offset += 2;
	view.setUint16(offset, numOfChan, true); offset += 2;
	view.setUint32(offset, buffer.sampleRate, true); offset += 4;
	view.setUint32(offset, buffer.sampleRate * numOfChan * 2, true); offset += 4;
	view.setUint16(offset, numOfChan * 2, true); offset += 2;
	view.setUint16(offset, 16, true); offset += 2;
	writeString(view, offset, 'data'); offset += 4;
	view.setUint32(offset, buffer.length * numOfChan * 2, true); offset += 4;

	const interleaved = new Float32Array(buffer.length * numOfChan);
	let index = 0;
	for (let i = 0; i < buffer.length; i += 1) {
		for (let channel = 0; channel < numOfChan; channel += 1) {
			interleaved[index++] = buffer.getChannelData(channel)[i];
		}
	}

	floatTo16BitPCM(view, offset, interleaved);
	return result;
}

function writeString(view, offset, string) {
	for (let i = 0; i < string.length; i += 1) {
		view.setUint8(offset + i, string.charCodeAt(i));
	}
}

function floatTo16BitPCM(view, offset, input) {
	for (let i = 0; i < input.length; i += 1, offset += 2) {
		let s = Math.max(-1, Math.min(1, input[i]));
		s = s < 0 ? s * 0x8000 : s * 0x7fff;
		view.setInt16(offset, s, true);
	}
}

// ==========================================
// YouTube Video Add Panel
// ==========================================

// Estado do preview de validação
let youtubeAddPreviewState = {
	isPlaying: false,
	videoId: null,
	validated: false
};

/**
 * Extrai o ID do vídeo do YouTube de uma URL
 * @param {string} url - URL do YouTube
 * @returns {string|null} - ID do vídeo ou null se inválido
 */
function extractYoutubeVideoId(url) {
	if (!url) return null;
	
	// Padrões suportados:
	// https://www.youtube.com/watch?v=VIDEO_ID
	// https://youtu.be/VIDEO_ID
	// https://www.youtube.com/embed/VIDEO_ID
	// https://www.youtube.com/v/VIDEO_ID
	// https://www.youtube.com/shorts/VIDEO_ID
	
	const patterns = [
		/(?:youtube\.com\/watch\?v=|youtube\.com\/watch\?.+&v=)([^&\n?#]+)/,
		/youtu\.be\/([^&\n?#]+)/,
		/youtube\.com\/embed\/([^&\n?#]+)/,
		/youtube\.com\/v\/([^&\n?#]+)/,
		/youtube\.com\/shorts\/([^&\n?#]+)/
	];
	
	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match && match[1]) {
			return match[1];
		}
	}
	
	return null;
}

/**
 * Define o status do painel de adicionar YouTube
 * @param {string} message - Mensagem a exibir
 * @param {string} type - Tipo: 'success', 'error', 'loading' ou ''
 */
function setYoutubeAddStatus(message, type) {
	ui.youtubeAddStatus.textContent = message;
	ui.youtubeAddStatus.className = 'archive-status';
	if (type) {
		ui.youtubeAddStatus.classList.add(type);
	}
}

/**
 * Reseta o formulário de adicionar YouTube quando o URL é alterado
 */
function resetYoutubeAddForm() {
	// Se o preview estiver tocando, para
	if (youtubeAddPreviewState.isPlaying) {
		stopYoutubeAddPreview();
	}
	
	// Reseta estado
	youtubeAddPreviewState.validated = false;
	youtubeAddPreviewState.videoId = null;
	
	// Esconde botão adicionar, mostra botão preview
	ui.youtubeAddBtn.style.display = 'none';
	ui.youtubeAddBtn.disabled = true;
	ui.youtubePreviewBtn.style.display = '';
	ui.youtubePreviewBtn.innerHTML = '<i class="fa-solid fa-headphones"></i> Preview';
	ui.youtubePreviewBtn.classList.remove('playing');
	ui.youtubePreviewBtn.classList.add('secondary');
	ui.youtubePreviewBtn.classList.remove('danger');
	
	setYoutubeAddStatus('', '');
}

/**
 * Para o preview de validação do YouTube
 */
function stopYoutubeAddPreview() {
	stopYoutubeAudio();
	youtubeAddPreviewState.isPlaying = false;
	
	// Atualiza botão para estado de preview
	ui.youtubePreviewBtn.innerHTML = '<i class="fa-solid fa-headphones"></i> Preview';
	ui.youtubePreviewBtn.classList.remove('playing', 'danger');
	ui.youtubePreviewBtn.classList.add('secondary');
	ui.youtubePreviewBtn.disabled = false;
}

/**
 * Alterna entre preview e stop do vídeo para validação
 */
async function handleYoutubePreviewToggle() {
	// Se está tocando, para
	if (youtubeAddPreviewState.isPlaying) {
		stopYoutubeAddPreview();
		setYoutubeAddStatus('Preview parado. Clique em Preview novamente para testar.', '');
		return;
	}
	
	const url = ui.youtubeUrlInput.value.trim();
	
	// Validar URL
	if (!url) {
		setYoutubeAddStatus('Por favor, insira um link do YouTube.', 'error');
		return;
	}
	
	// Extrair ID do vídeo
	const videoId = extractYoutubeVideoId(url);
	
	if (!videoId) {
		setYoutubeAddStatus('Link inválido. Cole um link válido do YouTube.', 'error');
		return;
	}
	
	// Verificar conexão
	if (!navigator.onLine) {
		setYoutubeAddStatus('Sem conexão com a internet.', 'error');
		return;
	}
	
	// Verificar se já existe no catálogo padrão
	const catalog = state.defaultSoundsCatalog;
	const existingInCatalog = catalog?.sounds?.find(s => s.youtubeId === videoId);
	if (existingInCatalog) {
		setYoutubeAddStatus(`Este vídeo já está na playlist: "${existingInCatalog.name}"`, 'error');
		return;
	}
	
	// Verificar se já existe nos vídeos do usuário
	const userYoutubeVideos = await stores.data.getItem('userYoutubeVideos') || [];
	const existingUserVideo = userYoutubeVideos.find(v => v.youtube === videoId);
	if (existingUserVideo) {
		setYoutubeAddStatus(`Este vídeo já está na playlist: "${existingUserVideo.name}"`, 'error');
		return;
	}
	
	// Atualiza botão para estado de carregando
	ui.youtubePreviewBtn.disabled = true;
	ui.youtubePreviewBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Carregando...';
	setYoutubeAddStatus('Validando vídeo...', 'loading');
	
	try {
		// Tenta reproduzir o vídeo
		const success = await playYoutubeAudio(videoId, { volume: 70, loop: false });
		
		if (success) {
			// Vídeo validado com sucesso!
			youtubeAddPreviewState.isPlaying = true;
			youtubeAddPreviewState.videoId = videoId;
			youtubeAddPreviewState.validated = true;
			
			// Atualiza botão preview para "Stop"
			ui.youtubePreviewBtn.disabled = false;
			ui.youtubePreviewBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop';
			ui.youtubePreviewBtn.classList.remove('secondary');
			ui.youtubePreviewBtn.classList.add('danger', 'playing');
			
			// Mostra botão adicionar
			ui.youtubeAddBtn.style.display = '';
			ui.youtubeAddBtn.disabled = false;
			
			setYoutubeAddStatus('✓ Vídeo validado! Ouça o preview e clique em "Adicionar" para salvar.', 'success');
		} else {
			// Falha na reprodução
			ui.youtubePreviewBtn.disabled = false;
			ui.youtubePreviewBtn.innerHTML = '<i class="fa-solid fa-headphones"></i> Preview';
			setYoutubeAddStatus('Erro: Este vídeo não pode ser reproduzido (pode estar bloqueado ou indisponível).', 'error');
		}
	} catch (error) {
		console.error('Erro ao validar vídeo do YouTube:', error);
		ui.youtubePreviewBtn.disabled = false;
		ui.youtubePreviewBtn.innerHTML = '<i class="fa-solid fa-headphones"></i> Preview';
		setYoutubeAddStatus('Erro ao carregar vídeo. Verifique o link e tente novamente.', 'error');
	}
}

/**
 * Confirma a adição do vídeo após validação bem-sucedida
 */
async function handleConfirmAddYoutubeVideo() {
	// Verifica se foi validado
	if (!youtubeAddPreviewState.validated || !youtubeAddPreviewState.videoId) {
		setYoutubeAddStatus('Por favor, faça o preview primeiro para validar o vídeo.', 'error');
		return;
	}
	
	const videoId = youtubeAddPreviewState.videoId;
	const customName = ui.youtubeNameInput.value.trim();
	const tag = ui.youtubeTagInput.value;
	
	// Para o preview
	stopYoutubeAddPreview();
	
	// Desabilitar botão enquanto processa
	ui.youtubeAddBtn.disabled = true;
	ui.youtubeAddBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Adicionando...';
	setYoutubeAddStatus('Salvando vídeo...', 'loading');
	
	try {
		// Gerar nome padrão se não foi fornecido
		const videoName = customName || `YouTube - ${videoId}`;
		
		// Criar objeto do vídeo
		const newVideo = {
			id: `user-youtube-${videoId}-${Date.now()}`,
			name: videoName,
			youtube: videoId,
			tag: tag,
			addedAt: Date.now(),
			userAdded: true
		};
		
		// Carregar e salvar na lista de vídeos do usuário
		const userYoutubeVideos = await stores.data.getItem('userYoutubeVideos') || [];
		userYoutubeVideos.push(newVideo);
		await stores.data.setItem('userYoutubeVideos', userYoutubeVideos);
		
		// Adicionar como favorito automaticamente
		const favorites = await loadFavorites();
		if (!favorites.includes(newVideo.id)) {
			favorites.push(newVideo.id);
			await saveFavorites(favorites);
		}
		
		// Atualizar playlist
		await PlaylistManager.render();
		
		// Limpar inputs e resetar formulário
		ui.youtubeUrlInput.value = '';
		ui.youtubeNameInput.value = '';
		resetYoutubeAddForm();
		
		setYoutubeAddStatus(`"${videoName}" adicionado à playlist e favoritado!`, 'success');
		showToast(`Vídeo "${videoName}" adicionado à playlist!`, 'success');
		
	} catch (error) {
		console.error('Erro ao adicionar vídeo do YouTube:', error);
		setYoutubeAddStatus('Erro ao adicionar vídeo. Tente novamente.', 'error');
		
		// Restaurar botão
		ui.youtubeAddBtn.disabled = false;
		ui.youtubeAddBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Adicionar à Playlist';
	}
}

/**
 * Remove um vídeo do YouTube adicionado pelo usuário
 * @param {string} videoId - ID do vídeo a remover
 */
async function removeUserYoutubeVideo(videoId) {
	try {
		// Carregar lista de vídeos do usuário
		const userYoutubeVideos = await stores.data.getItem('userYoutubeVideos') || [];
		
		// Encontrar o vídeo
		const video = userYoutubeVideos.find(v => v.id === videoId);
		if (!video) {
			showToast('Vídeo não encontrado.', 'error');
			return;
		}
		
		// Confirmar remoção
		if (!confirm(`Remover "${video.name}" da playlist?`)) {
			return;
		}
		
		// Remover da lista
		const updatedVideos = userYoutubeVideos.filter(v => v.id !== videoId);
		await stores.data.setItem('userYoutubeVideos', updatedVideos);
		
		// Remover dos favoritos se estiver
		const favorites = await loadFavorites();
		const updatedFavorites = favorites.filter(id => id !== videoId);
		if (updatedFavorites.length !== favorites.length) {
			await saveFavorites(updatedFavorites);
		}
		
		// Remover da seleção se estiver selecionado
		if (state.selectedPlaylist?.includes(videoId)) {
			state.selectedPlaylist = state.selectedPlaylist.filter(id => id !== videoId);
			await stores.data.setItem(STORAGE_KEYS.SELECTED_PLAYLIST, state.selectedPlaylist);
		}
		
		// Atualizar playlist
		await PlaylistManager.render();
		
		showToast(`"${video.name}" removido da playlist.`, 'success');
	} catch (error) {
		console.error('Erro ao remover vídeo:', error);
		showToast('Erro ao remover vídeo.', 'error');
	}
}

// ==========================================
// Centro de Controle Terapêutico - Funções
// ==========================================

let breathingInterval = null;
let totalSessionSeconds = 0;

function updateSessionUI(isActive, isPaused = false) {
	// Status da sessão
	ui.sessionStatus.classList.remove('active', 'paused');
	ui.sessionStatus.querySelector('.status-text').textContent = isActive 
		? (isPaused ? 'Sessão pausada' : 'Sessão ativa')
		: 'Aguardando sessão';
	
	if (isActive) {
		ui.sessionStatus.classList.add(isPaused ? 'paused' : 'active');
	}
	
	// Visualizador
	if (ui.sessionVisualizer) ui.sessionVisualizer.classList.toggle('active', isActive && !isPaused);
	if (ui.wavePulse) ui.wavePulse.classList.toggle('active', isActive && !isPaused);
	if (ui.breathCircle) ui.breathCircle.classList.toggle('active', isActive && !isPaused);
}

function updateFrequencyDisplay(diffHz) {
	const freqValue = ui.frequencyDisplay?.querySelector('.freq-value');
	if (freqValue) {
		freqValue.textContent = diffHz;
		
		// Atualizar cor baseado na banda
		const band = describeDiffBand(diffHz);
		const colors = {
			'Delta profundo': '#6366f1',
			'Teta introspectiva': '#8b5cf6',
			'Alfa relax': '#22c55e',
			'Sigma regenerativo': '#eab308',
			'Beta foco': '#f97316',
			'Gama integração': '#ef4444'
		};
		freqValue.style.color = colors[band.label] || 'var(--color-accent)';
	}
	
	// Ajustar velocidade da animação de onda baseado na frequência
	const animDuration = Math.max(2, 12 - diffHz * 0.25);
	if (ui.wavePulse) ui.wavePulse.style.animationDuration = `${animDuration}s`;
	
	// Atualizar displays de frequência
	updateFrequencyDisplays();
}

function startBreathingGuide(diffHz) {
	stopBreathingGuide();
	
	// Ciclo de respiração baseado na frequência
	// Delta/Teta: respiração mais lenta (8-10s ciclo)
	// Alfa: moderada (6-8s)
	// Beta/Gama: mais rápida (4-6s)
	let cycleDuration;
	if (diffHz <= 4) {
		cycleDuration = 10000; // Delta
	} else if (diffHz <= 8) {
		cycleDuration = 8000; // Teta
	} else if (diffHz <= 12) {
		cycleDuration = 7000; // Alfa
	} else if (diffHz <= 16) {
		cycleDuration = 6000; // Sigma
	} else {
		cycleDuration = 5000; // Beta/Gama
	}
	
	const halfCycle = cycleDuration / 2;
	
	// Ajustar animação CSS (se elemento existir)
	if (ui.breathCircle) {
		ui.breathCircle.style.animationDuration = `${cycleDuration}ms`;
	}
	
	let isInhale = true;
	
	function updateBreath() {
		if (ui.breathCircle) {
			ui.breathCircle.classList.remove('inhale', 'exhale');
			ui.breathCircle.classList.add(isInhale ? 'inhale' : 'exhale');
		}
		if (ui.breathText) {
			ui.breathText.textContent = isInhale ? 'Inspire' : 'Expire';
		}
		isInhale = !isInhale;
	}
	
	updateBreath();
	breathingInterval = setInterval(updateBreath, halfCycle);
}

function stopBreathingGuide() {
	if (breathingInterval) {
		clearInterval(breathingInterval);
		breathingInterval = null;
	}
	if (ui.breathCircle) {
		ui.breathCircle.classList.remove('inhale', 'exhale', 'active');
	}
	if (ui.breathText) {
		ui.breathText.textContent = 'Inspire';
	}
}

// Utilitário para obter classe CSS da banda cerebral
function getBandClass(diffHz) {
	if (diffHz <= 4) return 'delta';
	if (diffHz <= 8) return 'teta';
	if (diffHz <= 12) return 'alfa';
	if (diffHz <= 16) return 'sigma';
	if (diffHz <= 22) return 'beta';
	return 'gama';
}

// =====================================================
// TICKER DE DICAS CIENTÍFICAS
// =====================================================

const SCIENTIFIC_TIPS = [
	{
		text: "40 Hz é a frequência mais estudada para alívio da dor e fibromialgia",
		source: "Kantor et al., 2022 - Scoping Review"
	},
	{
		text: "Sessões de 20-45 minutos mostram melhores resultados terapêuticos",
		source: "Naghdi et al., 2015"
	},
	{
		text: "81% de redução na dor foi observada com terapia vibroacústica a 40 Hz",
		source: "Naghdi et al., 2015 - FIQ Score"
	},
	{
		text: "90% de melhoria na qualidade do sono em pacientes com fibromialgia",
		source: "Naghdi et al., 2015 - JSS Score"
	},
	{
		text: "Batimentos binaurais podem sincronizar ondas cerebrais entre hemisférios",
		source: "Oster, 1973 - Scientific American"
	},
	{
		text: "Frequências de 30-120 Hz são ideais para terapia vibroacústica",
		source: "Skille, 1989 - Manual of VAT"
	},
	{
		text: "Frequências theta (4-8 Hz) auxiliam na meditação profunda e relaxamento",
		source: "Boyd-Brewer & McCaffrey, 2004"
	},
	{
		text: "Ondas delta (0.5-4 Hz) estão associadas ao sono profundo reparador",
		source: "Neurociência do Sono"
	},
	{
		text: "Frequências alfa (8-14 Hz) promovem estado de calma e atenção relaxada",
		source: "Pesquisa em Neurofeedback"
	},
	{
		text: "Use fones de ouvido estéreo para experimentar o efeito binaural completo",
		source: "Requisito técnico essencial"
	},
	{
		text: "A frequência base ideal fica entre 100-300 Hz para percepção ideal",
		source: "Psicoacústica aplicada"
	},
	{
		text: "Consistência é chave: sessões regulares de 10+ vezes mostram mais benefícios",
		source: "Naghdi et al., 2015"
	},
	{
		text: "Olaf Skille desenvolveu a terapia vibroacústica em 1982 na Noruega",
		source: "História da VAT"
	},
	{
		text: "Volume moderado (50-70%) é recomendado para evitar fadiga auditiva",
		source: "Boas práticas clínicas"
	}
];

let tickerState = {
	currentIndex: 0,
	intervalId: null,
	isPaused: false,
	INTERVAL_MS: 8000 // 8 segundos por dica
};

function initScientificTicker() {
	if (!ui.tickerText) return;
	
	// Mostrar primeira dica
	showTip(0);
	
	// Iniciar rotação automática
	startTickerInterval();
	
	// Event listeners (apenas se não foram adicionados ainda)
	// Os listeners são gerenciados aqui para evitar duplicação
}

function showTip(index) {
	if (!ui.tickerText) return;
	
	const tip = SCIENTIFIC_TIPS[index];
	
	// Animação de saída
	ui.tickerText.classList.add('fade-out');
	
	setTimeout(() => {
		ui.tickerText.innerHTML = `${tip.text} <em style="opacity: 0.7; font-size: 0.85em;">— ${tip.source}</em>`;
		ui.tickerText.classList.remove('fade-out');
	}, 300);
	
	tickerState.currentIndex = index;
}

function showNextTip() {
	const nextIndex = (tickerState.currentIndex + 1) % SCIENTIFIC_TIPS.length;
	showTip(nextIndex);
}

function showPreviousTip() {
	const prevIndex = (tickerState.currentIndex - 1 + SCIENTIFIC_TIPS.length) % SCIENTIFIC_TIPS.length;
	showTip(prevIndex);
}

function startTickerInterval() {
	if (tickerState.intervalId) return;
	
	tickerState.intervalId = setInterval(() => {
		if (!tickerState.isPaused) {
			showNextTip();
		}
	}, tickerState.INTERVAL_MS);
}

function stopTickerInterval() {
	if (tickerState.intervalId) {
		clearInterval(tickerState.intervalId);
		tickerState.intervalId = null;
	}
}

function resetTickerInterval() {
	stopTickerInterval();
	if (!tickerState.isPaused) {
		startTickerInterval();
	}
}

function toggleTickerPause() {
	tickerState.isPaused = !tickerState.isPaused;
	
	if (ui.tickerPauseIcon) {
		if (tickerState.isPaused) {
			ui.tickerPauseIcon.classList.remove('fa-pause');
			ui.tickerPauseIcon.classList.add('fa-play');
			ui.tickerPause.setAttribute('aria-label', 'Continuar rotação');
			ui.tickerPause.setAttribute('title', 'Continuar');
		} else {
			ui.tickerPauseIcon.classList.remove('fa-play');
			ui.tickerPauseIcon.classList.add('fa-pause');
			ui.tickerPause.setAttribute('aria-label', 'Pausar rotação');
			ui.tickerPause.setAttribute('title', 'Pausar');
		}
	}
}

// =============================================================================
// SISTEMA DE PACIENTES E ANAMNESE
// =============================================================================

// Estado do formulário de paciente em edição
let editingPatientId = null;
let currentStep = 0;
const TOTAL_STEPS = 9;

/**
 * Carrega pacientes do IndexedDB
 */
async function hydratePatients() {
	try {
		const patients = await stores.patients.getItem(STORAGE_KEYS.PATIENTS);
		state.patients = Array.isArray(patients) ? patients : [];
		
		const currentPatientId = await stores.patients.getItem(STORAGE_KEYS.CURRENT_PATIENT);
		if (currentPatientId) {
			state.currentPatient = state.patients.find(p => p.id === currentPatientId) || null;
		}
		
		console.log(`Pacientes carregados: ${state.patients.length}`);
	} catch (error) {
		console.error('Erro ao carregar pacientes:', error);
		state.patients = [];
		state.currentPatient = null;
	}
}

/**
 * Salva lista de pacientes no IndexedDB
 */
async function persistPatients() {
	try {
		await stores.patients.setItem(STORAGE_KEYS.PATIENTS, state.patients);
	} catch (error) {
		console.error('Erro ao salvar pacientes:', error);
	}
}

/**
 * Salva paciente atual no IndexedDB
 */
async function persistCurrentPatient() {
	try {
		const patientId = state.currentPatient ? state.currentPatient.id : null;
		await stores.patients.setItem(STORAGE_KEYS.CURRENT_PATIENT, patientId);
	} catch (error) {
		console.error('Erro ao salvar paciente atual:', error);
	}
}

/**
 * Atualiza a barra de paciente atual
 */
function updatePatientBar() {
	if (!ui.currentPatientName) return;
	
	if (state.currentPatient) {
		const name = state.currentPatient.identification?.preferredName || 
					 state.currentPatient.identification?.fullName || 
					 'Paciente sem nome';
		ui.currentPatientName.textContent = name;
		ui.currentPatientName.classList.remove('empty');
		if (ui.patientBar) ui.patientBar.classList.add('has-patient');
	} else {
		ui.currentPatientName.textContent = 'Nenhum paciente selecionado';
		ui.currentPatientName.classList.add('empty');
		if (ui.patientBar) ui.patientBar.classList.remove('has-patient');
	}
}

/**
 * Abre modal de cadastro/edição de paciente
 */
function openPatientModal(patient = null) {
	if (!ui.patientModal) return;
	
	editingPatientId = patient ? patient.id : null;
	currentStep = 0;
	
	if (ui.patientModalTitle) {
		const icon = ui.patientModalTitle.querySelector('i');
		ui.patientModalTitle.innerHTML = '';
		if (icon) ui.patientModalTitle.appendChild(icon);
		ui.patientModalTitle.appendChild(document.createTextNode(patient ? ' Editar Paciente' : ' Cadastro e Anamnese'));
	}
	
	// Reseta para primeiro step
	goToStep(0);
	
	// Preenche formulário
	if (patient) {
		populatePatientForm(patient);
	} else {
		clearPatientForm();
	}
	
	ui.patientModal.classList.remove('hidden');
	document.body.style.overflow = 'hidden';
}

/**
 * Fecha modal de paciente
 */
function closePatientModal() {
	if (!ui.patientModal) return;
	ui.patientModal.classList.add('hidden');
	document.body.style.overflow = '';
	editingPatientId = null;
	currentStep = 0;
}

/**
 * Abre modal de lista de pacientes
 */
function openPatientsListModal() {
	if (!ui.patientsListModal) return;
	renderPatientsList(state.patients);
	if (ui.patientsSearchInput) ui.patientsSearchInput.value = '';
	ui.patientsListModal.classList.remove('hidden');
	document.body.style.overflow = 'hidden';
}

/**
 * Fecha modal de lista de pacientes
 */
function closePatientsListModal() {
	if (!ui.patientsListModal) return;
	ui.patientsListModal.classList.add('hidden');
	document.body.style.overflow = '';
}

/**
 * Navega para um step específico
 */
function goToStep(stepIndex) {
	if (stepIndex < 0 || stepIndex >= TOTAL_STEPS) return;
	
	currentStep = stepIndex;
	
	// Atualiza botões de navegação nos steps
	document.querySelectorAll('.anamnesis-steps .step').forEach((btn, index) => {
		btn.classList.toggle('active', index === stepIndex);
	});
	
	// Atualiza fieldsets visíveis
	document.querySelectorAll('.anamnesis-step').forEach((step, index) => {
		step.classList.toggle('active', index === stepIndex);
	});
	
	// Atualiza indicador de step
	if (ui.stepIndicator) {
		ui.stepIndicator.textContent = `${stepIndex + 1} de ${TOTAL_STEPS}`;
	}
	
	// Atualiza estado dos botões prev/next
	if (ui.prevStepBtn) {
		ui.prevStepBtn.disabled = stepIndex === 0;
	}
	
	if (ui.nextStepBtn && ui.savePatientBtn) {
		const isLastStep = stepIndex === TOTAL_STEPS - 1;
		ui.nextStepBtn.classList.toggle('hidden', isLastStep);
		ui.savePatientBtn.classList.toggle('hidden', !isLastStep);
	}
	
	// Scroll para o topo do formulário
	const formContainer = ui.patientForm?.closest('.modal-content');
	if (formContainer) {
		formContainer.scrollTop = 0;
	}
}

/**
 * Vai para o próximo step
 */
function goToNextStep() {
	if (currentStep < TOTAL_STEPS - 1) {
		goToStep(currentStep + 1);
	}
}

/**
 * Volta para o step anterior
 */
function goToPreviousStep() {
	if (currentStep > 0) {
		goToStep(currentStep - 1);
	}
}

/**
 * Manipula clique na navegação de steps
 */
function handleStepNavClick(e) {
	const stepBtn = e.target.closest('.step');
	if (!stepBtn) return;
	
	const stepIndex = parseInt(stepBtn.dataset.step, 10);
	if (!isNaN(stepIndex)) {
		goToStep(stepIndex);
	}
}

/**
 * Renderiza lista de pacientes
 */
function renderPatientsList(patients) {
	if (!ui.patientsList) return;
	
	if (!patients || patients.length === 0) {
		ui.patientsList.innerHTML = `
			<div class="patients-list__empty">
				<i class="fas fa-user-slash"></i>
				<p>Nenhum paciente cadastrado</p>
			</div>
		`;
		return;
	}
	
	const html = patients.map(patient => {
		const name = patient.identification?.fullName || 'Sem nome';
		const preferredName = patient.identification?.preferredName;
		const age = calculateAge(patient.identification?.birthDate);
		const gender = patient.identification?.gender || '';
		const isSelected = state.currentPatient?.id === patient.id;
		
		return `
			<div class="patient-item ${isSelected ? 'selected' : ''}" data-id="${patient.id}">
				<div class="patient-item__avatar">
					<i class="fas fa-user"></i>
				</div>
				<div class="patient-item__info">
					<div class="patient-item__name">${name}${preferredName ? ` (${preferredName})` : ''}</div>
					<div class="patient-item__meta">
						${age ? `<span><i class="fas fa-birthday-cake"></i> ${age} anos</span>` : ''}
						${gender ? `<span><i class="fas fa-venus-mars"></i> ${gender}</span>` : ''}
						<span><i class="fas fa-calendar"></i> ${formatDate(patient.createdAt)}</span>
					</div>
				</div>
				<div class="patient-item__actions">
					<button class="patient-item__btn patient-item__btn--select" data-action="select" title="Selecionar">
						<i class="fas fa-check"></i>
					</button>
					<button class="patient-item__btn" data-action="edit" title="Editar">
						<i class="fas fa-edit"></i>
					</button>
					<button class="patient-item__btn patient-item__btn--delete" data-action="delete" title="Excluir">
						<i class="fas fa-trash"></i>
					</button>
				</div>
			</div>
		`;
	}).join('');
	
	ui.patientsList.innerHTML = html;
}

/**
 * Calcula idade a partir da data de nascimento
 */
function calculateAge(birthDate) {
	if (!birthDate) return null;
	const birth = new Date(birthDate);
	const today = new Date();
	let age = today.getFullYear() - birth.getFullYear();
	const monthDiff = today.getMonth() - birth.getMonth();
	if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
		age--;
	}
	return age > 0 ? age : null;
}

/**
 * Formata data para exibição
 */
function formatDate(isoString) {
	if (!isoString) return '';
	const date = new Date(isoString);
	return date.toLocaleDateString('pt-BR');
}

/**
 * Limpa formulário de paciente
 */
function clearPatientForm() {
	const form = ui.patientForm || document.getElementById('patientForm');
	if (!form) return;
	
	// Limpa todos os inputs de texto, textarea, select
	form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="date"], input[type="number"], textarea, select').forEach(input => {
		input.value = '';
	});
	
	// Desmarca checkboxes e radios
	form.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(input => {
		input.checked = false;
	});
	
	// Volta para primeiro step
	goToStep(0);
}

/**
 * Define valor em um campo pelo atributo name
 */
function setFormFieldByName(form, name, value) {
	if (value === undefined || value === null) return;
	
	const field = form.querySelector(`[name="${name}"]`);
	if (!field) return;
	
	if (field.type === 'checkbox') {
		field.checked = !!value;
	} else if (field.type === 'radio') {
		const radio = form.querySelector(`[name="${name}"][value="${value}"]`);
		if (radio) radio.checked = true;
	} else {
		field.value = Array.isArray(value) ? value.join(', ') : value;
	}
}

/**
 * Obtém valor de um campo pelo atributo name
 */
function getFormFieldByName(form, name) {
	const field = form.querySelector(`[name="${name}"]`);
	if (!field) return '';
	
	if (field.type === 'checkbox') {
		return field.checked;
	} else if (field.type === 'radio') {
		const checked = form.querySelector(`[name="${name}"]:checked`);
		return checked ? checked.value : '';
	} else if (field.type === 'number') {
		return field.value ? Number(field.value) : null;
	}
	return field.value.trim();
}

/**
 * Obtém valores de checkboxes marcados
 */
function getCheckedCheckboxes(form, name) {
	return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`))
		.map(input => input.value);
}

/**
 * Popula formulário com dados do paciente
 */
function populatePatientForm(patient) {
	clearPatientForm();
	if (!patient) return;
	
	const form = ui.patientForm || document.getElementById('patientForm');
	if (!form) return;
	
	// Helper para popular usando path do objeto
	const setByPath = (path, obj) => {
		const value = path.split('.').reduce((o, k) => o?.[k], obj);
		if (value !== undefined && value !== null) {
			setFormFieldByName(form, path, value);
		}
	};
	
	// Identificação
	setByPath('identification.fullName', patient);
	setByPath('identification.preferredName', patient);
	setByPath('identification.birthDate', patient);
	setByPath('identification.gender', patient);
	setByPath('identification.cpf', patient);
	setByPath('identification.phone', patient);
	setByPath('identification.email', patient);
	setByPath('identification.occupation', patient);
	setByPath('identification.maritalStatus', patient);
	setByPath('identification.referralSource', patient);
	setByPath('identification.address', patient);
	setByPath('identification.city', patient);
	setByPath('identification.state', patient);
	setByPath('identification.emergencyContact', patient);
	setByPath('identification.emergencyPhone', patient);
	
	// Queixa Principal
	setByPath('chiefComplaint.mainComplaint', patient);
	setByPath('chiefComplaint.complaintDuration', patient);
	setByPath('chiefComplaint.painIntensity', patient);
	setByPath('chiefComplaint.functionalImpact', patient);
	
	// Checkboxes de tipos de dor
	if (patient.chiefComplaint?.painType) {
		patient.chiefComplaint.painType.forEach(type => {
			const checkbox = form.querySelector(`input[name="chiefComplaint.painType"][value="${type}"]`);
			if (checkbox) checkbox.checked = true;
		});
	}
	
	// Checkboxes de localização da dor
	if (patient.chiefComplaint?.painLocation) {
		patient.chiefComplaint.painLocation.forEach(location => {
			const checkbox = form.querySelector(`input[name="chiefComplaint.painLocation"][value="${location}"]`);
			if (checkbox) checkbox.checked = true;
		});
	}
	
	// História da Doença Atual
	setByPath('currentIllnessHistory.symptomEvolution', patient);
	setByPath('currentIllnessHistory.aggravatingFactors', patient);
	setByPath('currentIllnessHistory.relievingFactors', patient);
	setByPath('currentIllnessHistory.previousTreatments', patient);
	setByPath('currentIllnessHistory.treatmentResults', patient);
	setByPath('currentIllnessHistory.sleepImpact', patient);
	setByPath('currentIllnessHistory.workImpact', patient);
	setByPath('currentIllnessHistory.moodImpact', patient);
	
	// Histórico Médico
	if (patient.medicalHistory?.previousDiseases) {
		setFormFieldByName(form, 'medicalHistory.previousDiseases', patient.medicalHistory.previousDiseases.join(', '));
	}
	if (patient.medicalHistory?.surgeries) {
		setFormFieldByName(form, 'medicalHistory.surgeries', patient.medicalHistory.surgeries.join(', '));
	}
	if (patient.medicalHistory?.allergies) {
		setFormFieldByName(form, 'medicalHistory.allergies', patient.medicalHistory.allergies.join(', '));
	}
	if (patient.medicalHistory?.currentMedications) {
		setFormFieldByName(form, 'medicalHistory.currentMedications', patient.medicalHistory.currentMedications.join(', '));
	}
	
	// Contraindicações
	if (patient.medicalHistory?.contraindications) {
		const ci = patient.medicalHistory.contraindications;
		setFormFieldByName(form, 'medicalHistory.contraindications.epilepsy', ci.epilepsy);
		setFormFieldByName(form, 'medicalHistory.contraindications.pacemaker', ci.pacemaker);
		setFormFieldByName(form, 'medicalHistory.contraindications.pregnancy', ci.pregnancy);
		setFormFieldByName(form, 'medicalHistory.contraindications.thrombosis', ci.thrombosis);
		setFormFieldByName(form, 'medicalHistory.contraindications.recentSurgery', ci.recentSurgery);
		setFormFieldByName(form, 'medicalHistory.contraindications.vibrationHypersensitivity', ci.vibrationHypersensitivity);
		setFormFieldByName(form, 'medicalHistory.contraindications.severeHearingLoss', ci.severeHearingLoss);
		setFormFieldByName(form, 'medicalHistory.contraindications.psychoticDisorders', ci.psychoticDisorders);
		setFormFieldByName(form, 'medicalHistory.contraindications.other', ci.other);
	}
	
	// História Familiar - checkboxes
	if (patient.familyHistory) {
		const fh = patient.familyHistory;
		setFormFieldByName(form, 'familyHistory.cardiovascular', fh.cardiovascular);
		setFormFieldByName(form, 'familyHistory.psychiatric', fh.psychiatric);
		setFormFieldByName(form, 'familyHistory.neurological', fh.neurological);
		setFormFieldByName(form, 'familyHistory.chronicPain', fh.chronicPain);
		setFormFieldByName(form, 'familyHistory.diabetes', fh.diabetes);
		setFormFieldByName(form, 'familyHistory.hypertension', fh.hypertension);
		setFormFieldByName(form, 'familyHistory.cancer', fh.cancer);
		setFormFieldByName(form, 'familyHistory.autoimmune', fh.autoimmune);
		setFormFieldByName(form, 'familyHistory.observations', fh.observations);
	}
	
	// Estilo de Vida
	setByPath('lifestyle.sleepQuality', patient);
	setByPath('lifestyle.sleepHours', patient);
	setByPath('lifestyle.sleepDifficulties', patient);
	setByPath('lifestyle.physicalActivity', patient);
	setByPath('lifestyle.physicalActivityFrequency', patient);
	setByPath('lifestyle.smokingStatus', patient);
	setByPath('lifestyle.alcoholUse', patient);
	setByPath('lifestyle.caffeineUse', patient);
	setByPath('lifestyle.stressLevel', patient);
	setByPath('lifestyle.workRoutine', patient);
	setByPath('lifestyle.leisureActivities', patient);
	setByPath('lifestyle.socialSupport', patient);
	
	// Aspectos Psicossociais
	setByPath('psychosocial.currentMood', patient);
	setByPath('psychosocial.anxietyLevel', patient);
	setByPath('psychosocial.depressionSymptoms', patient);
	setByPath('psychosocial.recentLifeEvents', patient);
	setByPath('psychosocial.copingStrategies', patient);
	setByPath('psychosocial.treatmentExpectations', patient);
	setByPath('psychosocial.motivationLevel', patient);
	setByPath('psychosocial.previousPsychotherapy', patient);
	setByPath('psychosocial.currentPsychotherapy', patient);
	setByPath('psychosocial.supportNetwork', patient);
	
	// Perfil Musicoterapêutico
	setByPath('musicTherapyProfile.musicalBackground', patient);
	setByPath('musicTherapyProfile.playsInstrument', patient);
	setByPath('musicTherapyProfile.instruments', patient);
	setByPath('musicTherapyProfile.singingExperience', patient);
	setByPath('musicTherapyProfile.soundSensitivity', patient);
	setByPath('musicTherapyProfile.frequencyPreference', patient);
	setByPath('musicTherapyProfile.vibrationExperience', patient);
	setByPath('musicTherapyProfile.vibrationTolerance', patient);
	setByPath('musicTherapyProfile.tinnitus', patient);
	setByPath('musicTherapyProfile.tinnitusDetails', patient);
	setByPath('musicTherapyProfile.previousMusicTherapy', patient);
	setByPath('musicTherapyProfile.previousMusicTherapyDetails', patient);
	setByPath('musicTherapyProfile.previousVibroacoustic', patient);
	setByPath('musicTherapyProfile.previousVibroacousticDetails', patient);
	setByPath('musicTherapyProfile.musicForRelaxation', patient);
	setByPath('musicTherapyProfile.musicForEnergy', patient);
	setByPath('musicTherapyProfile.preferredArtists', patient);
	
	// Gêneros preferidos
	if (patient.musicTherapyProfile?.preferredGenres) {
		patient.musicTherapyProfile.preferredGenres.forEach(genre => {
			const checkbox = form.querySelector(`input[name="musicTherapyProfile.preferredGenres"][value="${genre}"]`);
			if (checkbox) checkbox.checked = true;
		});
	}
	
	// Objetivos terapêuticos
	if (patient.musicTherapyProfile?.therapeuticGoals) {
		patient.musicTherapyProfile.therapeuticGoals.forEach(goal => {
			const checkbox = form.querySelector(`input[name="musicTherapyProfile.therapeuticGoals"][value="${goal}"]`);
			if (checkbox) checkbox.checked = true;
		});
	}
	
	// Avaliação Física
	setByPath('physicalAssessment.bloodPressure', patient);
	setByPath('physicalAssessment.heartRate', patient);
	setByPath('physicalAssessment.respiratoryRate', patient);
	setByPath('physicalAssessment.oxygenSaturation', patient);
	setByPath('physicalAssessment.weight', patient);
	setByPath('physicalAssessment.height', patient);
	setByPath('physicalAssessment.posturalObservations', patient);
	setByPath('physicalAssessment.mobilityObservations', patient);
	setByPath('physicalAssessment.painPointsMap', patient);
	setByPath('physicalAssessment.muscularTensionAreas', patient);
	
	// Plano Terapêutico
	setByPath('therapeuticPlan.clinicalSummary', patient);
	setByPath('therapeuticPlan.mainHypothesis', patient);
	if (patient.therapeuticPlan?.therapeuticObjectives) {
		setFormFieldByName(form, 'therapeuticPlan.therapeuticObjectives', patient.therapeuticPlan.therapeuticObjectives.join(', '));
	}
	if (patient.therapeuticPlan?.recommendedProtocols) {
		setFormFieldByName(form, 'therapeuticPlan.recommendedProtocols', patient.therapeuticPlan.recommendedProtocols.join(', '));
	}
	setByPath('therapeuticPlan.sessionFrequency', patient);
	setByPath('therapeuticPlan.estimatedDuration', patient);
	setByPath('therapeuticPlan.precautions', patient);
	setByPath('therapeuticPlan.observations', patient);
	setByPath('therapeuticPlan.consentObtained', patient);
	setByPath('therapeuticPlan.consentDate', patient);
}

/**
 * Coleta dados do formulário de paciente
 */
function collectPatientFormData() {
	const form = ui.patientForm || document.getElementById('patientForm');
	if (!form) return createEmptyPatient();
	
	const splitToArray = (value) => {
		if (!value) return [];
		return value.split(',').map(s => s.trim()).filter(s => s);
	};
	
	const patient = createEmptyPatient();
	
	// Mantém ID se estiver editando
	if (editingPatientId) {
		patient.id = editingPatientId;
		const existing = state.patients.find(p => p.id === editingPatientId);
		if (existing) {
			patient.createdAt = existing.createdAt;
			patient.sessions = existing.sessions || [];
		}
	}
	
	patient.updatedAt = new Date().toISOString();
	
	// Identificação
	patient.identification = {
		fullName: getFormFieldByName(form, 'identification.fullName'),
		preferredName: getFormFieldByName(form, 'identification.preferredName'),
		birthDate: getFormFieldByName(form, 'identification.birthDate'),
		age: calculateAge(getFormFieldByName(form, 'identification.birthDate')),
		gender: getFormFieldByName(form, 'identification.gender'),
		cpf: getFormFieldByName(form, 'identification.cpf'),
		phone: getFormFieldByName(form, 'identification.phone'),
		email: getFormFieldByName(form, 'identification.email'),
		address: getFormFieldByName(form, 'identification.address'),
		city: getFormFieldByName(form, 'identification.city'),
		state: getFormFieldByName(form, 'identification.state'),
		occupation: getFormFieldByName(form, 'identification.occupation'),
		maritalStatus: getFormFieldByName(form, 'identification.maritalStatus'),
		referralSource: getFormFieldByName(form, 'identification.referralSource'),
		emergencyContact: getFormFieldByName(form, 'identification.emergencyContact'),
		emergencyPhone: getFormFieldByName(form, 'identification.emergencyPhone')
	};
	
	// Queixa Principal
	patient.chiefComplaint = {
		mainComplaint: getFormFieldByName(form, 'chiefComplaint.mainComplaint'),
		complaintDuration: getFormFieldByName(form, 'chiefComplaint.complaintDuration'),
		painIntensity: getFormFieldByName(form, 'chiefComplaint.painIntensity'),
		painType: getCheckedCheckboxes(form, 'chiefComplaint.painType'),
		painLocation: getCheckedCheckboxes(form, 'chiefComplaint.painLocation'),
		functionalImpact: getFormFieldByName(form, 'chiefComplaint.functionalImpact')
	};
	
	// História da Doença Atual
	patient.currentIllnessHistory = {
		symptomEvolution: getFormFieldByName(form, 'currentIllnessHistory.symptomEvolution'),
		aggravatingFactors: getFormFieldByName(form, 'currentIllnessHistory.aggravatingFactors'),
		relievingFactors: getFormFieldByName(form, 'currentIllnessHistory.relievingFactors'),
		previousTreatments: getFormFieldByName(form, 'currentIllnessHistory.previousTreatments'),
		treatmentResults: getFormFieldByName(form, 'currentIllnessHistory.treatmentResults'),
		sleepImpact: getFormFieldByName(form, 'currentIllnessHistory.sleepImpact'),
		workImpact: getFormFieldByName(form, 'currentIllnessHistory.workImpact'),
		moodImpact: getFormFieldByName(form, 'currentIllnessHistory.moodImpact')
	};
	
	// Histórico Médico
	patient.medicalHistory = {
		previousDiseases: splitToArray(getFormFieldByName(form, 'medicalHistory.previousDiseases')),
		surgeries: splitToArray(getFormFieldByName(form, 'medicalHistory.surgeries')),
		allergies: splitToArray(getFormFieldByName(form, 'medicalHistory.allergies')),
		currentMedications: splitToArray(getFormFieldByName(form, 'medicalHistory.currentMedications')),
		contraindications: {
			epilepsy: getFormFieldByName(form, 'medicalHistory.contraindications.epilepsy'),
			pacemaker: getFormFieldByName(form, 'medicalHistory.contraindications.pacemaker'),
			pregnancy: getFormFieldByName(form, 'medicalHistory.contraindications.pregnancy'),
			thrombosis: getFormFieldByName(form, 'medicalHistory.contraindications.thrombosis'),
			recentSurgery: getFormFieldByName(form, 'medicalHistory.contraindications.recentSurgery'),
			vibrationHypersensitivity: getFormFieldByName(form, 'medicalHistory.contraindications.vibrationHypersensitivity'),
			severeHearingLoss: getFormFieldByName(form, 'medicalHistory.contraindications.severeHearingLoss'),
			psychoticDisorders: getFormFieldByName(form, 'medicalHistory.contraindications.psychoticDisorders'),
			other: getFormFieldByName(form, 'medicalHistory.contraindications.other')
		}
	};
	
	// História Familiar
	patient.familyHistory = {
		cardiovascular: getFormFieldByName(form, 'familyHistory.cardiovascular'),
		psychiatric: getFormFieldByName(form, 'familyHistory.psychiatric'),
		neurological: getFormFieldByName(form, 'familyHistory.neurological'),
		chronicPain: getFormFieldByName(form, 'familyHistory.chronicPain'),
		diabetes: getFormFieldByName(form, 'familyHistory.diabetes'),
		hypertension: getFormFieldByName(form, 'familyHistory.hypertension'),
		cancer: getFormFieldByName(form, 'familyHistory.cancer'),
		autoimmune: getFormFieldByName(form, 'familyHistory.autoimmune'),
		observations: getFormFieldByName(form, 'familyHistory.observations')
	};
	
	// Estilo de Vida
	patient.lifestyle = {
		sleepQuality: getFormFieldByName(form, 'lifestyle.sleepQuality'),
		sleepHours: getFormFieldByName(form, 'lifestyle.sleepHours'),
		sleepDifficulties: getFormFieldByName(form, 'lifestyle.sleepDifficulties'),
		physicalActivity: getFormFieldByName(form, 'lifestyle.physicalActivity'),
		physicalActivityFrequency: getFormFieldByName(form, 'lifestyle.physicalActivityFrequency'),
		smokingStatus: getFormFieldByName(form, 'lifestyle.smokingStatus'),
		alcoholUse: getFormFieldByName(form, 'lifestyle.alcoholUse'),
		caffeineUse: getFormFieldByName(form, 'lifestyle.caffeineUse'),
		stressLevel: getFormFieldByName(form, 'lifestyle.stressLevel'),
		workRoutine: getFormFieldByName(form, 'lifestyle.workRoutine'),
		leisureActivities: getFormFieldByName(form, 'lifestyle.leisureActivities'),
		socialSupport: getFormFieldByName(form, 'lifestyle.socialSupport')
	};
	
	// Aspectos Psicossociais
	patient.psychosocial = {
		currentMood: getFormFieldByName(form, 'psychosocial.currentMood'),
		anxietyLevel: getFormFieldByName(form, 'psychosocial.anxietyLevel'),
		depressionSymptoms: getFormFieldByName(form, 'psychosocial.depressionSymptoms'),
		recentLifeEvents: getFormFieldByName(form, 'psychosocial.recentLifeEvents'),
		copingStrategies: getFormFieldByName(form, 'psychosocial.copingStrategies'),
		treatmentExpectations: getFormFieldByName(form, 'psychosocial.treatmentExpectations'),
		motivationLevel: getFormFieldByName(form, 'psychosocial.motivationLevel'),
		previousPsychotherapy: getFormFieldByName(form, 'psychosocial.previousPsychotherapy'),
		currentPsychotherapy: getFormFieldByName(form, 'psychosocial.currentPsychotherapy'),
		supportNetwork: getFormFieldByName(form, 'psychosocial.supportNetwork')
	};
	
	// Perfil Musicoterapêutico
	patient.musicTherapyProfile = {
		musicalBackground: getFormFieldByName(form, 'musicTherapyProfile.musicalBackground'),
		playsInstrument: getFormFieldByName(form, 'musicTherapyProfile.playsInstrument'),
		instruments: getFormFieldByName(form, 'musicTherapyProfile.instruments'),
		singingExperience: getFormFieldByName(form, 'musicTherapyProfile.singingExperience'),
		soundSensitivity: getFormFieldByName(form, 'musicTherapyProfile.soundSensitivity'),
		frequencyPreference: getFormFieldByName(form, 'musicTherapyProfile.frequencyPreference'),
		vibrationExperience: getFormFieldByName(form, 'musicTherapyProfile.vibrationExperience'),
		vibrationTolerance: getFormFieldByName(form, 'musicTherapyProfile.vibrationTolerance'),
		tinnitus: getFormFieldByName(form, 'musicTherapyProfile.tinnitus'),
		tinnitusDetails: getFormFieldByName(form, 'musicTherapyProfile.tinnitusDetails'),
		previousMusicTherapy: getFormFieldByName(form, 'musicTherapyProfile.previousMusicTherapy'),
		previousMusicTherapyDetails: getFormFieldByName(form, 'musicTherapyProfile.previousMusicTherapyDetails'),
		previousVibroacoustic: getFormFieldByName(form, 'musicTherapyProfile.previousVibroacoustic'),
		previousVibroacousticDetails: getFormFieldByName(form, 'musicTherapyProfile.previousVibroacousticDetails'),
		musicForRelaxation: getFormFieldByName(form, 'musicTherapyProfile.musicForRelaxation'),
		musicForEnergy: getFormFieldByName(form, 'musicTherapyProfile.musicForEnergy'),
		preferredArtists: getFormFieldByName(form, 'musicTherapyProfile.preferredArtists'),
		preferredGenres: getCheckedCheckboxes(form, 'musicTherapyProfile.preferredGenres'),
		therapeuticGoals: getCheckedCheckboxes(form, 'musicTherapyProfile.therapeuticGoals')
	};
	
	// Avaliação Física
	patient.physicalAssessment = {
		bloodPressure: getFormFieldByName(form, 'physicalAssessment.bloodPressure'),
		heartRate: getFormFieldByName(form, 'physicalAssessment.heartRate'),
		respiratoryRate: getFormFieldByName(form, 'physicalAssessment.respiratoryRate'),
		oxygenSaturation: getFormFieldByName(form, 'physicalAssessment.oxygenSaturation'),
		weight: getFormFieldByName(form, 'physicalAssessment.weight'),
		height: getFormFieldByName(form, 'physicalAssessment.height'),
		posturalObservations: getFormFieldByName(form, 'physicalAssessment.posturalObservations'),
		mobilityObservations: getFormFieldByName(form, 'physicalAssessment.mobilityObservations'),
		painPointsMap: getFormFieldByName(form, 'physicalAssessment.painPointsMap'),
		muscularTensionAreas: getFormFieldByName(form, 'physicalAssessment.muscularTensionAreas')
	};
	
	// Plano Terapêutico
	patient.therapeuticPlan = {
		clinicalSummary: getFormFieldByName(form, 'therapeuticPlan.clinicalSummary'),
		mainHypothesis: getFormFieldByName(form, 'therapeuticPlan.mainHypothesis'),
		therapeuticObjectives: splitToArray(getFormFieldByName(form, 'therapeuticPlan.therapeuticObjectives')),
		recommendedProtocols: splitToArray(getFormFieldByName(form, 'therapeuticPlan.recommendedProtocols')),
		sessionFrequency: getFormFieldByName(form, 'therapeuticPlan.sessionFrequency'),
		estimatedDuration: getFormFieldByName(form, 'therapeuticPlan.estimatedDuration'),
		precautions: getFormFieldByName(form, 'therapeuticPlan.precautions'),
		observations: getFormFieldByName(form, 'therapeuticPlan.observations'),
		consentObtained: getFormFieldByName(form, 'therapeuticPlan.consentObtained'),
		consentDate: getFormFieldByName(form, 'therapeuticPlan.consentDate')
	};
	
	return patient;
}

/**
 * Salva paciente atual
 */
async function saveCurrentPatient() {
	const patient = collectPatientFormData();
	
	// Validação básica
	if (!patient.identification.fullName) {
		alert('Por favor, informe o nome completo do paciente.');
		goToStep(0);
		document.getElementById('pt_fullName')?.focus();
		return;
	}
	
	// Atualiza ou adiciona paciente
	if (editingPatientId) {
		const index = state.patients.findIndex(p => p.id === editingPatientId);
		if (index >= 0) {
			state.patients[index] = patient;
		}
	} else {
		state.patients.push(patient);
	}
	
	// Persiste no IndexedDB
	await persistPatients();
	
	// Se for novo paciente, seleciona automaticamente
	if (!editingPatientId) {
		state.currentPatient = patient;
		await persistCurrentPatient();
	} else if (state.currentPatient?.id === patient.id) {
		state.currentPatient = patient;
	}
	
	updatePatientBar();
	closePatientModal();
	
	console.log('Paciente salvo:', patient.identification.fullName);
}

/**
 * Seleciona paciente
 */
async function selectPatient(patientId) {
	const patient = state.patients.find(p => p.id === patientId);
	if (patient) {
		state.currentPatient = patient;
		await persistCurrentPatient();
		updatePatientBar();
		closePatientsListModal();
		console.log('Paciente selecionado:', patient.identification.fullName);
	}
}

/**
 * Exclui paciente
 */
async function deletePatient(patientId) {
	const patient = state.patients.find(p => p.id === patientId);
	if (!patient) return;
	
	const name = patient.identification?.fullName || 'este paciente';
	if (!confirm(`Tem certeza que deseja excluir ${name}?\n\nEsta ação não pode ser desfeita.`)) {
		return;
	}
	
	state.patients = state.patients.filter(p => p.id !== patientId);
	await persistPatients();
	
	// Se era o paciente atual, limpa
	if (state.currentPatient?.id === patientId) {
		state.currentPatient = null;
		await persistCurrentPatient();
		updatePatientBar();
	}
	
	renderPatientsList(state.patients);
	console.log('Paciente excluído:', name);
}

/**
 * Importa pacientes de arquivo JSON
 * Suporta arquivos do Terra Vibro Sensory Musical e TerraMidi
 */
async function handleImportPatients(e) {
	const file = e.target.files?.[0];
	if (!file) return;
	
	try {
		const text = await file.text();
		const data = JSON.parse(text);
		
		console.log('Importando arquivo:', file.name, data);
		
		// Detecta se é um arquivo TerraMidi (tem campo fullName nos pacientes, não "nome" ou "identification")
		const isTerraMidi = data.patients?.some(p => p.fullName && !p.identification);
		
		console.log('É arquivo TerraMidi:', isTerraMidi);
		
		if (isTerraMidi) {
			// Usa compatibilidade TerraMidi
			const terraMidiCompat = await import('./js/patients/terraMidiCompat.js');
			
			// Mostra resumo antes de importar
			const patientNames = data.patients?.map(p => p.fullName).filter(Boolean) || [];
			const summary = {
				version: data.version || 'unknown',
				exportedAt: data.exportedAt,
				exportedFrom: data.exportedFrom || 'TerraMidi',
				patientsCount: data.patients?.length || 0,
				patientNames: patientNames.slice(0, 10),
				hasMore: patientNames.length > 10
			};
			
			const confirmImport = window.confirm(
				`Importar prontuário do TerraMidi?\n\n` +
				`📋 ${summary.patientsCount} paciente(s) encontrado(s)\n` +
				`📅 Exportado em: ${new Date(summary.exportedAt).toLocaleDateString('pt-BR')}\n` +
				`📂 Origem: ${summary.exportedFrom}\n\n` +
				`Pacientes: ${summary.patientNames.join(', ')}${summary.hasMore ? '...' : ''}`
			);
			
			if (!confirmImport) {
				e.target.value = '';
				return;
			}
			
			// Importa usando os dados já parseados
			const result = await terraMidiCompat.importTerraMidiData(data);
			
			renderPatientsList(state.patients);
			
			let msg = `TerraMidi: `;
			if (result.imported > 0) msg += `${result.imported} novo(s), `;
			if (result.updated > 0) msg += `${result.updated} atualizado(s), `;
			if (result.skipped > 0) msg += `${result.skipped} ignorado(s)`;
			
			alert(msg.replace(/, $/, '') || 'Nenhum paciente importado.');
			
		} else {
			// Importação padrão Terra Vibro Sensory
			let imported = 0;
			
			// Suporta backup completo ou paciente único
			const patients = data.patients || (data.id ? [data] : []);
			
			for (const patient of patients) {
				if (patient.id && (patient.nome || patient.identification?.fullName)) {
					// Verifica se já existe
					const exists = state.patients.some(p => p.id === patient.id);
					if (!exists) {
						state.patients.push(patient);
						imported++;
					}
				}
			}
			
			if (imported > 0) {
				await persistPatients();
				renderPatientsList(state.patients);
				alert(`${imported} paciente(s) importado(s) com sucesso!`);
			} else {
				alert('Nenhum paciente novo encontrado para importar.');
			}
		}
		
	} catch (error) {
		console.error('Erro ao importar pacientes:', error);
		alert(`Erro ao importar arquivo: ${error.message}`);
	}
	
	// Limpa input para permitir reimportação
	e.target.value = '';
}

/**
 * Manipula busca de pacientes
 */
function handlePatientSearch(e) {
	const query = e.target.value.toLowerCase().trim();
	
	if (!query) {
		renderPatientsList(state.patients);
		return;
	}
	
	const filtered = state.patients.filter(patient => {
		const name = (patient.identification?.fullName || '').toLowerCase();
		const preferredName = (patient.identification?.preferredName || '').toLowerCase();
		const phone = (patient.identification?.phone || '').toLowerCase();
		const email = (patient.identification?.email || '').toLowerCase();
		
		return name.includes(query) || 
			   preferredName.includes(query) || 
			   phone.includes(query) || 
			   email.includes(query);
	});
	
	renderPatientsList(filtered);
}

/**
 * Manipula cliques na lista de pacientes
 */
function handlePatientsListClick(e) {
	const btn = e.target.closest('.patient-item__btn');
	if (btn) {
		const action = btn.dataset.action;
		const patientItem = btn.closest('.patient-item');
		const patientId = patientItem?.dataset.id;
		
		if (!patientId) return;
		
		if (action === 'select') {
			selectPatient(patientId);
		} else if (action === 'edit') {
			const patient = state.patients.find(p => p.id === patientId);
			if (patient) {
				closePatientsListModal();
				setTimeout(() => openPatientModal(patient), 100);
			}
		} else if (action === 'delete') {
			deletePatient(patientId);
		}
		return;
	}
	
	// Clique no item (não no botão) seleciona
	const patientItem = e.target.closest('.patient-item');
	if (patientItem) {
		selectPatient(patientItem.dataset.id);
	}
}

// =============================================================================
// MONITOR DE ÁUDIO - INTEGRADO NO VISUALIZADOR
// =============================================================================

/**
 * Abre o monitor de áudio (inicia análise)
 */
function openAudioMonitor() {
	// Garante que o contexto de áudio existe
	if (!state.audioCtx) {
		setupAudioGraph();
	}
	
	// Cria os analysers se ainda não existem
	if (!state.audioMonitor.analyserMaster) {
		setupAudioAnalysers();
	}
	
	state.audioMonitor.isOpen = true;
	
	// Marca início da sessão se não estiver rodando
	if (!state.audioMonitor.sessionStartTime) {
		state.audioMonitor.sessionStartTime = Date.now();
	}
	
	// Inicia a animação
	startAudioMonitorAnimation();
}

// ============================================================================
// AUDIO 8D E ENHANCER
// ============================================================================

/**
 * Estado do Audio 8D
 */
state.audio8D = {
	enabled: false,
	pannerNode: null,
	animationId: null,
	angle: 0,
	speed: 50,
	intensity: 80,
	pattern: 'circular'
};

/**
 * Estado do Enhancer
 */
state.enhancer = {
	enabled: false,
	preset: 'default',
	nodes: {}
};

/**
 * Toggle do Audio 8D
 */
function toggleAudio8D() {
	state.audio8D.enabled = !state.audio8D.enabled;
	
	// Atualiza UI
	if (ui.audio8DToggle) {
		ui.audio8DToggle.classList.toggle('active', state.audio8D.enabled);
		ui.audio8DToggle.setAttribute('aria-checked', state.audio8D.enabled);
	}
	if (ui.audio8dControls) {
		ui.audio8dControls.classList.toggle('active', state.audio8D.enabled);
	}
	
	if (state.audio8D.enabled) {
		// Aviso se estiver usando YouTube
		if (youtubePlayer && currentYoutubeId) {
			showToast('⚠️ Áudio 8D não funciona com vídeos do YouTube', 'warning');
		}
		initAudio8D();
		showToast('Áudio 8D ativado', 'success');
	} else {
		stopAudio8D();
		showToast('Áudio 8D desativado', 'info');
	}
}

/**
 * Inicializa o efeito Audio 8D
 * Usa o método stereo() do Howler.js para criar efeito de rotação espacial
 */
function initAudio8D() {
	console.log('Audio 8D: Iniciando...');
	
	// Reseta o ângulo
	state.audio8D.angle = 0;
	
	// Inicia animação do panning
	startAudio8DAnimation();
}

/**
 * Para o efeito Audio 8D
 */
function stopAudio8D() {
	console.log('Audio 8D: Parando...');
	
	// Para a animação (usa clearInterval pois mudamos para setInterval)
	if (state.audio8D.animationId) {
		clearInterval(state.audio8D.animationId);
		state.audio8D.animationId = null;
	}
	
	// Reseta o pan para o valor original em todas as faixas ativas
	if (state.activeHowls && state.activeHowls.length > 0) {
		state.activeHowls.forEach(howl => {
			if (howl && typeof howl.stereo === 'function') {
				howl.stereo(state.currentPan);
			}
		});
	} else if (state.currentHowl && typeof state.currentHowl.stereo === 'function') {
		state.currentHowl.stereo(state.currentPan);
	}
	
	// Reseta também o preview (se for Howl)
	if (currentPreview && typeof currentPreview.stereo === 'function') {
		currentPreview.stereo(state.currentPan);
	}
}

/**
 * Anima o pan do Audio 8D
 * Usa setInterval para continuar funcionando quando a aba perde foco
 */
function startAudio8DAnimation() {
	// Para qualquer animação anterior
	if (state.audio8D.animationId) {
		clearInterval(state.audio8D.animationId);
	}
	
	let lastTime = performance.now();
	const INTERVAL_MS = 16; // ~60fps
	
	const animate = () => {
		if (!state.audio8D.enabled) {
			return;
		}
		
		const currentTime = performance.now();
		// Calcula delta time para animação suave independente de FPS
		const deltaTime = (currentTime - lastTime) / 1000;
		lastTime = currentTime;
		
		// Velocidade: 10-100 mapeado para 0.1-2.0 rad/s
		const speed = (state.audio8D.speed / 50);
		const intensity = state.audio8D.intensity / 100;
		
		// Incrementa ângulo baseado na velocidade e delta time
		state.audio8D.angle += speed * deltaTime * Math.PI;
		if (state.audio8D.angle > Math.PI * 2) {
			state.audio8D.angle -= Math.PI * 2;
		}
		
		let panValue = 0;
		
		switch (state.audio8D.pattern) {
			case 'circular':
				// Movimento suave circular
				panValue = Math.sin(state.audio8D.angle) * intensity;
				break;
			case 'infinity':
				// Movimento em forma de 8 (lemniscata)
				panValue = Math.sin(state.audio8D.angle * 2) * Math.cos(state.audio8D.angle) * intensity;
				break;
			case 'pendulum':
				// Movimento de pêndulo (mais lento nos extremos)
				panValue = Math.sin(state.audio8D.angle) * intensity;
				break;
			case 'random':
				// Movimento suave com variação aleatória
				if (Math.random() < 0.02) {
					state.audio8D.targetPan = (Math.random() * 2 - 1) * intensity;
				}
				// Interpola suavemente para o target
				const currPan = state.audio8D.lastPan || 0;
				const target = state.audio8D.targetPan || 0;
				panValue = currPan + (target - currPan) * 0.05;
				state.audio8D.lastPan = panValue;
				break;
			default:
				panValue = Math.sin(state.audio8D.angle) * intensity;
		}
		
		// Aplica o pan em todas as faixas ativas
		if (state.activeHowls && state.activeHowls.length > 0) {
			state.activeHowls.forEach(howl => applyPanToHowl(howl, panValue));
		} else {
			applyPanToHowl(state.currentHowl, panValue);
		}
		applyPanToHowl(currentPreview, panValue);
	};
	
	// Inicia a animação com setInterval (funciona em background)
	state.audio8D.animationId = setInterval(animate, INTERVAL_MS);
	
	// Executa imediatamente a primeira vez
	animate();
}

/**
 * Aplica pan a um Howl usando Howler.stereo()
 * Com html5: false, isso funciona nativamente via Web Audio API
 * Nota: Não funciona com YouTube (API não suporta controle de pan)
 */
function applyPanToHowl(howl, panValue) {
	if (!howl) return;
	
	// Verifica se é um objeto Howl válido (tem método stereo)
	if (typeof howl.stereo !== 'function') {
		// Pode ser preview do YouTube ou outro objeto - ignora silenciosamente
		return;
	}
	
	try {
		// Com html5: false, Howler.stereo() usa Web Audio API nativamente
		howl.stereo(panValue);
	} catch (e) {
		console.warn('Erro ao aplicar pan:', e);
	}
}

/**
 * Atualiza configurações do Audio 8D
 */
function updateAudio8DSettings() {
	// Velocidade
	if (ui.audio8dSpeed) {
		state.audio8D.speed = parseInt(ui.audio8dSpeed.value);
		if (ui.audio8dSpeedValue) {
			ui.audio8dSpeedValue.textContent = `${state.audio8D.speed}%`;
		}
	}
	
	// Intensidade
	if (ui.audio8dIntensity) {
		state.audio8D.intensity = parseInt(ui.audio8dIntensity.value);
		if (ui.audio8dIntensityValue) {
			ui.audio8dIntensityValue.textContent = `${state.audio8D.intensity}%`;
		}
	}
	
	// Padrão
	const activePattern = document.querySelector('.pattern-btn.active');
	if (activePattern) {
		state.audio8D.pattern = activePattern.dataset.pattern;
	}
}

/**
 * Toggle do Enhancer
 */
function toggleEnhancer() {
	state.enhancer.enabled = !state.enhancer.enabled;
	
	// Atualiza UI
	if (ui.enhancerToggle) {
		ui.enhancerToggle.classList.toggle('active', state.enhancer.enabled);
		ui.enhancerToggle.setAttribute('aria-checked', state.enhancer.enabled);
	}
	if (ui.enhancerControls) {
		ui.enhancerControls.classList.toggle('active', state.enhancer.enabled);
	}
	
	if (state.enhancer.enabled) {
		// Aviso se estiver usando YouTube
		if (youtubePlayer && currentYoutubeId) {
			showToast('⚠️ Aprimoramento não funciona com vídeos do YouTube', 'warning');
		}
		initEnhancer();
		showToast('Aprimoramento ativado', 'success');
	} else {
		stopEnhancer();
		showToast('Aprimoramento desativado', 'info');
	}
}

/**
 * Inicializa o Enhancer com EQ e compressão
 * Funciona interceptando o Howler.masterGain
 */
function initEnhancer() {
	// Usa o AudioContext do Howler (criado quando html5: false)
	const ctx = Howler.ctx;
	if (!ctx) {
		console.warn('Enhancer: AudioContext não disponível');
		return;
	}
	
	try {
		// Cria nós se não existirem
		if (!state.enhancer.nodes.compressor) {
			// Compressor dinâmico
			state.enhancer.nodes.compressor = ctx.createDynamicsCompressor();
			state.enhancer.nodes.compressor.threshold.value = -24;
			state.enhancer.nodes.compressor.knee.value = 12;
			state.enhancer.nodes.compressor.ratio.value = 4;
			state.enhancer.nodes.compressor.attack.value = 0.003;
			state.enhancer.nodes.compressor.release.value = 0.25;
			
			// EQ básico (3 bandas)
			state.enhancer.nodes.lowShelf = ctx.createBiquadFilter();
			state.enhancer.nodes.lowShelf.type = 'lowshelf';
			state.enhancer.nodes.lowShelf.frequency.value = 200;
			state.enhancer.nodes.lowShelf.gain.value = 2;
			
			state.enhancer.nodes.midPeaking = ctx.createBiquadFilter();
			state.enhancer.nodes.midPeaking.type = 'peaking';
			state.enhancer.nodes.midPeaking.frequency.value = 1000;
			state.enhancer.nodes.midPeaking.Q.value = 1;
			state.enhancer.nodes.midPeaking.gain.value = 1;
			
			state.enhancer.nodes.highShelf = ctx.createBiquadFilter();
			state.enhancer.nodes.highShelf.type = 'highshelf';
			state.enhancer.nodes.highShelf.frequency.value = 3000;
			state.enhancer.nodes.highShelf.gain.value = 2;
		}
		
		// Conecta a cadeia interceptando o Howler.masterGain
		// Howler: masterGain -> destination
		// Com Enhancer: masterGain -> lowShelf -> mid -> high -> compressor -> destination
		if (Howler.masterGain) {
			try {
				// Desconecta masterGain do destination
				Howler.masterGain.disconnect();
				console.log('[Enhancer] masterGain desconectado, reconectando através do EQ...');
				
				// Conecta a cadeia de efeitos
				Howler.masterGain.connect(state.enhancer.nodes.lowShelf);
				state.enhancer.nodes.lowShelf.connect(state.enhancer.nodes.midPeaking);
				state.enhancer.nodes.midPeaking.connect(state.enhancer.nodes.highShelf);
				state.enhancer.nodes.highShelf.connect(state.enhancer.nodes.compressor);
				state.enhancer.nodes.compressor.connect(ctx.destination);
				
				state.enhancer.connected = true;
				console.log('Enhancer: Conectado ao Howler.masterGain');
			} catch (e) {
				console.warn('Enhancer: Erro ao conectar:', e);
			}
		}
		
		applyEnhancerPreset();
		updateEQFromSliders();
	} catch (error) {
		console.error('Erro ao inicializar Enhancer:', error);
	}
}

/**
 * Para o Enhancer e reconecta o áudio direto
 */
function stopEnhancer() {
	const ctx = Howler.ctx;
	if (!ctx || !Howler.masterGain) return;
	
	try {
		// Desconecta a cadeia de efeitos
		if (state.enhancer.nodes.compressor) {
			state.enhancer.nodes.compressor.disconnect();
		}
		if (state.enhancer.nodes.highShelf) {
			state.enhancer.nodes.highShelf.disconnect();
		}
		if (state.enhancer.nodes.midPeaking) {
			state.enhancer.nodes.midPeaking.disconnect();
		}
		if (state.enhancer.nodes.lowShelf) {
			state.enhancer.nodes.lowShelf.disconnect();
		}
		
		// Reconecta masterGain direto ao destination
		Howler.masterGain.disconnect();
		Howler.masterGain.connect(ctx.destination);
		
		state.enhancer.connected = false;
		console.log('Enhancer: Desconectado');
	} catch (e) {
		console.warn('Enhancer: Erro ao desconectar:', e);
	}
}

/**
 * Atualiza EQ a partir dos sliders
 */
function updateEQFromSliders() {
	if (!state.enhancer.enabled) return;
	
	const lowValue = ui.eqLow ? parseFloat(ui.eqLow.value) : 0;
	const midValue = ui.eqMid ? parseFloat(ui.eqMid.value) : 0;
	const highValue = ui.eqHigh ? parseFloat(ui.eqHigh.value) : 0;
	
	if (state.enhancer.nodes.lowShelf) {
		state.enhancer.nodes.lowShelf.gain.value = lowValue;
	}
	if (state.enhancer.nodes.midPeaking) {
		state.enhancer.nodes.midPeaking.gain.value = midValue;
	}
	if (state.enhancer.nodes.highShelf) {
		state.enhancer.nodes.highShelf.gain.value = highValue;
	}
}

/**
 * Aplica preset do Enhancer
 */
function applyEnhancerPreset() {
	const preset = state.enhancer.preset;
	
	const presets = {
		default: { low: 2, mid: 1, high: 2 },
		noise_reduction: { low: 0, mid: 0, high: -3 },
		music: { low: 3, mid: 0, high: 3 },
		voice: { low: -2, mid: 3, high: 2 },
		bass_boost: { low: 6, mid: 0, high: 0 }
	};
	
	const settings = presets[preset] || presets.default;
	
	if (state.enhancer.nodes.lowShelf) {
		state.enhancer.nodes.lowShelf.gain.value = settings.low;
	}
	if (state.enhancer.nodes.midPeaking) {
		state.enhancer.nodes.midPeaking.gain.value = settings.mid;
	}
	if (state.enhancer.nodes.highShelf) {
		state.enhancer.nodes.highShelf.gain.value = settings.high;
	}
}

/**
 * Atualiza configurações do Enhancer
 */
function updateEnhancerSettings() {
	if (ui.enhancerPreset) {
		state.enhancer.preset = ui.enhancerPreset.value;
		if (state.enhancer.enabled) {
			applyEnhancerPreset();
		}
	}
}

/**
 * Configura os analisadores de áudio (AnalyserNodes)
 */
function setupAudioAnalysers() {
	if (!state.audioCtx) return;
	
	try {
		// Analyser para o canal master (espectro geral)
		state.audioMonitor.analyserMaster = state.audioCtx.createAnalyser();
		state.audioMonitor.analyserMaster.fftSize = 256;
		state.audioMonitor.analyserMaster.smoothingTimeConstant = 0.8;
		
		// Conecta o master gain ao analyser master
		if (state.masterGain) {
			state.masterGain.connect(state.audioMonitor.analyserMaster);
		}
		
		// Analysers dedicados para L/R (serão conectados aos osciladores)
		state.audioMonitor.analyserLeft = state.audioCtx.createAnalyser();
		state.audioMonitor.analyserRight = state.audioCtx.createAnalyser();
		
		state.audioMonitor.analyserLeft.fftSize = 2048; // Alta resolução para detectar frequência
		state.audioMonitor.analyserRight.fftSize = 2048;
		state.audioMonitor.analyserLeft.smoothingTimeConstant = 0.85;
		state.audioMonitor.analyserRight.smoothingTimeConstant = 0.85;
		
		// Tenta conectar aos osciladores se já existirem
		connectMonitorToBinaural();
		
		console.log('Analysers de áudio configurados com sucesso');
	} catch (error) {
		console.error('Erro ao configurar analysers de áudio:', error);
	}
}

/**
 * Conecta os analysers do monitor diretamente aos osciladores binaurais L/R
 * Isso permite medir a frequência real de cada canal separadamente
 */
function connectMonitorToBinaural() {
	// Verifica se os analysers do monitor existem
	if (!state.audioMonitor.analyserLeft || !state.audioMonitor.analyserRight) {
		return;
	}
	
	// Verifica se a cadeia binaural existe
	if (!state.binauralChain?.leftGain || !state.binauralChain?.rightGain) {
		return;
	}
	
	try {
		// Conecta os gains L/R aos analysers do monitor
		// Isso permite analisar cada canal ANTES de serem mesclados
		state.binauralChain.leftGain.connect(state.audioMonitor.analyserLeft);
		state.binauralChain.rightGain.connect(state.audioMonitor.analyserRight);
		
		console.log('Monitor conectado aos canais binaurais L/R');
	} catch (error) {
		console.warn('Erro ao conectar monitor aos canais binaurais:', error);
	}
}

/**
 * Inicia a animação do monitor de áudio (display de frequências)
 */
function startAudioMonitorAnimation() {
	if (state.audioMonitor.animationId) return;
	
	function animate() {
		if (!state.audioMonitor.isOpen) {
			state.audioMonitor.animationId = null;
			return;
		}
		updateFrequencyDisplays();
		state.audioMonitor.animationId = requestAnimationFrame(animate);
	}
	
	state.audioMonitor.isOpen = true;
	animate();
}

/**
 * Para a animação do monitor de áudio
 */
function stopAudioMonitorAnimation() {
	if (state.audioMonitor.animationId) {
		cancelAnimationFrame(state.audioMonitor.animationId);
		state.audioMonitor.animationId = null;
	}
	state.audioMonitor.isOpen = false;
}

/**
 * Atualiza os displays de frequência binaural
 */
function updateFrequencyDisplays() {
	let freqLeft, freqRight, freqDiff;
	
	// Prioridade 1: Usar frequências reais dos osciladores em execução
	if (state.binauralChain?.leftOsc && state.binauralChain?.rightOsc) {
		freqLeft = state.binauralChain.leftOsc.frequency.value;
		freqRight = state.binauralChain.rightOsc.frequency.value;
		freqDiff = freqRight - freqLeft;
	} 
	// Prioridade 2: Usar valores guardados na cadeia binaural
	else if (state.binauralChain?.freqLeft !== undefined) {
		freqLeft = state.binauralChain.freqLeft;
		freqRight = state.binauralChain.freqRight;
		freqDiff = state.binauralChain.freqDiff;
	}
	// Prioridade 3: Usar valores do formulário
	else {
		const baseFreq = parseFloat(ui.baseFreq?.value) || 200;
		const diffFreqVal = parseFloat(ui.diffFreq?.value) || 10;
		freqLeft = baseFreq;
		freqRight = baseFreq + diffFreqVal;
		freqDiff = diffFreqVal;
	}
	
	// Atualiza displays de frequência no overlay
	if (ui.monitorFreqLeft) {
		ui.monitorFreqLeft.textContent = freqLeft.toFixed(1);
	}
	if (ui.monitorFreqRight) {
		ui.monitorFreqRight.textContent = freqRight.toFixed(1);
	}
	if (ui.monitorFreqDiff) {
		ui.monitorFreqDiff.textContent = `Δ ${freqDiff.toFixed(1)}`;
	}
	
	// Classifica e atualiza badge de brainwave
	let brainwaveName = '';
	let brainwaveBand = '';
	
	if (freqDiff <= 4) {
		brainwaveName = 'Delta'; brainwaveBand = 'delta';
	} else if (freqDiff <= 8) {
		brainwaveName = 'Theta'; brainwaveBand = 'theta';
	} else if (freqDiff <= 13) {
		brainwaveName = 'Alpha'; brainwaveBand = 'alpha';
	} else if (freqDiff <= 16) {
		brainwaveName = 'SMR'; brainwaveBand = 'smr';
	} else if (freqDiff <= 30) {
		brainwaveName = 'Beta'; brainwaveBand = 'beta';
	} else {
		brainwaveName = 'Gamma'; brainwaveBand = 'gamma';
	}
	
	// Atualiza o badge do monitor unificado
	if (ui.monitorBrainwaveBadge) {
		const nameSpan = ui.monitorBrainwaveBadge.querySelector('.brainwave-name');
		if (nameSpan) {
			nameSpan.textContent = brainwaveName;
		}
		ui.monitorBrainwaveBadge.setAttribute('data-band', brainwaveBand);
	}
}


