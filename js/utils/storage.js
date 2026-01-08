/**
 * =============================================================================
 * TERRA SENSORY MUSICAL - Armazenamento e Persistência
 * =============================================================================
 * 
 * Gerenciamento de dados com LocalForage (IndexedDB).
 * Separação de stores para diferentes tipos de dados.
 */

// Stores de dados
export const stores = {
	// Dados gerais (presets, configurações)
	data: localforage.createInstance({ 
		name: 'terra-sensory', 
		storeName: 'ts_data' 
	}),
	
	// Arquivos de música
	music: localforage.createInstance({ 
		name: 'terra-sensory', 
		storeName: 'ts_music' 
	}),
	
	// Histórico de sessões
	history: localforage.createInstance({ 
		name: 'terra-sensory', 
		storeName: 'ts_history' 
	}),
	
	// Dados de pacientes (persistente separado)
	patients: localforage.createInstance({ 
		name: 'terra-sensory-patients', 
		storeName: 'ts_patients',
		description: 'Dados de pacientes e anamnese - persistente'
	})
};

/**
 * Gera um UUID único
 * @returns {string} UUID
 */
export const uuid = () => {
	return crypto?.randomUUID 
		? crypto.randomUUID() 
		: `ts-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
};

/**
 * Salva dados em um store
 * @param {string} store - Nome do store
 * @param {string} key - Chave
 * @param {*} value - Valor
 */
export async function saveToStore(store, key, value) {
	try {
		await stores[store].setItem(key, value);
		return true;
	} catch (error) {
		console.error(`Erro ao salvar em ${store}/${key}:`, error);
		return false;
	}
}

/**
 * Carrega dados de um store
 * @param {string} store - Nome do store
 * @param {string} key - Chave
 * @param {*} defaultValue - Valor padrão se não existir
 */
export async function loadFromStore(store, key, defaultValue = null) {
	try {
		const value = await stores[store].getItem(key);
		return value !== null ? value : defaultValue;
	} catch (error) {
		console.error(`Erro ao carregar de ${store}/${key}:`, error);
		return defaultValue;
	}
}
