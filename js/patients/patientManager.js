/**
 * =============================================================================
 * TERRA SENSORY MUSICAL - Gerenciador de Pacientes
 * =============================================================================
 * 
 * Sistema de gestão de pacientes e sessões:
 * - CRUD de pacientes
 * - Anamnese completa
 * - Histórico de sessões
 * - Conformidade LGPD/GDPR
 * - Armazenamento local em pasta selecionável (File System Access API)
 */

import { state, STORAGE_KEYS } from '../core/state.js';
import { stores, uuid } from '../utils/storage.js';

// Referências de UI
let ui = {};

// ============================================================================
// FILE SYSTEM ACCESS API - ARMAZENAMENTO LOCAL
// ============================================================================

// Handle da pasta selecionada para armazenamento
let folderHandle = null;

// Chave para armazenar o handle da pasta
const FOLDER_HANDLE_KEY = 'patientFolderHandle';

/**
 * Verifica se o navegador suporta File System Access API
 */
export function isFileSystemSupported() {
	return 'showDirectoryPicker' in window;
}

/**
 * Seleciona pasta para armazenamento de dados de pacientes
 */
export async function selectPatientFolder() {
	if (!isFileSystemSupported()) {
		alert('Seu navegador não suporta a seleção de pastas locais. Use o Chrome, Edge ou Opera para esta funcionalidade.');
		return null;
	}

	try {
		// Abre diálogo de seleção de pasta
		folderHandle = await window.showDirectoryPicker({
			mode: 'readwrite',
			startIn: 'documents'
		});

		// Salva o handle para uso futuro
		await saveFolderHandle(folderHandle);

		// Atualiza a UI
		updateFolderUI();

		console.log(`Pacientes: Pasta selecionada: ${folderHandle.name}`);
		
		// Sincroniza dados existentes com a nova pasta
		await syncToFolder();

		return folderHandle;

	} catch (error) {
		if (error.name === 'AbortError') {
			console.log('Pacientes: Seleção de pasta cancelada');
		} else {
			console.error('Pacientes: Erro ao selecionar pasta:', error);
			alert('Erro ao selecionar pasta. Verifique as permissões.');
		}
		return null;
	}
}

/**
 * Salva o handle da pasta no IndexedDB
 */
async function saveFolderHandle(handle) {
	try {
		await stores.data.setItem(FOLDER_HANDLE_KEY, handle);
	} catch (error) {
		console.warn('Pacientes: Não foi possível persistir o handle da pasta:', error);
	}
}

/**
 * Recupera o handle da pasta salvo
 */
export async function restoreFolderHandle() {
	try {
		const savedHandle = await stores.data.getItem(FOLDER_HANDLE_KEY);
		
		if (savedHandle) {
			// Verifica se ainda temos permissão
			const permission = await savedHandle.queryPermission({ mode: 'readwrite' });
			
			if (permission === 'granted') {
				folderHandle = savedHandle;
				updateFolderUI();
				console.log(`Pacientes: Pasta restaurada: ${folderHandle.name}`);
				return folderHandle;
			} else if (permission === 'prompt') {
				// Solicita permissão novamente
				const newPermission = await savedHandle.requestPermission({ mode: 'readwrite' });
				if (newPermission === 'granted') {
					folderHandle = savedHandle;
					updateFolderUI();
					console.log(`Pacientes: Permissão concedida para: ${folderHandle.name}`);
					return folderHandle;
				}
			}
		}
	} catch (error) {
		console.warn('Pacientes: Erro ao restaurar pasta:', error);
	}
	
	return null;
}

/**
 * Atualiza UI com informações da pasta
 */
function updateFolderUI() {
	const pathEl = document.getElementById('storagePath');
	const statusEl = document.getElementById('storageStatus');
	
	if (pathEl) {
		pathEl.textContent = folderHandle 
			? `📁 ${folderHandle.name}` 
			: 'IndexedDB (Navegador)';
	}
	
	if (statusEl) {
		if (folderHandle) {
			statusEl.classList.add('synced');
		} else {
			statusEl.classList.remove('synced');
		}
	}
}

/**
 * Sincroniza todos os pacientes com a pasta selecionada
 */
