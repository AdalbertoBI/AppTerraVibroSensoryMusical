/**
 * PlaylistManager - Módulo dedicado à gestão da playlist
 * Centraliza toda lógica de renderização, seleção e interação com a playlist
 * Evita duplicações e melhora manutenibilidade
 */
const PlaylistManager = (function() {
	'use strict';
	
	// Estado interno do módulo
	let isRendering = false;
	let renderQueued = false;
	let lastRenderTime = 0;
	const RENDER_DEBOUNCE_MS = 100;
	
	// Referências de UI (serão inicializadas)
	let playlistContainer = null;
	let playlistCountEl = null;
	
	// Referências externas (injetadas)
	let appState = null;
	let appStores = null;
	let currentPreviewId = null;
	
	// Callbacks externos
	let onPreviewToggle = null;
	let onTrackRemove = null;
	let onFavoriteToggle = null;
	let onShowToast = null;
	let onShowSoundEvidence = null;
	
	/**
	 * Inicializa o módulo com referências necessárias
	 */
	function init(config) {
		playlistContainer = config.container || document.getElementById('playlistSelect');
		playlistCountEl = config.countEl || document.getElementById('playlistCount');
		appState = config.state;
		appStores = config.stores;
		
		// Callbacks
		onPreviewToggle = config.onPreviewToggle;
		onTrackRemove = config.onTrackRemove;
		onFavoriteToggle = config.onFavoriteToggle;
		onShowToast = config.onShowToast;
		onShowSoundEvidence = config.onShowSoundEvidence;
		
		// Configura event listeners
		setupEventListeners();
		
		console.log('[PlaylistManager] Inicializado');
	}
	
	/**
	 * Configura event listeners centralizados
	 */
	function setupEventListeners() {
		if (!playlistContainer) return;
		
		// Remove listeners antigos para evitar duplicação
		playlistContainer.removeEventListener('change', handleSelectionChange);
		playlistContainer.removeEventListener('click', handlePlaylistClick);
		
		// Adiciona listeners
		playlistContainer.addEventListener('change', handleSelectionChange);
		playlistContainer.addEventListener('click', handlePlaylistClick);
	}
	
	/**
	 * Atualiza referência do preview atual
	 */
	function setCurrentPreviewId(id) {
		currentPreviewId = id;
	}
	
	/**
	 * Renderiza a playlist completa (com debounce para evitar chamadas duplicadas)
	 */
	async function render() {
		console.log('[PlaylistManager] render() chamado');
		
		const now = Date.now();
		
		// Debounce: evita renderizações muito próximas
		if (now - lastRenderTime < RENDER_DEBOUNCE_MS) {
			if (!renderQueued) {
				renderQueued = true;
				setTimeout(() => {
					renderQueued = false;
					render();
				}, RENDER_DEBOUNCE_MS);
			}
			return;
		}
		
		// Evita renderização simultânea
		if (isRendering) {
			renderQueued = true;
			return;
		}
		
		isRendering = true;
		lastRenderTime = now;
		
		try {
			await doRender();
		} catch (error) {
			console.error('[PlaylistManager] Erro ao renderizar:', error);
		} finally {
			isRendering = false;
			
			// Se houve requisição durante a renderização, renderiza novamente
			if (renderQueued) {
				renderQueued = false;
				setTimeout(() => render(), 50);
			}
		}
	}
	
	/**
	 * Executa a renderização real da playlist
	 */
	async function doRender() {
		console.log('[PlaylistManager] doRender() iniciando...');
		
		if (!playlistContainer) {
			console.error('[PlaylistManager] Container não encontrado!');
			return;
		}
		
		// Limpa container completamente
		playlistContainer.innerHTML = '';
		
		const selectedTracks = appState.selectedPlaylist || [];
		const favorites = await loadFavorites();
		
		// 1. Renderiza "Sua Biblioteca" (músicas do usuário)
		await renderUserLibrary(selectedTracks, favorites);
		
		// 2. Renderiza categorias de sons padrão (catálogo)
		await renderCatalogCategories(selectedTracks, favorites);
		
		// 3. Atualiza contador
		updateCounter();
	}
	
	/**
	 * Renderiza a seção "Sua Biblioteca" com músicas do usuário
	 */
	async function renderUserLibrary(selectedTracks, favorites) {
		// Filtra apenas músicas do usuário (exclui sons do catálogo padrão)
		const userTracks = (appState.musicMeta || []).filter(track => !track.defaultSoundId);
		
		if (userTracks.length === 0) return;
		
		// Ordena: favoritos primeiro, depois por data
		const sortedTracks = [...userTracks].sort((a, b) => {
			const aFav = favorites.includes(a.id);
			const bFav = favorites.includes(b.id);
			if (aFav !== bFav) return bFav - aFav;
			return (b.addedAt || 0) - (a.addedAt || 0);
		});
		
		const favCount = sortedTracks.filter(t => favorites.includes(t.id)).length;
		const favBadge = favCount > 0 
			? `<span class="badge favorites-count"><i class="fa-solid fa-star"></i> ${favCount}</span>` 
			: '';
		
		const categoryLi = document.createElement('li');
		categoryLi.className = 'playlist-category';
		categoryLi.innerHTML = `
			<details class="category-details" open>
				<summary class="category-summary">
					<i class="fa-solid fa-music"></i>
					<span>Sua Biblioteca</span>
					${favBadge}
					<span class="category-count">${sortedTracks.length}</span>
				</summary>
				<ul class="category-sounds user-library"></ul>
			</details>
		`;
		
		const soundsList = categoryLi.querySelector('.user-library');
		
		for (const track of sortedTracks) {
			const li = createUserTrackElement(track, selectedTracks, favorites);
			soundsList.appendChild(li);
		}
		
		playlistContainer.appendChild(categoryLi);
	}
	
	/**
	 * Cria elemento HTML para uma música do usuário
	 */
	function createUserTrackElement(track, selectedTracks, favorites) {
		const isSelected = selectedTracks.includes(track.id);
		const isPlaying = currentPreviewId === track.id;
		const isFav = favorites.includes(track.id);
		
		// Determina origem
		let originLabel = 'Upload';
		let originClass = 'badge user';
		if (track.origin === 'textura-nativa') {
			originLabel = 'Nativo';
			originClass = 'badge native';
		} else if (track.origin === 'internet-archive') {
			originLabel = 'Archive';
			originClass = 'badge archive';
		} else if (track.origin === 'bundled') {
			originLabel = 'Incluído';
			originClass = 'badge bundled';
		}
		
		const li = document.createElement('li');
		li.className = `playlist-item${isSelected ? ' selected' : ''}${isPlaying ? ' playing' : ''}${isFav ? ' playlist-item--favorite' : ''}`;
		li.dataset.id = track.id;
		li.setAttribute('role', 'option');
		li.setAttribute('aria-selected', isSelected);
		
		const sizeMB = ((track.size || 0) / 1024 / 1024).toFixed(2);
		
		li.innerHTML = `
			<input type="checkbox" class="playlist-checkbox" ${isSelected ? 'checked' : ''} data-action="select" aria-label="Selecionar ${track.name}">
			<button class="btn-favorite${isFav ? ' active' : ''}" data-action="favorite" title="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
				<i class="fa-${isFav ? 'solid' : 'regular'} fa-star"></i>
			</button>
			<div class="playlist-info" data-action="toggle">
				<strong>${isFav ? '⭐ ' : ''}${track.name}</strong>
				<div class="playlist-meta">
					<span class="${originClass}">${originLabel}</span>
					<span class="size">${sizeMB} MB • ${track.lowEnergyPct ?? '--'}% graves</span>
				</div>
			</div>
			<div class="playlist-actions">
				<button class="btn-preview${isPlaying ? ' playing' : ''}" data-action="preview" title="${isPlaying ? 'Parar' : 'Preview'}">
					<i class="fa-solid ${isPlaying ? 'fa-stop' : 'fa-headphones'}"></i>
					<span>${isPlaying ? 'Stop' : 'Preview'}</span>
				</button>
				<button class="btn-delete" data-action="delete" title="Excluir">
					<i class="fa-solid fa-trash"></i>
				</button>
			</div>
		`;
		
		return li;
	}
	
	/**
	 * Renderiza categorias do catálogo de sons padrão
	 */
	async function renderCatalogCategories(selectedTracks, favorites) {
		const catalog = await loadCatalog();
		
		if (!catalog || !catalog.sounds) {
			console.warn('[PlaylistManager] Catálogo vazio ou inválido');
			return;
		}
		
		// Armazena catálogo no state
		appState.defaultSoundsCatalog = catalog;
		
		// Carrega customizações e vídeos do usuário
		const tagCustomizations = await appStores.data.getItem('youtubeTagCustomizations') || {};
		const userYoutubeVideos = await appStores.data.getItem('userYoutubeVideos') || [];
		
		// Converte vídeos do usuário para o formato do catálogo
		const userYoutubeSounds = userYoutubeVideos.map(v => ({
			id: v.id,
			name: v.name,
			category: 'youtube',
			youtubeId: v.youtube,
			tag: v.tag,
			userAdded: true
		}));
		
		// IDs já renderizados (para evitar duplicação)
		const renderedIds = new Set();
		
		// Renderiza cada categoria
		for (const [catId, category] of Object.entries(catalog.categories)) {
			let sounds = catalog.sounds.filter(s => s.category === catId);
			
			// Adiciona vídeos do usuário à categoria YouTube
			if (catId === 'youtube') {
				sounds = [...sounds, ...userYoutubeSounds];
			}
			
			// Aplica customizações de tags
			sounds = sounds.map(sound => {
				if (sound.youtubeId && !sound.userAdded) {
					const trackId = `yt-${sound.id}`;
					if (tagCustomizations[trackId]) {
						return { ...sound, tag: tagCustomizations[trackId] };
					}
				}
				return sound;
			});
			
			// Filtra sons já renderizados
			sounds = sounds.filter(sound => {
				const trackId = getTrackId(sound);
				if (renderedIds.has(trackId)) return false;
				renderedIds.add(trackId);
				return true;
			});
			
			if (!sounds.length) continue;
			
			// Ordena: favoritos primeiro
			sounds = sounds.sort((a, b) => {
				const aId = getTrackId(a);
				const bId = getTrackId(b);
				const aFav = favorites.includes(aId);
				const bFav = favorites.includes(bId);
				
				if (aFav && !bFav) return -1;
				if (!aFav && bFav) return 1;
				return 0;
			});
			
			// Cria elemento da categoria
			const categoryLi = createCategoryElement(catId, category, sounds, selectedTracks, favorites);
			playlistContainer.appendChild(categoryLi);
		}
	}
	
	/**
	 * Gera ID único para um som
	 */
	function getTrackId(sound) {
		if (sound.userAdded) return sound.id;
		if (sound.youtubeId) return `yt-${sound.id}`;
		return `default-${sound.id}`;
	}
	
	/**
	 * Cria elemento HTML para uma categoria
	 */
	function createCategoryElement(catId, category, sounds, selectedTracks, favorites) {
		const internetWarning = category.requiresInternet 
			? '<span class="badge internet-required"><i class="fa-solid fa-wifi"></i> Internet</span>' 
			: '';
		
		const favCount = sounds.filter(s => favorites.includes(getTrackId(s))).length;
		const favBadge = favCount > 0 
			? `<span class="badge favorites-count"><i class="fa-solid fa-star"></i> ${favCount}</span>` 
			: '';
		
		const categoryLi = document.createElement('li');
		categoryLi.className = 'playlist-category';
		categoryLi.dataset.categoryId = catId;
		categoryLi.innerHTML = `
			<details class="category-details" open>
				<summary class="category-summary">
					<i class="${category.icon}"></i>
					<span>${category.name}</span>
					${internetWarning}
					${favBadge}
					<span class="category-count">${sounds.length}</span>
				</summary>
				<ul class="category-sounds"></ul>
			</details>
		`;
		
		const soundsList = categoryLi.querySelector('.category-sounds');
		
		for (const sound of sounds) {
			const li = createSoundElement(sound, selectedTracks, favorites);
			soundsList.appendChild(li);
		}
		
		return categoryLi;
	}
	
	/**
	 * Cria elemento HTML para um som do catálogo
	 */
	function createSoundElement(sound, selectedTracks, favorites) {
		const isYoutube = !!sound.youtubeId;
		const isUserAdded = !!sound.userAdded;
		const trackId = getTrackId(sound);
		const isSelected = selectedTracks.includes(trackId);
		const isFav = favorites.includes(trackId);
		
		const li = document.createElement('li');
		li.className = `playlist-item playlist-item--default${isSelected ? ' selected' : ''}${isYoutube ? ' playlist-item--youtube' : ''}${isFav ? ' playlist-item--favorite' : ''}${isUserAdded ? ' playlist-item--user-added' : ''}`;
		li.dataset.id = trackId;
		li.dataset.soundId = sound.id;
		
		if (isYoutube) {
			li.dataset.youtubeId = sound.youtubeId;
			li.dataset.soundName = sound.name;
			li.dataset.soundTag = sound.tag;
		}
		if (isUserAdded) {
			li.dataset.userAdded = 'true';
		}
		
		li.setAttribute('role', 'option');
		li.setAttribute('aria-selected', isSelected);
		
		const favButton = `
			<button class="btn-favorite${isFav ? ' active' : ''}" data-action="favorite" title="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
				<i class="fa-${isFav ? 'solid' : 'regular'} fa-star"></i>
			</button>
		`;
		
		if (isYoutube) {
			const deleteButton = isUserAdded ? `
				<button class="btn-delete" data-action="delete-youtube" title="Remover vídeo">
					<i class="fa-solid fa-trash"></i>
				</button>
			` : '';
			
			const userAddedBadge = isUserAdded 
				? '<span class="badge user-added"><i class="fa-solid fa-user"></i> Seu vídeo</span>' 
				: '';
			
			li.innerHTML = `
				<input type="checkbox" class="playlist-checkbox" ${isSelected ? 'checked' : ''} data-action="select" aria-label="Selecionar ${sound.name}">
				${favButton}
				<div class="playlist-info" data-action="toggle">
					<strong>${isFav ? '⭐ ' : ''}${sound.name}</strong>
					<div class="playlist-meta">
						<span class="badge youtube"><i class="fa-brands fa-youtube"></i> YouTube</span>
						${userAddedBadge}
						<span class="badge youtube-warning" title="8D, Pan e EQ não disponíveis"><i class="fa-solid fa-triangle-exclamation"></i> Efeitos limitados</span>
					</div>
				</div>
				<div class="playlist-actions">
					<button class="btn-preview" data-action="preview" title="Preview">
						<i class="fa-solid fa-headphones"></i>
						<span>Preview</span>
					</button>
					${deleteButton}
				</div>
			`;
		} else {
			li.innerHTML = `
				<input type="checkbox" class="playlist-checkbox" ${isSelected ? 'checked' : ''} data-action="select" aria-label="Selecionar ${sound.name}">
				${favButton}
				<div class="playlist-info" data-action="toggle">
					<strong>${isFav ? '⭐ ' : ''}${sound.name}</strong>
					<div class="playlist-meta">
						<span class="badge scientific"><i class="fa-solid fa-flask"></i> Científico</span>
						<span class="size">${sound.lowEnergyPct}% graves</span>
					</div>
				</div>
				<div class="playlist-actions">
					<button class="btn-sound-info secondary" data-action="info" data-sound-id="${sound.id}" title="Ver evidência científica">
						<i class="fa-solid fa-microscope"></i>
					</button>
					<button class="btn-preview" data-action="preview" title="Preview">
						<i class="fa-solid fa-headphones"></i>
						<span>Preview</span>
					</button>
				</div>
			`;
		}
		
		return li;
	}
	
	/**
	 * Carrega catálogo de sons padrão
	 */
	async function loadCatalog() {
		if (appState.defaultSoundsCatalog) {
			return appState.defaultSoundsCatalog;
		}
		
		try {
			const response = await fetch('./data/default_sounds.json');
			if (!response.ok) throw new Error('Falha ao carregar catálogo');
			return await response.json();
		} catch (error) {
			console.error('[PlaylistManager] Erro ao carregar catálogo:', error);
			return null;
		}
	}
	
	/**
	 * Carrega lista de favoritos
	 */
	async function loadFavorites() {
		try {
			// Usa a mesma chave que app.js: 'playlist-favorites'
			return await appStores.data.getItem('playlist-favorites') || [];
		} catch (error) {
			console.error('[PlaylistManager] Erro ao carregar favoritos:', error);
			return [];
		}
	}
	
	/**
	 * Atualiza contador de selecionadas
	 */
	function updateCounter() {
		const count = (appState.selectedPlaylist || []).length;
		
		if (playlistCountEl) {
			let text = `${count} selecionada${count !== 1 ? 's' : ''}`;
			if (count > 1) {
				text += ' 🎵 Modo simultâneo';
			}
			playlistCountEl.textContent = text;
		}
	}
	
	/**
	 * Handler para mudança de seleção (checkbox)
	 */
	function handleSelectionChange(event) {
		const checkbox = event.target.closest('.playlist-checkbox');
		if (!checkbox) return;
		
		const li = checkbox.closest('.playlist-item');
		const trackId = li.dataset.id;
		
		if (!appState.selectedPlaylist) {
			appState.selectedPlaylist = [];
		}
		
		// Verifica se é YouTube
		const isYoutubeItem = trackId.startsWith('yt-') || trackId.startsWith('user-youtube-');
		
		if (checkbox.checked) {
			// Se é YouTube, desmarca outros YouTubes
			if (isYoutubeItem) {
				const otherYoutubeIds = appState.selectedPlaylist.filter(id => 
					(id.startsWith('yt-') || id.startsWith('user-youtube-')) && id !== trackId
				);
				
				if (otherYoutubeIds.length > 0) {
					otherYoutubeIds.forEach(ytId => {
						appState.selectedPlaylist = appState.selectedPlaylist.filter(id => id !== ytId);
						
						const otherLi = playlistContainer.querySelector(`.playlist-item[data-id="${ytId}"]`);
						if (otherLi) {
							const otherCheckbox = otherLi.querySelector('.playlist-checkbox');
							if (otherCheckbox) otherCheckbox.checked = false;
							otherLi.classList.remove('selected');
							otherLi.setAttribute('aria-selected', 'false');
						}
					});
					
					if (onShowToast) {
						onShowToast('Apenas uma música do YouTube pode ser selecionada por vez', 'info');
					}
				}
			}
			
			if (!appState.selectedPlaylist.includes(trackId)) {
				appState.selectedPlaylist.push(trackId);
			}
			li.classList.add('selected');
		} else {
			appState.selectedPlaylist = appState.selectedPlaylist.filter(id => id !== trackId);
			li.classList.remove('selected');
		}
		
		li.setAttribute('aria-selected', checkbox.checked);
		updateCounter();
	}
	
	/**
	 * Handler para cliques na playlist
	 */
	async function handlePlaylistClick(event) {
		console.log('[PlaylistManager] handlePlaylistClick:', event.target);
		
		const button = event.target.closest('button');
		const info = event.target.closest('.playlist-info');
		
		// Click na área de info alterna checkbox
		if (info) {
			const li = info.closest('.playlist-item');
			const checkbox = li.querySelector('.playlist-checkbox');
			if (!checkbox.disabled) {
				checkbox.checked = !checkbox.checked;
				checkbox.dispatchEvent(new Event('change', { bubbles: true }));
			}
			return;
		}
		
		if (!button) return;
		
		const li = button.closest('.playlist-item');
		const trackId = li?.dataset.id;
		const soundId = button.dataset.soundId || li?.dataset.soundId;
		const action = button.dataset.action;
		
		switch (action) {
			case 'delete':
			case 'delete-youtube':
				console.log('[PlaylistManager] Ação delete:', trackId);
				if (onTrackRemove) {
					await onTrackRemove(trackId, action === 'delete-youtube');
					render();
				}
				break;
				
			case 'favorite':
				console.log('[PlaylistManager] Ação favorite:', trackId, 'callback:', !!onFavoriteToggle);
				if (onFavoriteToggle) {
					await onFavoriteToggle(trackId, button, li);
				}
				break;
				
			case 'preview':
				console.log('[PlaylistManager] Ação preview:', trackId);
				if (onPreviewToggle) {
					onPreviewToggle(trackId, button, li);
				}
				break;
				
			case 'info':
				console.log('[PlaylistManager] Ação info:', soundId);
				if (onShowSoundEvidence && soundId) {
					onShowSoundEvidence(soundId);
				}
				break;
		}
	}
	
	/**
	 * Limpa a playlist completamente
	 */
	function clear() {
		if (playlistContainer) {
			playlistContainer.innerHTML = '';
		}
		updateCounter();
	}
	
	/**
	 * Retorna lista de selecionadas
	 */
	function getSelected() {
		return appState.selectedPlaylist || [];
	}
	
	/**
	 * Define lista de selecionadas
	 */
	function setSelected(trackIds) {
		appState.selectedPlaylist = trackIds || [];
		updateCounter();
	}
	
	/**
	 * Adiciona uma faixa à seleção
	 */
	function addToSelection(trackId) {
		if (!appState.selectedPlaylist) {
			appState.selectedPlaylist = [];
		}
		if (!appState.selectedPlaylist.includes(trackId)) {
			appState.selectedPlaylist.push(trackId);
		}
		updateCounter();
	}
	
	/**
	 * Remove uma faixa da seleção
	 */
	function removeFromSelection(trackId) {
		if (appState.selectedPlaylist) {
			appState.selectedPlaylist = appState.selectedPlaylist.filter(id => id !== trackId);
		}
		updateCounter();
	}
	
	// API pública
	return {
		init,
		render,
		clear,
		updateCounter,
		getSelected,
		setSelected,
		addToSelection,
		removeFromSelection,
		setCurrentPreviewId,
		handleSelectionChange,
		handleActions: handlePlaylistClick  // Alias para compatibilidade
	};
})();

// Exporta para uso global
if (typeof window !== 'undefined') {
	window.PlaylistManager = PlaylistManager;
}
