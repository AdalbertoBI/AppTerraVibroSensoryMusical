/**
 * =============================================================================
 * TERRA VIBRO SENSORY MUSICAL - Estado Global da Aplicação
 * =============================================================================
 * 
 * Gerenciamento centralizado do estado da aplicação.
 * Todos os módulos compartilham este estado.
 */

export const state = {
	// Contexto de Áudio
	audioCtx: null,
	masterGain: null,
	
	// Cadeia Binaural
	binauralChain: null,
	
	// Áudio 8D
	audio8D: {
		enabled: false,
		pannerNode: null,
		convolverNode: null,
		dryGain: null,
		wetGain: null,
		rotationSpeed: 0.5,
		rotationAngle: 0,
		animationId: null,
		depth: 0.8,
		roomSize: 0.5
	},
	
	// Presets e Músicas
	presets: [],
	musicMeta: [],
	playlistQueue: [],
	currentTrackIndex: 0,
	currentHowl: null,
	
	// Controles de Áudio
	mixRatio: 0.5,
	currentPan: 0,
	
	// Timer da Sessão
	timerId: null,
	remainingSeconds: 0,
	isSessionRunning: false,
	
	// PWA
	wasPlayingBeforeBlur: false,
	wb: null,
	deferredPrompt: null,
	musicObjectUrls: [],
	
	// Histórico
	history: [],
	archivePreview: null,
	
	// Sistema de Pacientes (compatível com TerraMidi)
	patients: [],
	plans: [],           // Planos terapêuticos (TerraMidi)
	patientSessions: [], // Sessões terapêuticas (TerraMidi)
	currentPatient: null,
	selectedPatient: null,
	patientFormStep: 0,
	sessionHistory: [],
	sessionStartTime: null,
	sessionDuration: 0,
	currentPatientTab: 'cadastro', // 'cadastro' | 'plano' | 'sessoes' | 'dashboard'
	
	// Volumes
	binauralVolume: 0.5,
	musicVolume: 0.5,
	
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

// Chaves de armazenamento
export const STORAGE_KEYS = {
	PRESETS: 'presets',
	MUSIC_META: 'musicMeta',
	HISTORY: 'sessionHistory',
	PATIENTS: 'patients',
	PLANS: 'plans',                    // TerraMidi: Planos terapêuticos
	PATIENT_SESSIONS: 'patientSessions', // TerraMidi: Sessões de atendimento
	CURRENT_PATIENT: 'currentPatient',
	AUDIO_8D_ENABLED: 'audio8dEnabled',
	AUDIO_8D_SETTINGS: 'audio8dSettings',
	TUTORIAL_SEEN: 'tutorialSeen',
	SELECTED_PATIENT: 'selectedPatient'
};

export const TERMS_KEY = 'ts-terms-accepted';