export async function syncToFolder() {
	if (!folderHandle) return;
	
	const pathEl = document.getElementById('storagePath');
	
	try {
		if (pathEl) {
			const originalText = pathEl.textContent;
			pathEl.innerHTML = `<i class="fa-solid fa-sync fa-spin"></i> Sincronizando...`;
		}

		// Cria subpasta para pacientes se não existir
		const patientsFolder = await folderHandle.getDirectoryHandle('pacientes', { create: true });
		
		// Salva cada paciente como arquivo JSON
		for (const patient of state.patients) {
			await savePatientToFile(patientsFolder, patient);
		}
		
		// Cria arquivo de índice
		await saveIndexFile(folderHandle);

		if (pathEl) {
			pathEl.innerHTML = `<i class="fa-solid fa-check-circle"></i> 📁 ${folderHandle.name}`;
		}

		console.log(`Pacientes: ${state.patients.length} pacientes sincronizados com a pasta`);
		
	} catch (error) {
		console.error('Pacientes: Erro ao sincronizar:', error);
		if (pathEl) {
			pathEl.innerHTML = `<i class="fa-solid fa-exclamation-triangle"></i> Erro na sincronização`;
		}
	}
}

/**
 * Salva um paciente como arquivo JSON na pasta
 */
async function savePatientToFile(patientsFolder, patient) {
	try {
		const filename = `${sanitizeFilename(patient.nome)}_${patient.id}.json`;
		const fileHandle = await patientsFolder.getFileHandle(filename, { create: true });
		const writable = await fileHandle.createWritable();
		
		const data = {
			...patient,
			exportedAt: new Date().toISOString(),
			app: 'Terra Sensory Musical'
		};
		
		await writable.write(JSON.stringify(data, null, 2));
		await writable.close();
		
	} catch (error) {
		console.warn(`Pacientes: Erro ao salvar ${patient.nome}:`, error);
	}
}

/**
 * Salva arquivo de índice com resumo dos pacientes
 */
async function saveIndexFile(rootFolder) {
	try {
		const fileHandle = await rootFolder.getFileHandle('_index.json', { create: true });
		const writable = await fileHandle.createWritable();
		
		const index = {
			updatedAt: new Date().toISOString(),
			app: 'Terra Sensory Musical',
			version: '1.0',
			patientsCount: state.patients.length,
			patients: state.patients.map(p => ({
				id: p.id,
				nome: p.nome,
				sessionsCount: p.sessions?.length || 0,
				createdAt: p.createdAt,
				updatedAt: p.updatedAt
			}))
		};
		
		await writable.write(JSON.stringify(index, null, 2));
		await writable.close();
		
	} catch (error) {
		console.warn('Pacientes: Erro ao salvar índice:', error);
	}
}

/**
 * Carrega pacientes da pasta selecionada
 */
export async function loadFromFolder() {
	if (!folderHandle) return [];
	
	try {
		const patientsFolder = await folderHandle.getDirectoryHandle('pacientes', { create: false });
		const patients = [];
		
		for await (const entry of patientsFolder.values()) {
			if (entry.kind === 'file' && entry.name.endsWith('.json')) {
				try {
					const file = await entry.getFile();
					const content = await file.text();
					const patient = JSON.parse(content);
					
					if (patient.id && patient.nome) {
						patients.push(patient);
					}
				} catch (err) {
					console.warn(`Pacientes: Erro ao ler ${entry.name}:`, err);
				}
			}
		}
		
		return patients;
		
	} catch (error) {
		// Pasta não existe ainda
		if (error.name === 'NotFoundError') {
			return [];
		}
		console.error('Pacientes: Erro ao carregar da pasta:', error);
		return [];
	}
}

/**
 * Remove arquivo de paciente da pasta
 */
async function removePatientFile(patient) {
	if (!folderHandle) return;
	
	try {
		const patientsFolder = await folderHandle.getDirectoryHandle('pacientes', { create: false });
		const filename = `${sanitizeFilename(patient.nome)}_${patient.id}.json`;
		await patientsFolder.removeEntry(filename);
	} catch (error) {
		// Arquivo pode não existir
		console.warn('Pacientes: Arquivo não encontrado para remoção:', error);
	}
}

/**
 * Sanitiza nome para uso em arquivo
 */
