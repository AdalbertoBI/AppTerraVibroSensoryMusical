/**
 * =============================================================================
 * TERRA VIBRO SENSORY MUSICAL - Compatibilidade de Prontuário TerraMidi
 * =============================================================================
 * 
 * Módulo para compartilhamento de prontuário de pacientes com TerraMidi.
 * 
 * O TerraMidi é uma plataforma de musicoterapia com recursos MIDI completos.
 * O Terra Vibro Sensory Musical é focado em vibroacústica e frequências binaurais.
 * 
 * Ambos sistemas compartilham o mesmo prontuário de pacientes para que:
 * - Pacientes cadastrados em um sistema possam ser usados no outro
 * - Dados de anamnese são sincronizados
 * - Histórico de sessões de cada plataforma fica separado
 * 
 * Formato de exportação TerraMidi:
 * {
 *   "version": "1.0",
 *   "exportedAt": "2026-01-18T19:09:22.999Z",
 *   "patients": [...],
 *   "plans": [...],     // Planos terapêuticos (TerraMidi)
 *   "sessions": [...]   // Sessões MIDI (TerraMidi)
 * }
 * 
 * =============================================================================
 */

import { state } from '../core/state.js';
import { stores, uuid } from '../utils/storage.js';

// ============================================================================
// MAPEAMENTO DE CAMPOS: TerraMidi <-> Terra Vibro Sensory
// ============================================================================

/**
 * Campos do prontuário TerraMidi (padrões AMTA)
 */
const TERRAMIDI_FIELDS = {
	// Identificação básica
	id: '',
	createdAt: '',
	updatedAt: '',
	fullName: '',
	birthDate: '',
	contact: '',
	guardian: '',
	
	// Consentimentos
	consentTreatment: false,
	consentMedia: false,
	consentShare: false,
	
	// Encaminhamento
	referralSource: '',
	referralDate: '',
	referralReason: '',
	
	// Clínico
	diagnosis: '',
	medications: '',
	precautions: '',
	psychosocialHistory: '',
	
	// Linha de Base por Domínio (AMTA)
	baselines: {
		cognitive: { value: 5, notes: '' },
		communication: { value: 5, notes: '' },
		emotional: { value: 5, notes: '' },
		social: { value: 5, notes: '' },
		motor: { value: 5, notes: '' }
	},
	
	// Perfil Musical
	musicRelationship: '',
	musicExperience: '',
	musicPreferences: '',
	musicAversions: '',
	musicResponses: '',
	
	// Cultural
	language: '',
	religion: '',
	culturalContext: '',
	identity: '',
	
	// Observações
	notes: ''
};

// ============================================================================
// CONVERSÃO: Terra Vibro Sensory -> TerraMidi
// ============================================================================

/**
 * Converte paciente do formato Terra Vibro Sensory para TerraMidi
 * @param {object} patient - Paciente no formato atual
 * @returns {object} Paciente no formato TerraMidi
 */
