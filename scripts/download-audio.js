/**
 * Script para baixar áudios do Internet Archive para a pasta audio/default
 * 
 * Uso:
 *   node scripts/download-audio.js <archive-id> [nome-personalizado]
 * 
 * Exemplo:
 *   node scripts/download-audio.js relaxing-ocean-waves "Ondas Relaxantes"
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const AUDIO_DIR = path.join(__dirname, '..', 'audio', 'default');
const MANIFEST_PATH = path.join(AUDIO_DIR, 'manifest.json');

// Extensões de áudio suportadas (ordem de preferência)
const AUDIO_EXTENSIONS = ['.mp3', '.ogg', '.flac', '.wav', '.m4a'];

async function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(destPath);
        
        protocol.get(url, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                // Follow redirect
                downloadFile(res.headers.location, destPath)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            
            const totalSize = parseInt(res.headers['content-length'], 10);
            let downloadedSize = 0;
            
            res.on('data', (chunk) => {
                downloadedSize += chunk.length;
                if (totalSize) {
                    const percent = Math.round((downloadedSize / totalSize) * 100);
                    process.stdout.write(`\rBaixando... ${percent}%`);
                }
            });
            
            res.pipe(file);
            
            file.on('finish', () => {
                file.close();
                console.log('\n✓ Download concluído');
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

function loadManifest() {
    try {
        return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    } catch {
        return {
            version: "1.0.0",
            description: "Músicas padrão incluídas no app",
            lastUpdate: new Date().toISOString().split('T')[0],
            tracks: []
        };
    }
}

function saveManifest(manifest) {
    manifest.lastUpdate = new Date().toISOString().split('T')[0];
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, '\t'));
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║     Terra Vibro - Download de Áudio do Internet Archive    ║
╚════════════════════════════════════════════════════════════╝

Uso:
  node scripts/download-audio.js <archive-id> [opções]

Argumentos:
  archive-id    ID do item no Internet Archive
                (ex: relaxing-ocean-waves, meditation-music)

Opções:
  --name "..."  Nome personalizado para o áudio
  --tag <tag>   Categoria: delta, theta, alpha, beta, gamma
  --low <0-100> Porcentagem de frequências graves

Exemplos:
  node scripts/download-audio.js relaxing-ocean-waves
  node scripts/download-audio.js meditation-sounds --name "Meditação Zen" --tag theta
  node scripts/download-audio.js forest-ambience --name "Floresta" --tag alpha --low 65

Para encontrar áudios, acesse: https://archive.org/details/audio
`);
        return;
    }
    
    const archiveId = args[0];
    
    // Parse opções
    let customName = null;
    let tag = 'alpha';
    let lowEnergyPct = 50;
    
    for (let i = 1; i < args.length; i++) {
        if (args[i] === '--name' && args[i + 1]) {
            customName = args[++i];
        } else if (args[i] === '--tag' && args[i + 1]) {
            tag = args[++i];
        } else if (args[i] === '--low' && args[i + 1]) {
            lowEnergyPct = parseInt(args[++i], 10) || 50;
        } else if (!args[i].startsWith('--')) {
            customName = args[i];
        }
    }
    
    console.log(`\n🔍 Buscando informações de: ${archiveId}...`);
    
    try {
        // Buscar metadados do item
        const metadata = await fetchJSON(`https://archive.org/metadata/${archiveId}`);
        
        if (!metadata || !metadata.files) {
            console.error('❌ Item não encontrado no Internet Archive');
            return;
        }
        
        // Encontrar arquivo de áudio
        const audioFiles = metadata.files
            .filter(f => AUDIO_EXTENSIONS.some(ext => f.name.toLowerCase().endsWith(ext)))
            .filter(f => !f.name.includes('_sample') && !f.name.includes('_thumb'))
            .sort((a, b) => {
                // Preferir MP3
                const aExt = path.extname(a.name).toLowerCase();
                const bExt = path.extname(b.name).toLowerCase();
                return AUDIO_EXTENSIONS.indexOf(aExt) - AUDIO_EXTENSIONS.indexOf(bExt);
            });
        
        if (audioFiles.length === 0) {
            console.error('❌ Nenhum arquivo de áudio encontrado neste item');
            return;
        }
        
        const audioFile = audioFiles[0];
        const ext = path.extname(audioFile.name).toLowerCase();
        const safeName = archiveId.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
        const filename = `${safeName}${ext}`;
        const destPath = path.join(AUDIO_DIR, filename);
        
        // Verificar se já existe
        if (fs.existsSync(destPath)) {
            console.log(`⚠️  Arquivo já existe: ${filename}`);
            console.log('   Use outro archive-id ou remova o arquivo existente');
            return;
        }
        
        const title = customName || metadata.metadata?.title || archiveId;
        const downloadUrl = `https://archive.org/download/${archiveId}/${encodeURIComponent(audioFile.name)}`;
        
        console.log(`\n📄 Título: ${title}`);
        console.log(`📁 Arquivo: ${audioFile.name}`);
        console.log(`📦 Tamanho: ${(parseInt(audioFile.size) / 1024 / 1024).toFixed(2)} MB`);
        console.log(`🔗 URL: ${downloadUrl}\n`);
        
        // Baixar arquivo
        await downloadFile(downloadUrl, destPath);
        
        // Atualizar manifest
        const manifest = loadManifest();
        
        // Verificar duplicata
        if (manifest.tracks.some(t => t.id === safeName)) {
            console.log('⚠️  Este áudio já está no manifest');
        } else {
            manifest.tracks.push({
                id: safeName,
                filename: filename,
                name: title,
                tag: tag,
                lowEnergyPct: lowEnergyPct,
                category: "ambient",
                therapeuticUse: [],
                description: metadata.metadata?.description?.substring(0, 200) || "",
                source: "Internet Archive",
                sourceUrl: `https://archive.org/details/${archiveId}`,
                archiveId: archiveId
            });
            
            saveManifest(manifest);
            console.log('✓ Manifest atualizado');
        }
        
        console.log(`
╔════════════════════════════════════════════════════════════╗
║                    ✅ DOWNLOAD CONCLUÍDO                    ║
╚════════════════════════════════════════════════════════════╝

Arquivo salvo em: audio/default/${filename}

O áudio será carregado automaticamente na biblioteca do usuário
quando ele acessar o app pela primeira vez.

Para testar, reinicie o servidor de desenvolvimento:
  npm run dev
`);
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

main();