function sanitizeFilename(name) {
	return (name || 'paciente')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '') // Remove acentos
		.replace(/[^a-zA-Z0-9]/g, '_') // Substitui caracteres especiais
		.substring(0, 50);
}

/**
 * Retorna o caminho da pasta atual
 */
export function getCurrentFolderPath() {
	return folderHandle ? folderHandle.name : null;
}

/**
 * Injeta referências de UI
 */
export function injectUIReferences(uiRefs) {
	ui = uiRefs;
}

// ============================================================================
// CRUD DE PACIENTES
// ============================================================================

/**
 * Carrega todos os pacientes do IndexedDB
 */
export async function loadPatients() {
	try {
		// Tenta restaurar pasta de armazenamento local
		await restoreFolderHandle();
		
		const keys = await stores.patients.keys();
		state.patients = [];
		
		for (const key of keys) {
			try {
				const patient = await stores.patients.getItem(key);
				if (patient) {
					state.patients.push(patient);
				}
			} catch (err) {
				console.warn(`Pacientes: Erro ao carregar ${key}:`, err);
			}
		}
		
		// Ordena por nome
		state.patients.sort((a, b) => 
			(a.nome || '').localeCompare(b.nome || '')
		);
		
		console.log(`Pacientes: ${state.patients.length} carregados`);
		updatePatientsList();
		updateFolderUI();
		
		return state.patients;
		
	} catch (error) {
		console.error('Pacientes: Erro ao carregar:', error);
		return [];
	}
}

/**
 * Salva um novo paciente
 * @param {object} data - Dados do paciente
 */
export async function savePatient(data) {
	try {
		const patient = {
			id: uuid(),
			...data,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			sessions: []
		};
		
		await stores.patients.setItem(patient.id, patient);
		state.patients.push(patient);
		
		// Reordena
		state.patients.sort((a, b) => 
			(a.nome || '').localeCompare(b.nome || '')
		);
		
		updatePatientsList();
		console.log(`Pacientes: "${patient.nome}" salvo`);
		
		// Sincroniza com pasta local se configurada
		await syncToFolder();
		
		return patient;
		
	} catch (error) {
		console.error('Pacientes: Erro ao salvar:', error);
		throw error;
	}
}

/**
 * Atualiza um paciente existente
 * @param {string} id - ID do paciente
 * @param {object} data - Novos dados
 */
export async function updatePatient(id, data) {
	try {
		const index = state.patients.findIndex(p => p.id === id);
		if (index === -1) {
			throw new Error('Paciente não encontrado');
		}
		
		const patient = {
			...state.patients[index],
			...data,
			updatedAt: new Date().toISOString()
		};
		
		await stores.patients.setItem(id, patient);
		state.patients[index] = patient;
		
		updatePatientsList();
		console.log(`Pacientes: "${patient.nome}" atualizado`);
		
		// Sincroniza com pasta local se configurada
		await syncToFolder();
		
		return patient;
		
	} catch (error) {
		console.error('Pacientes: Erro ao atualizar:', error);
		throw error;
	}
}

/**
 * Remove um paciente
 * @param {string} id - ID do paciente
 */
export async function deletePatient(id) {
	try {
		const patient = state.patients.find(p => p.id === id);
		
		await stores.patients.removeItem(id);
		state.patients = state.patients.filter(p => p.id !== id);
		
		// Limpa seleção se era o selecionado
		if (state.selectedPatient?.id === id) {
			state.selectedPatient = null;
		}
		
		// Remove arquivo da pasta local
		if (patient) {
			await removePatientFile(patient);
		}
		
		// Atualiza índice na pasta
		await syncToFolder();
		
		updatePatientsList();
		console.log(`Pacientes: "${patient?.nome || id}" removido`);
		
	} catch (error) {
		console.error('Pacientes: Erro ao remover:', error);
		throw error;
	}
}

/**
 * Busca paciente por ID
 * @param {string} id - ID do paciente
 */
export function getPatientById(id) {
	return state.patients.find(p => p.id === id);
}

/**
 * Busca pacientes por termo
 * @param {string} term - Termo de busca
 */
