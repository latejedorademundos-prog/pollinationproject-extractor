// --- GESTIÓN DE AUTENTICACIÓN POLLINATIONS (BYOP) ---
let pollinationsKey = localStorage.getItem('pollinations_api_key');

function updateAuthUI() {
    const btn = document.getElementById('auth-btn');
    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');

    if (pollinationsKey) {
        btn.innerText = "DESCONECTAR";
        btn.className = "px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all bg-green-500 hover:bg-green-600 text-white shadow-sm cursor-pointer";
        btn.onclick = logoutPollinations;
        
        indicator.className = "w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]";
        text.innerText = "Pollinations Activo";
    } else {
        btn.innerText = "CONECTAR IA";
        btn.className = "px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all bg-yellow-400 hover:bg-yellow-300 text-black shadow-sm cursor-pointer";
        btn.onclick = loginPollinations;

        indicator.className = "w-2 h-2 rounded-full bg-red-400";
        text.innerText = "Sistema Offline";
    }
}

function loginPollinations() {
    // Usamos una URL de retorno genérica o localhost si estás probando local
    const redirectUrl = encodeURIComponent(window.location.href);
    const width = 500; const height = 700;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);
    window.open(
        `https://enter.pollinations.ai/authorize?redirect_url=${redirectUrl}`, 
        'PollinationsAuth', 
        `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=yes`
    );
}

function logoutPollinations() {
    localStorage.removeItem('pollinations_api_key');
    pollinationsKey = null;
    updateAuthUI();
}

// Listeners para autenticación
window.addEventListener('message', (event) => {
    // Si la redirección ocurre en la misma página, capturamos el hash
    if (event.data && event.data.type === 'POLLI_AUTH_SUCCESS' && event.data.key) {
        pollinationsKey = event.data.key;
        localStorage.setItem('pollinations_api_key', pollinationsKey);
        updateAuthUI();
    }
});

// Captura de token por URL si la ventana emergente redirige a la misma app
window.addEventListener('load', () => {
    const hash = window.location.hash;
    if (hash.includes('access_token=')) {
        const token = hash.split('access_token=')[1].split('&')[0];
        if (token) {
            pollinationsKey = token;
            localStorage.setItem('pollinations_api_key', pollinationsKey);
            window.location.hash = ''; // Limpiar URL
            updateAuthUI();
        }
    }
});


// --- UTILIDADES ---
const UTILS = {
    cleanJSON(str) {
        if(!str) return "[]";
        str = str.replace(/```json/g, '').replace(/```/g, '');
        const firstBracket = str.indexOf('[');
        const firstBrace = str.indexOf('{');
        const lastBracket = str.lastIndexOf(']');
        const lastBrace = str.lastIndexOf('}');
        
        if (firstBracket !== -1 && lastBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
            return str.substring(firstBracket, lastBracket + 1);
        }
        if (firstBrace !== -1 && lastBrace !== -1) {
            return str.substring(firstBrace, lastBrace + 1);
        }
        return str; 
    },
    uuid() { return 'gen-' + Date.now() + '-' + Math.floor(Math.random()*1000); },
    updateProgress(percent) {
        document.getElementById('loading-bar').style.width = percent + '%';
    }
};

// --- CLASE PRINCIPAL DEL GENERADOR ---
class NarrativeGenerator {
    constructor() {
        this.isProcessing = false; 
        this.startTime = 0; 
        this.timerInterval = null;
        this.characterMap = {}; // Mapa para relacionar nombres con IDs
        
        // ALMACENAMIENTO LOCAL (Memoria)
        this.projectData = {
            characters: [],
            timeline: null
        };
    }

    init() {
        updateAuthUI();
        this.log("Sistema Standalone listo. Conecta IA para empezar.", "info");
    }

    // --- LÓGICA DE INTERFAZ (TABS & VISUALIZACIÓN) ---