export function toTerraMidiFormat(patient) {
	// Extrai dados aninhados com fallbacks
	const id = patient.identification || {};
	const chief = patient.chiefComplaint || {};
	const medical = patient.medicalHistory || {};
	const psycho = patient.psychosocial || {};
	const music = patient.musicTherapyProfile || {};
	const plan = patient.therapeuticPlan || {};
	const physical = patient.physicalAssessment || {};
	
	return {
		// Identificação
		id: patient.id,
		createdAt: patient.createdAt || new Date().toISOString(),
		updatedAt: patient.updatedAt || new Date().toISOString(),
		fullName: id.fullName || patient.nome || '',
		birthDate: id.birthDate || patient.dataNascimento || '',
		contact: id.phone || patient.telefone || '',
		guardian: id.emergencyContact || '',
		
		// Consentimentos
		consentTreatment: plan.consentObtained || false,
		consentMedia: false,
		consentShare: false,
		
		// Encaminhamento
		referralSource: id.referralSource || '',
		referralDate: patient.createdAt?.split('T')[0] || '',
		referralReason: chief.mainComplaint || patient.queixaPrincipal || '',
		
		// Clínico
		diagnosis: medical.knownDiagnoses || patient.historico || '',
		medications: medical.currentMedications || patient.medicamentos || '',
		precautions: plan.precautions || patient.alergias || '',
		psychosocialHistory: psycho.recentLifeEvents || '',
		
		// Baselines (preserva se existir, senão usa padrão)
		baselines: patient.baselines || {
			cognitive: { value: 5, notes: '' },
			communication: { value: 5, notes: '' },
			emotional: { value: 5, notes: '' },
			social: { value: 5, notes: '' },
			motor: { value: 5, notes: '' }
		},
		
		// Perfil Musical
		musicRelationship: music.soundSensitivity || '',
		musicExperience: music.musicalBackground || '',
		musicPreferences: extractMusicPreferences(music),
		musicAversions: extractMusicAversions(music),
		musicResponses: '',
		
		// Cultural
		language: '',
		religion: '',
		culturalContext: '',
		identity: '',
		
		// Observações gerais
		notes: plan.observations || patient.observacoes || ''
	};
}

/**
 * Extrai preferências musicais de forma textual
 */
function extractMusicPreferences(musicProfile) {
	if (!musicProfile) return '';
	
	const parts = [];
	
	if (Array.isArray(musicProfile.preferredGenres)) {
		parts.push(musicProfile.preferredGenres.join(', '));
	}
	if (musicProfile.preferredArtists) {
		parts.push(musicProfile.preferredArtists);
	}
	
	return parts.join(' | ');
}

/**
 * Extrai aversões musicais de forma textual
 */
function extractMusicAversions(musicProfile) {
	if (!musicProfile) return '';
	
	if (Array.isArray(musicProfile.soundAversions)) {
		return musicProfile.soundAversions.join(', ');
	}
	
	return '';
}

// ============================================================================
// CONVERSÃO: TerraMidi -> Terra Vibro Sensory
// ============================================================================

/**
 * Converte paciente do formato TerraMidi para Terra Vibro Sensory
 * @param {object} tmPatient - Paciente no formato TerraMidi
 * @returns {object} Paciente no formato Terra Vibro Sensory
 */
export function fromTerraMidiFormat(tmPatient) {
	return {
		// ID e timestamps
		id: tmPatient.id,
		createdAt: tmPatient.createdAt,
		updatedAt: tmPatient.updatedAt,
		
		// Campo legado para compatibilidade
		nome: tmPatient.fullName,
		
		// Identificação estruturada
		identification: {
			fullName: tmPatient.fullName || '',
			preferredName: '',
			birthDate: tmPatient.birthDate || '',
			gender: '',
			maritalStatus: '',
			cpf: '',
			phone: tmPatient.contact || '',
			email: '',
			occupation: '',
			referralSource: tmPatient.referralSource || '',
			address: '',
			city: '',
			state: '',
			emergencyContact: tmPatient.guardian || '',
			emergencyPhone: ''
		},
		
		// Queixa principal
		chiefComplaint: {
			mainComplaint: tmPatient.referralReason || '',
			complaintDuration: '',
			painIntensity: 5,
			functionalImpact: ''
		},
		
		// Histórico médico
		medicalHistory: {
			knownDiagnoses: tmPatient.diagnosis || '',
			currentMedications: tmPatient.medications || '',
			allergies: tmPatient.precautions || '',
			previousSurgeries: '',
			familyHistory: ''
		},
		
		// Aspectos psicossociais
		psychosocial: {
			currentMood: '',
			anxietyLevel: '',
			recentLifeEvents: tmPatient.psychosocialHistory || '',
			copingStrategies: '',
			treatmentExpectations: ''
		},
		
		// Perfil musicoterapêutico
		musicTherapyProfile: {
			musicalBackground: tmPatient.musicExperience || '',
			preferredGenres: tmPatient.musicPreferences?.split(',').map(s => s.trim()).filter(Boolean) || [],
			preferredArtists: '',
			soundSensitivity: tmPatient.musicRelationship || '',
			soundAversions: tmPatient.musicAversions?.split(',').map(s => s.trim()).filter(Boolean) || [],
			therapeuticGoals: []
		},
		
		// Plano terapêutico
		therapeuticPlan: {
			clinicalSummary: '',
			therapeuticObjectives: '',
			recommendedProtocols: '',
			precautions: tmPatient.precautions || '',
			observations: tmPatient.notes || '',
			consentObtained: tmPatient.consentTreatment || false,
			consentDate: ''
		},
		
		// Campos TerraMidi preservados para sincronização futura
		baselines: tmPatient.baselines || {
			cognitive: { value: 5, notes: '' },
			communication: { value: 5, notes: '' },
			emotional: { value: 5, notes: '' },
			social: { value: 5, notes: '' },
			motor: { value: 5, notes: '' }
		},
		
		// Metadados de origem
		_terraMidiSync: {
			importedAt: new Date().toISOString(),
			originalId: tmPatient.id
		},
		
		// Sessões (do Terra Vibro Sensory, não do TerraMidi)
		sessions: []
	};
}

