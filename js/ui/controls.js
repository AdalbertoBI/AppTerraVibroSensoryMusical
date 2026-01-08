/**
 * =============================================================================
 * TERRA VIBRO SENSORY MUSICAL - Controles de UI
 * =============================================================================
 * 
 * Gerencia os controles do formulário principal:
 * - Sliders e inputs
 * - Atualizações em tempo real
 * - Validação de valores
 */

import { state } from '../core/state.js';
import { updateBinauralFrequencies, updateBinauralVolume, updateLowpassFrequency } from '../audio/binaural.js';

// Referências de UI
let ui = {};

/**
 * Injeta referências de UI
 */
export function injectUIReferences(uiRefs) {
	ui = uiRefs;
}

// ============================================================================
// CONFIGURAÇÃO DOS CONTROLES
// ============================================================================

/**
 * Inicializa todos os controles do formulário
 */
export function initControls() {
	setupRangeInputs();
	setupNumericInputs();
	setupPresetSelector();
	setupDurationControls();
	
	console.log('Controles: Inicializados');
}

/**
 * Configura inputs range (sliders)
 */
function setupRangeInputs() {
	// Frequência base
	if (ui.baseFreqSlider && ui.baseFreqInput) {
		syncInputs(ui.baseFreqSlider, ui.baseFreqInput, (value) => {
			if (state.isSessionRunning) {
				updateBinauralFrequencies(
					parseFloat(value),
					parseFloat(ui.diffFreqInput?.value || 10)
				);
			}
		});
	}
	
	// Frequência de diferença (binaural)
	if (ui.diffFreqSlider && ui.diffFreqInput) {
		syncInputs(ui.diffFreqSlider, ui.diffFreqInput, (value) => {
			updateDiffFreqLabel(parseFloat(value));
			if (state.isSessionRunning) {
				updateBinauralFrequencies(
					parseFloat(ui.baseFreqInput?.value || 200),
					parseFloat(value)
				);
			}
		});
	}
	
	// Volume binaural
	if (ui.volumeSlider && ui.volumeInput) {
		syncInputs(ui.volumeSlider, ui.volumeInput, (value) => {
			if (state.isSessionRunning) {
				updateBinauralVolume(parseFloat(value) / 100);
			}
		});
	}
	
	// Filtro lowpass
	if (ui.lowpassSlider && ui.lowpassInput) {
		syncInputs(ui.lowpassSlider, ui.lowpassInput, (value) => {
			if (state.isSessionRunning) {
				updateLowpassFrequency(parseFloat(value));
			}
		});
	}
	
	// Mix música/binaural
	if (ui.mixSlider && ui.mixInput) {
		syncInputs(ui.mixSlider, ui.mixInput, (value) => {
			updateMixLabel(parseFloat(value));
		});
	}
}

/**
 * Sincroniza slider com input numérico
 */
function syncInputs(slider, input, onChange) {
	// Slider → Input
	slider.addEventListener('input', () => {
		input.value = slider.value;
		onChange?.(slider.value);
	});
	
	// Input → Slider
	input.addEventListener('input', () => {
		const min = parseFloat(slider.min);
		const max = parseFloat(slider.max);
		let value = parseFloat(input.value);
		
		// Limita ao range
		if (value < min) value = min;
		if (value > max) value = max;
		
		slider.value = value;
		input.value = value;
		onChange?.(value);
	});
	
	// Blur: valida e corrige
	input.addEventListener('blur', () => {
		const min = parseFloat(slider.min);
		const max = parseFloat(slider.max);
		let value = parseFloat(input.value) || min;
		
		value = Math.max(min, Math.min(max, value));
		input.value = value;
		slider.value = value;
	});
}

/**
 * Configura inputs numéricos avulsos
 */
function setupNumericInputs() {
	// Valida inputs numéricos para não aceitar valores negativos
	document.querySelectorAll('input[type="number"]').forEach(input => {
		input.addEventListener('input', () => {
			const min = parseFloat(input.min) || 0;
			if (parseFloat(input.value) < min) {
				input.value = min;
			}
		});
	});
}