    switchTab(tabName) {
        const extractorView = document.getElementById('view-extractor');
        const viewerView = document.getElementById('view-viewer');
        const btnExtractor = document.getElementById('tab-extractor');
        const btnViewer = document.getElementById('tab-viewer');

        if (tabName === 'extractor') {
            extractorView.classList.remove('opacity-0', 'pointer-events-none');
            viewerView.classList.add('opacity-0', 'pointer-events-none');
            viewerView.style.zIndex = 0;
            extractorView.style.zIndex = 10;
            
            btnExtractor.className = "px-4 py-1.5 rounded-md text-sm font-medium transition-all bg-white text-indigo-600 shadow-sm";
            btnViewer.className = "px-4 py-1.5 rounded-md text-sm font-medium text-slate-500 hover:text-slate-700 transition-all";
        } else {
            extractorView.classList.add('opacity-0', 'pointer-events-none');
            viewerView.classList.remove('opacity-0', 'pointer-events-none');
            viewerView.style.zIndex = 10;
            extractorView.style.zIndex = 0;

            btnViewer.className = "px-4 py-1.5 rounded-md text-sm font-medium transition-all bg-white text-indigo-600 shadow-sm";
            btnExtractor.className = "px-4 py-1.5 rounded-md text-sm font-medium text-slate-500 hover:text-slate-700 transition-all";
            
            this.renderVisualization(); // Renderizar al cambiar pestaña
        }
    }

    log(msg, type = 'info') {
        const c = document.getElementById('process-log');
        // Eliminar mensaje de espera si existe
        if (c.children.length === 1 && c.children[0].innerText.includes("Esperando")) {
            c.innerHTML = '';
        }

        const el = document.createElement('div');
        let color = 'text-blue-600 bg-blue-50 border-blue-200';
        if(type==='success') color = 'text-green-700 bg-green-50 border-green-200';
        if(type==='error') color = 'text-red-600 bg-red-50 border-red-200';
        if(type==='warn') color = 'text-orange-600 bg-orange-50 border-orange-200';
        if(type==='detail') color = 'text-purple-600 bg-purple-50 border-purple-200';
        
        el.className = `log-item p-2 rounded border flex gap-2 ${color}`;
        el.innerHTML = `<i class="fa-solid fa-circle text-[6px] mt-2"></i> <span>${msg}</span>`;
        c.prepend(el);
    }

    // --- VISUALIZACIÓN ---