// ============================================================================
// IMPORTAÇÃO DE PRONTUÁRIO TERRAMIDI
// ============================================================================

/**
 * Importa prontuário de dados já parseados do TerraMidi
 * @param {object} data - Dados JSON já parseados do TerraMidi
 * @returns {Promise<object>} Resultado da importação
 */
export async function importTerraMidiData(data) {
	try {
		// Valida formato
		if (!data.patients || !Array.isArray(data.patients)) {
			throw new Error('Formato inválido: dados não contém lista de pacientes');
		}
		
		const result = {
			imported: 0,
			updated: 0,
			skipped: 0,
			errors: []
		};
		
		for (const tmPatient of data.patients) {
			try {
				// Valida dados mínimos
				if (!tmPatient.id || !tmPatient.fullName) {
					result.skipped++;
					continue;
				}
				
				// Converte para formato local
				const patient = fromTerraMidiFormat(tmPatient);
				
				// Verifica se já existe
				const existingIndex = state.patients.findIndex(p => p.id === patient.id);
				
				if (existingIndex >= 0) {
					// Atualiza existente (merge)
					const existing = state.patients[existingIndex];
					const merged = mergePatientData(existing, patient);
					merged.updatedAt = new Date().toISOString();
					
					state.patients[existingIndex] = merged;
					await stores.patients.setItem(merged.id, merged);
					result.updated++;
				} else {
					// Adiciona novo
					state.patients.push(patient);
					await stores.patients.setItem(patient.id, patient);
					result.imported++;
				}
				
			} catch (err) {
				console.error('Erro ao importar paciente:', tmPatient, err);
				result.errors.push(`${tmPatient.fullName || tmPatient.id}: ${err.message}`);
			}
		}
		
		// Reordena lista
		state.patients.sort((a, b) => {
			const nameA = a.identification?.fullName || a.nome || '';
			const nameB = b.identification?.fullName || b.nome || '';
			return nameA.localeCompare(nameB);
		});
		
		console.log(`TerraMidi Import: ${result.imported} novos, ${result.updated} atualizados, ${result.skipped} ignorados`);
		
		if (result.errors.length > 0) {
			console.warn('Erros durante importação:', result.errors);
		}
		
		return result;
		
	} catch (error) {
		console.error('TerraMidi Import Error:', error);
		throw new Error(`Erro ao importar: ${error.message}`);
	}
}

/**
 * Importa prontuário de arquivo TerraMidi
 * @param {File} file - Arquivo JSON exportado do TerraMidi
 * @returns {Promise<object>} Resultado da importação
 */
export async function importTerraMidiFile(file) {
	const text = await file.text();
	const data = JSON.parse(text);
	return importTerraMidiData(data);
}