export function searchPatients(term) {
	if (!term) return state.patients;
	
	const searchTerm = term.toLowerCase();
	return state.patients.filter(p => 
		(p.nome || '').toLowerCase().includes(searchTerm) ||
		(p.email || '').toLowerCase().includes(searchTerm) ||
		(p.telefone || '').includes(term)
	);
}

// ============================================================================
// SESSÕES
// ============================================================================

/**
 * Adiciona uma sessão ao paciente
 * @param {string} patientId - ID do paciente
 * @param {object} sessionData - Dados da sessão
 */
export async function addSession(patientId, sessionData) {
	try {
		const patient = getPatientById(patientId);
		if (!patient) {
			throw new Error('Paciente não encontrado');
		}
		
		const session = {
			id: uuid(),
			date: new Date().toISOString(),
			...sessionData
		};
		
		if (!patient.sessions) {
			patient.sessions = [];
		}
		
		patient.sessions.push(session);
		patient.updatedAt = new Date().toISOString();
		
		await stores.patients.setItem(patientId, patient);
		
		// Atualiza também no histórico geral
		await addToHistory(session, patient);
		
		console.log(`Pacientes: Sessão adicionada para "${patient.nome}"`);
		return session;
		
	} catch (error) {
		console.error('Pacientes: Erro ao adicionar sessão:', error);
		throw error;
	}
}

/**
 * Adiciona sessão ao histórico geral
 */
async function addToHistory(session, patient) {
	try {
		const historyEntry = {
			...session,
			patientId: patient.id,
			patientName: patient.nome
		};
		
		await stores.history.setItem(session.id, historyEntry);
		state.sessionHistory.push(historyEntry);
		
	} catch (error) {
		console.warn('Pacientes: Erro ao adicionar ao histórico:', error);
	}
}

/**
 * Obtém histórico de sessões de um paciente
 * @param {string} patientId - ID do paciente
 */
export function getPatientSessions(patientId) {
	const patient = getPatientById(patientId);
	return patient?.sessions || [];
}

/**
 * Carrega histórico geral de sessões
 */
export async function loadSessionHistory() {
	try {
		const keys = await stores.history.keys();
		state.sessionHistory = [];
		
		for (const key of keys) {
			const entry = await stores.history.getItem(key);
			if (entry) {
				state.sessionHistory.push(entry);
			}
		}
		
		// Ordena por data (mais recente primeiro)
		state.sessionHistory.sort((a, b) => 
			new Date(b.date) - new Date(a.date)
		);
		
		console.log(`Histórico: ${state.sessionHistory.length} sessões`);
		return state.sessionHistory;
		
	} catch (error) {
		console.error('Histórico: Erro ao carregar:', error);
		return [];
	}
}

// ============================================================================
// ANAMNESE
// ============================================================================

/**
 * Campos da anamnese
 */
export const ANAMNESIS_FIELDS = {
	personal: [
		{ id: 'nome', label: 'Nome Completo', type: 'text', required: true },
		{ id: 'dataNascimento', label: 'Data de Nascimento', type: 'date' },
		{ id: 'email', label: 'E-mail', type: 'email' },
		{ id: 'telefone', label: 'Telefone', type: 'tel' },
		{ id: 'profissao', label: 'Profissão', type: 'text' }
	],
	health: [
		{ id: 'queixaPrincipal', label: 'Queixa Principal', type: 'textarea' },
		{ id: 'historico', label: 'Histórico de Saúde', type: 'textarea' },
		{ id: 'medicamentos', label: 'Medicamentos em Uso', type: 'textarea' },
		{ id: 'alergias', label: 'Alergias', type: 'textarea' }
	],
	contraindications: [
		{ id: 'epilepsia', label: 'Histórico de epilepsia', type: 'checkbox', warning: true },
		{ id: 'marcapasso', label: 'Usa marcapasso', type: 'checkbox', warning: true },
		{ id: 'gravidez', label: 'Gestante', type: 'checkbox', warning: true },
		{ id: 'audicao', label: 'Problemas auditivos', type: 'checkbox' },
		{ id: 'psiquiatrico', label: 'Tratamento psiquiátrico', type: 'checkbox' }
	],
	preferences: [
		{ id: 'estiloMusical', label: 'Preferência Musical', type: 'select', 
			options: ['Clássica', 'Ambiente', 'Natureza', 'Eletrônica', 'Instrumental', 'Outro'] },
		{ id: 'experienciaPrevia', label: 'Experiência prévia com terapia sonora', type: 'textarea' },
		{ id: 'objetivos', label: 'Objetivos do tratamento', type: 'textarea' }
	]
};

