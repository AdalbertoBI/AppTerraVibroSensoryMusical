/**
 * =============================================================================
 * TERRA SENSORY MUSICAL - Gerenciador de Conteúdo Científico
 * =============================================================================
 * 
 * Versão: 1.2.1.0
 * 
 * Módulo responsável por carregar e renderizar conteúdo científico:
 * - Presets terapêuticos
 * - Bases científicas
 * - Bibliografia
 * 
 * =============================================================================
 */

// Cache de dados carregados
let scientificData = {
	presets: null,
	foundations: null,
	bibliography: null
};

// Estado do módulo
let isLoaded = false;

/**
 * Carrega todos os arquivos JSON de dados científicos
 */
async function loadScientificData() {
	if (isLoaded) return scientificData;
	
	try {
		const [presetsRes, foundationsRes, bibliographyRes] = await Promise.all([
			fetch('./data/therapeutic_presets.json'),
			fetch('./data/scientific_foundations.json'),
			fetch('./data/bibliography.json')
		]);
		
		if (!presetsRes.ok || !foundationsRes.ok || !bibliographyRes.ok) {
			throw new Error('Falha ao carregar dados científicos');
		}
		
		scientificData.presets = await presetsRes.json();
		scientificData.foundations = await foundationsRes.json();
		scientificData.bibliography = await bibliographyRes.json();
		
		isLoaded = true;
		console.log('[ScientificContent] Dados científicos carregados com sucesso');
		
		return scientificData;
	} catch (error) {
		console.error('[ScientificContent] Erro ao carregar dados:', error);
		throw error;
	}
}

/**
 * Renderiza o menu científico expansível
 */
function renderScientificMenu(container) {
	if (!container) return;
	
	const html = `
		<div class="scientific-menu">
			<!-- Header do Menu -->
			<div class="sci-menu-header">
				<h2><i class="fa-solid fa-flask"></i> Base Científica</h2>
				<p class="sci-menu-subtitle">Fundamentação baseada em mais de 50 anos de pesquisa</p>
			</div>
			
			<!-- Stats Highlights -->
			<div class="sci-stats-row" id="sciStatsRow">
				<div class="sci-stat loading">
					<span class="stat-value">--</span>
					<span class="stat-label">Carregando...</span>
				</div>
			</div>
			
			<!-- Navegação por Abas -->
			<nav class="sci-nav" role="tablist">
				<button type="button" class="sci-nav-btn active" data-tab="presets" role="tab" aria-selected="true">
					<i class="fa-solid fa-bookmark"></i>
					<span>Presets</span>
				</button>
				<button type="button" class="sci-nav-btn" data-tab="foundations" role="tab" aria-selected="false">
					<i class="fa-solid fa-microscope"></i>
					<span>Fundamentos</span>
				</button>
				<button type="button" class="sci-nav-btn" data-tab="bibliography" role="tab" aria-selected="false">
					<i class="fa-solid fa-book"></i>
					<span>Bibliografia</span>
				</button>
			</nav>
			
			<!-- Conteúdo das Abas -->
			<div class="sci-content">
				<div class="sci-tab-panel active" id="sciTabPresets" role="tabpanel">
					<div class="sci-loading"><i class="fa-solid fa-spinner fa-spin"></i> Carregando presets...</div>
				</div>
				<div class="sci-tab-panel" id="sciTabFoundations" role="tabpanel">
					<div class="sci-loading"><i class="fa-solid fa-spinner fa-spin"></i> Carregando fundamentos...</div>
				</div>
				<div class="sci-tab-panel" id="sciTabBibliography" role="tabpanel">
					<div class="sci-loading"><i class="fa-solid fa-spinner fa-spin"></i> Carregando bibliografia...</div>
				</div>
			</div>
			
			<!-- Aviso -->
			<div class="sci-disclaimer">
				<i class="fa-solid fa-triangle-exclamation"></i>
				<span>Ferramenta educacional. Não substitui orientação médica profissional.</span>
			</div>
		</div>
	`;
	
	container.innerHTML = html;
	setupTabNavigation(container);
}

/**
 * Configura navegação por abas
 */
function setupTabNavigation(container) {
	const navBtns = container.querySelectorAll('.sci-nav-btn');
	const panels = container.querySelectorAll('.sci-tab-panel');
	
	navBtns.forEach(btn => {
		btn.addEventListener('click', () => {
			const tabId = btn.dataset.tab;
			
			// Atualiza navegação
			navBtns.forEach(b => {
				b.classList.remove('active');
				b.setAttribute('aria-selected', 'false');
			});
			btn.classList.add('active');
			btn.setAttribute('aria-selected', 'true');
			
			// Atualiza painéis
			panels.forEach(p => p.classList.remove('active'));
			const targetPanel = container.querySelector(`#sciTab${capitalize(tabId)}`);
			if (targetPanel) {
				targetPanel.classList.add('active');
			}
		});
	});
}

/**
 * Renderiza os stats highlights
 */
