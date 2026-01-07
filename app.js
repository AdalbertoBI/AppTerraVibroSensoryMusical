import { Workbox } from 'https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-window.prod.mjs';

const state = {
	audioCtx: null,
	masterGain: null,
	binauralChain: null,
	presets: [],
	musicMeta: [],
	playlistQueue: [],
	currentTrackIndex: 0,
	currentHowl: null,
	mixRatio: 0.7,
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
	// Sistema de Pacientes
	patients: [],
	currentPatient: null,
	patientFormStep: 0
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
	await hydratePresetStore();
	await hydrateMusicStore();
	await ensureStockTextures();
	await hydrateHistory();
	await hydratePatients();
	setupAudioGraph();
	updateRangeOutputs();
	updateConnectivity();
	updateMixOutput(state.mixRatio * 100);
	updatePanOutput(0);
	updatePlaylistSelect();
	updateSuggestions();
	registerServiceWorker();
	checkTermsModal();
	verifyHeadphones();
	setFooterYear();
	initScientificTicker();
	updatePatientBar();
	console.log('Terra Sensory Musical pronto. Presets carregados:', state.presets.length);
}

function cacheDom() {
	ui.presetList = document.getElementById('presetList');
	ui.loadDefaultPresets = document.getElementById('loadDefaultPresets');
	ui.form = document.getElementById('sessionForm');
	ui.baseFreq = document.getElementById('baseFreq');
	ui.baseFreqValue = document.getElementById('baseFreqValue');
	ui.diffFreq = document.getElementById('diffFreq');
	ui.diffFreqValue = document.getElementById('diffFreqValue');
	ui.duration = document.getElementById('duration');
	ui.durationValue = document.getElementById('durationValue');
	ui.binauralVolume = document.getElementById('binauralVolume');
	ui.binauralVolumeValue = document.getElementById('binauralVolumeValue');
	ui.lowPass = document.getElementById('lowPass');
	ui.lowPassValue = document.getElementById('lowPassValue');
	ui.playlistSelect = document.getElementById('playlistSelect');
	ui.musicSuggestions = document.getElementById('musicSuggestions');
	ui.startSessionBtn = document.getElementById('startSessionBtn');
	ui.audioUpload = document.getElementById('audioUpload');
	ui.dropZone = document.getElementById('dropZone');
	ui.musicList = document.getElementById('musicList');
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
	// Tutorial
	ui.tutorialSlides = document.getElementById('tutorialSlides');
	ui.tutorialDots = document.getElementById('tutorialDots');
	ui.tutorialPrev = document.getElementById('tutorialPrev');
	ui.tutorialNext = document.getElementById('tutorialNext');
	ui.termsCheckbox = document.getElementById('termsCheckbox');
	// Internet Archive
	ui.archiveQuery = document.getElementById('archiveQuery');
	ui.archiveCategory = document.getElementById('archiveCategory');
	ui.archiveSearchBtn = document.getElementById('archiveSearchBtn');
	ui.archiveResults = document.getElementById('archiveResults');
	ui.archiveStatus = document.getElementById('archiveStatus');
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
	ui.zenModeBtn = document.getElementById('zenModeBtn');
	ui.masterVolume = document.getElementById('masterVolume');
	ui.masterVolumeValue = document.getElementById('masterVolumeValue');
	// Protocolo terapêutico
	ui.therapeuticProtocol = document.getElementById('therapeuticProtocol');
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
}

