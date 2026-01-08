/**
 * =============================================================================
 * TERRA SENSORY MUSICAL - Sistema de Tutorial
 * =============================================================================
 * 
 * Onboarding interativo para novos usuários:
 * - Modal de boas-vindas com slides
 * - Tour guiado pela interface
 * - Persistência de conclusão
 */

import { state, STORAGE_KEYS } from '../core/state.js';
import { stores } from '../utils/storage.js';

// Referências de UI
let ui = {};

/**
 * Injeta referências de UI
 */
export function injectUIReferences(uiRefs) {
	ui = uiRefs;
}

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

/**
 * Slides do modal de boas-vindas
 */
const WELCOME_SLIDES = [
	{
		icon: 'fa-solid fa-spa',
		title: 'Bem-vindo ao Terra Sensory Musical',
		content: `
			<p>Esta aplicação utiliza <strong>batimentos binaurais</strong> e 
			<strong>áudio 8D espacial</strong> para promover bem-estar através 
			de terapia sonora cientificamente embasada.</p>
		`
	},
	{
		icon: 'fa-solid fa-brain',
		title: 'Batimentos Binaurais',
		content: `
			<p>Quando dois tons de frequências ligeiramente diferentes são 
			apresentados separadamente aos ouvidos, o cérebro percebe um 
			terceiro tom "pulsante".</p>
			<p>Esta técnica pode induzir estados de:</p>
			<ul>
				<li><strong>Delta (0.5-4 Hz)</strong> - Sono profundo</li>
				<li><strong>Theta (4-8 Hz)</strong> - Meditação</li>
				<li><strong>Alpha (8-13 Hz)</strong> - Relaxamento</li>
				<li><strong>Beta (13-30 Hz)</strong> - Concentração</li>
			</ul>
		`
	},
	{
		icon: 'fa-solid fa-headphones',
		title: 'Áudio 8D Espacial',
		content: `
			<p>O áudio 8D cria a ilusão de som movendo-se ao redor da sua 
			cabeça usando técnicas de processamento espacial (HRTF).</p>
			<p>Este efeito imersivo pode:</p>
			<ul>
				<li>Aumentar o engajamento com a música</li>
				<li>Reduzir distrações externas</li>
				<li>Potencializar os efeitos terapêuticos</li>
			</ul>
			<p><strong>Importante:</strong> Use fones de ouvido para a experiência completa!</p>
		`
	},
	{
		icon: 'fa-solid fa-sliders',
		title: 'Configurando sua Sessão',
		content: `
			<p>Você pode personalizar:</p>
			<ul>
				<li><strong>Frequência Base</strong> - Tom fundamental</li>
				<li><strong>Frequência Binaural</strong> - Define o estado mental alvo</li>
				<li><strong>Volume e Filtros</strong> - Ajuste para seu conforto</li>
				<li><strong>Músicas</strong> - Adicione suas próprias trilhas</li>
			</ul>
			<p>Use os <strong>presets</strong> para configurações prontas!</p>
		`
	},
	{
		icon: 'fa-solid fa-user-injured',
		title: 'Gerenciamento de Pacientes',
		content: `
			<p>Para terapeutas, o sistema oferece:</p>
			<ul>
				<li>Cadastro de pacientes com anamnese completa</li>
				<li>Histórico de sessões</li>
				<li>Exportação de dados (LGPD)</li>
			</ul>
			<p>Todos os dados são armazenados localmente no seu dispositivo.</p>
		`
	},
	{
		icon: 'fa-solid fa-play-circle',
		title: 'Pronto para Começar!',
		content: `
			<p>Agora você conhece os recursos principais.</p>
			<p>Clique em <strong>"Iniciar Tour"</strong> para uma demonstração 
			interativa da interface, ou <strong>"Começar Agora"</strong> para 
			usar o aplicativo imediatamente.</p>
			<p class="tip">💡 Você pode acessar este tutorial novamente pelo menu de ajuda.</p>
		`
	}
];

/**
 * Passos do tour guiado
 */