/**
 * Mescla dados de paciente preservando informações de ambos os sistemas
 */
function mergePatientData(existing, imported) {
	return {
		...existing,
		// Atualiza campos básicos do TerraMidi
		identification: {
			...existing.identification,
			...imported.identification,
			// Preserva dados locais mais completos
			fullName: imported.identification?.fullName || existing.identification?.fullName
		},
		// Atualiza baselines do TerraMidi
		baselines: imported.baselines || existing.baselines,
		// Preserva sessões locais
		sessions: existing.sessions || [],
		// Atualiza metadados de sync
		_terraMidiSync: {
			...existing._terraMidiSync,
			lastSyncAt: new Date().toISOString()
		}
	};
}

// ============================================================================
// EXPORTAÇÃO PARA TERRAMIDI
// ============================================================================

/**
 * Exporta prontuário no formato TerraMidi
 * @param {string[]} patientIds - IDs dos pacientes (null = todos)
 * @returns {object} Dados no formato TerraMidi
 */
export function exportToTerraMidi(patientIds = null) {
	const patientsToExport = patientIds 
		? state.patients.filter(p => patientIds.includes(p.id))
		: state.patients;
	
	const data = {
		version: '1.0',
		exportedAt: new Date().toISOString(),
		exportedFrom: 'Terra Vibro Sensory Musical',
		patients: patientsToExport.map(toTerraMidiFormat),
		// Não exportamos plans e sessions pois são específicos do TerraMidi
		plans: [],
		sessions: []
	};
	
	return data;
}

/**
 * Baixa arquivo de exportação TerraMidi
 * @param {string[]} patientIds - IDs dos pacientes (null = todos)
 */
export function downloadTerraMidiExport(patientIds = null) {
	const data = exportToTerraMidi(patientIds);
	
	const blob = new Blob([JSON.stringify(data, null, 2)], { 
		type: 'application/json' 
	});
	const url = URL.createObjectURL(blob);
	
	const dateStr = new Date().toISOString().split('T')[0];
	const a = document.createElement('a');
	a.href = url;
	a.download = `terramidi-pacientes-${dateStr}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	
	URL.revokeObjectURL(url);
	
	console.log(`TerraMidi Export: ${data.patients.length} pacientes exportados`);
	
	return data;
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

/**
 * Verifica se um arquivo é um export válido do TerraMidi
 * @param {File} file - Arquivo para verificar
 * @returns {Promise<boolean>}
 */
export async function isValidTerraMidiFile(file) {
	try {
		if (!file.name.endsWith('.json')) return false;
		
		const text = await file.text();
		const data = JSON.parse(text);
		
		return data.patients && Array.isArray(data.patients);
	} catch {
		return false;
	}
}

/**
 * Obtém resumo de um arquivo TerraMidi antes de importar
 * @param {File} file - Arquivo TerraMidi
 * @returns {Promise<object>} Resumo do conteúdo
 */
export async function getTerraMidiFileSummary(file) {
	const text = await file.text();
	const data = JSON.parse(text);
	
	const patientNames = data.patients?.map(p => p.fullName).filter(Boolean) || [];
	
	return {
		version: data.version || 'unknown',
		exportedAt: data.exportedAt,
		exportedFrom: data.exportedFrom || 'TerraMidi',
		patientsCount: data.patients?.length || 0,
		plansCount: data.plans?.length || 0,
		sessionsCount: data.sessions?.length || 0,
		patientNames: patientNames.slice(0, 10), // Primeiros 10 nomes
		hasMore: patientNames.length > 10
	};
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
	// Conversão
	toTerraMidiFormat,
	fromTerraMidiFormat,
	
	// Import/Export
	importTerraMidiData,
	importTerraMidiFile,
	exportToTerraMidi,
	downloadTerraMidiExport,
	
	// Utilitários
	isValidTerraMidiFile,
	getTerraMidiFileSummary
};