function attachListeners() {
	ui.form.addEventListener('submit', handlePresetSave);
	ui.loadDefaultPresets.addEventListener('click', reloadScientificPresets);
	ui.startSessionBtn.addEventListener('click', () => startSessionFromForm(false));
	ui.baseFreq.addEventListener('input', updateRangeOutputs);
	ui.diffFreq.addEventListener('input', () => {
		updateRangeOutputs();
		updateSuggestions();
	});
	ui.duration.addEventListener('input', updateRangeOutputs);
	ui.binauralVolume.addEventListener('input', () => {
		updateRangeOutputs();
		warnHighVolume();
	});
	ui.lowPass.addEventListener('input', updateRangeOutputs);
	ui.playBtn.addEventListener('click', handlePlay);
	ui.pauseBtn.addEventListener('click', handlePause);
	ui.stopBtn.addEventListener('click', stopSession);
	ui.mixSlider.addEventListener('input', handleMixChange);
	ui.panSlider.addEventListener('input', handlePanChange);
	ui.audioUpload.addEventListener('change', (ev) => handleFiles(ev.target.files));
	['dragover', 'drop', 'dragleave'].forEach((evt) => {
		ui.dropZone.addEventListener(evt, handleDropZone, false);
	});
	ui.musicList.addEventListener('click', handleMusicActions);
	ui.presetList.addEventListener('click', handlePresetActions);
	window.addEventListener('online', updateConnectivity);
	window.addEventListener('offline', updateConnectivity);
	document.addEventListener('visibilitychange', handleVisibilityChange);
	window.addEventListener('blur', handleWindowBlur);
	window.addEventListener('focus', handleWindowFocus);
	window.addEventListener('beforeinstallprompt', captureInstallPrompt);
	ui.installBtn.addEventListener('click', triggerInstallPrompt);
	ui.acceptTerms.addEventListener('click', acceptTerms);
	// Tutorial
	ui.tutorialPrev.addEventListener('click', tutorialPrevSlide);
	ui.tutorialNext.addEventListener('click', tutorialNextSlide);
	ui.tutorialDots.addEventListener('click', handleTutorialDotClick);
	ui.termsCheckbox.addEventListener('change', handleTermsCheckboxChange);
	// Internet Archive
	ui.archiveSearchBtn.addEventListener('click', searchInternetArchive);
	ui.archiveQuery.addEventListener('keydown', (ev) => {
		if (ev.key === 'Enter') {
			ev.preventDefault();
			searchInternetArchive();
		}
	});
	ui.archiveResults.addEventListener('click', handleArchiveActions);
	// Novos controles terapêuticos
	ui.zenModeBtn.addEventListener('click', toggleZenMode);
	ui.masterVolume.addEventListener('input', handleMasterVolumeChange);
	// Protocolo terapêutico
	ui.therapeuticProtocol.addEventListener('change', handleProtocolChange);
	
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
}

function setupAudioGraph() {
	const AudioContextClass = window.AudioContext || window.webkitAudioContext;
	state.audioCtx = new AudioContextClass();
	state.masterGain = state.audioCtx.createGain();
	state.masterGain.gain.value = 0.9;
	state.masterGain.connect(state.audioCtx.destination);
	state.audioCtx.suspend();
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
	renderMusicList();
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

async function hydrateHistory() {
	const saved = await stores.history.getItem(STORAGE_KEYS.HISTORY);
	state.history = Array.isArray(saved) ? saved : [];
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
				<button class="secondary" data-action="load"><i class="fa-solid fa-pen"></i> Editar</button>
				<button class="primary" data-action="start"><i class="fa-solid fa-play"></i> Iniciar</button>
				<button class="ghost" data-action="delete" title="Excluir preset"><i class="fa-solid fa-trash"></i></button>
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
	}
	if (button.dataset.action === 'start') {
		startSession(preset);
	}
	if (button.dataset.action === 'delete') {
		deletePreset(preset.id);
	}
}