    renderVisualization() {
        const charContainer = document.getElementById('viz-characters');
        const timeContainer = document.getElementById('viz-timeline');
        
        // 1. Render Characters
        charContainer.innerHTML = '';
        if (this.projectData.characters.length === 0) {
            charContainer.innerHTML = '<div class="text-slate-400 text-sm italic col-span-full text-center py-10">No hay personajes extraídos aún.</div>';
        } else {
            this.projectData.characters.forEach(char => {
                const data = JSON.parse(char.content.text);
                const card = document.createElement('div');
                card.className = "char-card p-5 flex flex-col gap-3";
                card.innerHTML = `
                    <div class="flex items-start justify-between">
                        <div>
                            <h4 class="font-bold text-lg text-slate-800">${data.name || char.title}</h4>
                            <span class="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-600">${data.clase || "N/A"}</span>
                            <span class="text-xs text-slate-500 ml-2">${data.raza || ""}</span>
                        </div>
                        <i class="fa-solid fa-user-tag text-slate-300 text-xl"></i>
                    </div>
                    <div class="text-xs text-slate-600 line-clamp-3 bg-slate-50 p-2 rounded border border-slate-100">
                        ${data.universales?.visual || "Sin descripción visual."}
                    </div>
                    <div class="grid grid-cols-2 gap-2 mt-auto">
                        <div class="text-[10px] text-slate-400 uppercase font-bold">Alineamiento</div>
                        <div class="text-[10px] text-right text-slate-700">${data.alineamiento || "-"}</div>
                        <div class="text-[10px] text-slate-400 uppercase font-bold">Origen</div>
                        <div class="text-[10px] text-right text-slate-700 truncate" title="${data.trasfondo}">${data.trasfondo || "-"}</div>
                    </div>
                `;
                charContainer.appendChild(card);
            });
        }

        // 2. Render Timeline
        timeContainer.innerHTML = '';
        if (!this.projectData.timeline || !this.projectData.timeline.content) {
            timeContainer.innerHTML = '<div class="text-slate-400 text-sm italic py-10">No hay línea temporal generada.</div>';
        } else {
            const tlData = JSON.parse(this.projectData.timeline.content.text);
            if(tlData.events && Array.isArray(tlData.events)) {
                // Ordenar por tiempo
                tlData.events.sort((a,b) => a.time - b.time);
                
                tlData.events.forEach(evt => {
                    const node = document.createElement('div');
                    node.className = "timeline-node";
                    
                    // Mapear nombres de personajes participantes
                    let castBadges = '';
                    if(evt.characters && evt.characters.length > 0) {
                        const names = evt.characters.map(id => {
                            const charObj = this.projectData.characters.find(c => c.id === id);
                            return charObj ? charObj.title : 'Desconocido';
                        });
                        castBadges = `<div class="mt-2 flex flex-wrap gap-1">
                            ${names.map(n => `<span class="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded border border-purple-200">${n}</span>`).join('')}
                        </div>`;
                    }

                    // Renderizar momentos
                    let momentsList = '';
                    if(evt.moments && evt.moments.length > 0) {
                        momentsList = `<ul class="mt-3 space-y-1 text-xs text-slate-600 list-disc pl-4 marker:text-slate-300">
                            ${evt.moments.map(m => `<li>${m.text}</li>`).join('')}
                        </ul>`;
                    }

                    node.innerHTML = `
                        <div class="timeline-dot"></div>
                        <div class="timeline-content">
                            <div class="flex justify-between items-start mb-1">
                                <span class="text-xs font-bold text-blue-500 uppercase tracking-wide">Tiempo: ${evt.time}</span>
                            </div>
                            <h4 class="font-bold text-slate-800 text-sm">${evt.description}</h4>
                            ${castBadges}
                            ${momentsList}
                        </div>
                    `;
                    timeContainer.appendChild(node);
                });
            }
        }
    }

    // --- IMPORT / EXPORT ---