const TOUR_STEPS = [
	{
		element: '#preset-select',
		title: 'Presets',
		content: 'Escolha uma configuração pronta para diferentes objetivos terapêuticos.',
		position: 'bottom'
	},
	{
		element: '#base-freq-slider',
		title: 'Frequência Base',
		content: 'Ajuste a frequência fundamental do tom binaural (20-1000 Hz).',
		position: 'bottom'
	},
	{
		element: '#diff-freq-slider',
		title: 'Frequência Binaural',
		content: 'Define a diferença entre os canais L/R, determinando o estado mental alvo.',
		position: 'bottom'
	},
	{
		element: '#volume-slider',
		title: 'Volume',
		content: 'Controle o volume geral do áudio binaural.',
		position: 'bottom'
	},
	{
		element: '#waveform-select',
		title: 'Forma de Onda',
		content: 'Escolha entre sine (suave), square, triangle ou sawtooth para diferentes texturas.',
		position: 'bottom'
	},
	{
		element: '#music-section',
		title: 'Músicas',
		content: 'Adicione suas próprias músicas para tocar junto com os binaurais. Suporta áudio 8D!',
		position: 'top'
	},
	{
		element: '#audio-8d-toggle',
		title: 'Áudio 8D',
		content: 'Ative para criar efeito de som espacial imersivo nas músicas.',
		position: 'left'
	},
	{
		element: '#duration-controls',
		title: 'Duração',
		content: 'Defina o tempo da sessão. Recomendamos pelo menos 15 minutos.',
		position: 'top'
	},
	{
		element: '#start-session-btn',
		title: 'Iniciar Sessão',
		content: 'Quando estiver pronto, clique aqui para começar sua sessão terapêutica.',
		position: 'top'
	},
	{
		element: '#audio-monitor-btn',
		title: 'Monitor de Áudio',
		content: 'Abre uma janela com visualização em tempo real do espectro e níveis de áudio.',
		position: 'left'
	},
	{
		element: '#patients-btn',
		title: 'Pacientes',
		content: 'Acesse o gerenciador de pacientes para cadastrar e acompanhar sessões.',
		position: 'left'
	}
];

// Estado do tutorial
let currentSlide = 0;
let currentStep = 0;
let tourOverlay = null;
let tourTooltip = null;

// ============================================================================
// MODAL DE BOAS-VINDAS
// ============================================================================

/**
 * Verifica se deve mostrar tutorial
 */
export async function checkFirstVisit() {
	try {
		const tutorialSeen = await stores.data.getItem(STORAGE_KEYS.TUTORIAL_SEEN);
		
		if (!tutorialSeen) {
			showWelcomeModal();
			return true;
		}
		
		return false;
		
	} catch (error) {
		console.warn('Tutorial: Erro ao verificar primeira visita:', error);
		return false;
	}
}

/**
 * Mostra modal de boas-vindas
 */
export function showWelcomeModal() {
	if (!ui.tutorialModal) {
		createTutorialModal();
	}
	
	currentSlide = 0;
	renderSlide();
	ui.tutorialModal.classList.remove('hidden');
}

/**
 * Cria o modal de tutorial
 */
function createTutorialModal() {
	const modal = document.createElement('div');
	modal.id = 'tutorial-modal';
	modal.className = 'modal tutorial-modal';
	modal.innerHTML = `
		<div class="modal-content tutorial-content">
			<div class="tutorial-header">
				<span class="tutorial-progress"></span>
				<button class="tutorial-close" title="Fechar">
					<i class="fa-solid fa-times"></i>
				</button>
			</div>
			<div class="tutorial-body">
				<div class="tutorial-icon"></div>
				<h2 class="tutorial-title"></h2>
				<div class="tutorial-text"></div>
			</div>
			<div class="tutorial-footer">
				<button class="btn btn-secondary tutorial-prev">
					<i class="fa-solid fa-chevron-left"></i> Anterior
				</button>
				<div class="tutorial-dots"></div>
				<button class="btn btn-primary tutorial-next">
					Próximo <i class="fa-solid fa-chevron-right"></i>
				</button>
			</div>
			<div class="tutorial-final-actions hidden">
				<button class="btn btn-secondary" id="tutorial-start-tour">
					<i class="fa-solid fa-route"></i> Iniciar Tour
				</button>
				<button class="btn btn-primary" id="tutorial-start-app">
					<i class="fa-solid fa-play"></i> Começar Agora
				</button>
			</div>
		</div>
	`;
	
	document.body.appendChild(modal);
	ui.tutorialModal = modal;
	
	// Eventos
	modal.querySelector('.tutorial-close').addEventListener('click', closeTutorialModal);
	modal.querySelector('.tutorial-prev').addEventListener('click', prevSlide);
	modal.querySelector('.tutorial-next').addEventListener('click', nextSlide);
	modal.querySelector('#tutorial-start-tour').addEventListener('click', startTour);
	modal.querySelector('#tutorial-start-app').addEventListener('click', closeTutorialModal);
	
	// Cria dots
	const dotsContainer = modal.querySelector('.tutorial-dots');
	WELCOME_SLIDES.forEach((_, i) => {
		const dot = document.createElement('span');
		dot.className = 'tutorial-dot';
		dot.addEventListener('click', () => goToSlide(i));
		dotsContainer.appendChild(dot);
	});
}