async function deletePreset(presetId) {
	const preset = state.presets.find((p) => p.id === presetId);
	if (!preset) return;
	
	// Confirmação simples
	if (!confirm(`Excluir o preset "${preset.name}"?`)) {
		return;
	}
	
	state.presets = state.presets.filter((p) => p.id !== presetId);
	renderPresetList();
	await stores.data.setItem(STORAGE_KEYS.PRESETS, state.presets);
	console.log('Preset excluído:', preset.name);
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
	[...ui.playlistSelect.options].forEach((option) => {
		option.selected = ids.includes(option.value);
	});
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
	const playlist = [...ui.playlistSelect.selectedOptions].map((opt) => opt.value);
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
	if (state.currentHowl) {
		state.currentHowl.stereo(value);
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
	if (state.currentHowl) {
		state.currentHowl.volume(musicRatio);
	}
}

function buildBinauralChain(preset) {
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
	lowPass.frequency.setValueAtTime(preset.lowPass, ctx.currentTime);
	const analyser = ctx.createAnalyser();
	analyser.fftSize = 512;
	const binauralGain = ctx.createGain();
	binauralGain.gain.value = state.mixRatio;
	leftOsc.connect(leftGain).connect(merger, 0, 0);
	rightOsc.connect(rightGain).connect(merger, 0, 1);
	merger.connect(lowPass);
	lowPass.connect(analyser);
	analyser.connect(binauralGain);
	binauralGain.connect(state.masterGain);
	leftOsc.start();
	rightOsc.start();
	state.binauralChain = { leftOsc, rightOsc, lowPass, analyser, binauralGain };
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
	await playCurrentTrack();
}

async function playCurrentTrack() {
	stopCurrentTrack();
	if (!state.playlistQueue.length) return;
	const trackId = state.playlistQueue[state.currentTrackIndex];
	const blob = await stores.music.getItem(trackId);
	if (!blob) {
		console.warn('Blob ausente para track', trackId);
		return;
	}
	const objectUrl = URL.createObjectURL(blob);
	state.musicObjectUrls.push(objectUrl);
	state.currentHowl = new Howl({
		src: [objectUrl],
		loop: true,
		html5: true,
		volume: 1 - state.mixRatio,
		stereo: state.currentPan,
		onplay: () => console.log('Howler reproduzindo', trackId)
	});
	state.currentHowl.play();
}

function stopCurrentTrack() {
	if (state.currentHowl) {
		state.currentHowl.stop();
		state.currentHowl.unload();
		state.currentHowl = null;
	}
	state.musicObjectUrls.forEach((url) => URL.revokeObjectURL(url));
	state.musicObjectUrls = [];
}

function pauseSession(autoResume = false) {
	if (state.currentHowl) state.currentHowl.pause();
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
	if (state.currentHowl && !state.currentHowl.playing()) {
		state.currentHowl.play();
	}
	state.wasPlayingBeforeBlur = false;
	updateMediaSessionState('playing');
	updateSessionUI(true, false);
}

function stopSession() {
	stopBinaural();
	stopCurrentTrack();
	clearInterval(state.timerId);
	state.timerId = null;
	state.remainingSeconds = 0;
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
	ui.timerDisplay.textContent = `${minutes}:${seconds}`;
	
	// Atualizar progresso circular
	if (totalSessionSeconds > 0) {
		updateTimerProgress(state.remainingSeconds, totalSessionSeconds);
	}
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
	renderMusicList();
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
	ui.musicList.innerHTML = '';
	state.musicMeta.forEach((track) => {
		let originLabel = 'Upload';
		let originClass = 'badge user';
		if (track.origin === 'textura-nativa') {
			originLabel = 'Nativo';
			originClass = 'badge native';
		} else if (track.origin === 'internet-archive') {
			originLabel = 'Archive';
			originClass = 'badge archive';
		}
		const li = document.createElement('li');
		li.dataset.id = track.id;
		li.innerHTML = `
			<div>
				<strong>${track.name}</strong>
				<p class="helper">${((track.size || 0) / 1024 / 1024).toFixed(2)} MB • ${track.lowEnergyPct ?? '--'}% graves</p>
				${track.description ? `<small class="helper subtle">${track.description}</small>` : ''}
			</div>
			<div class="actions">
				<span class="tag">${track.tag}</span>
				<span class="${originClass}">${originLabel}</span>
				<button class="ghost" data-action="preview">Preview</button>
				<button class="secondary" data-action="delete">Excluir</button>
			</div>
		`;
		ui.musicList.append(li);
	});
}

async function handleMusicActions(event) {
	const button = event.target.closest('button');
	if (!button) return;
	const li = button.closest('li');
	const trackId = li.dataset.id;
	if (button.dataset.action === 'delete') {
		await removeTrack(trackId);
	}
	if (button.dataset.action === 'preview') {
		previewTrack(trackId);
	}
}

async function removeTrack(trackId) {
	await stores.music.removeItem(trackId);
	state.musicMeta = state.musicMeta.filter((track) => track.id !== trackId);
	await stores.data.setItem(STORAGE_KEYS.MUSIC_META, state.musicMeta);
	renderMusicList();
	updatePlaylistSelect();
	console.log('Track removida', trackId);
}

async function previewTrack(trackId) {
	const blob = await stores.music.getItem(trackId);
	if (!blob) return;
	const url = URL.createObjectURL(blob);
	const preview = new Howl({ src: [url], volume: 0.4, stereo: state.currentPan });
	preview.play();
	setTimeout(() => {
		preview.stop();
		preview.unload();
		URL.revokeObjectURL(url);
	}, 4000);
}

function updatePlaylistSelect() {
	ui.playlistSelect.innerHTML = '';
	state.musicMeta.forEach((track) => {
		const option = document.createElement('option');
		option.value = track.id;
		const originSuffix = track.origin === 'textura-nativa' ? 'nativo' : 'upload';
		option.textContent = `${track.name} (${track.tag} • ${originSuffix})`;
		ui.playlistSelect.append(option);
	});
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
		handleFiles(event.dataTransfer.files);
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
		artist: 'Terra Sensory Musical',
		album: `${preset.diffHz}Hz ${describeDiffBand(preset.diffHz).label}`,
		artwork: [
			{ src: 'icons/terra-sensory.svg', sizes: '512x512', type: 'image/svg+xml' }
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
			console.log('[App] Nova versão ativada - recarregando...');
			window.location.reload();
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
		banner.querySelector('.update-banner__btn--update').innerHTML = 
			'<i class="fa-solid fa-spinner fa-spin"></i> Atualizando...';
		banner.querySelector('.update-banner__btn--update').disabled = true;
		banner.querySelector('.update-banner__btn--later').disabled = true;

		if (waitingSW) {
			waitingSW.postMessage({ type: 'SKIP_WAITING' });
		} else if (state.wb) {
			state.wb.messageSkipWaiting();
		}
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
	
	// Desabilita botão aceitar se checkbox não estiver marcado (apenas no último slide)
	if (isLastSlide) {
		ui.acceptTerms.disabled = !ui.termsCheckbox.checked;
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
	// Habilita/desabilita botão aceitar baseado no checkbox
	if (currentTutorialSlide === TOTAL_TUTORIAL_SLIDES - 1) {
		ui.acceptTerms.disabled = !ui.termsCheckbox.checked;
	}
}

function acceptTerms() {
	// Verifica se checkbox está marcado
	if (!ui.termsCheckbox.checked) {
		ui.termsCheckbox.focus();
		// Efeito visual para chamar atenção
		const label = ui.termsCheckbox.closest('.terms-checkbox');
		if (label) {
			label.style.animation = 'none';
			label.offsetHeight; // Trigger reflow
			label.style.animation = 'shake 0.5s ease';
		}
		return;
	}
	
	localStorage.setItem(TERMS_KEY, 'true');
	ui.termsModal.classList.add('hidden');
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
// Internet Archive Integration
// ==========================================

const ARCHIVE_BASE = 'https://archive.org';
const ARCHIVE_SEARCH_URL = `${ARCHIVE_BASE}/advancedsearch.php`;

async function searchInternetArchive() {
	const query = ui.archiveQuery.value.trim();
	const category = ui.archiveCategory.value;
	
	if (!query && !category) {
		setArchiveStatus('Digite um termo de busca ou selecione uma categoria.', 'error');
		return;
	}

	if (!navigator.onLine) {
		setArchiveStatus('Sem conexão. Conecte-se à internet para buscar no Archive.', 'error');
		return;
	}

	setArchiveStatus('Buscando no Internet Archive...', 'loading');
	ui.archiveResults.innerHTML = '';

	try {
		const searchTerms = [];
		if (query) searchTerms.push(query);
		if (category) searchTerms.push(category);
		
		const searchQuery = `(${searchTerms.join(' ')}) AND mediatype:audio AND format:mp3`;
		
		const params = new URLSearchParams({
			q: searchQuery,
			fl: ['identifier', 'title', 'creator', 'description', 'downloads'].join(','),
			rows: '25',
			page: '1',
			output: 'json',
			sort: 'downloads desc'
		});

		const response = await fetch(`${ARCHIVE_SEARCH_URL}?${params.toString()}`);
		
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const data = await response.json();
		const docs = data.response?.docs || [];

		if (!docs.length) {
			ui.archiveResults.innerHTML = '<div class="archive-empty">Nenhum resultado encontrado. Tente outros termos.</div>';
			setArchiveStatus('', '');
			return;
		}

		renderArchiveResults(docs);
		setArchiveStatus(`${docs.length} resultados encontrados`, 'success');
	} catch (error) {
		console.error('Erro ao buscar no Archive:', error);
		setArchiveStatus('Erro na busca. Tente novamente.', 'error');
	}
}

function renderArchiveResults(docs) {
	ui.archiveResults.innerHTML = '';
	
	docs.forEach((doc) => {
		const item = document.createElement('div');
		item.className = 'archive-result-item';
		item.dataset.identifier = doc.identifier;
		
		const title = doc.title || doc.identifier;
		const creator = doc.creator || 'Desconhecido';
		const downloads = doc.downloads ? `${doc.downloads.toLocaleString()} downloads` : '';
		
		item.innerHTML = `
			<div class="archive-result-info">
				<strong title="${title}">${title}</strong>
				<small>${creator} ${downloads ? '• ' + downloads : ''}</small>
			</div>
			<div class="archive-result-actions">
				<button type="button" class="ghost" data-action="preview" title="Ouvir preview">
					<i class="fa-solid fa-headphones"></i>
				</button>
				<button type="button" class="secondary" data-action="download" title="Baixar para biblioteca">
					<i class="fa-solid fa-download"></i> Baixar
				</button>
			</div>
		`;
		
		ui.archiveResults.appendChild(item);
	});
}

async function handleArchiveActions(event) {
	const button = event.target.closest('button');
	if (!button) return;
	
	const item = button.closest('.archive-result-item');
	const identifier = item.dataset.identifier;
	const action = button.dataset.action;

	if (action === 'preview') {
		await previewArchiveItem(identifier);
	}
	
	if (action === 'download') {
		await downloadArchiveItem(identifier, item);
	}
}

async function getArchiveItemFiles(identifier) {
	const metadataUrl = `${ARCHIVE_BASE}/metadata/${identifier}`;
	const response = await fetch(metadataUrl);
	
	if (!response.ok) {
		throw new Error(`Falha ao obter metadados: ${response.status}`);
	}
	
	const data = await response.json();
	const files = data.files || [];
	
	// Filtrar apenas arquivos MP3
	const audioFiles = files.filter((file) => {
		const name = file.name.toLowerCase();
		return name.endsWith('.mp3') || name.endsWith('.ogg') || name.endsWith('.wav');
	});
	
	// Ordenar por tamanho (preferir arquivos menores primeiro para preview)
	audioFiles.sort((a, b) => (a.size || 0) - (b.size || 0));
	
	return {
		metadata: data.metadata || {},
		files: audioFiles,
		identifier
	};
}

async function previewArchiveItem(identifier) {
	setArchiveStatus('Carregando preview...', 'loading');
	
	try {
		const { files } = await getArchiveItemFiles(identifier);
		
		if (!files.length) {
			setArchiveStatus('Nenhum arquivo de áudio encontrado.', 'error');
			return;
		}
		
		// Usar o primeiro arquivo (menor)
		const file = files[0];
		const audioUrl = `${ARCHIVE_BASE}/download/${identifier}/${encodeURIComponent(file.name)}`;
		
		// Parar preview anterior se existir
		if (state.archivePreview) {
			state.archivePreview.stop();
			state.archivePreview.unload();
		}
		
		state.archivePreview = new Howl({
			src: [audioUrl],
			html5: true,
			volume: 0.5,
			onplay: () => setArchiveStatus('Reproduzindo preview...', 'success'),
			onend: () => setArchiveStatus('Preview concluído.', ''),
			onloaderror: () => setArchiveStatus('Erro ao carregar áudio.', 'error'),
			onplayerror: () => setArchiveStatus('Erro ao reproduzir.', 'error')
		});
		
		state.archivePreview.play();
	} catch (error) {
		console.error('Erro no preview:', error);
		setArchiveStatus('Erro ao carregar preview.', 'error');
	}
}

async function downloadArchiveItem(identifier, itemElement) {
	const downloadBtn = itemElement.querySelector('[data-action="download"]');
	const originalHtml = downloadBtn.innerHTML;
	
	downloadBtn.disabled = true;
	downloadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
	setArchiveStatus('Baixando arquivo...', 'loading');
	
	try {
		const { files, metadata } = await getArchiveItemFiles(identifier);
		
		if (!files.length) {
			throw new Error('Nenhum arquivo de áudio encontrado');
		}
		
		// Escolher o melhor arquivo (preferir MP3, tamanho razoável)
		const preferredFile = files.find((f) => f.name.toLowerCase().endsWith('.mp3')) || files[0];
		const audioUrl = `${ARCHIVE_BASE}/download/${identifier}/${encodeURIComponent(preferredFile.name)}`;
		
		setArchiveStatus(`Baixando ${preferredFile.name}...`, 'loading');
		
		const response = await fetch(audioUrl);
		if (!response.ok) {
			throw new Error(`Falha no download: ${response.status}`);
		}
		
		const arrayBuffer = await response.arrayBuffer();
		const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
		
		// Analisar energia de graves
		const lowEnergyPct = await analyzeLowEnergy(blob);
		const tag = lowEnergyPct > 40 ? 'relax/vibro' : lowEnergyPct > 25 ? 'meditacao' : 'ativa';
		
		// Criar metadados
		const trackMeta = {
			id: `archive-${identifier}-${Date.now()}`,
			name: `${metadata.title || identifier} (Archive)`,
			size: blob.size,
			type: 'audio/mpeg',
			tag,
			lowEnergyPct: Number(lowEnergyPct.toFixed(2)),
			addedAt: Date.now(),
			origin: 'internet-archive',
			archiveId: identifier,
			creator: metadata.creator || 'Desconhecido',
			description: metadata.description ? metadata.description.substring(0, 200) : ''
		};
		
		// Salvar no IndexedDB
		await stores.music.setItem(trackMeta.id, blob);
		state.musicMeta.push(trackMeta);
		await stores.data.setItem(STORAGE_KEYS.MUSIC_META, state.musicMeta);
		
		// Atualizar UI
		renderMusicList();
		updatePlaylistSelect();
		updateSuggestions();
		
		setArchiveStatus(`"${trackMeta.name}" adicionado à biblioteca!`, 'success');
		
		// Marcar como baixado
		downloadBtn.innerHTML = '<i class="fa-solid fa-check"></i> Salvo';
		downloadBtn.classList.remove('secondary');
		downloadBtn.classList.add('ghost');
		
	} catch (error) {
		console.error('Erro no download:', error);
		setArchiveStatus(`Erro: ${error.message}`, 'error');
		downloadBtn.innerHTML = originalHtml;
		downloadBtn.disabled = false;
	}
}

function setArchiveStatus(message, type) {
	ui.archiveStatus.textContent = message;
	ui.archiveStatus.className = 'archive-status';
	if (type) {
		ui.archiveStatus.classList.add(type);
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
	ui.sessionVisualizer.classList.toggle('active', isActive && !isPaused);
	ui.wavePulse.classList.toggle('active', isActive && !isPaused);
	ui.breathCircle.classList.toggle('active', isActive && !isPaused);
}

function updateFrequencyDisplay(diffHz) {
	const freqValue = ui.frequencyDisplay.querySelector('.freq-value');
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
	
	// Ajustar velocidade da animação de onda baseado na frequência
	const animDuration = Math.max(2, 12 - diffHz * 0.25);
	ui.wavePulse.style.animationDuration = `${animDuration}s`;
}

function updateTimerProgress(remaining, total) {
	if (!total || total <= 0) return;
	
	const progress = remaining / total;
	const circumference = 2 * Math.PI * 45; // r = 45
	const offset = circumference * (1 - progress);
	
	ui.timerProgress.style.strokeDasharray = circumference;
	ui.timerProgress.style.strokeDashoffset = offset;
	
	// Cores de alerta
	ui.timerProgress.classList.remove('low-time', 'critical-time');
	if (progress < 0.1) {
		ui.timerProgress.classList.add('critical-time');
	} else if (progress < 0.25) {
		ui.timerProgress.classList.add('low-time');
	}
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
	
	// Ajustar animação CSS
	ui.breathCircle.style.animationDuration = `${cycleDuration}ms`;
	
	let isInhale = true;
	
	function updateBreath() {
		ui.breathCircle.classList.remove('inhale', 'exhale');
		ui.breathCircle.classList.add(isInhale ? 'inhale' : 'exhale');
		ui.breathText.textContent = isInhale ? 'Inspire' : 'Expire';
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
	ui.breathCircle.classList.remove('inhale', 'exhale', 'active');
	ui.breathText.textContent = 'Inspire';
}

function toggleZenMode() {
	const isActive = document.body.classList.toggle('zen-mode');
	ui.zenModeBtn.classList.toggle('active', isActive);
	ui.zenModeBtn.innerHTML = isActive 
		? '<i class="fa-solid fa-compress"></i> Sair Zen'
		: '<i class="fa-solid fa-moon"></i> Modo Zen';
	
	// Exibir dica apenas na primeira vez
	if (isActive && !localStorage.getItem('ts-zen-shown')) {
		localStorage.setItem('ts-zen-shown', 'true');
	}
}

function handleMasterVolumeChange(event) {
	const value = Number(event.target.value);
	
	// Aplicar volume master
	if (state.masterGain) {
		state.masterGain.gain.setTargetAtTime(value / 100, state.audioCtx.currentTime, 0.05);
	}
	
	// Feedback visual
	let icon = 'shield-check';
	let className = '';
	
	if (value >= 85) {
		icon = 'triangle-exclamation';
		className = 'danger';
	} else if (value >= 70) {
		icon = 'circle-exclamation';
		className = 'caution';
	}
	
	ui.masterVolumeValue.innerHTML = `${value}% <i class="fa-solid fa-${icon}"></i>`;
	ui.masterVolumeValue.className = className;
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

// Aplicar protocolo terapêutico selecionado
function handleProtocolChange(event) {
	const protocolKey = event.target.value;
	if (!protocolKey || !THERAPEUTIC_PROTOCOLS[protocolKey]) {
		return; // Configuração manual selecionada
	}
	
	const protocol = THERAPEUTIC_PROTOCOLS[protocolKey];
	
	// Aplicar valores aos controles
	ui.baseFreq.value = protocol.baseHz;
	ui.diffFreq.value = protocol.diffHz;
	ui.duration.value = protocol.duration;
	ui.binauralVolume.value = protocol.binauralVolume;
	ui.lowPass.value = protocol.lowPass;
	
	// Atualizar nome do preset
	ui.form.presetName.value = `Protocolo: ${protocol.name}`;
	
	// Atualizar outputs
	updateRangeOutputs();
	updateSuggestions();
	
	console.log('Protocolo aplicado:', protocol.name);
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