/**
 * Valida dados da anamnese
 * @param {object} data - Dados a validar
 */
export function validateAnamnesis(data) {
	const errors = [];
	const warnings = [];
	
	// Campos obrigatórios
	if (!data.nome?.trim()) {
		errors.push('Nome é obrigatório');
	}
	
	// Contraindicações (avisos)
	if (data.epilepsia) {
		warnings.push('Atenção: Paciente com histórico de epilepsia. Batimentos binaurais podem desencadear crises em pessoas sensíveis.');
	}
	
	if (data.marcapasso) {
		warnings.push('Atenção: Paciente usa marcapasso. Consulte o médico antes de iniciar o tratamento.');
	}
	
	if (data.gravidez) {
		warnings.push('Atenção: Paciente gestante. Evite frequências muito baixas (< 4Hz).');
	}
	
	return { 
		valid: errors.length === 0, 
		errors, 
		warnings 
	};
}

// ============================================================================
// UI
// ============================================================================

/**
 * Atualiza lista de pacientes na UI
 */
function updatePatientsList() {
	if (!ui.patientsList) return;
	
	ui.patientsList.innerHTML = '';
	
	if (state.patients.length === 0) {
		ui.patientsList.innerHTML = `
			<div class="empty-list">
				<i class="fa-solid fa-users"></i>
				<p>Nenhum paciente cadastrado</p>
			</div>
		`;
		return;
	}
	
	state.patients.forEach(patient => {
		const item = createPatientListItem(patient);
		ui.patientsList.appendChild(item);
	});
	
	// Atualiza select de pacientes se existir
	updatePatientSelect();
}

/**
 * Cria item de lista de paciente
 */
function createPatientListItem(patient) {
	const item = document.createElement('div');
	item.className = 'patient-item';
	item.dataset.id = patient.id;
	
	const initials = getInitials(patient.nome);
	const sessionCount = patient.sessions?.length || 0;
	const lastSession = patient.sessions?.[patient.sessions.length - 1];
	const lastSessionDate = lastSession 
		? formatDate(lastSession.date) 
		: 'Nenhuma sessão';
	
	item.innerHTML = `
		<div class="patient-item__avatar">${initials}</div>
		<div class="patient-item__info">
			<span class="patient-item__name">${escapeHtml(patient.nome)}</span>
			<span class="patient-item__meta">
				${sessionCount} sessões • Última: ${lastSessionDate}
			</span>
		</div>
		<div class="patient-item__actions">
			<button class="btn-icon" data-action="edit" title="Editar">
				<i class="fa-solid fa-pen"></i>
			</button>
			<button class="btn-icon" data-action="delete" title="Remover">
				<i class="fa-solid fa-trash"></i>
			</button>
		</div>
	`;
	
	// Eventos
	item.addEventListener('click', (e) => {
		const action = e.target.closest('[data-action]')?.dataset.action;
		
		if (action === 'edit') {
			openPatientModal(patient.id);
		} else if (action === 'delete') {
			confirmDeletePatient(patient);
		} else {
			selectPatient(patient.id);
		}
	});
	
	return item;
}

/**
 * Atualiza select de pacientes
 */
function updatePatientSelect() {
	if (!ui.patientSelect) return;
	
	const currentValue = ui.patientSelect.value;
	
	ui.patientSelect.innerHTML = '<option value="">Selecione um paciente...</option>';
	
	state.patients.forEach(patient => {
		const option = document.createElement('option');
		option.value = patient.id;
		option.textContent = patient.nome;
		ui.patientSelect.appendChild(option);
	});
	
	// Restaura seleção
	if (currentValue) {
		ui.patientSelect.value = currentValue;
	}
}

/**
 * Seleciona um paciente
 */
export function selectPatient(id) {
	state.selectedPatient = getPatientById(id);
	
	// Atualiza UI
	if (ui.patientsList) {
		ui.patientsList.querySelectorAll('.patient-item').forEach(item => {
			item.classList.toggle('selected', item.dataset.id === id);
		});
	}
	
	if (ui.patientSelect) {
		ui.patientSelect.value = id;
	}
	
	// Dispara evento
	document.dispatchEvent(new CustomEvent('patientSelected', {
		detail: state.selectedPatient
	}));
}