/**
 * Configura seletor de preset
 */
function setupPresetSelector() {
	if (!ui.presetSelect) return;
	
	ui.presetSelect.addEventListener('change', () => {
		const presetName = ui.presetSelect.value;
		if (presetName) {
			loadPreset(presetName);
		}
	});
}

/**
 * Configura controles de duração
 */
function setupDurationControls() {
	// Minutos e segundos
	if (ui.durationMinutes && ui.durationSeconds) {
		ui.durationMinutes.addEventListener('blur', () => {
			const value = parseInt(ui.durationMinutes.value) || 0;
			ui.durationMinutes.value = Math.max(0, Math.min(180, value));
		});
		
		ui.durationSeconds.addEventListener('blur', () => {
			const value = parseInt(ui.durationSeconds.value) || 0;
			ui.durationSeconds.value = Math.max(0, Math.min(59, value));
		});
	}
}

// ============================================================================
// LABELS E FEEDBACK VISUAL
// ============================================================================

/**
 * Atualiza label da frequência de diferença (faixa cerebral)
 */
function updateDiffFreqLabel(freq) {
	if (!ui.diffFreqLabel) return;
	
	const band = getBrainwaveBand(freq);
	ui.diffFreqLabel.textContent = `${freq.toFixed(1)} Hz (${band.name})`;
	ui.diffFreqLabel.className = `freq-label ${band.class}`;
}

/**
 * Atualiza label do mix
 */
function updateMixLabel(mix) {
	if (!ui.mixLabel) return;
	
	if (mix <= 20) {
		ui.mixLabel.textContent = 'Predominante: Binaural';
	} else if (mix >= 80) {
		ui.mixLabel.textContent = 'Predominante: Música';
	} else {
		ui.mixLabel.textContent = 'Balanceado';
	}
}

/**
 * Obtém faixa cerebral pela frequência
 */
function getBrainwaveBand(freq) {
	if (freq <= 4) {
		return { name: 'Delta', class: 'delta', description: 'Sono profundo' };
	} else if (freq <= 8) {
		return { name: 'Theta', class: 'theta', description: 'Meditação' };
	} else if (freq <= 13) {
		return { name: 'Alpha', class: 'alpha', description: 'Relaxamento' };
	} else if (freq <= 30) {
		return { name: 'Beta', class: 'beta', description: 'Concentração' };
	} else {
		return { name: 'Gamma', class: 'gamma', description: 'Alta cognição' };
	}
}

// ============================================================================
// PRESETS
// ============================================================================

let presets = [];

/**
 * Carrega presets do arquivo JSON
 */
export async function loadPresets() {
	try {
		const response = await fetch('presets.json');
		if (!response.ok) throw new Error('Erro ao carregar presets');
		
		const data = await response.json();
		presets = data.presets || [];
		
		populatePresetSelect();
		console.log(`Controles: ${presets.length} presets carregados`);
		
		return presets;
		
	} catch (error) {
		console.error('Controles: Erro ao carregar presets:', error);
		return [];
	}
}

/**
 * Popula select de presets
 */
function populatePresetSelect() {
	if (!ui.presetSelect) return;
	
	// Mantém opção padrão
	ui.presetSelect.innerHTML = '<option value="">Selecione um preset...</option>';
	
	// Agrupa por categoria se houver
	const categories = {};
	
	presets.forEach(preset => {
		const category = preset.category || 'Geral';
		if (!categories[category]) {
			categories[category] = [];
		}
		categories[category].push(preset);
	});
	
	// Cria optgroups
	Object.keys(categories).sort().forEach(category => {
		const group = document.createElement('optgroup');
		group.label = category;
		
		categories[category].forEach(preset => {
			const option = document.createElement('option');
			option.value = preset.name;
			option.textContent = preset.name;
			if (preset.description) {
				option.title = preset.description;
			}
			group.appendChild(option);
		});
		
		ui.presetSelect.appendChild(group);
	});
}

