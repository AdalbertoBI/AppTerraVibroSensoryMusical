# Áudios Padrão - Biblioteca Inicial

Esta pasta contém os arquivos de áudio que são carregados automaticamente na biblioteca do usuário quando ele acessa o app pela primeira vez.

## Como adicionar novos áudios

1. Coloque o arquivo de áudio nesta pasta (formatos suportados: MP3, WAV, OGG, FLAC)
2. Edite o arquivo `manifest.json` e adicione uma entrada na array `tracks`:

```json
{
    "id": "nome-unico-do-audio",
    "filename": "nome_do_arquivo.mp3",
    "name": "Nome de Exibição",
    "tag": "delta",
    "lowEnergyPct": 75,
    "category": "nature",
    "therapeuticUse": ["Sono", "Relaxamento"],
    "description": "Descrição do áudio para o usuário",
    "source": "Internet Archive",
    "sourceUrl": "https://archive.org/details/..."
}
```

### Campos obrigatórios:
- `id`: Identificador único (use kebab-case, ex: "ocean-waves-relaxing")
- `filename`: Nome do arquivo nesta pasta
- `name`: Nome amigável para exibição
- `tag`: Categoria de frequência - "delta", "theta", "alpha", "beta", "gamma"
- `lowEnergyPct`: Porcentagem de energia em baixas frequências (0-100)

### Campos opcionais:
- `category`: "nature", "ambient", "music", "meditation"
- `therapeuticUse`: Array de usos terapêuticos
- `description`: Descrição detalhada
- `source`: Fonte original do áudio
- `sourceUrl`: URL da fonte
- `archiveId`: ID do Internet Archive (se aplicável)

## Licenciamento

Todos os áudios nesta pasta devem ser de domínio público, Creative Commons, ou ter licença compatível com distribuição.

## Baixando via Internet Archive

Use a seção "Internet Archive" do app para buscar e baixar músicas. Os áudios baixados ficam salvos no IndexedDB do navegador. Para incluí-los permanentemente:

1. Baixe o áudio via app
2. Exporte o áudio (se necessário)
3. Coloque nesta pasta
4. Atualize o `manifest.json`
