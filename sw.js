/* eslint-disable no-undef */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

/**
 * =============================================================================
 * SISTEMA DE VERSIONAMENTO E ATUALIZAÇÃO DE CACHE
 * =============================================================================
 * 
 * COMO FUNCIONA:
 * 1. Altere a versão APP_VERSION sempre que fizer mudanças
 * 2. O SW detecta mudanças e notifica os usuários
 * 3. Usuários veem um banner de atualização disponível
 * 4. Ao clicar, o app atualiza instantaneamente
 * 
 * IMPORTANTE: Incremente APP_VERSION a cada deploy!
 */

const APP_VERSION = '1.2.2.1';
const CACHE_PREFIX = 'terra-sensory';
const CACHE_NAME = `${CACHE_PREFIX}-v${APP_VERSION}`;

if (workbox) {
	workbox.setConfig({ debug: false });
	
	// Define nomes de cache com prefixo versionado
	workbox.core.setCacheNameDetails({
		prefix: CACHE_PREFIX,
		suffix: `v${APP_VERSION}`,
		precache: 'precache',
		runtime: 'runtime'
	});

	const PRECACHE_ASSETS = [
		{ url: './', revision: APP_VERSION },
		{ url: './index.html', revision: APP_VERSION },
		{ url: './style.css', revision: APP_VERSION },
		{ url: './app.js', revision: APP_VERSION },
		{ url: './manifest.json', revision: APP_VERSION },
		{ url: './presets.json', revision: APP_VERSION },
		{ url: './icons/terra-sensory.svg', revision: APP_VERSION },
		// Novos arquivos CSS
		{ url: './css/modules.css', revision: APP_VERSION },
		// Módulos JavaScript
		{ url: './js/main.js', revision: APP_VERSION },
		{ url: './js/core/state.js', revision: APP_VERSION },
		{ url: './js/utils/storage.js', revision: APP_VERSION },
		{ url: './js/audio/audioContext.js', revision: APP_VERSION },
		{ url: './js/audio/binaural.js', revision: APP_VERSION },
		{ url: './js/audio/audio8d.js', revision: APP_VERSION },
		{ url: './js/audio/player.js', revision: APP_VERSION },
		{ url: './js/audio/audioEnhancer.js', revision: APP_VERSION },
		{ url: './js/monitor/audioMonitor.js', revision: APP_VERSION },
		{ url: './js/patients/patientManager.js', revision: APP_VERSION },
		{ url: './js/ui/controls.js', revision: APP_VERSION },
		{ url: './js/ui/tutorial.js', revision: APP_VERSION },
		{ url: './js/ui/scientificContent.js', revision: APP_VERSION },
		// Dados científicos
		{ url: './data/scientific_references.json', revision: APP_VERSION },
		{ url: './data/therapeutic_presets.json', revision: APP_VERSION },
		{ url: './data/scientific_foundations.json', revision: APP_VERSION },
		{ url: './data/bibliography.json', revision: APP_VERSION },
		// CDN
		{ url: 'https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.4/howler.min.js', revision: '2.2.4' },
		{ url: 'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js', revision: '1.10.0' }
	];

	workbox.precaching.precacheAndRoute(PRECACHE_ASSETS);

	workbox.routing.registerRoute(
		({ request }) => request.destination === 'style' || request.destination === 'script',
		new workbox.strategies.StaleWhileRevalidate({
			cacheName: 'static-assets'
		})
	);

	workbox.routing.registerRoute(
		({ request }) => request.destination === 'document',
		new workbox.strategies.NetworkFirst({
			cacheName: 'pages-cache'
		})
	);

	workbox.routing.registerRoute(
		({ url }) => url.pathname.endsWith('.json'),
		new workbox.strategies.StaleWhileRevalidate({ cacheName: 'data-cache' })
	);

	workbox.routing.registerRoute(
		({ request }) => request.destination === 'audio',
		new workbox.strategies.CacheFirst({
			cacheName: 'audio-cache',
			plugins: [
				new workbox.expiration.ExpirationPlugin({
					maxEntries: 40,
					maxAgeSeconds: 60 * 60 * 24 * 30
				})
			]
		})
	);

	// ==========================================================================
	// SISTEMA DE COMUNICAÇÃO COM O CLIENTE
	// ==========================================================================

	/**
	 * Notifica todos os clientes sobre uma atualização disponível
	 */
	async function notifyClientsAboutUpdate() {
		const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
		allClients.forEach(client => {
			client.postMessage({
				type: 'UPDATE_AVAILABLE',
				version: APP_VERSION
			});
		});
	}

	/**
	 * Limpa caches antigos de versões anteriores
	 */
	async function deleteOldCaches() {
		const cacheNames = await caches.keys();
		const oldCaches = cacheNames.filter(name => {
			// Mantém apenas caches da versão atual
			return name.startsWith(CACHE_PREFIX) && !name.includes(`v${APP_VERSION}`);
		});
		
		console.log(`[SW] Removendo ${oldCaches.length} caches antigos...`);
		return Promise.all(oldCaches.map(name => caches.delete(name)));
	}

	/**
	 * Força atualização completa do cache
	 */
	async function forceRefreshCache() {
		console.log(`[SW] Forçando atualização do cache para v${APP_VERSION}...`);
		
		// Remove todos os caches antigos
		await deleteOldCaches();
		
		// Notifica clientes para recarregar
		const allClients = await clients.matchAll({ type: 'window' });
		allClients.forEach(client => {
			client.postMessage({
				type: 'CACHE_UPDATED',
				version: APP_VERSION
			});
		});
	}

	// ==========================================================================
	// EVENT LISTENERS
	// ==========================================================================

	/**
	 * Evento de instalação - pré-cacheia assets
	 */
	self.addEventListener('install', (event) => {
		console.log(`[SW] Instalando versão ${APP_VERSION}...`);
		// Não força skipWaiting() aqui - deixa o usuário decidir quando atualizar
	});

	/**
	 * Evento de ativação - limpa caches antigos
	 */
	self.addEventListener('activate', (event) => {
		console.log(`[SW] Ativando versão ${APP_VERSION}...`);
		event.waitUntil(
			Promise.all([
				deleteOldCaches(),
				clients.claim()
			]).then(() => {
				console.log(`[SW] Versão ${APP_VERSION} ativada com sucesso!`);
			})
		);
	});

	/**
	 * Listener de mensagens do cliente
	 */
	self.addEventListener('message', (event) => {
		const { type } = event.data || {};
		
		switch (type) {
			case 'SKIP_WAITING':
				// Usuário aceitou a atualização
				console.log('[SW] Usuário aceitou atualização, ativando novo SW...');
				self.skipWaiting();
				break;
				
			case 'CACHE_REFRESH':
				// Força refresh completo do cache
				event.waitUntil(forceRefreshCache());
				break;
				
			case 'GET_VERSION':
				// Retorna versão atual do SW
				event.ports[0]?.postMessage({ version: APP_VERSION });
				break;
				
			case 'CHECK_UPDATE':
				// Verifica se há atualização (útil para verificação manual)
				self.registration.update();
				break;
		}
	});

	/**
	 * Detecta quando um novo SW está esperando
	 * (chamado via controllerchange no cliente)
	 */
	self.addEventListener('controllerchange', () => {
		console.log('[SW] Controller mudou - página será recarregada');
	});
}