function renderStatsHighlights(container) {
	const statsRow = container.querySelector('#sciStatsRow');
	if (!statsRow || !scientificData.bibliography) return;
	
	const stats = scientificData.bibliography.statistics;
	const evidence = scientificData.foundations?.clinicalEvidence?.summary;
	
	statsRow.innerHTML = `
		<div class="sci-stat">
			<span class="stat-value">${evidence?.keyFinding?.split(' ')[0] || '81%'}</span>
			<span class="stat-label">Redução de dor em fibromialgia</span>
			<span class="stat-source">Naghdi et al., 2015</span>
		</div>
		<div class="sci-stat">
			<span class="stat-value">${evidence?.mostStudiedFrequency || '40Hz'}</span>
			<span class="stat-label">Frequência mais estudada</span>
			<span class="stat-source">Kantor et al., 2022</span>
		</div>
		<div class="sci-stat">
			<span class="stat-value">${stats?.totalReferences || 15}</span>
			<span class="stat-label">Referências científicas</span>
			<span class="stat-source">${stats?.yearsSpan || '1973-2025'}</span>
		</div>
	`;
}

/**
 * Renderiza a aba de presets terapêuticos
 */
function renderPresetsTab(container) {
	const panel = container.querySelector('#sciTabPresets');
	if (!panel || !scientificData.presets) return;
	
	const protocols = scientificData.presets.protocols;
	const brainwaves = scientificData.presets.brainwaves;
	
	let html = '<div class="sci-protocols">';
	
	for (const [key, protocol] of Object.entries(protocols)) {
		html += `
			<details class="sci-protocol">
				<summary>
					<i class="${protocol.icon}"></i>
					<span class="protocol-name">${protocol.name}</span>
					<span class="protocol-source">${protocol.source}</span>
				</summary>
				<div class="protocol-presets">
		`;
		
		for (const preset of protocol.presets) {
			const wave = brainwaves[preset.brainwave] || {};
			html += `
				<div class="preset-card" data-preset-id="${preset.id}">
					<div class="preset-header">
						<span class="preset-name">${preset.name}</span>
						<span class="preset-wave" style="background: ${wave.color}20; color: ${wave.color}">
							${preset.brainwave.toUpperCase()} ${preset.binauralDiff}Hz
						</span>
					</div>
					<div class="preset-details">
						<span><i class="fa-solid fa-wave-square"></i> ${preset.baseFreq}Hz base</span>
						<span><i class="fa-solid fa-clock"></i> ${preset.duration}min</span>
					</div>
					<p class="preset-desc">${preset.description}</p>
					<cite class="preset-evidence"><i class="fa-solid fa-quote-left"></i> ${preset.evidence}</cite>
				</div>
			`;
		}
		
		html += '</div></details>';
	}
	
	html += '</div>';
	
	// Legenda de ondas cerebrais
	html += '<div class="brainwave-legend"><h4>Bandas Cerebrais</h4><div class="legend-items">';
	for (const [key, wave] of Object.entries(brainwaves)) {
		html += `
			<span class="legend-item" style="--wave-color: ${wave.color}">
				<span class="legend-dot"></span>
				<span class="legend-name">${capitalize(key)}</span>
				<span class="legend-range">${wave.range}</span>
			</span>
		`;
	}
	html += '</div></div>';
	
	panel.innerHTML = html;
}

/**
 * Renderiza a aba de fundamentos científicos
 */
function renderFoundationsTab(container) {
	const panel = container.querySelector('#sciTabFoundations');
	if (!panel || !scientificData.foundations) return;
	
	const foundations = scientificData.foundations.foundations;
	const evidence = scientificData.foundations.clinicalEvidence;
	
	let html = '<div class="sci-foundations">';
	
	for (const [key, foundation] of Object.entries(foundations)) {
		html += `
			<details class="sci-foundation">
				<summary>
					<i class="${foundation.icon}"></i>
					<span class="foundation-title">${foundation.title}</span>
				</summary>
				<div class="foundation-content">
					<p class="foundation-summary">${foundation.summary}</p>
		`;
		
		// Pioneiro
		if (foundation.pioneer) {
			html += `
				<div class="foundation-pioneer">
					<i class="fa-solid fa-user-graduate"></i>
					<strong>${foundation.pioneer.name}</strong> (${foundation.pioneer.period}) - ${foundation.pioneer.country}
				</div>
			`;
		}
		
		// Mecanismos
		if (foundation.mechanisms) {
			html += '<div class="foundation-mechanisms"><h5>Mecanismos de Ação</h5><ul>';
			for (const mech of foundation.mechanisms) {
				html += `<li><strong>${mech.name}:</strong> ${mech.description}</li>`;
			}
			html += '</ul></div>';
		}
		
		// Estudos-chave
		if (foundation.keyStudies) {
			html += '<div class="foundation-studies"><h5>Estudos-Chave</h5>';
			for (const study of foundation.keyStudies) {
				html += `
					<div class="study-card">
						<span class="study-title">${study.title}</span>
						<span class="study-authors">${study.authors} (${study.year})</span>
						${study.results ? `<span class="study-results">${study.results}</span>` : ''}
					</div>
				`;
			}
			html += '</div>';
		}
		
		html += '</div></details>';
	}
	
	// Tabela de evidências clínicas
	if (evidence?.conditions) {
		html += `
			<div class="clinical-evidence">
				<h4><i class="fa-solid fa-clipboard-check"></i> Evidências por Condição</h4>
				<table class="evidence-table">
					<thead>
						<tr>
							<th>Condição</th>
							<th>Evidência</th>
							<th>Protocolo</th>
							<th>Fonte</th>
						</tr>
					</thead>
					<tbody>
		`;
		for (const cond of evidence.conditions) {
			const evidenceClass = cond.evidence.toLowerCase().includes('alta') ? 'high' : 
								  cond.evidence.toLowerCase().includes('moderada') ? 'medium' : 'low';
			html += `
				<tr>
					<td>${cond.name}</td>
					<td><span class="evidence-badge ${evidenceClass}">${cond.evidence}</span></td>
					<td>${cond.protocol}</td>
					<td>${cond.source}</td>
				</tr>
			`;
		}
		html += '</tbody></table></div>';
	}
	
	html += '</div>';
	panel.innerHTML = html;
}

