/* ============================================================
   app.js - EXT-SIM Sistema de Archivos Simulado
   Controlador de Apps y Lógica simple
   ============================================================ */

const app = {
    currentDirId: 0,
    
    init() {
        // Reloj
        setInterval(() => {
            const time = new Date().toLocaleTimeString('es-HN', {hour:'2-digit', minute:'2-digit'});
            document.getElementById('clock').textContent = time;
        }, 1000);
        
        // Cargar desde LocalStorage si existe
        if (localStorage.getItem('ext-disk') && localStorage.getItem('ext-fs')) {
            disk.deserialize(localStorage.getItem('ext-disk'));
            fsSim.deserialize(localStorage.getItem('ext-fs'));
            this.currentDirId = fsSim.rootDirId;
            this.updateDesktop();
            document.getElementById('disk-status').textContent = `Disco: ${disk.superblock.totalMB}MB`;
        }
    },

    /**
     * Muestra u oculta el menú principal del sistema.
     * Este menú actúa como el 'Start Menu' en un SO clásico, dando acceso rápido
     * a las configuraciones principales y herramientas de archivos.
     */
    toggleMainMenu() {
        const menu = document.getElementById('main-menu');
        // Alternar la clase 'hidden' para mostrar/ocultar visualmente
        menu.classList.toggle('hidden');
    },

    /**
     * Función para 'Salir' del sistema.
     * Muestra una pantalla de apagado y oculta la interfaz gráfica.
     * En un entorno real, esto cerraría procesos y apagaría la máquina.
     * Aquí simulamos un apagado agregando un elemento que cubra toda la pantalla.
     */
    exitSystem() {
        // Ocultar el menú principal si está abierto
        this.toggleMainMenu();
        
        // Crear un overlay negro en toda la pantalla para simular el apagado
        const exitDiv = document.createElement('div');
        exitDiv.id = 'exit-screen';
        exitDiv.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 20px;">EXT-SIM OS</div>
            <div>Apagando el sistema...</div>
            <div style="margin-top: 10px; color: #888; font-size: 12px;">Los datos se han guardado en el almacenamiento local.</div>
        `;
        document.body.appendChild(exitDiv);
        
        // Guardamos todo el estado actual antes de "apagar"
        this.save();
    },

    save() {
        localStorage.setItem('ext-disk', disk.serialize());
        localStorage.setItem('ext-fs', fsSim.serialize());
    },

    // Abrir Aplicaciones
    openApp(id) {
        if (id === 'config') {
            UI.createWindow('config', '⚙️ Configuración del Sistema', `
                <div style="padding: 20px;">
                    <h3>Formatear Disco Simulado</h3>
                    <p style="color:#666; font-size:12px; margin-bottom:10px;">
                        Tamaño físico en MB (1 - 64)
                    </p>
                    <input type="number" id="cfg-mb" value="16">
                    
                    <p style="color:#666; font-size:12px; margin-top:10px; margin-bottom:5px;">
                        Tamaño de bloque
                    </p>
                    <select id="cfg-bs">
                        <option value="1">1 KB</option>
                        <option value="2">2 KB</option>
                        <option value="4" selected>4 KB (Estándar EXT4)</option>
                    </select>
                    
                    <br><br>
                    <button class="primary" style="width:100%" onclick="app.formatDisk()">Formatear Disco</button>
                </div>
            `, 320, 320);
        }
        else if (id === 'files') {
            if (!disk.initialized) return UI.showToast("Formatea el disco primero en 'Configuración'.");
            UI.createWindow('files', '📁 Administrador de Archivos', `
                <div class="fm-toolbar">
                    <button onclick="app.navigateUp()">⬆️ Subir</button>
                    <button onclick="app.showNewFolder()">+ Nueva Carpeta</button>
                    <button onclick="app.showNewFile()">+ Nuevo Archivo</button>
                    <span id="fm-path" style="margin-left:10px; font-family:monospace; color:#333;">/</span>
                </div>
                <div class="fm-content">
                    <div id="fm-list" class="fm-list"></div>
                    <div id="fm-details" class="fm-details">
                        <p style="color:#888; text-align:center; margin-top:20px;">
                            Selecciona un archivo para ver sus detalles.
                        </p>
                    </div>
                </div>
            `, 650, 450);
            this.refreshFM();
        }
        else if (id === 'info') {
            if (!disk.initialized) return UI.showToast("Formatea el disco primero en 'Configuración'.");
            UI.createWindow('info', '💽 Información del Disco', `
                <div style="padding: 15px;" id="info-content"></div>
            `, 600, 450);
            this.refreshInfo();
        }
        else if (id === 'terminal') {
            if (!disk.initialized) return UI.showToast("Formatea el disco primero en 'Configuración'.");
            UI.createWindow('terminal', '🖥️ Terminal EXT', `
                <div style="background:#1e1e1e; color:#0f0; height:100%; padding:10px; display:flex; flex-direction:column;">
                    <div id="term-out" style="flex:1; overflow:auto; margin-bottom:10px;">
                        <div class="term-line" style="color:#aaa;">
                            Terminal EXT-SIM v1.0.<br>
                            Comandos: ls, mkdir, touch, rm, clear
                        </div>
                    </div>
                    <div style="display:flex;">
                        <span style="color:#0f0; margin-right:8px;">user@ext:~$</span>
                        <input type="text" id="term-in" class="term-input" autocomplete="off" onkeydown="if(event.key==='Enter') app.execCmd(this.value)">
                    </div>
                </div>
            `, 550, 350);
        }
    },

    formatDisk() {
        const mb = parseInt(document.getElementById('cfg-mb').value);
        const bs = parseInt(document.getElementById('cfg-bs').value);
        
        disk.init(mb, bs);
        fsSim.init();
        
        this.currentDirId = fsSim.rootDirId;
        this.save();
        this.updateDesktop(); // Actualizar iconos del escritorio
        
        document.getElementById('disk-status').textContent = `Disco: ${mb}MB`;
        UI.showToast(`Disco formateado (${mb}MB, Bloques de ${bs}KB)`);
        
        if (UI.windows['files']) this.refreshFM();
        if (UI.windows['info']) this.refreshInfo();
    },

    // Actualiza los iconos en el fondo del escritorio (leyendo del directorio raíz)
    updateDesktop() {
        const container = document.getElementById('desktop-icons');
        container.innerHTML = '';
        
        if (!disk.initialized || fsSim.rootDirId === null) return;
        
        const rootDir = fsSim.dirs[fsSim.rootDirId];
        if (!rootDir) return;

        // Iterar sobre los archivos/carpetas en la raíz
        for (const [name, ref] of Object.entries(rootDir.entries)) {
            const isDir = typeof ref === 'string' && ref.startsWith('dir:');
            const icon = isDir ? '📁' : '📄';
            
            const div = document.createElement('div');
            div.className = 'desktop-icon';
            
            // Doble clic para abrir
            div.ondblclick = () => {
                this.openApp('files'); // Abre el file manager
                if (isDir) {
                    this.currentDirId = parseInt(ref.split(':')[1]);
                    this.refreshFM();
                } else {
                    this.currentDirId = fsSim.rootDirId;
                    this.refreshFM();
                    this.selectFile(ref);
                }
            };
            
            div.innerHTML = `
                <div class="icon">${icon}</div>
                <div class="name">${name}</div>
            `;
            container.appendChild(div);
        }
    },

    // Operaciones del File Manager
    refreshFM() {
        if (!UI.windows['files']) return;
        
        const list = document.getElementById('fm-list');
        const pathLabel = document.getElementById('fm-path');
        list.innerHTML = '';
        
        pathLabel.textContent = fsSim.getDirPath(this.currentDirId);
        const result = fsSim.listDirectory(this.currentDirId);
        
        if (!result) return;
        
        result.items.forEach(item => {
            const isDir = item.type === 'dir';
            const icon = isDir ? '📁' : '📄';
            const div = document.createElement('div');
            div.className = 'fm-item';
            div.innerHTML = `<span class="icon">${icon}</span> <span style="flex:1;">${item.name}</span>`;
            
            // Un clic: seleccionar
            div.onclick = () => {
                document.querySelectorAll('.fm-item').forEach(e => e.classList.remove('selected'));
                div.classList.add('selected');
                
                if (!isDir) {
                    this.selectFile(item.inode.id);
                } else {
                    document.getElementById('fm-details').innerHTML = `
                        <h3 style="margin-bottom:10px; word-break:break-all;">📁 ${item.name}</h3>
                        <p style="color:#666; margin-bottom:15px;">Carpeta</p>
                        <hr style="border:0; border-top:1px solid #ddd; margin:15px 0;">
                        <!-- Botón para Eliminar la carpeta -->
                        <button style="width:100%; background:#dc3545; color:white; border-color:#dc3545;" onclick="app.deleteDirectory(${item.dirId})">🗑️ Eliminar Carpeta</button>
                    `;
                }
            };
            
            // Doble clic: entrar a carpeta
            div.ondblclick = () => {
                if (isDir) {
                    this.currentDirId = item.id;
                    this.refreshFM();
                }
            };
            
            list.appendChild(div);
        });
        
        // Si estamos en la raíz, sincronizar el escritorio cada vez que la carpeta se actualice.
        if (this.currentDirId === fsSim.rootDirId) {
            this.updateDesktop();
        }
    },

    navigateUp() {
        const dir = fsSim.dirs[this.currentDirId];
        if (dir && dir.parentId !== null) {
            this.currentDirId = dir.parentId;
            this.refreshFM();
        }
    },

    selectFile(inodeId) {
        // Obtenemos el inodo físico desde el disco simulado
        const inode = disk.getInode(inodeId);
        if (!inode) return;
        
        // Generamos el HTML con los detalles del archivo
        // Agregamos un botón para 'Mover' el archivo, invocando showMoveFile
        document.getElementById('fm-details').innerHTML = `
            <h3 style="margin-bottom:5px; word-break:break-all;">📄 ${inode.name}</h3>
            <p style="color:#666; font-size:12px; margin-bottom:15px;">Inodo #${inode.id}</p>
            
            <p style="font-size:13px; margin-bottom:5px;"><strong>Tamaño:</strong> ${inode.size} bytes</p>
            <p style="font-size:13px; margin-bottom:5px;"><strong>Bloques Ocupados:</strong> ${inode.blocks.length}</p>
            <p style="font-size:13px; margin-bottom:15px; word-break:break-all;"><strong>Apuntadores:</strong><br>[${inode.blocks.join(', ')}]</p>
            
            <hr style="border:0; border-top:1px solid #ddd; margin:15px 0;">
            
            <!-- Botón para Editar Contenido -->
            <button style="width:100%; margin-bottom:8px;" onclick="app.showEditFile(${inodeId})">✏️ Editar Contenido</button>
            
            <!-- Botón para Mover el Archivo (Nueva Funcionalidad) -->
            <button style="width:100%; margin-bottom:8px; background:#17a2b8; color:white; border-color:#17a2b8;" onclick="app.showMoveFile(${inodeId})">📦 Mover</button>
            
            <!-- Botón para Eliminar -->
            <button style="width:100%; background:#dc3545; color:white; border-color:#dc3545;" onclick="app.deleteFile('${inode.name}')">🗑️ Eliminar</button>
        `;
    },

    // Creación / Edición
    showNewFolder() {
        UI.showModal("📁 Nueva Carpeta", `
            <label>Nombre de la carpeta:</label>
            <input type="text" id="new-name" placeholder="Ej: documentos">
        `, `<button class="primary" onclick="app.createFolder()">Crear</button>`);
    },
    createFolder() {
        const name = document.getElementById('new-name').value;
        const res = fsSim.createDirectory(name, this.currentDirId);
        if (res.success) {
            UI.hideModal();
            this.save();
            this.refreshFM();
            UI.showToast(res.message);
        } else {
            UI.showToast(res.error);
        }
    },

    showNewFile() {
        UI.showModal("📄 Nuevo Archivo", `
            <label>Nombre del archivo:</label>
            <input type="text" id="new-name" placeholder="Ej: notas.txt">
            <label>Contenido texto:</label>
            <textarea id="new-content" rows="4" placeholder="Escribe algo aquí..."></textarea>
        `, `<button class="primary" onclick="app.createFile()">Crear</button>`);
    },
    createFile() {
        const name = document.getElementById('new-name').value;
        const content = document.getElementById('new-content').value;
        const res = fsSim.createFile(name, content, this.currentDirId);
        if (res.success) {
            UI.hideModal();
            this.save();
            this.refreshFM();
            if (UI.windows['info']) this.refreshInfo(); // Act info disco
            UI.showToast(res.message);
        } else {
            UI.showToast(res.error);
        }
    },

    showEditFile(inodeId) {
        const inode = disk.getInode(inodeId);
        UI.showModal(`✏️ Editar: ${inode.name}`, `
            <label>Contenido:</label>
            <textarea id="edit-content" rows="6">${inode.content || ''}</textarea>
        `, `<button class="primary" onclick="app.saveFile(${inodeId})">Guardar</button>`);
    },
    saveFile(inodeId) {
        const content = document.getElementById('edit-content').value;
        const res = fsSim.saveFile(inodeId, content);
        if (res.success) {
            UI.hideModal();
            this.save();
            this.refreshFM();
            this.selectFile(inodeId);
            if (UI.windows['info']) this.refreshInfo();
            UI.showToast(res.message);
        } else {
            UI.showToast(res.error);
        }
    },

    deleteFile(name) {
        const dir = fsSim.dirs[this.currentDirId];
        const res = fsSim.deleteFile(dir.entries[name]);
        if (res.success) {
            this.save();
            this.refreshFM();
            document.getElementById('fm-details').innerHTML = `
                <p style="color:#888; text-align:center; margin-top:20px;">
                    Selecciona un archivo para ver sus detalles.
                </p>
            `;
            if (UI.windows['info']) this.refreshInfo();
            UI.showToast(res.message);
        } else {
            UI.showToast(res.error);
        }
    },

    /**
     * Elimina una carpeta invocando la función deleteDirectory del fs.js
     * @param {number} dirId - El ID del directorio a eliminar
     */
    deleteDirectory(dirId) {
        const res = fsSim.deleteDirectory(dirId);
        if (res.success) {
            this.save();
            this.refreshFM();
            document.getElementById('fm-details').innerHTML = `
                <p style="color:#888; text-align:center; margin-top:20px;">
                    Selecciona un archivo para ver sus detalles.
                </p>
            `;
            // Sincronizar el escritorio si se modificó la raíz
            if (this.currentDirId === fsSim.rootDirId) {
                this.updateDesktop();
            }
            UI.showToast(res.message);
        } else {
            // fsSim.deleteDirectory devolverá error si la carpeta no está vacía
            UI.showToast(res.error);
        }
    },

    /**
     * Prepara y muestra el modal para mover un archivo a otro directorio.
     * Solicita todos los directorios existentes en el FS para mostrarlos en un <select>.
     * 
     * @param {number} inodeId - El identificador del inodo del archivo a mover.
     */
    showMoveFile(inodeId) {
        const inode = disk.getInode(inodeId);
        
        // Obtenemos una lista plana de todos los directorios en el sistema de archivos
        // Esto permite construir un menú desplegable de destinos.
        const allDirs = fsSim.getAllDirs();
        
        // Construimos el HTML para los <option> del select
        let optionsHtml = '';
        allDirs.forEach(d => {
            // No permitimos mover al mismo directorio donde ya está el archivo
            if (d.id !== inode.parentDirId) {
                optionsHtml += `<option value="${d.id}">${d.path === '' ? '/' : d.path}</option>`;
            }
        });
        
        // Si no hay otros directorios a los cuales mover, mostramos una alerta en su lugar
        if (optionsHtml === '') {
            UI.showToast("No hay otros directorios a donde mover el archivo.");
            return;
        }

        // Mostramos el modal de UI.
        UI.showModal(`📦 Mover: ${inode.name}`, `
            <label>Selecciona la carpeta destino:</label>
            <select id="move-dest-dir">
                ${optionsHtml}
            </select>
            <p style="font-size:11px; color:#666; margin-top:10px;">
                Esta operación modifica la ubicación lógica (entradas de directorio),
                sin alterar los bloques físicos del disco.
            </p>
        `, `<button class="primary" onclick="app.moveFile(${inodeId})">Mover</button>`);
    },

    /**
     * Ejecuta la lógica para mover un archivo, interactuando con fs.js
     * 
     * @param {number} inodeId - El identificador del inodo del archivo a mover.
     */
    moveFile(inodeId) {
        // Obtenemos el ID del directorio destino desde el selector
        const targetDirId = parseInt(document.getElementById('move-dest-dir').value);
        
        // Llamamos a la API de bajo nivel fsSim.moveFile
        // Esto actualiza el parentDirId del inodo y las tablas de entradas de los directorios involucrados
        const res = fsSim.moveFile(inodeId, targetDirId);
        
        if (res.success) {
            UI.hideModal(); // Cerrar la ventana de diálogo
            this.save();    // Persistir el cambio en LocalStorage
            
            // Refrescar la vista actual (el archivo desaparecerá porque lo movimos)
            this.refreshFM();
            
            // Limpiar la vista de detalles porque el archivo ya no está en la carpeta actual
            document.getElementById('fm-details').innerHTML = `
                <p style="color:#888; text-align:center; margin-top:20px;">
                    Selecciona un archivo para ver sus detalles.
                </p>
            `;
            
            // Mostrar notificación de éxito al usuario
            UI.showToast(res.message);
        } else {
            // Mostrar error si por alguna razón falla (ej. mismo nombre en el destino)
            UI.showToast(res.error);
        }
    },

    // Aplicación: Info de Disco
    refreshInfo() {
        if (!UI.windows['info']) return;
        const sb = disk.superblock;
        
        let bmHtml = '';
        // Renderizar un máximo de 600 bloques para no colgar el navegador
        const total = Math.min(disk.blockBitmap.length, 600);
        
        for(let i = 0; i < total; i++) {
            let color = disk.blockBitmap[i] === 0 ? '#4caf50' : '#f44336';
            if (i < sb.systemBlocks) color = '#2b2b2b'; // bloques de sistema
            bmHtml += `<div style="width:10px; height:10px; background:${color}; display:inline-block; margin:1px; border-radius:1px;" title="Bloque ${i}"></div>`;
        }
        
        if (disk.blockBitmap.length > 600) {
            bmHtml += `<p style="font-size:11px; color:#888; margin-top:5px;">Mostrando primeros 600 bloques de ${disk.blockBitmap.length}</p>`;
        }

        document.getElementById('info-content').innerHTML = `
            <h3 style="margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">Superbloque</h3>
            <div style="display:flex; flex-wrap:wrap; gap:20px; font-size:13px; margin-bottom:20px;">
                <div><strong>Bloques Totales:</strong> <br>${sb.totalBlocks}</div>
                <div><strong>Bloques Libres:</strong> <br><span style="color:#4caf50">${sb.freeBlocks}</span></div>
                <div><strong>Bloques Usados:</strong> <br><span style="color:#f44336">${sb.usedBlocks}</span></div>
                <div><strong>Inodos:</strong> <br>${sb.usedInodes} de ${sb.totalInodes}</div>
            </div>
            
            <h3 style="margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:5px;">Bitmap de Bloques</h3>
            <p style="font-size:12px; margin-bottom:10px;">
                <span style="color:#2b2b2b">■</span> Sistema (SB, Bitmap, Tabla Inodos) &nbsp;
                <span style="color:#4caf50">■</span> Libre &nbsp;
                <span style="color:#f44336">■</span> Ocupado por Datos
            </p>
            <div style="background:#f5f5f5; padding:10px; border:1px solid #ddd; border-radius:4px;">
                ${bmHtml}
            </div>
        `;
    },

    // Aplicación: Terminal
    execCmd(cmd) {
        document.getElementById('term-in').value = '';
        const out = document.getElementById('term-out');
        
        // Print command
        out.innerHTML += `<div class="term-line" style="color:#fff;">$ ${cmd}</div>`;
        
        const args = cmd.trim().split(/\s+/);
        const c = args[0];
        let res = '';
        
        if (c === '') return;
        
        if (c === 'ls') {
            const list = fsSim.listDirectory(this.currentDirId);
            if (list) {
                res = list.items.map(i => {
                    const color = i.type === 'dir' ? '#3b82f6' : '#fff';
                    return `<span style="color:${color}; margin-right:10px;">${i.name}</span>`;
                }).join('');
            }
        } else if (c === 'mkdir' && args[1]) {
            const r = fsSim.createDirectory(args[1], this.currentDirId);
            res = r.success ? 'Directorio creado' : `<span style="color:red">${r.error}</span>`;
            if (r.success) { this.save(); this.refreshFM(); }
        } else if (c === 'touch' && args[1]) {
            const r = fsSim.createFile(args[1], ' ', this.currentDirId);
            res = r.success ? 'Archivo creado' : `<span style="color:red">${r.error}</span>`;
            if (r.success) { this.save(); this.refreshFM(); if (UI.windows['info']) this.refreshInfo(); }
        } else if (c === 'rm' && args[1]) {
            const dir = fsSim.dirs[this.currentDirId];
            if (dir && dir.entries[args[1]]) {
                const ref = dir.entries[args[1]];
                if (typeof ref === 'string' && ref.startsWith('dir:')) {
                    res = '<span style="color:red">Es un directorio. Usa rmdir.</span>';
                } else {
                    const r = fsSim.deleteFile(ref);
                    res = r.success ? 'Archivo eliminado' : `<span style="color:red">${r.error}</span>`;
                    if (r.success) { this.save(); this.refreshFM(); if (UI.windows['info']) this.refreshInfo(); }
                }
            } else res = '<span style="color:red">No existe el archivo</span>';
        } else if (c === 'rmdir' && args[1]) {
            const dir = fsSim.dirs[this.currentDirId];
            if (dir && dir.entries[args[1]]) {
                const ref = dir.entries[args[1]];
                if (typeof ref === 'string' && ref.startsWith('dir:')) {
                    const r = fsSim.deleteDirectory(parseInt(ref.split(':')[1]));
                    res = r.success ? 'Directorio eliminado' : `<span style="color:red">${r.error}</span>`;
                    if (r.success) { this.save(); this.refreshFM(); }
                } else {
                    res = '<span style="color:red">Es un archivo. Usa rm.</span>';
                }
            } else res = '<span style="color:red">No existe el directorio</span>';
        } else if (c === 'clear') {
            out.innerHTML = '';
            return;
        } else {
            res = '<span style="color:red">Comando no reconocido. Uso: ls, mkdir &lt;nom&gt;, touch &lt;nom&gt;, rm &lt;nom&gt;, rmdir &lt;nom&gt;</span>';
        }
        
        if (res) out.innerHTML += `<div class="term-line">${res}</div>`;
        out.scrollTop = out.scrollHeight; // Scroll to bottom
    }
};

// Arrancar
document.addEventListener('DOMContentLoaded', () => app.init());