/**
 * Renderiza slide atual
 */
function renderSlide() {
	const slide = WELCOME_SLIDES[currentSlide];
	const modal = ui.tutorialModal;
	
	// Conteúdo
	modal.querySelector('.tutorial-icon').innerHTML = `<i class="${slide.icon}"></i>`;
	modal.querySelector('.tutorial-title').textContent = slide.title;
	modal.querySelector('.tutorial-text').innerHTML = slide.content;
	
	// Progresso
	modal.querySelector('.tutorial-progress').textContent = 
		`${currentSlide + 1} / ${WELCOME_SLIDES.length}`;
	
	// Dots
	modal.querySelectorAll('.tutorial-dot').forEach((dot, i) => {
		dot.classList.toggle('active', i === currentSlide);
	});
	
	// Botões
	const prevBtn = modal.querySelector('.tutorial-prev');
	const nextBtn = modal.querySelector('.tutorial-next');
	const footer = modal.querySelector('.tutorial-footer');
	const finalActions = modal.querySelector('.tutorial-final-actions');
	
	prevBtn.style.visibility = currentSlide === 0 ? 'hidden' : 'visible';
	
	const isLastSlide = currentSlide === WELCOME_SLIDES.length - 1;
	footer.classList.toggle('hidden', isLastSlide);
	finalActions.classList.toggle('hidden', !isLastSlide);
}

function nextSlide() {
	if (currentSlide < WELCOME_SLIDES.length - 1) {
		currentSlide++;
		renderSlide();
	}
}

function prevSlide() {
	if (currentSlide > 0) {
		currentSlide--;
		renderSlide();
	}
}

function goToSlide(index) {
	currentSlide = index;
	renderSlide();
}

/**
 * Fecha modal e marca como visto
 */
async function closeTutorialModal() {
	ui.tutorialModal?.classList.add('hidden');
	
	try {
		await stores.data.setItem(STORAGE_KEYS.TUTORIAL_SEEN, true);
	} catch (error) {
		console.warn('Tutorial: Erro ao salvar estado:', error);
	}
}

// ============================================================================
// TOUR GUIADO
// ============================================================================

/**
 * Inicia tour guiado
 */
export function startTour() {
	closeTutorialModal();
	
	currentStep = 0;
	createTourElements();
	showTourStep();
}

/**
 * Cria elementos do tour
 */
function createTourElements() {
	// Overlay
	tourOverlay = document.createElement('div');
	tourOverlay.className = 'tour-overlay';
	document.body.appendChild(tourOverlay);
	
	// Tooltip
	tourTooltip = document.createElement('div');
	tourTooltip.className = 'tour-tooltip';
	tourTooltip.innerHTML = `
		<div class="tour-tooltip__header">
			<span class="tour-tooltip__step"></span>
			<button class="tour-tooltip__close">
				<i class="fa-solid fa-times"></i>
			</button>
		</div>
		<h4 class="tour-tooltip__title"></h4>
		<p class="tour-tooltip__content"></p>
		<div class="tour-tooltip__footer">
			<button class="btn btn-sm tour-tooltip__prev">Anterior</button>
			<button class="btn btn-sm btn-primary tour-tooltip__next">Próximo</button>
		</div>
	`;
	document.body.appendChild(tourTooltip);
	
	// Eventos
	tourTooltip.querySelector('.tour-tooltip__close').addEventListener('click', endTour);
	tourTooltip.querySelector('.tour-tooltip__prev').addEventListener('click', prevTourStep);
	tourTooltip.querySelector('.tour-tooltip__next').addEventListener('click', nextTourStep);
	tourOverlay.addEventListener('click', endTour);
}

/**
 * Mostra passo atual do tour
 */