    downloadJSON() {
        if(this.projectData.characters.length === 0 && !this.projectData.timeline) {
            alert("No hay datos para exportar.");
            return;
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.projectData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "mundo_generado.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    uploadJSON(input) {
        const file = input.files[0];
        if(!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);
                if(json.characters && Array.isArray(json.characters)) {
                    this.projectData = json;
                    this.log(`📂 Archivo cargado con éxito. (${json.characters.length} personajes)`, "success");
                    this.switchTab('viewer'); // Ir directo a ver los datos
                    input.value = ''; // Reset input
                } else {
                    alert("Formato de JSON inválido.");
                }
            } catch(err) {
                console.error(err);
                alert("Error leyendo el archivo JSON.");
            }
        };
        reader.readAsText(file);
    }


    // --- API CALLER (POLLINATIONS) ---
    async aiCall(prompt) {
        if (!pollinationsKey) {
            this.log("⚠️ Error de Autenticación: Conecta Pollinations primero.", "error");
            throw new Error("Auth Required");
        }

        const systemPrompt = "Eres un asistente experto en análisis narrativo y JSON. Responde siempre estrictamente JSON cuando se pida.";
        
        try {
            const response = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${pollinationsKey}`, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ 
                    model: 'openai', 
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: prompt }
                    ] 
                })
            });

            if (!response.ok) {
                if (response.status === 401) {
                    logoutPollinations();
                    throw new Error('Sesión expirada.');
                }
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;

        } catch (error) {
            console.error("Pollinations Call Error:", error);
            if (!error.message.includes('Sesión expirada')) {
                this.log(`Error de IA: ${error.message}`, "error");
            }
            return "";
        }
    }

    // --- MOTOR NARRATIVO (LÓGICA ORIGINAL PRESERVADA) ---

    async startProcess() {
        const text = document.getElementById('source-text').value.trim();
        if (!text) return alert("Escribe o pega un texto para analizar.");
        if (!pollinationsKey) return alert("Conecta a Pollinations primero.");

        this.isProcessing = true;
        this.characterMap = {}; 
        this.projectData = { characters: [], timeline: null }; // Reset datos
        
        document.getElementById('btn-generate').disabled = true;
        document.getElementById('process-log').innerHTML = ''; // Limpiar logs visualmente
        
        UTILS.updateProgress(5);
        this.startTimer();

        try {
            this.log("🚀 Iniciando Motor Narrativo v6.5 (Standalone)", "info");

            // 1. SINOPSIS
            this.log("📖 Analizando estructura base...", "info");
            const storyOutline = await this.aiCall_GetStoryOutline(text);
            UTILS.updateProgress(15);

            // 2. DETECCIÓN Y CREACIÓN DE PERSONAJES
            this.log("👥 Detectando elenco...", "info");
            let charList = await this.aiCall_GetCharacterList(text);
            if (!charList || charList.length === 0) charList = ["Protagonista", "Antagonista"];
            
            this.log(`⚡ Generando fichas para: ${charList.join(', ')}`, "info");
            
            // Delay para personajes
            const charDelayStep = 2000;
            const charPromises = charList.map(async (name, idx) => {
                await new Promise(r => setTimeout(r, idx * charDelayStep));
                try {
                    const res = await this.aiCall_GenerateCharacterProfile(name, text, storyOutline);
                    if(res) {
                        const savedId = this.saveCharacter(res);
                        this.characterMap[name] = savedId;
                        this.log(`Personaje creado: ${name}`, "success");
                    }
                } catch(e) { console.error(e); }
            });
            
            await Promise.all(charPromises);
            this.log("✅ Personajes indexados con perfil profundo.", "success");
            UTILS.updateProgress(40);

            // 3. GENERACIÓN DE CRONOLOGÍA DETALLADA
            await this.workflow_ExhaustiveTimeline(text, storyOutline);

            this.log("✨ PROCESO COMPLETO - Revisa la pestaña 'Visualizador'", "success");
            UTILS.updateProgress(100);
            
            // Auto switch a visualizador al terminar (opcional)
            // this.switchTab('viewer'); 

        } catch (error) {
            console.error(error);
            this.log(`❌ ERROR FATAL: ${error.message}`, "error");
        } finally {
            this.isProcessing = false;
            document.getElementById('btn-generate').disabled = false;
            this.stopTimer();
            setTimeout(() => UTILS.updateProgress(0), 2000);
        }
    }

    async workflow_ExhaustiveTimeline(text, outline) {
        // FASE 1: Lista Bruta
        this.log("⏳ [Crono-1] Extrayendo hitos temporales...", "info");
        const rawEvents = await this.aiCall(`
            Lee el texto y extrae TODOS los eventos cronológicos en una lista simple.
            TEXTO: "${text.substring(0, 4000)}"
            Formato: - AÑO: Evento
        `);

        // FASE 2: Estructura Base JSON
        this.log("⏳ [Crono-2] Creando esqueleto temporal...", "info");
        const skeletonJson = await this.aiCall(`
            Convierte esta lista en un JSON Array de objetos simples.
            LISTA: ${rawEvents}
            FORMATO OBLIGATORIO:
            [ { "time": number, "description": "Resumen corto" }, ... ]
            Si no hay año exacto, estima uno lógico numérico.
        `);
        
        let baseEvents = [];
        try {
            baseEvents = JSON.parse(UTILS.cleanJSON(skeletonJson));
            if(!Array.isArray(baseEvents) && baseEvents.events) baseEvents = baseEvents.events;
        } catch(e) {
            this.log("⚠️ Fallo al parsear esqueleto. Usando evento único.", "warn");
            baseEvents = [{ time: 2020, description: "Inicio de la historia" }];
        }
        
        // --- DECIMALES (SMART OFFSET) ---
        baseEvents.sort((a, b) => a.time - b.time);
        let lastTime = -9999999;
        baseEvents.forEach(evt => {
            let t = parseFloat(evt.time);
            if (isNaN(t)) t = 0;
            if (t <= lastTime) { t = lastTime + 0.1; }
            evt.time = parseFloat(t.toFixed(1));
            lastTime = evt.time;
        });

        UTILS.updateProgress(60);

        // --- FASE 3: ENRIQUECIMIENTO DE ALTA PRECISIÓN ---
        this.log(`🔥 [Crono-3] Lanzando ${baseEvents.length} eventos (Deep Scan)...`, "detail");
        
        const delayPerRequest = 2000;
        
        const eventPromises = baseEvents.map(async (evt, index) => {
            await new Promise(resolve => setTimeout(resolve, index * delayPerRequest));

            try {
                this.log(`... Escaneando Evento ${index+1}/${baseEvents.length} en texto fuente`, "detail");
                const enriched = await this.aiCall_EnrichEvent(evt, text, Object.keys(this.characterMap));
                
                const currentPercent = 60 + Math.floor(((index + 1) / baseEvents.length) * 30);
                UTILS.updateProgress(currentPercent);
                
                return enriched;
            } catch (err) {
                console.error("Fallo evento individual", evt, err);
                return null; 
            }
        });

        const results = await Promise.all(eventPromises);
        const enrichedEvents = results.filter(e => e !== null);

        this.log("✅ Narrativa detallada y precisa generada.", "success");
        UTILS.updateProgress(90);

        // FASE 4: ENSAMBLAJE
        const finalTimelineData = {
            name: "Cronología Maestra",
            start: Math.min(...enrichedEvents.map(e=>e.time)) - 2,
            end: Math.max(...enrichedEvents.map(e=>e.time)) + 2,
            color: "#3b82f6",
            events: enrichedEvents
        };

        this.saveTimeline(finalTimelineData);
    }

    // --- HELPERS IA ESPECÍFICOS ---

    async aiCall_EnrichEvent(baseEvent, fullText, availableCharNames) {
        const safeContext = fullText.substring(0, 25000); 

        const prompt = `
            Actúa como un analista literario forense.
            
            OBJETIVO: Detallar el evento "${baseEvent.description}" (Fecha: ${baseEvent.time}).
            
            TEXTO FUENTE (EXTRACTO MASIVO):
            "${safeContext}..."
            
            PERSONAJES CONOCIDOS: ${JSON.stringify(availableCharNames)}

            INSTRUCCIONES ESTRICTAS:
            1. Busca en el TEXTO FUENTE el segmento exacto donde ocurre este evento.
            2. No inventes. Extrae las acciones, diálogos y detalles sensoriales REALES del texto.
            3. Identifica EXACTAMENTE qué personajes de la lista de "Personajes Conocidos" están presentes físicamente en esa escena.
            4. Desglosa el evento en "momentos" secuenciales y exhaustivos (mínimo 4, máximo 10).

            DEVUELVE SOLO JSON:
            {
                "cast": ["NombreExacto1", "NombreExacto2"],
                "moments": ["El personaje X entra diciendo...", "Se escucha un ruido...", "Acción específica..."]
            }
        `;

        const res = await this.aiCall(prompt);
        let data = { cast: [], moments: [] };
        
        try {
            data = JSON.parse(UTILS.cleanJSON(res));
        } catch(e) { console.error("Error parseando evento enriquecido", baseEvent); }

        // Mapeo de nombres a IDs
        const characterIds = (data.cast || [])
            .map(name => {
                const found = Object.keys(this.characterMap).find(k => k.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(k.toLowerCase()));
                return found ? this.characterMap[found] : null;
            }) 
            .filter(id => id);

        const momentObjects = (data.moments || [])
            .map(txt => ({ text: txt }));

        return {
            id: UTILS.uuid(),
            time: baseEvent.time, 
            description: baseEvent.description,
            characters: characterIds, 
            moments: momentObjects,   
            image64: null 
        };
    }

    async aiCall_GetStoryOutline(text) {
        return await this.aiCall(`
            Haz una sinopsis estructurada (Inicio, Nudo, Desenlace) del siguiente texto.
            TEXTO: "${text.substring(0, 3000)}..."
        `);
    }

    async aiCall_GetCharacterList(text) {
        const res = await this.aiCall(`
            Analiza: "${text.substring(0, 3000)}..."
            Extrae los nombres de los personajes principales.
            Devuelve SOLO un JSON Array de strings. Ejemplo: ["Ana", "Beto"]
        `);
        try { return JSON.parse(UTILS.cleanJSON(res)); } catch(e) { return []; }
    }

    async aiCall_GenerateCharacterProfile(name, fullText, outline) {
        const defaultData = {
            "clase": "Aventurero",
            "raza": "Humano",
            "edad": "Desconocida",
            "alias": "",
            "alineamiento": "Neutral",
            "trasfondo": "Desconocido",
            "universales": {
                "visual": `Descripción visual detallada de ${name}`,
                "cita": "",
                "arquetipo": "Héroe/Villano",
                "tags": "personaje"
            },
            "combat": { "ac": "10", "init": "", "speed": "30ft", "gold": "" },
            "stats": { "vida": 10, "fuerza": 10, "inteligencia": 10, "poder": 10 },
            "traits": {
                "personalidad": "",
                "ideales": "",
                "vinculos": "",
                "defectos": ""
            },
            "inventario": "",
            "historia": `Historia de ${name} basada en el contexto...`,
            "imagen64": "" 
        };

        const jsonStr = await this.aiCall(`
            Genera una ficha de personaje RPG PROFUNDA y COMPLETA para "${name}".
            
            Contexto Historia: ${outline.substring(0, 1000)}
            
            INSTRUCCIONES CLAVE:
            1. "traits": Llena personalidad, ideales, vínculos y defectos basándote en la narrativa.
            2. "universales": Define su apariencia visual, arquetipo y tags.
            3. "historia": Escribe un resumen de su pasado y rol actual.
            4. "alineamiento": (Ej: Legal Bueno, Caótico Neutral, etc).
            5. "clase" y "raza": Infiérelos del texto.
            6. "name": "${name}"

            Devuelve SOLO JSON con este formato exacto (sin bloques de código):
            ${JSON.stringify(defaultData)}
        `);

        try {
            const parsed = JSON.parse(UTILS.cleanJSON(jsonStr));
            return { name, data: { ...defaultData, ...parsed } };
        } catch (e) {
            console.error("Error generando personaje", e);
            return { name, data: defaultData };
        }
    }

    // --- GUARDADO (MODIFICADO PARA STANDALONE) ---

    saveCharacter({ name, data }) {
        const itemId = UTILS.uuid();
        // Estructura compatible con el formato original pero guardada en memoria
        const item = {
            id: itemId, 
            type: 'narrative', 
            title: name, 
            content: { tag: 'Perfil', text: JSON.stringify(data) },
            icon: 'user', 
            color: 'text-purple-500'
        };
        
        this.projectData.characters.push(item);
        return itemId;
    }

    saveTimeline(data) {
        const item = {
            id: UTILS.uuid(), 
            type: 'narrative', 
            title: data.name || "Línea Temporal", 
            content: { tag: 'TEMPORAL', text: JSON.stringify(data) },
            icon: 'clock', 
            color: 'text-blue-500'
        };
        
        this.projectData.timeline = item;
    }

    startTimer() {
        this.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            const delta = Math.floor((Date.now() - this.startTime) / 1000);
            const m = Math.floor(delta / 60).toString().padStart(2, '0');
            const s = (delta % 60).toString().padStart(2, '0');
            document.getElementById('timer').innerText = `${m}:${s}`;
        }, 1000);
    }
    stopTimer() { clearInterval(this.timerInterval); }
}

const app = new NarrativeGenerator();
window.onload = () => app.init();