/**
 * Carrega um preset específico
 */
export function loadPreset(presetName) {
	const preset = presets.find(p => p.name === presetName);
	if (!preset) {
		console.warn(`Controles: Preset "${presetName}" não encontrado`);
		return false;
	}
	
	// Aplica valores
	if (preset.baseFreq !== undefined) {
		setControlValue('baseFreq', preset.baseFreq);
	}
	
	if (preset.diffFreq !== undefined) {
		setControlValue('diffFreq', preset.diffFreq);
	}
	
	if (preset.volume !== undefined) {
		setControlValue('volume', preset.volume);
	}
	
	if (preset.lowpass !== undefined) {
		setControlValue('lowpass', preset.lowpass);
	}
	
	if (preset.waveform && ui.waveformSelect) {
		ui.waveformSelect.value = preset.waveform;
	}
	
	if (preset.duration) {
		const totalSeconds = preset.duration;
		if (ui.durationMinutes) {
			ui.durationMinutes.value = Math.floor(totalSeconds / 60);
		}
		if (ui.durationSeconds) {
			ui.durationSeconds.value = totalSeconds % 60;
		}
	}
	
	console.log(`Controles: Preset "${presetName}" aplicado`);
	
	// Dispara evento
	document.dispatchEvent(new CustomEvent('presetLoaded', {
		detail: preset
	}));
	
	return true;
}

/**
 * Define valor de um controle (slider + input)
 */
function setControlValue(controlName, value) {
	const slider = ui[`${controlName}Slider`];
	const input = ui[`${controlName}Input`];
	
	if (slider) slider.value = value;
	if (input) input.value = value;
	
	// Dispara evento input para atualizar labels
	slider?.dispatchEvent(new Event('input'));
}

/**
 * Obtém valores atuais do formulário
 */
export function getFormValues() {
	return {
		baseFreq: parseFloat(ui.baseFreqInput?.value) || 200,
		diffFreq: parseFloat(ui.diffFreqInput?.value) || 10,
		volume: parseFloat(ui.volumeInput?.value) || 70,
		lowpass: parseFloat(ui.lowpassInput?.value) || 2000,
		waveform: ui.waveformSelect?.value || 'sine',
		mix: parseFloat(ui.mixInput?.value) || 50,
		durationMinutes: parseInt(ui.durationMinutes?.value) || 15,
		durationSeconds: parseInt(ui.durationSeconds?.value) || 0
	};
}

/**
 * Calcula duração total em segundos
 */
export function getTotalDuration() {
	const minutes = parseInt(ui.durationMinutes?.value) || 0;
	const seconds = parseInt(ui.durationSeconds?.value) || 0;
	return (minutes * 60) + seconds;
}

// ============================================================================
// VALIDAÇÃO
// ============================================================================

/**
 * Valida o formulário antes de iniciar sessão
 */
export function validateForm() {
	const errors = [];
	const values = getFormValues();
	
	// Duração mínima
	const duration = getTotalDuration();
	if (duration < 60) {
		errors.push('A duração mínima é de 1 minuto');
	}
	
	// Frequência base
	if (values.baseFreq < 20 || values.baseFreq > 1000) {
		errors.push('Frequência base deve estar entre 20 Hz e 1000 Hz');
	}
	
	// Frequência diferença
	if (values.diffFreq < 0.5 || values.diffFreq > 40) {
		errors.push('Frequência binaural deve estar entre 0.5 Hz e 40 Hz');
	}
	
	return {
		valid: errors.length === 0,
		errors
	};
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
	injectUI: injectUIReferences,
	init: initControls,
	loadPresets,
	loadPreset,
	getValues: getFormValues,
	getDuration: getTotalDuration,
	validate: validateForm,
	getBrainwaveBand
};