/**
 * Renderiza a aba de bibliografia
 */
function renderBibliographyTab(container) {
	const panel = container.querySelector('#sciTabBibliography');
	if (!panel || !scientificData.bibliography) return;
	
	const categories = scientificData.bibliography.categories;
	const stats = scientificData.bibliography.statistics;
	
	let html = `
		<div class="bib-stats">
			<span><i class="fa-solid fa-book"></i> ${stats.totalReferences} referências</span>
			<span><i class="fa-solid fa-check-double"></i> ${stats.peerReviewed} peer-reviewed</span>
			<span><i class="fa-solid fa-vial"></i> ${stats.rcts} RCTs</span>
			<span><i class="fa-solid fa-calendar"></i> ${stats.yearsSpan}</span>
		</div>
		<div class="bib-categories">
	`;
	
	for (const [key, category] of Object.entries(categories)) {
		html += `
			<details class="bib-category">
				<summary>
					<i class="${category.icon}"></i>
					<span>${category.name}</span>
					<span class="ref-count">${category.references.length}</span>
				</summary>
				<ol class="ref-list">
		`;
		
		for (const ref of category.references) {
			const highlightClass = ref.highlight ? 'highlight' : '';
			html += `
				<li class="ref-item ${highlightClass}">
					<span class="ref-authors">${ref.authors}</span>
					<span class="ref-year">(${ref.year})</span>
					<span class="ref-title">${ref.title}</span>
					${ref.journal ? `<em class="ref-journal">${ref.journal}</em>` : ''}
					${ref.volume ? `<span class="ref-volume">${ref.volume}${ref.pages ? `: ${ref.pages}` : ''}</span>` : ''}
					${ref.doi ? `<a href="https://doi.org/${ref.doi}" target="_blank" rel="noopener" class="ref-doi">DOI</a>` : ''}
					${ref.pmcid ? `<a href="https://www.ncbi.nlm.nih.gov/pmc/articles/${ref.pmcid}" target="_blank" rel="noopener" class="ref-pmc">PMC</a>` : ''}
					${ref.summary ? `<span class="ref-summary">${ref.summary}</span>` : ''}
				</li>
			`;
		}
		
		html += '</ol></details>';
	}
	
	html += '</div>';
	panel.innerHTML = html;
}

/**
 * Inicializa o módulo de conteúdo científico
 */
async function initScientificContent(containerSelector = '#scientificSection') {
	const container = document.querySelector(containerSelector);
	if (!container) {
		console.warn('[ScientificContent] Container não encontrado:', containerSelector);
		return;
	}
	
	// Renderiza estrutura inicial
	renderScientificMenu(container);
	
	try {
		// Carrega dados
		await loadScientificData();
		
		// Renderiza conteúdo
		renderStatsHighlights(container);
		renderPresetsTab(container);
		renderFoundationsTab(container);
		renderBibliographyTab(container);
		
		console.log('[ScientificContent] Inicialização completa');
	} catch (error) {
		console.error('[ScientificContent] Erro na inicialização:', error);
		container.querySelector('.sci-content').innerHTML = `
			<div class="sci-error">
				<i class="fa-solid fa-exclamation-triangle"></i>
				<p>Erro ao carregar conteúdo científico. Tente recarregar a página.</p>
			</div>
		`;
	}
}

/**
 * Utilitário: Capitaliza primeira letra
 */
function capitalize(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Obtém dados de um preset específico
 */
function getPresetById(presetId) {
	if (!scientificData.presets) return null;
	
	for (const protocol of Object.values(scientificData.presets.protocols)) {
		const preset = protocol.presets.find(p => p.id === presetId);
		if (preset) return preset;
	}
	return null;
}

/**
 * Obtém todos os presets como array plano
 */
function getAllPresets() {
	if (!scientificData.presets) return [];
	
	const all = [];
	for (const protocol of Object.values(scientificData.presets.protocols)) {
		all.push(...protocol.presets);
	}
	return all;
}

// Exportações
export {
	initScientificContent,
	loadScientificData,
	getPresetById,
	getAllPresets,
	scientificData
};