function showTourStep() {
	const step = TOUR_STEPS[currentStep];
	const element = document.querySelector(step.element);
	
	if (!element) {
		console.warn(`Tour: Elemento não encontrado: ${step.element}`);
		nextTourStep();
		return;
	}
	
	// Destaca elemento
	highlightElement(element);
	
	// Posiciona tooltip
	positionTooltip(element, step.position);
	
	// Atualiza conteúdo
	tourTooltip.querySelector('.tour-tooltip__step').textContent = 
		`${currentStep + 1} / ${TOUR_STEPS.length}`;
	tourTooltip.querySelector('.tour-tooltip__title').textContent = step.title;
	tourTooltip.querySelector('.tour-tooltip__content').textContent = step.content;
	
	// Botões
	const prevBtn = tourTooltip.querySelector('.tour-tooltip__prev');
	const nextBtn = tourTooltip.querySelector('.tour-tooltip__next');
	
	prevBtn.style.display = currentStep === 0 ? 'none' : 'inline-block';
	
	if (currentStep === TOUR_STEPS.length - 1) {
		nextBtn.textContent = 'Finalizar';
	} else {
		nextBtn.textContent = 'Próximo';
	}
	
	// Scroll para elemento
	element.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * Destaca elemento na interface
 */
function highlightElement(element) {
	// Remove destaque anterior
	document.querySelectorAll('.tour-highlighted').forEach(el => {
		el.classList.remove('tour-highlighted');
	});
	
	element.classList.add('tour-highlighted');
	
	// Ajusta z-index
	element.style.position = 'relative';
	element.style.zIndex = '10001';
}

/**
 * Posiciona tooltip relativo ao elemento
 */
function positionTooltip(element, position) {
	const rect = element.getBoundingClientRect();
	const tooltip = tourTooltip;
	const tooltipRect = tooltip.getBoundingClientRect();
	
	let top, left;
	const margin = 15;
	
	switch (position) {
		case 'top':
			top = rect.top - tooltipRect.height - margin;
			left = rect.left + (rect.width - tooltipRect.width) / 2;
			break;
		case 'bottom':
			top = rect.bottom + margin;
			left = rect.left + (rect.width - tooltipRect.width) / 2;
			break;
		case 'left':
			top = rect.top + (rect.height - tooltipRect.height) / 2;
			left = rect.left - tooltipRect.width - margin;
			break;
		case 'right':
			top = rect.top + (rect.height - tooltipRect.height) / 2;
			left = rect.right + margin;
			break;
		default:
			top = rect.bottom + margin;
			left = rect.left;
	}
	
	// Mantém dentro da viewport
	top = Math.max(10, Math.min(top, window.innerHeight - tooltipRect.height - 10));
	left = Math.max(10, Math.min(left, window.innerWidth - tooltipRect.width - 10));
	
	tooltip.style.top = `${top}px`;
	tooltip.style.left = `${left}px`;
	
	// Adiciona classe de posição para a seta
	tooltip.className = `tour-tooltip tour-tooltip--${position}`;
}

function nextTourStep() {
	if (currentStep < TOUR_STEPS.length - 1) {
		currentStep++;
		showTourStep();
	} else {
		endTour();
	}
}

function prevTourStep() {
	if (currentStep > 0) {
		currentStep--;
		showTourStep();
	}
}

/**
 * Encerra o tour
 */
export function endTour() {
	// Remove elementos
	tourOverlay?.remove();
	tourTooltip?.remove();
	tourOverlay = null;
	tourTooltip = null;
	
	// Remove destaques
	document.querySelectorAll('.tour-highlighted').forEach(el => {
		el.classList.remove('tour-highlighted');
		el.style.position = '';
		el.style.zIndex = '';
	});
	
	// Marca como completo
	stores.data.setItem(STORAGE_KEYS.TUTORIAL_SEEN, true).catch(console.warn);
}

/**
 * Reseta tutorial para mostrar novamente
 */
export async function resetTutorial() {
	try {
		await stores.data.removeItem(STORAGE_KEYS.TUTORIAL_SEEN);
		console.log('Tutorial: Reset realizado');
	} catch (error) {
		console.warn('Tutorial: Erro ao resetar:', error);
	}
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
	injectUI: injectUIReferences,
	checkFirstVisit,
	showWelcome: showWelcomeModal,
	startTour,
	endTour,
	reset: resetTutorial
};