/**
 * Abre modal de paciente (novo ou edição)
 */
export function openPatientModal(patientId = null) {
	const patient = patientId ? getPatientById(patientId) : null;
	
	if (ui.patientModal) {
		// Preenche formulário se editando
		if (patient && ui.patientForm) {
			populateForm(ui.patientForm, patient);
			ui.patientModal.querySelector('.modal-title').textContent = 'Editar Paciente';
		} else if (ui.patientForm) {
			ui.patientForm.reset();
			ui.patientModal.querySelector('.modal-title').textContent = 'Novo Paciente';
		}
		
		ui.patientModal.dataset.patientId = patientId || '';
		ui.patientModal.classList.remove('hidden');
	}
}

/**
 * Fecha modal de paciente
 */
export function closePatientModal() {
	if (ui.patientModal) {
		ui.patientModal.classList.add('hidden');
		ui.patientModal.dataset.patientId = '';
	}
}

/**
 * Confirmação de exclusão
 */
function confirmDeletePatient(patient) {
	if (confirm(`Deseja realmente excluir o paciente "${patient.nome}"?\n\nEsta ação não pode ser desfeita.`)) {
		deletePatient(patient.id);
	}
}

// ============================================================================
// EXPORTAÇÃO DE DADOS
// ============================================================================

/**
 * Exporta dados de um paciente
 * @param {string} patientId - ID do paciente
 */
export function exportPatientData(patientId) {
	const patient = getPatientById(patientId);
	if (!patient) return null;
	
	// Remove dados sensíveis do ID interno
	const exportData = {
		...patient,
		exportedAt: new Date().toISOString(),
		exportedFrom: 'Terra Sensory Musical'
	};
	
	const json = JSON.stringify(exportData, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	
	const a = document.createElement('a');
	a.href = url;
	a.download = `paciente_${patient.nome.replace(/\s+/g, '_')}_${formatDateForFile(new Date())}.json`;
	a.click();
	
	URL.revokeObjectURL(url);
	
	return exportData;
}

/**
 * Exporta todos os dados (backup)
 */
export async function exportAllData() {
	const backup = {
		patients: state.patients,
		sessionHistory: state.sessionHistory,
		exportedAt: new Date().toISOString(),
		version: '1.0',
		app: 'Terra Sensory Musical'
	};
	
	const json = JSON.stringify(backup, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	
	const a = document.createElement('a');
	a.href = url;
	a.download = `terra_sensory_backup_${formatDateForFile(new Date())}.json`;
	a.click();
	
	URL.revokeObjectURL(url);
	
	return backup;
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

function getInitials(name) {
	if (!name) return '?';
	return name
		.split(' ')
		.map(word => word[0])
		.slice(0, 2)
		.join('')
		.toUpperCase();
}

function formatDate(dateStr) {
	if (!dateStr) return '';
	const date = new Date(dateStr);
	return date.toLocaleDateString('pt-BR');
}

function formatDateForFile(date) {
	return date.toISOString().split('T')[0];
}

function escapeHtml(text) {
	if (!text) return '';
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

function populateForm(form, data) {
	Object.keys(data).forEach(key => {
		const input = form.elements[key];
		if (input) {
			if (input.type === 'checkbox') {
				input.checked = !!data[key];
			} else {
				input.value = data[key] || '';
			}
		}
	});
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
	injectUI: injectUIReferences,
	load: loadPatients,
	save: savePatient,
	update: updatePatient,
	delete: deletePatient,
	getById: getPatientById,
	search: searchPatients,
	addSession,
	getSessions: getPatientSessions,
	loadHistory: loadSessionHistory,
	select: selectPatient,
	openModal: openPatientModal,
	closeModal: closePatientModal,
	exportPatient: exportPatientData,
	exportAll: exportAllData,
	ANAMNESIS_FIELDS,
	validateAnamnesis,
	// File System Access API
	selectFolder: selectPatientFolder,
	syncToFolder,
	loadFromFolder,
	getCurrentFolderPath,
	isFileSystemSupported
};
