/**
 * Script para exportar áudios do app para a pasta audio/default
 * 
 * Este script deve ser executado no CONSOLE DO NAVEGADOR (DevTools)
 * enquanto o app está aberto.
 * 
 * Cole este código no console para exportar um áudio específico:
 */

/*
// 1. Primeiro, liste todos os áudios na biblioteca:
console.table(state.musicMeta.map(m => ({
    id: m.id,
    name: m.name,
    origin: m.origin,
    archiveId: m.archiveId
})));

// 2. Para exportar um áudio específico, use:
async function exportAudio(trackId) {
    const meta = state.musicMeta.find(m => m.id === trackId);
    if (!meta) {
        console.error('Áudio não encontrado');
        return;
    }
    
    const blob = await stores.music.getItem(trackId);
    if (!blob) {
        console.error('Arquivo de áudio não encontrado');
        return;
    }
    
    // Criar link de download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meta.archiveId || meta.id}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('Arquivo exportado:', a.download);
    console.log('Metadados para manifest.json:', JSON.stringify({
        id: meta.archiveId || meta.id.replace(/^archive-/, '').replace(/-\d+$/, ''),
        filename: a.download,
        name: meta.name.replace(' (Archive)', ''),
        tag: meta.tag,
        lowEnergyPct: meta.lowEnergyPct,
        category: "ambient",
        therapeuticUse: [],
        description: meta.description || "",
        source: "Internet Archive",
        sourceUrl: `https://archive.org/details/${meta.archiveId}`,
        archiveId: meta.archiveId
    }, null, 2));
}

// 3. Chame a função com o ID do áudio:
// exportAudio('archive-IDENTIFICADOR-123456789');
*/

console.log(`
╔════════════════════════════════════════════════════════════╗
║          EXPORTADOR DE ÁUDIOS - Terra Vibro                ║
╚════════════════════════════════════════════════════════════╝

Para exportar um áudio do app para arquivo físico:

1. Abra o DevTools (F12)
2. Vá para a aba Console
3. Digite: console.table(state.musicMeta.map(m => ({id: m.id, name: m.name})))
4. Encontre o ID do áudio que quer exportar
5. Digite: exportAudio('ID_DO_AUDIO')

O arquivo será baixado e você verá os metadados para o manifest.json
`);
